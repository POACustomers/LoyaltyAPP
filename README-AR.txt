إصلاح بنية الدخول وروابط الأدوار والكاش — 22 أكتوبر 2026

تم فحص نسخة LoyaltyAPP المرفوعة وإصلاح المشكلات المؤكدة في صفحات الدخول والتنقل:
- صفحة الدخول الموحدة الوحيدة أصبحت index.html في جذر المستودع.
- POACustomers/index.html يحوّل إلى صفحة الدخول الرئيسية بدل عرض نسخة ثانية.
- مجلد POAC-Multi-Client-Kit أصبح صفحة تعريف بالقوالب، وليس نسخة تشغيل بأزرار أدوار وروابط غير موجودة.
- تم تصحيح روابط صفحة GM وحالة الأحرف.
- تم إصلاح روابط manifest الخاصة بصفحات العميل.
- تم فصل كاش Service Worker الجذر عن كاش Service Worker المتداخل.

الملفات المعدلة داخل حزمة التحديث:
- index.html
- sw.js
- POACustomers/index.html
- POACustomers/manifest.webmanifest
- POACustomers/sw.js
- POACustomers/assets/app.js
- POACustomers/admin/admin-settings.html
- POACustomers/customer/customer-home.html
- POACustomers/customer/customer-locations.html
- POACustomers/customer/customer-login.html
- POACustomers/customer/customer-menu.html
- POACustomers/customer/customer-order-history.html
- POACustomers/customer/customer-orders.html
- POACustomers/customer/customer-profile.html
- POACustomers/customer/customer-register.html
- POACustomers/customer/customer-rewards.html
- POAC-Multi-Client-Kit/index.html
- AUDIT-RESULT-AR.md
- README-AR.txt (تعليمات هذا التحديث)

طريقة التركيب:
1. فك ضغط حزمة التحديث.
2. انقل الملفات المعدلة إلى المستودع نفسه مع الحفاظ على المسارات بالضبط، واستبدل الملفات ذات الأسماء نفسها.
3. اضغط Commit changes في GitHub.
4. أغلق تبويبات الموقع وأي نافذة PWA قديمة، ثم افتح الموقع من جديد واضغط Ctrl+F5.

تنبيه بخصوص تسجيل الدخول:
هذا التحديث يعالج التداخلات والمسارات والكاش في الواجهة. لكن الأرشيف الأصلي لا يحتوي على مجلد supabase/ أو SQL migration أو Edge Function باسم username-login. لذلك لا يمكن اعتبار دخول الإدارة وGM والموظفين باسم المستخدم مكتملًا قبل توفير تلك الملفات ونشر الوظيفة وضبط usernames في قاعدة Supabase. لا تلصق config.toml في SQL Editor؛ فهو ملف إعدادات CLI وليس SQL.
لم يتم نشر أي شيء تلقائيًا إلى GitHub أو Supabase، ولم يتم اختبار حسابات حية.
