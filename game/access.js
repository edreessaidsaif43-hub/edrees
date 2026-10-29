window.GameLibraryAccess=(async function(){
 const backStyle=document.createElement('style');
 backStyle.textContent='.game-library-back{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:8px 14px;margin:0 0 16px;border:1px solid #cbded9;border-radius:10px;background:#fff;color:#155e59;text-decoration:none;font:700 13px/1.5 Tahoma,Arial,sans-serif;max-width:100%;box-sizing:border-box}.game-library-back:hover{background:#edf7f4}.game-library-back:focus-visible{outline:3px solid #e9aa44;outline-offset:3px}';
 document.head.appendChild(backStyle);
 ['#setup .setup-wrap','#home .home-wrap','#home .duo-wrap','#home .lad-wrap','#home .om-wrap'].forEach(function(selector){
   const container=document.querySelector(selector);if(!container||container.querySelector('.game-library-back'))return;
   const back=document.createElement('a');back.className='game-library-back';back.href=location.protocol==='file:'?new URL('../index.html',location.href).href:'/game/';back.textContent='→ الرجوع إلى مكتبة الألعاب';container.prepend(back);
 });

 const params=new URLSearchParams(location.search),grade=params.get('grade'),subject=params.get('subject');
 await refreshSubscriptionStatus();
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='data/index.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
 window.__BANK.index=window.__BANK.index.filter(g=>g.subjects.some(s=>isSubjectSubscribed('الصف '+g.n,s)));
 if(!getSubscriptionUserId()||!window.__BANK.index.length){location.replace('/game/');return false;}
 window.gameLibraryAllows=function(id,subject){const g=window.__BANK.index.find(g=>g.id===id);return !!g&&isSubjectSubscribed('الصف '+g.n,subject);};
 window.addEventListener('storage',e=>{if(!e.key || !e.key.startsWith('games-roster:'))location.reload();});
 return true;
})().catch(()=>{location.replace('/game/');return false;});

