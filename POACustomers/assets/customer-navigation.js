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

    const items = [
      {label:'Home', href:'customer-home.html', match:['customer-home'], icon:'<path d="m3 10 9-7 9 7"/><path d="M5 9v11h5v-6h4v6h5V9"/>'},
      {label:'Menu', href:'customer-menu.html', match:['customer-menu'], icon:'<path d="M4 6h16M4 12h16M4 18h16"/>'},
      {label:'Offers', href:'customer-offers.html', match:['customer-offers'], icon:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>'},
      {label:'Rewards', href:'customer-rewards.html', match:['customer-rewards'], icon:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M2 12h20M7 8c-3 0-4-5-1-5 3 0 6 5 6 5M17 8c3 0 4-5 1-5-3 0-6 5-6 5"/>'},
      {label:'My QR', href:'customer-card.html', match:['customer-card'], icon:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v2M17 20h4M20 18v3"/>'}
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
