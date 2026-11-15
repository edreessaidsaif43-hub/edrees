/* «طيّار المعرفة 3D»: رحلة طيران فردية ثلاثية الأبعاد على ساحل مسقط؛ يطير الطالب عبر حلقة الإجابة الصحيحة حتى يهبط في مطار مسقط.
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

  /* ---------- طيّار المعرفة 3D ---------- */
  var QNAMES = { high: 'عالية', medium: 'متوسطة', low: 'خفيفة' };
  var SPEEDS = { slow: 30, normal: 38, fast: 46 }, SNAMES = { slow: 'هادئة', normal: 'عادية', fast: 'سريعة' };
  var PLANES = [['prop', '🛩️', 'مروحية صغيرة'], ['jet', '✈️', 'نفاثة'], ['heli', '🚁', 'هليكوبتر']];
  var RC = ['#ff8a3c', '#2bb6d9', '#a07bff', '#3fd17a'], LET = ['أ', 'ب', 'ج', 'د'];
  function autoQuality() { var small = Math.min(screen.width, screen.height) < 700, touch = window.matchMedia && matchMedia('(pointer:coarse)').matches; return small || touch ? 'low' : 'medium'; }
  var M = store.get('flight-settings', null) || { char: 'boy', plane: 'prop', name: '', goal: D.defaultGoal, time: D.defaultTime, speed: D.defaultSpeed, quality: autoQuality() };
  if (D.goals.indexOf(M.goal) < 0) M.goal = D.defaultGoal;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  if (D.speeds.indexOf(M.speed) < 0) M.speed = D.defaultSpeed;
  if (D.qualities.indexOf(M.quality) < 0) M.quality = autoQuality();
  if (['boy', 'girl', 'girl2'].indexOf(M.char) < 0) M.char = 'boy';
  if (['prop', 'jet', 'heli'].indexOf(M.plane) < 0) M.plane = 'prop';
  function saveM() { store.set('flight-settings', M); }
  var GL = !!(window.FlyEngine && window.FlyEngine.supported());
  function bestKey() { return 'flight-best:' + (SEL ? SEL.subject + '|' + SEL.unit + '|' + SEL.lessons.map(function (L) { return L.n; }).join(',') : ''); }

  /* ---------- الصوت: محرك الطائرة، الريح، موسيقى هادئة، مؤثرات ---------- */
  var AX = null, AXG = null, AMB = null, MUS = null;
  function ax() {
    if (window.Sound && window.Sound.isMuted && window.Sound.isMuted()) return null;
    try { if (!AX) { AX = new (window.AudioContext || window.webkitAudioContext)(); AXG = AX.createGain(); AXG.gain.value = .55; AXG.connect(AX.destination); } if (AX.state === 'suspended') AX.resume(); } catch (e) { return null; }
    return AX;
  }
  function noiseBuf(dur, brown) { var n = AX.sampleRate * dur, b = AX.createBuffer(1, n, AX.sampleRate), d = b.getChannelData(0), last = 0; for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } return b; }
  function noise(dur, brown) { var s = AX.createBufferSource(); s.buffer = noiseBuf(dur, brown); return s; }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function tone(t, f, type, peak, dur, f2, dest) { var o = AX.createOscillator(), g = AX.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); o.connect(g); g.connect(dest || AXG); env(g, t, .01, peak, dur); o.start(t); o.stop(t + dur + .05); }
  var FX = {
    star: function (t) { tone(t, 1568, 'triangle', .08, .12); tone(t + .06, 2093, 'triangle', .07, .2); },
    ring: function (t) { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(t + i * .06, f, 'triangle', .1, .35); }); },
    bump: function (t) { tone(t, 220, 'sawtooth', .12, .5, 90); var s = noise(.4), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'lowpass'; f.frequency.value = 500; s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .02, .4, .4); s.start(t); },
    hit: function (t) { tone(t, 160, 'square', .08, .25, 70); },
    cloud: function (t) { var s = noise(1.2), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1800, t + 1); s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .3, .18, 1.15); s.start(t); },
    land: function (t) { var s = noise(.5), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'highpass'; f.frequency.value = 1800; s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .01, .25, .45); s.start(t); },
    splash: function (t) { var s = noise(1.6), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(300, t + 1.4); s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .02, .7, 1.5); s.start(t); },
    cheer: function (t) { var s = noise(3), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = .5; s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .3, .3, 2.9); s.start(t); [523, 659, 784, 1047].forEach(function (fr, i) { tone(t + .2 + i * .12, fr, 'triangle', .1, .5); }); }
  };
  function sfx(n, a) { var c = ax(); if (!c || !FX[n]) return; try { FX[n](c.currentTime + .01, a); } catch (e) {} }
  // صوت المحرك والريح
  function ambient(on) {
    if (!on) { if (AMB) { try { AMB.src.forEach(function (s) { s.stop(); }); } catch (e) {} AMB = null; } return; }
    var c = ax(); if (!c || AMB) return;
    var eg = AX.createGain(); eg.gain.value = 0; eg.connect(AXG); var src = [];
    if (M.plane === 'prop') { var o = AX.createOscillator(), f = AX.createBiquadFilter(), lfo = AX.createOscillator(), lg = AX.createGain(), tg = AX.createGain(); o.type = 'sawtooth'; o.frequency.value = 92; f.type = 'lowpass'; f.frequency.value = 600; lfo.frequency.value = 28; lg.gain.value = .5; tg.gain.value = .5; lfo.connect(lg); lg.connect(tg.gain); o.connect(f); f.connect(tg); tg.connect(eg); o.start(); lfo.start(); src.push(o, lfo); AMB = { osc: o, base: 92 }; }
    else if (M.plane === 'jet') { var n = noise(4, true), f2 = AX.createBiquadFilter(), o2 = AX.createOscillator(), g2 = AX.createGain(); n.loop = true; f2.type = 'lowpass'; f2.frequency.value = 1100; n.connect(f2); f2.connect(eg); o2.type = 'sine'; o2.frequency.value = 160; g2.gain.value = .15; o2.connect(g2); g2.connect(eg); n.start(); o2.start(); src.push(n, o2); AMB = { osc: o2, base: 160 }; }
    else { var n3 = noise(4, true), f3 = AX.createBiquadFilter(), l3 = AX.createOscillator(), lg3 = AX.createGain(), tg3 = AX.createGain(); n3.loop = true; f3.type = 'lowpass'; f3.frequency.value = 420; l3.type = 'square'; l3.frequency.value = 9; lg3.gain.value = .6; tg3.gain.value = .5; l3.connect(lg3); lg3.connect(tg3.gain); n3.connect(f3); f3.connect(tg3); tg3.connect(eg); n3.start(); l3.start(); src.push(n3, l3); AMB = { osc: l3, base: 9 }; }
    var w = noise(4), wf = AX.createBiquadFilter(), wg = AX.createGain(); w.loop = true; wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = .4; wg.gain.value = 0; w.connect(wf); wf.connect(wg); wg.connect(AXG); w.start(); src.push(w);
    AMB.src = src; AMB.eg = eg; AMB.wg = wg;
  }
  function engineLevel(sp, boost) { if (!AMB) return; var t = AX.currentTime; AMB.eg.gain.setTargetAtTime(sp > 1 ? .22 + boost * .1 : .05, t, .2); AMB.wg.gain.setTargetAtTime(Math.min(.12, sp / 400 + boost * .05), t, .2); AMB.osc.frequency.setTargetAtTime(AMB.base * (1 + boost * .35), t, .3); }
  // موسيقى هادئة: أرپيجيو خماسي وطبقة ناعمة
  function music(on) {
    if (!on) { if (MUS) { clearInterval(MUS.iv); MUS = null; } return; }
    var c = ax(); if (!c || MUS) return;
    var mg = AX.createGain(); mg.gain.value = .07; mg.connect(AXG);
    var chords = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]], pent = [523, 587, 659, 784, 880, 1047], step = 0;
    MUS = { iv: setInterval(function () {
      if (!AX || (window.Sound.isMuted && window.Sound.isMuted())) return;
      var t = AX.currentTime + .05, ch = chords[(step >> 3) % 4];
      if (step % 8 === 0) ch.forEach(function (f) { tone(t, f, 'sine', .25, 2.6, 0, mg); });
      if (step % 2 === 0 || Math.random() < .3) tone(t, pent[(step * 3 + (step >> 2)) % pent.length], 'triangle', .22, .5, 0, mg);
      step++;
    }, 340), g: mg };
  }

  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    charPicker($('charPick'), M.char, function (k) { M.char = k; saveM(); openHome(); });
    var pp = $('planePick'); pp.innerHTML = PLANES.map(function (p) { return '<button class="fl-plane' + (M.plane === p[0] ? ' on' : '') + '" data-k="' + p[0] + '"><i>' + p[1] + '</i><span>' + p[2] + '</span></button>'; }).join('');
    pp.querySelectorAll('.fl-plane').forEach(function (b) { b.onclick = function () { M.plane = b.dataset.k; saveM(); openHome(); }; });
    var nm = $('stName'); nm.value = M.name || ''; nm.oninput = function () { M.name = nm.value.trim(); saveM(); };
    chips($('optGoal'), D.goals.map(function (n) { return n + ' إجابات'; }), D.goals.indexOf(M.goal), function (i) { M.goal = D.goals[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t + ' ثانية'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    chips($('optSpeed'), D.speeds.map(function (s) { return SNAMES[s]; }), D.speeds.indexOf(M.speed), function (i) { M.speed = D.speeds[i]; saveM(); openHome(); });
    chips($('optQuality'), D.qualities.map(function (q) { return QNAMES[q]; }), D.qualities.indexOf(M.quality), function (i) { M.quality = D.qualities[i]; saveM(); openHome(); });
    window.GameRosters?.picker(S.index[S.grade].id, SEL.subject, ['stName']);
    $('glNote').textContent = GL ? '' : '⚠️ هذا المتصفح لا يدعم الرسوم ثلاثية الأبعاد (WebGL). جرّب متصفح Chrome أو Edge حديثًا.';
    $('startGame').disabled = !GL;
    var b = store.get(bestKey(), null);
    $('best').textContent = b ? 'أفضل نتيجة لهذه الدروس: ' + b.rate + ' ⭐ و' + b.stars + ' نجمة' : '';
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
    $('flStage').replaceChildren();
    ENG = ENGQ = window.__flyEngine = null;
  }
  function engine() {
    if (ENG && ENGQ === M.quality) return ENG;
    releaseEngine();
    ENG = window.FlyEngine.create($('flStage'), { quality: M.quality, preserve: /[?&]shot=1/.test(location.search) }); ENGQ = M.quality; window.__flyEngine = ENG;
    var E = ENG.debug;
    E.onSfx = function (n) { if (n === 'land') { sfx('land'); sfx('cheer'); } else sfx(n); };
    E.onStar = function () { if (!G) return; G.stars++; $('hStars').textContent = G.stars; };
    E.onHit = function (k) { if (!G || G.over) return; G.hits++; fuel(-8); pop((k === 'gulls' ? 'سرب نوارس!' : 'منطاد!') + '<small>انتبه — نقص الوقود قليلًا</small>', 'bad'); };
    E.onGate = function (idx, g) { if (G && G.gate === g) passGate(idx, g); };
    E.onCloud = function (v) { $('cloudFx').style.opacity = Math.min(.92, v * 1.1).toFixed(2); };
    return ENG;
  }
  function banner(t, cls, ms) { var b = $('banner'); b.innerHTML = t; b.className = 'fl-banner show ' + (cls || ''); clearTimeout(b._t); if (ms) b._t = setTimeout(function () { b.className = 'fl-banner'; }, ms); }
  function pop(t, cls) { var p = $('pop'); p.innerHTML = t; p.className = 'fl-pop ' + (cls || ''); void p.offsetWidth; p.classList.add('show'); }
  function fuel(d) { if (!G) return; G.fuel = Math.max(0, Math.min(100, G.fuel + d)); paintFuel(); if (G.fuel <= 0 && !G.over && G.state !== 'land') outOfFuel(); }
  function paintFuel() { var f = Math.round(G.fuel); $('fuelBar').style.height = f + '%'; $('fuelPct').textContent = f + '%'; $('fuelBox').classList.toggle('low', f <= 30); }

  function startGame() {
    if (!GL) return;
    window.Sound.unlock(); ax();
    closeQuestion(); clearWait();
    var bank = bankOf(), base = SPEEDS[M.speed], goal = Math.min(M.goal, bank.qs.length), Dd = base * M.time, F0 = base * 3.2, Fm = base * 1.8;
    var L = Math.ceil((400 + goal * (Dd + F0) + 6 * (Dd + Fm) + 1650) / 100) * 100;
    G = window.__fl = { qm: new window.QuestionManager(bank, 0), goal: goal, fuel: 100, correct: 0, wrong: 0, stars: 0, hits: 0, asked: 0, over: false, state: 'load', cur: null, gate: null, nextAt: null, t0: 0, L: L, D: Dd, F0: F0, Fm: Fm, base: base };
    $('rModal').classList.remove('show');
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    $('qc').classList.remove('show'); $('hStars').textContent = '0'; paintHud(); paintFuel(); paintTeacher(); show('play');
    $('banner').className = 'fl-banner'; $('flLoad').classList.add('show'); $('cloudFx').style.opacity = 0;
    var my = G;
    var fontReady = document.fonts && document.fonts.load ? document.fonts.load('80px Taj').catch(function () {}) : Promise.resolve();
    Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
      if (G !== my) return;
      return new Promise(function (resolve) { setTimeout(resolve, 30); }).then(function () {
        if (G !== my) return;
        var E = engine();
        E.setup({ L: L, base: base, kind: M.plane, kid: M.char }); E.start();
        $('flLoad').classList.remove('show'); ambient(true); music(true);
        G.state = 'intro'; E.intro(3.6);
        var n = 3;
        banner('<small>' + esc(SEL.subject) + '</small>طيّار المعرفة', 'small', 1200);
        wait(function cd() {
          if (G !== my) return;
          if (n > 0) { banner(String(n), 'count', 700); window.Sound.play('coin'); n--; wait(cd, 750); return; }
          banner('انطلق! ✈️', 'go', 900); window.Sound.play('checkpoint');
          ENG.go(); G.state = 'fly'; G.t0 = Date.now();
          G.nextAt = ENG.dist() + base * 2.5; ENG.freeRun(20, base * 2.5 + 40);
          tick = setInterval(loopTick, 100);
        }, 1300);
      });
    }).catch(function (error) {
      if (G !== my) return;
      console.error('Flight renderer startup:', error);
      releaseEngine();
      exitGame();
      $('glNote').textContent = 'تعذر تشغيل الطيران. اختر جودة رسوم خفيفة وأعد المحاولة.';
    });
  }
  function loopTick() {
    if (!G || G.over) return;
    var E = ENG.debug, d = ENG.dist();
    engineLevel(E.speed, E.boost);
    if (G.state === 'fly' && !G.gate && G.nextAt !== null && d >= G.nextAt) { G.nextAt = null; nextQuestion(); }
    if (G.state === 'cruise' && d >= G.L - 1500) { G.state = 'land'; $('qc').classList.remove('show'); banner('الهبوط في مطار مسقط 🛬', 'small', 2500); ENG.land(function () { finishRun(); }); }
    if (G.gate) { var gd = ENG.gateDist(); if (gd !== null) $('qcBar').style.width = Math.max(0, Math.min(100, gd / G.gate.D * 100)) + '%'; }
    $('speedLines').classList.toggle('on', E.boost > .4);
    $('hAlt').textContent = Math.round(E.pos.y) + ' م'; $('hSpd').textContent = Math.round(E.speed * 3.6 * 1.4);
    var p = Math.max(0, Math.min(1, d / (G.L - 150))); $('rFill').style.width = (p * 100) + '%'; $('rMe').style.right = (p * 92 + 4) + '%';
  }
  function paintHud() { $('hQ').textContent = G.asked; }
  function nextQuestion() {
    if (!G || G.over) return;
    var cur = null; for (var t = 0; t < 10 && !cur; t++) cur = G.qm.next();
    if (!cur) return toAirport('empty');
    G.cur = cur; G.asked++;
    var it = cur.item, texts = it.type === 'mc' ? cur.order.map(function (o) { return it.options[o]; }) : ['صح', 'خطأ'];
    G.gate = ENG.ask(texts, G.D);
    $('qcText').textContent = it.text;
    $('qcTag').textContent = (it.type === 'mc' ? 'اختيار من متعدد' : 'صح أو خطأ') + ' • طِر عبر حلقة الإجابة الصحيحة';
    $('qcOps').innerHTML = texts.map(function (x, i) { return '<span><i style="background:' + RC[i] + '">' + (it.type === 'mc' ? LET[i] : (i ? '✗' : '✓')) + '</i>' + esc(String(x)) + '</span>'; }).join('');
    $('qcBar').style.width = '100%';
    $('qc').classList.add('show'); paintHud();
    window.Sound.play('question');
  }
  function passGate(idx, g) {
    var cur = G.cur;
    var ok = G.qm.answer(cur.order[idx]);
    G.gate = null; G.cur = null; $('qc').classList.remove('show');
    ENG.gateResult(g, ok);
    if (ok) { G.correct++; fuel(8); window.Sound.play('correct'); pop('إجابة صحيحة! 🚀<small>دفعة نفاثة و+8٪ وقود</small>'); }
    else { G.wrong++; window.Sound.play('wrong'); pop('مطبّات هوائية!<small>ليست الإجابة الصحيحة — سيعود السؤال لاحقًا 💪</small>', 'bad'); fuel(-22); }
    paintHud();
    if (G.over || G.state === 'crash') return;
    if (G.correct >= G.goal) return toAirport('goal');
    var d = ENG.dist(), nRem = G.goal - G.correct, Rm = (G.L - 1500) - d - 60;
    var F = Math.max(G.Fm, Math.min(G.F0 * 2.5, (Rm - nRem * G.D) / nRem));
    G.nextAt = d + F; ENG.freeRun(40, F + 10);
  }
  function toAirport(why) {
    G.state = 'cruise'; G.why = why; ENG.cruise();
    banner(why === 'empty' ? 'انتهت أسئلة الدروس — إلى المطار!' : 'أحسنت! توجّه إلى مطار مسقط 🛬', 'small', 2400);
    var d = ENG.dist(), rem = (G.L - 1500) - d; if (rem > 120) ENG.freeRun(30, rem);
  }
  function outOfFuel() {
    G.over = true; G.state = 'crash'; $('qc').classList.remove('show'); window.Sound.play('gameover');
    banner('نفد الوقود! ⛽<small>هبوط اضطراري في البحر</small>', 'small', 0);
    ENG.crash(function () { wait(function () { results('fuel'); }, 2200); });
  }
  function finishRun() {
    if (!G || G.over) return; G.over = true; G.state = 'done';
    window.Sound.play('clear'); banner('هبطت بسلام في مطار مسقط! 🛬', 'win', 0);
    wait(function () { results(G.why || 'goal'); }, 3600);
  }
  function results(why) {
    if (!G) return;
    clearInterval(tick);
    ambient(false);
    music(false);
    var answered = G.correct + G.wrong;
    window.GameSCORM?.report({ score: answered ? 100 * G.correct / answered : 0, completed: true });
    $('banner').className = 'fl-banner'; $('qc').classList.remove('show');
    var secs = Math.round((Date.now() - G.t0) / 1000), rate = why === 'fuel' ? 0 : G.wrong === 0 ? 3 : G.wrong <= 2 ? 2 : 1;
    var b = store.get(bestKey(), null);
    if (why !== 'fuel' && (!b || rate > b.rate || (rate === b.rate && G.stars > b.stars))) { b = { rate: rate, stars: G.stars }; store.set(bestKey(), b); }
    var who = M.name ? M.name + ': ' : '';
    $('winArt').innerHTML = (why !== 'fuel' ? '<span class="crown">🏆</span>' : '') + '<img src="assets/characters/' + M.char + '-jump.png" alt="">';
    $('rTitle').textContent = why === 'fuel' ? who + 'نفد الوقود — حاول مرة أخرى!' : who + 'هبطت في مطار مسقط! ' + '⭐'.repeat(rate);
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit;
    var mm = Math.floor(secs / 60), ss = secs % 60;
    var rows = [['الإجابات الصحيحة', G.correct + ' / ' + G.goal], ['الإجابات الخاطئة', G.wrong], ['النجوم المجموعة', G.stars + ' ⭐'], ['الوقود المتبقي', Math.round(G.fuel) + '%'], ['الاصطدامات', G.hits], ['زمن الرحلة', mm + ':' + (ss < 10 ? '0' : '') + ss], ['أفضل نتيجة', b ? b.rate + ' ⭐ • ' + b.stars + ' نجمة' : '—']];
    $('rTable').innerHTML = rows.map(function (r) { return '<div class="vt-row pl-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
      '<p class="cs-fact">✈️ مررت في رحلتك بقلعتي الجلالي والميراني في مسقط القديمة، وكورنيش مطرح ومبخرة ريام، ودار الأوبرا السلطانية، وجامع السلطان قابوس الأكبر، ثم مطار مسقط.</p>';
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
    music(false);
    $('flLoad').classList.remove('show');
    $('qc').classList.remove('show');
    $('cloudFx').style.opacity = 0;
    window.Sound.stopMusic();
    G = window.__fl = null;
    openHome();
  }
  // التحكم: لوحة المفاتيح والسحب بالإصبع أو الفأرة
  function bindControls() {
    var keys = {};
    function applyKeys() { if (!ENG) return; var x = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), y = (keys.u ? 1 : 0) - (keys.d ? 1 : 0); ENG.setInput(x, y); }
    function map(c) { return c === 'ArrowRight' || c === 'KeyD' ? 'r' : c === 'ArrowLeft' || c === 'KeyA' ? 'l' : c === 'ArrowUp' || c === 'KeyW' ? 'u' : c === 'ArrowDown' || c === 'KeyS' ? 'd' : null; }
    window.addEventListener('keydown', function (e) { if (!G || !$('play').classList.contains('active')) return; if (e.code === 'KeyC') { camToggle(); return; } var k = map(e.code); if (!k) return; keys[k] = 1; applyKeys(); e.preventDefault(); });
    window.addEventListener('keyup', function (e) { var k = map(e.code); if (!k) return; keys[k] = 0; applyKeys(); });
    var st = $('flStage'), joy = $('joy'), knob = $('joyKnob'), sx = 0, sy = 0, act = false;
    st.addEventListener('pointerdown', function (e) { if (!G || G.over) return; act = true; sx = e.clientX; sy = e.clientY; joy.style.left = sx + 'px'; joy.style.top = sy + 'px'; joy.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)'; try { st.setPointerCapture(e.pointerId); } catch (er) {} });
    st.addEventListener('pointermove', function (e) { if (!act || !ENG) return; var dx = e.clientX - sx, dy = e.clientY - sy, l = Math.hypot(dx, dy), k = Math.min(1, l / 70); var nx = l ? dx / l * k : 0, ny = l ? dy / l * k : 0; knob.style.transform = 'translate(calc(-50% + ' + nx * 44 + 'px),calc(-50% + ' + ny * 44 + 'px))'; ENG.setInput(nx, -ny); });
    function end() { if (!act) return; act = false; joy.classList.remove('on'); if (ENG) ENG.setInput(0, 0); }
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  }
  function camToggle() { if (!ENG) return; var m = ENG.toggleCam(); pop(m === 'cockpit' ? 'كاميرا القمرة 👀' : 'كاميرا خلف الطائرة 🎥'); }
  function bind() {
    bindCommon();
    $('startGame').onclick = startGame;
    $('exitBtn').onclick = exitGame;
    $('camBtn').onclick = camToggle;
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
        game: 'flight3d',
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
      console.error('Flight game startup:', error);
      if (window.gameLibraryShowError) window.gameLibraryShowError(error);
      else $('grades').textContent = error.message || 'تعذر بدء اللعبة. أعد تحميل الصفحة.';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBoot);
  else startBoot();
})();
