(function(){
 const el=document.getElementById('published-lesson');if(!el)return;
 const p=JSON.parse(el.textContent);window.PublishedGame=p;
 window.__BANK={index:[{id:p.gradeId,n:p.gradeName.replace(/^الصف\s*/,''),subjects:[p.subject]}]};
 window.__BANK['grades/'+p.gradeId]=[{n:p.subject,s:[{n:p.sem,u:[{n:p.unit,l:p.lessons}]}]}];
 window.PUBLISHED_SELECTION=new URLSearchParams({g:p.gradeId,s:'0',m:'0',u:'0',l:p.lessons.map((_,i)=>i).join('.'),t:p.teacher?.name||'',ig:p.teacher?.ig||''}).toString();
 window.GameLibraryAccess=Promise.resolve(true);window.gameLibraryAllows=(id,subject)=>id===p.gradeId&&subject===p.subject;
 window.getSubscriptionUserId=()=> 'published:'+p.id+':'+(window.GameSCORM?.learnerId||'guest');window.GameRosters={picker(){}};window.GamePublish={configure(){}};
 const hide=()=>document.querySelectorAll('#rActions button').forEach(b=>{if(/تغيير الدروس/.test(b.textContent))b.hidden=true;});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{hide();new MutationObserver(hide).observe(document.body,{childList:true,subtree:true});});else {hide();new MutationObserver(hide).observe(document.body,{childList:true,subtree:true});}
})();
