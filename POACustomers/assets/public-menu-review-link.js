/* Branch-specific Google Maps / review link for each NFC menu.
   The NFC URL carries ?location_id=<locations.id>. The destination is read from
   the GM-managed locations.maps_url field. */
(function () {
  'use strict';
  const link = document.getElementById('publicMenuReviewLink');
  if (!link) return;

  const params = new URLSearchParams(window.location.search);
  const locationId = String(params.get('location_id') || params.get('branch_id') || '').trim();
  const database = window.POA_PUBLIC_MENU_DB || window.sb || null;
  if (!locationId || !database) {
    link.hidden = true;
    return;
  }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      const host = url.hostname.toLowerCase();
      const isGoogleHost = host === 'google.com' || host.endsWith('.google.com') || host === 'goo.gl' || host.endsWith('.goo.gl') || host === 'g.page' || host.endsWith('.g.page');
      return url.protocol === 'https:' && isGoogleHost ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function mapsSearchUrl(branch) {
    const query = [branch.name, branch.address, branch.city].filter(Boolean).join(' ').trim();
    return query ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query) : '';
  }

  (async function loadBranchReviewLink() {
    try {
      const { data, error } = await database.from('locations')
        .select('id,name,city,address,maps_url,is_active')
        .eq('id', locationId)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        link.hidden = true;
        console.warn('No active branch matched the NFC location_id.');
        return;
      }

      const destination = safeHttpsUrl(data.maps_url) || mapsSearchUrl(data);
      if (!destination) {
        link.hidden = true;
        console.warn('The selected branch has no Google Maps URL or usable address.');
        return;
      }

      link.href = destination;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.dataset.locationId = String(data.id);
      link.setAttribute('aria-label', 'رأيك يهمنا - افتح موقع ' + String(data.name || 'الفرع') + ' على Google Maps');
      link.title = String(data.name || 'Dina’s Corner') + ' — رأيك يهمنا';
      link.hidden = false;
    } catch (error) {
      link.hidden = true;
      console.error('Could not load Google Maps link for this branch:', error);
    }
  })();
})();
