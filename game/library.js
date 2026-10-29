const $ = id => document.getElementById(id);
const bank = window.__BANK?.index || [];
let D = bank.flatMap(g => g.subjects.map(subject => ({'1':'الصف '+g.n,'2':subject})));
let workbook, rows=[];
function showMessage(message){$('notice').textContent=message;}
function goUnifiedAuth(){location.href='/enjazy/auth.html?mode=login&return='+encodeURIComponent('/game/');}
$('login').onclick=e=>{e.preventDefault();goUnifiedAuth();};
function rosterKey(){return 'games-roster:v2:'+getSubscriptionUserId()+':'+$('library-grade').value+':'+normalizeSubscriptionSubject($('roster-subject').value);}
function roster(){try{return JSON.parse(localStorage.getItem(rosterKey())||'[]');}catch{return [];}}
function paintRoster(){const names=roster();$('names').replaceChildren(...names.map(name=>{const li=document.createElement('li');li.textContent=name;return li;}));$('count').textContent=names.length+' طالبًا';}
function options(el,items){el.replaceChildren(...items.map(([value,text])=>new Option(text,value)));}
function paintSubjects(){const g=bank.find(g=>g.id===$('library-grade').value);const prev=$('roster-subject').value;options($('roster-subject'),[['','اختر المادة'],...(g?g.subjects.filter(s=>isSubjectSubscribed('الصف '+g.n,s)).map(s=>[s,s]):[])]);if([...$('roster-subject').options].some(o=>o.value===prev))$('roster-subject').value=prev; $('launch').disabled=$('launch-camel').disabled=!bank.some(g=>g.subjects.some(s=>isSubjectSubscribed('الصف '+g.n,s)));paintRoster(); }
function applySubscriptionToGrades(){const previous=$('library-grade').value;options($('library-grade'),bank.filter(g=>g.subjects.some(s=>isSubjectSubscribed('الصف '+g.n,s))).map(g=>[g.id,'الصف '+g.n]));if([...$('library-grade').options].some(o=>o.value===previous))$('library-grade').value=previous;paintSubjects();}
async function refresh(){ $('launch').disabled=$('launch-camel').disabled=true;await refreshSubscriptionStatus();applySubscriptionToGrades();fillSubscriptionGradeOptions(bank.filter(g=>g.n!=='غير محدد').map(g=>'الصف '+g.n));if(!bank.length)showMessage('تعذر تحميل بيانات رحلة المعرفة. ستتاح اللعبة بعد رفع ملفاتها وإعادة تحميل الصفحة.');else if(!getSubscriptionUserId())showMessage('سجل الدخول لعرض المواد المفعلة واستيراد الطلاب.');else if(!$('library-grade').value)showMessage('لا توجد مواد مفعلة ومتاحة في بنك الألعاب. افتح قسم الاشتراك وتفعيل المواد أعلى الصفحة.');else showMessage('تم تحديث المواد المفعلة.');}
$('roster-subject').onchange=paintRoster;
$('refresh').onclick=refresh;$('library-grade').onchange=paintSubjects;
function loadSheet(){rows=XLSX.utils.sheet_to_json(workbook.Sheets[$('sheet').value],{header:1,defval:'',raw:false,blankrows:false});$('import').disabled=!rows.length;}
$('excel').onchange=async()=>{try{const file=$('excel').files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('الحد الأقصى للملف 10 ميجابايت.');if(!window.XLSX)throw Error('تعذر تحميل قارئ Excel. تحقق من الاتصال وأعد تحميل الصفحة.');workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});options($('sheet'),workbook.SheetNames.map(s=>[s,s]));loadSheet();showMessage('ستُقرأ الأسماء من العمود الأول (A). اختر الصف والمادة ثم اضغط حفظ الطلاب.');}catch(e){$('import').disabled=true;showMessage(e.message);}};
$('sheet').onchange=loadSheet;
$('import').onclick=()=>{try{if(!getSubscriptionUserId()||!$('library-grade').value)throw Error('سجل الدخول واختر صفًا مفعلًا أولًا.');if(!$('roster-subject').value)throw Error('اختر المادة قبل حفظ الطلاب.');const column=0;const incoming=rows.slice($('header').checked?1:0).map(r=>String(r[column]??'').trim().replace(/\s+/g,' ')).filter(Boolean);if(!incoming.length)throw Error('لا توجد أسماء في العمود الأول (A).');if(incoming.length>3000)throw Error('الحد الأقصى 3000 اسم في العملية الواحدة.');const names=[...new Set([...roster(),...incoming])];localStorage.setItem(rosterKey(),JSON.stringify(names));paintRoster();showMessage('تمت إضافة الأسماء دون تكرار. ستظهر تلقائيًا عند اختيار اللعبة.');}catch(e){showMessage(e.message);}};
$('clear').onclick=()=>{if(confirm('مسح قائمة طلاب الصف والمادة المختارين من هذا المتصفح؟')){localStorage.removeItem(rosterKey());paintRoster();}};
async function launchGame(game){$('launch').disabled=$('launch-camel').disabled=true;await refreshSubscriptionStatus();applySubscriptionToGrades();if(!bank.some(g=>g.subjects.some(s=>isSubjectSubscribed('الصف '+g.n,s))))return showMessage('سجل الدخول وفعّل اشتراك مادة لبدء اللعبة.');location.href='/game/'+game+'/';}
$('launch').onclick=()=>launchGame('rihlat-almarifa');
$('launch-camel').onclick=()=>launchGame('camel-race');

window.addEventListener('storage',()=>{location.reload();});
refresh();
