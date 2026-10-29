window.GameLibraryAccess=(async function(){
 const params=new URLSearchParams(location.search),grade=params.get('grade'),subject=params.get('subject');
 await refreshSubscriptionStatus();
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='data/index.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
 window.__BANK.index=window.__BANK.index.filter(g=>g.subjects.some(s=>isSubjectSubscribed('الصف '+g.n,s)));
 if(!getSubscriptionUserId()||!window.__BANK.index.length){location.replace('/game/');return false;}
 window.gameLibraryAllows=function(id,subject){const g=window.__BANK.index.find(g=>g.id===id);return !!g&&isSubjectSubscribed('الصف '+g.n,subject);};
 let key='';
 const box=document.createElement('div');box.style.cssText='box-sizing:border-box;position:fixed;bottom:0;left:0;right:0;min-height:56px;padding:10px 12px calc(10px + env(safe-area-inset-bottom, 0px));display:flex;align-items:center;justify-content:center;gap:8px;background:#edf7f7;color:#163b72;border-top:1px solid #c9dddd;z-index:30';
 const back=document.createElement('a');back.href='/game/';back.textContent='مكتبة الألعاب';box.append(back);
 const label=document.createElement('label');label.textContent=' | الطالب: ';const select=document.createElement('select');select.append(new Option('اختر الطالب',''));label.append(select);box.append(label);
 window.gameLibrarySetGrade=function(id,subject){const next='games-roster:v2:'+getSubscriptionUserId()+':'+id+':'+normalizeSubscriptionSubject(subject||'');if(key===next)return;key=next;window.gameLibraryStudent='';let names=[];try{names=JSON.parse(localStorage.getItem(key)||'[]');}catch{}select.replaceChildren(new Option('اختر الطالب',''));names.forEach(n=>select.append(new Option(n,n)));};
 select.onchange=()=>{window.gameLibraryStudent=select.value;};document.body.append(box); const footerStyle=document.createElement('style');footerStyle.textContent='.screen{bottom:calc(56px + env(safe-area-inset-bottom, 0px))}';document.head.append(footerStyle); select.style.cssText='max-width:50vw;min-height:34px;font:inherit'; box.style.height='calc(56px + env(safe-area-inset-bottom, 0px))'; window.dispatchEvent(new Event('resize'));
 window.addEventListener('storage',e=>{if(e.key!==key)location.reload();});
 return true;
})().catch(()=>{location.replace('/game/');return false;});

