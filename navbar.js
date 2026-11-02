
(function(){
  const SK='enjazy_session_v1';
  const MK='lesson_platform_backend_session_v1';
  window.tNav=function(){
    const b=document.getElementById('ntog'),m=document.getElementById('nmob');
    if(!b||!m)return;
    b.classList.toggle('o');m.classList.toggle('o');
  };
  function projectRoot(){
    const href=window.location.href;
    const marker='/New%20project2/';
    const i=href.indexOf(marker);
    if(i>-1)return href.slice(0,i+marker.length);
    return new URL('./',href).href;
  }
  window.goUnifiedAuth=function(mode){
    const targetMode=mode||'login';
    const ret=window.location.protocol==='file:'?window.location.href:(window.location.pathname+window.location.search+window.location.hash||'/');
    const auth=window.location.protocol==='file:'?projectRoot()+'enjazy/auth.html':'https://altahdir.app/enjazy/auth.html';
    window.location.href=auth+'?mode='+encodeURIComponent(targetMode)+'&return='+encodeURIComponent(ret);
  };
  function readSession(){
    try{const r=localStorage.getItem(MK);if(r)return JSON.parse(r);}catch(e){}
    try{const r=localStorage.getItem(SK);const p=r?JSON.parse(r):null;return p&&p.userId?{userId:p.userId}:null;}catch(e){return null;}
  }
  window.logoutUnifiedNav=function(){
    localStorage.removeItem(SK);localStorage.removeItem(MK);localStorage.removeItem('lesson_platform_current_user_v1');
    updateNavUser(null);
    document.getElementById('user-menu')?.remove();
  };
  window.showUnifiedUserMenu=function(el){
    const old=document.getElementById('user-menu');
    if(old){old.remove();return;}
    const menu=document.createElement('div');
    menu.id='user-menu';
    menu.style.cssText='position:fixed;top:66px;left:20px;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(10,22,40,.12);padding:6px;z-index:99999;min-width:160px;font-family:Tajawal,sans-serif';
    menu.innerHTML='<a href="https://altahdir.app/enjazy" style="display:block;padding:9px 14px;text-decoration:none;color:var(--ink);font-size:13px;font-weight:700;border-radius:7px">📁 ملف الإنجاز</a><a href="#" onclick="goUnifiedAuth(\'login\');return false;" style="display:block;padding:9px 14px;text-decoration:none;color:var(--ink);font-size:13px;font-weight:700;border-radius:7px">✏️ بيانات الحساب</a><hr style="border:none;border-top:1px solid var(--line);margin:4px 0"><button onclick="logoutUnifiedNav()" style="display:block;width:100%;padding:9px 14px;text-align:right;background:none;border:none;color:#c0392b;font-size:13px;font-weight:700;cursor:pointer;border-radius:7px;font-family:Tajawal,sans-serif">🚪 تسجيل الخروج</button>';
    document.body.appendChild(menu);
    setTimeout(function(){document.addEventListener('click',function h(e){if(!menu.contains(e.target)&&!el.contains(e.target)){menu.remove();document.removeEventListener('click',h)}})},0);
  };
  function updateNavUser(session){
    const area=document.getElementById('nav-user-area');
    if(!area)return;
    if(session&&(session.userId||session.full_name||session.email)){
      const name=String(session.full_name||session.email||'المعلم').split(' ')[0].replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
      area.innerHTML='<button class="nav-user-pill" onclick="showUnifiedUserMenu(this)">👤 '+name+' <span style="font-size:10px;opacity:.6">▼</span></button>';
    }else{
      area.innerHTML='<button class="nav-auth-btn" onclick="goUnifiedAuth()"><span>👤</span> دخول / تسجيل</button>';
    }
  }
  function markActive(){
    const p=decodeURIComponent(location.pathname).toLowerCase();
    let page='home';
    if(p.includes('/game/'))page='games';
    if(p.endsWith('/t')||p.endsWith('/t.html'))page='t';
    else if(p.endsWith('/m')||p.endsWith('/m.html'))page='m';
    else if(p.includes('/ai/'))page='ai';
    else if(p.includes('/enjazy/'))page='enjazy';
    else if(p.includes('/mash/'))page='mash';
    else if(p.includes('/motivation+/'))page='motivation';
    document.querySelectorAll('#nav [data-page],#nmob [data-page]').forEach(function(a){a.classList.toggle('on',a.getAttribute('data-page')===page)});
  }
  document.addEventListener('click',function(e){
    const m=document.getElementById('nmob'),b=document.getElementById('ntog');
    if(m&&b&&m.classList.contains('o')&&!m.contains(e.target)&&!b.contains(e.target)){m.classList.remove('o');b.classList.remove('o');}
  });
  window.addEventListener('scroll',function(){const n=document.getElementById('nav');if(n)n.classList.toggle('sc',scrollY>10);});
  markActive();updateNavUser(readSession());
})();
