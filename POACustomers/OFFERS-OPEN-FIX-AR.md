# إصلاح فتح صفحة العروض — Dina’s Corner

## الملفات التي يجب استبدالها في مستودع GitHub
1. `POACustomers/assets/app.js`
2. `POACustomers/offers.html`
3. `POACustomers/customer-offers.html`
4. `POACustomers/customer/customer-home.html`
5. `POACustomers/customer/customer-offers.html`
6. `POACustomers/customer/customer-menu.html`
7. `POACustomers/sw.js`
8. `sw.js` (في جذر المستودع، إن كان مستخدمًا)

## التطبيق
- افتح مستودع `LoyaltyAPP` على GitHub.
- استبدل الملفات بالملفات الموجودة في الحزمة في المسارات نفسها. لا ترفع ملف ZIP داخل المستودع.
- اعمل Commit، وانتظر اكتمال GitHub Pages.
- اختبر الرابط المباشر: `/LoyaltyAPP/POACustomers/customer/customer-offers.html` بعد استبدال الجزء الأول بعنوان موقعك الفعلي.
- افتح الصفحة في Safari بتبويب جديد. إذا كانت نسخة قديمة ما زالت تظهر، أغلق تبويب الموقع، ثم افتحه من جديد حتى يتم تحديث Service Worker.

## ما الذي يصلحه هذا التحديث؟
- يوجّه كل مسارات العروض القديمة إلى صفحة العروض الفعلية بدل صفحة تسجيل الدخول.
- يجعل رابط صور العروض يعتمد على مسار التطبيق الفعلي على GitHub Pages أو عند النشر المستقل.
- يعرض رسالة قابلة لإعادة المحاولة إذا فشل تهيئة صفحة العروض، بدل بقاء عبارة التحميل بلا نهاية.
- يحدّث إصدار Service Worker لتقليل احتمال استخدام النسخة المخزنة القديمة.

لم يتم اختبار النسخة على موقع GitHub Pages الحي من هذه البيئة؛ لذلك يجب التحقق بعد نشر الملفات. لا يتم تعديل بيانات Supabase بهذه الحزمة.
