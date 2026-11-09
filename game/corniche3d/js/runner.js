/* «عدّاء الكورنيش 3D»: لعبة جري فردية ثلاثية الأبعاد على كورنيش مطرح؛ يجري الطالب نحو بوابة الإجابة الصحيحة حتى يصل إلى القلعة.
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
  function show(id) {
    if (window.PublishedGame && id === 'setup') id = 'home';
    ['setup', 'home', 'play'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); }

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
      $('setupNote').textContent = 'جارٍ تحميل بيانات الصف…';
      loadGrade(S.index[i].id).then(function (data) {
        if (S.grade !== i) return;
        S.gradeData = data;
        renderSetup();
      }).catch(function (error) {
        if (S.grade === i) $('setupNote').textContent = error.message;
      });
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
    var hasLessons = gd && S.unit != null && S.lessons.length > 0;
    var n = hasLessons ? selection().lessons.reduce(function (a, L) { return a + L.qs.length; }, 0) : 0;
    var ready = n > 0;
    $('buildBtn').disabled = !ready;
    $('linkBtn').disabled = !ready || !window.GamePublish?.configure;
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

  /* ---------- عدّاء الكورنيش 3D ---------- */
  var QNAMES = { high: 'عالية', medium: 'متوسطة', low: 'خفيفة' };
  var SPEEDS = { slow: 7.5, normal: 9, fast: 10.5 }, SNAMES = { slow: 'هادئة', normal: 'عادية', fast: 'سريعة' };
  var GCOLS = ['#e8673a', '#1e9bb5', '#7a52c9', '#2fae5c'], LET = ['أ', 'ب', 'ج', 'د'];
  function autoQuality() { var small = Math.min(screen.width, screen.height) < 700, touch = window.matchMedia && matchMedia('(pointer:coarse)').matches; return small || touch ? 'low' : 'medium'; }
  var M = store.get('runner-settings', null) || { char: 'girl', name: '', goal: D.defaultGoal, time: D.defaultTime, speed: D.defaultSpeed, hearts: D.defaultHearts, quality: autoQuality() };
  if (D.goals.indexOf(M.goal) < 0) M.goal = D.defaultGoal;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  if (D.speeds.indexOf(M.speed) < 0) M.speed = D.defaultSpeed;
  if (D.hearts.indexOf(M.hearts) < 0) M.hearts = D.defaultHearts;
  if (D.qualities.indexOf(M.quality) < 0) M.quality = autoQuality();
  if (['boy', 'girl', 'girl2'].indexOf(M.char) < 0) M.char = 'girl';
  function saveM() { store.set('runner-settings', M); }
  var GL = !!(window.RunEngine && window.RunEngine.supported());
  function bestKey() { return 'runner-best:' + (SEL ? SEL.subject + '|' + SEL.unit + '|' + SEL.lessons.map(function (L) { return L.n; }).join(',') : ''); }

  /* أصوات الكورنيش: حركة السير، مرور السيارات، البوق، جرس الدراجة، موج البحر، العملات */
  var AX = null, AXG = null, AMB = null;
  function ax() {
    if (window.Sound && window.Sound.isMuted && window.Sound.isMuted()) return null;
    try { if (!AX) { AX = new (window.AudioContext || window.webkitAudioContext)(); AXG = AX.createGain(); AXG.gain.value = .55; AXG.connect(AX.destination); } if (AX.state === 'suspended') AX.resume(); } catch (e) { return null; }
    return AX;
  }
  function noiseBuf(dur) { var n = AX.sampleRate * dur, b = AX.createBuffer(1, n, AX.sampleRate), d = b.getChannelData(0), last = 0; for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } return b; }
  function noise(dur, brown) { var s = AX.createBufferSource(); if (brown) s.buffer = noiseBuf(dur); else { var n = AX.sampleRate * dur, b = AX.createBuffer(1, n, AX.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; s.buffer = b; } return s; }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function tone(t, f, type, peak, dur, f2) { var o = AX.createOscillator(), g = AX.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); o.connect(g); g.connect(AXG); env(g, t, .005, peak, dur); o.start(t); o.stop(t + dur + .05); }
  var FX = {
    coin: function (t) { tone(t, 1320, 'square', .06, .08); tone(t + .07, 1980, 'square', .06, .14); },
    jump: function (t) { tone(t, 300, 'triangle', .25, .22, 720); },
    swoosh: function (t) { var s = noise(.18), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(2600, t + .16); s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .02, .12, .17); s.start(t); },
    bump: function (t) { tone(t, 140, 'sine', .6, .2, 55); var s = noise(.15), g = AX.createGain(); s.connect(g); g.connect(AXG); env(g, t, .005, .2, .12); s.start(t); },
    boost: function (t) { tone(t, 330, 'sawtooth', .08, .45, 990); tone(t, 495, 'triangle', .1, .45, 1480); },
    pass: function (t, a) { var s = noise(1.4, true), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(a && a.bus ? 500 : 900, t); f.frequency.exponentialRampToValueAtTime(a && a.bus ? 160 : 260, t + 1.2); s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .35, a && a.bus ? .9 : .6, 1.35); s.start(t); },
    horn: function (t) { [[392, 0], [494, 0]].forEach(function (p) { tone(t + .05, p[0], 'square', .05, .32); }); tone(t + .45, 392, 'square', .05, .22); tone(t + .45, 494, 'square', .05, .22); },
    bell: function (t) { [0, .16].forEach(function (d) { tone(t + d, 2350, 'sine', .12, .5); tone(t + d, 3520, 'sine', .05, .35); }); },
    cheer: function (t) { var s = noise(3), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = .5; s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .3, .35, 2.9); s.start(t); }
  };
  function sfx(n, a) { var c = ax(); if (!c || !FX[n]) return; try { FX[n](c.currentTime + .01, a); } catch (e) {} }
  // أصوات مستمرة: هدير حركة السير وموج البحر
  function ambient(on) {
    if (!on) { if (AMB) { try { AMB.src.forEach(function (s) { s.stop(); }); } catch (e) {} AMB = null; } return; }
    var c = ax(); if (!c || AMB) return;
    var tr = noise(4, true), tf = AX.createBiquadFilter(), tg = AX.createGain(); tr.loop = true; tf.type = 'lowpass'; tf.frequency.value = 260; tg.gain.value = 0; tr.connect(tf); tf.connect(tg); tg.connect(AXG); tr.start();
    var se = noise(6, true), sf = AX.createBiquadFilter(), sg = AX.createGain(), lfo = AX.createOscillator(), lg = AX.createGain(); se.loop = true; sf.type = 'lowpass'; sf.frequency.value = 700; sg.gain.value = .07; lfo.frequency.value = .12; lg.gain.value = .05; lfo.connect(lg); lg.connect(sg.gain); se.connect(sf); sf.connect(sg); sg.connect(AXG); se.start(); lfo.start();
    AMB = { src: [tr, se, lfo], tg: tg };
  }
  function trafficLevel(v) { if (AMB) AMB.tg.gain.setTargetAtTime(.05 + v * .55, AX.currentTime, .15); }

  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    charPicker($('charPick'), M.char, function (k) { M.char = k; saveM(); openHome(); });
    var nm = $('stName'); nm.value = M.name || ''; nm.oninput = function () { M.name = nm.value.trim(); saveM(); };
    chips($('optGoal'), D.goals.map(function (n) { return n + ' إجابات'; }), D.goals.indexOf(M.goal), function (i) { M.goal = D.goals[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t + ' ثانية'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    chips($('optSpeed'), D.speeds.map(function (s) { return SNAMES[s]; }), D.speeds.indexOf(M.speed), function (i) { M.speed = D.speeds[i]; saveM(); openHome(); });
    chips($('optHearts'), D.hearts.map(function (h) { return h ? h + ' ❤️' : 'بلا حدود'; }), D.hearts.indexOf(M.hearts), function (i) { M.hearts = D.hearts[i]; saveM(); openHome(); });
    chips($('optQuality'), D.qualities.map(function (q) { return QNAMES[q]; }), D.qualities.indexOf(M.quality), function (i) { M.quality = D.qualities[i]; saveM(); openHome(); });
    window.GameRosters?.picker(S.index[S.grade].id, SEL.subject, ['stName']);
    $('glNote').textContent = GL ? '' : '⚠️ هذا المتصفح لا يدعم الرسوم ثلاثية الأبعاد (WebGL). جرّب متصفح Chrome أو Edge حديثًا.';
    $('startGame').disabled = !GL;
    var b = store.get(bestKey(), null);
    $('best').textContent = b ? 'أفضل نتيجة لهذه الدروس: ' + b.stars + ' ⭐ و' + b.coins + ' عملة' : '';
    show('home');
  }

  var G = null, later = [], ENG = null, ENGQ = null, tick = null;
  function wait(fn, ms) { later.push(setTimeout(fn, ms)); }
  function clearWait() { later.forEach(clearTimeout); later = []; clearInterval(tick); }
  function releaseEngine() {
    if (ENG) {
      ENG.stop();
      ENG.renderer.dispose();
    }
    $('crStage').replaceChildren();
    ENG = ENGQ = window.__runEngine = null;
  }
  function engine() {
    if (ENG && ENGQ === M.quality) return ENG;
    releaseEngine();
    ENG = window.RunEngine.create($('crStage'), { quality: M.quality, preserve: /[?&]shot=1/.test(location.search) }); ENGQ = M.quality; window.__runEngine = ENG;
    var E = ENG.debug;
    E.onSfx = sfx; E.onTraffic = trafficLevel;
    E.onCoin = function (n) { if (!G) return; G.coins += n; $('hCoins').textContent = G.coins; };
    E.onHit = function () { if (!G) return; G.hits++; pop('اصطدام! اقفز أو تجنّب العائق', 'bad'); };
    E.onGate = function (idx, g) { if (G && G.gate === g) passGate(idx, g); };
    E.onFinish = function () { if (G) finishRun('fort'); };
    return ENG;
  }
  function banner(t, cls, ms) { var b = $('banner'); b.innerHTML = t; b.className = 'cr-banner show ' + (cls || ''); clearTimeout(b._t); if (ms) b._t = setTimeout(function () { b.className = 'cr-banner'; }, ms); }
  function pop(t, cls) { var p = $('pop'); p.innerHTML = t; p.className = 'cr-pop ' + (cls || ''); void p.offsetWidth; p.classList.add('show'); }

  function startGame() {
    if (!GL) return;
    window.Sound.unlock(); ax();
    closeQuestion(); clearWait();
    var bank = bankOf();
    G = window.__cr = { qm: new window.QuestionManager(bank, 0), goal: Math.min(M.goal, bank.qs.length), hearts: M.hearts, correct: 0, wrong: 0, coins: 0, hits: 0, asked: 0, over: false, state: 'load', cur: null, gate: null, nextAt: null, t0: 0 };
    $('rModal').classList.remove('show');
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    $('pMe').querySelector('img').src = 'assets/characters/' + M.char + '-walk.png';
    $('qc').classList.remove('show'); paintHud(); paintTeacher(); show('play');
    $('banner').className = 'cr-banner'; $('crLoad').classList.add('show');
    var my = G;
    var fontReady = document.fonts && document.fonts.load ? document.fonts.load('80px Taj').catch(function () {}) : Promise.resolve();
    Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
      if (G !== my) return;
      var E = engine();
      E.setKid(M.char); E.reset({ speed: SPEEDS[M.speed] }); E.start();
      $('crLoad').classList.remove('show'); ambient(true);
      G.state = 'intro'; E.intro(3.4);
      var n = 3;
      banner('<small>' + esc(SEL.subject) + '</small>عدّاء الكورنيش', 'small', 1100);
      wait(function cd() {
        if (G !== my) return;
        if (n > 0) { banner(String(n), 'count', 700); window.Sound.play('coin'); n--; wait(cd, 750); return; }
        banner('انطلق! 🏃', 'go', 900); window.Sound.play('checkpoint');
        ENG.go(); G.state = 'run'; G.t0 = Date.now();
        G.nextAt = ENG.debug.dist + SPEEDS[M.speed] * 2.2;
        ENG.freeRun(ENG.debug.dist + 12, G.nextAt + 4);
        tick = setInterval(loopTick, 100);
      }, 1200);
    }).catch(function (error) {
      if (G !== my) return;
      console.error('Corniche renderer startup:', error);
      releaseEngine();
      exitGame();
      $('glNote').textContent = 'تعذر تشغيل الكورنيش. اختر جودة رسوم خفيفة وأعد المحاولة.';
    });
  }
  function loopTick() {
    if (!G || G.over) return;
    var E = ENG.debug;
    if (G.state === 'run' && !G.gate && G.nextAt !== null && E.dist >= G.nextAt) { G.nextAt = null; nextQuestion(); }
    if (G.gate) { var d = ENG.gateDist(); if (d !== null) $('qcBar').style.width = Math.max(0, Math.min(100, d / G.gate.D * 100)) + '%'; }
    $('speedLines').classList.toggle('on', E.boost > .4);
  }
  function paintHud() {
    var h = '';
    if (G.hearts === 0 && M.hearts === 0) h = '❤️ ∞';
    else for (var i = 0; i < M.hearts; i++) h += i < G.hearts ? '❤️' : '🤍';
    $('hHearts').innerHTML = h;
    $('hCoins').textContent = G.coins; $('hQ').textContent = G.asked;
    var p = G.goal ? Math.min(1, G.correct / G.goal) : 0;
    $('pFill').style.width = (p * 100) + '%'; $('pMe').style.right = (p * 100) + '%';
  }
  function nextQuestion() {
    if (!G || G.over) return;
    var cur = null; for (var t = 0; t < 10 && !cur; t++) cur = G.qm.next();
    if (!cur) return toFort('empty');
    G.cur = cur; G.asked++;
    var it = cur.item, texts = it.type === 'mc' ? cur.order.map(function (o) { return it.options[o]; }) : ['صح ✓', 'خطأ ✗'];
    var D = SPEEDS[M.speed] * M.time;
    G.gate = ENG.ask(texts, D);
    $('qcText').textContent = it.text;
    $('qcTag').textContent = (it.type === 'mc' ? 'اختيار من متعدد' : 'صح أو خطأ') + ' • ادخل بوابة الإجابة الصحيحة';
    $('qcOps').innerHTML = texts.map(function (x, i) { return '<span><i style="background:' + GCOLS[i] + '">' + (it.type === 'mc' ? LET[i] : (i ? '✗' : '✓')) + '</i>' + esc(String(x).replace(/\s*[✓✗]$/, '')) + '</span>'; }).join('');
    $('qcBar').style.width = '100%';
    $('qc').classList.add('show'); paintHud();
    window.Sound.play('question');
  }
  function passGate(idx, g) {
    var cur = G.cur, it = cur.item;
    var ok = G.qm.answer(cur.order[idx]);
    G.gate = null; G.cur = null; $('qc').classList.remove('show');
    ENG.gateResult(g, ok);
    if (ok) {
      G.correct++; G.coins += 5; window.Sound.play('correct');
      pop('إجابة صحيحة! ⚡<small>+5 عملات ودفعة سرعة</small>');
    } else {
      G.wrong++; if (M.hearts) G.hearts--; window.Sound.play('wrong');
      pop('ليست الإجابة الصحيحة<small>سيعود السؤال لاحقًا 💪</small>', 'bad');
    }
    paintHud();
    if (M.hearts && G.hearts <= 0) { window.Sound.play('gameover'); G.over = true; G.state = 'out'; ENG.debug.state = 'finish'; banner('نفدت القلوب 💔', 'small', 0); return wait(function () { results('hearts'); }, 2200); }
    if (G.correct >= G.goal) return toFort('goal');
    var E = ENG.debug, sp = SPEEDS[M.speed];
    G.nextAt = E.dist + 14 + sp * 3.2;
    ENG.freeRun(E.dist + 14, G.nextAt + 6);
  }
  function toFort(why) {
    G.state = 'fort'; G.why = why;
    banner(why === 'empty' ? 'انتهت أسئلة الدروس المختارة — إلى القلعة!' : 'أحسنت! القلعة أمامك 🏰', 'small', 2000);
    ENG.finishAt(SPEEDS[M.speed] * 5 + 20);
  }
  function finishRun() {
    if (!G || G.over) return; G.over = true; G.state = 'finish';
    window.Sound.play('clear'); banner('وصلت إلى قلعة مطرح! 🏰', 'go', 0);
    wait(function () { results(G.why || 'fort'); }, 3600);
  }
  function results(why) {
    if (!G) return;
    clearInterval(tick);
    ambient(false);
    var answered = G.correct + G.wrong;
    window.GameSCORM?.report({ score: answered ? 100 * G.correct / answered : 0, completed: true });
    $('banner').className = 'cr-banner'; $('qc').classList.remove('show');
    var secs = Math.round((Date.now() - G.t0) / 1000), stars = why === 'hearts' ? 0 : G.wrong === 0 ? 3 : G.wrong <= 2 ? 2 : 1;
    var b = store.get(bestKey(), null);
    if (why !== 'hearts' && (!b || stars > b.stars || (stars === b.stars && G.coins > b.coins))) { b = { stars: stars, coins: G.coins }; store.set(bestKey(), b); }
    var who = M.name ? M.name + ': ' : '';
    $('winArt').innerHTML = (why !== 'hearts' ? '<span class="crown">🏆</span>' : '') + '<img src="assets/characters/' + M.char + '-jump.png" alt="">';
    $('rTitle').textContent = why === 'hearts' ? who + 'نفدت القلوب — حاول مرة أخرى!' : who + 'وصلت إلى القلعة! ' + '⭐'.repeat(stars);
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit;
    var mm = Math.floor(secs / 60), ss = secs % 60;
    var rows = [['الإجابات الصحيحة', G.correct + ' / ' + G.goal], ['الإجابات الخاطئة', G.wrong], ['العملات', G.coins + ' 🪙'], ['القلوب المتبقية', M.hearts ? G.hearts + ' / ' + M.hearts : 'بلا حدود'], ['الاصطدامات', G.hits], ['الوقت', mm + ':' + (ss < 10 ? '0' : '') + ss], ['أفضل نتيجة', b ? b.stars + ' ⭐ • ' + b.coins + ' عملة' : '—']];
    $('rTable').innerHTML = rows.map(function (r) { return '<div class="vt-row pl-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
      '<p class="cs-fact">🌅 كورنيش مطرح واجهة بحرية في محافظة مسقط تطل على الميناء، وعلى امتداده سوق مطرح وقلعة مطرح والبيوت القديمة ذات الشرفات الخشبية.</p>';
    resultsActions(startGame, exitGame);
    paintTeacher();
    wait(function () { $('rModal').classList.add('show'); }, 300);
  }
  function exitGame() {
    if (G) G.over = true;
    closeQuestion();
    clearWait();
    ambient(false);
    if (ENG) ENG.stop();
    $('crLoad').classList.remove('show');
    $('qc').classList.remove('show');
    window.Sound.stopMusic();
    G = window.__cr = null;
    openHome();
  }
  // التحكم بلوحة المفاتيح واللمس والأزرار
  function bindControls() {
    window.addEventListener('keydown', function (e) {
      if (!G || G.over || !ENG || !$('play').classList.contains('active')) return;
      var c = e.code;
      if (c === 'ArrowRight' || c === 'KeyD') { ENG.move(1); e.preventDefault(); }
      else if (c === 'ArrowLeft' || c === 'KeyA') { ENG.move(-1); e.preventDefault(); }
      else if (c === 'ArrowUp' || c === 'KeyW' || c === 'Space') { ENG.jump(); e.preventDefault(); }
    });
    var sx = 0, sy = 0, st = 0;
    $('crStage').addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; st = Date.now(); });
    $('crStage').addEventListener('pointerup', function (e) {
      if (!G || G.over || !ENG) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) ENG.move(dx > 0 ? 1 : -1); else if (dy < 0) ENG.jump();
    });
    [['bR', function () { ENG.move(1); }], ['bL', function () { ENG.move(-1); }], ['bJ', function () { ENG.jump(); }]].forEach(function (a) {
      $(a[0]).addEventListener('pointerdown', function (e) { e.preventDefault(); if (G && !G.over && ENG) a[1](); });
    });
  }
  function bind() {
    bindCommon();
    $('startGame').onclick = startGame;
    $('exitBtn').onclick = exitGame;
    bindControls();
  }

  async function boot() {
    if (!window.GameLibraryAccess) throw Error('تعذر تحميل ملف تشغيل اللعبة. أعد تحميل الصفحة.');
    if (!(await window.GameLibraryAccess)) return;
    bind();
    S.teacher = store.get('edu-teacher', null) || { name: cfg.teacherName || '', ig: cfg.teacherInstagram || '' };
    $('tName').value = S.teacher.name;
    $('tIg').value = S.teacher.ig;
    $('tName').oninput = $('tIg').oninput = readTeacher;
    $('buildBtn').onclick = function () {
      readTeacher();
      try { history.replaceState(null, '', hashFor()); } catch (error) {}
      openHome();
    };
    window.GamePublish?.configure(function () {
      readTeacher();
      var selected = selection();
      return {
        version: 1,
        id: crypto.randomUUID(),
        game: 'corniche3d',
        title: cfg.title,
        gradeId: S.index[S.grade].id,
        gradeName: 'الصف ' + selected.gradeName,
        subject: selected.subject,
        sem: selected.sem,
        unit: selected.unit,
        lessons: JSON.parse(JSON.stringify(selected.lessons)),
        teacher: { name: S.teacher.name, ig: S.teacher.ig }
      };
    });
    $('selAll').onclick = function () {
      var data = gradeCache[S.index[S.grade].id];
      S.lessons = data[S.subj].s[S.sem].u[S.unit].l.map(function (_, index) { return index; });
      renderSetup();
    };
    $('selNone').onclick = function () { S.lessons = []; renderSetup(); };

    S.index = await loadScriptData('index');
    var hash = new URLSearchParams(window.PUBLISHED_SELECTION || location.hash.slice(1));
    var grade = S.index.findIndex(function (entry) { return entry.id === hash.get('g'); });
    if (grade >= 0) {
      S.grade = grade;
      var data = await loadGrade(S.index[grade].id);
      S.gradeData = data;
      var subject = Number(hash.get('s'));
      var semester = Number(hash.get('m'));
      var unit = Number(hash.get('u'));
      var lessons = data[subject]?.s[semester]?.u[unit]?.l;
      var picked = Array.from(new Set((hash.get('l') || '').split('.').filter(Boolean).map(Number)));
      if (lessons && picked.length && picked.every(function (index) { return lessons[index]?.qs.length; })) {
        S.subj = subject;
        S.sem = semester;
        S.unit = unit;
        S.lessons = picked;
        if (hash.has('t') || hash.has('ig')) {
          S.teacher = { name: hash.get('t') || '', ig: hash.get('ig') || '' };
          $('tName').value = S.teacher.name;
          $('tIg').value = S.teacher.ig;
        }
        openHome();
        return;
      }
    }
    renderSetup();
  }
  function startBoot() {
    boot().catch(function (error) {
      console.error('Corniche game startup:', error);
      if (window.gameLibraryShowError) window.gameLibraryShowError(error);
      else $('grades').textContent = error.message || 'تعذر بدء اللعبة. أعد تحميل الصفحة.';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBoot);
  else startBoot();
})();
