window.GameRosters={
 key(user,grade,subject){return 'games-rosters:v3:'+user+':'+grade+':'+normalizeSubscriptionSubject(subject);},
 read(user,grade,subject){try{const value=localStorage.getItem(this.key(user,grade,subject));if(value){const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}const old=JSON.parse(localStorage.getItem('games-roster:v2:'+user+':'+grade+':'+normalizeSubscriptionSubject(subject))||'[]');return Array.isArray(old)&&old.length?{'القائمة السابقة':old}:{};}catch{return {};}},
 save(user,grade,subject,data){localStorage.setItem(this.key(user,grade,subject),JSON.stringify(data));},
 names(data,section){return Object.hasOwn(data,section)&&Array.isArray(data[section])?data[section]:[];},
 picker(grade,subject,inputIds){
  const host=document.querySelector('#home .duo-wrap, #home .lad-wrap');if(!host)return;
  let box=document.getElementById('game-section-picker');if(!box){box=document.createElement('label');box.id='game-section-picker';box.style.cssText='display:block;margin:12px 0;padding:12px;border-radius:10px;background:#fff;color:#173849;font:700 14px Tahoma,Arial';box.append(document.createTextNode('شعبة الطلاب: '));const s=document.createElement('select');s.id='game-section';s.style.cssText='font:inherit;max-width:100%;padding:8px;border:1px solid #cadbd7;border-radius:8px';box.append(s);host.prepend(box);}
  const select=document.getElementById('game-section'),context=this.key(getSubscriptionUserId(),grade,subject),prev=box.dataset.context===context?select.value:'';box.dataset.context=context;
  const data=this.read(getSubscriptionUserId(),grade,subject),sections=Object.keys(data);select.replaceChildren(new Option('اختر الشعبة',''),...sections.map(s=>new Option(s,s)));if(sections.includes(prev))select.value=prev;
  let list=document.getElementById('saved-students');if(!list){list=document.createElement('datalist');list.id='saved-students';document.body.append(list);}inputIds.forEach(id=>document.getElementById(id).setAttribute('list','saved-students'));
  const paint=()=>list.replaceChildren(...this.names(data,select.value).map(n=>new Option(n,n)));select.onchange=()=>{paint();inputIds.forEach(id=>{const el=document.getElementById(id);el.value='';el.dispatchEvent(new Event('input'));});};paint();
 }
};
