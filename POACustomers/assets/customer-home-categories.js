(function customerHomeCategories(){
  'use strict';
  const root = document.getElementById('homeMenuCategories');
  if (!root) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const safeImage = value => {
    const src = String(value || '').trim();
    return (/^https:\/\//i.test(src) || /^data:image\/(png|jpe?g|webp);base64,/i.test(src)) ? src : '';
  };
  function showMessage(message, isError = false) {
    root.innerHTML = '<div class="home-category-message'+(isError?' is-error':'')+'" role="status">'+esc(message)+'</div>';
  }
  function render(rows) {
    const withImages = rows.filter(row => safeImage(row.image_url));
    if (!withImages.length) { showMessage('Category images are being prepared.'); return; }
    root.innerHTML = '<div class="home-category-image-rail" id="homeCategoryRail" role="list" tabindex="0" aria-label="Swipe category images to explore" aria-roledescription="carousel">' +
      withImages.map(row => '<a class="home-menu-category" role="listitem" href="customer-menu.html?category='+encodeURIComponent(String(row.name||''))+'" aria-label="Open '+esc(row.name||'menu category')+'" title="'+esc(row.name||'Menu category')+'"><img class="home-menu-category-image" src="'+esc(safeImage(row.image_url))+'" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.closest(\'a\')?.remove()"></a>').join('') +
      '</div>';
    const rail = root.querySelector('#homeCategoryRail');
    if (!rail) return;
    let pointerDown = false, startX = 0, startLeft = 0, dragged = false, suppressClick = false;
    rail.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      pointerDown = true; dragged = false; startX = event.clientX; startLeft = rail.scrollLeft;
    });
    window.addEventListener('pointermove', event => {
      if (!pointerDown) return;
      const dx = event.clientX - startX;
      if (Math.abs(dx) > 5) {
        dragged = true; rail.classList.add('is-dragging'); rail.scrollLeft = startLeft - dx; event.preventDefault();
      }
    }, {passive:false});
    window.addEventListener('pointerup', () => {
      if (!pointerDown) return;
      pointerDown = false; rail.classList.remove('is-dragging');
      if (dragged) { suppressClick = true; window.setTimeout(() => { suppressClick = false; }, 250); }
    });
    rail.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } }, true);
    rail.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') { event.preventDefault(); rail.scrollBy({left: rail.clientWidth * .8, behavior:'smooth'}); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); rail.scrollBy({left: -rail.clientWidth * .8, behavior:'smooth'}); }
    });
  }
  async function load() {
    try {
      if (!window.sb || typeof window.sb.from !== 'function') throw new Error('Database connection is not ready.');
      const {data,error} = await window.sb.from('menu_categories').select('id,name,image_url,sort_order,is_active,status').order('sort_order',{ascending:true});
      if (error) throw error;
      const rows = (Array.isArray(data)?data:[]).filter(row => row && String(row.name||'').trim() && safeImage(row.image_url) && row.is_active !== false && String(row.status||'active').toLowerCase() !== 'inactive');
      if (!rows.length) { showMessage('Category images are being prepared.'); return; }
      render(rows);
    } catch (error) {
      console.error('Could not load customer home category images:', error?.message || error);
      showMessage('Category images are temporarily unavailable.', true);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once:true}); else void load();
})();
