(function customerHomeFeaturedProducts(){
  'use strict';
  const root = document.getElementById('homeBestSellersRail');
  const avatarWrap = document.getElementById('homeCustomerAvatarWrap');
  const avatarImage = document.getElementById('homeCustomerAvatar');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const safeImage = value => {
    const src = String(value || '').trim();
    return (/^https:\/\//i.test(src) || /^data:image\/(png|jpe?g|webp);base64,/i.test(src)) ? src : '';
  };
  async function loadAvatar(){
    if (!avatarWrap || !avatarImage || !window.sb) return;
    try {
      const {data:userData} = await window.sb.auth.getUser();
      const uid = userData?.user?.id;
      let url = '';
      if (uid) {
        const {data,error} = await window.sb.from('profiles').select('avatar_url').eq('id',uid).maybeSingle();
        if (!error) url = safeImage(data?.avatar_url);
      }
      if (!url) return;
      avatarImage.onload = () => { avatarWrap.hidden = false; };
      avatarImage.onerror = () => { avatarWrap.hidden = true; avatarImage.removeAttribute('src'); };
      avatarImage.src = url;
    } catch (error) {
      console.warn('Could not load customer profile photo for loyalty card:', error?.message || error);
    }
  }
  function wireRailDrag(rail){
    if (!rail) return;
    let down=false,startX=0,startLeft=0,dragged=false,suppressClick=false;
    rail.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;down=true;dragged=false;startX=event.clientX;startLeft=rail.scrollLeft;});
    window.addEventListener('pointermove',event=>{if(!down)return;const dx=event.clientX-startX;if(Math.abs(dx)>5){dragged=true;rail.classList.add('is-dragging');rail.scrollLeft=startLeft-dx;event.preventDefault();}},{passive:false});
    window.addEventListener('pointerup',()=>{if(!down)return;down=false;rail.classList.remove('is-dragging');if(dragged){suppressClick=true;window.setTimeout(()=>{suppressClick=false;},240);}});
    rail.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();}},true);
  }
  function renderProducts(rows){
    if(!root)return;
    const active = (Array.isArray(rows)?rows:[]).filter(row=>row&&row.is_active!==false&&safeImage(row.image_url));
    if(!active.length){root.innerHTML='<p class="customer-home-best-sellers__status" role="status">Popular products coming soon.</p>';return;}
    root.innerHTML=active.map((row,index)=>'<img class="customer-home-best-seller-image" src="'+esc(safeImage(row.image_url))+'" alt="Best-selling product '+(index+1)+'" loading="'+(index<3?'eager':'lazy')+'" decoding="async" draggable="false">').join('');
    wireRailDrag(root);
  }
  async function loadProducts(){
    if(!root)return;
    try{
      if(!window.sb||typeof window.sb.from!=='function')throw new Error('Database connection is not ready.');
      const {data,error}=await window.sb.from('home_featured_products').select('id,image_url,sort_order,is_active').eq('is_active',true).order('sort_order',{ascending:true}).order('created_at',{ascending:true});
      if(error)throw error;
      renderProducts(data);
    }catch(error){
      console.error('Could not load best-selling product images:',error?.message||error);
      root.innerHTML='<p class="customer-home-best-sellers__status" role="status">Popular products coming soon.</p>';
    }
  }
  function syncProgress(){
    const pointsNode=document.querySelector('.customer-home-loyalty [data-points]');
    const fill=document.querySelector('[data-home-points-progress]');
    const progress=document.querySelector('.customer-home-loyalty__progress');
    if(!pointsNode||!fill||!progress)return;
    const points=Math.max(0,Math.min(50,Number.parseInt(pointsNode.textContent||'0',10)||0));
    fill.style.width=(points/50*100)+'%';progress.setAttribute('aria-valuenow',String(points));
  }
  function boot(){
    void loadAvatar();void loadProducts();syncProgress();
    document.querySelectorAll('.customer-home-loyalty [data-points]').forEach(node=>{if('MutationObserver'in window){new MutationObserver(syncProgress).observe(node,{childList:true,characterData:true,subtree:true});}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
