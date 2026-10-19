(function () {
  'use strict';

  const CART_KEY = 'poa_pickup_cart_v1';
  const BRANCH_KEY = 'poa_pickup_branch_v1';
  const page = document.body.dataset.page || '';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

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
    return Number.isFinite(n) ? 'AED ' + n.toFixed(2) : 'To be confirmed';
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

  // Exposed for the customer-facing menu card buttons. This does not run on the standalone public menu.
  window.POAAddItemToCart = function (item) {
    if (document.body.dataset.page !== 'customer-menu') return;
    if (!item || !item.id || !String(item.name || '').trim()) {
      toast('This item cannot be added right now.', false);
      return;
    }
    const cart = readCart();
    const existing = cart.find(row => String(row.id) === String(item.id));
    if (existing) {
      if (Number(existing.quantity) >= 50) {
        toast('Maximum quantity for this item is 50.', false);
        return;
      }
      existing.quantity = Number(existing.quantity) + 1;
      existing.name = String(item.name);
      existing.price = normalizePrice(item.price);
      existing.image_url = item.image_url || null;
    } else {
      cart.push({
        id: String(item.id),
        name: String(item.name),
        description: item.description || '',
        image_url: item.image_url || null,
        price: normalizePrice(item.price),
        quantity: 1
      });
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
      dock.innerHTML = '<div class="pickup-cart-dock-copy"><strong id="pickupCartDockCount">Your order</strong><small id="pickupCartDockSub">Pickup from your chosen branch</small></div><a class="btn" href="customer-orders.html">View order</a>';
      document.body.appendChild(dock);
    }
    const cart = readCart();
    dock.hidden = cart.length === 0;
    const count = quantityCount(cart);
    if ($('pickupCartDockCount')) $('pickupCartDockCount').textContent = 'Your order · ' + count + (count === 1 ? ' item' : ' items');
    const sub = calculate(cart);
    if ($('pickupCartDockSub')) $('pickupCartDockSub').textContent = sub.known ? money(sub.total) + ' · Pickup only' : 'Price will be confirmed by the branch · Pickup only';
  }

  function statusLabel(status) {
    return ({
      placed: 'Order received', accepted: 'Accepted', preparing: 'Preparing',
      ready_for_pickup: 'Ready for pickup', completed: 'Picked up', cancelled: 'Cancelled'
    })[status] || String(status || 'Unknown').replaceAll('_', ' ');
  }
  function statusHint(status) {
    return ({
      placed: 'Waiting for the branch to accept your order.',
      accepted: 'The branch accepted your order.',
      preparing: 'Your order is being prepared.',
      ready_for_pickup: 'Your order is ready. Please collect it from the selected branch.',
      completed: 'This order has been collected.',
      cancelled: 'This order was cancelled.'
    })[status] || '';
  }

  function renderCart() {
    const list = $('pickupCartList');
    const summary = $('pickupCartSummary');
    const submit = $('placePickupOrderBtn');
    const cart = readCart();
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
        ? '<img class="pickup-item-photo" src="' + esc(item.image_url) + '" alt="' + esc(item.name) + '" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="pickup-item-photo-fallback" hidden aria-hidden="true">☕</div>'
        : '<div class="pickup-item-photo-fallback" aria-hidden="true">☕</div>';
      const priceText = price === null ? 'Price to be confirmed' : money(price) + ' each';
      return '<article class="pickup-cart-row">' + image +
        '<div class="pickup-cart-details"><strong>' + esc(item.name) + '</strong><small>' + esc(priceText) + '</small>' +
        '<div class="pickup-qty"><button type="button" data-qty-minus="' + esc(item.id) + '" aria-label="Decrease quantity">−</button><b>' + Number(item.quantity) + '</b><button type="button" data-qty-plus="' + esc(item.id) + '" aria-label="Increase quantity">+</button><button type="button" class="pickup-remove" data-remove-item="' + esc(item.id) + '">Remove</button></div></div>' +
        '<strong class="pickup-price">' + (price === null ? 'TBC' : money(price * Number(item.quantity))) + '</strong></article>';
    }).join('');

    list.querySelectorAll('[data-qty-minus]').forEach(button => button.addEventListener('click', () => changeQuantity(button.dataset.qtyMinus, -1)));
    list.querySelectorAll('[data-qty-plus]').forEach(button => button.addEventListener('click', () => changeQuantity(button.dataset.qtyPlus, 1)));
    list.querySelectorAll('[data-remove-item]').forEach(button => button.addEventListener('click', () => {
      writeCart(readCart().filter(row => String(row.id) !== String(button.dataset.removeItem)));
      renderCart();
    }));

    const calc = calculate(cart);
    if (summary) summary.innerHTML = '<div class="pickup-summary-row"><span>Items</span><strong>' + quantityCount(cart) + '</strong></div>' +
      '<div class="pickup-summary-row"><span>Order total</span><strong>' + (calc.known ? money(calc.total) : 'To be confirmed by branch') + '</strong></div>' +
      (!calc.known ? '<div class="pickup-note">One or more items do not have a published price. You can still send the order; the branch will confirm the final amount before preparation.</div>' : '<div class="pickup-note">Pickup only. No online payment is taken in this flow.</div>');
    if (submit) submit.disabled = !cart.length || !$('pickupBranch')?.value;
  }

  function changeQuantity(id, delta) {
    const cart = readCart();
    const item = cart.find(row => String(row.id) === String(id));
    if (!item) return;
    const next = Number(item.quantity) + delta;
    if (next <= 0) {
      writeCart(cart.filter(row => String(row.id) !== String(id)));
    } else if (next <= 50) {
      item.quantity = next;
      writeCart(cart);
    } else {
      toast('Maximum quantity for this item is 50.', false);
    }
    renderCart();
  }

  async function loadPickupBranches() {
    const select = $('pickupBranch');
    if (!select) return;
    select.innerHTML = '<option value="">Loading branches…</option>';
    const { data, error } = await sb.from('locations').select('id,name,city,address,is_active').eq('is_active', true).order('name');
    if (error) {
      select.innerHTML = '<option value="">Branches unavailable</option>';
      showMessage('pickupCheckoutMessage', 'Could not load pickup branches. Ask the GM to check active branch locations. ' + error.message, true);
      return;
    }
    const branches = Array.isArray(data) ? data.filter(row => row && row.id && row.name) : [];
    if (!branches.length) {
      select.innerHTML = '<option value="">No active branches available</option>';
      showMessage('pickupCheckoutMessage', 'No active branches are available yet. Ask the GM to add a branch before placing orders.', true);
      return;
    }
    select.innerHTML = '<option value="">Choose pickup branch</option>' + branches.map(row =>
      '<option value="' + esc(row.id) + '">' + esc(row.name) + (row.city ? ' — ' + esc(row.city) : '') + '</option>'
    ).join('');
    const stored = localStorage.getItem(BRANCH_KEY);
    if (stored && branches.some(row => row.id === stored)) select.value = stored;
    select.addEventListener('change', () => {
      if (select.value) localStorage.setItem(BRANCH_KEY, select.value);
      else localStorage.removeItem(BRANCH_KEY);
      if ($('placePickupOrderBtn')) $('placePickupOrderBtn').disabled = !readCart().length || !select.value;
    });
    if ($('placePickupOrderBtn')) $('placePickupOrderBtn').disabled = !readCart().length || !select.value;
  }

  function showMessage(id, text, isError) {
    const box = $(id);
    if (!box) return;
    box.hidden = !text;
    box.className = isError ? 'pickup-error' : 'pickup-success';
    box.textContent = text || '';
  }

  async function submitPickupOrder(event) {
    event.preventDefault();
    const cart = readCart();
    const branchId = $('pickupBranch')?.value;
    if (!cart.length) { showMessage('pickupCheckoutMessage', 'Your basket is empty.', true); return; }
    if (!branchId) { showMessage('pickupCheckoutMessage', 'Choose a pickup branch first.', true); $('pickupBranch')?.focus(); return; }

    const button = $('placePickupOrderBtn');
    button.disabled = true;
    button.textContent = 'SENDING ORDER…';
    showMessage('pickupCheckoutMessage', '', false);
    try {
      const { data, error } = await sb.rpc('place_pickup_order', {
        p_location_id: branchId,
        p_items: cart.map(row => ({ item_id: row.id, quantity: Number(row.quantity) })),
        p_notes: $('pickupOrderNotes')?.value?.trim() || null
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result || !result.order_number) throw new Error('The branch did not return an order number. Please refresh your order history before trying again.');
      localStorage.removeItem(CART_KEY);
      if ($('pickupOrderNotes')) $('pickupOrderNotes').value = '';
      showMessage('pickupCheckoutMessage', 'Order sent successfully. Your order number is ' + result.order_number + '. Status: Order received. You can follow it below.', false);
      renderCart();
      await loadCustomerOrders();
    } catch (error) {
      showMessage('pickupCheckoutMessage', error?.message || 'Could not send your order. Please try again.', true);
    } finally {
      button.textContent = 'PLACE PICKUP ORDER';
      button.disabled = !readCart().length || !$('pickupBranch')?.value;
    }
  }

  async function cancelCustomerOrder(id) {
    if (!confirm('Cancel this order? Only orders not yet accepted can be cancelled here.')) return;
    try {
      const { error } = await sb.rpc('cancel_pickup_order', { p_order_id: id });
      if (error) throw error;
      toast('Order cancelled.');
      await loadCustomerOrders();
    } catch (error) {
      showMessage('pickupOrdersMessage', error?.message || 'Could not cancel the order.', true);
    }
  }

  async function loadCustomerOrders() {
    const box = $('pickupOrdersList');
    if (!box) return;
    box.innerHTML = '<div class="pickup-empty">Loading your orders…</div>';
    const { data, error } = await sb.from('pickup_orders')
      .select('id,order_number,customer_name,location_id,branch_name,branch_city,branch_address,status,notes,subtotal,currency,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(25);
    if (error) {
      box.innerHTML = '<div class="pickup-error">Could not load orders. Run POACustomers-pickup-orders-setup.sql in Supabase. Details: ' + esc(error.message) + '</div>';
      return;
    }
    const orders = Array.isArray(data) ? data : [];
    if (!orders.length) {
      box.innerHTML = '<div class="pickup-empty">No pickup orders yet. Items you order from Menu will appear here.</div>';
      return;
    }
    const orderIds = orders.map(row => row.id);
    const { data: items, error: itemsError } = await sb.from('pickup_order_items')
      .select('id,order_id,item_name,quantity,unit_price,line_total').in('order_id', orderIds).order('created_at', { ascending: true });
    if (itemsError) {
      box.innerHTML = '<div class="pickup-error">Your orders loaded, but their items could not be loaded: ' + esc(itemsError.message) + '</div>';
      return;
    }
    const grouped = {};
    (items || []).forEach(item => (grouped[item.order_id] ||= []).push(item));
    box.innerHTML = orders.map(order => {
      const rows = grouped[order.id] || [];
      const canCancel = order.status === 'placed';
      const itemHtml = rows.map(row => '<div>• ' + esc(row.item_name) + ' × ' + Number(row.quantity) + (row.unit_price === null ? ' — price to be confirmed' : ' — ' + money(row.line_total)) + '</div>').join('');
      return '<article class="pickup-order-card"><div class="pickup-order-head"><div><div class="pickup-order-number">' + esc(order.order_number) + '</div><small class="pickup-order-date">' + esc(new Date(order.created_at).toLocaleString()) + '</small></div><span class="pickup-status" data-status="' + esc(order.status) + '">' + esc(statusLabel(order.status)) + '</span></div>' +
        '<div class="pickup-order-meta"><strong>' + esc(order.branch_name) + '</strong>' + (order.branch_city ? ' · ' + esc(order.branch_city) : '') + '<br>' + esc(statusHint(order.status)) + (order.notes ? '<br>Note: ' + esc(order.notes) : '') + '</div>' +
        '<div class="pickup-order-items">' + itemHtml + '</div><div class="pickup-order-footer"><div class="pickup-order-total">Order total<strong>' + (order.subtotal === null ? 'To be confirmed by branch' : money(order.subtotal)) + '</strong></div>' +
        (canCancel ? '<button class="btn danger" type="button" data-cancel-order="' + esc(order.id) + '">Cancel order</button>' : '') + '</div></article>';
    }).join('');
    box.querySelectorAll('[data-cancel-order]').forEach(button => button.addEventListener('click', () => cancelCustomerOrder(button.dataset.cancelOrder)));
  }

  function nextStep(status) {
    return ({
      placed: { next: 'accepted', label: 'ACCEPT ORDER' },
      accepted: { next: 'preparing', label: 'START PREPARING' },
      preparing: { next: 'ready_for_pickup', label: 'READY FOR PICKUP' },
      ready_for_pickup: { next: 'completed', label: 'MARK PICKED UP' }
    })[status] || null;
  }

  async function updateManagedOrder(id, status) {
    const step = statusLabel(status).toLowerCase();
    if (!confirm('Update this order to: ' + step + '?')) return;
    try {
      const { error } = await sb.rpc('update_pickup_order_status', { p_order_id: id, p_new_status: status });
      if (error) throw error;
      toast('Order updated.');
      await loadManagedOrders();
    } catch (error) {
      showMessage('managedOrdersMessage', error?.message || 'Could not update the order.', true);
    }
  }

  async function loadManagedOrders() {
    const box = $('managedPickupOrders');
    if (!box) return;
    box.innerHTML = '<div class="pickup-empty">Loading pickup orders…</div>';
    const { data, error } = await sb.from('pickup_orders')
      .select('id,order_number,customer_name,customer_phone,location_id,branch_name,branch_city,branch_address,status,notes,subtotal,currency,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) {
      box.innerHTML = '<div class="pickup-error">Could not load pickup orders. Run POACustomers-pickup-orders-setup.sql in Supabase. Details: ' + esc(error.message) + '</div>';
      return;
    }
    const orders = Array.isArray(data) ? data : [];
    if (!orders.length) {
      box.innerHTML = '<div class="pickup-empty">No pickup orders are waiting. New customer orders will appear here.</div>';
      return;
    }
    const orderIds = orders.map(row => row.id);
    const { data: items, error: itemsError } = await sb.from('pickup_order_items')
      .select('order_id,item_name,quantity,unit_price,line_total').in('order_id', orderIds).order('created_at', { ascending: true });
    if (itemsError) {
      box.innerHTML = '<div class="pickup-error">Could not load order items: ' + esc(itemsError.message) + '</div>';
      return;
    }
    const grouped = {};
    (items || []).forEach(item => (grouped[item.order_id] ||= []).push(item));
    box.innerHTML = orders.map(order => {
      const rows = grouped[order.id] || [];
      const action = nextStep(order.status);
      const canCancel = ['placed','accepted','preparing'].includes(order.status);
      const itemHtml = rows.map(row => '<div>• ' + esc(row.item_name) + ' × ' + Number(row.quantity) + (row.unit_price === null ? ' — price to be confirmed' : ' — ' + money(row.line_total)) + '</div>').join('');
      return '<article class="pickup-order-card"><div class="pickup-order-head"><div><div class="pickup-order-number">' + esc(order.order_number) + '</div><small class="pickup-order-date">' + esc(new Date(order.created_at).toLocaleString()) + '</small></div><span class="pickup-status" data-status="' + esc(order.status) + '">' + esc(statusLabel(order.status)) + '</span></div>' +
        '<div class="pickup-order-meta"><strong>' + esc(order.customer_name || 'Customer') + '</strong>' + (order.customer_phone ? ' · ' + esc(order.customer_phone) : '') + '<br><strong>Pickup: ' + esc(order.branch_name) + '</strong>' + (order.branch_city ? ' · ' + esc(order.branch_city) : '') + (order.branch_address ? '<br>' + esc(order.branch_address) : '') + (order.notes ? '<br>Customer note: ' + esc(order.notes) : '') + '</div>' +
        '<div class="pickup-order-items">' + itemHtml + '</div><div class="pickup-order-footer"><div class="pickup-order-total">Order total<strong>' + (order.subtotal === null ? 'Confirm with customer' : money(order.subtotal)) + '</strong></div></div>' +
        '<div class="pickup-next-actions">' + (action ? '<button class="btn" type="button" data-order-status="' + esc(order.id) + '" data-next-status="' + esc(action.next) + '">' + esc(action.label) + '</button>' : '') +
        (canCancel ? '<button class="btn danger" type="button" data-order-status="' + esc(order.id) + '" data-next-status="cancelled">CANCEL ORDER</button>' : '') + '</div></article>';
    }).join('');
    box.querySelectorAll('[data-order-status]').forEach(button => button.addEventListener('click', () => updateManagedOrder(button.dataset.orderStatus, button.dataset.nextStatus)));
  }

  async function initCustomerOrders() {
    const profile = await guardRole(['customer']);
    if (!profile) return;
    await loadPickupBranches();
    renderCart();
    $('pickupOrderForm')?.addEventListener('submit', submitPickupOrder);
    $('clearPickupCartBtn')?.addEventListener('click', () => {
      if (!confirm('Clear all items from your basket?')) return;
      writeCart([]); renderCart();
    });
    $('refreshPickupOrdersBtn')?.addEventListener('click', loadCustomerOrders);
    await loadCustomerOrders();
  }

  async function initManagedOrders(role) {
    const profile = await guardRole([role]);
    if (!profile) return;
    if (role === 'staff' && !profile.location_id) {
      try {
        const { data: authData } = await sb.auth.getUser();
        const uid = authData?.user?.id;
        if (uid) {
          const { data: ownProfile } = await sb.from('profiles').select('location_id').eq('id', uid).maybeSingle();
          if (ownProfile) profile.location_id = ownProfile.location_id || null;
        }
      } catch (_) {}
    }
    if (role === 'staff' && !profile.location_id) {
      showMessage('managedOrdersMessage', 'This staff account has no assigned branch. Ask the GM to assign this staff account to a branch before handling pickup orders.', true);
    }
    $('refreshManagedOrdersBtn')?.addEventListener('click', loadManagedOrders);
    await loadManagedOrders();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (page === 'customer-menu') updateCartDock();
    if (page === 'customer-orders') initCustomerOrders().catch(error => showMessage('pickupCheckoutMessage', error?.message || 'Could not initialize the order page.', true));
    if (page === 'gm-orders') initManagedOrders('gm').catch(error => showMessage('managedOrdersMessage', error?.message || 'Could not load orders.', true));
    if (page === 'staff-orders') initManagedOrders('staff').catch(error => showMessage('managedOrdersMessage', error?.message || 'Could not load orders.', true));
  });
})();
