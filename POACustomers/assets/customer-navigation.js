(function customerNavigation(){
  'use strict';

  const menus = () => Array.from(document.querySelectorAll('[data-customer-top-menu]'));

  function closeMenus(except){
    menus().forEach(menu => { if(menu !== except) menu.open = false; });
  }

  document.addEventListener('click', event => {
    const menu = event.target.closest && event.target.closest('[data-customer-top-menu]');
    if(!menu) closeMenus();
    else if(event.target.closest('a, #poaLanguageSwitcher, .customer-menu-logout')) closeMenus();
  });

  document.addEventListener('keydown', event => {
    if(event.key === 'Escape'){
      const opened = menus().find(menu => menu.open);
      if(opened){ opened.open = false; opened.querySelector('summary')?.focus(); }
    }
  });

  function markCurrentTopMenuLink(){
    const path = (window.location.pathname || '').toLowerCase();
    document.querySelectorAll('[data-customer-link]').forEach(link => {
      try {
        const target = new URL(link.getAttribute('href'), window.location.href).pathname.toLowerCase();
        if(target === path) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      } catch(_) {}
    });
  }

  function installBottomNavigation(){
    const page = (document.body?.dataset.page || '').toLowerCase();
    if(!page || ['customer-login','customer-register'].includes(page)) return;
    if(document.querySelector('.customer-bottom-nav')) return;

    // Visual order left-to-right: Home, My Order, Location, Rewards, Profile.
    // Therefore the requested reading order right-to-left is Profile, Rewards, Location, My Order, Home.
    const items = [
      {label:'Home', href:'customer-home.html', match:['customer-home'], icon:'<path d="m3 10 9-7 9 7"/><path d="M5 9v11h5v-6h4v6h5V9"/>'},
      {label:'My Order', href:'customer-orders.html', match:['customer-orders'], icon:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'},
      {label:'Location', href:'customer-locations.html', match:['customer-locations'], icon:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'},
      {label:'Rewards', href:'customer-rewards.html', match:['customer-rewards'], icon:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>'},
      {label:'Profile', href:'customer-profile.html', match:['customer-profile'], icon:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'}
    ];
    const nav = document.createElement('nav');
    nav.className = 'customer-bottom-nav';
    nav.setAttribute('aria-label','Customer navigation');
    const inner = document.createElement('div');
    inner.className = 'customer-bottom-nav__inner';
    const current = page.replace(/^customer-/, 'customer-');
    items.forEach(item => {
      const a = document.createElement('a');
      a.href = item.href;
      if(item.match.includes(current)) a.setAttribute('aria-current','page');
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+item.icon+'</svg><span>'+item.label+'</span>';
      inner.appendChild(a);
    });
    nav.appendChild(inner);
    document.body.appendChild(nav);
    document.body.classList.add('has-customer-bottom-nav');
  }

  function init(){ markCurrentTopMenuLink(); installBottomNavigation(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
