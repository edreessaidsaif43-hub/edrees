window.GameLibraryAccess=(async function(){
 const params=new URLSearchParams(location.search),grade=params.get('grade'),subject=params.get('subject');
 await refreshSubscriptionStatus();
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='data/index.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
 const g=window.__BANK.index.find(g=>g.id===grade);
 if(!g||!g.subjects.includes(subject)||!isSubjectSubscribed('الصف '+g.n,subject)){location.replace('/game/');return false;}
 window.__BANK.index=[g];
 window.gameLibrarySubject=subject;
 const key='games-roster:v1:'+getSubscriptionUserId()+':'+grade;
 let names=[];try{names=JSON.parse(localStorage.getItem(key)||'[]');}catch{}
 const box=document.createElement('div');box.style.cssText='padding:10px;text-align:center;background:#edf7f7;color:#163b72;position:relative;z-index:20';
 const back=document.createElement('a');back.href='/game/';back.textContent='مكتبة الألعاب';box.append(back);
 const label=document.createElement('label');label.textContent=' | الطالب: ';const select=document.createElement('select');select.append(new Option('اختر الطالب',''));names.forEach(n=>select.append(new Option(n,n)));label.append(select);box.append(label);
 select.onchange=()=>{window.gameLibraryStudent=select.value;};document.body.prepend(box);
 window.addEventListener('storage',e=>{if(e.key!==key)location.reload();});
 return true;
})().catch(()=>{location.replace('/game/');return false;});
