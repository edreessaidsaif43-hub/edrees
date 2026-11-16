/* «سباق العاصفة 3D»: سباق فردي ثلاثي الأبعاد في رمال الشرقية؛ يقفز الطالب من منحدر الإجابة الصحيحة ليهرب من العاصفة الرملية حتى يصل إلى المخيم البدوي.
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

  /* ---------- سباق العاصفة 3D ---------- */
  var QNAMES = { high: 'عالية', medium: 'متوسطة', low: 'خفيفة' };
  var SPEEDS = { slow: 30, normal: 38, fast: 46 }, SNAMES = { slow: 'هادئة', normal: 'عادية', fast: 'سريعة' };
  var CARS = [['jeep', '🚙', 'دفع رباعي'], ['buggy', '🏎️', 'باجي صحراوي'], ['quad', '🛵', 'دراجة رباعية']];
  var RC = ['#ff8a3c', '#2bb6d9', '#a07bff', '#3fd17a'], LET = ['أ', 'ب', 'ج', 'د'];
  var GAP0 = 70, GAIN = 12, LOSS = 15, HITLOSS = 5, DATEGAIN = 1.5, DRIFT = 4;
  function autoQuality() { var small = Math.min(screen.width, screen.height) < 700, touch = window.matchMedia && matchMedia('(pointer:coarse)').matches; return small || touch ? 'low' : 'medium'; }
  var M = store.get('storm-settings', null) || { char: 'boy', car: 'jeep', name: '', goal: D.defaultGoal, time: D.defaultTime, speed: D.defaultSpeed, quality: autoQuality() };
  if (D.goals.indexOf(M.goal) < 0) M.goal = D.defaultGoal;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  if (D.speeds.indexOf(M.speed) < 0) M.speed = D.defaultSpeed;
  if (D.qualities.indexOf(M.quality) < 0) M.quality = autoQuality();
  if (['boy', 'girl', 'girl2'].indexOf(M.char) < 0) M.char = 'boy';
  if (['jeep', 'buggy', 'quad'].indexOf(M.car) < 0) M.car = 'jeep';
  function saveM() { store.set('storm-settings', M); }
  var GL = !!(window.StormEngine && window.StormEngine.supported());
  function bestKey() { return 'storm-best:' + (SEL ? SEL.subject + '|' + SEL.unit + '|' + SEL.lessons.map(function (L) { return L.n; }).join(',') : ''); }

  /* ---------- الصوت: المحرك، هدير العاصفة، موسيقى حماسية، مؤثرات ---------- */
  var AX = null, AXG = null, AMB = null, MUS = null;
  function muted() { return window.Sound && window.Sound.isMuted && window.Sound.isMuted(); }
  function ax() {
    if (muted()) return null;
    try { if (!AX) { AX = new (window.AudioContext || window.webkitAudioContext)(); AXG = AX.createGain(); AXG.gain.value = .55; AXG.connect(AX.destination); } if (AX.state === 'suspended') AX.resume(); } catch (e) { return null; }
    return AX;
  }
  function noiseBuf(dur, brown) { var n = AX.sampleRate * dur, b = AX.createBuffer(1, n, AX.sampleRate), d = b.getChannelData(0), last = 0; for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } return b; }
  function noise(dur, brown) { var s = AX.createBufferSource(); s.buffer = noiseBuf(dur, brown); return s; }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function tone(t, f, type, peak, dur, f2, dest) { var o = AX.createOscillator(), g = AX.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); o.connect(g); g.connect(dest || AXG); env(g, t, .01, peak, dur); o.start(t); o.stop(t + dur + .05); }
  function nz(t, dur, type, f1, f2, peak, att, brown) { var s = noise(dur + .1, brown), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = type; f.frequency.setValueAtTime(f1, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur); s.connect(f); f.connect(g); g.connect(AXG); env(g, t, att || .02, peak, dur); s.start(t); }
  var FX = {
    star: function (t) { tone(t, 1568, 'triangle', .08, .12); tone(t + .06, 2093, 'triangle', .07, .2); },
    date: function (t) { tone(t, 660, 'sine', .1, .1); tone(t + .07, 990, 'sine', .09, .18); },
    jump: function (t) { nz(t, 1.4, 'bandpass', 400, 2400, .22, .25); [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(t + i * .07, f, 'triangle', .1, .4); }); },
    hop: function (t) { nz(t, .5, 'bandpass', 500, 1500, .14, .1); },
    crack: function (t) { nz(t, .35, 'highpass', 1200, 0, .3); tone(t, 180, 'square', .1, .3, 60); },
    land: function (t) { tone(t, 110, 'sine', .3, .3, 45); nz(t, .45, 'lowpass', 900, 200, .4); },
    bog: function (t) { nz(t, 1.6, 'lowpass', 700, 250, .35, .1, true); tone(t, 220, 'sawtooth', .07, 1.2, 330); },
    animal: function (t) { tone(t, 440, 'square', .09, .22); tone(t + .26, 440, 'square', .09, .3); tone(t + .1, 150, 'sawtooth', .1, .6, 95); },
    devil: function (t) { nz(t, 1.1, 'bandpass', 300, 1800, .3, .2); },
    thunder: function (t) { nz(t, 1.8, 'lowpass', 220, 60, .5, .05, true); },
    skid: function (t) { nz(t, 1.1, 'bandpass', 1500, 600, .3, .05); },
    arrive: function (t) { nz(t, 3, 'bandpass', 1100, 0, .28, .3); [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(t + .2 + i * .12, f, 'triangle', .11, .55); }); },
    swallow: function (t) { nz(t, 3, 'lowpass', 300, 900, .7, .6, true); }
  };
  function sfx(n) { var c = ax(); if (!c || !FX[n]) return; try { FX[n](c.currentTime + .01); } catch (e) {} }
  function ambient(on) {
    if (!on) { if (AMB) { try { AMB.src.forEach(function (s) { s.stop(); }); } catch (e) {} AMB = null; } return; }
    var c = ax(); if (!c || AMB) return;
    var eg = AX.createGain(); eg.gain.value = 0; eg.connect(AXG); var src = [];
    var base = M.car === 'jeep' ? 62 : M.car === 'buggy' ? 96 : 80;
    var o = AX.createOscillator(), o2 = AX.createOscillator(), f = AX.createBiquadFilter(), lfo = AX.createOscillator(), lg = AX.createGain(), tg = AX.createGain();
    o.type = 'sawtooth'; o.frequency.value = base; o2.type = 'square'; o2.frequency.value = base * 1.5; f.type = 'lowpass'; f.frequency.value = M.car === 'jeep' ? 480 : 800;
    lfo.frequency.value = base / 3; lg.gain.value = .45; tg.gain.value = .55; lfo.connect(lg); lg.connect(tg.gain);
    var g2 = AX.createGain(); g2.gain.value = .3; o.connect(f); o2.connect(g2); g2.connect(f); f.connect(tg); tg.connect(eg); o.start(); o2.start(); lfo.start(); src.push(o, o2, lfo);
    // هدير العاصفة
    var w = noise(4, true), wf = AX.createBiquadFilter(), wg = AX.createGain(); w.loop = true; wf.type = 'lowpass'; wf.frequency.value = 500; wg.gain.value = 0; w.connect(wf); wf.connect(wg); wg.connect(AXG); w.start(); src.push(w);
    var w2 = noise(4), wf2 = AX.createBiquadFilter(), wg2 = AX.createGain(); w2.loop = true; wf2.type = 'bandpass'; wf2.frequency.value = 1300; wf2.Q.value = .5; wg2.gain.value = 0; w2.connect(wf2); wf2.connect(wg2); wg2.connect(AXG); w2.start(); src.push(w2);
    AMB = { src: src, eg: eg, wg: wg, wg2: wg2, o: o, o2: o2, lfo: lfo, base: base };
  }
  function engineLevel(sp, boost, gap, air) {
    if (!AMB) return; var t = AX.currentTime, k = Math.max(0, Math.min(1, 1 - gap / 100)), r = AMB.base * (.7 + sp / 60 + boost * .25 + (air ? .5 : 0));
    AMB.eg.gain.setTargetAtTime(sp > 1 ? .2 + boost * .08 : .07, t, .2); AMB.o.frequency.setTargetAtTime(r, t, .15); AMB.o2.frequency.setTargetAtTime(r * 1.5, t, .15); AMB.lfo.frequency.setTargetAtTime(r / 3, t, .15);
    AMB.wg.gain.setTargetAtTime(.05 + k * k * .85, t, .4); AMB.wg2.gain.setTargetAtTime(k * k * .2, t, .4);
  }
  // موسيقى حماسية: إيقاع طبل وباص ولحن خماسي يتسارع مع اقتراب العاصفة
  function music(on) {
    if (!on) { if (MUS) { clearTimeout(MUS.to); MUS = null; } return; }
    var c = ax(); if (!c || MUS) return;
    var mg = AX.createGain(); mg.gain.value = .09; mg.connect(AXG);
    var bass = [110, 110, 131, 98], pent = [440, 523, 587, 659, 784, 880], pat = [1, 0, 0, 1, 0, 1, 1, 0], step = 0;
    MUS = { g: mg };
    (function beat() {
      if (!MUS) return;
      var danger = G ? Math.max(0, Math.min(1, 1 - G.gap / 100)) : 0;
      if (AX && !muted()) {
        var t = AX.currentTime + .03, b = bass[(step >> 3) % 4];
        if (step % 4 === 0) { tone(t, 130, 'sine', .9, .16, 45, mg); }
        if (step % 4 === 2) { var s = noise(.12), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'highpass'; f.frequency.value = 2500; s.connect(f); f.connect(g); g.connect(mg); env(g, t, .005, .5, .1); s.start(t); }
        if (step % 2 === 0) tone(t, b, 'sawtooth', .28, .16, 0, mg);
        if (pat[step % 8]) tone(t, pent[(step * 5 + (step >> 3) * 2) % pent.length], 'triangle', .3, .22, 0, mg);
      }
      step++;
      MUS.to = setTimeout(beat, 190 - danger * 55);
    })();
  }

  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    charPicker($('charPick'), M.char, function (k) { M.char = k; saveM(); openHome(); });
    var pp = $('carPick'); pp.innerHTML = CARS.map(function (p) { return '<button class="sr-car' + (M.car === p[0] ? ' on' : '') + '" data-k="' + p[0] + '"><i>' + p[1] + '</i><span>' + p[2] + '</span></button>'; }).join('');
    pp.querySelectorAll('.sr-car').forEach(function (b) { b.onclick = function () { M.car = b.dataset.k; saveM(); openHome(); }; });
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
    $('srStage').replaceChildren();
    ENG = ENGQ = window.__stormEngine = null;
  }
  function engine() {
    if (ENG && ENGQ === M.quality) return ENG;
    releaseEngine();
    ENG = window.StormEngine.create($('srStage'), { quality: M.quality, preserve: /[?&]shot=1/.test(location.search) }); ENGQ = M.quality; window.__stormEngine = ENG;
    var E = ENG.debug;
    E.onSfx = function (n) { sfx(n); };
    E.onStar = function () { if (!G) return; G.stars++; $('hStars').textContent = G.stars; };
    E.onDate = function () { if (!G || G.over) return; G.dates++; $('hDates').textContent = G.dates; gap(DATEGAIN); };
    E.onHit = function (k) { if (!G || G.over) return; G.hits++; gap(-HITLOSS); pop((k === 'camel' ? 'جمل يعبر الطريق! 🐪' : k === 'oryx' ? 'قطيع مها! 🦌' : 'زوبعة رملية! 🌀') + '<small>تمهّل — اقتربت العاصفة قليلًا</small>', 'bad'); };
    E.onGate = function (idx, g) { if (G && G.gate === g) passGate(idx, g); };
    return ENG;
  }
  function banner(t, cls, ms) { var b = $('banner'); b.innerHTML = t; b.className = 'sr-banner show ' + (cls || ''); clearTimeout(b._t); if (ms) b._t = setTimeout(function () { b.className = 'sr-banner'; }, ms); }
  function pop(t, cls) { var p = $('pop'); p.innerHTML = t; p.className = 'sr-pop ' + (cls || ''); void p.offsetWidth; p.classList.add('show'); }
  function gap(d) { if (!G) return; G.gap = Math.max(0, Math.min(100, G.gap + d)); if (ENG) ENG.setStorm(G.gap); paintGap(); if (G.gap <= 0 && !G.over && G.state === 'drive') caught(); }
  function paintGap() { var f = Math.round(G.gap); $('gapBar').style.height = f + '%'; $('gapPct').textContent = Math.round(G.gap * 3) + ' م'; $('gapBox').classList.toggle('low', f <= 30); $('sandFx').style.opacity = Math.max(0, Math.min(.95, (55 - G.gap) / 55)).toFixed(2); }

  function startGame() {
    if (!GL) return;
    window.Sound.unlock(); ax();
    closeQuestion(); clearWait();
    var bank = bankOf(), base = SPEEDS[M.speed], goal = Math.min(M.goal, bank.qs.length), Dd = base * M.time, F0 = base * 3.2, Fm = base * 1.8;
    var L = Math.ceil((300 + goal * (Dd + F0) + 6 * (Dd + Fm) + 650) / 100) * 100;
    G = window.__sr = { qm: new window.QuestionManager(bank, 0), goal: goal, gap: GAP0, drift: DRIFT / (M.time + 3.2), lastT: null, correct: 0, wrong: 0, stars: 0, dates: 0, hits: 0, asked: 0, over: false, state: 'load', cur: null, gate: null, nextAt: null, t0: 0, L: L, D: Dd, F0: F0, Fm: Fm, base: base };
    $('rModal').classList.remove('show');
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    $('rMe').textContent = CARS.filter(function (c) { return c[0] === M.car; })[0][1]; $('gapBox').querySelector('.car').textContent = $('rMe').textContent;
    $('qc').classList.remove('show'); $('hStars').textContent = '0'; $('hDates').textContent = '0'; $('sandFx').className = 'sr-sand'; paintHud(); paintGap(); paintTeacher(); show('play');
    $('banner').className = 'sr-banner'; $('srLoad').classList.add('show');
    var my = G;
    var fontReady = document.fonts && document.fonts.load ? document.fonts.load('80px Taj').catch(function () {}) : Promise.resolve();
    Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
      if (G !== my) return;
      return new Promise(function (resolve) { setTimeout(resolve, 30); }).then(function () {
        if (G !== my) return;
        var E = engine();
        E.setup({ L: L, base: base, kind: M.car, kid: M.char, gap: GAP0 }); E.start();
        $('srLoad').classList.remove('show'); ambient(true); music(true);
        G.state = 'intro'; E.intro(4);
        var n = 3;
        banner('<small>' + esc(SEL.subject) + '</small>العاصفة قادمة! 🌪️', 'small', 1500);
        sfx('thunder');
        wait(function cd() {
          if (G !== my) return;
          if (n > 0) { banner(String(n), 'count', 700); window.Sound.play('coin'); n--; wait(cd, 750); return; }
          banner('انطلق! 🏁', 'go', 900); window.Sound.play('checkpoint');
          ENG.go(); G.state = 'drive'; G.t0 = Date.now();
          G.nextAt = ENG.dist() + base * 2.5; ENG.freeRun(30, base * 2.5 + 20);
          tick = setInterval(loopTick, 100);
        }, 1700);
      });
    }).catch(function (error) {
      if (G !== my) return;
      console.error('Storm renderer startup:', error);
      releaseEngine();
      exitGame();
      $('glNote').textContent = 'تعذر تشغيل السباق. اختر جودة رسوم خفيفة وأعد المحاولة.';
    });
  }
  function loopTick() {
    if (!G || G.over) return;
    var E = ENG.debug, d = ENG.dist();
    engineLevel(E.speed, E.boost, G.gap, E.air);
    if (G.state === 'drive') { if (G.lastT !== null) gap(-G.drift * Math.max(0, Math.min(.5, E.t - G.lastT))); G.lastT = E.t; }
    if (G.over) return;
    if (G.state === 'drive' && !G.gate && G.nextAt !== null && d >= G.nextAt) { G.nextAt = null; nextQuestion(); }
    if (G.state === 'cruise' && d >= G.L - 400) { G.state = 'finish'; $('qc').classList.remove('show'); ENG.finish(function () { finishRun(); }); }
    if (G.gate) { var gd = ENG.gateDist(); if (gd !== null) { $('qcBar').style.width = Math.max(0, Math.min(100, gd / G.gate.D * 100)) + '%'; $('qc').classList.toggle('near', gd < 95); } }
    $('speedLines').classList.toggle('on', E.boost > .4 && E.ts > .8);
    $('hSpd').textContent = Math.round(E.speed * 3.6 * .8);
    var p = Math.max(0, Math.min(1, d / (G.L - 150))); $('rFill').style.width = (p * 100) + '%'; $('rMe').style.right = (p * 92 + 4) + '%';
  }
  function paintHud() { $('hQ').textContent = G.asked; }
  function nextQuestion() {
    if (!G || G.over) return;
    var cur = null; for (var t = 0; t < 10 && !cur; t++) cur = G.qm.next();
    if (!cur) return toCamp('empty');
    G.cur = cur; G.asked++;
    var it = cur.item, texts = it.type === 'mc' ? cur.order.map(function (o) { return it.options[o]; }) : ['صح', 'خطأ'];
    G.gate = ENG.ask(texts, G.D);
    $('qcText').textContent = it.text;
    $('qcTag').textContent = (it.type === 'mc' ? 'اختيار من متعدد' : 'صح أو خطأ') + ' • اقفز من منحدر الإجابة الصحيحة';
    $('qcOps').innerHTML = texts.map(function (x, i) { return '<span><i style="background:' + RC[i] + '">' + (it.type === 'mc' ? LET[i] : (i ? '✗' : '✓')) + '</i>' + esc(String(x)) + '</span>'; }).join('');
    $('qcBar').style.width = '100%'; $('qc').classList.remove('near');
    $('qc').classList.add('show'); paintHud();
    window.Sound.play('question');
  }
  function passGate(idx, g) {
    var cur = G.cur;
    var ok = G.qm.answer(cur.order[idx]);
    G.gate = null; G.cur = null; $('qc').classList.remove('show');
    ENG.gateResult(g, ok);
    if (ok) { G.correct++; gap(GAIN); window.Sound.play('correct'); pop('قفزة رائعة! 🚀<small>إجابة صحيحة — ابتعدت عن العاصفة</small>'); }
    else { G.wrong++; window.Sound.play('wrong'); pop('رمل ناعم!<small>ليست الإجابة الصحيحة — سيعود السؤال لاحقًا 💪</small>', 'bad'); gap(-LOSS); }
    paintHud();
    if (G.over) return;
    if (G.correct >= G.goal) return toCamp('goal');
    var d = ENG.dist(), nRem = G.goal - G.correct, Rm = (G.L - 650) - d - 60;
    var F = Math.max(G.Fm, Math.min(G.F0 * 2.5, (Rm - nRem * G.D) / nRem));
    G.nextAt = d + 12 + F; ENG.freeRun(ok ? 110 : 60, F + 12);
  }
  function toCamp(why) {
    G.state = 'cruise'; G.why = why; ENG.cruise();
    wait(function () { if (G && !G.over) banner(why === 'empty' ? 'انتهت أسئلة الدروس — إلى المخيم!' : 'نجوت من العاصفة! إلى المخيم ⛺', 'small', 2600); }, 1800);
    var d = ENG.dist(), rem = (G.L - 650) - d; if (rem > 160) ENG.freeRun(110, rem);
  }
  function caught() {
    G.over = true; G.state = 'caught'; $('qc').classList.remove('show'); window.Sound.play('gameover'); sfx('swallow');
    banner('لحقت بك العاصفة! 🌪️<small>لا بأس — حاول مرة أخرى</small>', 'small', 0);
    $('sandFx').classList.add('full');
    ENG.swallow(function () { wait(function () { results('storm'); }, 900); });
  }
  function finishRun() {
    if (!G || G.over) return; G.over = true; G.state = 'done';
    window.Sound.play('clear'); banner('وصلت إلى المخيم بسلام! ⛺', 'win', 0); $('sandFx').style.opacity = 0;
    wait(function () { results(G.why || 'goal'); }, 4200);
  }
  function results(why) {
    if (!G) return;
    clearInterval(tick);
    ambient(false);
    music(false);
    var answered = G.correct + G.wrong;
    window.GameSCORM?.report({ score: answered ? 100 * G.correct / answered : 0, completed: true });
    $('banner').className = 'sr-banner'; $('qc').classList.remove('show');
    var secs = Math.round((Date.now() - G.t0) / 1000), lost = why === 'storm', rate = lost ? 0 : G.wrong === 0 ? 3 : G.wrong <= 2 ? 2 : 1;
    var b = store.get(bestKey(), null);
    if (!lost && (!b || rate > b.rate || (rate === b.rate && G.stars > b.stars))) { b = { rate: rate, stars: G.stars }; store.set(bestKey(), b); }
    var who = M.name ? M.name + ': ' : '';
    $('winArt').innerHTML = (!lost ? '<span class="crown">🏆</span>' : '') + '<img src="assets/characters/' + M.char + '-jump.png" alt="">';
    $('rTitle').textContent = lost ? who + 'لحقت بك العاصفة — حاول مرة أخرى!' : who + 'نجوت ووصلت إلى المخيم! ' + '⭐'.repeat(rate);
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit;
    var mm = Math.floor(secs / 60), ss = secs % 60;
    var rows = [['الإجابات الصحيحة', G.correct + ' / ' + G.goal], ['الإجابات الخاطئة', G.wrong], ['النجوم المجموعة', G.stars + ' ⭐'], ['التمور المجموعة', G.dates + ' 🌴'], ['بُعد العاصفة عند النهاية', lost ? '0 م' : Math.round(G.gap * 3) + ' م'], ['الاصطدامات', G.hits], ['زمن السباق', mm + ':' + (ss < 10 ? '0' : '') + ss], ['أفضل نتيجة', b ? b.rate + ' ⭐ • ' + b.stars + ' نجمة' : '—']];
    $('rTable').innerHTML = rows.map(function (r) { return '<div class="vt-row pl-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
      '<p class="cs-fact">🏜️ رمال الشرقية بحر من الكثبان الذهبية في سلطنة عُمان، يعيش فيه البدو ويرعون الإبل، ويقصده الزوّار للتخييم ومشاهدة الغروب.</p>';
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
    $('srLoad').classList.remove('show');
    $('qc').classList.remove('show');
    $('sandFx').className = 'sr-sand';
    $('sandFx').style.opacity = 0;
    window.Sound.stopMusic();
    G = window.__sr = null;
    openHome();
  }
  // التحكم: لوحة المفاتيح والسحب بالإصبع أو الفأرة
  function bindControls() {
    var keys = {};
    function applyKeys() { if (!ENG) return; ENG.setInput((keys.r ? 1 : 0) - (keys.l ? 1 : 0)); }
    function map(c) { return c === 'ArrowRight' || c === 'KeyD' ? 'r' : c === 'ArrowLeft' || c === 'KeyA' ? 'l' : null; }
    window.addEventListener('keydown', function (e) { if (!G || !$('play').classList.contains('active')) return; if (e.code === 'Space') { if (ENG) ENG.lookBack(true); e.preventDefault(); return; } var k = map(e.code); if (!k) return; keys[k] = 1; applyKeys(); e.preventDefault(); });
    window.addEventListener('keyup', function (e) { if (e.code === 'Space') { if (ENG) ENG.lookBack(false); return; } var k = map(e.code); if (!k) return; keys[k] = 0; applyKeys(); });
    var st = $('srStage'), joy = $('joy'), knob = $('joyKnob'), sx = 0, act = false;
    st.addEventListener('pointerdown', function (e) { if (!G || G.over) return; act = true; sx = e.clientX; joy.style.left = sx + 'px'; joy.style.top = e.clientY + 'px'; joy.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)'; try { st.setPointerCapture(e.pointerId); } catch (er) {} });
    st.addEventListener('pointermove', function (e) { if (!act || !ENG) return; var dx = e.clientX - sx, k = Math.max(-1, Math.min(1, dx / 70)); knob.style.transform = 'translate(calc(-50% + ' + k * 44 + 'px),-50%)'; ENG.setInput(k); });
    function end() { if (!act) return; act = false; joy.classList.remove('on'); if (ENG) ENG.setInput(0); }
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    var bb = $('backBtn');
    function back(on) { return function (e) { if (ENG) ENG.lookBack(on); if (e && e.cancelable) e.preventDefault(); }; }
    bb.addEventListener('pointerdown', back(true)); bb.addEventListener('pointerup', back(false)); bb.addEventListener('pointerleave', back(false)); bb.addEventListener('pointercancel', back(false));
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
        game: 'storm3d',
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
      console.error('Storm game startup:', error);
      if (window.gameLibraryShowError) window.gameLibraryShowError(error);
      else $('grades').textContent = error.message || 'تعذر بدء اللعبة. أعد تحميل الصفحة.';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBoot);
  else startBoot();
})();
