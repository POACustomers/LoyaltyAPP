/* Dina's Corner PWA install bottom sheet — concise, device-aware, non-blocking. */
(function () {
  'use strict';
  if (window.__POA_PWA_INSTALL_SHEET_V3__) return;
  window.__POA_PWA_INSTALL_SHEET_V3__ = true;

  var deferredPrompt = null;
  var backdrop = null;
  var card = null;
  var actionButton = null;
  var laterButton = null;
  var hint = null;
  var dismissedForSession = false;
  var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(navigator.userAgent);
  var iosInAppBrowser = isIOS && /(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/i.test(navigator.userAgent);
  var scriptUrl = (function () {
    var s = document.currentScript;
    return s && s.src ? s.src : '';
  })();

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
    return true; // Arabic is the first-use default; the visible language selector can switch to English.
  }

  var copy = {
    ar: {
      titleAndroid: 'ثبّت Dina’s Corner',
      bodyAndroid: 'افتح التطبيق بسرعة من الشاشة الرئيسية.',
      actionAndroid: 'تثبيت التطبيق',
      titleIOS: 'أضف التطبيق إلى الشاشة الرئيسية',
      bodyIOS: 'احتفظ بـ Dina’s Corner على هاتفك وافتحه مثل أي تطبيق.',
      actionIOS: 'إضافة للشاشة الرئيسية',
      titleOther: 'أضف Dina’s Corner إلى جهازك',
      bodyOther: 'افتح التطبيق مباشرةً من الشاشة الرئيسية.',
      actionOther: 'إضافة التطبيق',
      later: 'لاحقًا',
      hintIOS: 'افتح «مشاركة» في Safari، ثم اختر «إضافة إلى الشاشة الرئيسية».',
      hintIOSInApp: 'افتح الرابط في Safari أولًا، ثم اختر «إضافة إلى الشاشة الرئيسية».',
      hintAndroid: 'لم يظهر التثبيت المباشر في هذا المتصفح. افتح الرابط في Chrome ثم اختر «تثبيت التطبيق» من القائمة.',
      hintOther: 'افتح قائمة المتصفح وابحث عن «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».',
      ack: 'حسنًا',
      close: 'إغلاق'
    },
    en: {
      titleAndroid: 'Install Dina’s Corner',
      bodyAndroid: 'Open the app quickly from your Home screen.',
      actionAndroid: 'Install App',
      titleIOS: 'Add the app to your Home Screen',
      bodyIOS: 'Keep Dina’s Corner on your phone and open it like any app.',
      actionIOS: 'Add to Home Screen',
      titleOther: 'Add Dina’s Corner to your device',
      bodyOther: 'Open the app directly from your Home screen.',
      actionOther: 'Add App',
      later: 'Later',
      hintIOS: 'In Safari, tap Share, then choose “Add to Home Screen”.',
      hintIOSInApp: 'Open this link in Safari first, then choose “Add to Home Screen”.',
      hintAndroid: 'Direct install is unavailable in this browser. Open the link in Chrome and choose “Install app” from its menu.',
      hintOther: 'Open your browser menu and look for “Install app” or “Add to Home Screen”.',
      ack: 'Got it',
      close: 'Close'
    }
  };

  function installStyles() {
    if (document.getElementById('poa-pwa-install-css')) return;
    var link = document.createElement('link');
    link.id = 'poa-pwa-install-css';
    link.rel = 'stylesheet';
    if (scriptUrl) link.href = new URL('pwa-install.css?v=20261020-after-order-v4', scriptUrl).href;
    document.head.appendChild(link);
  }

  function createUI() {
    if (document.getElementById('poa-pwa-install-backdrop')) {
      backdrop = document.getElementById('poa-pwa-install-backdrop');
      card = backdrop.querySelector('.poa-pwa-install-card');
      actionButton = backdrop.querySelector('.poa-pwa-install-primary');
      laterButton = backdrop.querySelector('.poa-pwa-install-secondary');
      hint = backdrop.querySelector('.poa-pwa-install-hint');
      return;
    }

    backdrop = document.createElement('div');
    backdrop.id = 'poa-pwa-install-backdrop';
    backdrop.className = 'poa-pwa-install-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');

    var iconUrl = scriptUrl ? new URL('../assets/icons/icon-192.png', scriptUrl).href : '../assets/icons/icon-192.png';
    backdrop.innerHTML =
      '<section class="poa-pwa-install-card" role="dialog" aria-modal="false" aria-labelledby="poa-pwa-install-title">' +
        '<div class="poa-pwa-install-grabber" aria-hidden="true"><span></span></div>' +
        '<div class="poa-pwa-install-head">' +
          '<img class="poa-pwa-install-icon" src="' + iconUrl + '" alt="" width="74" height="74" />' +
          '<div class="poa-pwa-install-titles">' +
            '<h2 id="poa-pwa-install-title" class="poa-pwa-install-title"></h2>' +
            '<p class="poa-pwa-install-body"></p>' +
          '</div>' +
        '</div>' +
        '<p class="poa-pwa-install-hint" hidden></p>' +
        '<div class="poa-pwa-install-actions">' +
          '<button type="button" class="poa-pwa-install-primary"></button>' +
          '<button type="button" class="poa-pwa-install-secondary"></button>' +
        '</div>' +
      '</section>';
    document.body.appendChild(backdrop);

    card = backdrop.querySelector('.poa-pwa-install-card');
    actionButton = backdrop.querySelector('.poa-pwa-install-primary');
    laterButton = backdrop.querySelector('.poa-pwa-install-secondary');
    hint = backdrop.querySelector('.poa-pwa-install-hint');

    actionButton.addEventListener('click', installOrShowShortHint);
    laterButton.addEventListener('click', function () { hidePrompt(true); });
    backdrop.addEventListener('click', function (event) {
      // The area outside the sheet remains usable and closes the non-blocking prompt.
      if (event.target === backdrop) hidePrompt(true);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !backdrop.hidden) hidePrompt(true);
    });
    render();
  }

  function render() {
    if (!backdrop) return;
    var c = isArabic() ? copy.ar : copy.en;
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
    laterButton.textContent = c.later;
    backdrop.dir = isArabic() ? 'rtl' : 'ltr';
    if (hint && !hint.hidden) {
      actionButton.textContent = c.ack;
      actionButton.dataset.mode = 'ack';
    } else {
      actionButton.dataset.mode = 'install';
    }
  }

  function showPrompt(force) {
    if (!backdrop || isStandalone()) return;
    if (!force && dismissedForSession) return;
    render();
    backdrop.hidden = false;
    backdrop.setAttribute('aria-hidden', 'false');
    // Force a layout before animating the bottom sheet into view.
    void card.offsetHeight;
    card.classList.add('poa-pwa-install-visible');
  }

  function hidePrompt(dismissed) {
    if (!backdrop) return;
    card.classList.remove('poa-pwa-install-visible', 'poa-pwa-install-hint-visible');
    backdrop.setAttribute('aria-hidden', 'true');
    window.setTimeout(function () {
      if (!card.classList.contains('poa-pwa-install-visible')) backdrop.hidden = true;
    }, 230);
    if (hint) { hint.hidden = true; hint.textContent = ''; }
    if (actionButton) { actionButton.disabled = false; actionButton.dataset.mode = 'install'; }
    if (dismissed) dismissedForSession = true;
  }

  async function installOrShowShortHint() {
    var c = isArabic() ? copy.ar : copy.en;
    if (actionButton.dataset.mode === 'ack') {
      if (hint) { hint.hidden = true; hint.textContent = ''; }
      card.classList.remove('poa-pwa-install-hint-visible');
      render();
      return;
    }

    if (isIOS) {
      // iOS does not expose an API to invoke Add to Home Screen directly.
      hint.textContent = iosInAppBrowser ? c.hintIOSInApp : c.hintIOS;
      hint.hidden = false;
      card.classList.add('poa-pwa-install-hint-visible');
      actionButton.textContent = c.ack;
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
        actionButton.disabled = false;
        if (choice && choice.outcome === 'accepted') {
          hidePrompt(false);
          return;
        }
        render();
      } catch (_) {
        actionButton.disabled = false;
        hint.textContent = isAndroid ? c.hintAndroid : c.hintOther;
        hint.hidden = false;
        card.classList.add('poa-pwa-install-hint-visible');
        actionButton.textContent = c.ack;
        actionButton.dataset.mode = 'ack';
      }
      return;
    }

    hint.textContent = isAndroid ? c.hintAndroid : c.hintOther;
    hint.hidden = false;
    card.classList.add('poa-pwa-install-hint-visible');
    actionButton.textContent = c.ack;
    actionButton.dataset.mode = 'ack';
  }

  function markInstalled() {
    hidePrompt(false);
  }

  function init() {
    if (!document.body || isStandalone()) return;
    installStyles();
    createUI();
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredPrompt = event;
      // The browser makes this event available only on supported browsers.
      render();
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

    // The install prompt is intentionally not shown on page load. It is called only after an order succeeds.

    try {
      if (window.matchMedia) {
        var media = window.matchMedia('(display-mode: standalone)');
        if (media.addEventListener) media.addEventListener('change', function (event) { if (event.matches) markInstalled(); });
        else if (media.addListener) media.addListener(function (event) { if (event.matches) markInstalled(); });
      }
    } catch (_) {}
  }

  // Public entry point used by the successful checkout flow.
  // Install permission still requires a clear user gesture; iOS does not expose a programmatic
  // Add to Home Screen API, so the iOS action shows the short native-workflow hint only after tap.
  window.POAInstallPrompt = window.POAInstallPrompt || {};
  window.POAInstallPrompt.showAfterOrder = function () {
    if (isStandalone()) return false;
    var key = 'poa_pwa_install_after_order_last_shown';
    var now = Date.now();
    var last = 0;
    try { last = Number(localStorage.getItem(key) || 0); } catch (_) {}
    // Avoid nagging repeat customers: at most once every 7 days on this device.
    if (last && now - last < 7 * 24 * 60 * 60 * 1000) return false;
    try { localStorage.setItem(key, String(now)); } catch (_) {}
    dismissedForSession = false;
    if (!backdrop) {
      // If the page loaded late, initialize the sheet before showing it.
      if (document.body) {
        installStyles();
        createUI();
      }
    }
    if (!backdrop) return false;
    showPrompt(true);
    return true;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
