(function customerTopNavigation(){
  'use strict';
  const menus = () => Array.from(document.querySelectorAll('[data-customer-top-menu]'));
  function closeMenus(except){menus().forEach(menu=>{if(menu!==except) menu.open=false;});}
  document.addEventListener('click', event=>{
    const menu = event.target.closest && event.target.closest('[data-customer-top-menu]');
    if(!menu) closeMenus();
    else if(event.target.closest('a')) closeMenus();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      const opened=menus().find(menu=>menu.open);
      if(opened){opened.open=false;opened.querySelector('summary')?.focus();}
    }
  });
  function markCurrentLink(){
    const path=(window.location.pathname||'').toLowerCase();
    document.querySelectorAll('[data-customer-link]').forEach(link=>{
      try{if(new URL(link.getAttribute('href'),window.location.href).pathname.toLowerCase()===path) link.setAttribute('aria-current','page');}
      catch(_){ }
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',markCurrentLink,{once:true});
  else markCurrentLink();
})();
