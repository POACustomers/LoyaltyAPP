(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const menuLink = $('viewMenuLink');
  const evaluateButton = $('evaluateButton');
  const backdrop = $('branchDialog');
  const closeButton = $('closeBranchDialog');
  const branchList = $('branchList');
  const errorBox = $('branchError');

  if (menuLink) {
    const incoming = new URLSearchParams(window.location.search);
    const destination = new URL('menu.html', window.location.href);
    ['location_id', 'branch_id'].forEach((key) => {
      const value = (incoming.get(key) || '').trim();
      if (value) destination.searchParams.set(key, value);
    });
    menuLink.href = destination.pathname + destination.search;
  }

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function safeMapsUrl(location) {
    const supplied = String(location.maps_url || '').trim();
    try {
      const url = new URL(supplied);
      if (url.protocol === 'https:') return url.href;
    } catch (_) {}
    const query = [location.name, location.address, location.city].filter(Boolean).join(' ');
    return query ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query) : '';
  }

  async function loadBranches() {
    if (!branchList) return;
    branchList.innerHTML = '<div class="dc-branch-loading">Loading branches…</div>';
    if (errorBox) errorBox.hidden = true;
    try {
      const client = window.sb;
      if (!client || typeof client.from !== 'function') {
        throw new Error('Branch information is not available. Please refresh the page.');
      }
      const { data, error } = await client.from('locations')
        .select('id,name,city,address,maps_url,is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      const branches = (Array.isArray(data) ? data : []).filter((row) => row && row.name);
      if (!branches.length) {
        branchList.innerHTML = '<div class="dc-branch-loading">No active branches are available right now.</div>';
        return;
      }
      branchList.innerHTML = branches.map((branch) => {
        const url = safeMapsUrl(branch);
        if (!url) return '';
        const detail = [branch.city, branch.address].filter(Boolean).join(' · ');
        return '<a class="dc-branch-button" href="' + escapeHtml(url) +
          '" target="_blank" rel="noopener noreferrer"><span><strong>' +
          escapeHtml(branch.name) + '</strong>' +
          (detail ? '<small class="dc-branch-detail">' + escapeHtml(detail) + '</small>' : '') +
          '</span></a>';
      }).join('') || '<div class="dc-branch-loading">Review links are not set up yet.</div>';
    } catch (error) {
      console.error('Dina’s Corner branch list could not be loaded:', error);
      if (branchList) branchList.innerHTML = '';
      if (errorBox) {
        errorBox.textContent = error && error.message ? error.message : 'Could not load branches. Please try again later.';
        errorBox.hidden = false;
      }
    }
  }

  function openDialog() {
    if (!backdrop) return;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    loadBranches();
    if (closeButton) closeButton.focus();
  }
  function closeDialog() {
    if (!backdrop) return;
    backdrop.hidden = true;
    document.body.style.overflow = '';
    if (evaluateButton) evaluateButton.focus();
  }
  if (evaluateButton) evaluateButton.addEventListener('click', openDialog);
  if (closeButton) closeButton.addEventListener('click', closeDialog);
  if (backdrop) backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeDialog();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && backdrop && !backdrop.hidden) closeDialog();
  });
}());
