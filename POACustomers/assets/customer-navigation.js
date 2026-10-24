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

  function init(){ markCurrentTopMenuLink(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
