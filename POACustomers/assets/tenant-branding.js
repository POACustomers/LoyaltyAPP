/* White-label tenant branding loader.
 * The configured customer brand is separate from the POAC software-provider identity.
 * This deployment uses its own Supabase URL/key in assets/config.js.
 */
(function () {
  'use strict';
  const tenant = window.POA_TENANT_CONFIG || {};
  const scriptUrl = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL('tenant-branding.js', document.baseURI).href;
  const assetsBase = new URL('.', scriptUrl);
  const assetUrl = (path) => new URL(String(path || ''), assetsBase).href;

  function replaceBrandText(value) {
    if (value == null) return value;
    let text = String(value);
    const name = String(tenant.BRAND_NAME || 'Customer');
    const upper = name.toLocaleUpperCase();
    const tagline = String(tenant.TAGLINE || name);
    text = text.replace(/Dina[’']s Corner Loyalty/gi, match => match === match.toLocaleUpperCase() ? upper + ' LOYALTY' : name + ' Loyalty');
    text = text.replace(/Dina[’']s Corner/gi, match => match === match.toLocaleUpperCase() ? upper : name);
    text = text.replace(/Premium Healthy Meals/gi, tagline);
    // The software vendor name belongs to POAC, not the customer-facing white-label app.
    text = text.replace(/\bPOACustomers\b/gi, name);
    return text;
  }

  function setBrandTheme() {
    document.documentElement.dataset.tenant = String(tenant.TENANT_ID || 'customer');
    document.documentElement.dataset.theme = String(tenant.THEME_ID || 'default');
    document.documentElement.style.setProperty('--tenant-primary', String(tenant.PRIMARY_COLOR || '#071D49'));
    document.documentElement.style.setProperty('--tenant-secondary', String(tenant.SECONDARY_COLOR || '#D7A535'));
    document.documentElement.style.setProperty('--tenant-accent', String(tenant.ACCENT_COLOR || '#D7A535'));
    document.documentElement.style.setProperty('--tenant-page-background', String(tenant.PAGE_BACKGROUND || '#F7F8FA'));
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme && tenant.THEME_COLOR) metaTheme.setAttribute('content', tenant.THEME_COLOR);
    if (tenant.THEME_CSS && !document.querySelector('link[data-tenant-theme]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetUrl(tenant.THEME_CSS) + '?v=' + encodeURIComponent(tenant.TENANT_ID || 'tenant');
      link.dataset.tenantTheme = 'true';
      document.head.appendChild(link);
    }
  }

  function applyBrandToDom(root) {
    root = root || document.body;
    if (!root) return;
    const name = String(tenant.BRAND_NAME || 'Customer');
    const upper = name.toLocaleUpperCase();

    if (root === document.body || root === document.documentElement) {
      document.title = replaceBrandText(document.title || tenant.APP_NAME || name);
      if (!document.title || /^(Customer Home|Index)$/i.test(document.title)) document.title = tenant.APP_NAME || name;
      else if (!document.title.toLocaleLowerCase().includes(name.toLocaleLowerCase())) document.title += ' — ' + name;
    }

    const imgs = [];
    if (root.matches && root.matches('img.brand-logo, img.official-logo, .logo img')) imgs.push(root);
    if (root.querySelectorAll) imgs.push(...root.querySelectorAll('img.brand-logo, img.official-logo, .logo img'));
    imgs.forEach((img) => {
      if (img.matches('img.brand-logo')) {
        if (tenant.ICON_FILE) img.src = assetUrl(tenant.ICON_FILE);
      } else if (tenant.LOGO_FILE) img.src = assetUrl(tenant.LOGO_FILE);
      img.alt = name;
    });

    const iconLinks = [];
    if (root.matches && root.matches('link[rel="icon"],link[rel="shortcut icon"]')) iconLinks.push(root);
    if (root.querySelectorAll) iconLinks.push(...root.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]'));
    iconLinks.forEach((link) => { if (tenant.ICON_FILE) link.href = assetUrl(tenant.ICON_FILE); });

    const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (textWalker.nextNode()) {
      const node = textWalker.currentNode;
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,textarea,input,select,option,code,pre')) continue;
      if (/Dina[’']s Corner|Premium Healthy Meals|POACustomers/i.test(node.nodeValue)) textNodes.push(node);
    }
    textNodes.forEach((node) => { node.nodeValue = replaceBrandText(node.nodeValue); });

    const attributed = [];
    if (root.matches && root.matches('[alt],[title],[aria-label],[placeholder]')) attributed.push(root);
    if (root.querySelectorAll) attributed.push(...root.querySelectorAll('[alt],[title],[aria-label],[placeholder]'));
    attributed.forEach((el) => {
      for (const attr of ['alt','title','aria-label','placeholder']) {
        if (el.hasAttribute(attr)) el.setAttribute(attr, replaceBrandText(el.getAttribute(attr)));
      }
    });
    const metas = root.querySelectorAll ? root.querySelectorAll('meta[name="description"]') : [];
    metas.forEach((meta) => { meta.content = replaceBrandText(meta.content || tenant.APP_NAME || ''); });
    if (root === document.body) document.body.dataset.tenant = String(tenant.TENANT_ID || 'customer');
  }

  setBrandTheme();
  const start = () => {
    applyBrandToDom(document.documentElement);
    if (document.body) document.body.dataset.tenant = String(tenant.TENANT_ID || 'customer');
    // Catch labels created later by page logic (e.g. offers, order status, account messages).
    if (document.body && 'MutationObserver' in window) {
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'characterData') applyBrandToDom(record.target.parentElement || document.body);
          for (const node of record.addedNodes || []) if (node.nodeType === Node.ELEMENT_NODE) applyBrandToDom(node);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
