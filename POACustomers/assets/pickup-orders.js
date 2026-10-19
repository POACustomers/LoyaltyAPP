(function () {
  'use strict';

  const CART_KEY = 'poa_pickup_cart_v1';
  const BRANCH_KEY = 'poa_customer_order_branch_v1';
  const page = document.body.dataset.page || '';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let assignedStaffLocationId = null;

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
    return '<div class="pickup-delivery-details"><span class="fulfillment-badge">⌖ DELIVERY</span><br><strong>Delivery address:</strong> ' + esc(order.delivery_address || 'Address not recorded') +
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

  function updateCartDock() {
    if (page !== 'customer-menu') return;
    let dock = $('pickupCartDock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'pickupCartDock';
      dock.className = 'pickup-cart-dock';
      dock.hidden = true;
      dock.innerHTML = '<div class="pickup-cart-dock-copy"><strong id="pickupCartDockCount">Your order</strong><small id="pickupCartDockSub">Pickup or delivery at checkout</small></div><a class="btn" href="customer-orders.html">View order</a>';
      document.body.appendChild(dock);
    }
    const cart = readCart();
    dock.hidden = cart.length === 0;
    if ($('pickupCartDockCount')) $('pickupCartDockCount').textContent = 'Your order · ' + quantityCount(cart) + (quantityCount(cart) === 1 ? ' item' : ' items');
    const calc = calculate(cart);
    if ($('pickupCartDockSub')) $('pickupCartDockSub').textContent = calc.known ? money(calc.total) + ' · Pickup or delivery' : 'Final price confirmed by branch · Pickup or delivery';
  }

  function renderCart() {
    const list = $('pickupCartList'), summary = $('pickupCartSummary'), submit = $('placePickupOrderBtn'), cart = readCart();
    if (!list) return;
    if (!cart.length) {
      list.innerHTML = '<div class="pickup-empty">Your basket is empty. Open Menu and add the items you want to order.</div>';
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
      return '<article class="pickup-cart-row">' + image + '<div class="pickup-cart-details"><strong>' + esc(item.name) + '</strong><small>' + esc(priceText) + '</small>' +
        '<div class="pickup-qty"><button type="button" data-qty-minus="' + esc(item.id) + '" aria-label="Decrease quantity">−</button><b>' + Number(item.quantity) + '</b><button type="button" data-qty-plus="' + esc(item.id) + '" aria-label="Increase quantity">+</button><button type="button" class="pickup-remove" data-remove-item="' + esc(item.id) + '">Remove</button></div></div>' +
        '<strong class="pickup-price">' + (price === null ? 'TBC' : money(price * Number(item.quantity))) + '</strong></article>';
    }).join('');
    list.querySelectorAll('[data-qty-minus]').forEach(button => button.addEventListener('click', () => changeQuantity(button.dataset.qtyMinus, -1)));
    list.querySelectorAll('[data-qty-plus]').forEach(button => button.addEventListener('click', () => changeQuantity(button.dataset.qtyPlus, 1)));
    list.querySelectorAll('[data-remove-item]').forEach(button => button.addEventListener('click', () => { writeCart(readCart().filter(row => String(row.id) !== String(button.dataset.removeItem))); renderCart(); }));
    const calc = calculate(cart);
    if (summary) summary.innerHTML = '<div class="pickup-summary-row"><span>Items</span><strong>' + quantityCount(cart) + '</strong></div>' +
      '<div class="pickup-summary-row"><span>Order total</span><strong>' + (calc.known ? money(calc.total) : 'To be confirmed by branch') + '</strong></div>' +
      (!calc.known ? '<div class="pickup-note">One or more items do not have a published price. You can still send the order; branch Staff will confirm the final amount.</div>' : '<div class="pickup-note">Choose pickup or delivery at checkout. No online payment is taken in this flow.</div>');
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

  function refreshPlaceButton() {
    const btn = $('placePickupOrderBtn');
    if (btn && !btn.dataset.sending) btn.disabled = !readCart().length || !$('pickupBranch')?.value;
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
    if (panel) panel.hidden = !delivery;
    const address = $('deliveryAddress');
    if (address) address.required = delivery;
    const btn = $('placePickupOrderBtn');
    if (btn && !btn.dataset.sending) btn.textContent = delivery ? 'PLACE DELIVERY ORDER' : 'PLACE PICKUP ORDER';
    refreshPlaceButton();
  }
  function useMyLocation() {
    const button = $('useMyLocationBtn');
    if (!navigator.geolocation) { setLocationStatus('Location is not available in this browser. Paste a Google Maps link instead.', 'error'); return; }
    if (button) { button.disabled = true; button.textContent = 'GETTING LOCATION…'; }
    setLocationStatus('Waiting for your device location permission…');
    navigator.geolocation.getCurrentPosition(position => {
      const lat = Number(position.coords.latitude), lng = Number(position.coords.longitude);
      $('deliveryLatitude').value = String(lat);
      $('deliveryLongitude').value = String(lng);
      $('deliveryMapUrl').value = 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng);
      setLocationStatus('Your current location is attached to this order.', 'success');
      if (button) { button.disabled = false; button.textContent = '⌖ UPDATE MY LOCATION'; }
    }, error => {
      const message = error && error.code === 1 ? 'Location permission was denied. Paste a Google Maps link instead.' : 'Could not get location. Check device location and try again, or paste a Maps link.';
      setLocationStatus(message, 'error');
      if (button) { button.disabled = false; button.textContent = '⌖ USE MY CURRENT LOCATION'; }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  function deliveryPayloadOrError() {
    if (fulfillmentType() !== 'delivery') return { type: 'pickup', address: null, mapUrl: null, latitude: null, longitude: null };
    const address = $('deliveryAddress')?.value.trim() || '';
    const mapInput = $('deliveryMapUrl')?.value.trim() || '';
    const latText = $('deliveryLatitude')?.value || '', lngText = $('deliveryLongitude')?.value || '';
    const latitude = latText === '' ? null : Number(latText);
    const longitude = lngText === '' ? null : Number(lngText);
    if (!address) { showMessage('pickupCheckoutMessage', 'Enter the full delivery address.', true); $('deliveryAddress')?.focus(); return null; }
    if ((latitude === null) !== (longitude === null)) { showMessage('pickupCheckoutMessage', 'The map location is incomplete. Use current location again or paste a Google Maps link.', true); return null; }
    if (latitude !== null && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
      showMessage('pickupCheckoutMessage', 'The map coordinates are invalid. Select your current location or paste a valid map link.', true); return null;
    }
    const mapUrl = validMapUrl(mapInput);
    if (mapInput && !mapUrl) { showMessage('pickupCheckoutMessage', 'Paste a valid Google Maps link starting with https://.', true); $('deliveryMapUrl')?.focus(); return null; }
    if (latitude === null && !mapUrl) { showMessage('pickupCheckoutMessage', 'Delivery needs a map location. Press “Use my current location” or paste a Google Maps share link.', true); $('useMyLocationBtn')?.focus(); return null; }
    return { type: 'delivery', address, mapUrl: mapUrl || ('https://www.google.com/maps?q=' + encodeURIComponent(latitude + ',' + longitude)), latitude, longitude };
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

  function showMessage(id, text, isError) {
    const box = $(id);
    if (!box) return;
    box.hidden = !text;
    box.className = isError ? 'pickup-error' : 'pickup-success';
    box.textContent = text || '';
  }

  async function submitCustomerOrder(event) {
    event.preventDefault();
    const cart = readCart(), branchId = $('pickupBranch')?.value;
    if (!cart.length) { showMessage('pickupCheckoutMessage', 'Your basket is empty.', true); return; }
    if (!branchId) { showMessage('pickupCheckoutMessage', 'Choose the branch that will handle your order.', true); $('pickupBranch')?.focus(); return; }
    const delivery = deliveryPayloadOrError();
    if (!delivery) return;

    const button = $('placePickupOrderBtn');
    button.dataset.sending = 'true'; button.disabled = true; button.textContent = 'SENDING ORDER…';
    showMessage('pickupCheckoutMessage', '', false);
    try {
      const { data, error } = await sb.rpc('place_customer_order', {
        p_location_id: branchId,
        p_items: cart.map(row => ({ item_id: row.id, quantity: Number(row.quantity) })),
        p_fulfillment_type: delivery.type,
        p_delivery_address: delivery.address,
        p_delivery_map_url: delivery.mapUrl,
        p_delivery_latitude: delivery.latitude,
        p_delivery_longitude: delivery.longitude,
        p_notes: $('pickupOrderNotes')?.value?.trim() || null
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result || !result.order_number) throw new Error('The branch did not return an order number. Refresh your order history before trying again.');
      localStorage.removeItem(CART_KEY);
      if ($('pickupOrderNotes')) $('pickupOrderNotes').value = '';
      const fulfillment = result.fulfillment_type === 'delivery' ? 'delivery to your location' : 'pickup from the selected branch';
      showMessage('pickupCheckoutMessage', 'Order sent successfully. Order number: ' + result.order_number + '. Method: ' + fulfillment + '. Branch Staff will update its status.', false);
      renderCart();
      await loadCustomerOrders();
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
      .select('id,order_number,customer_name,location_id,branch_name,branch_city,branch_address,fulfillment_type,delivery_address,delivery_map_url,delivery_latitude,delivery_longitude,status,notes,subtotal,currency,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(25);
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
        deliveryDetailsHtml(order, false) + (order.notes ? '<br>Note: ' + esc(order.notes) : '') + '</div>' +
        '<div class="pickup-order-items">' + itemHtml + '</div><div class="pickup-order-footer"><div class="pickup-order-total">Order total<strong>' + (order.subtotal === null ? 'To be confirmed by branch' : money(order.subtotal)) + '</strong></div>' +
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
    if (!confirm('Update this order to: ' + statusLabel(status, type).toLowerCase() + '?')) return;
    try {
      const { error } = await sb.rpc('update_pickup_order_status', { p_order_id: id, p_new_status: status });
      if (error) throw error;
      toast('Order updated.');
      await loadManagedOrders();
    } catch (error) { showMessage('managedOrdersMessage', error?.message || 'Could not update the order.', true); }
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
      .select('id,order_number,customer_name,customer_phone,location_id,branch_name,branch_city,branch_address,fulfillment_type,delivery_address,delivery_map_url,delivery_latitude,delivery_longitude,status,notes,subtotal,currency,created_at')
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
        deliveryDetailsHtml(order, true) + (order.notes ? '<br>Customer note: ' + esc(order.notes) : '') + '</div>' +
        '<div class="pickup-order-items">' + itemHtml + '</div><div class="pickup-order-footer"><div class="pickup-order-total">Order total<strong>' + (order.subtotal === null ? 'Confirm with customer' : money(order.subtotal)) + '</strong></div></div>' +
        '<div class="pickup-next-actions">' + (action ? '<button class="btn" type="button" data-order-status="' + esc(order.id) + '" data-order-type="' + esc(type) + '" data-next-status="' + esc(action.next) + '">' + esc(action.label) + '</button>' : '') +
        (canCancel ? '<button class="btn danger" type="button" data-order-status="' + esc(order.id) + '" data-order-type="' + esc(type) + '" data-next-status="cancelled">CANCEL ORDER</button>' : '') + '</div></article>';
    }).join('');
    box.querySelectorAll('[data-order-status]').forEach(button => button.addEventListener('click', () => updateManagedOrder(button.dataset.orderStatus, button.dataset.nextStatus, button.dataset.orderType)));
  }

  async function initCustomerOrders() {
    const profile = await guardRole(['customer']);
    if (!profile) return;
    await loadBranches();
    renderCart();
    $('pickupOrderForm')?.addEventListener('submit', submitCustomerOrder);
    $('orderFulfillmentType')?.addEventListener('change', updateFulfillmentUI);
    $('useMyLocationBtn')?.addEventListener('click', useMyLocation);
    $('deliveryMapUrl')?.addEventListener('input', () => {
      const value = $('deliveryMapUrl').value.trim();
      if (value) {
        $('deliveryLatitude').value = '';
        $('deliveryLongitude').value = '';
        setLocationStatus(validMapUrl(value) ? 'Google Maps link added. The branch can open this location.' : 'Paste a valid Google Maps share link.', validMapUrl(value) ? 'success' : 'error');
      } else setLocationStatus('Choose your map location so the branch can find you.');
    });
    updateFulfillmentUI();
    $('clearPickupCartBtn')?.addEventListener('click', () => { if (!confirm('Clear all items from your basket?')) return; writeCart([]); renderCart(); });
    $('refreshPickupOrdersBtn')?.addEventListener('click', loadCustomerOrders);
    await loadCustomerOrders();
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
    if (page === 'staff-orders') initStaffOrders().catch(error => showMessage('managedOrdersMessage', error?.message || 'Could not load branch orders.', true));
  });
})();
