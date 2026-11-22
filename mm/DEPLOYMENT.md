# نشر نظام الحضور والتسرب المدرسي

## الملفات المطلوبة على الدومين
- `index.html`
- `admin.html`
- `manifest.webmanifest`
- `service-worker.js`

## خطوات الرفع
1. ارفع جميع الملفات إلى جذر الدومين (public_html أو wwwroot).
2. اجعل الصفحة الرئيسية: `index.html`.
3. افتح الرابط:
   - `https://your-domain.com/index.html`
   - `https://your-domain.com/admin.html`

## ملاحظات مهمة
- يفضّل استخدام `HTTPS` لأن الـ `service worker` يعمل بشكل كامل على HTTPS.
- بعد أي تعديل مستقبلي، حدّث إصدار الكاش داخل `service-worker.js` (مثال: `school-attendance-v2`) لضمان وصول التحديث للمستخدمين مباشرة.
- النظام يعتمد على `localStorage` في المتصفح، لذلك بيانات الأكواد والاشتراكات محفوظة على جهاز المستخدم ما لم يتم ربطها بسيرفر مركزي.
