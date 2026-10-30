(function(){
 const loginPage='/game/admin-login.html';
 async function request(action,query={},body,options={}){
  if(window.location.protocol==='file:')throw Error('افتح صفحة الإدارة من رابط الموقع المنشور. الدخول والحفظ يحتاجان تشغيل ملفات الخادم.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  const failure=(message,status)=>Object.assign(new Error(message),{status});
  try{
   const response=await fetch('/api/game-questions?'+new URLSearchParams({action,...query}),{method:body?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
   if(response.status===401&&options.redirectOn401)window.location.replace(loginPage);
   if(response.status===404)throw failure('خادم بنك الأسئلة غير موجود في النسخة المنشورة (404). ارفع مجلد api مع الملفات التابعة له إلى جذر المشروع ثم أعد النشر على Vercel.',404);
   let data;try{data=await response.json();}catch{throw failure(response.ok?'رابط بنك الأسئلة يعيد صفحة بدل بيانات الخادم. تحقق من نشر /api/game-questions في جذر المشروع.':'تعذر تشغيل خادم بنك الأسئلة (HTTP '+response.status+'). تحقق من ملفات API وسجل التشغيل في الاستضافة.',response.status);}
   if(!response.ok)throw failure(data?.message||(response.status===401?'يرجى تسجيل دخول الإدارة.':'تعذر تنفيذ الطلب (HTTP '+response.status+').'),response.status);
   if(!data||typeof data!=='object'||Array.isArray(data))throw failure('استجابة خادم بنك الأسئلة غير صحيحة. تحقق من نشر ملفات API كاملة.',response.status);
   return data;
  }catch(error){if(error.name==='AbortError')throw Error('تأخر الاتصال ببنك الأسئلة. أعد المحاولة.');if(error instanceof TypeError)throw Error('تعذر الوصول إلى خادم بنك الأسئلة. تحقق من اتصال الإنترنت وافتح الصفحة من رابط الموقع المنشور.');throw error;}finally{clearTimeout(timer);}
 }
 window.GameAdminSession={request,loginPage,editorPage:'/game/questions.html'};
})();
