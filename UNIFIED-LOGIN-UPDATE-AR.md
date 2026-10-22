# تحديث صفحة الدخول الموحدة — POACustomers

## ما الذي تغير؟
- استبدال شاشة اختيار CUSTOMER / STAFF / GM / ADMIN بصفحة دخول واحدة بنفس الهوية البصرية الحالية.
- إزالة روابط الإدارة والموظفين من واجهة الدخول العامة.
- توجيه المستخدم تلقائيًا إلى الصفحة المناسبة حسب الدور المحفوظ في `profiles` بعد نجاح المصادقة.
- إضافة رابط **إنشاء حساب جديد** أسفل زر تسجيل الدخول، ويؤدي إلى تسجيل العميل لأول مرة.
- دعم اسم المستخدم للعميل والموظف وGM والإدارة عبر وظيفة Supabase Edge Function، مع استمرار قبول البريد الإلكتروني لحسابات الإدارة الحالية.
- الإبقاء على صفحات الدخول المنفصلة القديمة والحراسة الحالية للأدوار كمسارات احتياطية، من دون حذفها.
- رفع رقم كاش Service Worker حتى تظهر الملفات الجديدة بعد النشر.

## الملفات المعدلة/المضافة
- `index.html`
- `assets/app.js`
- `sw.js`
- `supabase_username_login_setup.sql`
- `supabase/functions/username-login/index.ts`
- `supabase/config.toml`

## خطوات تفعيل اسم المستخدم لكل الأدوار
1. في مشروع Supabase الخاص بـ POACustomers فقط، افتح SQL Editor وشغّل `supabase_username_login_setup.sql`.
2. تأكد أن كل حساب إدارة/GM/موظف له اسم مستخدم فريد في `public.profiles.username`. يمكن مراجعة الحسابات من SQL Editor باستخدام:
   `SELECT id, full_name, role, email, username FROM public.profiles WHERE role <> 'customer' ORDER BY role, full_name;`
3. إذا كانت أسماء المستخدمين فارغة، حدّد اسم مستخدم فريد لكل حساب إدارة/GM/موظف باستخدام `UPDATE public.profiles SET username = 'اسم_مستخدم' WHERE id = 'UUID_الحساب';` مع استبدال القيم الفعلية. لا تغيّر `role` أو البريد أو كلمة المرور بهذه الخطوة.
4. انشر Edge Function من مجلد المشروع الذي يحتوي على `supabase/` باستخدام Supabase CLI:
   `supabase functions deploy username-login --no-verify-jwt`
   تأكد أن وظيفة `username-login` تستخدم متغيرات البيئة الافتراضية في Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. لا تضع مفتاح `service_role` في ملفات الواجهة أو GitHub.
5. ارفع `index.html`, `assets/app.js`, `sw.js` إلى المسارات نفسها في GitHub Pages، ثم اختبر حساب عميل وحساب إدارة.

## سلوك الدخول
- إذا كتب المستخدم اسمًا بلا `@`، تحاول الصفحة المصادقة عبر `username-login` ثم تستخدم مسار تسجيل العملاء الحالي كحل احتياطي.
- إذا كتب بريدًا إلكترونيًا، يتم تسجيل الدخول بالطريقة الحالية، ثم يقرأ التطبيق الدور ويوجه المستخدم تلقائيًا.
- تسجيل العميل لا يمنحه صلاحيات الإدارة؛ الدور يظل محكومًا بقاعدة البيانات.
- إخفاء روابط الإدارة ليس حماية كافية وحده؛ يجب أن تظل حراسة الصفحات وسياسات RLS في Supabase فعّالة.

## تنبيه نشر
هذه حزمة ملفات جاهزة للمراجعة والرفع؛ لم يتم نشرها تلقائيًا على GitHub أو Supabase من داخل هذه المحادثة. لا تشغّل SQL في أي مشروع غير POACustomers.
