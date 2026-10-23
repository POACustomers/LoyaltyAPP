# تثبيت Patch الإصلاح — بالعربية

هذا الملف المرفق مع حزمة Patch. الملفات الأخرى في ZIP موجودة بمساراتها نسبةً إلى جذر مستودع `POACustomers/LoyaltyAPP`.

1. نزّل نسخة ZIP احتياطية من المستودع واحتفظ بها قبل أي تغيير.
2. فك ضغط الـPatch على الكمبيوتر.
3. انقل المجلدات والملفات إلى جذر نسخة محلية من المستودع مع الحفاظ على المسارات. وافق على استبدال الملفات ذات الاسم نفسه، ولا ترفع ملف ZIP نفسه إلى GitHub.
4. راجع `INSTALL-PRE-SALE-CANDIDATE-AR.md` و`POACustomers/DATABASE-SETUP-AR.md` قبل أي SQL.
5. **لا تشغّل ملف core-bootstrap على قاعدة Dina الحالية.** استخدم `POACustomers/PRODUCTION-DIAGNOSTICS-READONLY.sql` أولًا، ثم نفذ فقط التعديلات الناقصة بعد نسخة احتياطية.
6. تأكد من نشر Supabase Function `username-login`، واضبط `ALLOWED_ORIGINS` في المشروع الصحيح.
7. ارفع التعديلات إلى GitHub، انتظر نجاح Pages، ثم نفذ اختبارًا لكل دور وطلب Pickup/Delivery والنقاط والعروض.

## حدود ما تم اختباره

تم اختبار صياغة JavaScript/TypeScript وCSS، وروابط HTML الثابتة، وملفات manifest وService Worker، وبناء نسخة tenant. لم تُنفذ SQL على قاعدة حية، ولم يُنشر الموقع أو الـEdge Function من هذه الحزمة. لا توجد بوابة دفع إلكتروني ضمن الإصلاح.
