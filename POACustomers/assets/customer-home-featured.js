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
  function renderProducts(rows){
    if(!root)return;
    const active=(Array.isArray(rows)?rows:[]).filter(row=>row&&row.is_active!==false&&safeImage(row.image_url));
    if(!active.length){
      root.innerHTML='<p class="customer-home-best-sellers__status" role="status">Popular products coming soon.</p>';
      return;
    }
    const slideBasis=100/active.length;
    root.innerHTML='<div class="customer-home-best-sellers__stage" role="region" aria-label="Best-selling products" aria-roledescription="carousel">'+
      '<div class="customer-home-best-sellers__track" style="width:'+(active.length*100)+'%">'+
      active.map((row,index)=>'<div class="customer-home-best-sellers__slide" style="flex-basis:'+slideBasis+'%" aria-hidden="'+(index===0?'false':'true')+'">'+
        '<img class="customer-home-best-seller-image" src="'+esc(safeImage(row.image_url))+'" alt="Best-selling product '+(index+1)+'" loading="'+(index<2?'eager':'lazy')+'" decoding="async" draggable="false">'+
      '</div>').join('')+
      '</div></div>';
    const stage=root.querySelector('.customer-home-best-sellers__stage');
    const track=root.querySelector('.customer-home-best-sellers__track');
    const slides=Array.from(root.querySelectorAll('.customer-home-best-sellers__slide'));
    if(!stage||!track||slides.length<2)return;
    let index=0;
    const step=()=>{
      index=(index+1)%slides.length;
      track.style.transform='translate3d(-'+(index*slideBasis)+'%,0,0)';
      slides.forEach((slide,slideIndex)=>{
        slide.setAttribute('aria-hidden',slideIndex===index?'false':'true');
        const img=slide.querySelector('img');
        if(img&&slideIndex===((index+1)%slides.length))img.loading='eager';
      });
    };
    let timer=0;
    const stop=()=>{if(timer){window.clearInterval(timer);timer=0;}};
    const start=()=>{
      stop();
      if(document.visibilityState==='visible'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        timer=window.setInterval(step,3000);
      }
    };
    document.addEventListener('visibilitychange',start);
    start();
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
