(function(){
 const data=document.getElementById('published-lesson');if(!data)return;const lesson=JSON.parse(data.textContent);let api=null,active=false,finished=false,completed=false;const started=Date.now();
 function find(win){for(let i=0;i<30&&win;i++){try{if(win.API)return win.API;if(win===win.parent)break;win=win.parent;}catch{break;}}return null;}
 api=find(window);if(!api){try{api=find(window.opener);}catch{}}
 function call(name,...args){try{return api?.[name](...args);}catch{return null;}}
 function set(key,value){if(active)call('LMSSetValue',key,String(value));}
 if(api){active=String(call('LMSInitialize',''))==='true';if(active){const status=call('LMSGetValue','cmi.core.lesson_status');completed=['completed','passed','failed'].includes(status);if(!completed)set('cmi.core.lesson_status','incomplete');set('cmi.core.score.min',0);set('cmi.core.score.max',100);}}
 function report(detail){if(!active||finished)return;const score=Number(detail.score);if(Number.isFinite(score))set('cmi.core.score.raw',Math.max(0,Math.min(100,score)).toFixed(2));if(detail.completed){completed=true;set('cmi.core.lesson_status','completed');}if(detail.location)set('cmi.core.lesson_location',String(detail.location).slice(0,255));if(detail.state){const value=JSON.stringify(detail.state);if(value.length<=4000)set('cmi.suspend_data',value);}call('LMSCommit','');}
 window.GameSCORM={report,learnerId:active?String(call('LMSGetValue','cmi.core.student_id')||''):''};
 function close(){if(!active||finished)return;const seconds=(Date.now()-started)/1000,h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=(seconds%60).toFixed(2).padStart(5,'0');set('cmi.core.session_time',String(h).padStart(4,'0')+':'+String(m).padStart(2,'0')+':'+s);set('cmi.core.exit',completed?'':'suspend');call('LMSCommit','');call('LMSFinish','');finished=true;}
 window.addEventListener('pagehide',close);window.addEventListener('beforeunload',close);
})();
