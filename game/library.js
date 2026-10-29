const $ = id => document.getElementById(id);
const bank = window.__BANK.index;
let D = bank.flatMap(g => g.subjects.map(subject => ({'1':'الصف '+g.n,'2':subject})));
let workbook, rows=[];
function showMessage(message){$('notice').textContent=message;}
function goUnifiedAuth(){location.href='/enjazy/auth.html?mode=login&return='+encodeURIComponent('/game/');}
$('login').onclick=e=>{e.preventDefault();goUnifiedAuth();};
function rosterKey(){return 'games-roster:v1:'+getSubscriptionUserId()+':'+$('library-grade').value;}
function roster(){try{return JSON.parse(localStorage.getItem(rosterKey())||'[]');}catch{return [];}}
function paintRoster(){const names=roster();$('names').replaceChildren(...names.map(name=>{const li=document.createElement('li');li.textContent=name;return li;}));$('count').textContent=names.length+' طالبًا';}
function options(el,items){el.replaceChildren(...items.map(([value,text])=>new Option(text,value)));}
function paintSubjects(){const g=bank.find(g=>g.id===$('library-grade').value);options($('library-subject'),g?g.subjects.filter(s=>isSubjectSubscribed('الصف '+g.n,s)).map(s=>[s,s]):[]);$('launch').disabled=$('launch2').disabled=!$('library-subject').value;paintRoster();}
function applySubscriptionToGrades(){const previous=$('library-grade').value;options($('library-grade'),bank.filter(g=>g.subjects.some(s=>isSubjectSubscribed('الصف '+g.n,s))).map(g=>[g.id,'الصف '+g.n]));if([...$('library-grade').options].some(o=>o.value===previous))$('library-grade').value=previous;paintSubjects();}
async function refresh(){ $('launch').disabled=$('launch2').disabled=true;await refreshSubscriptionStatus();applySubscriptionToGrades();fillSubscriptionGradeOptions(bank.filter(g=>g.n!=='غير محدد').map(g=>'الصف '+g.n));if(!getSubscriptionUserId())showMessage('سجل الدخول لعرض المواد المفعلة واستيراد الطلاب.');else if(!$('library-grade').value)showMessage('لا توجد مواد مفعلة ومتاحة في بنك الألعاب. يمكنك تفعيل المواد من نموذج الاشتراك أعلاه.');else showMessage('تم تحديث المواد المفعلة.');}
$('refresh').onclick=refresh;$('library-grade').onchange=paintSubjects;
function loadSheet(){rows=XLSX.utils.sheet_to_json(workbook.Sheets[$('sheet').value],{header:1,defval:'',raw:false,blankrows:false});const width=Math.max(0,...rows.map(r=>r.length));options($('column'),Array.from({length:width},(_,i)=>[String(i),XLSX.utils.encode_col(i)+' — '+String(rows[0]?.[i]||'عمود بلا عنوان').slice(0,60)]));$('import').disabled=!rows.length||!width;}
$('excel').onchange=async()=>{try{const file=$('excel').files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('الحد الأقصى للملف 10 ميجابايت.');if(!window.XLSX)throw Error('تعذر تحميل قارئ Excel. تحقق من الاتصال وأعد تحميل الصفحة.');workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});options($('sheet'),workbook.SheetNames.map(s=>[s,s]));loadSheet();showMessage('اختر عمود الأسماء ثم اضغط إضافة الطلاب.');}catch(e){$('import').disabled=true;showMessage(e.message);}};
$('sheet').onchange=loadSheet;
$('import').onclick=()=>{try{if(!getSubscriptionUserId()||!$('library-grade').value)throw Error('سجل الدخول واختر صفًا مفعلًا أولًا.');const column=Number($('column').value);const incoming=rows.slice($('header').checked?1:0).map(r=>String(r[column]??'').trim().replace(/\s+/g,' ')).filter(Boolean);if(!incoming.length)throw Error('لا توجد أسماء في العمود المختار.');if(incoming.length>3000)throw Error('الحد الأقصى 3000 اسم في العملية الواحدة.');const names=[...new Set([...roster(),...incoming])];localStorage.setItem(rosterKey(),JSON.stringify(names));paintRoster();showMessage('تمت إضافة الأسماء دون تكرار. ستظهر تلقائيًا عند اختيار اللعبة.');}catch(e){showMessage(e.message);}};
$('clear').onclick=()=>{if(confirm('مسح قائمة طلاب الصف المختار من هذا المتصفح؟')){localStorage.removeItem(rosterKey());paintRoster();}};
async function launchGame(game){const grade=$('library-grade').value,subject=$('library-subject').value;await refreshSubscriptionStatus();const g=bank.find(g=>g.id===grade);if(!g||!isSubjectSubscribed('الصف '+g.n,subject)){applySubscriptionToGrades();return showMessage('المادة غير مفعلة. حدّث الاشتراك.');}location.href='/game/'+game+'/?'+new URLSearchParams({grade,subject});}
$('launch').onclick=()=>launchGame('game1');
$('launch2').onclick=()=>launchGame('game2');
window.addEventListener('storage',()=>{location.reload();});
refresh();
