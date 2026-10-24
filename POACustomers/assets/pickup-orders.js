(function () {
  'use strict';

  const CART_KEY = 'poa_pickup_cart_v1';
  const BRANCH_KEY = 'poa_customer_order_branch_v1';
  const page = document.body.dataset.page || '';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let assignedStaffLocationId = null;
  let savedDeliveryAddresses = [];
  let selectedDeliveryInstructions = '';
  let selectedSavedAddressText = '';
  let activeBranches = [];
  let deliveryZones = [];
  let resolvedZoneDistanceKm = null;

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
      ? 'Area: ' + String(result.delivery_zone_name || 'Selected delivery area') + '. Routed to ' + String(result.branch_name || 'the assigned branch') + '. Delivery fee: ' + money(result.delivery_fee ?? 0) + '. Branch Staff will update the order status.'
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
      return '<article class="pickup-cart-row">' + image + '<div class="pickup-cart-details"><strong>' + esc(item.name) + '</strong><small>' + esc(priceText) + '</small>' +
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

  function selectedZone() {
    const id = $('deliveryZone')?.value || '';
    return deliveryZones.find(zone => String(zone.id) === String(id)) || null;
  }
  function updateZoneSummary(zone, distanceKm, isError) {
    const box = $('deliveryZoneSummary');
    if (!box) return;
    if (!zone) {
      box.hidden = true;
      box.innerHTML = '';
      box.classList.remove('error');
      return;
    }
    const branch = activeBranches.find(row => String(row.id) === String(zone.location_id));
    const branchName = zone.branch_name || branch?.name || 'Assigned branch';
    const areaName = zone.zone_name || zone.name || 'Delivery area';
    const fee = zone.delivery_fee == null ? 0 : Number(zone.delivery_fee);
    const minimum = zone.minimum_order_amount == null ? 0 : Number(zone.minimum_order_amount);
    const distance = Number.isFinite(Number(distanceKm)) ? '<span class="delivery-zone-chip">Distance ' + esc(Number(distanceKm).toFixed(2)) + ' km</span>' : '';
    box.innerHTML = '<div class="delivery-zone-heading"><strong>' + esc(isError ? 'Delivery area unavailable' : areaName) + '</strong>' +
      (!isError ? '<span class="delivery-zone-route">· ' + esc(branchName) + '</span>' : '') + '</div>' +
      (isError ? '<span class="delivery-zone-route">' + esc(zone.message || 'Outside delivery area.') + '</span>' :
      '<div class="delivery-zone-facts"><span class="delivery-zone-chip">Fee ' + esc(money(fee)) + '</span><span class="delivery-zone-chip">Min. ' + esc(money(minimum)) + '</span>' + distance + '</div>');
    box.hidden = false;
    box.classList.toggle('error', !!isError);
  }
  function updateOrderSummary() {
    const summary = $('pickupCartSummary');
    if (!summary) return;
    const cart = readCart(), calc = calculate(cart), delivery = fulfillmentType() === 'delivery', zone = delivery ? selectedZone() : null;
    const subtotalText = calc.known ? money(calc.total) : 'To be confirmed by branch';
    let html = '<div class="pickup-summary-row"><span>Items</span><strong>' + quantityCount(cart) + '</strong></div>' +
      '<div class="pickup-summary-row"><span>Items subtotal</span><strong>' + subtotalText + '</strong></div>';
    if (delivery && !zone) {
      html += '<div class="pickup-note">Choose your current location or select a saved address with a map pin. The correct area and branch will be assigned automatically.</div>';
    }
    if (delivery && zone) {
      const fee = Number(zone.delivery_fee || 0), minimum = Number(zone.minimum_order_amount || 0);
      html += '<div class="pickup-summary-row"><span>Delivery fee · ' + esc(zone.name) + '</span><strong>' + esc(money(fee)) + '</strong></div>' +
        '<div class="pickup-summary-row"><span>Estimated total</span><strong>' + (calc.known ? esc(money(calc.total + fee)) : 'To be confirmed by branch') + '</strong></div>';
      if (calc.known && calc.total < minimum) html += '<div class="pickup-error">Minimum item subtotal for this area is ' + esc(money(minimum)) + '. Add ' + esc(money(minimum - calc.total)) + ' more to continue.</div>';
      else if (!calc.known && minimum > 0) html += '<div class="pickup-error">This area has a minimum order, but one or more menu items have no published price. The minimum cannot be verified. Ask the branch to confirm prices before delivery.</div>';
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
    const cart = readCart(), delivery = fulfillmentType() === 'delivery', zone = delivery ? selectedZone() : null;
    const calc = calculate(cart);
    const minimumValue = Number(zone?.minimum_order_amount || 0);
    const minimumNotMet = !!(delivery && zone && (calc.known ? calc.total < minimumValue : minimumValue > 0));
    btn.disabled = !cart.length || (delivery ? !zone : !$('pickupBranch')?.value) || minimumNotMet;
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
    if ($('deliveryZone')) $('deliveryZone').required = delivery;
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
          $('deliveryZone').value = '';
          resolvedZoneDistanceKm = null;
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
      $('deliveryZone').value = '';
      resolvedZoneDistanceKm = null;
      updateZoneSummary(null);
      setLocationStatus('This address has no map pin. Choose another address or update your location.', 'error');
    }
    updateOrderSummary();
    refreshPlaceButton();
  }

  function deliveryPayloadOrError() {
    if (fulfillmentType() !== 'delivery') return { type: 'pickup', address: null, mapUrl: null, latitude: null, longitude: null, instructions: null, zoneId: null };
    const zone = selectedZone();
    if (!zone) { showMessage('pickupCheckoutMessage', 'Choose a delivery area or use your GPS location to find the area serving you.', true); $('deliveryZone')?.focus(); return null; }
    const address = $('deliveryAddress')?.value.trim() || '';
    const mapInput = $('deliveryMapUrl')?.value.trim() || '';
    const latText = $('deliveryLatitude')?.value || '', lngText = $('deliveryLongitude')?.value || '';
    const latitude = latText === '' ? null : Number(latText);
    const longitude = lngText === '' ? null : Number(lngText);
    if ((latitude === null) !== (longitude === null)) { showMessage('pickupCheckoutMessage', 'The map location is incomplete. Use current location again or paste a Google Maps link.', true); return null; }
    if (latitude !== null && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
      showMessage('pickupCheckoutMessage', 'The map coordinates are invalid. Select your current location or paste a valid map link.', true); return null;
    }
    if (latitude === null || longitude === null) {
      showMessage('pickupCheckoutMessage', 'Automatic branch routing requires a saved map pin. Use your current location or choose an address with a map pin from My Profile. A text address or link alone cannot reliably assign the correct branch.', true);
      $('useMyLocationBtn')?.focus();
      return null;
    }
    const mapUrl = validMapUrl(mapInput);
    if (mapInput && !mapUrl) { showMessage('pickupCheckoutMessage', 'The saved map link is invalid. Re-select the location or update the saved address.', true); return null; }
    const resolvedMapUrl = mapUrl || 'https://www.google.com/maps?q=' + encodeURIComponent(latitude + ',' + longitude);
    return { type: 'delivery', address: address || null, mapUrl: resolvedMapUrl, latitude, longitude, instructions: address === selectedSavedAddressText ? selectedDeliveryInstructions : null, zoneId: zone.id };
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

  async function loadDeliveryZones() {
    const select = $('deliveryZone');
    if (!select) return;
    select.innerHTML = '<option value="">Loading delivery areas…</option>';
    select.disabled = true;
    try {
      const { data, error } = await sb.from('delivery_zones')
        .select('id,name,area_description,location_id,center_latitude,center_longitude,radius_km,delivery_fee,minimum_order_amount,is_active')
        .eq('is_active', true).order('name');
      if (error) throw error;
      const activeIds = new Set(activeBranches.map(row => String(row.id)));
      deliveryZones = (Array.isArray(data) ? data : []).filter(zone => zone && zone.id && activeIds.has(String(zone.location_id)));
      if (!deliveryZones.length) {
        select.innerHTML = '<option value="">No active delivery areas configured</option>';
        setLocationStatus('Delivery areas are not available yet. Please try pickup.', 'error');
        return;
      }
      select.innerHTML = '<option value="">Choose your area</option>' + deliveryZones.map(zone => {
        const branch = activeBranches.find(row => String(row.id) === String(zone.location_id));
        const area = zone.area_description ? ' — ' + zone.area_description : '';
        const label = zone.name + area + ' · ' + (branch?.name || 'Branch') + ' · fee ' + money(zone.delivery_fee);
        return '<option value="' + esc(zone.id) + '">' + esc(label) + '</option>';
      }).join('');
      // This is an informational field, not a customer-controlled branch selector.
      // The server resolves the matching zone from coordinates and fills the field automatically.
      updateOrderSummary();
      refreshPlaceButton();
    } catch (error) {
      deliveryZones = [];
      select.innerHTML = '<option value="">Delivery areas unavailable</option>';
      setLocationStatus('Could not load delivery areas. Please try again later.', 'error');
    }
  }

  async function resolveDeliveryZoneForCoordinates(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setLocationStatus('The map location is invalid. Select your current location again.', 'error');
      $('deliveryZone').value = '';
      updateZoneSummary(null);
      updateOrderSummary();
      refreshPlaceButton();
      return;
    }
    try {
      const { data, error } = await sb.rpc('resolve_delivery_zone', { p_lat: latitude, p_lng: longitude });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result || result.covered !== true) {
        $('deliveryZone').value = '';
        resolvedZoneDistanceKm = null;
        updateZoneSummary({ message: result?.message || 'Your location is outside the configured delivery areas.' }, null, true);
        setLocationStatus('Your location is outside the delivery areas.', 'error');
        updateOrderSummary();
        refreshPlaceButton();
        return;
      }
      const zone = deliveryZones.find(row => String(row.id) === String(result.zone_id));
      if (!zone) {
        $('deliveryZone').value = '';
        updateZoneSummary({ message: 'The matching area is not available for ordering. Ask the manager to check the branch and area settings.' }, null, true);
        setLocationStatus('This delivery area is unavailable. Choose another area.', 'error');
        updateOrderSummary();
        refreshPlaceButton();
        return;
      }
      $('deliveryZone').value = zone.id;
      resolvedZoneDistanceKm = result.distance_km;
      updateZoneSummary({ ...zone, zone_name: result.zone_name, branch_name: result.branch_name, delivery_fee: result.delivery_fee, minimum_order_amount: result.minimum_order_amount }, result.distance_km, false);
      setLocationStatus('Location confirmed · ' + result.zone_name + ' · ' + result.branch_name, 'success');
      updateOrderSummary();
      refreshPlaceButton();
    } catch (error) {
      $('deliveryZone').value = '';
      resolvedZoneDistanceKm = null;
      updateZoneSummary({ message: 'Could not check delivery coverage: ' + (error?.message || error) }, null, true);
      setLocationStatus('Could not confirm this location. Try again.', 'error');
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
    const delivery = deliveryPayloadOrError();
    if (!delivery) return;
    const branchId = $('pickupBranch')?.value;
    if (delivery.type === 'pickup' && !branchId) { showMessage('pickupCheckoutMessage', 'Choose the branch that will handle your pickup order.', true); $('pickupBranch')?.focus(); return; }
    if (delivery.type === 'delivery' && !delivery.zoneId) { showMessage('pickupCheckoutMessage', 'Choose your delivery area first.', true); $('deliveryZone')?.focus(); return; }

    const button = $('placePickupOrderBtn');
    button.dataset.sending = 'true'; button.disabled = true; button.textContent = 'SENDING ORDER…';
    showMessage('pickupCheckoutMessage', '', false);
    try {
      const notes = [delivery.instructions ? 'Delivery instructions: ' + delivery.instructions : '', $('pickupOrderNotes')?.value?.trim() ? 'Order note: ' + $('pickupOrderNotes').value.trim() : ''].filter(Boolean).join(' | ').slice(0, 500) || null;
      const orderItems = cart.map(row => ({ item_id: row.id, quantity: Number(row.quantity) }));
      const rpc = delivery.type === 'delivery'
        ? await sb.rpc('place_delivery_order_in_zone', {
            p_delivery_zone_id: delivery.zoneId,
            p_items: orderItems,
            p_delivery_address: delivery.address,
            p_delivery_map_url: delivery.mapUrl,
            p_delivery_latitude: delivery.latitude,
            p_delivery_longitude: delivery.longitude,
            p_notes: notes
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
      .select('id,order_number,customer_name,location_id,branch_name,branch_city,branch_address,fulfillment_type,delivery_address,delivery_map_url,delivery_latitude,delivery_longitude,delivery_zone_id,delivery_zone_name,delivery_fee,total_amount,status,notes,subtotal,currency,created_at,updated_at')
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
        deliveryDetailsHtml(order, false) + (order.notes ? '<br>Note: ' + esc(order.notes) : '') + '</div>' +
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
      .select('id,order_number,customer_name,customer_phone,location_id,branch_name,branch_city,branch_address,fulfillment_type,delivery_address,delivery_map_url,delivery_latitude,delivery_longitude,delivery_zone_id,delivery_zone_name,delivery_fee,total_amount,status,notes,subtotal,currency,created_at')
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
      await loadDeliveryZones();
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
