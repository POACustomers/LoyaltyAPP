(function customerHomeCategories(){
  'use strict';

  const root = document.getElementById('homeMenuCategories');
  if (!root) return;
  let pointsObserver = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const safeImage = value => {
    const src = String(value || '').trim();
    return (/^https:\/\//i.test(src) || /^data:image\/(png|jpe?g|webp);base64,/i.test(src)) ? src : '';
  };
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior = () => prefersReducedMotion() ? 'auto' : 'smooth';

  function syncLoyaltyProgress(){
    const pointsNode = document.querySelector('.customer-header-points [data-points]') || document.querySelector('[data-points]');
    const fill = document.querySelector('[data-home-points-progress]');
    const progress = document.querySelector('.customer-home-hero__progress');
    if (!pointsNode || !fill || !progress) return;
    const points = Math.max(0, Math.min(50, Number.parseInt(pointsNode.textContent || '0', 10) || 0));
    fill.style.width = (points / 50 * 100) + '%';
    progress.setAttribute('aria-valuenow', String(points));
  }

  function renderMessage(message, isError = false){
    root.innerHTML = '<div class="home-category-message' + (isError ? ' is-error' : '') + '" role="status">' + esc(message) + '</div>' +
      '<a class="home-category-browse-link" href="customer-menu.html">Browse full menu <span aria-hidden="true">→</span></a>';
  }

  function categoryCard(category){
    const name = String(category.name || '').trim();
    const image = safeImage(category.image_url);
    const icon = esc(category.icon || '☕');
    const media = image
      ? '<img class="home-menu-category-image" src="' + esc(image) + '" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="home-menu-category-icon" aria-hidden="true" hidden>' + icon + '</span>'
      : '<span class="home-menu-category-icon" aria-hidden="true">' + icon + '</span>';
    return '<a class="home-menu-category" role="listitem" href="customer-menu.html?category=' + encodeURIComponent(name) + '" aria-label="Open menu category ' + esc(name) + '">' +
      '<span class="home-menu-category-media">' + media + '</span>' +
      '<span class="home-menu-category-name" title="' + esc(name) + '">' + esc(name) + '</span>' +
      '</a>';
  }

  function renderCarousel(rows){
    root.innerHTML = '<div class="home-category-carousel" data-home-category-carousel>' +
      '<div class="home-menu-category-grid" id="homeCategoryRail" role="list" tabindex="0" aria-label="Menu categories. Swipe, drag, or use the arrow buttons to explore." aria-roledescription="carousel">' +
        rows.map(categoryCard).join('') +
      '</div>' +
      '<div class="home-category-carousel-footer">' +
        '<span class="home-category-scroll-hint"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7h10M13 3l4 4-4 4M17 17H7m4-4-4 4 4 4"/></svg><span>Swipe to explore</span></span>' +
        '<div class="home-category-scroll-tools">' +
          '<span class="home-category-count" aria-live="polite" aria-atomic="true"></span>' +
          '<button class="home-category-scroll-button" type="button" data-scroll-categories="previous" aria-label="Scroll categories to the left" title="Previous categories">‹</button>' +
          '<div class="home-category-progress" role="progressbar" aria-label="Category carousel position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>' +
          '<button class="home-category-scroll-button" type="button" data-scroll-categories="next" aria-label="Scroll categories to the right" title="Next categories">›</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    const rail = root.querySelector('#homeCategoryRail');
    const previous = root.querySelector('[data-scroll-categories="previous"]');
    const next = root.querySelector('[data-scroll-categories="next"]');
    const counter = root.querySelector('.home-category-count');
    const progress = root.querySelector('.home-category-progress');
    const fill = progress && progress.querySelector('span');
    if (!rail || !previous || !next || !counter || !progress || !fill) return;

    const cards = () => Array.from(rail.querySelectorAll('.home-menu-category'));
    let mouseDown = false;
    let dragStartX = 0;
    let dragStartScroll = 0;
    let dragged = false;
    let suppressClick = false;

    function updateControls(){
      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
      const current = Math.max(0, Math.min(maxScroll, rail.scrollLeft));
      const ratio = maxScroll > 1 ? current / maxScroll : 0;
      const card = cards()[0];
      const cardWidth = card ? card.getBoundingClientRect().width : 0;
      const style = window.getComputedStyle(rail);
      const gap = parseFloat(style.columnGap || style.gap) || 0;
      const step = cardWidth + gap;
      const visibleCount = step > 0 ? Math.max(1, Math.floor((rail.clientWidth + gap) / step)) : 1;
      const firstIndex = step > 0 ? Math.min(rows.length, Math.max(1, Math.floor((current + 2) / step) + 1)) : 1;
      const lastIndex = Math.min(rows.length, firstIndex + visibleCount - 1);

      previous.disabled = current <= 2;
      next.disabled = maxScroll <= 2 || current >= maxScroll - 2;
      counter.textContent = rows.length ? firstIndex + '–' + lastIndex + ' / ' + rows.length : '';
      progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
      fill.style.width = (maxScroll <= 2 ? 100 : 8 + ratio * 92) + '%';
      root.classList.toggle('has-category-overflow', maxScroll > 2);
      root.classList.toggle('is-category-static', maxScroll <= 2);
    }

    function scrollRail(direction){
      const distance = Math.max(rail.clientWidth * 0.82, 1);
      rail.scrollBy({ left: direction * distance, behavior: scrollBehavior() });
    }

    previous.addEventListener('click', () => scrollRail(-1));
    next.addEventListener('click', () => scrollRail(1));
    rail.addEventListener('scroll', updateControls, { passive: true });
    rail.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') { event.preventDefault(); scrollRail(1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); scrollRail(-1); }
      else if (event.key === 'Home') { event.preventDefault(); rail.scrollTo({ left: 0, behavior: scrollBehavior() }); }
      else if (event.key === 'End') { event.preventDefault(); rail.scrollTo({ left: rail.scrollWidth, behavior: scrollBehavior() }); }
    });

    // Native touch scrolling works on phones; this adds true click-and-drag on desktop.
    rail.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button')) return;
      mouseDown = true;
      dragged = false;
      dragStartX = event.clientX;
      dragStartScroll = rail.scrollLeft;
    });
    window.addEventListener('pointermove', event => {
      if (!mouseDown) return;
      const delta = event.clientX - dragStartX;
      if (Math.abs(delta) > 5) {
        dragged = true;
        rail.classList.add('is-dragging');
        rail.scrollLeft = dragStartScroll - delta;
        event.preventDefault();
      }
    }, { passive: false });
    window.addEventListener('pointerup', () => {
      if (!mouseDown) return;
      mouseDown = false;
      rail.classList.remove('is-dragging');
      if (dragged) {
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 280);
        window.setTimeout(updateControls, 30);
      }
    });
    rail.addEventListener('click', event => {
      if (suppressClick) { event.preventDefault(); event.stopPropagation(); }
    }, true);

    window.addEventListener('resize', updateControls, { passive: true });
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(updateControls);
      observer.observe(rail);
    }
    requestAnimationFrame(updateControls);
  }

  async function load(){
    syncLoyaltyProgress();
    document.querySelectorAll('[data-points]').forEach(node => {
      if ('MutationObserver' in window) {
        const observer = new MutationObserver(syncLoyaltyProgress);
        observer.observe(node, { childList: true, characterData: true, subtree: true });
        pointsObserver = observer;
      }
    });
    try {
      if (!window.sb || typeof window.sb.from !== 'function') throw new Error('Database connection is not ready.');
      const { data, error } = await window.sb.from('menu_categories')
        .select('id,name,icon,image_url,sort_order,is_active,status')
        .order('sort_order', { ascending: true });
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : [])
        .filter(row => row && String(row.name || '').trim() && row.is_active !== false && String(row.status || 'active').toLowerCase() !== 'inactive')
        .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));

      if (!rows.length) { renderMessage('No active menu categories are available yet.'); return; }
      renderCarousel(rows);
    } catch (error) {
      console.error('Could not load customer home categories:', error?.message || error);
      renderMessage('Menu categories are temporarily unavailable. Please open the full menu.', true);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else void load();
})();
