# إصلاح تحميل الأقسام في إدارة المنيو

هذا تحديث محدود لملفي الواجهة فقط؛ لا يحذف بيانات ولا يتطلب SQL جديدًا.

## الملفات التي يجب استبدالها في مستودع GitHub `POACustomers/LoyaltyAPP`

1. استبدل `POACustomers/GM/gm-menu.html` بملف `gm-menu.html` الموجود في الحزمة.
2. استبدل `POACustomers/GM/gm-categories.html` بملف `gm-categories.html` الموجود في الحزمة.
3. اضغط Commit changes على فرع `main` وانتظر اكتمال GitHub Pages.
4. افتح صفحة GM Menu وGM Categories من جديد واضغط `Ctrl + F5`.

## ماذا يفعل التعديل؟

- لا يترك القائمة في حالة `Loading categories…` إلى ما لا نهاية.
- إذا تأخر الاتصال بـ Supabase أكثر من 12 ثانية، يعرض رسالة timeout.
- إذا رفضت قاعدة البيانات الطلب، يعرض رسالة الخطأ الأصلية لتحديد هل الجدول أو الصلاحية أو الاتصال هو السبب.
- لا يغيّر بيانات Supabase ولا الأدوار ولا إعدادات الاتصال.

إذا ظهرت رسالة `permission denied` أو `relation public.menu_categories does not exist` أو `timed out`, أرسل نص الرسالة كما هو؛ لكل حالة إصلاح مختلف. لا تشغّل ملف bootstrap الأساسي مرة أخرى.
