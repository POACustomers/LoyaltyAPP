# Dina’s Corner — إعداد التوصيل حسب الطريق حتى 50 كم

## الوضع الحالي
التعديل يعتمد على خدمة Supabase Edge Function باسم `delivery-routing`. ملف TypeScript وحده داخل مستودع GitHub Pages لا يشغّل الخدمة تلقائيًا؛ يجب نشره كـ Edge Function في مشروع Supabase نفسه.

## 1. تأكد من إحداثيات كل فرع
في `public.locations` يجب أن يحتوي كل فرع نشط على `latitude` و`longitude` صحيحتين. الخدمة ترفض إصدار عرض السعر إذا كانت إحداثيات أي فرع نشط مفقودة، حتى تستطيع مقارنة كل الفروع واختيار الأقرب فعليًا.

## 2. شغّل ترحيل SQL مرة واحدة
الملف: `supabase/migrations/20261026_delivery_route_50km.sql`. افتح ملف SQL في محرر Supabase جديد، والصق محتواه بالكامل في الاستعلام، ثم شغّله مرة واحدة. إذا ظهر خطأ، توقف وأرسل نص الخطأ؛ لا تحذف أي دالة موجودة يدويًا.

## 3. انشر Edge Function
ضع الملف في المسار `supabase/functions/delivery-routing/index.ts` وانشر الدالة باسم `delivery-routing` باستخدام Supabase CLI أو محرر Edge Functions في لوحة Supabase. لا ترفع ملف TypeScript إلى GitHub Pages فقط وتتوقع أن ينفّذ هناك.

## 4. إعداد أسرار الخدمة
في Supabase Edge Function secrets، اضبط `GOOGLE_ROUTES_API_KEY` بمفتاح Google Routes API الذي فعّلته مع الفوترة. اترك `GOOGLE_ROUTES_MODE` فارغًا لاستخدام الوضع الافتراضي `TWO_WHEELER`، أو اضبطه على `DRIVE` لاستخدام السيارة. المفتاح يبقى في أسرار الخادم ولا يوضع داخل JavaScript المنشور للعميل. الخدمة تستخدم `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` من بيئة Supabase.

## 5. ارفع تعديلات الواجهة
ارفع `POACustomers/assets/pickup-orders.js` و`POACustomers/customer/customer-orders.html` من هذه النسخة إلى المستودع الصحيح. أصبحت واجهة Checkout تطلب عرض الطريق عبر `sb.functions.invoke('delivery-routing', ...)` ولا تحتاج إلى اختيار `delivery_zone_id`.

## القواعد
- أقرب فرع نشط حسب مسافة الطريق من خدمة Google Routes.
- سعر التوصيل 10 جنيهات لكل كيلومتر، بالتناسب: الرسوم = الأمتار ÷ 100.
- الحد الأقصى 50,000 متر.
- عند تعذر حساب أي مسار مطلوب أو تجاوز 50 كم، لا يُنشأ طلب.
- خصومات العروض تبقى موقوفة في Checkout إلى أن تكون معتمدة ومتحققًا منها في الخادم؛ رسوم التوصيل لا تدخل في خصم المنتج.

## اختبار ما بعد النشر
1. افتح صفحة Checkout وحدّث GPS.
2. تأكد من ظهور أقرب فرع والمسافة ورسوم التوصيل.
3. اختبر موقعًا ضمن 50 كم ثم موقعًا خارج 50 كم.
4. لا تجرّب إنشاء طلب فعلي قبل التأكد من نجاح اختبار المسار ورسالة الرفض للموقع البعيد.
