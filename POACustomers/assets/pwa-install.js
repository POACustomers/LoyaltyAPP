/* POACustomers PWA install helper.
 * Android/Chromium: requests the official browser install prompt after a user tap.
 * iOS/iPadOS: explains the supported Add to Home Screen flow; installation cannot be forced by a web page.
 */
(function () {
  'use strict';
  if (window.__POA_PWA_INSTALL__) return;
  window.__POA_PWA_INSTALL__ = true;

  var deferredPrompt = null;
  var card = null;
  var detail = null;
  var installButton = null;
  var closeButton = null;
  var languageObserver = null;
  var dismissedForSession = false;
  var copy = null;

  var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isStandalone = function () {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches ||
      navigator.standalone === true;
  };
  var isArabic = function () {
    try {
      var saved = localStorage.getItem('poa_language');
      if (saved === 'ar') return true;
      if (saved === 'en') return false;
    } catch (_) {}
    return true; // Arabic is the default language on first use.
  };

  var messages = {
    ar: {
      button: 'تثبيت التطبيق',
      title: 'ثبّت التطبيق على هاتفك',
      bodyAndroid: 'أضف Dina’s Corner إلى الشاشة الرئيسية للوصول السريع، ثم أكّد التثبيت من نافذة المتصفح.',
      bodyIOS: 'للتثبيت على iPhone أو iPad، افتح الرابط في Safari ثم اختر «مشاركة» وبعدها «إضافة إلى الشاشة الرئيسية».',
      bodyOther: 'استخدم خيار التثبيت في المتصفح لإضافة Dina’s Corner إلى جهازك وفتحها كتطبيق مستقل.',
      install: 'تثبيت التطبيق الآن',
      how: 'طريقة التثبيت',
      close: 'إخفاء',
      iosTitle: 'إضافة التطبيق إلى شاشة iPhone',
      iosSteps: '<ol><li>افتح هذه الصفحة في <strong>Safari</strong> إذا كانت مفتوحة داخل تطبيق آخر.</li><li>اضغط زر <strong>مشاركة</strong> في Safari.</li><li>اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.</li><li>فعّل <strong>فتح كتطبيق ويب</strong> إذا ظهر الخيار، ثم اضغط <strong>إضافة</strong>.</li></ol>',
      androidTitle: 'تثبيت التطبيق على Android',
      androidSteps: '<ol><li>اضغط <strong>تثبيت التطبيق الآن</strong> إذا ظهر خيار التثبيت الرسمي.</li><li>وافق على رسالة المتصفح.</li><li>إذا لم تظهر الرسالة، افتح قائمة المتصفح ⋮ واختر <strong>تثبيت التطبيق</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.</li></ol>',
      genericSteps: '<ol><li>افتح قائمة المتصفح.</li><li>اختر <strong>Install app</strong> أو <strong>Add to Home Screen</strong> إذا كان الخيار متاحًا.</li></ol>',
      done: 'تم إخفاء رسالة التثبيت. يمكنك فتحها مرة أخرى من زر «تثبيت التطبيق».',
      note: 'التثبيت يحتاج تأكيدك من الجهاز؛ لا يستطيع QR تثبيت التطبيق بصمت.'
    },
    en: {
      button: 'Install App',
      title: 'Add the app to your phone',
      bodyAndroid: 'Add Dina’s Corner to your Home screen for quick access, then confirm installation in your browser.',
      bodyIOS: 'On iPhone or iPad, open this link in Safari, tap Share, then choose Add to Home Screen.',
      bodyOther: 'Use your browser’s install option to add Dina’s Corner to your device and open it like an app.',
      install: 'Install app now',
      how: 'How to install',
      close: 'Dismiss',
      iosTitle: 'Add the app to iPhone Home Screen',
      iosSteps: '<ol><li>Open this page in <strong>Safari</strong> if it was opened inside another app.</li><li>Tap Safari’s <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Enable <strong>Open as Web App</strong> if shown, then tap <strong>Add</strong>.</li></ol>',
      androidTitle: 'Install on Android',
      androidSteps: '<ol><li>Tap <strong>Install app now</strong> when the official install prompt is available.</li><li>Confirm the browser prompt.</li><li>If no prompt appears, open the browser menu ⋮ and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li></ol>',
      genericSteps: '<ol><li>Open your browser menu.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home Screen</strong> if available.</li></ol>',
      done: 'Install tip hidden. You can open it again with the Install App button.',
      note: 'Your device must confirm installation; a QR code cannot silently install an app.'
    }
  };

  function styleUrl() {
    var current = document.currentScript;
    // This is replaced below with an absolute base saved at boot, as currentScript is null in callbacks.
    return current && current.src ? new URL('pwa-install.css', current.src).href : null;
  }
  var currentScriptUrl = (function () {
    var s = document.currentScript;
    return s && s.src ? s.src : '';
  })();

  function installStyles() {
    if (document.getElementById('poa-pwa-install-css')) return;
    var link = document.createElement('link');
    link.id = 'poa-pwa-install-css';
    link.rel = 'stylesheet';
    link.href = currentScriptUrl ? new URL('pwa-install.css', currentScriptUrl).href : '';
    if (link.href) document.head.appendChild(link);
  }

  function ensureUi() {
    if (document.getElementById('poa-pwa-install-trigger')) return;
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'poa-pwa-install-trigger';
    trigger.className = 'poa-pwa-install-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"></rect><path d="M12 7v8m-3-3 3 3 3-3M9 18h6"></path></svg><span class="poa-pwa-install-trigger-text"></span>';
    trigger.addEventListener('click', function () {
      if (!card) buildCard();
      showCard(true);
      if (detail) detail.hidden = true;
      if (installButton) installButton.focus({ preventScroll: true });
    });

    var topbar = document.querySelector('.topbar');
    var actions = topbar && topbar.querySelector(':scope > .poa-topbar-actions');
    if (actions) {
      var signOutButton = actions.querySelector('.icon');
      if (signOutButton) actions.insertBefore(trigger, signOutButton);
      else actions.appendChild(trigger);
    } else {
      trigger.classList.add('poa-pwa-install-trigger-floating');
      document.body.appendChild(trigger);
    }
    if (document.querySelector('.nav, .bottom-nav, nav.navin')) document.body.classList.add('poa-pwa-has-bottom-nav');
    buildCard();
    renderCopy();
  }

  function buildCard() {
    if (card) return;
    card = document.createElement('aside');
    card.id = 'poa-pwa-install-card';
    card.className = 'poa-pwa-install-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-label', 'Install app');
    card.hidden = true;
    card.innerHTML = '<div class="poa-pwa-install-head"><span class="poa-pwa-install-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><rect x="5" y="5" width="38" height="38" rx="12" fill="#FBE7E6" stroke="#E9BFC4"/><path d="M24 13v16m-7-7 7 7 7-7M16 34h16" stroke="#9F4059" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div class="poa-pwa-install-titles"><h2 class="poa-pwa-install-title"></h2><p class="poa-pwa-install-body"></p></div><button type="button" class="poa-pwa-install-close" aria-label="Close">×</button></div><p class="poa-pwa-install-note"></p><div class="poa-pwa-install-detail" hidden></div><div class="poa-pwa-install-actions"><button type="button" class="poa-pwa-install-primary"></button><button type="button" class="poa-pwa-install-secondary"></button></div>';
    document.body.appendChild(card);
    detail = card.querySelector('.poa-pwa-install-detail');
    installButton = card.querySelector('.poa-pwa-install-primary');
    closeButton = card.querySelector('.poa-pwa-install-close');
    var secondary = card.querySelector('.poa-pwa-install-secondary');
    installButton.addEventListener('click', runInstall);
    secondary.addEventListener('click', function () { showDetails(); });
    closeButton.addEventListener('click', function () { hideCard(true); });
  }

  function renderCopy() {
    if (!card) return;
    copy = isArabic() ? messages.ar : messages.en;
    var trigger = document.getElementById('poa-pwa-install-trigger');
    if (trigger) {
      var txt = trigger.querySelector('.poa-pwa-install-trigger-text');
      if (txt) txt.textContent = copy.button;
      trigger.setAttribute('aria-label', copy.button);
      trigger.title = copy.button;
    }
    card.querySelector('.poa-pwa-install-title').textContent = copy.title;
    card.querySelector('.poa-pwa-install-body').textContent = isIOS ? copy.bodyIOS : (deferredPrompt ? copy.bodyAndroid : copy.bodyOther);
    card.querySelector('.poa-pwa-install-note').textContent = copy.note;
    closeButton.setAttribute('aria-label', copy.close);
    installButton.textContent = isIOS ? copy.how : copy.install;
    card.querySelector('.poa-pwa-install-secondary').textContent = isIOS ? copy.install : copy.how;
    card.querySelector('.poa-pwa-install-titles').dir = isArabic() ? 'rtl' : 'ltr';
    card.dir = isArabic() ? 'rtl' : 'ltr';
    if (detail && !detail.hidden) renderDetails();
  }

  function renderDetails() {
    if (!detail) return;
    var title, steps;
    if (isIOS) { title = copy.iosTitle; steps = copy.iosSteps; }
    else if (/Android/i.test(navigator.userAgent)) { title = copy.androidTitle; steps = copy.androidSteps; }
    else { title = copy.title; steps = copy.genericSteps; }
    detail.innerHTML = '<h3>' + title + '</h3>' + steps;
    detail.dir = isArabic() ? 'rtl' : 'ltr';
  }

  function showDetails() {
    if (!detail) return;
    renderDetails();
    detail.hidden = false;
    card.classList.add('poa-pwa-install-expanded');
  }

  function showCard(force) {
    if (!card || isStandalone()) return;
    if (!force && dismissedForSession) return;
    card.hidden = false;
    requestAnimationFrame(function () { if (card) card.classList.add('poa-pwa-install-visible'); });
  }

  function hideCard(dismissed) {
    if (!card) return;
    card.classList.remove('poa-pwa-install-visible', 'poa-pwa-install-expanded');
    card.hidden = true;
    if (detail) detail.hidden = true;
    if (dismissed) dismissedForSession = true;
  }

  async function runInstall() {
    if (isIOS) { showDetails(); return; }
    if (deferredPrompt) {
      var promptEvent = deferredPrompt;
      deferredPrompt = null;
      try {
        await promptEvent.prompt();
        var choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          installButton.disabled = true;
          installButton.textContent = isArabic() ? 'جارٍ التثبيت…' : 'Installing…';
        }
      } catch (_) {
        showDetails();
      }
      renderCopy();
      return;
    }
    showDetails();
  }

  function markInstalled() {
    var trigger = document.getElementById('poa-pwa-install-trigger');
    if (trigger) trigger.hidden = true;
    hideCard(false);
  }

  function init() {
    if (!document.body || isStandalone()) return;
    installStyles();
    ensureUi();
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredPrompt = event;
      renderCopy();
      showCard(false);
    });
    window.addEventListener('appinstalled', markInstalled);
    window.addEventListener('storage', function (event) { if (event.key === 'poa_language') renderCopy(); });
    if ('MutationObserver' in window) {
      languageObserver = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].type === 'attributes' && records[i].attributeName === 'dir') { renderCopy(); break; }
        }
      });
      languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['dir', 'lang'] });
    }
    // First visit from a QR code gets a visible install guide; it is non-blocking and can be dismissed.
    var seen = false;
    try { seen = sessionStorage.getItem('poa_pwa_install_tip_seen') === '1'; } catch (_) {}
    if (!seen) {
      try { sessionStorage.setItem('poa_pwa_install_tip_seen', '1'); } catch (_) {}
      window.setTimeout(function () { showCard(false); }, 700);
    }
    try {
      if (window.matchMedia) {
        window.matchMedia('(display-mode: standalone)').addEventListener('change', function (event) { if (event.matches) markInstalled(); });
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
