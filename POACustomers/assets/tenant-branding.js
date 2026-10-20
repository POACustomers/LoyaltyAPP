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
    // Process dynamic branding changes in batches. Re-scanning an ancestor for
    // every translated text-node mutation can freeze large pages when the
    // bilingual switcher translates the page in one pass.
    if (document.body && 'MutationObserver' in window) {
      const pendingBrandRoots = new Set();
      let brandPassScheduled = false;

      function queueBrandRoot(root) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
        if (root.closest && root.closest('.poa-language-switcher')) return;

        // Keep only the highest queued ancestors so one inserted subtree is
        // processed once, rather than repeatedly for all its descendants.
        for (const pending of pendingBrandRoots) {
          if (pending === root || (pending.contains && pending.contains(root))) return;
        }
        for (const pending of Array.from(pendingBrandRoots)) {
          if (root.contains && root.contains(pending)) pendingBrandRoots.delete(pending);
        }
        pendingBrandRoots.add(root);
        if (brandPassScheduled) return;
        brandPassScheduled = true;
        window.setTimeout(() => {
          brandPassScheduled = false;
          const roots = Array.from(pendingBrandRoots);
          pendingBrandRoots.clear();
          for (const queuedRoot of roots) {
            if (queuedRoot.isConnected) applyBrandToDom(queuedRoot);
          }
        }, 25);
      }

      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'characterData') {
            // Branding only needs re-checking if this changed text contains a
            // replaceable brand token. Ignore ordinary translation updates.
            const text = record.target && record.target.nodeValue || '';
            if (/Dina[’']s Corner|Premium Healthy Meals|POACustomers/i.test(text)) {
              queueBrandRoot(record.target.parentElement || document.body);
            }
          }
          if (record.type === 'childList') {
            for (const node of record.addedNodes || []) {
              if (node.nodeType === Node.ELEMENT_NODE) queueBrandRoot(node);
            }
          }
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();


/* POA bilingual language switcher: Arabic RTL + English LTR */
(function poaLanguageSwitcher() {
  'use strict';
  if (window.__POA_LANGUAGE_SWITCHER__) return;
  window.__POA_LANGUAGE_SWITCHER__ = true;

  const STORAGE_KEY = 'poa_language';
  const DEFAULT_LANGUAGE = 'en';
  const enToAr = {
    'Customer Home':'الرئيسية', 'Customer Login':'دخول العميل', 'Customer Profile':'الملف الشخصي',
    'Create Loyalty Account':'إنشاء حساب ولاء', 'Create Account':'إنشاء حساب', 'Welcome Back':'مرحبًا بعودتك',
    'Sign in to your Dina\'s Corner Loyalty account.':'سجّل الدخول إلى حساب الولاء الخاص بك في Dina\'s Corner.',
    'Create your Dina\'s Corner Loyalty account using a username and password. Phone and date of birth are optional.':'أنشئ حساب الولاء باستخدام اسم المستخدم وكلمة المرور. رقم الهاتف وتاريخ الميلاد اختياريان.',
    'Username':'اسم المستخدم', 'Your username':'اسم المستخدم الخاص بك', 'Choose a username (3–24 characters)':'اختر اسم مستخدم (من 3 إلى 24 حرفًا)',
    'Password':'كلمة المرور', 'Your password':'كلمة المرور الخاصة بك', 'At least 6 characters':'6 أحرف على الأقل',
    'Confirm New Password':'تأكيد كلمة المرور الجديدة', 'New Password':'كلمة المرور الجديدة', 'Change Password':'تغيير كلمة المرور',
    'Choose a new password for your Dina\'s Corner account.':'اختر كلمة مرور جديدة لحسابك.',
    'Mobile Number (Optional)':'رقم الموبايل (اختياري)', 'Mobile':'الموبايل', 'Date of Birth (Optional)':'تاريخ الميلاد (اختياري)', 'Date of Birth':'تاريخ الميلاد',
    'Email':'البريد الإلكتروني', 'Phone (optional)':'الهاتف (اختياري)', 'City / Area':'المدينة / المنطقة', 'Address':'العنوان',
    'Sign In →':'تسجيل الدخول ←', 'Staff Sign In →':'دخول الموظفين ←', 'GM Sign In →':'دخول المدير العام ←', 'Admin Sign In →':'دخول الإدارة ←',
    'Create Loyalty Account':'إنشاء حساب ولاء', 'Create My Loyalty Account →':'إنشاء حساب الولاء ←',
    'Already have an account? Sign in':'لديك حساب بالفعل؟ سجّل الدخول', '← Back':'رجوع ←', 'Back':'رجوع',
    'Home':'الرئيسية', 'Dashboard':'لوحة التحكم', 'Menu':'القائمة', 'Menu & Basket':'القائمة والسلة', 'Continue to checkout →':'متابعة إتمام الطلب ←', 'Your order':'طلبك', 'items':'منتجات', 'item':'منتج', 'Our Menu':'قائمتنا', 'Rewards':'المكافآت', 'Locations':'الفروع',
    'Basket & Checkout':'السلة وتأكيد الطلب', 'Branches':'الفروع', 'Order History':'سجل الطلبات', 'Previous orders':'الطلبات السابقة', 'Your order history':'سجل طلباتك', 'Review previous orders, branch details, totals and the latest recorded status.':'راجع طلباتك السابقة والفروع والإجماليات وآخر حالة مسجلة.', 'YOUR ACCOUNT':'حسابك', 'Back to menu':'العودة إلى القائمة',
    'Offers':'العروض', 'Orders':'الطلبات', 'My Profile':'ملفي الشخصي', 'Profile':'الملف الشخصي', 'Customer':'العميل', 'Customers':'العملاء',
    'Staff':'الموظفون', 'Users':'المستخدمون', 'GM':'المدير العام', 'General Manager':'المدير العام', 'Settings':'الإعدادات',
    'Sign Out':'تسجيل الخروج', 'Sign out':'تسجيل الخروج', 'Sign Out':'تسجيل الخروج', 'System Admin':'مدير النظام', 'Admin Login':'دخول الإدارة',
    'GM Login':'دخول المدير العام', 'Staff Login':'دخول الموظفين', 'Staff Portal':'بوابة الموظفين', 'GM Portal':'بوابة المدير العام',
    'Secure access for Dina\'s Corner staff.':'دخول آمن لموظفي Dina\'s Corner.', 'Management operations. System Admin is a separate portal.':'إدارة العمليات. بوابة مدير النظام منفصلة.',
    'Full system administration. This portal is separate from GM.':'إدارة النظام بالكامل. هذه البوابة منفصلة عن المدير العام.',
    'Hello,':'أهلًا،', 'Loyal Customer':'عميلنا العزيز', 'Welcome back':'أهلًا بعودتك', 'Loyal Customer • Welcome back':'عميلنا العزيز • أهلًا بعودتك', 'YOUR POINTS':'نقاطك',
    'Keep earning brighter rewards':'اجمع المزيد من النقاط واستمتع بمكافآت أفضل', 'More Rewards':'مكافآت أكثر', 'Brighter Days':'وأيام أجمل',
    'Earn points with every eligible purchase at Dina\'s Corner.':'اجمع النقاط مع كل عملية شراء مؤهلة في Dina\'s Corner.',
    'My QR Code':'رمز QR الخاص بي', 'Show this QR code at the counter.':'اعرض رمز QR هذا عند الكاشير.', 'Your current points':'نقاطك الحالية',
    'Points':'النقاط', 'Member ID:':'رقم العضوية:', 'Current Points':'النقاط الحالية', 'Today':'اليوم', 'This week':'هذا الأسبوع', 'This month':'هذا الشهر',
    'New customer accounts':'حسابات العملاء الجديدة', 'New customer registrations and hourly activity.':'تسجيلات العملاء الجدد والنشاط بالساعة.',
    'Registrations by hour':'التسجيلات حسب الساعة', 'Customer accounts created during each of the last 24 completed hours.':'عدد حسابات العملاء المنشأة خلال كل ساعة من آخر 24 ساعة مكتملة.',
    'Total in 24 hours':'الإجمالي خلال 24 ساعة', 'Average per hour':'المتوسط لكل ساعة', 'Loading registration data…':'جارٍ تحميل بيانات التسجيل…',
    'Loading hourly registrations…':'جارٍ تحميل التسجيلات بالساعة…', 'Loading new customer registration data…':'جارٍ تحميل بيانات تسجيل العملاء الجدد…',
    'Refresh':'تحديث', 'REFRESH':'تحديث', 'Loading…':'جارٍ التحميل…', 'Loading':'جارٍ التحميل', 'Loading menu…':'جارٍ تحميل القائمة…',
    'Loading offers…':'جارٍ تحميل العروض…', 'Loading rewards…':'جارٍ تحميل المكافآت…', 'Loading reward…':'جارٍ تحميل المكافأة…',
    'Loading branches…':'جارٍ تحميل الفروع…', 'Loading branch locations…':'جارٍ تحميل مواقع الفروع…', 'Loading branch orders…':'جارٍ تحميل طلبات الفرع…',
    'Loading orders…':'جارٍ تحميل الطلبات…', 'Loading your orders…':'جارٍ تحميل طلباتك…', 'Loading your basket…':'جارٍ تحميل سلة مشترياتك…',
    'Loading categories…':'جارٍ تحميل الأقسام…', 'Loading menu items…':'جارٍ تحميل المنتجات…', 'Loading Staff accounts…':'جارٍ تحميل حسابات الموظفين…',
    'Loading Staff assignments…':'جارٍ تحميل تعيينات الموظفين…', 'Loading Staff accounts…':'جارٍ تحميل حسابات الموظفين…',
    'Special Offers':'عروض خاصة', 'Exclusive offers and loyalty benefits from Dina\'s Corner.':'عروض حصرية ومزايا ولاء من Dina\'s Corner.',
    'Exclusive loyalty benefits from Dina\'s Corner.':'مزايا ولاء حصرية من Dina\'s Corner.', 'Free Drink':'مشروب مجاني', 'Birthday Benefit':'ميزة عيد الميلاد',
    'For eligible members with a recorded date of birth.':'للأعضاء المؤهلين المسجّل تاريخ ميلادهم.', '10 visit points':'10 نقاط زيارات', '10 POINTS':'10 نقاط',
    'Choose how you want to use your points.':'اختر كيفية استخدام نقاطك.', 'Available with your points':'متاح مقابل نقاطك', 'Reward available':'المكافأة متاحة',
    'Rewards Management':'إدارة المكافآت', 'Create, edit, and delete the rewards customers can redeem.':'إنشاء المكافآت التي يمكن للعملاء استبدالها وتعديلها وحذفها.',
    'Add Reward':'إضافة مكافأة', 'Reward Name *':'اسم المكافأة *', 'Reward Name':'اسم المكافأة', 'Description':'الوصف', 'Points Cost *':'تكلفة النقاط *',
    'Points Cost':'تكلفة النقاط', 'Reward Image (optional)':'صورة المكافأة (اختياري)', 'Current reward image':'صورة المكافأة الحالية',
    'Current Rewards':'المكافآت الحالية', 'Rewards are saved in the rewards database.':'يتم حفظ المكافآت في قاعدة بيانات المكافآت.',
    'SAVE REWARD':'حفظ المكافأة', 'CANCEL EDIT':'إلغاء التعديل', 'Active':'نشط', 'Inactive':'غير نشط', 'Status':'الحالة',
    'Offers Management':'إدارة العروض', 'Manage products and offer date limits.':'إدارة المنتجات وحدود تواريخ العروض.', 'Add / Edit Offer':'إضافة / تعديل عرض',
    'Add New Offer':'إضافة عرض جديد', 'Edit Offer':'تعديل العرض', 'Product / Offer Name':'اسم المنتج / العرض', 'Start Date':'تاريخ بدء العرض',
    'Expiry Date':'تاريخ انتهاء الصلاحية', 'Offer Image':'صورة العرض', 'Optional. Up to 5 MB; a selected image is resized before saving.':'اختياري. حتى 5 ميجابايت؛ يتم تصغير الصورة قبل الحفظ.',
    'Active offers within their valid dates appear on the customer Home screen.':'تظهر العروض النشطة خلال فترة صلاحيتها في الصفحة الرئيسية للعميل.',
    'SAVE OFFER':'حفظ العرض', 'SAVE CHANGES':'حفظ التغييرات', 'CANCEL EDIT':'إلغاء التعديل', 'EDIT':'تعديل', 'DELETE':'حذف', 'No offers yet.':'لا توجد عروض حاليًا.',
    'No description':'بدون وصف', 'Starts:':'يبدأ:', 'Expires:':'ينتهي:', 'Current image (kept unless replaced).':'الصورة الحالية (تظل كما هي ما لم تستبدلها).',
    'Select a new image only if you want to replace the current one.':'اختر صورة جديدة فقط إذا كنت تريد استبدال الصورة الحالية.',
    'Enter the product or offer name.':'أدخل اسم المنتج أو العرض.', 'Choose both the start and expiry dates.':'اختر تاريخ بدء العرض وتاريخ انتهائه.',
    'Expiry date cannot be before the start date.':'لا يمكن أن يسبق تاريخ الانتهاء تاريخ البدء.', 'Choose an image file.':'اختر ملف صورة.',
    'Image must be 5 MB or smaller.':'يجب ألا يتجاوز حجم الصورة 5 ميجابايت.', 'Could not read image.':'تعذرت قراءة الصورة.',
    'Invalid image.':'الصورة غير صالحة.', 'Could not process the image.':'تعذرت معالجة الصورة.',
    'Offer updated successfully.':'تم تعديل العرض بنجاح.', 'Offer added successfully.':'تمت إضافة العرض بنجاح.',
    'An active GM account is required.':'يلزم حساب مدير عام نشط.', 'Current Offers':'العروض الحالية', 'Categories':'الأقسام', 'GM MANAGEMENT':'إدارة المدير العام', 'Menu Management':'إدارة القائمة',
    'Add Menu Item':'إضافة منتج للقائمة', 'Category *':'القسم *', 'Item Name *':'اسم المنتج *', 'Item Name':'اسم المنتج', 'Price (EGP) (optional)':'السعر (جنيه مصري) (اختياري)',
    'Item Image (optional)':'صورة المنتج (اختياري)', 'No image URL is required.':'لا حاجة لإدخال رابط للصورة.', 'SAVE MENU ITEM':'حفظ المنتج',
    'CANCEL EDIT':'إلغاء التعديل', 'Current Menu':'القائمة الحالية', 'Add Category':'إضافة قسم', 'Category name *':'اسم القسم *',
    'Category image (optional)':'صورة القسم (اختياري)', 'Choose an image from your device (max 5 MB).':'اختر صورة من جهازك (بحد أقصى 5 ميجابايت).',
    'Image unavailable; choose another image from your device.':'الصورة غير متاحة؛ اختر صورة أخرى من جهازك.', 'SAVE CATEGORY':'حفظ القسم',
    'CLEAR FORM':'مسح النموذج', 'Current Categories':'الأقسام الحالية', 'Add and manage the real branches shown to customers.':'إضافة وإدارة الفروع الفعلية التي تظهر للعملاء.',
    'Branch Locations':'الفروع', 'Branch name *':'اسم الفرع *', 'Phone (optional)':'الهاتف (اختياري)', 'Google Maps link (optional)':'رابط Google Maps (اختياري)',
    'Active and visible to customers':'نشط ومرئي للعملاء', 'SAVE BRANCH':'حفظ الفرع', 'CANCEL EDIT':'إلغاء التعديل', 'Current Branches':'الفروع الحالية',
    'Assign Staff to Branches':'تعيين الموظفين للفروع', 'Live loyalty activity and performance.':'نشاط الولاء والأداء المباشر.', 'Points Issued':'النقاط المضافة',
    'Points Redeemed':'النقاط المستبدلة', 'Members':'الأعضاء', 'Active Locations':'الفروع النشطة', 'Data Source':'مصدر البيانات', 'Reports':'التقارير',
    'System Settings':'إعدادات النظام', 'Restricted administrative area.':'منطقة إدارية مقيّدة.', 'Roles':'الأدوار', 'Loyalty Rule':'قاعدة الولاء',
    '1 visit = 1 point.':'كل زيارة = نقطة واحدة.', '10 visits = Free Drink.':'10 زيارات = مشروب مجاني.', 'Customer Data':'بيانات العملاء', 'Portal Access':'الوصول إلى البوابات',
    'Open GM Portal':'فتح بوابة المدير العام', 'Open Staff Portal':'فتح بوابة الموظفين', 'Account Management':'إدارة الحسابات', 'Admin-only management tools for system accounts.':'أدوات إدارة حسابات النظام الخاصة بمدير النظام فقط.',
    'Staff Accounts':'حسابات الموظفين', 'Management accounts are controlled separately from Staff and Customers.':'تتم إدارة حسابات الإدارة بصورة مستقلة عن الموظفين والعملاء.',
    'System-level branch overview.':'نظرة عامة على فروع النظام.', 'Staff accounts and assigned branches.':'حسابات الموظفين والفروع المعيّنة لهم.',
    'This Staff account has no assigned branch. Ask the GM to assign this Staff account to a branch before handling orders.':'هذا الحساب غير مرتبط بفرع. اطلب من المدير العام تعيين الفرع لهذا الموظف قبل التعامل مع الطلبات.',
    'Assign Staff to Branches':'تعيين الموظفين للفروع', 'Assigned Branch':'الفرع المعيّن', 'No branch assigned':'لم يتم تعيين فرع',
    'Monitor new customer registrations.':'متابعة تسجيلات العملاء الجدد.', 'Customer Registrations':'تسجيلات العملاء', 'new customers':'عملاء جدد',
    '60 min ago':'منذ 60 دقيقة', '30 min ago':'منذ 30 دقيقة', 'Now':'الآن', 'Dina\'s Corner Loyalty':'نظام ولاء Dina\'s Corner',
    'Supabase-connected production foundation.':'نظام متصل بقاعدة بيانات Supabase.', 'Management account controls.':'إعدادات حساب الإدارة.',
    'ADD / CHANGE PHOTO':'إضافة / تغيير الصورة', 'ADD / CHANGE MY PHOTO':'إضافة / تغيير صورتي', 'UPLOAD MY PHOTO':'رفع صورتي', 'CLOSE':'إغلاق',
    'Or choose another profile avatar.':'أو اختر صورة رمزية أخرى للملف الشخصي.', 'Choose Your Avatar':'اختر صورتك الرمزية', '15 women • 15 men':'15 صورة نسائية • 15 صورة رجالية',
    'Username':'اسم المستخدم', 'Date of Birth':'تاريخ الميلاد', 'Change Password':'تغيير كلمة المرور', 'Passwords do not match.':'كلمتا المرور غير متطابقتين.',
    'CHANGE PASSWORD':'تغيير كلمة المرور', 'Password changed successfully.':'تم تغيير كلمة المرور بنجاح.', 'Sign out':'تسجيل الخروج', 'Sign Out':'تسجيل الخروج',
    'Staff Profile':'الملف الشخصي للموظف', 'Your staff access details.':'بيانات وصول الموظف الخاصة بك.', 'Branch':'الفرع', 'Email':'البريد الإلكتروني',
    'Point the camera at the customer\'s Dina\'s Corner QR code.':'وجّه الكاميرا إلى رمز QR الخاص بالعميل.', 'Manual Token':'رمز يدوي', 'Find Customer Manually':'البحث عن عميل يدويًا',
    'Scan Customer':'مسح رمز العميل', 'Customer Found':'تم العثور على العميل', 'Review the customer before taking an action.':'راجع بيانات العميل قبل تنفيذ أي إجراء.',
    'Add Points':'إضافة نقاط', 'Redeem Reward':'استبدال مكافأة', 'View History':'عرض السجل', 'Scan Next Customer':'مسح عميل آخر',
    'Add Visit Point':'إضافة نقطة زيارة', 'Every eligible visit receives exactly':'كل زيارة مؤهلة تحصل على', '1 point':'نقطة واحدة',
    'One point for this visit':'نقطة واحدة لهذه الزيارة', 'ADD 1 VISIT POINT':'إضافة نقطة زيارة واحدة', 'BACK TO CUSTOMER':'العودة إلى العميل',
    'Transaction History':'سجل المعاملات', 'Customer History':'سجل العميل', 'History for':'السجل الخاص بـ', 'selected customer': 'العميل المحدد',
    'Customer Points':'نقاط العميل', 'Select a reward for':'اختر مكافأة لـ', 'MANAGE REWARDS':'إدارة المكافآت',
    'Customer orders':'طلبات العملاء', 'CUSTOMER SERVICE':'خدمة العملاء', 'Branch Orders':'طلبات الفرع', 'Staff handles pickup and delivery orders for the assigned branch, including the customer delivery location when applicable.':'يتولى الموظف إدارة طلبات الاستلام والتوصيل الخاصة بفرعه، بما في ذلك موقع العميل عند الحاجة.',
    'REFRESH':'تحديث', 'Pickup from the branch':'استلام من الفرع', 'Delivery to my location':'توصيل إلى موقعي', 'Order method':'طريقة استلام الطلب',
    'How would you like to receive your order?':'كيف تفضّل استلام طلبك؟', 'Branch handling your order':'الفرع المسؤول عن طلبك', 'Delivery location':'موقع التوصيل',
    'Full delivery address':'عنوان التوصيل بالتفصيل', 'Full delivery address *':'عنوان التوصيل بالتفصيل *', 'Building, street, area, floor or apartment':'المبنى والشارع والمنطقة والطابق أو الشقة',
    'Choose a saved address':'اختر عنوانًا محفوظًا', 'No saved address yet — add one in My Profile':'لا يوجد عنوان محفوظ بعد — أضف عنوانًا من ملفي الشخصي',
    'Manage or add delivery addresses in My Profile. Your default address is selected automatically.':'أدر عناوين التوصيل أو أضف عنوانًا من ملفي الشخصي. يتم اختيار عنوانك الافتراضي تلقائيًا.',
    'My Delivery Addresses':'عناوين التوصيل الخاصة بي', 'Saved Addresses':'العناوين المحفوظة', 'Add Address':'إضافة عنوان', 'Add New Address':'إضافة عنوان جديد',
    'Edit Address':'تعديل العنوان', 'Save Address':'حفظ العنوان', 'Set as Default':'تعيين كعنوان افتراضي', 'Default Address':'العنوان الافتراضي',
    'Address Label':'اسم العنوان', 'Home address':'عنوان المنزل', 'Work address':'عنوان العمل', 'Delete Address':'حذف العنوان', 'Update Address':'تحديث العنوان',
    'Choose your map location so the branch can find you.':'حدّد موقعك على الخريطة ليتمكن الفرع من الوصول إليك.', 'USE MY CURRENT LOCATION':'استخدام موقعي الحالي',
    'UPDATE MY LOCATION':'تحديث موقعي', 'Google Maps link (alternative to GPS)':'رابط Google Maps (بديلًا عن GPS)', 'optional if GPS is selected':'اختياري عند تحديد GPS',
    'Order note (optional)':'ملاحظات الطلب (اختياري)', 'PLACE ORDER':'تأكيد الطلب', 'PLACE DELIVERY ORDER':'تأكيد طلب التوصيل', 'PLACE PICKUP ORDER':'تأكيد طلب الاستلام',
    'Your basket':'سلة مشترياتك', 'Your basket is empty. Open Menu and add the items you want to order.':'سلتك فارغة. افتح القائمة وأضف المنتجات التي تريد طلبها.',
    'BACK TO MENU':'العودة إلى القائمة', 'CLEAR BASKET':'تفريغ السلة', 'Your orders':'طلباتك', 'Order & Checkout':'الطلب وإتمام الشراء',
    'Choose pickup or delivery, send the order to the branch, and track its progress here.':'اختر الاستلام أو التوصيل، وأرسل طلبك إلى الفرع، وتابع حالته من هنا.',
    'Order total':'إجمالي الطلب', 'Items':'المنتجات', 'Remove':'إزالة', 'Decrease quantity':'تقليل الكمية', 'Increase quantity':'زيادة الكمية',
    'Price to be confirmed':'السعر يحدده الفرع', 'To be confirmed by branch':'يحدده الفرع', 'To be confirmed':'قيد التأكيد', 'Order received':'تم استلام الطلب',
    'Ready for pickup':'جاهز للاستلام', 'Out for delivery':'خرج للتوصيل', 'Picked up':'تم الاستلام', 'Cancel order':'إلغاء الطلب', 'ACCEPT ORDER':'قبول الطلب',
    'START PREPARING':'بدء التحضير', 'OUT FOR DELIVERY':'خرج للتوصيل', 'READY FOR PICKUP':'جاهز للاستلام', 'MARK DELIVERED':'تأكيد التسليم', 'MARK PICKED UP':'تأكيد الاستلام',
    'Order updated.':'تم تحديث الطلب.', 'Order cancelled.':'تم إلغاء الطلب.', 'Orders loaded':'تم تحميل الطلبات', 'Order total':'إجمالي الطلب', 'Branch:':'الفرع:', 'Note:':'ملاحظة:', 'Customer note:':'ملاحظة العميل:',
    'Delivery address:':'عنوان التوصيل:', 'Open delivery location in Google Maps':'فتح موقع التوصيل في Google Maps', 'Map location not available.':'موقع الخريطة غير متاح.',
    'Address not recorded':'لم يتم تسجيل العنوان', 'DELIVERY':'توصيل', 'PICKUP':'استلام', 'Confirm with customer':'التأكيد مع العميل', 'Cancel this order? Only orders not yet accepted can be cancelled here.':'هل تريد إلغاء هذا الطلب؟ يمكن إلغاء الطلبات التي لم يقبلها الفرع بعد فقط.',
    'Sign in again.':'سجّل الدخول مرة أخرى.', 'Please sign in again.':'يرجى تسجيل الدخول مرة أخرى.', 'You do not have access to this portal.':'ليس لديك صلاحية الوصول إلى هذه البوابة.',
    'This company portal is not connected to its own database yet. Contact the system administrator.':'بوابة هذه الشركة غير متصلة بقاعدة بياناتها بعد. تواصل مع مدير النظام.',
    'Enter your username and password.':'أدخل اسم المستخدم وكلمة المرور.', 'Enter your email and password.':'أدخل البريد الإلكتروني وكلمة المرور.',
    'Signing in…':'جارٍ تسجيل الدخول…', 'Username or password is incorrect.':'اسم المستخدم أو كلمة المرور غير صحيحة.', 'Your profile is not ready yet. Please try again.':'ملفك الشخصي غير جاهز بعد. حاول مرة أخرى.',
    'Login failed.':'فشل تسجيل الدخول.', 'Username and password are required.':'اسم المستخدم وكلمة المرور مطلوبان.', 'Password must be at least 6 characters.':'يجب ألا تقل كلمة المرور عن 6 أحرف.',
    'Please choose an image file.':'يرجى اختيار ملف صورة.', 'Photo must be 5 MB or smaller.':'يجب ألا يتجاوز حجم الصورة 5 ميجابايت.', 'Could not read the photo.':'تعذرت قراءة الصورة.', 'Invalid image.':'الصورة غير صالحة.',
    'Avatar updated successfully.':'تم تحديث الصورة الرمزية بنجاح.', 'Profile photo updated.':'تم تحديث صورة الملف الشخصي.', 'Profile photo updated successfully.':'تم تحديث صورة الملف الشخصي بنجاح.',
    'Could not update avatar.':'تعذر تحديث الصورة الرمزية.', 'Could not update photo.':'تعذر تحديث الصورة.', 'Could not load customer home offers:':'تعذر تحميل عروض الصفحة الرئيسية للعميل:',
    'A special offer is available for customers.':'يتوفر عرض خاص للعملاء.', 'Offer image unavailable':'صورة العرض غير متاحة', 'No branches yet. Add your first real branch above.':'لا توجد فروع بعد. أضف أول فرع فعلي من الأعلى.',
    'No Staff accounts found yet. Create Staff accounts before assigning branches.':'لا توجد حسابات موظفين بعد. أنشئ حسابات الموظفين قبل تعيين الفروع.',
    'Not assigned':'غير معيّن', 'Inactive branch':'فرع غير نشط', 'OPEN MAP':'فتح الخريطة', 'EDIT':'تعديل', 'Edit Branch Location':'تعديل موقع الفرع', 'SAVE CHANGES':'حفظ التغييرات',
    'Branch deleted.':'تم حذف الفرع.', 'Branch name is required.':'اسم الفرع مطلوب.', 'Branch updated successfully.':'تم تحديث الفرع بنجاح.', 'Branch added successfully.':'تمت إضافة الفرع بنجاح.',
    'Could not save branch. Check branch table permissions in Supabase.':'تعذر حفظ الفرع. تحقّق من صلاحيات جدول الفروع في Supabase.',
    'Staff member':'الموظف', 'Staff account':'حساب الموظف', 'Staff branch assignment saved. This Staff account will only receive orders for its assigned branch.':'تم حفظ تعيين الفرع. سيستقبل حساب الموظف طلبات الفرع المعيّن له فقط.',
    'Could not save the Staff branch assignment.':'تعذر حفظ تعيين فرع الموظف.', 'No active branches available':'لا توجد فروع نشطة متاحة',
    'Branches unavailable':'الفروع غير متاحة', 'Choose branch':'اختر الفرع', 'Could not load branches. Ask the company manager to check active branch locations.':'تعذر تحميل الفروع. اطلب من مدير الشركة مراجعة الفروع النشطة.',
    'No active branches are available yet. A branch must be added before placing orders.':'لا توجد فروع نشطة حاليًا. يجب إضافة فرع قبل إرسال الطلبات.',
    'Your basket is empty.':'سلتك فارغة.', 'Choose the branch that will handle your order.':'اختر الفرع الذي سيتولى طلبك.', 'SENDING ORDER…':'جارٍ إرسال الطلب…',
    'Location is not available in this browser. Paste a Google Maps link instead.':'الموقع غير متاح في هذا المتصفح. الصق رابط Google Maps بدلًا من ذلك.',
    'GETTING LOCATION…':'جارٍ تحديد الموقع…', 'Waiting for your device location permission…':'بانتظار إذن الوصول إلى موقع جهازك…', 'Your current location is attached to this order.':'تم إرفاق موقعك الحالي بهذا الطلب.',
    'Location permission was denied. Paste a Google Maps link instead.':'تم رفض إذن الموقع. الصق رابط Google Maps بدلًا من ذلك.', 'Could not get location. Check device location and try again, or paste a Maps link.':'تعذر تحديد الموقع. تحقّق من إعدادات الموقع وحاول مجددًا أو الصق رابط الخريطة.',
    'Enter the full delivery address.':'أدخل عنوان التوصيل بالتفصيل.', 'The map location is incomplete. Use current location again or paste a Google Maps link.':'موقع الخريطة غير مكتمل. حدّد موقعك مجددًا أو الصق رابط Google Maps.',
    'The map coordinates are invalid. Select your current location or paste a valid map link.':'إحداثيات الخريطة غير صالحة. حدّد موقعك الحالي أو الصق رابط خريطة صالحًا.',
    'Paste a valid Google Maps link starting with https://.':'الصق رابط Google Maps صالحًا يبدأ بـ https://.', 'Delivery needs a map location. Press “Use my current location” or paste a Google Maps share link.':'يتطلب التوصيل تحديد الموقع على الخريطة. اضغط «استخدام موقعي الحالي» أو الصق رابط مشاركة من Google Maps.',
    'The branch did not return an order number. Refresh your order history before trying again.':'لم يُرجع الفرع رقمًا للطلب. حدّث سجل الطلبات قبل المحاولة مرة أخرى.',
    'Could not send your order. Please try again.':'تعذر إرسال طلبك. حاول مرة أخرى.', 'Order cancelled.':'تم إلغاء الطلب.', 'Could not cancel the order.':'تعذر إلغاء الطلب.',
    'Could not update the order.':'تعذر تحديث الطلب.', 'Could not initialize the order page.':'تعذر تهيئة صفحة الطلبات.', 'Order handling is restricted to Staff accounts assigned to a branch.':'إدارة الطلبات متاحة لحسابات الموظفين المعيّنين إلى فرع فقط.',
    'No orders yet. Add items from Menu to place your first order.':'لا توجد طلبات بعد. أضف منتجات من القائمة لإرسال أول طلب.', 'No orders for this branch yet. New pickup and delivery orders will appear here.':'لا توجد طلبات لهذا الفرع بعد. ستظهر هنا طلبات الاستلام والتوصيل الجديدة.',
    'Could not load orders. Run the order setup SQL in Supabase. Details:':'تعذر تحميل الطلبات. شغّل إعداد الطلبات في Supabase. التفاصيل:',
    'Could not load branch orders. Run the order setup SQL in Supabase. Details:':'تعذر تحميل طلبات الفرع. شغّل إعداد الطلبات في Supabase. التفاصيل:',
    'Could not load order items:':'تعذر تحميل عناصر الطلب:', 'Order updated.':'تم تحديث الطلب.', 'Order received':'تم استلام الطلب',
    'Your order is ready. Please collect it from the selected branch.':'طلبك جاهز. يرجى استلامه من الفرع المحدد.', 'The branch has dispatched your order to the delivery address.':'أرسل الفرع طلبك إلى عنوان التوصيل.',
    'Your order has been marked as delivered.':'تم تسجيل طلبك على أنه تم تسليمه.', 'This order has been collected.':'تم استلام هذا الطلب.',
    'Waiting for branch Staff to accept your order.':'بانتظار قبول طلبك من موظفي الفرع.', 'The branch Staff accepted your order.':'قبل موظفو الفرع طلبك.',
    'Your order is being prepared.':'جارٍ تجهيز طلبك.', 'This order was cancelled.':'تم إلغاء هذا الطلب.',
    'Could not load customer registration data.':'تعذر تحميل بيانات تسجيل العملاء.', 'Could not load customer registration analytics.':'تعذر تحميل إحصائيات تسجيل العملاء.',
    'Could not load customer registration data. Check the profiles table read permissions for the admin account.':'تعذر تحميل بيانات التسجيل. تحقّق من صلاحيات قراءة جدول profiles لحساب الإدارة.',
    'Customer has reached the maximum of 50 points.':'وصل العميل إلى الحد الأقصى البالغ 50 نقطة.', '1 visit point added successfully.':'تمت إضافة نقطة زيارة واحدة بنجاح.',
    'Could not add points.':'تعذرت إضافة النقاط.', 'Customer not found.':'لم يتم العثور على العميل.', 'No QR token was provided.':'لم يتم توفير رمز QR.',
    'Customer QR token copied.':'تم نسخ رمز QR الخاص بالعميل.', 'Selected Reward':'المكافأة المختارة', 'Reward redeemed and points deducted.':'تم استبدال المكافأة وخصم النقاط.',
    'Could not redeem reward.':'تعذر استبدال المكافأة.', 'Reward redeemed':'تم استبدال المكافأة', 'Could not load rewards.':'تعذر تحميل المكافآت.',
    'Account created. Opening your loyalty card…':'تم إنشاء الحساب. جارٍ فتح بطاقة الولاء…', 'Creating your Dina\'s Corner account…':'جارٍ إنشاء حسابك…',
    'That username is already taken. Please choose another.':'اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر.', 'Could not update photo.':'تعذر تحديث الصورة.',
    'Profile avatar':'الصورة الرمزية للملف الشخصي', 'My Orders':'طلباتي', 'YOUR ORDER':'طلبك', 'Delivery location':'موقع التوصيل', 'Order note (optional)':'ملاحظات الطلب (اختياري)',
    'Order Method':'طريقة الطلب', 'Pickup or delivery':'استلام أو توصيل', 'Pickup from the selected branch':'الاستلام من الفرع المحدد', 'delivery to your location':'التوصيل إلى موقعك',
    'pickup from the selected branch':'الاستلام من الفرع المحدد', 'No menu categories have been added yet.':'لم تتم إضافة أقسام للقائمة بعد.', 'Menu item':'منتج من القائمة',
    'Add to order':'أضف إلى الطلب', 'Tap the back arrow to return to all categories.':'اضغط سهم الرجوع لعرض كل الأقسام.', 'Order cart is not ready. Refresh the page and try again.':'سلة الطلب غير جاهزة. حدّث الصفحة وحاول مرة أخرى.',
    'Supabase configuration is not available.':'إعدادات Supabase غير متاحة.', 'Menu could not be loaded from the database.':'تعذر تحميل القائمة من قاعدة البيانات.', 'Please try again later.':'حاول مرة أخرى لاحقًا.',
    'Ask the company administrator to verify the menu database setup.':'اطلب من مدير الشركة التحقق من إعداد قاعدة بيانات القائمة.', 'This item cannot be added right now.':'لا يمكن إضافة هذا المنتج الآن.',
    'Maximum quantity for this item is 50.':'الحد الأقصى لكمية هذا المنتج هو 50.', 'each':'للوحدة', 'loading':'جارٍ التحميل', 'Current Menu':'القائمة الحالية',
    'Location is not available in this browser. Paste a Google Maps link instead.':'الموقع غير متاح في هذا المتصفح. الصق رابط Google Maps بدلًا من ذلك.',
    'Save':'حفظ', 'Cancel':'إلغاء', 'Delete':'حذف', 'Edit':'تعديل', 'Update':'تحديث', 'Add':'إضافة', 'Close':'إغلاق', 'Clear':'مسح',
    'Search':'بحث', 'View':'عرض', 'Continue':'متابعة', 'Confirm':'تأكيد', 'Apply':'تطبيق', 'Open':'فتح', 'Available':'متاح', 'Obtained':'تم الحصول عليه',
    'Delivery':'توصيل', 'Pickup':'استلام', 'Pending':'قيد الانتظار', 'Accepted':'مقبول', 'Preparing':'قيد التحضير', 'Completed':'مكتمل', 'Cancelled':'ملغي',
    'READY FOR PICKUP':'جاهز للاستلام', 'MARK DELIVERED':'تأكيد التسليم', 'MARK PICKED UP':'تأكيد الاستلام', 'CANCEL ORDER':'إلغاء الطلب'
  };

  const lookup = Object.create(null);
  Object.keys(enToAr).forEach(key => { lookup[key.trim().replace(/\s+/g, ' ').toLowerCase()] = enToAr[key]; });
  const originalText = new WeakMap();
  const lastText = new WeakMap();
  const originalAttributes = new WeakMap();
  const lastAttributes = new WeakMap();
  let currentLanguage = (function () {
    try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : (localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : DEFAULT_LANGUAGE); }
    catch (_) { return DEFAULT_LANGUAGE; }
  })();
  let originalTitle = '';
  let lastTitle = '';

  function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function mappedEnglishToArabic(value) {
    const n = normalize(value);
    if (!n) return null;
    if (Object.prototype.hasOwnProperty.call(enToAr, n)) return enToAr[n];
    const direct = lookup[n.toLowerCase()];
    if (direct) return direct;
    // Common dynamic messages that include user, branch, or order values.
    let m = n.match(/^History for\s+(.+)$/i); if (m) return 'السجل الخاص بـ ' + m[1];
    m = n.match(/^Your order\s*[·•]\s*(\d+)\s*items?\s*[·•]\s*Pickup or delivery$/i); if (m) return 'طلبك · ' + m[1] + ' منتجات · استلام أو توصيل';
    m = n.match(/^(.+?) added to your order\.$/i); if (m) return 'تمت إضافة ' + m[1] + ' إلى طلبك.';
    m = n.match(/^Order sent successfully\. Order number: (.+)\. Method: (.+)\. Branch Staff will update its status\.$/i); if (m) return 'تم إرسال الطلب بنجاح. رقم الطلب: ' + m[1] + '. طريقة الاستلام: ' + (m[2].toLowerCase().includes('delivery') ? 'توصيل' : 'استلام من الفرع') + '. سيحدّث موظفو الفرع حالته.';
    m = n.match(/^Your order · (\d+) item(?:s)?$/i); if (m) return 'طلبك · ' + m[1] + ' منتجات';
    return null;
  }
  function translatedText(value, lang) {
    if (lang === 'en') return value;
    const leading = (String(value).match(/^\s*/) || [''])[0];
    const trailing = (String(value).match(/\s*$/) || [''])[0];
    const core = String(value).slice(leading.length, String(value).length - trailing.length || String(value).length);
    const translated = mappedEnglishToArabic(core);
    return translated ? leading + translated + trailing : value;
  }
  function translateTextNode(node) {
    if (!node || !node.parentElement || node.parentElement.closest('.poa-language-switcher,script,style,textarea,code,pre,noscript')) return;
    const current = node.nodeValue || '';
    let original = originalText.get(node);
    const last = lastText.get(node);
    if (original === undefined || current !== last) {
      original = current;
      originalText.set(node, original);
    }
    let desired = original;
    if (currentLanguage === 'ar') desired = translatedText(original, 'ar');
    if (desired !== current) node.nodeValue = desired;
    lastText.set(node, desired);
  }
  function translateAttribute(el, attr) {
    if (!el || el.closest && el.closest('.poa-language-switcher')) return;
    if (attr === 'value' && !el.matches('input[type="button"],input[type="submit"],input[type="reset"]')) return;
    const current = el.getAttribute(attr);
    if (current == null) return;
    let originals = originalAttributes.get(el); if (!originals) { originals = Object.create(null); originalAttributes.set(el, originals); }
    let lasts = lastAttributes.get(el); if (!lasts) { lasts = Object.create(null); lastAttributes.set(el, lasts); }
    if (originals[attr] === undefined || current !== lasts[attr]) originals[attr] = current;
    let desired = originals[attr];
    if (currentLanguage === 'ar') desired = translatedText(originals[attr], 'ar');
    if (desired !== current) el.setAttribute(attr, desired);
    lasts[attr] = desired;
  }
  function translateElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE || el.closest && el.closest('.poa-language-switcher')) return;
    ['title', 'aria-label', 'placeholder', 'alt'].forEach(attr => translateAttribute(el, attr));
    if (el.matches('input[type="button"],input[type="submit"],input[type="reset"]')) translateAttribute(el, 'value');
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateTextNode(walker.currentNode);
    if (el.matches('title')) { /* document title is handled separately */ }
  }
  function applyLanguage() {
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
    document.body.classList.toggle('poa-language-ar', currentLanguage === 'ar');
    const desiredTitle = currentLanguage === 'ar' ? translatedText(originalTitle, 'ar') : originalTitle;
    if (desiredTitle && document.title !== desiredTitle) document.title = desiredTitle;
    lastTitle = desiredTitle;
    if (document.body) translateElement(document.body);
    updateButton();
  }
  function updateButton() {
    const button = document.getElementById('poaLanguageSwitcher');
    if (!button) return;
    const label = button.querySelector('.poa-language-label');
    const target = currentLanguage === 'ar' ? 'en' : 'ar';
    if (label) label.textContent = target === 'en' ? 'English' : 'العربية';
    button.setAttribute('aria-label', target === 'en' ? 'Switch language to English' : 'التبديل إلى العربية');
    button.setAttribute('title', target === 'en' ? 'Switch to English' : 'التبديل إلى العربية');
    button.dataset.targetLanguage = target;
  }
  function makeButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'poaLanguageSwitcher';
    button.className = 'poa-language-switcher';
    button.innerHTML = '<span class="poa-language-globe" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path></svg></span><span class="poa-language-label"></span><span class="poa-language-chevron" aria-hidden="true">⌄</span>';
    button.addEventListener('click', function () {
      currentLanguage = currentLanguage === 'ar' ? 'en' : 'ar';
      try { localStorage.setItem(STORAGE_KEY, currentLanguage); } catch (_) {}
      applyLanguage();
    });
    return button;
  }
  function installStyles() {
    if (document.getElementById('poa-language-styles')) return;
    const style = document.createElement('style');
    style.id = 'poa-language-styles';
    style.textContent = `
      .poa-topbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-shrink:0;direction:ltr}
      .poa-language-switcher{display:inline-flex!important;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:0 12px;border:1px solid #edc6c8;border-radius:999px;background:linear-gradient(180deg,#fffaf7 0%,#fbe7e6 100%);color:#9f4059;font:800 12px/1.1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.05px;white-space:nowrap;cursor:pointer;box-shadow:0 4px 12px rgba(159,64,89,.09);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;position:relative;z-index:10002}
      .poa-language-switcher:hover{border-color:#cb8492;box-shadow:0 7px 18px rgba(159,64,89,.16);transform:translateY(-1px)}
      .poa-language-switcher:focus-visible{outline:3px solid rgba(198,95,120,.28);outline-offset:2px}
      .poa-language-globe{width:17px;height:17px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 17px}.poa-language-globe svg{width:17px;height:17px;display:block}
      .poa-language-label{display:inline-block}.poa-language-chevron{font-size:13px;opacity:.7;margin-inline-start:0}
      .poa-language-floating{position:fixed!important;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:10002}
      html[dir="rtl"] body{direction:rtl;text-align:right}
      html[dir="rtl"] .topbar{direction:rtl}
      html[dir="rtl"] .poa-topbar-actions{direction:rtl}
      html[dir="rtl"] .navin,html[dir="rtl"] .quick{direction:rtl}
      html[dir="rtl"] input:not([type="email"]):not([type="password"]):not([type="tel"]):not([type="url"]):not([type="number"]):not([type="date"]):not([type="time"]),html[dir="rtl"] textarea,html[dir="rtl"] select{direction:rtl;text-align:right}
      html[dir="rtl"] input[type="email"],html[dir="rtl"] input[type="password"],html[dir="rtl"] input[type="tel"],html[dir="rtl"] input[type="url"],html[dir="rtl"] input[type="number"],html[dir="rtl"] input[type="date"],html[dir="rtl"] input[type="time"]{direction:ltr;text-align:left}
      html[dir="rtl"] .center,html[dir="rtl"] .authbox .logo,html[dir="rtl"] .btn,html[dir="rtl"] button{text-align:center}
      html[dir="rtl"] .brand{direction:rtl}
      @media(max-width:480px){.poa-language-switcher{min-height:38px;padding:0 10px;gap:6px;font-size:11px}.poa-topbar-actions{gap:6px}.poa-language-globe,.poa-language-globe svg{width:16px;height:16px;flex-basis:16px}}
      @media(max-width:360px){.poa-language-label{font-size:10px}.poa-language-switcher{padding:0 8px;gap:4px}.poa-language-chevron{display:none}}
      @media(prefers-reduced-motion:reduce){.poa-language-switcher{transition:none}}
    `;
    document.head.appendChild(style);
  }
  function installButton() {
    if (document.getElementById('poaLanguageSwitcher')) return;
    const button = makeButton();
    // Customer pages use an icon-only hamburger. Keep language selection inside that menu.
    const customerMenu = document.querySelector('[data-customer-top-menu] .customer-menu-popup');
    if (customerMenu) {
      button.classList.add('customer-language-menu-item');
      const signOut = customerMenu.querySelector('.customer-menu-logout');
      if (signOut) customerMenu.insertBefore(button, signOut);
      else customerMenu.appendChild(button);
      updateButton();
      return;
    }
    // Staff, GM, and admin pages retain their existing topbar language control.
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      let actions = topbar.querySelector(':scope > .poa-topbar-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'poa-topbar-actions';
        const brand = topbar.querySelector(':scope > .brand');
        const movable = Array.from(topbar.children).filter(child => child !== brand);
        topbar.appendChild(actions);
        movable.forEach(child => actions.appendChild(child));
      }
      actions.insertBefore(button, actions.firstChild);
    } else {
      button.classList.add('poa-language-floating');
      document.body.appendChild(button);
    }
    updateButton();
  }
  function init() {
    if (!document.body || document.body.dataset.poaLanguageReady === 'true') return;
    document.body.dataset.poaLanguageReady = 'true';
    originalTitle = document.title || '';
    installStyles();
    installButton();
    applyLanguage();
    if ('MutationObserver' in window) {
      const observer = new MutationObserver(records => {
        for (const record of records) {
          if (record.type === 'characterData') translateTextNode(record.target);
          for (const node of record.addedNodes || []) {
            if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
            else if (node.nodeType === Node.ELEMENT_NODE && !node.closest('.poa-language-switcher')) translateElement(node);
          }
          if (record.type === 'attributes' && record.target instanceof Element) translateAttribute(record.target, record.attributeName);
        }
      });
      observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['title','aria-label','placeholder','alt','value']});
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
