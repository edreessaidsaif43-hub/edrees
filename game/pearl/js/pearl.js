/* «غوص اللؤلؤ»: غوّاص ينزل إلى قاع البحر؛ كل إجابة صحيحة لؤلؤة وعمق أكبر، والخطأ ينقص الأكسجين.
   يستخدم نفس اختيار (الصف ← المادة ← الفصل ← الوحدة ← الدروس) ونفس بنك الأسئلة ومدير الأسئلة. */
(function () {
  var cfg = window.GAME_CONFIG, D = cfg[cfg.mode];
  var $ = function (id) { return document.getElementById(id); };
  var LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var S = { index: null, grade: null, gradeData: null, subj: null, sem: null, unit: null, lessons: [], teacher: { name: '', ig: '' } };
  var gradeCache = {};
  function show(id) {if(window.PublishedGame&&id==='setup')id='home'; ['setup', 'home', 'play'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); }

  /* ---------- البيانات (ملفات JS تعمل دون خادم) ---------- */
  window.__BANK = window.__BANK || {};
  function loadScriptData(name) {
    if(window.__BANK[name])return Promise.resolve(window.__BANK[name]);
    return new Promise(function(resolve,reject){var sc=document.createElement('script'),done=false;
      function finish(error){if(done)return;done=true;clearTimeout(timer);sc.onload=sc.onerror=null;if(error){sc.remove();reject(error);}else resolve(window.__BANK[name]);}
      var timer=setTimeout(function(){finish(new Error('تأخر تحميل بيانات الصف. تحقق من الاتصال وانقر الصف للمحاولة مجددًا.'));},12000);
      sc.src=cfg.dataPath+name+'.js';sc.onload=function(){finish(window.__BANK[name]?null:new Error('بيانات الصف غير مكتملة.'));};sc.onerror=function(){finish(new Error('تعذر تحميل بيانات الصف. تحقق من رفع مجلد data كاملًا.'));};document.head.appendChild(sc);
    });
  }

  function loadGrade(id) {
    if(gradeCache[id])return Promise.resolve(gradeCache[id]);
    var publicQuestions=window.GameQuestionBank?window.GameQuestionBank.load(id):Promise.resolve([]);
    return Promise.all([loadScriptData('grades/'+id),publicQuestions]).then(function(results){var d=window.GameQuestionBank?window.GameQuestionBank.merge(id,results[0],results[1]):results[0];d=d.filter(function(s){return window.gameLibraryAllows(id,s.n);});gradeCache[id]=d;return d;});
  }

  function chips(el, items, cur, onPick) {
    el.innerHTML = '';
    items.forEach(function (it, i) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'chip' + (i === cur ? ' on' : ''); b.textContent = it;
      b.onclick = function () { onPick(i); };
      el.appendChild(b);
    });
  }
  function lock(id, on) { $(id).classList.toggle('locked', !!on); }
  function renderSetup() {
    chips($('grades'), S.index.map(function (g) { return 'الصف ' + g.n; }), S.grade, function (i) {
      S.grade = i; S.subj = S.sem = S.unit = null; S.lessons = []; renderSetup();
      loadGrade(S.index[i].id).then(function(d){if(S.grade!==i)return;S.gradeData=d;$('setupNote').textContent='';renderSetup();}).catch(function(error){$('setupNote').textContent=error.message;});
    });
    var gd = S.grade != null && S.gradeData && S.gradeData === gradeCache[S.index[S.grade].id] ? S.gradeData : null;
    lock('step-subject', !gd); lock('step-sem', !gd || S.subj == null); lock('step-unit', !gd || S.sem == null); lock('step-lessons', !gd || S.unit == null);
    $('subjects').innerHTML = $('sems').innerHTML = $('units').innerHTML = $('lessons').innerHTML = '';
    if (gd) {
      chips($('subjects'), gd.map(function (s) { return s.n; }), S.subj, function (i) { S.subj = i; S.sem = S.unit = null; S.lessons = []; if (gd[i].s.length === 1) S.sem = 0; renderSetup(); });
      if (S.subj != null) {
        var sems = gd[S.subj].s;
        chips($('sems'), sems.map(function (s) { return 'الفصل ' + s.n; }), S.sem, function (i) { S.sem = i; S.unit = null; S.lessons = []; renderSetup(); });
        if (S.sem != null) {
          var units = sems[S.sem].u;
          chips($('units'), units.map(function (u) { return u.n; }), S.unit, function (i) { S.unit = i; S.lessons = units[i].l.map(function (_, k) { return k; }); renderSetup(); });
          if (S.unit != null) {
            units[S.unit].l.forEach(function (L, k) {
              var lab = document.createElement('label'), on = S.lessons.indexOf(k) >= 0;
              lab.className = 'lesson-item' + (on ? ' on' : '');
              lab.innerHTML = '<input type="checkbox"' + (on ? ' checked' : '') + '><span><b dir="auto">' + esc(L.n) + '</b><small>' + L.qs.length + ' أسئلة</small></span>';
              lab.querySelector('input').onchange = function (e) {
                if (e.target.checked) S.lessons.push(k); else S.lessons = S.lessons.filter(function (x) { return x !== k; });
                S.lessons.sort(function (a, b) { return a - b; }); renderSetup();
              };
              $('lessons').appendChild(lab);
            });
          }
        }
      }
    }
    var ready = gd && S.unit != null && S.lessons.length > 0;
    $('buildBtn').disabled=!ready;$('linkBtn').disabled=!ready||!window.GamePublish?.configure;
    var n = ready ? selection().lessons.reduce(function (a, L) { return a + L.qs.length; }, 0) : 0;
    $('setupNote').textContent = ready ? ('بنك الأسئلة: ' + n + ' سؤالًا من ' + S.lessons.length + ' درس') : '';
  }
  function selection() {
    var gd = gradeCache[S.index[S.grade].id], subj = gd[S.subj], sem = subj.s[S.sem], unit = sem.u[S.unit];
    return { gradeName: S.index[S.grade].n, subject: subj.n, sem: sem.n, unit: unit.n, lessons: S.lessons.map(function (k) { return unit.l[k]; }) };
  }
  function hashFor() {
    var p = new URLSearchParams();
    p.set('g', S.index[S.grade].id); p.set('s', S.subj); p.set('m', S.sem); p.set('u', S.unit); p.set('l', S.lessons.join('.'));
    if (S.teacher.name) p.set('t', S.teacher.name);
    if (S.teacher.ig) p.set('ig', S.teacher.ig);
    return '#' + p.toString();
  }
  function readTeacher() { S.teacher.name = $('tName').value.trim(); S.teacher.ig = $('tIg').value.trim().replace(/^@+/, ''); store.set('edu-teacher', S.teacher); }
  function teacherHTML() {
    if (!S.teacher.name && !S.teacher.ig) return '';
    var h = '';
    if (S.teacher.name) h += '<span>إعداد المعلم: ' + esc(S.teacher.name) + '</span>';
    if (S.teacher.ig) h += (h ? '<span>|</span>' : '') + '<span class="ig"><i class="ig-ic">@</i>Instagram: @' + esc(S.teacher.ig) + '</span>';
    return h;
  }
  function paintTeacher() {
    var h = teacherHTML();
    [['teacherHome', 'teacher-badge'], ['teacherHud', 'teacher-mini'], ['teacherQ', 'teacher-mini'], ['teacherR', 'teacher-mini center']].forEach(function (x) { var el = $(x[0]); el.innerHTML = h; el.classList.toggle('show', !!h); });
  }


  /* ---------- نافذة السؤال المشتركة (دون كشف الإجابة الصحيحة عند الخطأ) ---------- */
  var timerT = null, Q = null;
  function runTimer(sec, onEnd) {
    clearInterval(timerT);
    var arc = $('timerArc'), len = 2 * Math.PI * 19, t0 = performance.now();
    arc.style.strokeDasharray = len; arc.style.strokeDashoffset = 0;
    $('timerNum').textContent = sec; $('timer').classList.remove('low');
    timerT = setInterval(function () {
      var rem = Math.max(0, sec - (performance.now() - t0) / 1000);
      $('timerNum').textContent = Math.ceil(rem); arc.style.strokeDashoffset = len * (1 - rem / sec);
      $('timer').classList.toggle('low', rem <= 5);
      if (rem <= 0) { clearInterval(timerT); onEnd(); }
    }, 100);
  }
  // o: { tag, color, time, okText, badText }  ← done(ok, secs) أو done(null) إذا انتهت الأسئلة
  function showQuestion(qm, o, done) {
    var cur = null;
    for (var t = 0; t < 10 && !cur; t++) cur = qm.next();
    if (!cur) return done(null);
    Q = { qm: qm, cur: cur, chosen: null, at: performance.now(), active: true, o: o, done: done };
    var it = cur.item;
    $('qTeam').textContent = o.tag || ''; $('qTeam').style.background = o.color || '#16a3a0'; $('qTeam').hidden = !o.tag;
    $('qType').textContent = it.type === 'mc' ? 'اختيار من متعدد' : 'صح أو خطأ';
    $('qText').textContent = it.text;
    $('qRef').textContent = it._raw.p ? ('صفحة ' + it._raw.p) : ('المرجع: ' + it.ref);
    var fb = $('qFeedback'); fb.textContent = ''; fb.className = 'qfeedback';
    var box = $('qOpts'); box.className = 'qopts' + (it.type === 'tf' ? ' tf' : ''); box.innerHTML = '';
    var conf = $('qConfirm'); conf.disabled = true; conf.style.visibility = 'visible';
    cur.order.forEach(function (orig, pos) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.dataset.choice = orig; b.dataset.pos = pos;
      if (it.type === 'mc') b.innerHTML = '<span class="let">' + LETTERS[pos] + '</span><span dir="auto">' + esc(it.options[orig]) + '</span>';
      else { b.className += orig === 1 ? ' t-yes' : ' t-no'; b.innerHTML = '<span class="let">' + (orig === 1 ? '✓' : '✗') + '</span><span>' + (orig === 1 ? 'صح' : 'خطأ') + '</span>'; }
      b.onclick = function () { if (!Q || !Q.active) return; Q.chosen = orig; box.querySelectorAll('.opt').forEach(function (x) { x.classList.toggle('sel', x === b); }); conf.disabled = false; };
      box.appendChild(b);
    });
    $('timer').hidden = !o.time;
    if (o.time) runTimer(o.time, function () { if (Q && Q.active) resolveQ(false, 'time'); });
    $('qModal').classList.add('show');
    window.Sound.play('question');
  }
  window.__curRaw = function () { return Q && Q.cur ? Q.cur.item._raw : null; };
  function confirmQ() { if (!Q || !Q.active || Q.chosen === null) return; resolveQ(window.__decodeAnswer(Q.cur.item._raw) === Q.chosen, 'answer'); }
  function resolveQ(ok, why) {
    var q = Q; q.active = false; clearInterval(timerT);
    var it = q.cur.item, right = window.__decodeAnswer(it._raw), secs = (performance.now() - q.at) / 1000;
    q.qm.answer(ok ? right : (right + 1) % (it.type === 'mc' ? it.options.length : 2));
    $('qConfirm').disabled = true; $('qConfirm').style.visibility = 'hidden';
    $('qOpts').querySelectorAll('.opt').forEach(function (b) { b.disabled = true; });
    var fb = $('qFeedback');
    if (ok) {
      $('qOpts').querySelector('.opt.sel').classList.add('good');
      fb.textContent = q.o.okText || 'إجابة صحيحة!'; fb.className = 'qfeedback ok';
      window.Sound.play('correct');
    } else {
      var sel = $('qOpts').querySelector('.opt.sel'); if (sel) sel.classList.remove('sel');
      fb.textContent = (why === 'time' ? 'انتهى الوقت. ' : '') + (q.o.badText || 'ليست صحيحة هذه المرة — سيعود السؤال لاحقًا 💪'); fb.className = 'qfeedback bad';
      $('qCard').classList.remove('shake'); void $('qCard').offsetWidth; $('qCard').classList.add('shake');
      window.Sound.play('wrong');
    }
    setTimeout(function () { $('qModal').classList.remove('show'); if (Q === q) Q = null; q.done(ok, secs); }, ok ? 1150 : 1700);
  }
  function closeQuestion() { clearInterval(timerT); if (Q) Q.active = false; Q = null; $('qModal').classList.remove('show'); }
  window.addEventListener('keydown', function (e) {
    if (!Q || !Q.active) return;
    var d = /^(Digit|Numpad)([1-4])$/.exec(e.code);
    if (d) { var b = $('qOpts').querySelector('.opt[data-pos="' + (d[2] - 1) + '"]'); if (b) b.click(); }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); confirmQ(); }
  });
  function bindCommon() {
    $('qConfirm').onclick = confirmQ;
    document.querySelectorAll('.sound-btn').forEach(function (b) {
      b.onclick = function () { window.Sound.unlock(); window.Sound.toggle(); paintSound(); if (!window.Sound.isMuted() && $('play').classList.contains('active')) window.Sound.startMusic(); };
    });
    paintSound();
    $('backSetup').onclick = function () { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} show('setup'); renderSetup(); };
  }
  function paintSound() { var m = window.Sound.isMuted(); document.querySelectorAll('.sound-btn').forEach(function (b) { b.textContent = m ? '🔇' : '🔊'; }); }
  function bankOf() {
    var qs = [];
    SEL.lessons.forEach(function (L) { L.qs.forEach(function (q) { var c = Object.assign({}, q); c.ref = (q.ref || '') + ' – ' + L.n; qs.push(c); }); });
    return { n: SEL.unit, qs: qs };
  }
  function resultsActions(again, edit) {
    var ra = $('rActions'); ra.innerHTML = '';
    [['العب مرة أخرى ↻', 'primary', again], ['تعديل الإعدادات', 'ghost', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); edit(); }], ['تغيير الدروس', 'teal', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); show('setup'); renderSetup(); }]]
      .forEach(function (a) { var b = document.createElement('button'); b.className = 'btn big ' + a[1]; b.textContent = a[0]; b.onclick = a[2]; ra.appendChild(b); });
  }
  var SEL = null;
  var CHAR_N = { girl: 'طالبة', girl2: 'طالبة (عنابي)', boy: 'طالب' };
  function charPicker(box, cur, onPick) {
    box.innerHTML = '';
    ['girl', 'girl2', 'boy'].forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pchar' + (cur === k ? ' on' : ''); b.setAttribute('aria-pressed', String(cur === k));
      b.innerHTML = '<img src="assets/characters/' + k + '-walk.png" alt=""><span>' + CHAR_N[k] + '</span>';
      b.onclick = function () { onPick(k); };
      box.appendChild(b);
    });
  }

  /* ---------- غوص اللؤلؤ ---------- */
  var M = store.get('pearl-settings:'+getSubscriptionUserId(), null) || { char: 'boy', goal: D.defaultGoal, time: D.defaultTime };
  if (D.goals.indexOf(M.goal) < 0) M.goal = D.defaultGoal;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  function saveM() { store.set('pearl-settings:'+getSubscriptionUserId(), M); }
  function bestKey() { return 'pearl-best:' + getSubscriptionUserId()+':'+(window.gameLibrarySection||'')+':'+(window.gameLibraryStudent||'')+':' + location.pathname + ':' + (SEL ? SEL.subject + '|' + SEL.unit + '|' + SEL.lessons.map(function (L) { return L.n; }).join(',') : ''); }

  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    charPicker($('charPick'), M.char, function (k) { M.char = k; saveM(); openHome(); });
    chips($('optGoal'), D.goals.map(function (g) { return g + ' مترًا'; }), D.goals.indexOf(M.goal), function (i) { M.goal = D.goals[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    var b = store.get(bestKey(), 0);
    $('best').textContent = b ? 'أفضل عمق وصلت إليه في هذه الدروس: ' + b + ' مترًا' : 'ما رأيك أن تصل إلى القاع من أول غوصة؟';
    window.GameRosters?.picker(S.index[S.grade].id,SEL.subject,[],{onChange:openHome});
    show('home');
  }

  /* ---------- المشهد ---------- */
  var G = null, raf = 0, parts = [], later = [];
  function wait(fn, ms) { later.push(setTimeout(fn, ms)); }
  function clearWait() { later.forEach(clearTimeout); later = []; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function mix(c1, c2, u) { var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16); var r = Math.round(lerp(a >> 16, b >> 16, u)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, u)), bl = Math.round(lerp(a & 255, b & 255, u)); return 'rgb(' + r + ',' + g + ',' + bl + ')'; }
  function seed() {
    var w = $('world'); w.innerHTML = ''; parts = [];
    for (var i = 0; i < 26; i++) { var e = document.createElement('i'); e.className = 'bub'; var s = 6 + Math.random() * 14; e.style.width = e.style.height = s + 'px'; w.appendChild(e); parts.push({ el: e, kind: 'bub', x: Math.random(), y: Math.random() * (M.goal + 20) - 5, v: 0.6 + Math.random() * 1.2 }); }
    var colors = ['#ffb347', '#ff6f91', '#5ee0d6', '#ffd23f', '#9b8cff'];
    for (i = 0; i < 9; i++) {
      var f = document.createElement('div'); f.className = 'fish'; var c = colors[i % colors.length];
      f.innerHTML = '<svg viewBox="0 0 60 30"><path d="M8 15 Q22 0 40 8 L52 2 L50 15 L52 28 L40 22 Q22 30 8 15Z" fill="' + c + '"/><circle cx="16" cy="13" r="2.4" fill="#1d2b53"/></svg>';
      var sz = 34 + Math.random() * 40; f.style.width = sz + 'px'; w.appendChild(f);
      parts.push({ el: f, kind: 'fish', x: Math.random(), y: 4 + Math.random() * (M.goal + 4), v: (0.0006 + Math.random() * 0.0012) * (i % 2 ? 1 : -1) });
    }
    var r = $('ruler'); r.innerHTML = '';
    for (var d = 0; d <= M.goal + 20; d += 10) { var t = document.createElement('span'); t.dataset.d = d; t.textContent = d + ' م'; r.appendChild(t); }
  }
  function frame() {
    if (!G) return;
    var sea = $('sea'), H = sea.clientHeight, W = sea.clientWidth, ppm = H / 55, dy = H * 0.42;
    G.view += (G.depth - G.view) * 0.06; // نزول/صعود ناعم
    var f = Math.min(1, G.view / Math.max(1, M.goal));
    sea.style.background = 'linear-gradient(180deg,' + mix('#3cc4ec', '#0b3d6e', f) + ' 0%,' + mix('#1683c4', '#041a33', f) + ' 100%)';
    $('sea').style.setProperty('--ray', String(Math.max(0, 0.55 - f * 0.6)));
    parts.forEach(function (p) {
      if (p.kind === 'bub') { p.y -= p.v * 0.03; if (p.y < G.view - 30) p.y = G.view + 30 + Math.random() * 8; p.el.style.transform = 'translate(' + (p.x * W + Math.sin(performance.now() / 600 + p.v * 9) * 8) + 'px,' + (dy + (p.y - G.view) * ppm) + 'px)'; }
      else { p.x += p.v; if (p.x > 1.1) p.x = -0.1; if (p.x < -0.1) p.x = 1.1; p.el.style.transform = 'translate(' + (p.x * W) + 'px,' + (dy + (p.y - G.view) * ppm) + 'px) scaleX(' + (p.v > 0 ? -1 : 1) + ')'; }
    });
    Array.prototype.forEach.call($('ruler').children, function (t) { t.style.transform = 'translateY(' + (dy + (t.dataset.d - G.view) * ppm) + 'px)'; });
    // القاع: تحت قدمي الغوّاص عند الوصول إلى العمق المطلوب
    $('seabed').style.transform = 'translateY(' + (dy + (M.goal + 4.5 - G.view) * ppm) + 'px)';
    $('hDepth').textContent = Math.round(G.view);
    raf = requestAnimationFrame(frame);
  }
  function paintHud() {
    $('hPearls').textContent = G.pearls;
    var o = ''; for (var i = 0; i < D.oxygen; i++) o += '<i class="tank-ic' + (i < G.o2 ? '' : ' empty') + '"></i>';
    $('o2').innerHTML = o;
    $('hProg').style.width = Math.min(100, G.depth / M.goal * 100) + '%';
  }
  function say(t, cls) { var m = $('msg'); m.textContent = t; m.className = 'pl-msg ' + (cls || ''); void m.offsetWidth; m.classList.add('show'); }

  function startGame() {
    window.Sound.unlock(); window.Sound.startMusic();
    closeQuestion(); clearWait(); cancelAnimationFrame(raf);
    G = window.__pl = { qm: new window.QuestionManager(bankOf(), 0), depth: 0, view: -6, pearls: 0, o2: D.oxygen, correct: 0, wrong: 0, state: 'dive', over: false };
    $('rModal').classList.remove('show');
    $('diverImg').src = 'assets/characters/' + M.char + '-walk.png';
    $('diver').className = 'diver'; $('chest').className = 'chest'; $('oyster').className = 'oyster';
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    paintTeacher(); show('play'); seed(); paintHud();
    raf = requestAnimationFrame(frame);
    say('هيا نغوص! 🤿');
    wait(nextQuestion, 1500);
  }
  function nextQuestion() {
    if (!G || G.over) return;
    G.state = 'ask';
    showQuestion(G.qm, { time: M.time, tag: 'العمق ' + G.depth + ' م', color: '#0b6fa4', okText: 'إجابة صحيحة! لؤلؤة جديدة ⚪', badText: 'خسرت أسطوانة أكسجين — سيعود السؤال لاحقًا 💪' }, function (ok) {
      if (!G || G.over) return;
      if (ok === null) return finish('empty');
      if (ok) gotPearl(); else lostO2();
    });
  }
  function gotPearl() {
    G.correct++; G.pearls++; G.state = 'anim';
    var oy = $('oyster'); oy.className = 'oyster'; void oy.offsetWidth; oy.className = 'oyster show';
    wait(function () { oy.classList.add('open'); window.Sound.play('coin'); }, 450);
    wait(function () { flyPearl(); }, 900);
    wait(function () {
      oy.className = 'oyster';
      G.depth = Math.min(M.goal, G.depth + D.step); paintHud();
      $('diver').classList.add('down');
      if (G.depth >= M.goal) { wait(function () { finish('bottom'); }, 1600); return; }
      wait(function () { $('diver').classList.remove('down'); nextQuestion(); }, 1500);
    }, 1350);
  }
  function flyPearl() {
    var fx = $('fx'), p = document.createElement('i'); p.className = 'fly-pearl';
    var s = $('oyster').getBoundingClientRect(), t = $('hPearls').getBoundingClientRect(), base = $('sea').getBoundingClientRect();
    p.style.left = (s.left - base.left + s.width / 2) + 'px'; p.style.top = (s.top - base.top + s.height * 0.4) + 'px';
    fx.appendChild(p);
    requestAnimationFrame(function () { p.style.transform = 'translate(' + (t.left - s.left - s.width / 2) + 'px,' + (t.top - s.top - s.height * 0.4) + 'px) scale(.5)'; p.style.opacity = '.2'; });
    setTimeout(function () { p.remove(); G && paintHud(); $('hPearls').parentNode.classList.remove('bump'); void $('hPearls').offsetWidth; $('hPearls').parentNode.classList.add('bump'); }, 800);
  }
  function lostO2() {
    G.wrong++; G.o2--; G.state = 'anim'; paintHud();
    var fl = $('flash'); fl.className = 'pl-flash'; void fl.offsetWidth; fl.className = 'pl-flash on';
    var dv = $('diver'); dv.classList.remove('hurt'); void dv.offsetWidth; dv.classList.add('hurt');
    burst();
    window.Sound.play('hurt');
    if (G.o2 <= 0) { say('نفد الأكسجين! اصعد إلى السطح', 'bad'); wait(function () { G.depth = 0; $('diver').classList.add('up'); }, 900); wait(function () { finish('o2'); }, 3200); return; }
    say('بقيت ' + G.o2 + (G.o2 === 1 ? ' أسطوانة' : ' أسطوانتان') + ' أكسجين', 'bad');
    wait(nextQuestion, 1400);
  }
  function burst() {
    var fx = $('fx'), d = $('diver').getBoundingClientRect(), base = $('sea').getBoundingClientRect();
    for (var i = 0; i < 14; i++) {
      var b = document.createElement('i'); b.className = 'burst';
      b.style.left = (d.left - base.left + d.width * (0.3 + Math.random() * 0.4)) + 'px'; b.style.top = (d.top - base.top + d.height * 0.2) + 'px';
      b.style.setProperty('--dx', ((Math.random() - 0.5) * 120) + 'px'); b.style.animationDelay = (Math.random() * 0.25) + 's';
      fx.appendChild(b); setTimeout(function (x) { return function () { x.remove(); }; }(b), 1600);
    }
  }
  function finish(why) {
    if (!G || G.over) return;
    if(window.GameSCORM){var correct=G.correct||0,wrong=G.wrong||0;window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}

    G.over = true; closeQuestion(); clearWait();
    var key = bestKey(), best = Math.max(store.get(key, 0), G.depth === 0 && why === 'o2' ? G.correct * D.step : G.depth);
    var reached = why === 'o2' ? G.correct * D.step : G.depth;
    store.set(key, Math.max(store.get(key, 0), reached));
    if (why === 'bottom') { $('chest').classList.add('open'); window.Sound.play('clear'); confettiPearls(); }
    else window.Sound.play(why === 'o2' ? 'gameover' : 'clear');
    $('winArt').innerHTML = (why === 'bottom' ? '<span class="crown">🏆</span>' : '') + '<img src="assets/characters/' + M.char + '-jump.png" alt="">';
    $('rTitle').textContent = why === 'bottom' ? 'وصلت إلى القاع! كنز من اللآلئ 🎉' : why === 'o2' ? 'نفد الأكسجين — غوصة رائعة!' : 'انتهت أسئلة الدروس المختارة';
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit;
    var rows = [['أقصى عمق', reached + ' م'], ['اللآلئ', G.pearls], ['إجابات صحيحة', G.correct], ['إجابات خاطئة', G.wrong], ['الأكسجين المتبقي', Math.max(0, G.o2) + ' / ' + D.oxygen], ['أفضل عمق في هذه الدروس', Math.max(best, reached) + ' م']];
    $('rTable').innerHTML = rows.map(function (r) { return '<div class="vt-row pl-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
    resultsActions(startGame, openHome);
    paintTeacher();
    wait(function () { $('rModal').classList.add('show'); }, why === 'bottom' ? 1600 : 300);
  }
  function confettiPearls() {
    var fx = $('fx');
    for (var i = 0; i < 30; i++) { var p = document.createElement('i'); p.className = 'rain-pearl'; p.style.left = (5 + Math.random() * 90) + '%'; p.style.animationDelay = (Math.random() * 0.8) + 's'; fx.appendChild(p); }
  }
  function exitGame() { if (!G) return; G.over = true; closeQuestion(); clearWait(); cancelAnimationFrame(raf); window.Sound.stopMusic(); openHome(); }
  function bind() {
    bindCommon();
    $('startGame').onclick = startGame;
    $('exitBtn').onclick = exitGame;
  }

  async function boot() {
    if(!window.GameLibraryAccess)throw Error('تعذر تحميل ملف تشغيل اللعبة. أعد تحميل الصفحة.');
    if(!(await window.GameLibraryAccess))return;
    bind();
    var t = store.get('edu-teacher', null);
    S.teacher = t || { name: cfg.teacherName || '', ig: cfg.teacherInstagram || '' };
    $('tName').value = S.teacher.name; $('tIg').value = S.teacher.ig;
    $('tName').oninput = $('tIg').oninput = readTeacher;
    $('buildBtn').onclick = function () { readTeacher(); try { history.replaceState(null, '', hashFor()); } catch (e) {} openHome(); };
    if(window.GamePublish?.configure)window.GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'pearl',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
    $('selAll').onclick = function () { var gd = gradeCache[S.index[S.grade].id]; S.lessons = gd[S.subj].s[S.sem].u[S.unit].l.map(function (_, k) { return k; }); renderSetup(); };
    $('selNone').onclick = function () { S.lessons = []; renderSetup(); };
    loadScriptData('index').then(function (idx) {
      S.index = idx;
      var h = new URLSearchParams(window.PUBLISHED_SELECTION||location.hash.slice(1));
      if (h.get('g')) {
        var gi = idx.findIndex(function (g) { return g.id === h.get('g'); });
        if (gi >= 0) {
          S.grade = gi;
          if (h.get('t') !== null || h.get('ig') !== null) S.teacher = { name: h.get('t') || '', ig: h.get('ig') || '' };
          return loadGrade(idx[gi].id).then(function (d) {
            S.gradeData = d; S.subj = +h.get('s'); S.sem = +h.get('m'); S.unit = +h.get('u');
            S.lessons = (h.get('l') || '').split('.').filter(Boolean).map(Number);
            try { selection(); openHome(); } catch (e) { renderSetup(); }
          });
        }
      }
      renderSetup();
    }).catch(function (e) { $('grades').innerHTML = '<span class="muted">تعذّر تحميل بنك الأسئلة (' + esc(e.message) + '). تأكد من وجود مجلد data بجانب الملف.</span>'; });
    window.__gameStart = startGame;
  }
  function startBoot(){boot().catch(function(error){console.error('Game boot failed:',error);if(window.gameLibraryShowError){window.gameLibraryShowError(error);return;}var host=$('grades');if(host){host.textContent=error.message||'تعذر بدء اللعبة. أعد تحميل الصفحة.';var retry=document.createElement('button');retry.type='button';retry.textContent='إعادة المحاولة';retry.onclick=function(){location.reload();};host.appendChild(retry);}});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startBoot);else startBoot();
})();
