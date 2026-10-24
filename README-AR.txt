إصلاح مسارات الدخول لكل الأدوار — POACustomers

الملفات داخل هذا الملف المضغوط يجب وضعها في المسارات التالية في مستودع GitHub LoyaltyAPP:

1) index.html
   استبدل ملف index.html الموجود في جذر المستودع (بجوار مجلد POACustomers).

2) POACustomers/assets/app.js
   افتح مجلد POACustomers ثم assets، واستبدل app.js الموجود هناك.

3) sw.js
   استبدل ملف sw.js الموجود في جذر المستودع.

ثم اضغط Commit changes، وافتح الموقع واضغط Ctrl+F5.

المسارات بعد التعديل:
- customer -> POACustomers/customer/customer-home.html
- staff -> POACustomers/staff/staff-scan.html
- gm -> POACustomers/GM/gm-dashboard.html
- admin -> POACustomers/admin/admin-dashboard.html

تنبيه مهم:
هذا التحديث يصلح مسارات الصفحات والكاش. تسجيل الدخول بأسماء المستخدمين لحسابات الإدارة وGM والموظفين يحتاج كذلك أن تكون وظيفة Supabase Edge Function المسماة username-login منشورة، وأن يكون لكل حساب username صحيح في profiles. إذا ظهرت رسالة أن اسم المستخدم أو كلمة المرور غير صحيحة بدل 404، فهذا إعداد دخول في Supabase وليس مسار صفحة. لا تلصق config.toml في SQL Editor؛ config.toml ملف إعدادات CLI وليس SQL.
لم يتم نشر أي ملف تلقائيًا إلى GitHub أو Supabase.
