(function () {
  'use strict';

  const CART_KEY = 'poa_pickup_cart_v1';
  // Do not accept discounted offer orders until the Supabase order RPC validates and stores the promotion server-side.
  const OFFER_DISCOUNT_BACKEND_READY = window.POA_OFFER_DISCOUNT_BACKEND_READY === true;
  const BRANCH_KEY = 'poa_customer_order_branch_v1';
  const page = document.body.dataset.page || '';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let assignedStaffLocationId = null;
  let savedDeliveryAddresses = [];
  let selectedDeliveryInstructions = '';
  let selectedSavedAddressText = '';
  let activeBranches = [];
  let resolvedDeliveryRoute = null;

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
  function fulfillmentType() { return $('orderFulfillmentType')?.value === 'delivery' ? 'delivery' : 'pickup'; }
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
      (hasOfferDiscount ? '<div class="pickup-note">Discount applies to products only. The delivery fee is calculated separately and is not discounted.</div>' : '');
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
      const notes = [delivery.instructions ? 'Delivery instructions: ' + delivery.instructions : '', $('pickupOrderNotes')?.value?.trim() ? 'Order note: ' + $('pickupOrderNotes').value.trim() : ''].filter(Boolean).join(' | ').slice(0, 500) || null;
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
      .select('id,order_number,customer_name,location_id,branch_name,branch_city,branch_address,fulfillment_type,delivery_address,delivery_map_url,delivery_latitude,delivery_longitude,delivery_zone_id,delivery_zone_name,delivery_distance_meters,delivery_fee,total_amount,status,notes,subtotal,currency,created_at,updated_at')
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
        deliveryDetailsHtml(order, false) + (order.notes ? '<br>Note: ' + esc(order.notes) : '') + (order.cancellation_reason ? '<br><strong>Cancellation reason:</strong> ' + esc(order.cancellation_reason) : '') + '</div>' +
        '<div class="pickup-order-items">' + itemHtml + '</div><div class="pickup-order-footer"><div class="pickup-order-total">Order total<strong>' + (order.total_amount != null ? money(order.total_amount) : order.subtotal === null ? 'To be confirmed by branch' : money(Number(order.subtotal) + Number(order.delivery_fee || 0))) + '</strong></div>' +
        (canCancel ? '<button class="btn danger" type="button" data-cancel-order="' + esc(order.id) + '">Cancel order</button>' : '') + '</div></article>';
    }).join('');
    box.querySelectorAll('[data-cancel-order]').forEach(button => button.addEventListener('click', () => cancelCustomerOrder(button.dataset.cancelOrder)));
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

  async function updateManagedOrder(id, status, type) {
    let cancellationReason = '';
    if (status === 'cancelled') {
      cancellationReason = window.prompt('Required: enter the reason for cancelling this order:');
      if (cancellationReason === null) return;
      cancellationReason = cancellationReason.trim();
      if (!cancellationReason) { showMessage('managedOrdersMessage', 'Cancellation reason is required.', true); return; }
      if (!confirm('Cancel this order and save the reason?')) return;
    } else if (!confirm('Update this order to: ' + statusLabel(status, type).toLowerCase() + '?')) return;
    try {
      const result = status === 'cancelled'
        ? await sb.rpc('cancel_pickup_order_with_reason', { p_order_id: id, p_reason: cancellationReason })
        : await sb.rpc('update_pickup_order_status', { p_order_id: id, p_new_status: status });
      if (result.error) throw result.error;
      toast(status === 'cancelled' ? 'Order cancelled and reason saved.' : 'Order updated.');
      await loadManagedOrders();
    } catch (error) { showMessage('managedOrdersMessage', error?.message || 'Could not update the order. Apply the cancellation-reason SQL patch in Supabase first.', true); }
  }

  async function loadManagedOrders() {
    const box = $('managedPickupOrders');
    if (!box) return;
    if (!assignedStaffLocationId) {
      box.innerHTML = '<div class="pickup-error">This Staff account has no assigned branch. Ask the GM to assign this Staff account to a branch before handling orders.</div>';
      return;
    }
    box.innerHTML = '<div class="pickup-empty">Loading branch orders…</div>';
    const { data, error } = await sb.from('pickup_orders')
      .select('id,order_number,customer_name,customer_phone,location_id,branch_name,branch_city,branch_address,fulfillment_type,delivery_address,delivery_map_url,delivery_latitude,delivery_longitude,delivery_zone_id,delivery_zone_name,delivery_distance_meters,delivery_fee,total_amount,status,notes,subtotal,currency,created_at')
      .eq('location_id', assignedStaffLocationId).order('created_at', { ascending: false }).limit(100);
    if (error) { box.innerHTML = '<div class="pickup-error">Could not load branch orders. Run the order setup SQL in Supabase. Details: ' + esc(error.message) + '</div>'; return; }
    const orders = Array.isArray(data) ? data : [];
    if (!orders.length) { box.innerHTML = '<div class="pickup-empty">No orders for this branch yet. New pickup and delivery orders will appear here.</div>'; return; }
    const orderIds = orders.map(row => row.id);
    const { data: items, error: itemsError } = await sb.from('pickup_order_items').select('order_id,item_name,quantity,unit_price,line_total').in('order_id', orderIds).order('created_at', { ascending: true });
    if (itemsError) { box.innerHTML = '<div class="pickup-error">Could not load order items: ' + esc(itemsError.message) + '</div>'; return; }
    const grouped = {};
    (items || []).forEach(item => (grouped[item.order_id] ||= []).push(item));
    box.innerHTML = orders.map(order => {
      const type = order.fulfillment_type || 'pickup', rows = grouped[order.id] || [], action = nextStep(order), canCancel = ['placed','accepted','preparing'].includes(order.status);
      const itemHtml = rows.map(row => '<div>• ' + esc(row.item_name) + ' × ' + Number(row.quantity) + (row.unit_price === null ? ' — price to be confirmed' : ' — ' + money(row.line_total)) + '</div>').join('');
      const typeBadge = '<span class="fulfillment-badge">' + (type === 'delivery' ? '⌖ DELIVERY' : '⌂ PICKUP') + '</span>';
      return '<article class="pickup-order-card"><div class="pickup-order-head"><div><div class="pickup-order-number">' + esc(order.order_number) + '</div><small class="pickup-order-date">' + esc(new Date(order.created_at).toLocaleString()) + '</small></div><span class="pickup-status" data-status="' + esc(order.status) + '">' + esc(statusLabel(order.status, type)) + '</span></div>' +
        '<div class="pickup-order-meta">' + typeBadge + '<br><strong>' + esc(order.customer_name || 'Customer') + '</strong>' + (order.customer_phone ? ' · ' + esc(order.customer_phone) : '') + '<br><strong>Handling branch: ' + esc(order.branch_name) + '</strong>' + (order.branch_city ? ' · ' + esc(order.branch_city) : '') + (order.branch_address ? '<br>Branch address: ' + esc(order.branch_address) : '') +
        deliveryDetailsHtml(order, true) + (order.notes ? '<br>Customer note: ' + esc(order.notes) : '') + (order.cancellation_reason ? '<br><strong>Cancellation reason:</strong> ' + esc(order.cancellation_reason) : '') + '</div>' +
        '<div class="pickup-order-items">' + itemHtml + '</div><div class="pickup-order-footer"><div class="pickup-order-total">Order total<strong>' + (order.total_amount != null ? money(order.total_amount) : order.subtotal === null ? 'Confirm with customer' : money(Number(order.subtotal) + Number(order.delivery_fee || 0))) + '</strong></div></div>' +
        '<div class="pickup-next-actions">' + (action ? '<button class="btn" type="button" data-order-status="' + esc(order.id) + '" data-order-type="' + esc(type) + '" data-next-status="' + esc(action.next) + '">' + esc(action.label) + '</button>' : '') +
        (canCancel ? '<button class="btn danger" type="button" data-order-status="' + esc(order.id) + '" data-order-type="' + esc(type) + '" data-next-status="cancelled">CANCEL ORDER</button>' : '') + '</div></article>';
    }).join('');
    box.querySelectorAll('[data-order-status]').forEach(button => button.addEventListener('click', () => updateManagedOrder(button.dataset.orderStatus, button.dataset.nextStatus, button.dataset.orderType)));
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
      await loadSavedDeliveryAddresses();
      renderCart();
    }
    $('pickupOrderForm')?.addEventListener('submit', submitCustomerOrder);
    $('orderFulfillmentType')?.addEventListener('change', updateFulfillmentUI);
    $('useMyLocationBtn')?.addEventListener('click', useMyLocation);
    $('deliveryAddress')?.addEventListener('input', () => {
      if ($('deliveryAddress').value.trim() !== selectedSavedAddressText) selectedDeliveryInstructions = '';
    });
    updateFulfillmentUI();
    // Order history is loaded separately on customer-order-history.html, not on checkout.
  }

  async function initStaffOrders() {
    const profile = await guardRole(['staff']);
    if (!profile) return;
    if (profile.role !== 'staff') {
      showMessage('managedOrdersMessage', 'Order handling is restricted to Staff accounts assigned to a branch.', true);
      return;
    }
    assignedStaffLocationId = profile.location_id || null;
    if (!assignedStaffLocationId) {
      try {
        const { data: authData } = await sb.auth.getUser(), uid = authData?.user?.id;
        if (uid) {
          const { data: ownProfile } = await sb.from('profiles').select('location_id,role,is_active').eq('id', uid).maybeSingle();
          if (ownProfile?.role === 'staff' && ownProfile.is_active) assignedStaffLocationId = ownProfile.location_id || null;
        }
      } catch (_) {}
    }
    $('refreshManagedOrdersBtn')?.addEventListener('click', loadManagedOrders);
    await loadManagedOrders();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (page === 'customer-menu') updateCartDock();
    if (page === 'customer-orders') initCustomerOrders().catch(error => showMessage('pickupCheckoutMessage', error?.message || 'Could not initialize the order page.', true));
    if (page === 'customer-order-history') initCustomerOrderHistory().catch(error => showMessage('pickupOrdersMessage', error?.message || 'Could not load order history.', true));
    if (page === 'staff-orders') initStaffOrders().catch(error => showMessage('managedOrdersMessage', error?.message || 'Could not load branch orders.', true));
  });
})();
