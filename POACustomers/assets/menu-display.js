(function(){
  const categoriesView=document.getElementById('menuCategoriesView');
  const itemsView=document.getElementById('menuItemsView');
  const cartPanel=document.getElementById('menu-cart');
  const cartBackdrop=document.getElementById('menuCartBackdrop');
  const cartButton=document.getElementById('menuCartButton');
  const cartButtonCount=document.getElementById('menuCartButtonCount');
  const cartButtonTotal=document.getElementById('menuCartButtonTotal');
  let cartFocusReturn=null;

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const slug=v=>String(v??'').trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  let categories=[];
  let items=[];
  let itemsLoaded=false;
  let itemsLoading=null;
  let activeCategoryName=null;
  let anchorScrollDone=false;
  const CART_KEY='poa_pickup_cart_v1';
  function cartRows(){
    try{
      const v=JSON.parse(localStorage.getItem(CART_KEY)||'[]');
      return Array.isArray(v)?v.filter(x=>x&&x.id&&Number(x.quantity)>0):[];
    }catch(_){return [];}
  }
  function itemQuantity(id){const row=cartRows().find(x=>String(x.id)===String(id));return row?Number(row.quantity)||0:0;}
  function normalizePrice(value){
    if(value===null||value===undefined||String(value).trim()==='')return null;
    const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
  }
  function money(value){
    const n=Number(value);
    return Number.isFinite(n)?(window.POA_FORMAT_CURRENCY?window.POA_FORMAT_CURRENCY(n):'EGP '+n.toFixed(2)):'To be confirmed';
  }
  function quantityCount(rows){return rows.reduce((sum,row)=>sum+(Number(row.quantity)||0),0);}

  function updateCartButton(cart=cartRows()){
    const count=quantityCount(cart);
    const known=cart.length>0&&cart.every(row=>normalizePrice(row.price)!==null);
    const total=known?cart.reduce((sum,row)=>sum+Number(row.price)*Number(row.quantity),0):null;
    if(cartButtonCount){cartButtonCount.textContent=String(count);cartButtonCount.hidden=count===0;}
    if(cartButtonTotal)cartButtonTotal.textContent=count===0?'Basket':(known?money(total):'View basket');
    if(cartButton)cartButton.setAttribute('aria-label',count===0?'Open shopping basket':`Open shopping basket, ${count} item${count===1?'':'s'}${known?', total '+money(total):''}`);
  }
  function openCart(){
    if(!cartBackdrop)return;
    renderCartPanel();
    cartFocusReturn=cartButton||document.activeElement;
    cartBackdrop.hidden=false;
    cartBackdrop.setAttribute('aria-hidden','false');
    document.body.classList.add('menu-cart-open');
    setTimeout(()=>cartPanel?.querySelector('[data-cart-close]')?.focus(),30);
  }
  function closeCart(){
    if(!cartBackdrop||cartBackdrop.hidden)return;
    cartBackdrop.hidden=true;
    cartBackdrop.setAttribute('aria-hidden','true');
    document.body.classList.remove('menu-cart-open');
    if(location.hash==='#menu-cart')history.replaceState(null,'',location.pathname+location.search);
    const focusTarget=cartFocusReturn;
    cartFocusReturn=null;
    if(focusTarget&&typeof focusTarget.focus==='function')setTimeout(()=>focusTarget.focus(),0);
  }
  function renderCartPanel(){
    if(!cartPanel)return;
    const cart=cartRows();
    const count=quantityCount(cart);
    const known=cart.length>0&&cart.every(row=>normalizePrice(row.price)!==null);
    const total=known?cart.reduce((sum,row)=>sum+Number(row.price)*Number(row.quantity),0):null;
    if(!cart.length){
      cartPanel.innerHTML='<div class="menu-cart-header"><div><p class="eyebrow">DINA\'S CORNER</p><h2 id="menuCartTitle">Your basket</h2></div><button type="button" class="menu-cart-close" data-cart-close aria-label="Close basket">×</button></div>'+ 
        '<div class="menu-cart-empty"><span class="menu-cart-empty-icon" aria-hidden="true">🛒</span><h3>Your basket is empty</h3><p>Add products from the menu and they will appear here.</p><button type="button" class="btn menu-cart-continue" data-cart-close>Continue shopping</button></div>';
      updateCartButton(cart);
      cartPanel.querySelectorAll('[data-cart-close]').forEach(btn=>btn.addEventListener('click',closeCart));
      return;
    }
    const rows=cart.map(row=>{
      const price=normalizePrice(row.price);
      const image=row.image_url
        ? '<img class="menu-cart-thumb" src="'+esc(row.image_url)+'" alt="'+esc(row.name)+'" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="menu-cart-thumb-fallback" aria-hidden="true" hidden>◉</span>'
        : '<span class="menu-cart-thumb-fallback" aria-hidden="true">◉</span>';
      return '<article class="menu-cart-row">'+image+
        '<div class="menu-cart-item-copy"><strong>'+esc(row.name||'Menu item')+'</strong>'+
        '<small>'+(price===null?'Price to be confirmed':esc(money(price))+' each')+'</small>'+
        (row.offer_id&&Number(row.offer_discount_pct)>0&&normalizePrice(row.original_price)!==null?'<span class="menu-offer-price-detail">'+esc(Number(row.offer_discount_pct))+'% product discount <span class="menu-offer-original"><del>'+esc(money(row.original_price))+'</del></span></span>':'')+
        '<div class="menu-cart-qty" role="group" aria-label="Quantity for '+esc(row.name||'item')+'">'+
        '<button type="button" data-cart-minus="'+esc(row.id)+'" aria-label="Decrease quantity">−</button>'+
        '<output aria-live="polite">'+Number(row.quantity)+'</output>'+
        '<button type="button" data-cart-plus="'+esc(row.id)+'" aria-label="Increase quantity">+</button></div></div>'+
        '<strong class="menu-cart-line-total">'+(price===null?'TBC':esc(money(price*Number(row.quantity))))+'</strong></article>';
    }).join('');
    cartPanel.innerHTML=
      '<div class="menu-cart-header"><div><p class="eyebrow">DINA\'S CORNER</p><h2 id="menuCartTitle">Your basket <span class="menu-cart-count"><span class="menu-cart-count-number">'+count+'</span> <span>'+(count===1?'item':'items')+'</span></span></h2></div>'+ 
      '<button type="button" class="menu-cart-close" data-cart-close aria-label="Close basket">×</button></div>'+ 
      '<div class="menu-cart-order-total"><span>Items subtotal</span><strong>'+(known?esc(money(total)):'To be confirmed')+'</strong></div>'+ 
      '<div class="menu-cart-lines">'+rows+'</div>'+ 
      '<div class="menu-cart-footer"><small>'+(cart.some(row=>row.offer_id&&Number(row.offer_discount_pct)>0)?'Offer prices apply to products only. '+(known?'Choose pickup at checkout.':'The branch will confirm the final price for items without a published price.'):known?'Choose pickup at checkout.':'The branch will confirm the final price for items without a published price.')+'</small>'+ 
      '<a class="btn menu-cart-checkout" href="customer-orders.html">Continue to checkout <span aria-hidden="true">→</span></a></div>';
    updateCartButton(cart);
    cartPanel.querySelectorAll('[data-cart-close]').forEach(btn=>btn.addEventListener('click',closeCart));
    cartPanel.querySelectorAll('[data-cart-minus]').forEach(btn=>btn.addEventListener('click',()=>{
      if(typeof window.POAChangeItemQuantity==='function')window.POAChangeItemQuantity(btn.dataset.cartMinus,-1);
      if(activeCategoryName)renderItems(activeCategoryName);
    }));
    cartPanel.querySelectorAll('[data-cart-plus]').forEach(btn=>btn.addEventListener('click',()=>{
      if(typeof window.POAChangeItemQuantity==='function')window.POAChangeItemQuantity(btn.dataset.cartPlus,1);
      if(activeCategoryName)renderItems(activeCategoryName);
    }));
  }
  window.POARenderMenuCart=renderCartPanel;
  window.POAOpenCart=openCart;
  window.POACloseCart=closeCart;
  cartButton?.addEventListener('click',openCart);
  cartBackdrop?.addEventListener('click',event=>{if(event.target===cartBackdrop)closeCart();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&cartBackdrop&&!cartBackdrop.hidden)closeCart();});
  window.addEventListener('hashchange',()=>{if(location.hash==='#menu-cart')openCart();});
  window.addEventListener('storage',event=>{
    if(event.key===CART_KEY){renderCartPanel();if(activeCategoryName)renderItems(activeCategoryName);}
  });
  // Only display categories that are actually saved in this POACustomers database.
  // There is deliberately no demo/fallback catalog; the owner creates their own menu.
  function normalizeCategoryRows(rows){
    return (Array.isArray(rows)?rows:[])
      .filter(r=>r && String(r.name||'').trim() && r.is_active!==false && String(r.status||'active').toLowerCase()!=='inactive')
      .map((r,i)=>({id:r.id,name:String(r.name).trim(),icon:r.icon||'☕',order:Number(r.sort_order??i),active:true,image_url:r.image_url||null}))
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
    if(item.category_id){const exact=categories.find(c=>String(c.id)===String(item.category_id));if(exact)return exact;}
    const n=slug(item.category_name||item.category);
    return n?(categories.find(c=>slug(c.name)===n)||null):null;
  }

  function renderCategories(){
    activeCategoryName=null;
    itemsView.hidden=true;
    categoriesView.hidden=false;
    if(!categories.length){categoriesView.innerHTML='<div class="menu-empty">No menu categories have been added yet.</div>';return;}
    // Restore the category image tiles. If an image is missing/broken, show the category icon.
    categoriesView.innerHTML='<div class="menu-grid">'+categories.map(cat=>
      '<button class="menu-category" type="button" data-category="'+esc(cat.name)+'"><div class="menu-category-media">'+
      (cat.image_url?'<img class="menu-category-image" src="'+esc(cat.image_url)+'" alt="" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">':'')+
      '<div class="menu-icon" aria-hidden="true"'+(cat.image_url?' hidden':'')+'>'+esc(cat.icon||'☕')+'</div></div><span class="menu-name">'+esc(cat.name)+'</span></button>'
    ).join('')+'</div>';
    categoriesView.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>openCategory(btn.dataset.category)));
  }

  async function ensureItemsLoaded(){
    if(itemsLoaded)return;
    if(itemsLoading)return itemsLoading;
    itemsLoading=(async()=>{
      const result=await sb.from('menu_items').select('*').order('created_at',{ascending:true});
      if(result.error)throw result.error;
      items=Array.isArray(result.data)?result.data:[];
      window.POACurrentMenuItems=items;
      itemsLoaded=true;
    })().finally(()=>{itemsLoading=null;});
    return itemsLoading;
  }

  async function openCategory(name){
    activeCategoryName=name;
    categoriesView.hidden=true;
    itemsView.hidden=false;
    itemsView.innerHTML='<div class="menu-loading">Loading menu items…</div>';
    try{
      await ensureItemsLoaded();
      renderItems(name);
    }catch(error){
      itemsView.innerHTML='<div class="menu-error"><strong>Menu items could not be loaded.</strong><br>'+esc(error?.message||'Please check your connection and try again.')+'<br><button class="menu-back" type="button" data-return-categories>Back to categories</button></div>';
      itemsView.querySelector('[data-return-categories]')?.addEventListener('click',renderCategories);
    }
  }

  function renderItems(name){
    activeCategoryName=name;
    const cat=categories.find(c=>c.name===name);
    const filtered=items.filter(item=>isActiveItem(item)&&categoryForItem(item)?.name===name);
    itemsView.hidden=false;categoriesView.hidden=true;
    const rows=filtered.length?filtered.map(item=>{
      const image=item.image_url
        ?'<img class="menu-item-image" src="'+esc(item.image_url)+'" alt="'+esc(item.name||'Menu item')+'" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="menu-placeholder" aria-hidden="true" hidden>'+esc(cat?.icon||'☕')+'</div>'
        :'<div class="menu-placeholder" aria-hidden="true">'+esc(cat?.icon||'☕')+'</div>';
      const desc=item.description?'<small class="menu-item-description">'+esc(item.description)+'</small>':'';
      const rawPrice=normalizePrice(item.price);
      const price=rawPrice!==null?money(rawPrice):'';
      const qty=itemQuantity(item.id);
      const pickupAction=qty>0
        ?'<div class="menu-qty-control" role="group" aria-label="Quantity for '+esc(item.name||'item')+'"><button type="button" class="menu-qty-btn" data-menu-minus="'+esc(item.id)+'" aria-label="Decrease quantity">−</button><output aria-live="polite">'+qty+'</output><button type="button" class="menu-qty-btn menu-qty-plus" data-add-to-order="'+esc(item.id)+'" aria-label="Increase quantity">+</button></div>'
        :'<button type="button" class="menu-add-order" data-add-to-order="'+esc(item.id)+'">+ Add</button>';
      return '<article class="menu-item">'+image+'<div class="menu-item-copy"><strong class="menu-item-name">'+esc(item.name||'Menu item')+'</strong>'+desc+(price?'<span class="menu-item-price">'+esc(price)+'</span>':'')+pickupAction+'</div></article>';
    }).join(''):'<div class="menu-empty">No items in this category yet.</div>';
    itemsView.innerHTML='<div class="menu-head menu-head--no-icon"><button class="menu-back" type="button" aria-label="Back to categories">‹</button><div class="menu-head-copy"><h2>'+esc(name)+'</h2><p>'+filtered.length+' item'+(filtered.length===1?'':'s')+'</p></div></div><p class="menu-small-note">Tap the back arrow to return to all categories.</p><div class="menu-list">'+rows+'</div>';
    itemsView.querySelector('.menu-back').addEventListener('click',renderCategories);
    itemsView.querySelectorAll('[data-menu-minus]').forEach(btn=>btn.addEventListener('click',()=>{
      if(typeof window.POAChangeItemQuantity==='function')window.POAChangeItemQuantity(btn.dataset.menuMinus,-1);
      renderItems(name);
    }));
    itemsView.querySelectorAll('[data-add-to-order]').forEach(btn=>btn.addEventListener('click',()=>{
      const item=items.find(row=>String(row.id)===String(btn.dataset.addToOrder));
      if(!item)return;
      if(typeof window.POAAddItemToCart==='function'){window.POAAddItemToCart(item);renderItems(name);}
      else alert('Order cart is not ready. Refresh the page and try again.');
    }));
  }

  async function loadMenu(){
    if(!window.sb)throw new Error('Supabase configuration is not available.');
    // Render categories as soon as their query returns. Menu items are fetched only
    // when a category is opened, so a large catalogue does not hold back the first screen.
    const categoryResult=await sb.from('menu_categories').select('id,name,icon,image_url,sort_order,is_active,status').order('sort_order',{ascending:true});
    if(categoryResult.error)throw categoryResult.error;
    categories=normalizeCategoryRows(Array.isArray(categoryResult.data)?categoryResult.data:[]);
    renderCategories();
    renderCartPanel();
    const requestedCategory = new URLSearchParams(window.location.search).get('category');
    if (requestedCategory) {
      const match = categories.find(category => category.name === requestedCategory);
      if (match) void openCategory(match.name);
    }
  }

  renderCartPanel();
  if(location.hash==='#menu-cart')openCart();
  loadMenu().catch(err=>{
    categories=[];items=[];categoriesView.hidden=false;itemsView.hidden=true;
    categoriesView.innerHTML='<div class="menu-error"><strong>Menu could not be loaded from the database.</strong><br>'+esc(err?.message||'Please try again later.')+'<br><small>Ask the company administrator to verify the menu database setup.</small></div>';
  });
})();
