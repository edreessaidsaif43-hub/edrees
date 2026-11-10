
(function(){
  const SK='enjazy_session_v1';
  const MK='lesson_platform_backend_session_v1';
  const scriptUrl=document.currentScript&&document.currentScript.src;
  const siteRoot=scriptUrl?new URL('../',scriptUrl):new URL('./',location.href);
  window.tNav=function(){
    const b=document.getElementById('ntog'),m=document.getElementById('nmob');
    if(!b||!m)return;
    b.classList.toggle('o');m.classList.toggle('o');
    b.setAttribute('aria-expanded',String(m.classList.contains('o')));
  };
  const routes = [
    ['home', '', 'index.html', 'الرئيسية'],
    ['t', 't', 't.html', 'تحضير الدروس'],
    ['ai', 'ai/index.html', 'ai/index.html', 'التحضير بالذكاء الاصطناعي'],
    ['m', 'm', 'm.html', 'حقيبة المعلم'],
    ['games', 'game/', 'game/index.html', 'الألعاب'],
    ['noor', 'noor/', 'noor/index.html', 'خدمات نور'],
    ['board', 'Board/index.html', 'Board/index.html', 'السبورة البيضاء'],
    ['enjazy', 'enjazy', 'enjazy/index.html', 'ملف الإنجاز'],
    ['motivation', 'Motivation+/', 'Motivation+/index.html', 'تحفيز+'],
    ['mash', 'mash/index.html', 'mash/index.html', 'مشاريع المعلمين'],
    ['attendance', 'https://gyab-xi.vercel.app/', 'https://gyab-xi.vercel.app/', 'الحضور والتسرب']
  ];
  function mountNavigation(){
    let nav = document.getElementById('nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'nav';
      document.body.prepend(nav);
    }
    nav.classList.add('site-navbar');
    nav.setAttribute('dir', 'rtl');
    nav.setAttribute('aria-label', 'التنقل الرئيسي');
    let brand = nav.querySelector('.nb');
    if (!brand) {
      brand = document.createElement('a');
      brand.className = 'nb';
      nav.prepend(brand);
    }
    const local = location.protocol === 'file:';
    brand.href = new URL(local ? 'index.html' : '', siteRoot).href;
    brand.replaceChildren();
    const logo = document.createElement('img');
    logo.src = new URL('assets/site-navbar-logo.png', siteRoot).href;
    logo.alt = '';
    const name = document.createElement('span');
    name.className = 'nb-name';
    name.textContent = 'التحضير الذكي للمعلم العماني';
    brand.append(logo, name);
    let desktop = nav.querySelector('.nl');
    if (!desktop) {
      desktop = document.createElement('div');
      desktop.className = 'nl';
      brand.after(desktop);
    }
    let user = document.getElementById('nav-user-area');
    if (!user) {
      user = document.createElement('div');
      user.id = 'nav-user-area';
      desktop.after(user);
    }
    let toggle = document.getElementById('ntog');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'ntog';
      toggle.innerHTML = '<span></span><span></span><span></span>';
      nav.append(toggle);
    }
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'فتح القائمة');
    toggle.setAttribute('aria-controls', 'nmob');
    toggle.setAttribute('aria-expanded', 'false');
    if (!document.getElementById('board-nav-auth')) toggle.onclick = window.tNav;
    let mobile = document.getElementById('nmob');
    if (!mobile) {
      mobile = document.createElement('nav');
      mobile.id = 'nmob';
      nav.after(mobile);
    }
    mobile.classList.add('site-navbar-menu');
    mobile.setAttribute('dir', 'rtl');
    mobile.setAttribute('aria-label', 'التنقل على الهاتف');
    [desktop, mobile].forEach(menu => {
      for (const link of menu.querySelectorAll('a[data-page]')) link.remove();
      const links = document.createDocumentFragment();
      routes.forEach(([id, url, localUrl, label]) => {
        const link = document.createElement('a');
        link.dataset.page = id;
        link.href = new URL(local ? localUrl : url, siteRoot).href;
        link.textContent = label;
        if (id === 'attendance') {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        links.append(link);
      });
      menu.prepend(links);
    });
  }
  function projectRoot(){
    return siteRoot.href;
  }
  window.goUnifiedAuth=function(mode){
    const targetMode=mode||'login';
    const ret=window.location.protocol==='file:'?window.location.href:(window.location.pathname+window.location.search+window.location.hash||'/');
    const auth=window.location.protocol==='file:'?projectRoot()+'enjazy/auth.html':'/enjazy/auth.html';
    window.location.href=auth+'?mode='+encodeURIComponent(targetMode)+'&return='+encodeURIComponent(ret);
  };
  function readSession(){
    try{const r=localStorage.getItem(MK);if(r)return JSON.parse(r);}catch(e){}
    try{const r=localStorage.getItem(SK);const p=r?JSON.parse(r):null;return p&&p.userId?p:null;}catch(e){return null;}
  }
  let sessionCheck;
  async function syncNavUser(){
    if (location.protocol === 'file:') return updateNavUser(readSession());
    const previous=readSession();
    sessionCheck?.abort();
    const controller=new AbortController();
    sessionCheck=controller;
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch('/api/auth/login',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if (!response.ok && response.status!==401) return;
      const verified=response.ok?await response.json():null;
      const stored=readSession();
      if (controller.signal.aborted || previous?.userId!==stored?.userId || previous?.savedAt!==stored?.savedAt) return;
      if (verified?.authenticated===true) {
        updateNavUser(verified.userId && stored?.userId===verified.userId ? stored : {full_name:'المعلم'});
      } else if (response.status===401) {
        updateNavUser(null);
      }
    } catch(e) {
      // Leave the current header alone if the server could not verify the session.
    } finally {
      clearTimeout(timer);
      if (sessionCheck===controller) sessionCheck=undefined;
    }
  }
  window.logoutUnifiedNav=function(){
    sessionCheck?.abort();
    if (/^https?:$/.test(window.location.protocol)) {
      fetch('/api/auth/login', {method:'DELETE',credentials:'same-origin',keepalive:true}).catch(() => {});
    }
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
    const rootPath = decodeURIComponent(siteRoot.pathname).toLowerCase();
    let page=p===rootPath || p===rootPath+'index.html' ? 'home' : '';
    if(/\/game(?:\/|$)/.test(p))page='games';
    if(p.endsWith('/t')||p.endsWith('/t.html'))page='t';
    else if(p.endsWith('/m')||p.endsWith('/m.html'))page='m';
    else if(p.includes('/ai/'))page='ai';
    else if(p.includes('/enjazy'))page='enjazy';
    else if(p.includes('/mash'))page='mash';
    else if(p.includes('/motivation+/'))page='motivation';
    else if(/\/board(?:\/|$)/.test(p))page='board';
    else if(/\/noor(?:\/|$)|\/noor-guide\.html$/.test(p))page='noor';
    document.querySelectorAll('#nav [data-page],#nmob [data-page]').forEach(function(a){
      const active=a.getAttribute('data-page')===page;
      a.classList.toggle('on',active);
      if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
  }
  document.addEventListener('click',function(e){
    const m=document.getElementById('nmob'),b=document.getElementById('ntog');
    if(m&&b&&m.classList.contains('o')&&!m.contains(e.target)&&!b.contains(e.target)){m.classList.remove('o');b.classList.remove('o');b.setAttribute('aria-expanded','false');}
  });
  window.addEventListener('scroll',function(){const n=document.getElementById('nav');if(n)n.classList.toggle('sc',scrollY>10);});
  mountNavigation();markActive();
  if (!document.getElementById('board-nav-auth')) {
    void syncNavUser();
    window.addEventListener('pageshow',event=>{if(event.persisted) void syncNavUser();});
    window.addEventListener('storage',event=>{
      if (event.key!==SK && event.key!==MK && event.key!==null) return;
      if (event.newValue===null) {
        sessionCheck?.abort();
        updateNavUser(null);
        document.getElementById('user-menu')?.remove();
      } else void syncNavUser();
    });
  }
})();
