(function () {
  'use strict';

  const LEAFLET_VERSION = '1.9.4';
  const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
  const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
  const DEFAULT_MAP_CENTER = [30.0444, 31.2357]; // Egypt pilot default; users choose their own pin.
  const $ = id => document.getElementById(id);
  let leafletPromise = null;
  let profileMap = null;
  let profileUserId = null;
  let profileAddresses = [];
  let editingAddressId = null;
  let profileActionsBound = false;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }
  function coordinatePair(lat, lng) {
    if (lat === null || lat === undefined || lng === null || lng === undefined || String(lat).trim() === '' || String(lng).trim() === '') return false;
    const latitude = Number(lat), longitude = Number(lng);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }
  function mapsUrl(lat, lng) {
    return 'https://www.google.com/maps?q=' + encodeURIComponent(Number(lat) + ',' + Number(lng));
  }
  function setStatus(id, message, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('success', kind === 'success');
    el.classList.toggle('error', kind === 'error');
  }
  function showFormMessage(id, message, isError) {
    const el = $(id);
    if (!el) return;
    el.textContent = message || '';
    el.className = isError ? 'customer-address-error' : 'customer-address-note';
    el.hidden = !message;
  }
  async function loadLeaflet() {
    if (window.L && typeof window.L.map === 'function') return window.L;
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-poa-leaflet]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = LEAFLET_CSS;
        link.dataset.poaLeaflet = 'true';
        document.head.appendChild(link);
      }
      const existing = document.querySelector('script[data-poa-leaflet]');
      if (existing) {
        existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('The map library did not initialize.')) , { once: true });
        existing.addEventListener('error', () => reject(new Error('Could not load the map. Check your internet connection.')), { once: true });
        if (window.L) resolve(window.L);
        return;
      }
      const script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.async = true;
      script.dataset.poaLeaflet = 'true';
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('The map library did not initialize.'));
      script.onerror = () => reject(new Error('Could not load the map. Check your internet connection.'));
      document.head.appendChild(script);
    }).catch(error => { leafletPromise = null; throw error; });
    return leafletPromise;
  }

  async function createMap(containerId, fields, options) {
    const L = await loadLeaflet();
    const container = $(containerId);
    if (!container) throw new Error('The map area is missing. Refresh the page and try again.');
    const opts = options || {};
    const startLat = coordinatePair(opts.latitude, opts.longitude) ? Number(opts.latitude) : DEFAULT_MAP_CENTER[0];
    const startLng = coordinatePair(opts.latitude, opts.longitude) ? Number(opts.longitude) : DEFAULT_MAP_CENTER[1];
    const map = L.map(containerId, { scrollWheelZoom: false }).setView([startLat, startLng], coordinatePair(opts.latitude, opts.longitude) ? 16 : 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    let marker = null;
    let pointSelected = coordinatePair(opts.latitude, opts.longitude);

    const setPoint = (latitude, longitude, zoomToPoint, setMessage) => {
      const lat = Number(latitude), lng = Number(longitude);
      if (!coordinatePair(lat, lng)) throw new Error('Choose a valid point on the map.');
      pointSelected = true;
      if (fields.lat) $(fields.lat).value = lat.toFixed(7);
      if (fields.lng) $(fields.lng).value = lng.toFixed(7);
      if (fields.mapUrl) $(fields.mapUrl).value = mapsUrl(lat, lng);
      if (!marker) marker = L.marker([lat, lng]).addTo(map);
      else marker.setLatLng([lat, lng]);
      if (zoomToPoint !== false) map.setView([lat, lng], Math.max(map.getZoom(), 15));
      if (setMessage !== false && fields.status) setStatus(fields.status, 'Map location selected and ready to save.', 'success');
    };

    map.on('click', event => {
      try { setPoint(event.latlng.lat, event.latlng.lng, true, true); }
      catch (error) { if (fields.status) setStatus(fields.status, error.message, 'error'); }
    });
    if (pointSelected) setPoint(startLat, startLng, false, false);
    window.setTimeout(() => map.invalidateSize(), 250);
    return {
      map,
      setPoint,
      clearPoint: () => {
        pointSelected = false;
        if (marker) { map.removeLayer(marker); marker = null; }
        if (fields.lat) $(fields.lat).value = '';
        if (fields.lng) $(fields.lng).value = '';
        if (fields.mapUrl) $(fields.mapUrl).value = '';
        map.setView(DEFAULT_MAP_CENTER, 10);
      },
      hasPoint: () => pointSelected,
      invalidate: () => window.setTimeout(() => map.invalidateSize(), 120)
    };
  }

  function useCurrentLocation(buttonId, statusId, mapGetter) {
    const button = $(buttonId);
    const original = button?.textContent || 'USE CURRENT LOCATION';
    if (!navigator.geolocation) {
      setStatus(statusId, 'This browser does not provide GPS. Tap the map to choose the location.', 'error');
      return;
    }
    if (button) { button.disabled = true; button.textContent = 'GETTING LOCATION…'; }
    setStatus(statusId, 'Waiting for location permission…');
    navigator.geolocation.getCurrentPosition(position => {
      const lat = Number(position.coords.latitude), lng = Number(position.coords.longitude);
      Promise.resolve(mapGetter()).then(mapRef => {
        mapRef.setPoint(lat, lng, true, true);
        setStatus(statusId, 'Current location selected. Save the address to keep it in your account.', 'success');
      }).catch(error => setStatus(statusId, error.message || 'Could not show the location on the map.', 'error'))
        .finally(() => { if (button) { button.disabled = false; button.textContent = original; } });
    }, error => {
      const text = error?.code === 1
        ? 'Location permission was denied. Tap the map and place the pin manually.'
        : 'Could not get GPS. Check device location or tap the map to choose the pin.';
      setStatus(statusId, text, 'error');
      if (button) { button.disabled = false; button.textContent = original; }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  // Used by app.js before it creates a Supabase auth account.
  function registrationPayload() {
    const label = $('registrationAddressLabel')?.value.trim() || 'Home';
    const address = $('registrationAddress')?.value.trim() || '';
    const instructions = $('registrationAddressInstructions')?.value.trim() || '';
    const latText = $('registrationAddressLatitude')?.value || '';
    const lngText = $('registrationAddressLongitude')?.value || '';
    const latitude = latText === '' ? null : Number(latText);
    const longitude = lngText === '' ? null : Number(lngText);
    const hasCoordinates = coordinatePair(latitude, longitude);
    if ((latText === '') !== (lngText === '')) {
      return { ok: false, message: 'The map location is incomplete. Select the location again, or leave the address for later.' };
    }
    if ((latText !== '' || lngText !== '') && !hasCoordinates) {
      return { ok: false, message: 'The map location is invalid. Select your location again or skip address setup for now.' };
    }
    // Address setup is optional during registration. Create an address row only
    // when the customer entered text or selected a map point.
    if (!address && !hasCoordinates) return { ok: true, address: null };
    return {
      ok: true,
      address: {
        label: label.slice(0, 40) || 'Home',
        full_address: address ? address.slice(0, 500) : null,
        delivery_instructions: instructions ? instructions.slice(0, 500) : null,
        latitude: hasCoordinates ? latitude : null,
        longitude: hasCoordinates ? longitude : null,
        map_url: hasCoordinates ? mapsUrl(latitude, longitude) : null,
        is_default: true
      }
    };
  }

  async function initRegistration() {
    if (!$('registrationAddressMap') || $('registrationAddressMap').dataset.ready === 'true') return;
    $('registrationAddressMap').dataset.ready = 'true';
    try {
      const mapRef = await createMap('registrationAddressMap', {
        lat: 'registrationAddressLatitude', lng: 'registrationAddressLongitude', mapUrl: 'registrationAddressMapUrl', status: 'registrationLocationStatus'
      });
      $('registrationUseLocationBtn')?.addEventListener('click', () => useCurrentLocation('registrationUseLocationBtn', 'registrationLocationStatus', () => Promise.resolve(mapRef)));
    } catch (error) {
      setStatus('registrationLocationStatus', (error.message || 'The map could not be loaded.') + ' You can retry after checking your internet connection.', 'error');
      const button = $('registrationUseLocationBtn');
      if (button) button.addEventListener('click', () => {
        if (!navigator.geolocation) { setStatus('registrationLocationStatus', 'GPS is unavailable and the map did not load. Check your connection and refresh.', 'error'); return; }
        useCurrentLocation('registrationUseLocationBtn', 'registrationLocationStatus', async () => {
          const ref = await createMap('registrationAddressMap', {lat:'registrationAddressLatitude',lng:'registrationAddressLongitude',mapUrl:'registrationAddressMapUrl',status:'registrationLocationStatus'});
          return ref;
        });
      });
    }
  }

  async function getOwnUserId() {
    const { data, error } = await window.sb.auth.getUser();
    if (error) throw error;
    const id = data?.user?.id;
    if (!id) throw new Error('Please sign in again to manage your delivery addresses.');
    return id;
  }

  function renderAddresses() {
    const box = $('customerAddressList');
    if (!box) return;
    if (!profileAddresses.length) {
      box.innerHTML = '<div class="customer-address-note">No delivery addresses saved yet. Add your home or work address so checkout can fill it automatically.</div>';
      return;
    }
    box.innerHTML = profileAddresses.map(row => {
      const map = row.map_url || (coordinatePair(row.latitude, row.longitude) ? mapsUrl(row.latitude, row.longitude) : '');
      return `<article class="customer-saved-address">
        <div class="customer-saved-address-head"><div><h4 class="customer-saved-address-label">${esc(row.label || 'Address')}</h4></div>${row.is_default ? '<span class="customer-address-default-tag">DEFAULT ADDRESS</span>' : ''}</div>
        ${row.full_address ? `<p class="customer-address-text">${esc(row.full_address)}</p>` : `<p class="customer-address-text">${coordinatePair(row.latitude, row.longitude) ? 'Map location saved. Written details are optional.' : 'Written address saved. Choose a map location at checkout for delivery.'}</p>`}
        ${row.delivery_instructions ? `<p class="customer-address-text"><strong>Delivery instructions:</strong> ${esc(row.delivery_instructions)}</p>` : ''}
        <div class="customer-address-actions">
          ${!row.is_default ? `<button type="button" class="btn soft" data-address-default="${esc(row.id)}">MAKE DEFAULT</button>` : ''}
          <button type="button" class="btn soft" data-address-edit="${esc(row.id)}">EDIT</button>
          ${map ? `<a class="btn soft" href="${esc(map)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">OPEN MAP</a>` : ''}
          <button type="button" class="btn danger" data-address-delete="${esc(row.id)}">DELETE</button>
        </div>
      </article>`;
    }).join('');
    box.querySelectorAll('[data-address-edit]').forEach(button => button.addEventListener('click', () => openEditor(profileAddresses.find(row => row.id === button.dataset.addressEdit))));
    box.querySelectorAll('[data-address-default]').forEach(button => button.addEventListener('click', () => makeDefault(button.dataset.addressDefault)));
    box.querySelectorAll('[data-address-delete]').forEach(button => button.addEventListener('click', () => deleteAddress(button.dataset.addressDelete)));
  }

  async function loadAddresses() {
    const box = $('customerAddressList');
    if (box) box.innerHTML = '<div class="customer-address-note">Loading saved addresses…</div>';
    try {
      profileUserId = profileUserId || await getOwnUserId();
      const { data, error } = await window.sb.from('customer_addresses')
        .select('id,customer_id,label,full_address,delivery_instructions,latitude,longitude,map_url,is_default,created_at,updated_at')
        .eq('customer_id', profileUserId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      profileAddresses = Array.isArray(data) ? data : [];
      renderAddresses();
    } catch (error) {
      if (box) box.innerHTML = `<div class="customer-address-error">Could not load saved addresses. Ensure the POACustomers saved-address SQL setup has been run. Details: ${esc(error.message || error)}</div>`;
    }
  }

  async function makeDefault(id) {
    try {
      profileUserId = profileUserId || await getOwnUserId();
      const { error: clearError } = await window.sb.from('customer_addresses').update({ is_default: false, updated_at: new Date().toISOString() }).eq('customer_id', profileUserId);
      if (clearError) throw clearError;
      const { error } = await window.sb.from('customer_addresses').update({ is_default: true, updated_at: new Date().toISOString() }).eq('id', id).eq('customer_id', profileUserId);
      if (error) throw error;
      await loadAddresses();
      if (typeof window.toast === 'function') window.toast('Default delivery address updated.');
    } catch (error) {
      if (typeof window.toast === 'function') window.toast(error.message || 'Could not update default address.', false);
    }
  }

  async function deleteAddress(id) {
    const row = profileAddresses.find(item => item.id === id);
    if (!row || !confirm('Delete this saved delivery address? Previous orders will keep their saved address details.')) return;
    try {
      profileUserId = profileUserId || await getOwnUserId();
      const { error } = await window.sb.from('customer_addresses').delete().eq('id', id).eq('customer_id', profileUserId);
      if (error) throw error;
      profileAddresses = profileAddresses.filter(item => item.id !== id);
      if (row.is_default && profileAddresses.length) {
        await makeDefault(profileAddresses[0].id);
      } else {
        await loadAddresses();
      }
      if (typeof window.toast === 'function') window.toast('Address deleted. Previous orders are unchanged.');
    } catch (error) {
      if (typeof window.toast === 'function') window.toast(error.message || 'Could not delete address.', false);
    }
  }

  async function ensureProfileMap(row) {
    const lat = row?.latitude, lng = row?.longitude;
    if (profileMap) {
      profileMap.invalidate();
      if (coordinatePair(lat, lng)) profileMap.setPoint(lat, lng, true, false);
      else profileMap.clearPoint();
      return profileMap;
    }
    profileMap = await createMap('customerAddressMap', {
      lat: 'profileAddressLatitude', lng: 'profileAddressLongitude', mapUrl: 'profileAddressMapUrl', status: 'profileAddressMapStatus'
    }, { latitude: lat, longitude: lng });
    $('profileAddressUseLocationBtn')?.addEventListener('click', () => useCurrentLocation('profileAddressUseLocationBtn', 'profileAddressMapStatus', () => Promise.resolve(profileMap)));
    return profileMap;
  }

  async function openEditor(row) {
    editingAddressId = row?.id || null;
    $('customerAddressForm').hidden = false;
    $('profileAddressLabel').value = row?.label || 'Home';
    $('profileAddressFull').value = row?.full_address || '';
    $('profileAddressInstructions').value = row?.delivery_instructions || '';
    $('profileAddressLatitude').value = coordinatePair(row?.latitude, row?.longitude) ? String(row.latitude) : '';
    $('profileAddressLongitude').value = coordinatePair(row?.latitude, row?.longitude) ? String(row.longitude) : '';
    $('profileAddressMapUrl').value = coordinatePair(row?.latitude, row?.longitude) ? mapsUrl(row.latitude, row.longitude) : '';
    $('profileAddressDefault').checked = row ? !!row.is_default : (profileAddresses.length === 0);
    $('saveCustomerAddressBtn').textContent = editingAddressId ? 'SAVE ADDRESS CHANGES' : 'SAVE ADDRESS';
    $('cancelCustomerAddressBtn').hidden = false;
    showFormMessage('customerAddressFormMessage', '', false);
    try {
      await ensureProfileMap(row || null);
      setStatus('profileAddressMapStatus', coordinatePair(row?.latitude, row?.longitude) ? 'Saved map point loaded. Tap the map to move the pin.' : 'Tap the map to choose this address location.', coordinatePair(row?.latitude, row?.longitude) ? 'success' : undefined);
      $('customerAddressForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      setStatus('profileAddressMapStatus', error.message || 'Could not load the map. Check your internet connection.', 'error');
    }
  }

  async function saveProfileAddress(event) {
    event.preventDefault();
    const label = $('profileAddressLabel').value.trim() || 'Home';
    const fullAddress = $('profileAddressFull').value.trim();
    const instructions = $('profileAddressInstructions').value.trim();
    const latText = $('profileAddressLatitude').value, lngText = $('profileAddressLongitude').value;
    const latitude = latText === '' ? null : Number(latText), longitude = lngText === '' ? null : Number(lngText);
    const hasCoordinates = coordinatePair(latitude, longitude);
    if (label.length > 40) { showFormMessage('customerAddressFormMessage', 'Address label must be 40 characters or fewer.', true); return; }
    if (fullAddress.length > 500) { showFormMessage('customerAddressFormMessage', 'Address details must be 500 characters or fewer.', true); $('profileAddressFull').focus(); return; }
    if ((latText === '') !== (lngText === '')) { showFormMessage('customerAddressFormMessage', 'The map location is incomplete. Select the location again.', true); return; }
    if ((latText !== '' || lngText !== '') && !hasCoordinates) { showFormMessage('customerAddressFormMessage', 'The map location is invalid. Select the location again.', true); return; }
    if (!fullAddress && !hasCoordinates) { showFormMessage('customerAddressFormMessage', 'Choose a map pin or enter address details. You can leave the other fields blank.', true); return; }
    if (instructions.length > 500) { showFormMessage('customerAddressFormMessage', 'Delivery instructions must be 500 characters or fewer.', true); return; }

    const button = $('saveCustomerAddressBtn');
    button.disabled = true;
    button.textContent = 'SAVING…';
    showFormMessage('customerAddressFormMessage', '', false);
    try {
      profileUserId = profileUserId || await getOwnUserId();
      const requestedDefault = $('profileAddressDefault').checked || !profileAddresses.some(row => row.is_default && row.id !== editingAddressId);
      if (requestedDefault) {
        const { error: clearError } = await window.sb.from('customer_addresses')
          .update({ is_default: false, updated_at: new Date().toISOString() }).eq('customer_id', profileUserId);
        if (clearError) throw clearError;
      }
      const payload = {
        customer_id: profileUserId,
        label: label || 'Home',
        full_address: fullAddress || null,
        delivery_instructions: instructions || null,
        latitude: hasCoordinates ? latitude : null,
        longitude: hasCoordinates ? longitude : null,
        map_url: hasCoordinates ? mapsUrl(latitude, longitude) : null,
        is_default: requestedDefault,
        updated_at: new Date().toISOString()
      };
      let saveError;
      if (editingAddressId) {
        const result = await window.sb.from('customer_addresses').update(payload).eq('id', editingAddressId).eq('customer_id', profileUserId);
        saveError = result.error;
      } else {
        const result = await window.sb.from('customer_addresses').insert(payload);
        saveError = result.error;
      }
      if (saveError) throw saveError;
      await loadAddresses();
      $('customerAddressForm').hidden = true;
      editingAddressId = null;
      if (typeof window.toast === 'function') window.toast('Delivery address saved to your account.');
    } catch (error) {
      showFormMessage('customerAddressFormMessage', error.message || 'Could not save this address. Please try again.', true);
    } finally {
      button.disabled = false;
      button.textContent = editingAddressId ? 'SAVE ADDRESS CHANGES' : 'SAVE ADDRESS';
    }
  }

  async function initProfile() {
    const panel = $('customerAddressesPanel');
    if (!panel || panel.dataset.initialized === 'true') return;
    panel.dataset.initialized = 'true';
    $('addCustomerAddressBtn')?.addEventListener('click', () => openEditor(null));
    $('customerAddressForm')?.addEventListener('submit', saveProfileAddress);
    $('cancelCustomerAddressBtn')?.addEventListener('click', () => { $('customerAddressForm').hidden = true; editingAddressId = null; });
    await loadAddresses();
  }

  window.POACustomerAddresses = {
    initRegistration,
    registrationPayload,
    initProfile,
    mapsUrl
  };
})();
