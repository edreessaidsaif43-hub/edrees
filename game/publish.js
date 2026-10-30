(function(){
 const encoder=new TextEncoder(),decoder=new TextDecoder();
 const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
 const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 async function encode(data){const raw=encoder.encode(JSON.stringify(data));if(window.CompressionStream){const compressed=await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();return 'd.'+b64(new Uint8Array(compressed));}return 'u.'+b64(raw);}
 async function decode(token){if(token.length>150000)throw Error('رابط اللعبة أكبر من الحد المسموح.');const [type,value]=token.split('.');let bytes=unb64(value||'');if(type==='d'){if(!window.DecompressionStream)throw Error('افتح الرابط في متصفح حديث يدعم هذه اللعبة.');bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());}else if(type!=='u')throw Error('رابط اللعبة غير صحيح.');if(bytes.length>2*1024*1024)throw Error('بيانات اللعبة أكبر من الحد المسموح.');return validate(JSON.parse(decoder.decode(bytes)));}
 const gameIds=['rihlat-almarifa','camel-race','duo-challenge','who-wins-lesson','oman-teams','penalty','heroes-battle','tug','wheel','pearl','castle','escape'];
 function validate(p){if(!p||p.version!==1||!gameIds.includes(p.game)||!Array.isArray(p.lessons)||!p.lessons.length||p.lessons.length>200||typeof p.gradeId!=='string'||!/^g\d{2}$/.test(p.gradeId)||typeof p.subject!=='string')throw Error('بيانات نشر اللعبة غير صحيحة.');let count=0;for(const l of p.lessons){if(!l||typeof l.n!=='string'||!Array.isArray(l.qs))throw Error('بيانات الدروس غير صحيحة.');count+=l.qs.length;}if(!count||count>3000)throw Error('اختر دروسًا تحتوي بين سؤال واحد و3000 سؤال.');if(JSON.stringify(p).length>2*1024*1024)throw Error('اختر عددًا أقل من الدروس.');return p;}
 function hash(p){return '#'+new URLSearchParams({g:p.gradeId,s:'0',m:'0',u:'0',l:p.lessons.map((_,i)=>i).join('.'),t:p.teacher?.name||'',ig:p.teacher?.ig||''});}
 async function text(url){const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw Error('تعذر تحميل ملف النشر: '+url);return r.text();}
 function xml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
 function prepare(html,p,base,bootstrap='student-bootstrap.js'){
  const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script[src]').forEach(s=>{const src=s.getAttribute('src');if(src.startsWith('/game/')||/demo-?.*\.js/.test(src))s.remove();});
  if(base){const b=doc.createElement('base');b.href=base;doc.head.prepend(b);}
  const style=doc.createElement('style');style.textContent='#setup,#backSetup,#linkBtn,.game-library-back{display:none!important}';doc.head.append(style);
  const data=doc.createElement('script');data.id='published-lesson';data.type='application/json';data.textContent=JSON.stringify(p).replace(/</g,'\\u003c');doc.head.append(data);
  const runtime=doc.createElement('script');runtime.src=base?'/game/scorm-runtime.js':'scorm-runtime.js';doc.head.append(runtime);
  const boot=doc.createElement('script');boot.src=bootstrap;doc.head.append(boot);
  const title=doc.createElement('title');title.textContent=p.title;doc.head.append(title);
  return '<!doctype html>\n'+doc.documentElement.outerHTML;
 }
 // ZIP with STORE entries; no external library is required.
 const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
 function zip(files){const chunks=[],directory=[];let offset=0;const put16=(v,o,n)=>v.setUint16(o,n,true),put32=(v,o,n)=>v.setUint32(o,n,true);for(const [name,input]of files){const bytes=typeof input==='string'?encoder.encode(input):new Uint8Array(input),n=encoder.encode(name),sum=crc(bytes),h=new Uint8Array(30),v=new DataView(h.buffer);put32(v,0,0x04034b50);put16(v,4,20);put16(v,6,0x800);put32(v,14,sum);put32(v,18,bytes.length);put32(v,22,bytes.length);put16(v,26,n.length);chunks.push(h,n,bytes);const c=new Uint8Array(46),cv=new DataView(c.buffer);put32(cv,0,0x02014b50);put16(cv,4,20);put16(cv,6,20);put16(cv,8,0x800);put32(cv,16,sum);put32(cv,20,bytes.length);put32(cv,24,bytes.length);put16(cv,28,n.length);put32(cv,42,offset);directory.push(c,n);offset+=h.length+n.length+bytes.length;}const size=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);put32(ev,0,0x06054b50);put16(ev,8,files.length);put16(ev,10,files.length);put32(ev,12,size);put32(ev,16,offset);return new Blob([...chunks,...directory,end],{type:'application/zip'});}
 function manifest(p,files){return '<?xml version="1.0" encoding="UTF-8"?>\n<manifest identifier="GAME_'+p.game.replace(/-/g,'_')+'" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="ORG"><organization identifier="ORG"><title>'+xml(p.title)+'</title><item identifier="ITEM" identifierref="SCO"><title>'+xml(p.title)+'</title></item></organization></organizations><resources><resource identifier="SCO" type="webcontent" adlcp:scormtype="sco" href="index.html">'+files.filter(f=>f!=='imsmanifest.xml').map(f=>'<file href="'+xml(f)+'"/>').join('')+'</resource></resources></manifest>';}
 async function packageSCORM(p){validate(p);const base=new URL('/game/'+p.game+'/',location.href);const [html,paths,bootstrap,runtime]=await Promise.all([text(new URL('index.html',base)),text(new URL('package-assets.json',base)).then(JSON.parse),text('/game/student-bootstrap.js'),text('/game/scorm-runtime.js')]);if(!Array.isArray(paths)||paths.some(s=>typeof s!=='string'||s.startsWith('/')||s.includes('..')||!/^(js|css|assets)\//.test(s)))throw Error('فهرس ملفات اللعبة غير صحيح.');const files=[['index.html',prepare(html,p,null)],['student-bootstrap.js',bootstrap],['scorm-runtime.js',runtime]];let next=0;await Promise.all(Array.from({length:Math.min(6,paths.length)},async()=>{while(next<paths.length){const path=paths[next++],r=await fetch(new URL(path,base));if(!r.ok)throw Error('تعذر تحميل '+path);files.push([path,await r.arrayBuffer()]);}}));files.push(['imsmanifest.xml',manifest(p,files.map(f=>f[0]))]);return zip(files);}
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function configure(getSnapshot){
  const button=document.getElementById('linkBtn');if(!button)return;button.textContent='تحميل SCORM ↓';
  button.onclick=async()=>{const status=document.getElementById('setupNote');button.disabled=true;
   try{const p=validate(getSnapshot());status.textContent='جارٍ تجهيز ملف SCORM…';await refreshSubscriptionStatus();if(!isSubjectSubscribed(p.gradeName,p.subject))throw Error('يجب أن تكون المادة مفعلة في اشتراكك لتحميلها.');download(await packageSCORM(p),p.game+'-scorm.zip');status.textContent='تم تجهيز ملف ZIP للتحميل على جهازك.';}
   catch(e){status.textContent=e.message;}
   finally{button.disabled=!!document.getElementById('buildBtn')?.disabled;}
  };
 }
 window.GamePublish={configure,encode,decode,validate,prepare,packageSCORM,zip,manifest,hash};
})();
