window.GameRosters={
 key(user,grade,subject){return 'games-rosters:v3:'+user+':'+grade+':'+normalizeSubscriptionSubject(subject);},
 read(user,grade,subject){try{const value=localStorage.getItem(this.key(user,grade,subject));if(value){const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}const old=JSON.parse(localStorage.getItem('games-roster:v2:'+user+':'+grade+':'+normalizeSubscriptionSubject(subject))||'[]');return Array.isArray(old)&&old.length?{'القائمة السابقة':old}:{};}catch{return {};}},
 save(user,grade,subject,data){localStorage.setItem(this.key(user,grade,subject),JSON.stringify(data));},
 names(data,section){return Object.hasOwn(data,section)&&Array.isArray(data[section])?data[section]:[];},
 picker(grade,subject,inputIds=[],config={}){
  const host=document.querySelector('#home .home-wrap, #home .duo-wrap, #home .lad-wrap, #home .om-wrap');if(!host)return;
  let box=document.getElementById('game-section-picker');if(!box){box=document.createElement('section');box.id='game-section-picker';box.setAttribute('aria-label','اختيار الطلاب');box.style.cssText='margin:14px 0;padding:16px;border:1px solid #cbded9;border-radius:12px;background:#fff;color:#173849;font:14px/1.7 Tahoma,Arial;text-align:right';host.prepend(box);}
  const context=this.key(getSubscriptionUserId(),grade,subject),data=this.read(getSubscriptionUserId(),grade,subject),sections=Object.keys(data),count=inputIds.length||1;
  let state=box._rosterState;if(!state||state.context!==context){state={context,section:'',students:[]};box._rosterState=state;inputIds.forEach(id=>{const input=document.getElementById(id);if(input){input.value='';input.dispatchEvent(new Event('input'));}});}
  if(!sections.includes(state.section))state.section='';const names=this.names(data,state.section);state.students=Array.from({length:count},(_,i)=>names.includes(state.students[i])?state.students[i]:'');
  window.gameLibrarySection=state.section;window.gameLibraryStudents=state.students.slice();window.gameLibraryStudent=state.students[0]||'';
  box.replaceChildren();const title=document.createElement('strong');title.textContent='طلاب الصف والمادة المختارين';box.append(title);
  const fields=document.createElement('div');fields.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:12px;margin-top:10px';box.append(fields);
  const field=(title,id)=>{const label=document.createElement('label');label.style.cssText='display:flex;flex-direction:column;gap:5px;margin:0;font:inherit';label.append(document.createTextNode(title));const select=document.createElement('select');select.id=id;select.style.cssText='width:100%;min-width:0;min-height:44px;padding:8px;border:1px solid #cbded9;border-radius:8px;background:white;color:#173849;font:inherit';label.append(select);fields.append(label);return select;};
  const section=field('الشعبة','game-section');section.append(new Option('اختر الشعبة',''),...sections.map(n=>new Option(n,n)));section.value=state.section;section.disabled=!sections.length;
  const changed=()=>{this.picker(grade,subject,inputIds,config);if(config.onChange)config.onChange();};
  section.onchange=()=>{state.section=section.value;state.students=[];inputIds.forEach(id=>{const input=document.getElementById(id);if(input){input.value='';input.dispatchEvent(new Event('input'));}});changed();};
  for(let i=0;i<count;i++){const label=config.labels?.[i]||(count===1?'الطالب':'الطالب '+(i+1)),select=field(label,'game-student-'+i);select.append(new Option('اختر الطالب',''),...names.map(n=>new Option(n,n)));select.value=state.students[i];select.disabled=!state.section||!names.length;
   select.onchange=()=>{state.students[i]=select.value;const input=document.getElementById(inputIds[i]);if(input){input.value=select.value;input.dispatchEvent(new Event('input'));}changed();};
   const input=document.getElementById(inputIds[i]);if(input&&state.students[i]){input.value=state.students[i];input.dispatchEvent(new Event('input'));}
  }
  const hint=document.createElement('p');hint.style.cssText='font-size:12px;color:#667c80;margin:10px 0 0';hint.textContent=!sections.length?'لا توجد قوائم طلاب محفوظة لهذا الصف والمادة. أضف شعبة وطلابها من مكتبة الألعاب.':!state.section?'اختر الشعبة لعرض طلابها.':!names.length?'لا توجد أسماء في هذه الشعبة. أضف الطلاب من مكتبة الألعاب.':'تظهر الأسماء المحفوظة للشعبة المختارة فقط.';box.append(hint);
 }
};
