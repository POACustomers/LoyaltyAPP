(function customerNavigation(){
  'use strict';

  const menus = () => Array.from(document.querySelectorAll('[data-customer-top-menu]'));
  const page = () => String(document.body?.dataset?.page || '').toLowerCase();

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

  function currentCustomerNavKey(){
    const currentPage = page();
    const path = (window.location.pathname || '').toLowerCase();
    const hash = (window.location.hash || '').toLowerCase();
    const leaf = path.split('/').pop() || '';
    if(leaf === 'customer-home.html' && hash === '#homeofferscard') return 'offers';
    if(currentPage === 'customer-home') return 'home';
    if(currentPage === 'customer-menu') return 'menu';
    if(currentPage === 'customer-orders' || currentPage === 'customer-order-history') return 'orders';
    if(currentPage === 'customer-card' || currentPage === 'customer-rewards') return 'loyalty';
    if(leaf === 'customer-offers.html') return 'offers';
    return '';
  }

  function updateBottomNavigationActive(){
    const nav = document.querySelector('[data-customer-bottom-nav]');
    if(!nav) return;
    const activeKey = currentCustomerNavKey();
    nav.querySelectorAll('[data-nav-key]').forEach(link => {
      const active = link.dataset.navKey === activeKey;
      link.classList.toggle('is-active', active);
      if(active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function renderBottomNavigation(){
    const currentPage = page();
    const excluded = new Set(['customer-login', 'customer-register']);
    if(!currentPage.startsWith('customer-') || excluded.has(currentPage)) return;
    if(document.querySelector('[data-customer-bottom-nav]')) return;

    const items = [
      {key:'home', label:'Home', href:'customer-home.html', icon:'<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>'},
      {key:'menu', label:'Menu', href:'customer-menu.html', icon:'<path d="M4 5h16M4 10h16M4 15h10M4 20h10"/>'},
      {key:'offers', label:'Offers', href:'customer-home.html#homeOffersCard', icon:'<path d="M20.5 12 12 20.5 3.5 12V4h8z"/><circle cx="8" cy="8" r="1"/>'},
      {key:'orders', label:'Orders', href:'customer-order-history.html', icon:'<path d="M6 3h12a2 2 0 0 1 2 2v16H4V5a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h5"/>'},
      {key:'loyalty', label:'Loyalty', href:'customer-card.html', icon:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h3M15 15h1"/>'}
    ];

    const nav = document.createElement('nav');
    nav.className = 'customer-bottom-nav';
    nav.setAttribute('aria-label', 'Customer navigation');
    nav.setAttribute('data-customer-bottom-nav', '');
    nav.innerHTML = items.map(item => {
      return '<a class="customer-bottom-nav__item" data-nav-key="' + item.key + '" href="' + item.href + '">' +
        '<svg class="customer-bottom-nav__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + item.icon + '</svg>' +
        '<span>' + item.label + '</span></a>';
    }).join('');
    document.body.appendChild(nav);
    document.body.classList.add('has-customer-bottom-nav');
    updateBottomNavigationActive();
  }

  function markCurrentTopMenuLink(){
    const path = (window.location.pathname || '').toLowerCase();
    document.querySelectorAll('[data-customer-link]').forEach(link => {
      try {
        const target = new URL(link.getAttribute('href'), window.location.href).pathname.toLowerCase();
        if(target === path) link.setAttribute('aria-current', 'page');
      } catch(_) {}
    });
  }

  function init(){
    markCurrentTopMenuLink();
    renderBottomNavigation();
  }
  window.addEventListener('hashchange', updateBottomNavigationActive);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
