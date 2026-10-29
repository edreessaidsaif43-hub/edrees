window.GameLibraryAccess=(async function(){
 const params=new URLSearchParams(location.search),grade=params.get('grade'),subject=params.get('subject');
 await refreshSubscriptionStatus();
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='data/index.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
 window.__BANK.index=window.__BANK.index.filter(g=>g.subjects.some(s=>isSubjectSubscribed('الصف '+g.n,s)));
 if(!getSubscriptionUserId()||!window.__BANK.index.length){location.replace('/game/');return false;}
 window.gameLibraryAllows=function(id,subject){const g=window.__BANK.index.find(g=>g.id===id);return !!g&&isSubjectSubscribed('الصف '+g.n,subject);};
 window.addEventListener('storage',e=>{if(!e.key || !e.key.startsWith('games-roster:'))location.reload();});
 return true;
})().catch(()=>{location.replace('/game/');return false;});

