/* «سباق المعرفة 3D»: سباق سيارات ثلاثي الأبعاد بين فريقين؛ كل إجابة صحيحة تمنح السيارة دفعة نيترو.
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

  /* ---------- إعداد المعلم ---------- */
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

  /* ---------- سباق المعرفة 3D ---------- */
  var COLORS = ['#e53950', '#16a3a0'];
  var CAR = [{ main: 0xd81f3a, accent: 0x14162b }, { main: 0x0e9c95, accent: 0xffc928 }];
  var DEF_NAMES = ['فريق الصقور', 'فريق المها'];
  var QNAMES = { high: 'عالية', medium: 'متوسطة', low: 'خفيفة' };
  function autoQuality() { var small = Math.min(screen.width, screen.height) < 700, touch = window.matchMedia && matchMedia('(pointer:coarse)').matches; return small || touch ? 'low' : 'medium'; }
  var M = store.get('race-settings', null) || { names: ['', ''], chars: ['boy', 'girl2'], wins: D.defaultWins, time: D.defaultTime, quality: autoQuality() };
  if (D.wins.indexOf(M.wins) < 0) M.wins = D.defaultWins;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  if (D.qualities.indexOf(M.quality) < 0) M.quality = autoQuality();
  function saveM() { store.set('race-settings', M); }
  function tname(i) { return M.names[i] || DEF_NAMES[i]; }
  var GL = !!(window.RaceEngine && window.RaceEngine.supported());

  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    chips($('optWins'), D.wins.map(function (n) { return n + ' إجابات'; }), D.wins.indexOf(M.wins), function (i) { M.wins = D.wins[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    chips($('optQuality'), D.qualities.map(function (q) { return QNAMES[q]; }), D.qualities.indexOf(M.quality), function (i) { M.quality = D.qualities[i]; saveM(); openHome(); });
    var box = $('teamsSetup'); box.innerHTML = '';
    [0, 1].forEach(function (i) {
      if (i === 1) { var vs = document.createElement('div'); vs.className = 'vs'; vs.textContent = 'ضد'; box.appendChild(vs); }
      var card = document.createElement('div'); card.className = 'tcard'; card.style.setProperty('--tc', COLORS[i]);
      card.innerHTML = '<span class="rc-carno">🏎️ ' + (i + 1) + '</span><label class="pname">اسم الفريق<input id="tn' + i + '" type="text" maxlength="18" placeholder="' + DEF_NAMES[i] + '"></label><span class="pick-lbl">سائق الفريق</span><div class="pchars"></div>';
      var inp = card.querySelector('input'); inp.value = M.names[i]; inp.oninput = function () { M.names[i] = inp.value.trim(); saveM(); };
      charPicker(card.querySelector('.pchars'), M.chars[i], function (k) { M.chars[i] = k; saveM(); openHome(); });
      box.appendChild(card);
    });
    if (window.GameRosters && typeof getSubscriptionUserId === 'function') try { GameRosters.picker(S.index[S.grade].id, SEL.subject, ['tn0', 'tn1'], { labels: ['طالب الفريق الأول', 'طالب الفريق الثاني'] }); } catch (e) {}
    $('glNote').textContent = GL ? '' : '⚠️ هذا المتصفح لا يدعم الرسوم ثلاثية الأبعاد (WebGL). جرّب متصفح Chrome أو Edge حديثًا.';
    $('startGame').disabled = !GL;
    show('home');
  }

  var G = null, later = [], hudT = null, ENG = null, ENGQ = null;
  function wait(fn, ms) { later.push(setTimeout(fn, ms)); }
  function clearWait() { later.forEach(clearTimeout); later = []; clearInterval(hudT); }
  function engine() {
    if (ENG && ENGQ === M.quality) return ENG;
    if (ENG) { ENG.stop(); var old = $('rcStage').querySelector('canvas'); if (old) old.remove(); try { ENG.renderer.dispose(); } catch (e) {} }
    ENG = window.RaceEngine.create($('rcStage'), { quality: M.quality, preserve: /[?&]shot=1/.test(location.search) }); ENGQ = M.quality; window.__raceEngine = ENG;
    return ENG;
  }
  function banner(t, cls, ms) { var b = $('banner'); b.innerHTML = t; b.className = 'rc-banner show ' + (cls || ''); clearTimeout(b._t); if (ms) b._t = setTimeout(function () { b.className = 'rc-banner'; }, ms); }
  function pop(t, cls) { var p = $('pop'); p.innerHTML = t; p.className = 'rc-pop ' + (cls || ''); void p.offsetWidth; p.classList.add('show'); }

  function startGame() {
    if (!GL) return;
    window.Sound.unlock(); window.Sound.startMusic();
    closeQuestion(); clearWait();
    G = window.__rc = { qm: new window.QuestionManager(bankOf(), 0), teams: [0, 1].map(function (i) { return { name: tname(i), color: COLORS[i], char: M.chars[i], correct: 0, wrong: 0 }; }), turn: 0, asked: 0, over: false, state: 'load' };
    $('rModal').classList.remove('show');
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    [0, 1].forEach(function (i) {
      var T = G.teams[i], el = $('team' + i);
      el.style.setProperty('--tc', T.color); el.querySelector('img').src = 'assets/characters/' + T.char + '-walk.png'; el.querySelector('.nm b').textContent = T.name;
      var pips = ''; for (var k = 0; k < M.wins; k++) pips += '<i></i>'; el.querySelector('.pips').innerHTML = pips + '<span>⚡ نيترو</span>';
      $('trk' + i).querySelector('img').src = 'assets/characters/' + T.char + '-walk.png'; $('trk' + i).style.borderColor = T.color;
    });
    paintHud(); paintTeacher(); show('play');
    $('banner').className = 'rc-banner'; $('rcLoad').classList.add('show');
    var my = G, E = null;
    function loadFailed(error){if(G!==my)return;clearTimeout(raceLoadTimer);console.error('Race engine startup failed:',error);my.over=true;clearWait();if(ENG){try{ENG.stop();ENG.renderer.dispose();}catch(e){}}$('rcStage').querySelectorAll('canvas').forEach(function(c){c.remove();});ENG=ENGQ=null;G=window.__rc=null;$('rcLoad').classList.remove('show');window.Sound.stopMusic();openHome();$('glNote').textContent='تعذر تشغيل السباق. اختر جودة رسوم خفيفة وأعد المحاولة، أو حدّث المتصفح.';}
    var raceLoadTimer=setTimeout(function(){loadFailed(new Error('Race startup timeout'));},20000);later.push(raceLoadTimer);
    var fontReady = document.fonts && document.fonts.load ? document.fonts.load('80px Taj').catch(function () {}) : Promise.resolve();
    Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
      if (G !== my) return;
      E = engine();
      return E.setTeams([0, 1].map(function (i) { return { main: CAR[i].main, accent: CAR[i].accent, img: window.RACE_CHARS[M.chars[i]] }; })).then(function () {
        if (G !== my) return;
        clearTimeout(raceLoadTimer);$('rcLoad').classList.remove('show'); E.focus(0); E.start(); boardUpdate();
        G.state = 'grid'; banner('استعدّوا…', 'small');
        hudT = setInterval(speedo, 120);
        wait(function () {
          if (G !== my) return;
          E.countdown(function (n) { if (G !== my) return; banner(n ? String(n) : 'انطلق! 🏁', n ? 'count' : 'go', n ? 0 : 1100); window.Sound.play(n ? 'coin' : 'clear'); }, function () { if (G !== my) return; G.state = 'race'; wait(nextTurn, 1300); });
        }, 900);
      });
    }).catch(loadFailed);
  }
  function speedo() { if (!ENG || !G) return; var v = ENG.speedKmh(); $('spd').textContent = v; $('spdArc').setAttribute('stroke-dasharray', Math.min(100, v / 4.2) + ' 100'); }
  function paintHud() {
    var K = M.wins, a = G.teams[0], b = G.teams[1];
    [0, 1].forEach(function (i) {
      var T = G.teams[i], el = $('team' + i), o = G.teams[1 - i];
      el.querySelector('.nm i').textContent = T.correct;
      el.querySelectorAll('.pips i').forEach(function (p, k) { p.className = k < T.correct ? 'on' : ''; });
      el.querySelector('.pos').textContent = T.correct > o.correct || (T.correct === o.correct && (ENG ? (i === 0 ? ENG.gap() >= 0 : ENG.gap() < 0) : i === 0)) ? 1 : 2;
      el.classList.toggle('myturn', G.turn === i && !G.over);
      $('trk' + i).style.right = (T.correct / K * 100) + '%';
    });
    $('trkFill').style.width = (Math.max(a.correct, b.correct) / K * 100) + '%';
    $('hQ').textContent = G.asked;
  }
  function boardUpdate() {
    if (!ENG) return; var t = G.teams, first = t[0].correct >= t[1].correct ? 0 : 1;
    ENG.board([first, 1 - first].map(function (i, k) { return { color: t[i].color, text: (k + 1) + '   ' + t[i].name + '   (' + t[i].correct + ')' }; }));
  }
  function nextTurn() {
    if (!G || G.over) return;
    var i = G.turn, T = G.teams[i];
    ENG.focus(i); G.state = 'turn'; paintHud();
    banner('<small>الدور على</small>' + esc(T.name), 'tb tb' + i, 1500);
    wait(function () {
      if (!G || G.over) return;
      G.state = 'ask'; G.asked++; paintHud();
      showQuestion(G.qm, { time: M.time, tag: '🏎️ ' + T.name, color: T.color, okText: 'إجابة صحيحة! نيترو 🔥', badText: 'انزلقت السيارة — سيعود السؤال لاحقًا 💪' }, function (ok) {
        if (!G || G.over) return;
        if (ok === null) { G.asked--; return endRace('empty'); }
        G.state = 'anim';
        if (ok) {
          T.correct++; paintHud(); boardUpdate();
          pop('نيترو! 🔥<small>إجابة صحيحة لـ' + esc(T.name) + '</small>');
          $('speedLines').classList.add('on'); window.Sound.play('jump');
          ENG.nitro(i, function () { $('speedLines').classList.remove('on'); });
          if (T.correct >= M.wins) return wait(function () { endRace(i); }, 1600);
          wait(after, 2700);
        } else {
          T.wrong++; paintHud(); pop('انزلاق! 💨', 'bad'); window.Sound.play('hurt');
          ENG.slip(i); wait(after, 1900);
        }
      });
    }, 1500);
  }
  function after() { if (!G || G.over) return; G.turn = 1 - G.turn; nextTurn(); }
  function endRace(win) {
    if (!G || G.over) return;
    if(window.GameSCORM){var correct=G.teams.reduce(function(a,t){return a+(t.correct||0);},0),wrong=G.teams.reduce(function(a,t){return a+(t.wrong||0);},0);window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}
    closeQuestion(); G.over = true; G.state = 'final'; paintHud();
    var t = G.teams;
    if (win === 'empty') win = t[0].correct === t[1].correct ? (t[0].correct === 0 ? -1 : (ENG.gap() >= 0 ? 0 : 1)) : (t[0].correct > t[1].correct ? 0 : 1);
    G.winner = win;
    if (win < 0) { banner('انتهت الأسئلة', 'small', 0); return wait(results, 1500); }
    banner('<small>اللفة الأخيرة</small>' + esc(t[win].name) + ' نحو خط النهاية!', 'tb tb' + win, 2600);
    window.Sound.play('jump'); $('speedLines').classList.add('on');
    ENG.finish(win, function () { if (!G) return; $('speedLines').classList.remove('on'); window.Sound.play('clear'); banner('🏆 ' + esc(t[win].name) + ' يفوز!', 'go', 0); wait(results, 1600); });
  }
  function results() {
    if (!G) return; var t = G.teams, win = G.winner; G.state = 'over';
    $('banner').className = 'rc-banner';
    $('winArt').innerHTML = win >= 0 ? '<span class="crown">🏆</span><img src="assets/characters/' + t[win].char + '-jump.png" alt="">' : '<img src="assets/characters/' + t[0].char + '-jump.png" alt=""><img src="assets/characters/' + t[1].char + '-jump.png" alt="">';
    $('rTitle').textContent = win >= 0 ? 'فاز ' + t[win].name + ' بالسباق! 🏁' : 'تعادل الفريقان';
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit + ' • ' + G.asked + ' سؤالًا';
    $('rTable').innerHTML = '<div class="vt-row vt-h rc-row"><span>الفريق</span><b>صحيحة</b><b>خاطئة</b><b>المركز</b></div>' + [0, 1].map(function (i) {
      var place = win < 0 ? '—' : (i === win ? '🥇 1' : '🥈 2');
      return '<div class="vt-row rc-row" style="--tc:' + t[i].color + '"><span><i class="rc-dot"></i>' + esc(t[i].name) + '</span><b>' + t[i].correct + '</b><b>' + t[i].wrong + '</b><b>' + place + '</b></div>';
    }).join('');
    resultsActions(startGame, function () { exitGame(); });
    paintTeacher();
    $('rModal').classList.add('show');
  }
  function exitGame() { if (G) G.over = true; closeQuestion(); clearWait(); if (ENG) ENG.stop(); $('speedLines').classList.remove('on'); window.Sound.stopMusic(); G = null; openHome(); }
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
    if(window.GamePublish?.configure)window.GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'race3d',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
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
