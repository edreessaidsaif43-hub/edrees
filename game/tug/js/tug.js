/* «شدّ الحبل»: فريقان يجيبان في الوقت نفسه؛ كل إجابة صحيحة تسحب الحبل نحو الفريق.
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

  /* ---------- شدّ الحبل ---------- */
  var COLORS = ['#16a3a0', '#ff7a1a'];
  var DEF_NAMES = ['فريق الصقور', 'فريق النمور'];
  var KEYS = [['Digit1', 'Digit2', 'Digit3', 'Digit4'], ['Digit7', 'Digit8', 'Digit9', 'Digit0']];
  var M = store.get('tug-settings:'+getSubscriptionUserId(), null) || { names: ['', ''], chars: ['boy', 'girl2'], steps: D.defaultSteps, dur: D.defaultDuration };
  if (D.steps.indexOf(M.steps) < 0) M.steps = D.defaultSteps;
  if (D.durations.indexOf(M.dur) < 0) M.dur = D.defaultDuration;
  function saveM() { store.set('tug-settings:'+getSubscriptionUserId(), M); }
  function tname(i) { return M.names[i] || DEF_NAMES[i]; }
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    chips($('optSteps'), D.steps.map(function (n) { return n + ' سحبات'; }), D.steps.indexOf(M.steps), function (i) { M.steps = D.steps[i]; saveM(); openHome(); });
    chips($('optDur'), D.durations.map(function (t) { return t ? (t / 60) + ' دقائق' : 'بلا وقت'; }), D.durations.indexOf(M.dur), function (i) { M.dur = D.durations[i]; saveM(); openHome(); });
    var box = $('teamsSetup'); box.innerHTML = '';
    [0, 1].forEach(function (i) {
      if (i === 1) { var vs = document.createElement('div'); vs.className = 'vs'; vs.textContent = 'ضد'; box.appendChild(vs); }
      var card = document.createElement('div'); card.className = 'tcard'; card.style.setProperty('--tc', COLORS[i]);
      card.innerHTML = '<span class="tdot"></span><label class="pname">اسم الفريق<input id="tn' + i + '" type="text" maxlength="18" placeholder="' + DEF_NAMES[i] + '"></label><span class="pick-lbl">شخصية الفريق</span><div class="pchars"></div>';
      var inp = card.querySelector('input'); inp.value = M.names[i]; inp.oninput = function () { M.names[i] = inp.value.trim(); saveM(); };
      charPicker(card.querySelector('.pchars'), M.chars[i], function (k) { M.chars[i] = k; saveM(); openHome(); });
      box.appendChild(card);
    });
    if (window.GameRosters && typeof getSubscriptionUserId === 'function') try { GameRosters.picker(S.index[S.grade].id, SEL.subject, ['tn0', 'tn1'], { labels: ['طالب الفريق الأول', 'طالب الفريق الثاني'] }); } catch (e) {}
    show('home');
  }

  var G = null, later = [], clockT = null;
  function wait(fn, ms) { later.push(setTimeout(fn, ms)); }
  function clearWait() { later.forEach(clearTimeout); later = []; clearInterval(clockT); }
  function stepPx() { var f = $('field'); return Math.min(f.clientWidth * 0.36, 520) / M.steps; }
  function paintRope() {
    $('rope').style.transform = 'translateX(' + (G.pos * stepPx()) + 'px)';
    [0, 1].forEach(function (i) { var t = G.teams[i]; $('ps' + i).textContent = 'سحبات: ' + t.pulls; });
    // خطّا الفوز
    var f = $('field'), w = f.clientWidth / 2, d = M.steps * stepPx();
    $('field').querySelector('.l0').style.left = (w + d) + 'px'; $('field').querySelector('.l1').style.left = (w - d) + 'px';
  }
  function pullers(i) {
    var c = M.chars[i], h = '';
    for (var k = 0; k < 3; k++) h += '<img src="assets/characters/' + c + '-side.png" alt="" style="--k:' + k + '">';
    $('pull' + i).innerHTML = h;
  }
  function startGame() {
    window.Sound.unlock(); window.Sound.startMusic();
    closeQuestion(); clearWait();
    G = window.__tg = { teams: [0, 1].map(function (i) { return { name: tname(i), color: COLORS[i], qm: new window.QuestionManager(bankOf(), 0), cur: null, lock: false, pulls: 0, wrong: 0 }; }), pos: 0, over: false, started: false, left: M.dur };
    $('rModal').classList.remove('show');
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    $('hClock').textContent = M.dur ? '⏱ ' + fmtTime(M.dur) : 'بلا وقت';
    [0, 1].forEach(function (i) {
      $('panel' + i).style.setProperty('--tc', COLORS[i]); $('pn' + i).textContent = G.teams[i].name;
      $('po' + i).innerHTML = ''; $('pq' + i).textContent = ''; $('pf' + i).textContent = ''; $('pr' + i).textContent = '';
      pullers(i);
    });
    $('field').className = 'tg-field';
    paintTeacher(); show('play'); paintRope();
    // عدّ تنازلي
    var n = 3, cnt = $('count'); cnt.textContent = n; cnt.className = 'tg-count show';
    window.Sound.play('question');
    var ct = setInterval(function () {
      n--; if (n > 0) { cnt.textContent = n; window.Sound.play('question'); return; }
      clearInterval(ct); cnt.textContent = 'شدّوا!'; window.Sound.play('clear');
      setTimeout(function () { cnt.className = 'tg-count'; }, 700);
      G.started = true; nextQ(0); nextQ(1);
      if (M.dur) { var t0 = performance.now(); clockT = setInterval(function () { G.left = M.dur - (performance.now() - t0) / 1000; $('hClock').textContent = '⏱ ' + fmtTime(G.left); if (G.left <= 0) finish(G.pos > 0 ? 0 : G.pos < 0 ? 1 : -1, 'time'); }, 250); }
    }, 800);
    later.push(ct);
  }
  function nextQ(i) {
    if (!G || G.over) return;
    var t = G.teams[i], cur = null;
    for (var k = 0; k < 10 && !cur; k++) cur = t.qm.next();
    if (!cur) { $('pq' + i).textContent = 'انتهت أسئلة هذا الفريق.'; $('po' + i).innerHTML = ''; t.cur = null; if (!G.teams[1 - i].cur) finish(G.pos > 0 ? 0 : G.pos < 0 ? 1 : -1, 'empty'); return; }
    t.cur = cur; t.lock = false;
    var it = cur.item, box = $('po' + i);
    $('pq' + i).textContent = it.text; $('pf' + i).textContent = ''; $('pf' + i).className = 'tp-fb';
    $('pr' + i).textContent = it._raw.p ? ('صفحة ' + it._raw.p) : ('المرجع: ' + it.ref);
    box.className = 'tp-opts' + (it.type === 'tf' ? ' tf' : ''); box.innerHTML = '';
    cur.order.forEach(function (orig, pos) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.dataset.choice = orig; b.dataset.pos = pos;
      if (it.type === 'mc') b.innerHTML = '<span class="let">' + LETTERS[pos] + '</span><span dir="auto">' + esc(it.options[orig]) + '</span>';
      else { b.className += orig === 1 ? ' t-yes' : ' t-no'; b.innerHTML = '<span class="let">' + (orig === 1 ? '✓' : '✗') + '</span><span>' + (orig === 1 ? 'صح' : 'خطأ') + '</span>'; }
      b.onclick = function () { pick(i, orig, b); };
      box.appendChild(b);
    });
    $('panel' + i).classList.remove('locked');
  }
  function pick(i, choice, btn) {
    var t = G && G.teams[i];
    if (!t || G.over || !G.started || t.lock || !t.cur) return;
    t.lock = true;
    var it = t.cur.item, right = window.__decodeAnswer(it._raw), ok = right === choice;
    t.qm.answer(choice);
    $('po' + i).querySelectorAll('.opt').forEach(function (b) { b.disabled = true; });
    var fb = $('pf' + i);
    if (ok) {
      btn.classList.add('good'); fb.textContent = 'صحيحة! اسحبوا 💪'; fb.className = 'tp-fb ok';
      t.pulls++; G.pos += i === 0 ? 1 : -1;
      window.Sound.play('correct');
      $('field').classList.remove('tug0', 'tug1'); void $('field').offsetWidth; $('field').classList.add('tug' + i);
      paintRope();
      if (Math.abs(G.pos) >= M.steps) return finish(i, 'line');
      wait(function () { nextQ(i); }, 650);
    } else {
      t.wrong++; fb.textContent = 'ليست صحيحة — انتظروا السؤال التالي'; fb.className = 'tp-fb bad';
      var p = $('panel' + i); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake', 'locked');
      window.Sound.play('wrong');
      wait(function () { nextQ(i); }, D.lockMs);
    }
  }
  function finish(w, why) {
    if (!G || G.over) return;
    if(window.GameSCORM){var correct=G.teams.reduce(function(a,t){return a+t.pulls;},0),wrong=G.teams.reduce(function(a,t){return a+t.wrong;},0);window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}

    G.over = true; clearWait();
    [0, 1].forEach(function (i) { $('po' + i).querySelectorAll('.opt').forEach(function (b) { b.disabled = true; }); });
    var T = G.teams;
    if (w >= 0) { $('field').classList.add('win' + w); }
    window.Sound.play('clear');
    $('winArt').innerHTML = w >= 0 ? '<span class="crown">👑</span><img src="assets/characters/' + M.chars[w] + '-jump.png" alt="">' : '<img src="assets/characters/' + M.chars[0] + '-jump.png" alt=""><img src="assets/characters/' + M.chars[1] + '-jump.png" alt="">';
    $('rTitle').textContent = w < 0 ? 'تعادل! الحبل في المنتصف' : 'الفوز لـ' + T[w].name + '!';
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit + ' • ' + (why === 'line' ? 'سحب العلامة إلى خطّه' : why === 'time' ? 'انتهى وقت المباراة' : 'انتهت الأسئلة');
    var acc = function (t) { var n = t.pulls + t.wrong; return n ? Math.round(100 * t.pulls / n) + '%' : '—'; };
    var rows = [['سحبات (إجابات صحيحة)', T[0].pulls, T[1].pulls], ['إجابات خاطئة', T[0].wrong, T[1].wrong], ['الدقة', acc(T[0]), acc(T[1])]];
    $('rTable').innerHTML = '<div class="vt-row vt-h"><span></span><b style="color:' + T[0].color + '">' + esc(T[0].name) + '</b><b style="color:' + T[1].color + '">' + esc(T[1].name) + '</b></div>' +
      rows.map(function (r) { return '<div class="vt-row"><span>' + r[0] + '</span><b>' + r[1] + '</b><b>' + r[2] + '</b></div>'; }).join('');
    resultsActions(startGame, openHome);
    paintTeacher();
    wait(function () { $('rModal').classList.add('show'); }, 1400);
  }
  function exitGame() { if (!G) return; G.over = true; clearWait(); window.Sound.stopMusic(); openHome(); }
  function bind() {
    bindCommon();
    $('startGame').onclick = startGame;
    $('exitBtn').onclick = exitGame;
    window.addEventListener('keydown', function (e) {
      if (!G || G.over || !$('play').classList.contains('active')) return;
      [0, 1].forEach(function (i) { var k = KEYS[i].indexOf(e.code); if (k >= 0) { var b = $('po' + i).querySelector('.opt[data-pos="' + k + '"]'); if (b) b.click(); } });
    });
    window.addEventListener('resize', function () { if (G) paintRope(); });
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
    if(window.GamePublish?.configure)window.GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'tug',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
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
