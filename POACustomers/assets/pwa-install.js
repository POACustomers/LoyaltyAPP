/* Dina's Corner PWA install prompt — concise, device-aware flow. */
(function () {
  'use strict';
  if (window.__POA_PWA_INSTALL_PROMPT__) return;
  window.__POA_PWA_INSTALL_PROMPT__ = true;

  var deferredPrompt = null;
  var card = null;
  var backdrop = null;
  var actionButton = null;
  var closeButton = null;
  var laterButton = null;
  var hint = null;
  var dismissedForSession = false;
  var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(navigator.userAgent);
  var iosInAppBrowser = isIOS && /(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/i.test(navigator.userAgent);

  function isStandalone() {
    return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
      navigator.standalone === true);
  }
  function isArabic() {
    try {
      var saved = localStorage.getItem('poa_language');
      if (saved === 'ar') return true;
      if (saved === 'en') return false;
    } catch (_) {}
    return true; // keep Arabic as the first-use default, matching the product's language switcher.
  }

  var text = {
    ar: {
      button: 'تثبيت التطبيق',
      titleAndroid: 'ثبّت التطبيق على هاتفك',
      bodyAndroid: 'افتح Dina’s Corner من أيقونة على الشاشة الرئيسية — بخطوة واحدة.',
      actionAndroid: 'تثبيت التطبيق',
      titleIOS: 'أضف التطبيق إلى الشاشة الرئيسية',
      bodyIOS: 'احتفظ بـ Dina’s Corner على هاتفك وافتحه مثل أي تطبيق.',
      actionIOS: 'إضافة إلى الشاشة الرئيسية',
      titleOther: 'أضف Dina’s Corner إلى جهازك',
      bodyOther: 'ثبّت التطبيق للوصول إليه مباشرة من الشاشة الرئيسية.',
      actionOther: 'متابعة التثبيت',
      later: 'لاحقًا',
      close: 'إغلاق',
      iosHintSafari: 'افتح الرابط في Safari، ثم اضغط مشاركة واختر «إضافة إلى الشاشة الرئيسية».',
      iosHint: 'من Safari اضغط «مشاركة»، ثم اختر «إضافة إلى الشاشة الرئيسية».',
      androidFallback: 'لم يظهر مربع التثبيت في هذا المتصفح. افتح الرابط في Chrome وحاول مرة أخرى.',
      genericFallback: 'افتح قائمة المتصفح وابحث عن «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».',
      installed: 'تم تثبيت التطبيق. افتحه من أيقونته على الشاشة الرئيسية.'
    },
    en: {
      button: 'Install App',
      titleAndroid: 'Install the app on your phone',
      bodyAndroid: 'Open Dina’s Corner from an icon on your Home screen.',
      actionAndroid: 'Install App',
      titleIOS: 'Add the app to your Home Screen',
      bodyIOS: 'Keep Dina’s Corner on your phone and open it like an app.',
      actionIOS: 'Add to Home Screen',
      titleOther: 'Add Dina’s Corner to your device',
      bodyOther: 'Install the app for one-tap access from your Home screen.',
      actionOther: 'Continue',
      later: 'Not now',
      close: 'Close',
      iosHintSafari: 'Open this link in Safari, tap Share, then choose “Add to Home Screen”.',
      iosHint: 'In Safari, tap Share, then choose “Add to Home Screen”.',
      androidFallback: 'The install prompt is not available in this browser. Open the link in Chrome and try again.',
      genericFallback: 'Open your browser menu and look for “Install app” or “Add to Home Screen”.',
      installed: 'App installed. Open it from your Home screen icon.'
    }
  };

  var scriptUrl = (function () {
    var s = document.currentScript;
    return s && s.src ? s.src : '';
  })();

  function installStyles() {
    if (document.getElementById('poa-pwa-install-css')) return;
    var link = document.createElement('link');
    link.id = 'poa-pwa-install-css';
    link.rel = 'stylesheet';
    if (scriptUrl) link.href = new URL('pwa-install.css', scriptUrl).href;
    document.head.appendChild(link);
  }

  function createUI() {
    if (document.getElementById('poa-pwa-install-trigger')) return;
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'poa-pwa-install-trigger';
    trigger.className = 'poa-pwa-install-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"></rect><path d="M12 7v8m-3-3 3 3 3-3M9 18h6"></path></svg><span class="poa-pwa-install-trigger-text"></span>';
    trigger.addEventListener('click', function () { showPrompt(true); });
    var topbar = document.querySelector('.topbar');
    var actions = topbar && topbar.querySelector(':scope > .poa-topbar-actions');
    if (actions) {
      var logout = actions.querySelector('.icon');
      if (logout) actions.insertBefore(trigger, logout); else actions.appendChild(trigger);
    } else {
      trigger.classList.add('poa-pwa-install-trigger-floating');
      document.body.appendChild(trigger);
    }

    backdrop = document.createElement('div');
    backdrop.id = 'poa-pwa-install-backdrop';
    backdrop.className = 'poa-pwa-install-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = '<section class="poa-pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="poa-pwa-install-title"><div class="poa-pwa-install-head"><span class="poa-pwa-install-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><rect x="4" y="4" width="40" height="40" rx="13" fill="#FBE7E6" stroke="#E9BFC4"/><path d="M24 11v19m-7-7 7 7 7-7M15 35h18" stroke="#9F4059" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div class="poa-pwa-install-titles"><h2 id="poa-pwa-install-title" class="poa-pwa-install-title"></h2><p class="poa-pwa-install-body"></p></div><button type="button" class="poa-pwa-install-close" aria-label="Close">×</button></div><p class="poa-pwa-install-hint" hidden></p><div class="poa-pwa-install-actions"><button type="button" class="poa-pwa-install-primary"></button><button type="button" class="poa-pwa-install-secondary"></button></div></section>';
    document.body.appendChild(backdrop);
    card = backdrop.querySelector('.poa-pwa-install-card');
    actionButton = backdrop.querySelector('.poa-pwa-install-primary');
    laterButton = backdrop.querySelector('.poa-pwa-install-secondary');
    closeButton = backdrop.querySelector('.poa-pwa-install-close');
    hint = backdrop.querySelector('.poa-pwa-install-hint');

    actionButton.dataset.mode = 'install';
    actionButton.addEventListener('click', function () {
      if (actionButton.dataset.mode === 'ack') { hidePrompt(true); return; }
      installOrShowQuickHint();
    });
    laterButton.addEventListener('click', function () { hidePrompt(true); });
    closeButton.addEventListener('click', function () { hidePrompt(true); });
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) hidePrompt(true);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !backdrop.hidden) hidePrompt(true);
    });
    render();
  }

  function render() {
    if (!backdrop) return;
    var c = isArabic() ? text.ar : text.en;
    var trigger = document.getElementById('poa-pwa-install-trigger');
    var triggerText = trigger && trigger.querySelector('.poa-pwa-install-trigger-text');
    if (triggerText) triggerText.textContent = c.button;
    if (trigger) { trigger.title = c.button; trigger.setAttribute('aria-label', c.button); }
    var title = backdrop.querySelector('.poa-pwa-install-title');
    var body = backdrop.querySelector('.poa-pwa-install-body');
    if (isIOS) {
      title.textContent = c.titleIOS;
      body.textContent = c.bodyIOS;
      actionButton.textContent = c.actionIOS;
    } else if (isAndroid) {
      title.textContent = c.titleAndroid;
      body.textContent = c.bodyAndroid;
      actionButton.textContent = c.actionAndroid;
    } else {
      title.textContent = c.titleOther;
      body.textContent = c.bodyOther;
      actionButton.textContent = c.actionOther;
    }
    if (hint && !hint.hidden) { actionButton.textContent = isArabic() ? 'حسنًا' : 'Got it'; actionButton.dataset.mode = 'ack'; }
    laterButton.textContent = c.later;
    closeButton.setAttribute('aria-label', c.close);
    backdrop.dir = isArabic() ? 'rtl' : 'ltr';
  }

  function showPrompt(force) {
    if (!backdrop || isStandalone()) return;
    if (!force && dismissedForSession) return;
    render();
    backdrop.hidden = false;
    document.body.classList.add('poa-pwa-install-open');
    window.setTimeout(function () { if (actionButton) actionButton.focus({ preventScroll: true }); }, 30);
  }

  function hidePrompt(dismissed) {
    if (!backdrop) return;
    backdrop.hidden = true;
    document.body.classList.remove('poa-pwa-install-open');
    if (hint) { hint.hidden = true; hint.textContent = ''; }
    if (actionButton) { actionButton.disabled = false; actionButton.dataset.mode = 'install'; }
    if (card) card.classList.remove('poa-pwa-install-hint-visible');
    if (dismissed) dismissedForSession = true;
  }

  async function installOrShowQuickHint() {
    var c = isArabic() ? text.ar : text.en;
    if (isIOS) {
      // iOS has no web API to invoke the native Add to Home Screen action.
      // Keep the fallback to one concise sentence; do not open a long instruction page.
      hint.textContent = iosInAppBrowser ? c.iosHintSafari : c.iosHint;
      hint.hidden = false;
      card.classList.add('poa-pwa-install-hint-visible');
      actionButton.textContent = isArabic() ? 'حسنًا' : 'Got it';
      actionButton.dataset.mode = 'ack';
      return;
    }
    if (deferredPrompt) {
      var promptEvent = deferredPrompt;
      deferredPrompt = null;
      actionButton.disabled = true;
      try {
        await promptEvent.prompt();
        var choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          hidePrompt(false);
        } else {
          actionButton.disabled = false;
          render();
        }
      } catch (_) {
        actionButton.disabled = false;
        hint.textContent = c.androidFallback;
        hint.hidden = false;
        card.classList.add('poa-pwa-install-hint-visible');
        render();
      }
      return;
    }
    hint.textContent = isAndroid ? c.androidFallback : c.genericFallback;
    hint.hidden = false;
    card.classList.add('poa-pwa-install-hint-visible');
    actionButton.textContent = isArabic() ? 'حسنًا' : 'Got it';
    actionButton.dataset.mode = 'ack';
  }

  function markInstalled() {
    var trigger = document.getElementById('poa-pwa-install-trigger');
    if (trigger) trigger.hidden = true;
    hidePrompt(false);
  }

  function init() {
    if (!document.body || isStandalone()) return;
    installStyles();
    createUI();
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredPrompt = event;
      if (hint) { hint.hidden = true; hint.textContent = ''; }
      if (actionButton) { actionButton.disabled = false; actionButton.dataset.mode = 'install'; }
      render();
      showPrompt(false);
    });
    window.addEventListener('appinstalled', markInstalled);
    window.addEventListener('storage', function (event) {
      if (event.key === 'poa_language') render();
    });
    if ('MutationObserver' in window) {
      var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].type === 'attributes' && (records[i].attributeName === 'dir' || records[i].attributeName === 'lang')) {
            render(); break;
          }
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dir', 'lang'] });
    }
    var seen = false;
    try { seen = sessionStorage.getItem('poa_pwa_install_prompt_seen') === '1'; } catch (_) {}
    if (!seen) {
      try { sessionStorage.setItem('poa_pwa_install_prompt_seen', '1'); } catch (_) {}
      window.setTimeout(function () { showPrompt(false); }, 650);
    }
    try {
      if (window.matchMedia) {
        var media = window.matchMedia('(display-mode: standalone)');
        if (media.addEventListener) media.addEventListener('change', function (event) { if (event.matches) markInstalled(); });
        else if (media.addListener) media.addListener(function (event) { if (event.matches) markInstalled(); });
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
