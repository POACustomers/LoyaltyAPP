# تعديل إلزام سبب إلغاء الطلب — Dina’s Corner

## الملفات التي ستُرفع إلى GitHub

استبدل الملفات التالية في المستودع مع الحفاظ على مساراتها:

- `POACustomers/assets/pickup-orders.js`
- `POACustomers/customer/customer-orders.html`
- `POACustomers/customer/customer-order-history.html`
- `POACustomers/staff/staff-orders.html`
- `POACustomers/GM/gm-dashboard.html`
- أضف `POACustomers/GM/gm-cancellations.html` كملف جديد.

ملف قاعدة البيانات هو `POACustomers/CANCELLATION-REASON-MIGRATION.sql`.

## الخطوة 1 — قاعدة البيانات

1. افتح Supabase للمشروع الصحيح `POACustomers`.
2. افتح **SQL Editor → New query**.
3. انسخ محتوى `CANCELLATION-REASON-MIGRATION.sql` فقط إلى SQL Editor.
4. اضغط **Run** مرة واحدة وانتظر النتيجة. الملف قابل لإعادة التشغيل، لكنه لا يعيد إنشاء الجداول ولا يحذف الطلبات.
5. لا تلصق محتوى `pickup-orders.js` أو أي سطر يبدأ بـ `import` داخل SQL Editor؛ هذا JavaScript وليس SQL.

## الخطوة 2 — ملفات الموقع

ارفع الملفات المذكورة أعلاه إلى GitHub مع الحفاظ على المجلدات. تمت زيادة رقم إصدار JavaScript في صفحات الطلبات لكسر الكاش القديم. لا ترفع الملف SQL إلى مجلد الواجهة على أنه JavaScript؛ هو تعديل قاعدة البيانات فقط.

## الخطوة 3 — اختبار آمن

1. ادخل بحساب موظف مرتبط بفرع، وافتح طلب اختبار في حالة `placed` أو `accepted` أو `preparing`.
2. اضغط **CANCEL ORDER**. ألغِ نافذة السبب أو اتركها فارغة: يجب ألا يُلغى الطلب.
3. أدخل سببًا مثل `العميل طلب الإلغاء` ثم وافق: يجب أن تتحول الحالة إلى `cancelled` ويُحفظ السبب.
4. افتح GM → **Cancellations** وتحقق من ظهور رقم الطلب والسبب.
5. جرّب حساب موظف من فرع آخر؛ يجب ألا يتمكن من إلغاء طلب الفرع الآخر.

## ما تم التحقق منه هنا

- فحص JavaScript باستخدام `node --check` نجح.
- فحص HTML/الربط وفحص ZIP سيتم قبل التسليم.
- لا أملك اتصالًا بقاعدة Supabase الحية من هنا؛ لذلك لم أُشغّل SQL على قاعدة بياناتك. بعد تشغيله، نفّذ الاختبارات السابقة قبل اعتماد التغيير.
