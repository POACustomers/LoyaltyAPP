(function customerHomeCategories(){
  'use strict';
  const root = document.getElementById('homeMenuCategories');
  if (!root) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const safeImage = value => {
    const src = String(value || '').trim();
    return (/^https:\/\//i.test(src) || /^data:image\/(png|jpe?g|webp);base64,/i.test(src)) ? src : '';
  };

  function renderMessage(message, isError=false){
    root.innerHTML = '<div class="home-category-message'+(isError?' is-error':'')+'">'+esc(message)+'</div>'+
      '<a class="home-category-browse-link" href="customer-menu.html">Browse full menu <span aria-hidden="true">→</span></a>';
  }

  async function load(){
    try{
      if(!window.sb || typeof window.sb.from !== 'function') throw new Error('Database connection is not ready.');
      const {data,error}=await window.sb.from('menu_categories').select('*').order('sort_order',{ascending:true});
      if(error) throw error;
      const rows=(Array.isArray(data)?data:[])
        .filter(row=>row && String(row.name||'').trim() && row.is_active!==false && String(row.status||'active').toLowerCase()!=='inactive')
        .sort((a,b)=>(Number(a.sort_order)||0)-(Number(b.sort_order)||0));
      if(!rows.length){
        renderMessage('No active menu categories are available yet.');
        return;
      }
      const shown=rows.slice(0,6);
      root.innerHTML='<div class="home-menu-category-grid">'+shown.map(category=>{
        const name=String(category.name||'').trim();
        const image=safeImage(category.image_url);
        const media=image
          ? '<img class="home-menu-category-image" src="'+esc(image)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="home-menu-category-icon" aria-hidden="true" hidden>'+esc(category.icon||'☕')+'</span>'
          : '<span class="home-menu-category-icon" aria-hidden="true">'+esc(category.icon||'☕')+'</span>';
        return '<a class="home-menu-category" href="customer-menu.html?category='+encodeURIComponent(name)+'" aria-label="Open category '+esc(name)+'"><span class="home-menu-category-media">'+media+'</span><span class="home-menu-category-name">'+esc(name)+'</span></a>';
      }).join('')+'</div>'+(rows.length>6?'<a class="home-category-browse-link" href="customer-menu.html">Browse all '+rows.length+' categories <span aria-hidden="true">→</span></a>':'');
    }catch(error){
      console.error('Could not load customer home categories:',error?.message||error);
      renderMessage('Menu categories are temporarily unavailable. Please open the full menu.',true);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',load,{once:true});
  else void load();
})();
