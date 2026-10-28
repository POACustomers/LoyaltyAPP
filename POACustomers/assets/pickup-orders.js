(function () {
  'use strict';

  const CART_KEY = 'poa_pickup_cart_v1';
  // Do not accept discounted offer orders until the Supabase order RPC validates and stores the promotion server-side.
  const OFFER_DISCOUNT_BACKEND_READY = window.POA_OFFER_DISCOUNT_BACKEND_READY === true;
  const BRANCH_KEY = 'poa_customer_order_branch_v1';
  const LOCAL_ARCHIVE_DB_NAME = 'dina_corner_local_order_archive_v1';
  const LOCAL_ARCHIVE_STORE = 'orders';
  const LOCAL_ARCHIVE_TTL_MS = 24 * 60 * 60 * 1000;
  const LOCAL_ARCHIVE_SYNC_MS = 15 * 1000;
  const page = document.body.dataset.page || '';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let assignedStaffLocationId = null;
  // GM/Admin may review and manage orders from every branch; Staff remain branch-scoped.
  let canViewAllBranchOrders = false;
  let savedDeliveryAddresses = [];
  let selectedDeliveryInstructions = '';
  let selectedSavedAddressText = '';
  let activeBranches = [];
  let resolvedDeliveryRoute = null;
  let cancelDialogResolve = null;
  let localArchiveDbPromise = null;
  let localArchiveSyncRunning = false;
  let localArchiveLastSyncAt = 0;
  let localArchivePollTimer = null;
  let localArchiveCleanupTimer = null;

  function readCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(item => item && item.id && Number(item.quantity) > 0) : [];
    } catch (_) { return []; }
  }
  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartDock();
  }
  function normalizePrice(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function money(value) {
    const n = Number(value);
    return Number.isFinite(n) ? (window.POA_FORMAT_CURRENCY ? window.POA_FORMAT_CURRENCY(n) : 'EGP ' + n.toFixed(2)) : 'To be confirmed';
  }
  function quantityCount(cart) { return cart.reduce((sum, row) => sum + Number(row.quantity || 0), 0); }
  function calculate(cart) {
    const known = cart.every(row => normalizePrice(row.price) !== null);
    return { known, total: known ? cart.reduce((sum, row) => sum + Number(row.price) * Number(row.quantity), 0) : null };
  }
  function toast(message, good) {
    if (typeof window.toast === 'function') window.toast(message, good !== false);
    else if (message) console[good === false ? 'error' : 'log'](message);
  }
  function fulfillmentType() { return 'pickup'; }
  function statusLabel(status, type) {
    if (status === 'ready_for_pickup') return 'Ready for pickup';
    if (status === 'out_for_delivery') return 'Out for delivery';
    if (status === 'completed') return type === 'delivery' ? 'Delivered' : 'Picked up';
    return ({ placed: 'Order received', accepted: 'Accepted', preparing: 'Preparing', cancelled: 'Cancelled' })[status] || String(status || 'Unknown').replaceAll('_', ' ');
  }
  function statusHint(status, type) {
    if (status === 'ready_for_pickup') return 'Your order is ready. Please collect it from the selected branch.';
    if (status === 'out_for_delivery') return 'The branch has dispatched your order to the delivery address.';
    if (status === 'completed') return type === 'delivery' ? 'Your order has been marked as delivered.' : 'This order has been collected.';
    return ({
      placed: 'Waiting for branch Staff to accept your order.',
      accepted: 'The branch Staff accepted your order.',
      preparing: 'Your order is being prepared.',
      cancelled: 'This order was cancelled.'
    })[status] || '';
  }
  function validMapUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      const mapsHost = host === 'google.com' || host.endsWith('.google.com') || host === 'goo.gl' || host.endsWith('.goo.gl');
      return ((u.protocol === 'https:' || u.protocol === 'http:') && mapsHost) ? u.href : null;
    } catch (_) { return null; }
  }

  function setCustomerShareLocationStatus(message, kind) {
    const el = $('customerShareLocationStatus');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('success', kind === 'success');
    el.classList.toggle('error', kind === 'error');
  }

  function shareCustomerLocation() {
    const button = $('customerShareLocationBtn');
    const latitudeInput = $('customerShareLatitude');
    const longitudeInput = $('customerShareLongitude');
    const mapUrlInput = $('customerShareMapUrl');
    const mapLink = $('customerShareLocationMapLink');

    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setCustomerShareLocationStatus('Location sharing requires HTTPS. Open the secure https:// site, not an http:// link.', 'error');
      return;
    }
    if (!navigator.geolocation) {
      setCustomerShareLocationStatus('This browser cannot access GPS. Open the site in Safari or Chrome and allow location access.', 'error');
      return;
    }

    if (button) { button.disabled = true; button.textContent = 'GETTING LOCATION…'; }
    setCustomerShareLocationStatus('Requesting your phone location. Keep this page open and allow the permission prompt…');

    const finishError = error => {
      let message;
      if (error && error.code === 1) {
        message = 'Location permission was denied. On iPhone, open Settings > Privacy & Security > Location Services, allow location for Safari, then return to this page and reload. If opened inside WhatsApp, open the link in Safari.';
      } else if (error && error.code === 3) {
        message = 'The phone took too long to find your location. Turn on Location Services, move near a window, then tap Send my location again.';
      } else {
        message = 'The phone could not get a GPS location. Turn on Location Services and allow this website to use your location, then try again.';
      }
      setCustomerShareLocationStatus(message, 'error');
      if (button) { button.disabled = false; button.textContent = '⌖ SEND MY LOCATION'; }
    };

    const onSuccess = position => {
      const latitude = Number(position && position.coords && position.coords.latitude);
      const longitude = Number(position && position.coords && position.coords.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        finishError({ code: 2 });
        return;
      }
      const mapUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(latitude + ',' + longitude);
      if (latitudeInput) latitudeInput.value = String(latitude);
      if (longitudeInput) longitudeInput.value = String(longitude);
      if (mapUrlInput) mapUrlInput.value = mapUrl;
      if (mapLink) { mapLink.href = mapUrl; mapLink.hidden = false; }
      setCustomerShareLocationStatus('Location added. It will be sent to the branch with your order.', 'success');
      if (button) { button.disabled = false; button.textContent = '⌖ UPDATE MY LOCATION'; }
    };

    // First request uses lower accuracy for faster/more reliable results indoors on phones.
    // If the device times out or GPS is temporarily unavailable, retry once with high accuracy.
    navigator.geolocation.getCurrentPosition(onSuccess, error => {
      if (error && error.code === 1) { finishError(error); return; }
      setCustomerShareLocationStatus('Trying the phone GPS again…');
      navigator.geolocation.getCurrentPosition(onSuccess, finishError, {
        enableHighAccuracy: true,
        timeout: 25000,
        maximumAge: 0
      });
    }, {
      enableHighAccuracy: false,
      timeout: 30000,
      maximumAge: 300000
    });
  }

  function mapUrlForOrder(order) {
    const saved = validMapUrl(order?.delivery_map_url);
    if (saved) return saved;
    const lat = Number(order?.delivery_latitude), lng = Number(order?.delivery_longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng);
    }
    return null;
  }
  function deliveryDetailsHtml(order, staffView) {
    if (order.fulfillment_type !== 'delivery') return '';
    const map = mapUrlForOrder(order);
    return '<div class="pickup-delivery-details"><span class="fulfillment-badge">⌖ DELIVERY</span>' +
      (order.delivery_zone_name ? '<br><strong>Delivery area:</strong> ' + esc(order.delivery_zone_name) : '') +
      '<br><strong>Delivery address / area:</strong> ' + esc(order.delivery_address || 'Address not recorded') +
      (order.delivery_distance_meters != null ? '<br><strong>Road distance:</strong> ' + esc((Number(order.delivery_distance_meters) / 1000).toFixed(2)) + ' km' : '') +
      (order.delivery_fee != null ? '<br><strong>Delivery fee:</strong> ' + esc(money(order.delivery_fee)) : '') +
      (map ? '<br><a class="delivery-location-link" href="' + esc(map) + '" target="_blank" rel="noopener noreferrer">↗ Open delivery location in Google Maps</a>' : '<br><small>Map location not available.</small>') + '</div>';
  }

  // Opens a formatted, print-ready order receipt from either the local archive or live Supabase order list.
  // This is an order receipt, not a tax invoice.
  function openPrintableOrder(order, items, sourceLabel) {
    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) {
      toast('اسمح بفتح النوافذ المنبثقة في المتصفح لعرض وطباعة الإيصال.', false);
      return;
    }
    try { printWindow.opener = null; } catch (_) {}
    const type = order.fulfillment_type || 'pickup';
    const status = statusLabel(order.status, type);
    const createdAt = order.created_at || (order.createdAtMs ? new Date(order.createdAtMs).toISOString() : null);
    const dateLabel = createdAt && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt).toLocaleString('ar-EG') : '—';
    const orderNo = order.order_number || order.id || '—';
    const itemRows = (items || []).map(item => {
      const itemName = item.item_name || item.name || 'صنف';
      const qty = Number(item.quantity || 0);
      const unitPrice = item.unit_price == null && item.price == null ? null : Number(item.unit_price ?? item.price);
      const lineTotal = item.line_total == null ? (unitPrice == null ? null : unitPrice * qty) : Number(item.line_total);
      return '<tr><td>' + esc(itemName) + '</td><td class="num">' + esc(qty) + '</td><td class="num">' + (unitPrice == null ? 'يُؤكّد' : esc(money(unitPrice))) + '</td><td class="num">' + (lineTotal == null ? 'يُؤكّد' : esc(money(lineTotal))) + '</td></tr>';
    }).join('');
    const subtotal = order.subtotal != null ? money(order.subtotal) : null;
    const deliveryFee = order.delivery_fee != null ? money(order.delivery_fee) : null;
    const total = order.total_amount != null ? money(order.total_amount) : (order.subtotal != null ? money(Number(order.subtotal) + Number(order.delivery_fee || 0)) : 'يُؤكّد من الفرع');
    const cancelReason = order.status === 'cancelled' && String(order.cancellation_reason || '').trim()
      ? '<div class="reason"><strong>سبب الإلغاء:</strong> ' + esc(order.cancellation_reason) + '</div>' : '';
    const customerName = order.customer_name || '—';
    const customerPhone = order.customer_phone || '—';
    const branch = order.branch_name || 'Dina’s Corner';
    const branchAddress = order.branch_address || '';
    const fulfillment = type === 'delivery' ? 'توصيل' : 'استلام من الفرع';
    const notes = String(order.notes || '').trim() ? '<p><strong>ملاحظات العميل:</strong> ' + esc(order.notes) + '</p>' : '';
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>إيصال الطلب ${esc(orderNo)}</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f7f2ef;color:#3d3031;font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6}.page{max-width:760px;margin:24px auto;padding:28px;background:#fffdfa;border:1px solid #ead9d3;border-radius:16px}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border-bottom:2px solid #c65f78;padding-bottom:18px;margin-bottom:18px}.brand{font-size:25px;font-weight:800;color:#a74860}.subtitle{color:#776a6a;font-size:12px}.ticket{background:#f8e9ed;border:1px solid #efd2db;padding:8px 12px;border-radius:9px;font-weight:700;white-space:nowrap}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px;margin-bottom:20px}.field{border-bottom:1px solid #eee1dd;padding:6px 0}.field small{display:block;color:#897b7b;font-size:11px}.field strong{font-size:13px;overflow-wrap:anywhere}.status{display:inline-block;background:#f2efd9;border-radius:20px;padding:3px 10px;font-size:12px}.status.cancelled{background:#fce4e8;color:#9d2945}.section-title{font-weight:800;margin:20px 0 8px}table{width:100%;border-collapse:collapse}th,td{padding:10px 7px;border-bottom:1px solid #eadfdb;text-align:right;vertical-align:top}th{background:#fbf2f3;color:#80505b;font-size:12px}.num{text-align:center;white-space:nowrap}.totals{margin:18px 0 0 auto;max-width:360px}.total-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #e4d7d2}.grand{font-size:19px;font-weight:800;color:#a74860;border-top:2px solid #c65f78;margin-top:6px;padding-top:12px}.reason{margin-top:16px;padding:12px;background:#fff0f2;border:1px solid #efc8d0;border-radius:8px;color:#773b48}.notice{margin-top:22px;padding:10px;background:#f8f5f3;border-radius:8px;text-align:center;color:#746969;font-size:11px}.actions{display:flex;gap:10px;justify-content:center;margin:0 auto 20px}.actions button{border:0;border-radius:8px;padding:11px 18px;background:#c65f78;color:#fff;font-weight:700;cursor:pointer}.actions .secondary{background:#e8dddd;color:#4d3d3f}@media(max-width:600px){.page{margin:0;padding:16px;border-radius:0}.grid{grid-template-columns:1fr 1fr}.top{gap:10px}.brand{font-size:20px}}@media print{@page{size:A5 portrait;margin:9mm}body{background:#fff;font-size:11px}.page{max-width:none;margin:0;padding:0;border:0;border-radius:0}.actions{display:none}.top{padding-bottom:10px;margin-bottom:10px}.brand{font-size:20px}th,td{padding:6px 4px}.notice{margin-top:14px}}
      </style></head><body><div class="actions"><button onclick="window.print()">طباعة الإيصال / حفظ PDF</button><button class="secondary" onclick="window.close()">إغلاق</button></div><main class="page"><header class="top"><div><div class="brand">Dina’s Corner</div><div class="subtitle">إيصال تفاصيل الطلب</div></div><div class="ticket">رقم الطلب: ${esc(orderNo)}</div></header><section class="grid"><div class="field"><small>تاريخ ووقت الطلب</small><strong>${esc(dateLabel)}</strong></div><div class="field"><small>حالة الطلب</small><strong><span class="status ${order.status === 'cancelled' ? 'cancelled' : ''}">${esc(status)}</span></strong></div><div class="field"><small>اسم العميل</small><strong>${esc(customerName)}</strong></div><div class="field"><small>رقم الهاتف</small><strong>${esc(customerPhone)}</strong></div><div class="field"><small>طريقة الاستلام</small><strong>${esc(fulfillment)}</strong></div><div class="field"><small>الفرع</small><strong>${esc(branch)}</strong>${branchAddress ? '<div class="subtitle">' + esc(branchAddress) + '</div>' : ''}</div></section><div class="section-title">تفاصيل الأصناف</div><table><thead><tr><th>الصنف</th><th class="num">الكمية</th><th class="num">سعر الوحدة</th><th class="num">الإجمالي</th></tr></thead><tbody>${itemRows || '<tr><td colspan="4">لا توجد تفاصيل أصناف متاحة.</td></tr>'}</tbody></table><section class="totals">${subtotal != null ? '<div class="total-row"><span>الإجمالي قبل الرسوم</span><strong>' + esc(subtotal) + '</strong></div>' : ''}${deliveryFee != null && Number(order.delivery_fee) !== 0 ? '<div class="total-row"><span>رسوم التوصيل</span><strong>' + esc(deliveryFee) + '</strong></div>' : ''}<div class="total-row grand"><span>إجمالي الطلب</span><strong>${esc(total)}</strong></div></section>${notes}${cancelReason}<footer class="notice">هذا إيصال تفاصيل طلب من النظام، وليس فاتورة ضريبية. ${sourceLabel === 'local' ? 'تم فتحه من النسخة المحلية المحفوظة على هذا الكمبيوتر.' : 'تم فتحه من طلبات الفرع.'}</footer></main><script>window.addEventListener('load',()=>{setTimeout(()=>{try{window.focus()}catch(e){}},100)});</script></body></html>`);
    printWindow.document.close();
  }

  // Download the approved Dina's Corner receipt as a PNG when a Staff member marks an order picked up.
  const receiptAssetCache = new Map();
  const RECEIPT_PAYMENT_NUMBER = '01282471226';

  async function receiptAssetDataUrl(fileName) {
    if (receiptAssetCache.has(fileName)) return receiptAssetCache.get(fileName);
    const task = (async () => {
      const url = new URL('../assets/' + fileName, window.location.href).href;
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error('تعذر تحميل أحد عناصر تصميم الفاتورة: ' + fileName);
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('تعذر تجهيز صورة من عناصر تصميم الفاتورة.'));
        reader.readAsDataURL(blob);
      });
    })();
    receiptAssetCache.set(fileName, task);
    try { return await task; } catch (error) { receiptAssetCache.delete(fileName); throw error; }
  }

  async function receiptMenuQrDataUrl() {
    if (!window.QRCode) throw new Error('مكتبة QR غير جاهزة. حدّث صفحة طلبات الفرع ثم جرّب مرة أخرى.');
    const holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:320px;overflow:hidden;pointer-events:none;';
    document.body.appendChild(holder);
    try {
      const menuUrl = new URL('../customer/customer-menu.html', window.location.href).href;
      holder.replaceChildren();
      new window.QRCode(holder, {
        text: menuUrl,
        width: 320,
        height: 320,
        colorDark: '#171717',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      const canvas = holder.querySelector('canvas');
      if (canvas && canvas.width) return canvas.toDataURL('image/png');
      const image = holder.querySelector('img');
      if (image) {
        if (!image.complete) await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('تعذر إنشاء QR للمنيو.'));
        });
        const canvasFromImage = document.createElement('canvas');
        canvasFromImage.width = 320;
        canvasFromImage.height = 320;
        const ctx = canvasFromImage.getContext('2d');
        if (!ctx) throw new Error('المتصفح لا يدعم تجهيز صورة الفاتورة.');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 320);
        ctx.drawImage(image, 0, 0, 320, 320);
        return canvasFromImage.toDataURL('image/png');
      }
      throw new Error('لم يكتمل إنشاء QR للمنيو.');
    } finally {
      holder.remove();
    }
  }

  function svgReceiptText(x, y, value, options = {}) {
    const size = options.size || 24;
    const color = options.color || '#62353d';
    const anchor = options.anchor || 'start';
    const weight = options.weight || 400;
    const direction = options.direction || 'ltr';
    const family = options.family || 'Tahoma, Arial, sans-serif';
    const style = options.italic ? 'font-style:italic;' : '';
    // Use explicit embedding rather than plaintext: plaintext made Arabic runs
    // change the anchor direction unexpectedly and pushed text out of its cells.
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" direction="${direction}" unicode-bidi="embed" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" style="${style}">${esc(value)}</text>`;
  }

  function wrapReceiptText(value, maxChars, maxLines = 2) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return ['—'];
    const words = text.split(' ');
    const pieces = [];
    for (const word of words) {
      if (Array.from(word).length <= maxChars) {
        pieces.push(word);
        continue;
      }
      const chars = Array.from(word);
      for (let i = 0; i < chars.length; i += maxChars) pieces.push(chars.slice(i, i + maxChars).join(''));
    }
    const lines = [];
    let current = '';
    for (const piece of pieces) {
      const candidate = current ? current + ' ' + piece : piece;
      if (Array.from(candidate).length <= maxChars) current = candidate;
      else {
        if (current) lines.push(current);
        current = piece;
      }
    }
    if (current) lines.push(current);
    if (!lines.length) return ['—'];
    if (lines.length > maxLines) {
      const clipped = lines.slice(0, maxLines);
      const last = Array.from(clipped[maxLines - 1]);
      clipped[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last).join('') + '…';
      return clipped;
    }
    return lines;
  }

  function receiptValueText(x, y, value, options = {}) {
    const text = String(value ?? '');
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    return svgReceiptText(x, y, text, {
      ...options,
      direction: hasArabic ? 'rtl' : 'ltr',
      // x is the right boundary for Arabic values and the right boundary for
      // English values too; SVG uses opposite anchors for RTL and LTR text.
      anchor: hasArabic ? 'start' : 'end'
    });
  }

  function receiptMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? 'EGP ' + number.toFixed(2) : 'To be confirmed';
  }

  async function buildOrderReceiptPngBlob(order, items) {
    const [logo, floralTl, floralTr, floralBl, floralBr, qr] = await Promise.all([
      receiptAssetDataUrl('dina-corner-logo.png'),
      receiptAssetDataUrl('dina-floral-tl.png'),
      receiptAssetDataUrl('dina-floral-tr.png'),
      receiptAssetDataUrl('dina-floral-bl.png'),
      receiptAssetDataUrl('dina-floral-br.png'),
      receiptMenuQrDataUrl()
    ]);
    const rows = Array.isArray(items) ? items : [];
    const width = 1024;
    const tableY = 535;
    const headerH = 72;
    const itemLayouts = rows.map((item, index) => {
      const name = String(item.item_name || item.name || 'صنف');
      const nameLines = wrapReceiptText(name, 26, 2);
      const rowH = nameLines.length > 1 ? 78 : 58;
      return { item, index, name, nameLines, rowH };
    });
    const rowCount = Math.max(itemLayouts.length, 1);
    const rowTotalHeight = itemLayouts.length ? itemLayouts.reduce((sum, row) => sum + row.rowH, 0) : 58;
    const tableBottom = tableY + headerH + rowTotalHeight;
    const totalsY = tableBottom + 12;
    const paymentY = totalsY + 145;
    const notesY = paymentY + 250;
    const notesText = String(order.notes || '').trim();
    const noteLines = wrapReceiptText(notesText || '—', 66, 2);
    const cancelReason = String(order.cancellation_reason || '').trim();
    const cancelLines = cancelReason ? wrapReceiptText(cancelReason, 66, 2) : [];
    const notesH = 88 + Math.max(0, noteLines.length - 1) * 22 + (cancelLines.length ? 24 + Math.max(0, cancelLines.length - 1) * 20 : 0);
    const footerY = notesY + notesH + 16;
    const height = footerY + 180;
    const orderNo = String(order.order_number || order.id || '—');
    const createdAt = order.created_at || (order.createdAtMs ? new Date(order.createdAtMs).toISOString() : null);
    const dateLabel = createdAt && !Number.isNaN(Date.parse(createdAt))
      ? new Date(createdAt).toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '—';
    const status = order.status === 'completed'
      ? (order.fulfillment_type === 'delivery' ? 'Delivered · تم التسليم' : 'Picked up · تم الاستلام')
      : statusLabel(order.status, order.fulfillment_type || 'pickup');
    const branchName = [order.branch_name || 'Dina’s Corner', order.branch_city].filter(Boolean).join(' — ');
    const branchNameLines = wrapReceiptText(branchName, 25, 2);
    const branchAddress = String(order.branch_address || '').trim();
    const addressLines = branchAddress ? wrapReceiptText(branchAddress, 31, 2) : ['—'];
    const fulfillment = (order.fulfillment_type || 'pickup') === 'delivery' ? 'توصيل' : 'استلام من الفرع';
    const itemLayoutsPlaced = [];
    let rowY = tableY + headerH;
    for (const layout of itemLayouts) {
      itemLayoutsPlaced.push({ ...layout, y: rowY });
      rowY += layout.rowH;
    }
    const lineRows = itemLayoutsPlaced.map(layout => {
      const { item, index, nameLines, rowH, y } = layout;
      const qty = Math.max(0, Number(item.quantity || 0));
      const priceValue = item.unit_price == null ? item.price : item.unit_price;
      const price = priceValue == null || priceValue === '' ? null : Number(priceValue);
      const lineValue = item.line_total == null ? (price == null ? null : price * qty) : Number(item.line_total);
      const fill = index % 2 ? '#fffaf7' : '#fffdf9';
      const nameIsArabic = nameLines.some(line => /[\u0600-\u06FF]/.test(line));
      let nameSvg = '';
      if (nameLines.length === 1) {
        nameSvg = receiptValueText(380, y + Math.round(rowH / 2) + 7, nameLines[0], { size: 20, color: '#231a1a' });
      } else {
        nameSvg = nameLines.map((line, lineIndex) => receiptValueText(380, y + 27 + lineIndex * 25, line, { size: 19, color: '#231a1a' })).join('');
      }
      const midY = y + Math.round(rowH / 2) + 7;
      return `<rect x="45" y="${y}" width="934" height="${rowH}" fill="${fill}"/><path d="M45 ${y + rowH}H979" stroke="#efb3bd" stroke-width="1.5"/>` +
        nameSvg +
        svgReceiptText(466, midY, String(qty), { size: 21, color: '#64363c', anchor: 'middle' }) +
        svgReceiptText(628, midY, price == null ? 'To confirm' : receiptMoney(price), { size: 19, color: '#64363c', anchor: 'middle' }) +
        svgReceiptText(955, midY, lineValue == null ? 'To confirm' : receiptMoney(lineValue), { size: 19, color: '#64363c', anchor: 'end' });
    }).join('');
    const emptyItemRow = !itemLayouts.length
      ? `<rect x="45" y="${tableY + headerH}" width="934" height="58" fill="#fffdf9"/><path d="M45 ${tableY + headerH + 58}H979" stroke="#efb3bd" stroke-width="1.5"/>${svgReceiptText(380, tableY + headerH + 36, 'لا توجد تفاصيل أصناف متاحة', { size: 20, color: '#56343a', anchor: 'start', direction: 'rtl' })}`
      : '';
    const calculatedSubtotal = rows.reduce((sum, item) => {
      const line = item.line_total != null ? Number(item.line_total) : (item.unit_price != null ? Number(item.unit_price) * Number(item.quantity || 0) : (item.price != null ? Number(item.price) * Number(item.quantity || 0) : 0));
      return sum + (Number.isFinite(line) ? line : 0);
    }, 0);
    const subtotalValue = order.subtotal != null ? Number(order.subtotal) : calculatedSubtotal;
    const totalValue = order.total_amount != null ? Number(order.total_amount) : subtotalValue + Number(order.delivery_fee || 0);
    const subtotalY = totalsY + 40;
    const totalY = totalsY + 93;
    const addressSvg = addressLines.map((line, index) => receiptValueText(960, 439 + index * 24, line, { size: 17, color: '#312526' })).join('');
    const branchNameSvg = branchNameLines.map((line, index) => svgReceiptText(635, 365 + index * 23, line, { size: 19, color: '#312526', anchor: 'start', direction: 'ltr', weight: 700 })).join('');
    const noteSvg = noteLines.map((line, index) => receiptValueText(950, notesY + 64 + index * 21, line, { size: 17, color: '#56343a' })).join('');
    const cancelSvg = cancelLines.map((line, index) => receiptValueText(950, notesY + 64 + noteLines.length * 21 + 7 + index * 20, line, { size: 15, color: '#a42f4d', weight: 700 })).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="paper" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff8f3"/><stop offset="1" stop-color="#fffaf5"/></linearGradient>
        <linearGradient id="pink" x1="0" x2="1"><stop offset="0" stop-color="#ffe9eb"/><stop offset="1" stop-color="#f9d7de"/></linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#paper)"/>
      <rect x="14" y="14" width="996" height="${height - 28}" rx="34" fill="none" stroke="#eaa0ad" stroke-width="2.5"/>
      <image href="${floralTl}" x="14" y="14" width="180" height="185" preserveAspectRatio="xMinYMin meet"/>
      <image href="${floralTr}" x="830" y="14" width="180" height="185" preserveAspectRatio="xMaxYMin meet"/>
      <image href="${logo}" x="42" y="48" width="360" height="225" preserveAspectRatio="xMidYMid meet"/>
      ${svgReceiptText(960, 90, 'Pickup Order', { size: 54, color: '#b45159', anchor: 'end', family: 'Georgia, Times New Roman, serif', weight: 600 })}
      ${svgReceiptText(960, 145, 'طلب استلام من الفرع', { size: 34, color: '#a94753', anchor: 'start', direction: 'rtl', weight: 700 })}
      <rect x="535" y="175" width="425" height="54" rx="26" fill="url(#pink)" stroke="#f3a7b5" stroke-width="1.5"/>
      ${svgReceiptText(747, 210, 'Order Receipt · إيصال الطلب', { size: 25, color: '#a83f54', anchor: 'middle', weight: 700 })}

      <rect x="45" y="294" width="515" height="215" rx="19" fill="#fff0ef" stroke="#f5ccd0" stroke-width="1.5"/>
      <rect x="588" y="294" width="391" height="215" rx="19" fill="#fff0ef" stroke="#f5ccd0" stroke-width="1.5"/>
      ${svgReceiptText(70, 337, 'Order Number', { size: 21, color: '#a94753' })}
      ${svgReceiptText(200, 363, 'رقم الطلب', { size: 17, color: '#6a343b', direction: 'rtl', anchor: 'start' })}
      ${svgReceiptText(535, 347, orderNo, { size: orderNo.length > 17 ? 19 : 23, color: '#af3452', anchor: 'end', weight: 800 })}
      ${svgReceiptText(70, 400, 'Date & Time', { size: 21, color: '#a94753' })}
      ${svgReceiptText(205, 425, 'التاريخ والوقت', { size: 17, color: '#6a343b', direction: 'rtl', anchor: 'start' })}
      ${svgReceiptText(535, 410, dateLabel, { size: 19, color: '#542d32', anchor: 'end' })}
      ${svgReceiptText(70, 463, 'Status', { size: 20, color: '#a94753' })}
      ${svgReceiptText(205, 487, 'حالة الطلب', { size: 17, color: '#6a343b', direction: 'rtl', anchor: 'start' })}
      <rect x="310" y="441" width="230" height="48" rx="18" fill="${order.status === 'cancelled' ? '#fde0e5' : '#edf1db'}" stroke="${order.status === 'cancelled' ? '#efb2bf' : '#dbe3c6'}"/>
      ${svgReceiptText(425, 471, order.status === 'cancelled' ? 'Cancelled · ملغي' : status, { size: status.length > 21 ? 16 : 18, color: order.status === 'cancelled' ? '#9d2945' : '#4c5931', anchor: 'middle', weight: 700 })}
      <circle cx="650" cy="333" r="26" fill="#f5d5dc"/>
      ${svgReceiptText(650, 342, '▣', { size: 28, color: '#ad4b5b', anchor: 'middle', weight: 700 })}
      ${svgReceiptText(690, 330, 'Branch · الفرع', { size: 20, color: '#a94753', weight: 700 })}
      ${branchNameSvg}
      ${svgReceiptText(635, 412, 'Address · العنوان', { size: 17, color: '#a94753', weight: 700 })}
      ${addressSvg}

      <rect x="45" y="${tableY}" width="934" height="${headerH + rowTotalHeight}" rx="16" fill="#fffdf9" stroke="#ef9eac" stroke-width="1.7"/>
      <path d="M45 ${tableY + headerH}H979" stroke="#ef9eac" stroke-width="1.5"/>
      <path d="M405 ${tableY}V${tableBottom} M522 ${tableY}V${tableBottom} M728 ${tableY}V${tableBottom}" stroke="#efb3bd" stroke-width="1.3"/>
      <rect x="45" y="${tableY}" width="934" height="${headerH}" rx="16" fill="url(#pink)"/>
      <rect x="45" y="${tableY + headerH - 14}" width="934" height="14" fill="url(#pink)"/>
      ${svgReceiptText(72, tableY + 28, 'Item', { size: 22, color: '#a42f4d', weight: 800 })}
      ${svgReceiptText(145, tableY + 53, 'الصنف', { size: 17, color: '#a42f4d', direction: 'rtl', anchor: 'start' })}
      ${svgReceiptText(465, tableY + 31, 'Qty', { size: 22, color: '#a42f4d', anchor: 'middle', weight: 800 })}
      ${svgReceiptText(465, tableY + 54, 'الكمية', { size: 17, color: '#a42f4d', anchor: 'middle', direction: 'rtl' })}
      ${svgReceiptText(625, tableY + 31, 'Unit Price', { size: 22, color: '#a42f4d', anchor: 'middle', weight: 800 })}
      ${svgReceiptText(625, tableY + 54, 'سعر الوحدة', { size: 17, color: '#a42f4d', anchor: 'middle', direction: 'rtl' })}
      ${svgReceiptText(955, tableY + 31, 'Total', { size: 22, color: '#a42f4d', anchor: 'end', weight: 800 })}
      ${svgReceiptText(955, tableY + 54, 'الإجمالي', { size: 17, color: '#a42f4d', anchor: 'start', direction: 'rtl' })}
      ${lineRows || emptyItemRow}

      <rect x="496" y="${totalsY}" width="483" height="132" rx="16" fill="#fff0ef" stroke="#f5ccd0" stroke-width="1.4"/>
      <path d="M496 ${totalsY + 67}H979" stroke="#f2c2c8" stroke-width="1.5"/>
      ${svgReceiptText(520, subtotalY, 'Items subtotal', { size: 20, color: '#6a343b' })}
      ${svgReceiptText(660, subtotalY + 24, 'إجمالي الأصناف', { size: 17, color: '#6a343b', direction: 'rtl', anchor: 'start' })}
      ${svgReceiptText(955, subtotalY + 7, receiptMoney(subtotalValue), { size: 23, color: '#542d32', anchor: 'end' })}
      ${svgReceiptText(520, totalY, 'Order total', { size: 22, color: '#b12f51', weight: 800 })}
      ${svgReceiptText(660, totalY + 25, 'إجمالي الطلب', { size: 17, color: '#b12f51', direction: 'rtl', anchor: 'start', weight: 700 })}
      ${svgReceiptText(955, totalY + 5, receiptMoney(totalValue), { size: 29, color: '#b12f51', anchor: 'end', weight: 800 })}

      <rect x="43" y="${paymentY}" width="936" height="236" rx="22" fill="#fff9f5" stroke="#f3c2ca" stroke-width="1.6"/>
      <rect x="66" y="${paymentY + 10}" width="212" height="216" rx="14" fill="#fffdf9" stroke="#f2b2be" stroke-width="1.8"/>
      <image href="${qr}" x="75" y="${paymentY + 14}" width="194" height="194" preserveAspectRatio="xMidYMid meet"/>
      <rect x="77" y="${paymentY + 207}" width="190" height="22" rx="8" fill="#bd5063"/>
      ${svgReceiptText(172, paymentY + 223, 'Menu · قائمة المنيو', { size: 16, color: '#ffffff', anchor: 'middle', weight: 700 })}
      <path d="M310 ${paymentY + 28}V${paymentY + 127} M648 ${paymentY + 28}V${paymentY + 127}" stroke="#efb3bd" stroke-width="1.4"/>
      ${svgReceiptText(477, paymentY + 65, 'INSTA▶PAY', { size: 31, color: '#4b177e', anchor: 'middle', weight: 900, family: 'Arial, sans-serif' })}
      ${svgReceiptText(477, paymentY + 99, 'InstaPay', { size: 21, color: '#a72f51', anchor: 'middle', weight: 700 })}
      <circle cx="725" cy="${paymentY + 54}" r="26" fill="#e11f2f"/>
      <path d="M716 ${paymentY + 37} C700 ${paymentY + 50}, 719 ${paymentY + 71}, 737 ${paymentY + 62} C732 ${paymentY + 81}, 705 ${paymentY + 70}, 704 ${paymentY + 53} C705 ${paymentY + 44}, 709 ${paymentY + 39}, 716 ${paymentY + 37} Z" fill="#ffffff"/>
      ${svgReceiptText(775, paymentY + 62, 'Vodafone Cash', { size: 20, color: '#e11f2f', anchor: 'middle', weight: 800 })}
      ${svgReceiptText(775, paymentY + 91, 'فودافون كاش', { size: 18, color: '#e11f2f', anchor: 'middle', direction: 'rtl', weight: 700 })}
      <rect x="315" y="${paymentY + 138}" width="635" height="61" rx="18" fill="url(#pink)" stroke="#f2bbc5" stroke-width="1.2"/>
      <circle cx="356" cy="${paymentY + 168}" r="21" fill="#f0c8d1"/>
      ${svgReceiptText(356, paymentY + 177, '☎', { size: 28, color: '#ad4b5b', anchor: 'middle', weight: 700 })}
      ${svgReceiptText(900, paymentY + 178, RECEIPT_PAYMENT_NUMBER, { size: 34, color: '#b12f51', anchor: 'end', weight: 900 })}

      <rect x="45" y="${notesY}" width="934" height="${notesH}" rx="19" fill="#fffdf9" stroke="#f5ccd0" stroke-width="1.5"/>
      ${svgReceiptText(80, notesY + 37, '▤', { size: 28, color: '#b45163', weight: 700 })}
      ${svgReceiptText(130, notesY + 32, 'Order Note', { size: 20, color: '#b12f51', weight: 800 })}
      ${svgReceiptText(350, notesY + 32, 'ملاحظات الطلب', { size: 18, color: '#b12f51', direction: 'rtl', anchor: 'start', weight: 800 })}
      ${noteSvg}
      ${cancelLines.length ? svgReceiptText(130, notesY + 64 + noteLines.length * 21 + 7, 'سبب الإلغاء:', { size: 16, color: '#a42f4d', weight: 800 }) + cancelSvg : ''}

      ${svgReceiptText(512, footerY + 48, 'Thank you!', { size: 38, color: '#b45159', anchor: 'middle', family: 'Georgia, Times New Roman, serif', weight: 700, italic: true })}
      ${svgReceiptText(512, footerY + 81, 'For choosing Dina’s Corner', { size: 22, color: '#8f3b49', anchor: 'middle', family: 'Georgia, Times New Roman, serif' })}
      <path d="M330 ${footerY + 106} C370 ${footerY + 129}, 420 ${footerY + 129}, 456 ${footerY + 111} M568 ${footerY + 111} C604 ${footerY + 129}, 654 ${footerY + 129}, 694 ${footerY + 106}" fill="none" stroke="#c59c56" stroke-width="2"/>
      ${svgReceiptText(512, footerY + 130, '♥', { size: 26, color: '#c65f78', anchor: 'middle' })}
      <image href="${floralBl}" x="14" y="${height - 205}" width="190" height="190" preserveAspectRatio="xMinYMax meet"/>
      <image href="${floralBr}" x="820" y="${height - 205}" width="190" height="190" preserveAspectRatio="xMaxYMax meet"/>
    </svg>`;

    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('تعذر تحويل تصميم الفاتورة إلى صورة.'));
        image.src = svgUrl;
      });
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('المتصفح لا يدعم حفظ صورة الفاتورة.');
      context.fillStyle = '#fff8f3'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.drawImage(image, 0, 0, width, height);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => {
        if (blob) resolve(blob); else reject(new Error('تعذر إنشاء ملف PNG للفاتورة.'));
      }, 'image/png'));
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  async function downloadOrderReceiptPng(order, items) {
    const blob = await buildOrderReceiptPngBlob(order, items);
    const url = URL.createObjectURL(blob);
    const safeOrderNumber = String(order.order_number || order.id || 'order').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Dinas-Corner-Receipt-' + safeOrderNumber + '.png';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }

  async function downloadOrderReceiptById(order, items) {
    const orderSnapshot = { ...order };
    if (!orderSnapshot.created_at && orderSnapshot.createdAtMs) orderSnapshot.created_at = new Date(orderSnapshot.createdAtMs).toISOString();
    await downloadOrderReceiptPng(orderSnapshot, items);
    toast('تم تنزيل صورة الفاتورة PNG. راجع مجلد التنزيلات على الكمبيوتر.');
  }

  // Print the same approved PNG receipt that is downloaded after order status changes.
  // Open the window synchronously from the button click so popup blockers are less likely to stop it.
  async function printOrderReceiptPng(order, items) {
    const printWindow = window.open('', '_blank', 'width=980,height=900');
    if (!printWindow) {
      toast('اسمح بالنوافذ المنبثقة للموقع ثم اضغط زر الطباعة مرة أخرى.', false);
      return false;
    }
    printWindow.document.open();
    printWindow.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تجهيز الفاتورة</title><style>body{margin:0;padding:24px;background:#fff8f3;color:#613b42;font-family:Tahoma,Arial,sans-serif;text-align:center}.wait{padding:24px;border:1px solid #f0ccd3;border-radius:14px;background:#fff}</style></head><body><div class="wait">جارٍ تجهيز صورة الفاتورة للطباعة…</div></body></html>');
    printWindow.document.close();

    try {
      const orderSnapshot = { ...order };
      if (!orderSnapshot.created_at && orderSnapshot.createdAtMs) orderSnapshot.created_at = new Date(orderSnapshot.createdAtMs).toISOString();
      const blob = await buildOrderReceiptPngBlob(orderSnapshot, items);
      const imageUrl = URL.createObjectURL(blob);
      const safeTitle = String(orderSnapshot.order_number || orderSnapshot.id || 'Order Receipt').replace(/[<>"&]/g, '');
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فاتورة ${safeTitle}</title><style>
        *{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Tahoma,Arial,sans-serif;background:#f5eeeb;color:#51383d}.toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:center;gap:8px;padding:10px;background:#fff;border-bottom:1px solid #ead4d8}.toolbar button{border:0;border-radius:9px;padding:10px 18px;background:#c65f78;color:#fff;font-weight:800;cursor:pointer}.toolbar .secondary{background:#eee1e2;color:#5a4449}.sheet{display:flex;justify-content:center;padding:14px}.receipt{display:block;width:auto;height:auto;max-width:100%;max-height:calc(100vh - 95px);object-fit:contain;background:#fff8f3;box-shadow:0 5px 24px #00000012}
        @media print{@page{size:A4 portrait;margin:0}html,body{width:100%;height:100%;background:#fff}.toolbar{display:none!important}.sheet{width:100%;height:100%;padding:0;align-items:center;justify-content:center}.receipt{max-width:100%;max-height:297mm;width:auto;height:auto;object-fit:contain;box-shadow:none;page-break-inside:avoid}}
      </style></head><body><div class="toolbar"><button type="button" onclick="window.print()">🖨 طباعة الفاتورة</button><button class="secondary" type="button" onclick="window.close()">إغلاق</button></div><main class="sheet"><img id="receiptImage" class="receipt" src="${imageUrl}" alt="فاتورة Dina’s Corner"></main><script>
        const receiptImage=document.getElementById('receiptImage');
        receiptImage.addEventListener('load',()=>{setTimeout(()=>{try{window.focus();window.print()}catch(e){}},350)});
        receiptImage.addEventListener('error',()=>{document.querySelector('.sheet').textContent='تعذر عرض صورة الفاتورة. أغلق النافذة وحاول مرة أخرى.'});
        window.addEventListener('beforeunload',()=>{try{URL.revokeObjectURL('${imageUrl}')}catch(e){}});
      <\/script></body></html>`);
      printWindow.document.close();
      return true;
    } catch (error) {
      try {
        printWindow.document.open();
        printWindow.document.write('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body style="font-family:Tahoma,Arial,sans-serif;padding:24px;color:#9d2945">تعذر تجهيز الفاتورة للطباعة. أغلق النافذة وحاول مرة أخرى.</body></html>');
        printWindow.document.close();
      } catch (_) {}
      throw error;
    }
  }

  // Customer-menu product cards call this function to put a database-backed item in the basket.
  window.POAAddItemToCart = function (item) {
    if (document.body.dataset.page !== 'customer-menu') return;
    if (!item || !item.id || !String(item.name || '').trim()) {
      toast('This item cannot be added right now.', false);
      return;
    }
    const cart = readCart();
    const existing = cart.find(row => String(row.id) === String(item.id));
    if (existing) {
      if (Number(existing.quantity) >= 50) { toast('Maximum quantity for this item is 50.', false); return; }
      existing.quantity = Number(existing.quantity) + 1;
      existing.name = String(item.name);
      existing.price = normalizePrice(item.price);
      existing.image_url = item.image_url || null;
    } else {
      cart.push({ id: String(item.id), name: String(item.name), description: item.description || '', image_url: item.image_url || null, price: normalizePrice(item.price), quantity: 1 });
    }
    writeCart(cart);
    toast(String(item.name) + ' added to your order.');
  };

  window.POAChangeItemQuantity = function(id, delta){
    if(page!=='customer-menu') return;
    const cart=readCart(), item=cart.find(row=>String(row.id)===String(id));
    if(!item) return;
    const next=Number(item.quantity)+Number(delta);
    if(next<=0) writeCart(cart.filter(row=>String(row.id)!==String(id)));
    else if(next<=50){item.quantity=next;writeCart(cart);}
    else toast('Maximum quantity for this item is 50.',false);
    updateCartDock();
  };

  function setCheckoutView(mode) {
    const body = $('pickupCheckoutBody');
    const empty = $('pickupEmptyState');
    const success = $('pickupOrderSuccess');
    if (body) body.hidden = mode !== 'checkout';
    if (empty) empty.hidden = mode !== 'empty';
    if (success) success.hidden = mode !== 'success';
  }

  function showOrderSuccess(orderNumber, fulfillment, result = {}) {
    const number = $('pickupOrderSuccessNumber');
    const method = $('pickupOrderSuccessMethod');
    if (number) number.textContent = String(orderNumber || '—');
    if (method) method.textContent = fulfillment === 'delivery'
      ? 'Routed to ' + String(result.branch_name || 'the nearest active branch') + (result.distance_km != null ? ' · ' + Number(result.distance_km).toFixed(2) + ' km by road' : '') + '. Delivery fee: ' + money(result.delivery_fee ?? 0) + '. Branch Staff will update the order status.'
      : 'Pickup from the selected branch. Branch Staff will update the order status.';
    $('pickupCheckoutMessage')?.setAttribute('hidden', '');
    setCheckoutView('success');
    $('pickupOrderSuccess')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // The menu and basket now share one page. Do not create the old fixed bottom dock.
  // The menu renderer owns the live basket preview above the categories/items.
  function updateCartDock() {
    if (page !== 'customer-menu') return;
    const oldDock = $('pickupCartDock');
    if (oldDock) oldDock.remove();
    if (typeof window.POARenderMenuCart === 'function') window.POARenderMenuCart();
  }

  function renderCart() {
    const list = $('pickupCartList'), summary = $('pickupCartSummary'), submit = $('placePickupOrderBtn'), cart = readCart();
    if (!list) return;
    setCheckoutView(cart.length ? 'checkout' : 'empty');
    if (!cart.length) {
      list.innerHTML = '';
      if (summary) summary.innerHTML = '';
      if (submit) submit.disabled = true;
      return;
    }
    list.innerHTML = cart.map(item => {
      const price = normalizePrice(item.price);
      const image = item.image_url
        ? '<img class="pickup-item-photo" src="' + esc(item.image_url) + '" alt="' + esc(item.name) + '" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="pickup-item-photo-fallback" hidden aria-hidden="true">◉</div>'
        : '<div class="pickup-item-photo-fallback" aria-hidden="true">◉</div>';
      const priceText = price === null ? 'Price to be confirmed' : money(price) + ' each';
      const offerPriceInfo = item.offer_id && Number(item.offer_discount_pct) > 0 && normalizePrice(item.original_price) !== null
        ? '<span class="menu-offer-price-detail">' + esc(Number(item.offer_discount_pct)) + '% product discount <span class="menu-offer-original"><del>' + esc(money(item.original_price)) + '</del></span></span>' : '';
      return '<article class="pickup-cart-row">' + image + '<div class="pickup-cart-details"><strong>' + esc(item.name) + '</strong><small>' + esc(priceText) + '</small>' + offerPriceInfo +
        '<div class="pickup-qty"><button type="button" data-qty-minus="' + esc(item.id) + '" aria-label="Decrease quantity">−</button><b>' + Number(item.quantity) + '</b><button type="button" data-qty-plus="' + esc(item.id) + '" aria-label="Increase quantity">+</button><button type="button" class="pickup-remove" data-remove-item="' + esc(item.id) + '">Remove</button></div></div>' +
        '<strong class="pickup-price">' + (price === null ? 'TBC' : money(price * Number(item.quantity))) + '</strong></article>';
    }).join('');
    list.querySelectorAll('[data-qty-minus]').forEach(button => button.addEventListener('click', () => changeQuantity(button.dataset.qtyMinus, -1)));
    list.querySelectorAll('[data-qty-plus]').forEach(button => button.addEventListener('click', () => changeQuantity(button.dataset.qtyPlus, 1)));
    list.querySelectorAll('[data-remove-item]').forEach(button => button.addEventListener('click', () => { writeCart(readCart().filter(row => String(row.id) !== String(button.dataset.removeItem))); renderCart(); }));
    updateOrderSummary();
    refreshPlaceButton();
  }

  function changeQuantity(id, delta) {
    const cart = readCart(), item = cart.find(row => String(row.id) === String(id));
    if (!item) return;
    const next = Number(item.quantity) + delta;
    if (next <= 0) writeCart(cart.filter(row => String(row.id) !== String(id)));
    else if (next <= 50) { item.quantity = next; writeCart(cart); }
    else toast('Maximum quantity for this item is 50.', false);
    renderCart();
  }

  function updateZoneSummary(route, distanceKm, isError) {
    const box = $('deliveryZoneSummary');
    if (!box) return;
    if (!route) {
      box.hidden = true;
      box.innerHTML = '';
      box.classList.remove('error');
      return;
    }
    const branchName = route.branch_name || 'Nearest active branch';
    const fee = route.delivery_fee == null ? null : Number(route.delivery_fee);
    const dkm = Number.isFinite(Number(distanceKm)) ? Number(distanceKm) : Number(route.distance_km);
    const distance = Number.isFinite(dkm) ? '<span class="delivery-zone-chip">Road distance ' + esc(dkm.toFixed(2)) + ' km</span>' : '';
    const feeChip = Number.isFinite(fee) ? '<span class="delivery-zone-chip">Delivery fee ' + esc(money(fee)) + '</span>' : '';
    const mode = route.travel_mode === 'DRIVE' ? 'Car route' : 'Motorcycle route';
    box.innerHTML = '<div class="delivery-zone-heading"><strong>' + esc(isError || route.covered === false ? 'Delivery unavailable' : 'Nearest branch found') + '</strong>' +
      (!isError && route.branch_name ? '<span class="delivery-zone-route">· ' + esc(branchName) + '</span>' : '') + '</div>' +
      (isError || route.covered === false
        ? '<span class="delivery-zone-route">' + esc(route.message || 'A valid road route within 50 km could not be confirmed.') + '</span>'
        : '<div class="delivery-zone-facts">' + distance + feeChip + '<span class="delivery-zone-chip">' + esc(mode) + ' · 10 EGP/km · maximum 50 km</span></div>');
    box.hidden = false;
    box.classList.toggle('error', !!isError || route.covered === false);
  }
  function updateOrderSummary() {
    const summary = $('pickupCartSummary');
    if (!summary) return;
    const cart = readCart(), calc = calculate(cart), delivery = fulfillmentType() === 'delivery', route = delivery ? resolvedDeliveryRoute : null;
    const subtotalText = calc.known ? money(calc.total) : 'To be confirmed by branch';
    const hasOfferDiscount = cart.some(row => row.offer_id && Number(row.offer_discount_pct) > 0 && normalizePrice(row.original_price) !== null && normalizePrice(row.price) !== null);
    const baseSubtotal = calc.known ? cart.reduce((sum, row) => sum + Number(row.offer_id && normalizePrice(row.original_price) !== null ? row.original_price : row.price) * Number(row.quantity || 0), 0) : null;
    const productSavings = calc.known ? Math.max(0, baseSubtotal - calc.total) : null;
    let html = '<div class="pickup-summary-row"><span>Items</span><strong>' + quantityCount(cart) + '</strong></div>' +
      (hasOfferDiscount && calc.known ? '<div class="pickup-summary-row"><span>Product subtotal before discounts</span><strong><del>' + esc(money(baseSubtotal)) + '</del></strong></div><div class="pickup-summary-row"><span>Product discount</span><strong style="color:#a13a52">−' + esc(money(productSavings)) + '</strong></div>' : '') +
      '<div class="pickup-summary-row"><span>Items subtotal' + (hasOfferDiscount ? ' after discount' : '') + '</span><strong>' + subtotalText + '</strong></div>' +
      (hasOfferDiscount ? '<div class="pickup-note">Discount applies to products only.</div>' : '');
    if (hasOfferDiscount && !OFFER_DISCOUNT_BACKEND_READY) {
      html += '<div class="pickup-offer-checkout-warning">Offer prices are shown in the basket, but server-side offer validation is not enabled. Sending this order is paused to prevent an incorrect charge.</div>';
    }
    if (delivery && (!route || route.covered !== true)) {
      html += '<div class="pickup-note">Update your GPS location or choose a saved address with a map pin. The nearest branch and road distance will be calculated automatically. Delivery is available up to 50 km by road.</div>';
      if (route && route.message) html += '<div class="pickup-error">' + esc(route.message) + '</div>';
    }
    if (delivery && route && route.covered === true) {
      const fee = Number(route.delivery_fee || 0);
      html += '<div class="pickup-summary-row"><span>Road distance · ' + esc(route.branch_name || 'Nearest branch') + '</span><strong>' + esc(Number(route.distance_km).toFixed(2)) + ' km</strong></div>' +
        '<div class="pickup-summary-row"><span>Delivery fee (10 EGP/km)</span><strong>' + esc(money(fee)) + '</strong></div>' +
        '<div class="pickup-summary-row"><span>Estimated total</span><strong>' + (calc.known ? esc(money(calc.total + fee)) : 'To be confirmed by branch') + '</strong></div>';
    } else if (!delivery) {
      html += '<div class="pickup-summary-row"><span>Order total</span><strong>' + subtotalText + '</strong></div>';
    }
    html += !calc.known
      ? '<div class="pickup-note">One or more items do not have a published price. The branch will confirm the final amount before preparation.</div>'
      : '<div class="pickup-note">No online payment is taken in this flow. The branch will confirm and process the order.</div>';
    summary.innerHTML = html;
  }
  function refreshPlaceButton() {
    const btn = $('placePickupOrderBtn');
    if (!btn || btn.dataset.sending) return;
    const cart = readCart(), delivery = fulfillmentType() === 'delivery', route = delivery ? resolvedDeliveryRoute : null;
    const hasUnvalidatedOffer = !OFFER_DISCOUNT_BACKEND_READY && cart.some(row => row.offer_id && Number(row.offer_discount_pct) > 0);
    btn.disabled = !cart.length || (delivery ? !(route && route.covered === true) : !$('pickupBranch')?.value) || hasUnvalidatedOffer;
    if (hasUnvalidatedOffer) btn.title = 'Discounted offers cannot be submitted until Supabase server validation is updated.';
    else btn.removeAttribute('title');
    updateOrderSummary();
  }


  function setLocationStatus(text, kind) {
    const el = $('deliveryLocationStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('success', kind === 'success');
    el.classList.toggle('error', kind === 'error');
  }
  function updateFulfillmentUI() {
    const type = fulfillmentType(), delivery = type === 'delivery';
    const panel = $('deliveryDetails');
    const branchField = $('pickupBranchField');
    if (panel) panel.hidden = !delivery;
    if (branchField) branchField.hidden = delivery;
    if ($('pickupBranch')) $('pickupBranch').required = !delivery;
    const address = $('deliveryAddress');
    // Written address details are optional when GPS or a valid map link is supplied.
    if (address) address.required = false;
    const btn = $('placePickupOrderBtn');
    if (btn && !btn.dataset.sending) btn.textContent = delivery ? 'PLACE DELIVERY ORDER' : 'PLACE PICKUP ORDER';
    updateOrderSummary();
    refreshPlaceButton();
  }
  function useMyLocation() {
    const button = $('useMyLocationBtn');
    if (!navigator.geolocation) { setLocationStatus('Location is not available in this browser. Paste a Google Maps link instead.', 'error'); return; }
    if (button) { button.disabled = true; button.textContent = 'GETTING LOCATION…'; }
    setLocationStatus('Waiting for location permission…');
    navigator.geolocation.getCurrentPosition(async position => {
      const lat = Number(position.coords.latitude), lng = Number(position.coords.longitude);
      $('deliveryLatitude').value = String(lat);
      $('deliveryLongitude').value = String(lng);
      $('deliveryMapUrl').value = 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng);
      setLocationStatus('Checking delivery coverage…');
      await resolveDeliveryZoneForCoordinates(lat, lng);
      if (button) { button.disabled = false; button.textContent = '⌖ UPDATE MY LOCATION'; }
    }, error => {
      const message = error && error.code === 1 ? 'Location permission was denied. Paste a Google Maps link instead.' : 'Could not get location. Check device location and try again, or paste a Maps link.';
      setLocationStatus(message, 'error');
      if (button) { button.disabled = false; button.textContent = '⌖ USE MY CURRENT LOCATION'; }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  async function loadSavedDeliveryAddresses() {
    const select = $('deliverySavedAddress');
    if (!select) return;
    select.innerHTML = '<option value="">Loading your saved addresses…</option>';
    try {
      const { data: authData, error: authError } = await sb.auth.getUser();
      if (authError) throw authError;
      const customerId = authData?.user?.id;
      if (!customerId) throw new Error('Please sign in again to load your saved delivery addresses.');
      const { data, error } = await sb.from('customer_addresses')
        .select('id,label,full_address,delivery_instructions,latitude,longitude,map_url,is_default,created_at')
        .eq('customer_id', customerId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      savedDeliveryAddresses = Array.isArray(data) ? data : [];
      if (!savedDeliveryAddresses.length) {
        select.innerHTML = '<option value="">No saved address yet — add one in My Profile</option>';
        selectedDeliveryInstructions = '';
        selectedSavedAddressText = '';
        setLocationStatus('No map pin saved. Update your location or manage saved addresses.', 'error');
        return;
      }
      select.innerHTML = '<option value="">Choose another saved address</option>' + savedDeliveryAddresses.map(row => {
        const details = String(row.full_address || '').replace(/\s+/g, ' ').trim();
        const locationSummary = details ? (details.length > 75 ? details.slice(0, 72) + '…' : details) : (row.latitude != null && row.longitude != null && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)) ? 'Map pin saved' : 'Written details not added');
        const optionText = (row.label || 'Address') + (row.is_default ? ' · Default' : '') + ' — ' + locationSummary;
        return '<option value="' + esc(row.id) + '">' + esc(optionText) + '</option>';
      }).join('');
      const preferred = savedDeliveryAddresses.find(row => row.is_default) || savedDeliveryAddresses[0];
      select.value = preferred.id;
      await applySavedDeliveryAddress(preferred);
      select.addEventListener('change', async () => {
        const row = savedDeliveryAddresses.find(item => item.id === select.value);
        if (row) await applySavedDeliveryAddress(row);
        else {
          selectedDeliveryInstructions = '';
          selectedSavedAddressText = '';
          resolvedDeliveryRoute = null;
          updateZoneSummary(null);
          updateOrderSummary();
          refreshPlaceButton();
        }
      });
    } catch (error) {
      select.innerHTML = '<option value="">Saved addresses unavailable</option>';
      setLocationStatus('Could not load saved addresses. Try again or manage them in My Profile.', 'error');
    }
  }

  async function applySavedDeliveryAddress(row) {
    if (!row) return;
    if ($('deliveryAddress')) $('deliveryAddress').value = row.full_address || '';
    if ($('deliveryLatitude')) $('deliveryLatitude').value = row.latitude == null ? '' : String(row.latitude);
    if ($('deliveryLongitude')) $('deliveryLongitude').value = row.longitude == null ? '' : String(row.longitude);
    if ($('deliveryMapUrl')) $('deliveryMapUrl').value = row.map_url || (row.latitude != null && row.longitude != null && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)) ? 'https://www.google.com/maps?q=' + encodeURIComponent(row.latitude + ',' + row.longitude) : '');
    selectedDeliveryInstructions = row.delivery_instructions || '';
    selectedSavedAddressText = row.full_address || '';
    if (row.latitude != null && row.longitude != null) {
      setLocationStatus('Saved address selected. Checking coverage…');
      await resolveDeliveryZoneForCoordinates(Number(row.latitude), Number(row.longitude));
    } else {
      resolvedDeliveryRoute = null;
      updateZoneSummary(null);
      setLocationStatus('This address has no map pin. Choose another address or update your location.', 'error');
    }
    updateOrderSummary();
    refreshPlaceButton();
  }

  function deliveryPayloadOrError() {
    if (fulfillmentType() !== 'delivery') return { type: 'pickup', address: null, mapUrl: null, latitude: null, longitude: null, instructions: null, route: null };
    const address = $('deliveryAddress')?.value.trim() || '';
    const mapInput = $('deliveryMapUrl')?.value.trim() || '';
    const latText = $('deliveryLatitude')?.value || '', lngText = $('deliveryLongitude')?.value || '';
    const latitude = latText === '' ? null : Number(latText);
    const longitude = lngText === '' ? null : Number(lngText);
    if ((latitude === null) !== (longitude === null)) { showMessage('pickupCheckoutMessage', 'The map location is incomplete. Update your current location again.', true); return null; }
    if (latitude !== null && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
      showMessage('pickupCheckoutMessage', 'The map coordinates are invalid. Select your current location or choose a valid saved map pin.', true); return null;
    }
    if (latitude === null || longitude === null) {
      showMessage('pickupCheckoutMessage', 'Choose your current location or a saved address with a map pin before delivery.', true);
      $('useMyLocationBtn')?.focus();
      return null;
    }
    const mapUrl = validMapUrl(mapInput);
    if (mapInput && !mapUrl) { showMessage('pickupCheckoutMessage', 'The saved map link is invalid. Re-select the location or update the saved address.', true); return null; }
    if (!resolvedDeliveryRoute || resolvedDeliveryRoute.covered !== true || Number(resolvedDeliveryRoute.latitude) !== latitude || Number(resolvedDeliveryRoute.longitude) !== longitude) {
      showMessage('pickupCheckoutMessage', 'Please update your location and wait for a valid road route under 50 km before placing the order.', true);
      return null;
    }
    const resolvedMapUrl = mapUrl || 'https://www.google.com/maps?q=' + encodeURIComponent(latitude + ',' + longitude);
    return { type: 'delivery', address: address || null, mapUrl: resolvedMapUrl, latitude, longitude, instructions: address === selectedSavedAddressText ? selectedDeliveryInstructions : null, route: resolvedDeliveryRoute };
  }



  async function loadBranches() {
    const select = $('pickupBranch');
    if (!select) return;
    select.innerHTML = '<option value="">Loading branches…</option>';
    const { data, error } = await sb.from('locations').select('id,name,city,address,is_active').eq('is_active', true).order('name');
    if (error) {
      select.innerHTML = '<option value="">Branches unavailable</option>';
      showMessage('pickupCheckoutMessage', 'Could not load branches. Ask the company manager to check active branch locations. ' + error.message, true);
      return;
    }
    const branches = Array.isArray(data) ? data.filter(row => row && row.id && row.name) : [];
    activeBranches = branches;
    if (!branches.length) {
      select.innerHTML = '<option value="">No active branches available</option>';
      showMessage('pickupCheckoutMessage', 'No active branches are available yet. A branch must be added before placing orders.', true);
      return;
    }
    select.innerHTML = '<option value="">Choose branch</option>' + branches.map(row => '<option value="' + esc(row.id) + '">' + esc(row.name) + (row.city ? ' — ' + esc(row.city) : '') + '</option>').join('');
    const stored = localStorage.getItem(BRANCH_KEY);
    if (stored && branches.some(row => row.id === stored)) select.value = stored;
    select.addEventListener('change', () => {
      if (select.value) localStorage.setItem(BRANCH_KEY, select.value); else localStorage.removeItem(BRANCH_KEY);
      refreshPlaceButton();
    });
    refreshPlaceButton();
  }



  async function resolveDeliveryZoneForCoordinates(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      resolvedDeliveryRoute = null;
      updateZoneSummary({ message: 'The map location is invalid. Select your current location again.' }, null, true);
      setLocationStatus('The map location is invalid. Select your current location again.', 'error');
      updateOrderSummary();
      refreshPlaceButton();
      return;
    }
    resolvedDeliveryRoute = null;
    updateZoneSummary(null);
    updateOrderSummary();
    refreshPlaceButton();
    try {
      const { data, error } = await sb.functions.invoke('delivery-routing', {
        body: { action: 'quote', latitude, longitude }
      });
      if (error) {
        let message = error.message || 'Could not calculate the road route.';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body && body.message) message = body.message;
          }
        } catch (_) {}
        throw new Error(message);
      }
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw new Error('The delivery service returned no route information.');
      resolvedDeliveryRoute = result;
      if (result.covered !== true) {
        updateZoneSummary(result, result.distance_km, true);
        setLocationStatus(result.message || 'The nearest branch is more than 50 km away by road.', 'error');
      } else {
        updateZoneSummary(result, result.distance_km, false);
        setLocationStatus('Location confirmed · ' + result.branch_name + ' · ' + Number(result.distance_km).toFixed(2) + ' km by road · ' + money(result.delivery_fee), 'success');
      }
      updateOrderSummary();
      refreshPlaceButton();
    } catch (error) {
      resolvedDeliveryRoute = null;
      updateZoneSummary({ message: error?.message || 'Could not confirm a valid road route. Try again.' }, null, true);
      setLocationStatus('Could not confirm this location. Check the routing service setup and try again.', 'error');
      updateOrderSummary();
      refreshPlaceButton();
    }
  }



  function showMessage(id, text, isError) {
    const box = $(id);
    if (!box) return;
    box.hidden = !text;
    box.className = isError ? 'pickup-error' : 'pickup-success';
    box.textContent = text || '';
  }

  async function submitCustomerOrder(event) {
    event.preventDefault();
    const cart = readCart();
    if (!cart.length) { setCheckoutView('empty'); return; }
    if (!OFFER_DISCOUNT_BACKEND_READY && cart.some(row => row.offer_id && Number(row.offer_discount_pct) > 0)) {
      showMessage('pickupCheckoutMessage', 'This basket contains a discounted offer. We paused checkout so you are not charged the regular price by the current order server. The Supabase order function must be updated to validate and save the offer discount before placing this order.', true);
      return;
    }
    const delivery = deliveryPayloadOrError();
    if (!delivery) return;
    const branchId = $('pickupBranch')?.value;
    if (delivery.type === 'pickup' && !branchId) { showMessage('pickupCheckoutMessage', 'Choose the branch that will handle your pickup order.', true); $('pickupBranch')?.focus(); return; }
    if (delivery.type === 'delivery' && !(delivery.route && delivery.route.covered === true)) { showMessage('pickupCheckoutMessage', 'Confirm a valid road route within 50 km before placing the order.', true); $('useMyLocationBtn')?.focus(); return; }

    const button = $('placePickupOrderBtn');
    button.dataset.sending = 'true'; button.disabled = true; button.textContent = 'SENDING ORDER…';
    showMessage('pickupCheckoutMessage', '', false);
    try {
      const sharedMapUrl = validMapUrl($('customerShareMapUrl')?.value || '');
      const notes = [
        $('pickupOrderNotes')?.value?.trim() ? 'Order note: ' + $('pickupOrderNotes').value.trim() : '',
        sharedMapUrl ? 'Customer location: ' + sharedMapUrl : ''
      ].filter(Boolean).join(' | ').slice(0, 500) || null;
      const orderItems = cart.map(row => ({ item_id: row.id, quantity: Number(row.quantity) }));
      const rpc = delivery.type === 'delivery'
        ? await sb.functions.invoke('delivery-routing', {
            body: {
              action: 'place-order',
              latitude: delivery.latitude,
              longitude: delivery.longitude,
              address: delivery.address,
              notes,
              items: orderItems
            }
          })
        : await sb.rpc('place_customer_order', {
            p_location_id: branchId,
            p_items: orderItems,
            p_fulfillment_type: 'pickup',
            p_delivery_address: null,
            p_delivery_map_url: null,
            p_delivery_latitude: null,
            p_delivery_longitude: null,
            p_notes: notes
          });
      const { data, error } = rpc;
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result || !result.order_number) throw new Error('The order system did not return an order number. Refresh your order history before trying again.');
      localStorage.removeItem(CART_KEY);
      if ($('pickupOrderNotes')) $('pickupOrderNotes').value = '';
      ['customerShareLatitude', 'customerShareLongitude', 'customerShareMapUrl'].forEach(id => { if ($(id)) $(id).value = ''; });
      const sharedLocationLink = $('customerShareLocationMapLink');
      if (sharedLocationLink) { sharedLocationLink.hidden = true; sharedLocationLink.removeAttribute('href'); }
      setCustomerShareLocationStatus('Location has not been shared.');
      const fulfillment = result.fulfillment_type === 'delivery' ? 'delivery' : 'pickup';
      renderCart();
      showOrderSuccess(result.order_number, fulfillment, result);
      // Past orders are shown only on customer-order-history.html. Keep checkout focused on the current order.
      // Ask about adding the app only after a successful order, never on the landing page.
      window.setTimeout(() => {
        if (window.POAInstallPrompt && typeof window.POAInstallPrompt.showAfterOrder === 'function') {
          window.POAInstallPrompt.showAfterOrder();
        }
      }, 450);
    } catch (error) {
      showMessage('pickupCheckoutMessage', error?.message || 'Could not send your order. Please try again.', true);
    } finally {
      delete button.dataset.sending;
      updateFulfillmentUI();
      refreshPlaceButton();
    }
  }

  async function cancelCustomerOrder(id) {
    if (!confirm('Cancel this order? Only orders not yet accepted can be cancelled here.')) return;
    try {
      const { error } = await sb.rpc('cancel_pickup_order', { p_order_id: id });
      if (error) throw error;
      toast('Order cancelled.');
      await loadCustomerOrders();
    } catch (error) { showMessage('pickupOrdersMessage', error?.message || 'Could not cancel the order.', true); }
  }

  async function loadCustomerOrders() {
    const box = $('pickupOrdersList');
    if (!box) return;
    box.innerHTML = '<div class="pickup-empty">Loading your orders…</div>';
    const { data, error } = await sb.from('pickup_orders')
      .select('id,order_number,customer_name,location_id,branch_name,branch_city,branch_address,fulfillment_type,delivery_address,delivery_map_url,delivery_latitude,delivery_longitude,delivery_zone_id,delivery_zone_name,delivery_distance_meters,delivery_fee,total_amount,status,notes,subtotal,currency,cancellation_reason,cancelled_at,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(50);
    if (error) {
      box.innerHTML = '<div class="pickup-error">Could not load orders. Run the order setup SQL in Supabase. Details: ' + esc(error.message) + '</div>';
      return;
    }
    const orders = Array.isArray(data) ? data : [];
    if (!orders.length) { box.innerHTML = '<div class="pickup-empty">No orders yet. Add items from Menu to place your first order.</div>'; return; }
    const orderIds = orders.map(row => row.id);
    const { data: items, error: itemsError } = await sb.from('pickup_order_items').select('id,order_id,item_name,quantity,unit_price,line_total').in('order_id', orderIds).order('created_at', { ascending: true });
    if (itemsError) { box.innerHTML = '<div class="pickup-error">Your orders loaded, but their items could not be loaded: ' + esc(itemsError.message) + '</div>'; return; }
    const grouped = {};
    (items || []).forEach(item => (grouped[item.order_id] ||= []).push(item));
    box.innerHTML = orders.map(order => {
      const rows = grouped[order.id] || [], type = order.fulfillment_type || 'pickup', canCancel = order.status === 'placed';
      const itemHtml = rows.map(row => '<div>• ' + esc(row.item_name) + ' × ' + Number(row.quantity) + (row.unit_price === null ? ' — price to be confirmed' : ' — ' + money(row.line_total)) + '</div>').join('');
      const typeBadge = '<span class="fulfillment-badge">' + (type === 'delivery' ? '⌖ DELIVERY' : '⌂ PICKUP') + '</span>';
      return '<article class="pickup-order-card"><div class="pickup-order-head"><div><div class="pickup-order-number">' + esc(order.order_number) + '</div><small class="pickup-order-date">' + esc(new Date(order.created_at).toLocaleString()) + '</small></div><span class="pickup-status" data-status="' + esc(order.status) + '">' + esc(statusLabel(order.status, type)) + '</span></div>' +
        '<div class="pickup-order-meta">' + typeBadge + '<br><strong>Branch: ' + esc(order.branch_name) + '</strong>' + (order.branch_city ? ' · ' + esc(order.branch_city) : '') + '<br>' + esc(statusHint(order.status, type)) +
        deliveryDetailsHtml(order, false) + (order.notes ? '<br>Note: ' + esc(order.notes) : '') + (order.status === 'cancelled' && String(order.cancellation_reason || '').trim() ? '<div class="pickup-cancellation-reason" role="note" style="margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff0f2;border:1px solid #efc8d0;color:#773b48"><strong>Cancellation reason:</strong> ' + esc(order.cancellation_reason) + '</div>' : '') + '</div>' +
        '<div class="pickup-order-items">' + itemHtml + '</div><div class="pickup-order-footer"><div class="pickup-order-total">Order total<strong>' + (order.total_amount != null ? money(order.total_amount) : order.subtotal === null ? 'To be confirmed by branch' : money(Number(order.subtotal) + Number(order.delivery_fee || 0))) + '</strong></div>' +
        (canCancel ? '<button class="btn danger" type="button" data-cancel-order="' + esc(order.id) + '">Cancel order</button>' : '') + '</div></article>';
    }).join('');
    box.querySelectorAll('[data-cancel-order]').forEach(button => button.addEventListener('click', () => cancelCustomerOrder(button.dataset.cancelOrder)));
  }

  // Local computer archive: IndexedDB, with fixed expiry at order creation + 24 hours.
  // Status updates (including cancelled) replace the snapshot but never extend expiry.
  function openLocalArchiveDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local order storage.'));
    if (localArchiveDbPromise) return localArchiveDbPromise;
    localArchiveDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(LOCAL_ARCHIVE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_ARCHIVE_STORE)) {
          const store = db.createObjectStore(LOCAL_ARCHIVE_STORE, { keyPath: 'id' });
          store.createIndex('branchId', 'location_id', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
          store.createIndex('createdAtMs', 'createdAtMs', { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Ask the browser to retain this site's storage when supported. Users can still clear it manually.
        try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (_) {}
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('Could not open the local order archive.'));
      request.onblocked = () => reject(new Error('The local order archive is blocked by another open tab. Close other Dina’s Corner tabs and try again.'));
    });
    return localArchiveDbPromise;
  }

  async function localArchiveGetAll() {
    const db = await openLocalArchiveDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_ARCHIVE_STORE, 'readonly');
      const req = tx.objectStore(LOCAL_ARCHIVE_STORE).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error('Could not read saved local orders.'));
    });
  }

  async function localArchiveDeleteExpired() {
    const rows = await localArchiveGetAll();
    const expiredIds = rows.filter(row => Number(row.expiresAt) <= Date.now()).map(row => row.id);
    if (!expiredIds.length) return 0;
    const db = await openLocalArchiveDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_ARCHIVE_STORE, 'readwrite');
      const store = tx.objectStore(LOCAL_ARCHIVE_STORE);
      expiredIds.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve(expiredIds.length);
      tx.onerror = () => reject(tx.error || new Error('Could not remove expired local orders.'));
      tx.onabort = () => reject(tx.error || new Error('Removing expired local orders was interrupted.'));
    });
  }

  async function localArchiveUpsertBatch(orders, groupedItems, branchId) {
    if (!orders.length) return 0;
    const now = Date.now();
    const previousRows = await localArchiveGetAll();
    const previousById = new Map(previousRows.map(row => [String(row.id), row]));
    const db = await openLocalArchiveDb();
    const records = [];
    for (const order of orders) {
      const id = String(order.id ?? '');
      if (!id) continue;
      const existing = previousById.get(id);
      const parsedCreated = Date.parse(order.created_at || '');
      const createdAtMs = Number.isFinite(parsedCreated) ? parsedCreated : (existing?.createdAtMs || now);
      const expiresAt = existing && Number.isFinite(Number(existing.expiresAt))
        ? Number(existing.expiresAt)
        : createdAtMs + LOCAL_ARCHIVE_TTL_MS;
      if (expiresAt <= now) continue;
      const itemRows = groupedItems[order.id] || existing?.items || [];
      records.push({
        ...order,
        id,
        location_id: String(order.location_id || branchId),
        items: itemRows.map(item => ({
          item_name: String(item.item_name || 'Item'),
          quantity: Number(item.quantity || 0),
          unit_price: item.unit_price == null ? null : Number(item.unit_price),
          line_total: item.line_total == null ? null : Number(item.line_total)
        })),
        createdAtMs,
        firstSeenAt: existing?.firstSeenAt || now,
        archivedAt: existing?.archivedAt || now,
        expiresAt,
        localArchiveVersion: 1
      });
    }
    if (!records.length) return 0;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_ARCHIVE_STORE, 'readwrite');
      const store = tx.objectStore(LOCAL_ARCHIVE_STORE);
      records.forEach(row => store.put(row));
      tx.oncomplete = () => resolve(records.length);
      tx.onerror = () => reject(tx.error || new Error('Could not save orders on this computer.'));
      tx.onabort = () => reject(tx.error || new Error('Saving local orders was interrupted.'));
    });
  }

  async function fetchOrdersForLocalArchive(column, sinceIso, branchId) {
    const all = [];
    let offset = 0;
    const pageSize = 300;
    const fields = 'id,order_number,customer_name,customer_phone,location_id,branch_name,branch_city,branch_address,fulfillment_type,delivery_address,delivery_map_url,delivery_latitude,delivery_longitude,delivery_zone_id,delivery_zone_name,delivery_distance_meters,delivery_fee,total_amount,status,notes,subtotal,currency,cancellation_reason,cancelled_at,created_at,updated_at';
    while (true) {
      let query = sb.from('pickup_orders').select(fields);
      if (branchId) query = query.eq('location_id', branchId);
      const { data, error } = await query
        .gte(column, sinceIso)
        .order(column, { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const batch = Array.isArray(data) ? data : [];
      all.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }

  async function syncLocalOrderArchive(forceFullSync = false) {
    if ((!canViewAllBranchOrders && !assignedStaffLocationId) || localArchiveSyncRunning) return;
    localArchiveSyncRunning = true;
    setLocalArchiveStatus('جارٍ التحديث…', 'loading');
    try {
      await localArchiveDeleteExpired();
      const now = Date.now();
      const fullSync = forceFullSync || !localArchiveLastSyncAt;
      const since = fullSync
        ? new Date(now - LOCAL_ARCHIVE_TTL_MS).toISOString()
        : new Date(Math.max(now - LOCAL_ARCHIVE_TTL_MS, localArchiveLastSyncAt - 2 * 60 * 1000)).toISOString();
      const createdOrders = await fetchOrdersForLocalArchive('created_at', since, assignedStaffLocationId);
      let changedOrders = [];
      if (!fullSync) changedOrders = await fetchOrdersForLocalArchive('updated_at', since, assignedStaffLocationId);
      const byId = new Map();
      [...createdOrders, ...changedOrders].forEach(order => byId.set(String(order.id), order));
      const orders = [...byId.values()];
      const groupedItems = {};
      const ids = orders.map(order => order.id);
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        if (!chunk.length) continue;
        const { data: items, error: itemsError } = await sb.from('pickup_order_items')
          .select('order_id,item_name,quantity,unit_price,line_total')
          .in('order_id', chunk)
          .order('created_at', { ascending: true });
        if (itemsError) throw itemsError;
        (items || []).forEach(item => (groupedItems[item.order_id] ||= []).push(item));
      }
      await localArchiveUpsertBatch(orders, groupedItems, assignedStaffLocationId);
      await localArchiveDeleteExpired();
      localArchiveLastSyncAt = Date.now();
      await renderLocalOrderArchive();
      const visibleCount = (await localArchiveGetAll()).filter(row => (canViewAllBranchOrders || String(row.location_id) === String(assignedStaffLocationId)) && Number(row.expiresAt) > Date.now()).length;
      setLocalArchiveStatus('محدّثة', 'success');
      if ($('managedPickupOrders')) await loadManagedOrders({ quiet: true });
    } catch (error) {
      setLocalArchiveStatus('تعذر التحديث', 'error', error?.message || 'خطأ غير معروف');
      try { await renderLocalOrderArchive(); } catch (_) {}
    } finally {
      localArchiveSyncRunning = false;
    }
  }

  function setLocalArchiveStatus(message, kind, detail = '') {
    const el = $('localOrderArchiveStatus');
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind || '';
    el.title = detail || '';
  }

  function localRemainingText(expiresAt) {
    const ms = Math.max(0, Number(expiresAt) - Date.now());
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return hours > 0 ? hours + ' ساعة و' + minutes + ' دقيقة متبقية' : minutes + ' دقيقة متبقية';
  }

  async function renderLocalOrderArchive() {
    const countEl = $('localOrderArchiveCount');
    const rows = await localArchiveGetAll();
    const now = Date.now();
    const branchRows = rows.filter(row =>
      (canViewAllBranchOrders || String(row.location_id) === String(assignedStaffLocationId)) && Number(row.expiresAt) > now
    );
    if (countEl) countEl.textContent = String(branchRows.length);

    // The local archive is storage, not a second order list. Keep any older markup empty
    // so an outdated HTML file cannot show duplicate order cards above the live list.
    const oldList = $('localOrderArchiveList');
    if (oldList) oldList.innerHTML = '<div class="pickup-empty">النسخ المحلية محفوظة على هذا الكمبيوتر، وتظهر الطلبات مرة واحدة فقط في قائمة الأوردرات بالأسفل.</div>';
  }

  function bindLocalArchiveControls() {
    $('refreshLocalOrderArchiveBtn')?.addEventListener('click', () => syncLocalOrderArchive(true));
  }

  function nextStep(order) {
    const type = order.fulfillment_type || 'pickup';
    if (order.status === 'placed') return { next: 'accepted', label: 'ACCEPT ORDER' };
    if (order.status === 'accepted') return { next: 'preparing', label: 'START PREPARING' };
    if (order.status === 'preparing') return type === 'delivery' ? { next: 'out_for_delivery', label: 'OUT FOR DELIVERY' } : { next: 'ready_for_pickup', label: 'READY FOR PICKUP' };
    if (type === 'delivery' && order.status === 'out_for_delivery') return { next: 'completed', label: 'MARK DELIVERED' };
    if (type !== 'delivery' && order.status === 'ready_for_pickup') return { next: 'completed', label: 'MARK PICKED UP' };
    return null;
  }

  function closeCancellationDialog(reason = null) {
    const dialog = $('cancelOrderDialog');
    if (dialog) dialog.hidden = true;
    const resolve = cancelDialogResolve;
    cancelDialogResolve = null;
    const error = $('cancelOrderDialogError');
    if (error) { error.hidden = true; error.textContent = ''; }
    const textarea = $('cancelOrderReason');
    if (textarea) textarea.disabled = false;
    const submit = $('cancelOrderConfirm');
    if (submit) { submit.disabled = false; submit.textContent = 'Confirm cancellation'; }
    if (resolve) resolve(reason);
  }

  function requestCancellationReason() {
    const dialog = $('cancelOrderDialog');
    const textarea = $('cancelOrderReason');
    const error = $('cancelOrderDialogError');
    if (!dialog || !textarea) {
      showMessage('managedOrdersMessage', 'The cancellation form is missing. Refresh the Staff Orders page and try again.', true);
      return Promise.resolve(null);
    }
    textarea.value = '';
    textarea.disabled = false;
    const submit = $('cancelOrderConfirm');
    if (submit) { submit.disabled = false; submit.textContent = 'Confirm cancellation'; }
    if (error) { error.hidden = true; error.textContent = ''; }
    dialog.hidden = false;
    return new Promise(resolve => {
      cancelDialogResolve = resolve;
      window.setTimeout(() => textarea.focus(), 50);
    });
  }

  function initCancellationDialog() {
    const form = $('cancelOrderForm');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', event => {
      event.preventDefault();
      const reason = String($('cancelOrderReason')?.value || '').trim();
      const error = $('cancelOrderDialogError');
      if (!reason) {
        if (error) { error.textContent = 'Please write a cancellation reason first.'; error.hidden = false; }
        $('cancelOrderReason')?.focus();
        return;
      }
      closeCancellationDialog(reason);
    });
    $('cancelOrderDismiss')?.addEventListener('click', () => closeCancellationDialog(null));
    document.querySelectorAll('[data-cancel-dialog-dismiss]').forEach(button => {
      button.addEventListener('click', () => closeCancellationDialog(null));
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && $('cancelOrderDialog') && !$('cancelOrderDialog').hidden) {
        closeCancellationDialog(null);
      }
    });
  }

  async function updateManagedOrder(id, status, type, receiptOrder = null, receiptItems = []) {
    let rpcName = 'update_pickup_order_status';
    let rpcArgs = { p_order_id: id, p_new_status: status };
    let cancellationReason = '';
    if (status === 'cancelled') {
      const reason = await requestCancellationReason();
      if (reason === null) return;
      cancellationReason = reason.trim();
      if (!cancellationReason) {
        showMessage('managedOrdersMessage', 'Cancellation reason is required. The order was not cancelled.', true);
        return;
      }
      rpcName = 'staff_cancel_pickup_order';
      rpcArgs = { p_order_id: id, p_cancel_reason: cancellationReason };
    } else if (!confirm('Update this order to: ' + statusLabel(status, type).toLowerCase() + '?')) {
      return;
    }
    try {
      const { error } = await sb.rpc(rpcName, rpcArgs);
      if (error) throw error;
      toast(status === 'cancelled' ? 'Order cancelled and reason saved.' : 'Order updated.');

      // Download one receipt image only after the status change is confirmed by Supabase.
      // Keep the existing pickup-completion download and add acceptance/cancellation.
      const shouldDownloadReceipt = ['accepted', 'cancelled', 'completed'].includes(status);
      if (shouldDownloadReceipt && receiptOrder) {
        const receiptSnapshot = {
          ...receiptOrder,
          status,
          ...(status === 'cancelled' ? { cancellation_reason: cancellationReason, cancelled_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString()
        };
        try {
          await downloadOrderReceiptById(receiptSnapshot, receiptItems);
        } catch (receiptError) {
          showMessage(
            'managedOrdersMessage',
            'تم تحديث الأوردر بنجاح، لكن تعذر تنزيل صورة الفاتورة تلقائيًا. يمكنك الضغط على رمز الطابعة أعلى الأوردر لعرض الفاتورة وطباعتها. السبب: ' + (receiptError?.message || 'خطأ غير معروف'),
            true
          );
        }
      }
      await loadManagedOrders();
      await syncLocalOrderArchive(false);
    } catch (error) {
      showMessage('managedOrdersMessage', error?.message || 'Could not update the order.', true);
    }
  }

  async function loadManagedOrders(options = {}) {
    const quiet = options.quiet === true;
    const box = $('managedPickupOrders');
    if (!box) return;
    if (!canViewAllBranchOrders && !assignedStaffLocationId) {
      box.innerHTML = '<div class="pickup-error">This Staff account has no assigned branch. Ask the GM to assign this Staff account to a branch before handling orders.</div>';
      return;
    }
    if (!quiet) box.innerHTML = '<div class="pickup-empty">Loading ' + (canViewAllBranchOrders ? 'all branch orders…' : 'branch orders…') + '</div>';

    const now = Date.now();
    let localRows = [];
    try {
      await localArchiveDeleteExpired();
      localRows = (await localArchiveGetAll()).filter(row =>
        (canViewAllBranchOrders || String(row.location_id) === String(assignedStaffLocationId)) && Number(row.expiresAt) > now
      );
    } catch (_) {
      // The live Supabase list can still be shown if local storage is unavailable.
    }
    const localById = new Map(localRows.map(row => [String(row.id), row]));

    let ordersQuery = sb.from('pickup_orders')
      .select('id,order_number,customer_name,customer_phone,location_id,branch_name,branch_city,branch_address,fulfillment_type,delivery_address,delivery_map_url,delivery_latitude,delivery_longitude,delivery_zone_id,delivery_zone_name,delivery_distance_meters,delivery_fee,total_amount,status,notes,subtotal,currency,cancellation_reason,cancelled_at,created_at,updated_at');
    if (!canViewAllBranchOrders) ordersQuery = ordersQuery.eq('location_id', assignedStaffLocationId);
    const { data, error } = await ordersQuery.order('created_at', { ascending: false }).limit(100);

    let liveOrders = Array.isArray(data) ? data : [];
    if (error && !localRows.length) {
      box.innerHTML = '<div class="pickup-error">Could not load branch orders and no local copies are available. Details: ' + esc(error.message) + '</div>';
      return;
    }
    const liveIds = new Set(liveOrders.map(row => String(row.id)));
    const liveItems = {};
    if (liveOrders.length) {
      const orderIds = liveOrders.map(row => row.id);
      const { data: items, error: itemsError } = await sb.from('pickup_order_items')
        .select('order_id,item_name,quantity,unit_price,line_total').in('order_id', orderIds).order('created_at', { ascending: true });
      if (!itemsError) {
        (items || []).forEach(item => (liveItems[item.order_id] ||= []).push(item));
      }
    }

    // One unified list: live Supabase orders win; local copies are used only if
    // the same order is not in the live response. This avoids showing an order twice.
    const localOnlyOrders = localRows.filter(row => !liveIds.has(String(row.id)));
    const orders = [...liveOrders, ...localOnlyOrders].sort((a, b) => {
      const ta = Date.parse(a.created_at || '') || Number(a.createdAtMs || 0);
      const tb = Date.parse(b.created_at || '') || Number(b.createdAtMs || 0);
      return tb - ta;
    });
    const grouped = { ...liveItems };
    localOnlyOrders.forEach(order => { grouped[order.id] = Array.isArray(order.items) ? order.items : []; });

    if (!orders.length) {
      box.innerHTML = error
        ? '<div class="pickup-error">تعذر الاتصال بـSupabase ولا توجد نسخة محلية صالحة خلال آخر 24 ساعة.</div>'
        : '<div class="pickup-empty">No orders for this branch yet. New orders will appear here once, with their local-copy status.</div>';
      return;
    }

    box.innerHTML = orders.map(order => {
      const id = String(order.id);
      const isLocalOnly = !liveIds.has(id);
      const localCopy = localById.get(id);
      const type = order.fulfillment_type || 'pickup';
      const rows = grouped[order.id] || order.items || [];
      const action = isLocalOnly ? null : nextStep(order);
      const canCancel = !isLocalOnly && ['placed','accepted','preparing'].includes(order.status);
      const createdAt = order.created_at || (order.createdAtMs ? new Date(order.createdAtMs).toISOString() : null);
      const dateLabel = createdAt && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt).toLocaleString() : '—';
      const itemHtml = rows.map(row => {
        const itemName = row.item_name || row.name || 'Item';
        const unit = row.unit_price == null ? ' — price to be confirmed' : ' — ' + money(row.line_total == null ? Number(row.unit_price) * Number(row.quantity || 0) : row.line_total);
        return '<div>• ' + esc(itemName) + ' × ' + Number(row.quantity || 0) + unit + '</div>';
      }).join('');
      const typeBadge = '<span class="fulfillment-badge">' + (type === 'delivery' ? '⌖ DELIVERY' : '⌂ PICKUP') + '</span>';
      const localBadge = localCopy
        ? '<div class="local-copy-inline" title="تُحذف النسخة المحلية تلقائيًا بعد 24 ساعة من إنشاء الأوردر">✓ نسخة محفوظة على الكمبيوتر · ' + esc(localRemainingText(localCopy.expiresAt)) + '</div>'
        : (isLocalOnly ? '<div class="local-copy-inline">نسخة محلية فقط · تعذر عرض الأوردر الأصلي من Supabase</div>' : '<div class="local-copy-inline local-copy-pending">النسخة المحلية قيد التحديث</div>');
      const cancellation = order.status === 'cancelled' && String(order.cancellation_reason || '').trim()
        ? '<div class="pickup-cancellation-reason" role="note" style="margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff0f2;border:1px solid #efc8d0;color:#773b48"><strong>Cancellation reason:</strong> ' + esc(order.cancellation_reason) + '</div>' : '';
      const total = order.total_amount != null ? money(order.total_amount)
        : order.subtotal == null ? 'Confirm with customer' : money(Number(order.subtotal) + Number(order.delivery_fee || 0));
      const orderActionButtons = (action ? '<button class="btn" type="button" data-order-status="' + esc(order.id) + '" data-order-type="' + esc(type) + '" data-next-status="' + esc(action.next) + '">' + esc(action.label) + '</button>' : '') +
        (canCancel ? '<button class="btn danger" type="button" data-order-status="' + esc(order.id) + '" data-order-type="' + esc(type) + '" data-next-status="cancelled">CANCEL ORDER</button>' : '');
      return '<article class="pickup-order-card"><div class="pickup-order-head"><div class="pickup-order-head-main"><div class="pickup-order-number">' + esc(order.order_number || order.id) + '</div><small class="pickup-order-date">' + esc(dateLabel) + '</small></div><div class="pickup-order-head-tools"><span class="pickup-status" data-status="' + esc(order.status) + '">' + esc(statusLabel(order.status, type)) + '</span><button class="pickup-print-icon" type="button" data-print-unified-order="' + esc(order.id) + '" title="طباعة الفاتورة" aria-label="طباعة الفاتورة"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="11" r=".9" fill="currentColor"/></svg></button></div></div>' +
        '<div class="pickup-order-meta">' + typeBadge + '<br><strong>' + esc(order.customer_name || 'Customer') + '</strong>' + (order.customer_phone ? ' · ' + esc(order.customer_phone) : '') + '<br><strong>Handling branch: ' + esc(order.branch_name || '—') + '</strong>' + (order.branch_city ? ' · ' + esc(order.branch_city) : '') + (order.branch_address ? '<br>Branch address: ' + esc(order.branch_address) : '') +
        deliveryDetailsHtml(order, true) + (order.notes ? '<br>Customer note: ' + esc(order.notes) : '') + cancellation + localBadge + '</div>' +
        '<div class="pickup-order-items">' + (itemHtml || '<small>No saved item details are available for this order.</small>') + '</div><div class="pickup-order-footer"><div class="pickup-order-total">Order total<strong>' + esc(total) + '</strong></div></div>' +
        (orderActionButtons ? '<div class="pickup-next-actions">' + orderActionButtons + '</div>' : '') + '</article>';
    }).join('');

    box.querySelectorAll('[data-order-status]').forEach(button => button.addEventListener('click', () => {
      const selectedOrder = orders.find(row => String(row.id) === String(button.dataset.orderStatus));
      const selectedItems = selectedOrder ? (grouped[selectedOrder.id] || selectedOrder.items || []) : [];
      return updateManagedOrder(button.dataset.orderStatus, button.dataset.nextStatus, button.dataset.orderType, selectedOrder, selectedItems);
    }));
    box.querySelectorAll('[data-print-unified-order]').forEach(button => {
      button.addEventListener('click', async () => {
        const order = orders.find(row => String(row.id) === String(button.dataset.printUnifiedOrder));
        if (!order) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.title = 'جارٍ تجهيز الفاتورة للطباعة…';
        try {
          await printOrderReceiptPng(order, grouped[order.id] || order.items || []);
        } catch (error) {
          showMessage('managedOrdersMessage', 'تعذر تجهيز الفاتورة للطباعة: ' + (error?.message || 'خطأ غير معروف'), true);
        } finally {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.title = 'طباعة الفاتورة';
        }
      });
    });
  }

  async function initCustomerOrderHistory() {
    const profile = await guardRole(['customer']);
    if (!profile) return;
    $('refreshPickupOrdersBtn')?.addEventListener('click', loadCustomerOrders);
    await loadCustomerOrders();
  }

  async function initCustomerOrders() {
    const profile = await guardRole(['customer']);
    if (!profile) return;
    // Draw the local basket immediately. If it is empty, do not fetch checkout-only data.
    renderCart();
    if (readCart().length) {
      await loadBranches();
      renderCart();
    }
    $('pickupOrderForm')?.addEventListener('submit', submitCustomerOrder);
    $('customerShareLocationBtn')?.addEventListener('click', shareCustomerLocation);
    // Checkout is pickup-only for the current release; delivery UI and routing are not initialized.
    updateFulfillmentUI();
    // Order history is loaded separately on customer-order-history.html, not on checkout.
  }

  async function initStaffOrders() {
    const profile = await guardRole(['staff', 'gm', 'admin']);
    if (!profile) return;
    canViewAllBranchOrders = ['gm', 'admin'].includes(String(profile.role || '').toLowerCase());
    if (!canViewAllBranchOrders && profile.role !== 'staff') {
      showMessage('managedOrdersMessage', 'Order access is available to active Staff, GM, and Admin accounts.', true);
      return;
    }
    assignedStaffLocationId = canViewAllBranchOrders ? null : (profile.location_id || null);
    if (!canViewAllBranchOrders && !assignedStaffLocationId) {
      try {
        const { data: authData } = await sb.auth.getUser(), uid = authData?.user?.id;
        if (uid) {
          const { data: ownProfile } = await sb.from('profiles').select('location_id,role,is_active').eq('id', uid).maybeSingle();
          if (ownProfile?.role === 'staff' && ownProfile.is_active) assignedStaffLocationId = ownProfile.location_id || null;
        }
      } catch (_) {}
    }
    initCancellationDialog();
    bindLocalArchiveControls();
    await renderLocalOrderArchive().catch(() => {});
    $('refreshManagedOrdersBtn')?.addEventListener('click', async () => {
      await loadManagedOrders();
      await syncLocalOrderArchive(false);
    });
    await Promise.allSettled([loadManagedOrders(), syncLocalOrderArchive(true)]);
    if (localArchivePollTimer) window.clearInterval(localArchivePollTimer);
    localArchivePollTimer = window.setInterval(async () => {
      if (document.visibilityState === 'hidden') return;
      await Promise.allSettled([loadManagedOrders({ quiet: true }), syncLocalOrderArchive(false)]);
    }, LOCAL_ARCHIVE_SYNC_MS);
    if (localArchiveCleanupTimer) window.clearInterval(localArchiveCleanupTimer);
    localArchiveCleanupTimer = window.setInterval(async () => {
      try {
        const deleted = await localArchiveDeleteExpired();
        if (deleted) {
          await renderLocalOrderArchive();
          await loadManagedOrders({ quiet: true });
        }
      } catch (_) {}
    }, 5000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncLocalOrderArchive(false);
    });
    window.addEventListener('beforeunload', () => {
      if (localArchivePollTimer) window.clearInterval(localArchivePollTimer);
      if (localArchiveCleanupTimer) window.clearInterval(localArchiveCleanupTimer);
    }, { once: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (page === 'customer-menu') updateCartDock();
    if (page === 'customer-orders') initCustomerOrders().catch(error => showMessage('pickupCheckoutMessage', error?.message || 'Could not initialize the order page.', true));
    if (page === 'customer-order-history') initCustomerOrderHistory().catch(error => showMessage('pickupOrdersMessage', error?.message || 'Could not load order history.', true));
    if (page === 'staff-orders') initStaffOrders().catch(error => showMessage('managedOrdersMessage', error?.message || 'Could not load branch orders.', true));
  });
})();
