(function(){
  const categoriesView=document.getElementById('menuCategoriesView');
  const itemsView=document.getElementById('menuItemsView');

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const slug=v=>String(v??'').trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  let categories=[];
  let items=[];

  // Only display categories that are actually saved in this POACustomers database.
  // There is deliberately no demo/fallback catalog; the owner creates their own menu.
  function normalizeCategoryRows(rows){
    return (Array.isArray(rows)?rows:[])
      .filter(r=>r && String(r.name||'').trim() && r.is_active!==false && String(r.status||'active').toLowerCase()!=='inactive')
      .map((r,i)=>({
        id:r.id,
        name:String(r.name).trim(),
        icon:r.icon||'☕',
        order:Number(r.sort_order??i),
        active:true,
        image_url:r.image_url||null
      }))
      .sort((a,b)=>a.order-b.order || a.name.localeCompare(b.name));
  }

  function isActiveItem(item){
    if(item==null)return false;
    if(item.is_active===false)return false;
    if(typeof item.active==='boolean' && item.active===false)return false;
    if(typeof item.status==='string' && item.status.trim().toLowerCase()==='inactive')return false;
    return true;
  }

  function categoryForItem(item){
    if(item.category_id){
      const exact=categories.find(c=>c.id===item.category_id);
      if(exact)return exact;
    }
    const n=slug(item.category_name||item.category);
    if(n){
      return categories.find(c=>slug(c.name)===n) || null;
    }
    return null;
  }

  function renderCategories(){
    itemsView.hidden=true;
    categoriesView.hidden=false;
    if(!categories.length){
      categoriesView.innerHTML='<div class="menu-empty">No menu categories have been added yet.</div>';
      return;
    }
    categoriesView.innerHTML='<div class="menu-grid">'+categories.map(cat=>{
      return '<button class="menu-category" type="button" data-category="'+esc(cat.name)+'">'
        +'<div class="menu-category-media">'
        +(cat.image_url ? '<img class="menu-category-image" src="'+esc(cat.image_url)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">' : '')
        +'<div class="menu-icon" aria-hidden="true"'+(cat.image_url?' hidden':'')+'>'+esc(cat.icon||'☕')+'</div>'
        +'</div>'
        +'<span class="menu-name">'+esc(cat.name)+'</span>'
        +'</button>'; 
    }).join('')+'</div>';
    categoriesView.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>renderItems(btn.dataset.category)));
  }

  function renderItems(name){
    const cat=categories.find(c=>c.name===name);
    const filtered=items.filter(item=>isActiveItem(item) && categoryForItem(item)?.name===name);
    itemsView.hidden=false;
    categoriesView.hidden=true;

    const rows=filtered.length?filtered.map(item=>{
      const image=item.image_url
        ? '<img class="menu-item-image" src="'+esc(item.image_url)+'" alt="'+esc(item.name||'Menu item')+'" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="menu-placeholder" aria-hidden="true" hidden>'+esc(cat?.icon||'☕')+'</div>'
        : '<div class="menu-placeholder" aria-hidden="true">'+esc(cat?.icon||'☕')+'</div>';
      const desc=item.description?'<small class="menu-item-description">'+esc(item.description)+'</small>':'';
      const rawPrice=Number(item.price);
      const price=Number.isFinite(rawPrice)?'AED '+rawPrice.toFixed(2):'';
      return '<article class="menu-item">'+image+'<div class="menu-item-copy"><strong class="menu-item-name">'+esc(item.name||'Menu item')+'</strong>'+desc+(price?'<span class="menu-item-price">'+price+'</span>':'')+'</div></article>';
    }).join(''):'<div class="menu-empty">No items in this category yet.</div>';

    itemsView.innerHTML='<div class="menu-head">'
      +'<button class="menu-back" type="button" aria-label="Back to categories">‹</button>'
      +'<div class="menu-head-icon" aria-hidden="true">'+esc(cat?.icon||'☕')+'</div>'
      +'<div class="menu-head-copy"><h2>'+esc(name)+'</h2><p>'+filtered.length+' item'+(filtered.length===1?'':'s')+'</p></div>'
      +'</div>'
      +'<p class="menu-small-note">Tap the back arrow to return to all categories.</p>'
      +'<div class="menu-list">'+rows+'</div>';
    itemsView.querySelector('.menu-back').addEventListener('click',renderCategories);
  }

  async function loadMenu(){
    if(!window.sb) throw new Error('Supabase configuration is not available.');

    const categoryResult=await sb.from('menu_categories').select('*').order('sort_order',{ascending:true});
    if(categoryResult.error) throw categoryResult.error;

    const itemResult=await sb.from('menu_items').select('*').order('created_at',{ascending:true});
    if(itemResult.error) throw itemResult.error;

    categories=normalizeCategoryRows(Array.isArray(categoryResult.data)?categoryResult.data:[]);
    items=Array.isArray(itemResult.data)?itemResult.data:[];
    renderCategories();
  }

  loadMenu().catch(err=>{
    categories=[];
    items=[];
    categoriesView.hidden=false;
    itemsView.hidden=true;
    categoriesView.innerHTML='<div class="menu-error"><strong>Menu could not be loaded from the database.</strong><br>'+esc(err?.message||'Please try again later.')+'<br><small>Ask the administrator to verify the POACustomers menu setup SQL.</small></div>';
  });
})();
