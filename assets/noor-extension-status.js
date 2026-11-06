(function(){
 'use strict';
 const html=document.documentElement,services=html.hasAttribute('data-noor-services');
 const channel='altahdir-noor-extension-status-v1',dismissKey='noor-extension-dismissed-until-v1',week=7*86400000;
 const ua=navigator.userAgent||'';
 const mobile=!!navigator.userAgentData?.mobile||/Android|iPhone|iPad|iPod|Mobile/i.test(ua)||(/Macintosh|MacIntel/i.test(ua+' '+navigator.platform)&&navigator.maxTouchPoints>1);
 const firefox=/Firefox|FxiOS/i.test(ua),mobileChrome=mobile&&!firefox&&/Chrome|Chromium|CriOS|EdgA|OPR/i.test(ua);
 const browser=mobile?'firefox':firefox?'firefox':/Chrome|Chromium|Edg|OPR/i.test(ua)?'chrome':'';
 const urls={chrome:'https://chromewebstore.google.com/detail/fgdlajfbjmobhaeabmgdfgmecpjjlmng',firefox:'https://addons.mozilla.org/en-US/firefox/addon/التحضير-الذكي-للمعلم-العماني/'};
 let status=document.getElementById('noor-ext-status');
 if(!status){status=document.createElement('div');status.id='noor-ext-status';const anchor=document.getElementById('nmob')||document.getElementById('nav');if(anchor)anchor.insertAdjacentElement('afterend',status);else document.body.prepend(status);}
 const shell=document.createElement('div');shell.className='noor-extension-shell';if(services)shell.setAttribute('data-noor-services-wrapper','1');status.before(shell);shell.appendChild(status);
 if(/\/game\/[^/]+\/(?:index\.html)?$/.test(location.pathname||'')){shell.setAttribute('data-noor-game-screen','1');shell.style.top=document.getElementById('nav')?'62px':'0';}
 const close=document.createElement('button');close.type='button';close.className='noor-extension-dismiss';close.textContent='✕';close.setAttribute('aria-label','إخفاء تنبيه الإضافة أسبوعًا');close.title='إخفاء أسبوعًا';shell.appendChild(close);
 try{const until=Number(localStorage.getItem(dismissKey));shell.hidden=Number.isFinite(until)&&until>Date.now();}catch{}
 close.addEventListener('click',()=>{try{localStorage.setItem(dismissKey,String(Date.now()+week));}catch{}shell.hidden=true;});
 let detected=false,version='',expired=false,catalog=null,loading=false,requestId='',timer,pollTimer,probeBox,probe,retryTimers=[];
 let message,link,recheck,storeNote,serviceNote;
 let seenMarker='',seenDOM='';
 function valid(value){if(typeof value!=='string')return '';const v=value.trim();return /^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(v)&&v.split('.').every(n=>Number(n)<=65535)?v:'';}
 function compare(a,b){const x=valid(a),y=valid(b);if(!x||!y)return null;const aa=x.split('.').map(Number),bb=y.split('.').map(Number);for(let i=0;i<Math.max(aa.length,bb.length);i++){if((aa[i]||0)!==(bb[i]||0))return (aa[i]||0)<(bb[i]||0)?-1:1;}return 0;}
 function text(node,value){if(node.textContent!==value)node.textContent=value;}
 function attr(node,key,value){if(node.getAttribute(key)!==value)node.setAttribute(key,value);}
 function ensureUI(){
  if(services)return;
  if(message?.isConnected&&link?.isConnected)return;
  status.classList.add('noor-extension-notice');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  status.replaceChildren();message=document.createElement('span');message.className='noor-extension-message';
  const actions=document.createElement('span');actions.className='noor-extension-actions';
  link=document.createElement('a');link.id='noor-ext-install';link.target='_blank';link.rel='noopener noreferrer';link.className='noor-extension-store-link';
  recheck=document.createElement('button');recheck.type='button';recheck.textContent='التحقق من آخر إصدار';recheck.addEventListener('click',()=>{start();loadCatalog();});
  storeNote=document.createElement('span');storeNote.className='noor-extension-store-note';
  actions.append(link,recheck);status.append(message,actions,storeNote);
 }
 function render(){
  if(services){
   const ready=!!version||status.getAttribute('data-state')==='ready';
   if(ready&&!mobileChrome){status.hidden=false;if(serviceNote)serviceNote.hidden=true;return;}
   if(!mobileChrome&&!expired)return;
   if(!serviceNote){serviceNote=document.createElement('div');serviceNote.className='noor-extension-notice noor-extension-service-note';serviceNote.setAttribute('role','status');status.after(serviceNote);}
   status.hidden=true;serviceNote.hidden=false;attr(serviceNote,'data-state',detected?'outdated':'missing');
   const label=mobileChrome?'الإضافة تعمل على الحاسوب، وعلى فايرفوكس في أندرويد':detected?'إضافة التحضير الذكي مثبتة، لكن إصدارها قديم':'يجب تثبيت آخر إصدار من إضافة التحضير الذكي.';
   if(serviceNote.getAttribute('data-label')!==label){serviceNote.replaceChildren();const copy=document.createElement('span');copy.textContent=label;serviceNote.appendChild(copy);if(urls[browser]){const action=document.createElement('a');action.href=urls[browser];action.target='_blank';action.rel='noopener noreferrer';action.textContent=detected?'تحديث الإضافة':'فتح صفحة الإضافة';serviceNote.appendChild(action);}attr(serviceNote,'data-label',label);}
   return;
  }ensureUI();
  const latest=catalog?.[browser]&&!catalog[browser].error?valid(catalog[browser].version):'';
  const comparison=compare(version,latest);let state='checking',label='جارٍ التحقق من إضافة التحضير الذكي…',action='',note='';
  if(mobileChrome){state='unsupported';label='الإضافة تعمل على الحاسوب، وعلى فايرفوكس في أندرويد';action='فتح صفحة الإضافة لفايرفوكس';}
  else if(version){
   state=comparison!==null&&comparison<0?'outdated':'ready';label='✓ إضافة التحضير الذكي مثبتة (الإصدار '+version+')';
   if(state==='outdated'){label+=' — يتوفر إصدار أحدث.';action='تحديث الإضافة';}
   else if(!loading&&!latest)note='تعذّر جلب إصدار المتجر حاليًا. يمكنك إعادة الفحص.';
  }else if(!expired){label='جارٍ التحقق من إضافة التحضير الذكي…';}
  else if(detected){state='outdated';label='إضافة التحضير الذكي مثبتة، لكن إصدارها قديم';action='تحديث الإضافة';}
  else{state='missing';label='يجب تثبيت آخر إصدار من إضافة التحضير الذكي.';action='تثبيت آخر إصدار';}
  if(!browser&&!mobileChrome){state='unsupported';label='افتح هذه الصفحة من كروم أو فايرفوكس لاستخدام الإضافة.';action='';}
  attr(status,'data-state',state);attr(status,'data-update-state',state==='outdated'?'outdated':comparison!==null&&comparison>=0?'current':'unknown');
  text(message,label);text(storeNote,note);storeNote.hidden=!note;
  link.hidden=!action||!urls[browser];if(urls[browser])link.href=urls[browser];text(link,action);
  recheck.disabled=loading;recheck.hidden=mobileChrome;
 }
 function report(v,sourceBrowser){
  if(sourceBrowser&&sourceBrowser!==browser)return;
  if(mobileChrome)return;
  detected=true;const supplied=valid(v);if(supplied)version=supplied;
  render();
 }
 function readSignals(){
  const marker=valid(html.getAttribute('data-noor-ext'));if(marker&&marker!==seenMarker){seenMarker=marker;report(marker,browser);}
  const supplied=valid(status.getAttribute('data-version')),sourceBrowser=status.getAttribute('data-browser');
  const signature=supplied+'|'+(sourceBrowser||browser);
  if(status.getAttribute('data-state')==='ready'&&supplied&&signature!==seenDOM){seenDOM=signature;if(!marker||compare(supplied,marker)>=0)report(supplied,sourceBrowser||browser);}
 }
 function sendRequest(){
  if(mobileChrome)return;
  const payload={channel,type:'status-request',requestId};
  window.postMessage(payload,location.origin==='null'?'*':location.origin);
  if(browser==='chrome'&&window.chrome?.runtime?.sendMessage){try{window.chrome.runtime.sendMessage('fgdlajfbjmobhaeabmgdfgmecpjjlmng',payload,response=>{if(!window.chrome.runtime.lastError)accept(response);});}catch{}}
 }
 function accept(data){if(data&&data.channel===channel&&data.type==='status-response'&&data.requestId===requestId&&data.installed===true)report(data.version,data.browser);}
 function probeStyles(){
  if(mobileChrome||probeBox||version)return;
  probeBox=document.createElement('div');probeBox.style.setProperty('display','none','important');probeBox.setAttribute('aria-hidden','true');probe=document.createElement('span');probe.className='noor-t-box';probe.style.setProperty('forced-color-adjust','none');probeBox.appendChild(probe);document.body.appendChild(probeBox);
  let count=0;function check(){
   const style=getComputedStyle(probe);
   if(style.display==='grid'&&style.borderTopStyle==='dashed'&&parseFloat(style.borderTopWidth)>0&&style.borderTopColor.replace(/\s/g,'')==='rgb(15,118,110)'&&style.backgroundColor.replace(/\s/g,'')==='rgb(240,253,250)'){detected=true;render();}
   if(++count<60&&!version)pollTimer=setTimeout(check,500);else{probeBox.remove();probeBox=null;}
  }check();
 }
 function start(){
  clearTimeout(timer);clearTimeout(pollTimer);retryTimers.forEach(clearTimeout);retryTimers=[];
  if(probeBox){probeBox.remove();probeBox=null;}
  // Keep a reported version until the extension supplies a newer report; never erase extension-owned attributes.
  expired=false;requestId=window.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
  readSignals();render();sendRequest();
  retryTimers=[500,1500,3000].map(delay=>setTimeout(sendRequest,delay));
  timer=setTimeout(()=>{expired=true;readSignals();render();},6000);probeStyles();
 }
 let catalogId=0;
 async function loadCatalog(){const id=++catalogId;loading=true;render();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);try{const response=await fetch((location.protocol==='file:'?'https://altahdir.app':'')+'/api/noor-extension-versions',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('unavailable');const data=await response.json();if(id===catalogId)catalog=data;}catch{if(id===catalogId)catalog=null;}finally{clearTimeout(timeout);if(id===catalogId){loading=false;render();}}}
 window.addEventListener('message',event=>{if(event.source===window&&event.origin===location.origin)accept(event.data);});
 new MutationObserver(()=>{readSignals();if(!services&&(!message?.isConnected||!link?.isConnected))render();}).observe(status,{attributes:true,attributeFilter:['data-state','data-version','data-browser'],childList:true,subtree:true});
 new MutationObserver(readSignals).observe(html,{attributes:true,attributeFilter:['data-noor-ext']});
 window.addEventListener('load',sendRequest);document.addEventListener('DOMContentLoaded',sendRequest,{once:true});
 readSignals();ensureUI();start();if(!services)loadCatalog();
})();
