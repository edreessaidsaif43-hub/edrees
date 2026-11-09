/* «ملعب المعرفة 3D»: مباراة كرة قدم ثلاثية الأبعاد بين فريقين؛ كل إجابة صحيحة هجمة تنتهي بهدف.
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

  /* ---------- ملعب المعرفة 3D ---------- */
  var COLORS = ['#e53950', '#16a3a0'];
  var DEF_NAMES = ['فريق الصقور', 'فريق المها'];
  var QNAMES = { high: 'عالية', medium: 'متوسطة', low: 'خفيفة' };
  function autoQuality() { var small = Math.min(screen.width, screen.height) < 700, touch = window.matchMedia && matchMedia('(pointer:coarse)').matches; return small || touch ? 'low' : 'medium'; }
  var M = store.get('foot-settings', null) || { names: ['', ''], chars: ['boy', 'girl'], att: D.defaultAttacks, time: D.defaultTime, quality: autoQuality() };
  if (D.attacks.indexOf(M.att) < 0) M.att = D.defaultAttacks;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  if (D.qualities.indexOf(M.quality) < 0) M.quality = autoQuality();
  function saveM() { store.set('foot-settings', M); }
  function tname(i) { return M.names[i] || DEF_NAMES[i]; }
  var GL = !!(window.FootEngine && window.FootEngine.supported());

  /* أصوات الملعب: صافرة، هتاف الجمهور، ركلة، شباك، قائم */
  var AX = null, AXG = null;
  function ax() {
    if (window.Sound && window.Sound.isMuted && window.Sound.isMuted()) return null;
    try { if (!AX) { AX = new (window.AudioContext || window.webkitAudioContext)(); AXG = AX.createGain(); AXG.gain.value = .5; AXG.connect(AX.destination); } if (AX.state === 'suspended') AX.resume(); } catch (e) { return null; }
    return AX;
  }
  function noise(dur) { var n = AX.sampleRate * dur, b = AX.createBuffer(1, n, AX.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; var s = AX.createBufferSource(); s.buffer = b; return s; }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  var FX = {
    whistle: function (t, len) { [2900, 2960].forEach(function (f) { var o = AX.createOscillator(), g = AX.createGain(), l = AX.createOscillator(), lg = AX.createGain(); o.frequency.value = f; l.frequency.value = 38; lg.gain.value = 90; l.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(AXG); env(g, t, .02, .12, len || .5); o.start(t); l.start(t); o.stop(t + (len || .5) + .05); l.stop(t + (len || .5) + .05); }); },
    roar: function (t) { var s = noise(3.2), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = .6; s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .35, .55, 3.1); s.start(t); },
    crowd: function (t) { var s = noise(2), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = .5; s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .3, .12, 1.9); s.start(t); },
    kick: function (t) { var o = AX.createOscillator(), g = AX.createGain(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(50, t + .12); o.connect(g); g.connect(AXG); env(g, t, .005, .7, .16); o.start(t); o.stop(t + .2); },
    net: function (t) { var s = noise(.5), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'highpass'; f.frequency.value = 2500; s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .01, .35, .45); s.start(t); },
    post: function (t) { [1250, 2520, 3700].forEach(function (fr, i) { var o = AX.createOscillator(), g = AX.createGain(); o.type = 'sine'; o.frequency.value = fr; o.connect(g); g.connect(AXG); env(g, t, .003, .3 / (i + 1), .9); o.start(t); o.stop(t + 1); }); },
    catch: function (t) { var o = AX.createOscillator(), g = AX.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(60, t + .1); o.connect(g); g.connect(AXG); env(g, t, .005, .5, .14); o.start(t); o.stop(t + .2); },
    whoosh: function (t) { var s = noise(.4), f = AX.createBiquadFilter(), g = AX.createGain(); f.type = 'bandpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2000, t + .3); s.connect(f); f.connect(g); g.connect(AXG); env(g, t, .05, .25, .38); s.start(t); }
  };
  function sfx(n, a) { var c = ax(); if (!c || !FX[n]) return; try { FX[n](c.currentTime + .01, a); } catch (e) {} }
  function whistles(n) { sfx('whistle', .35); if (n > 1) setTimeout(function () { sfx('whistle', .35); }, 450); if (n > 2) setTimeout(function () { sfx('whistle', .9); }, 900); }

  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    chips($('optAtt'), D.attacks.map(function (n) { return n + ' هجمات'; }), D.attacks.indexOf(M.att), function (i) { M.att = D.attacks[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    chips($('optQuality'), D.qualities.map(function (q) { return QNAMES[q]; }), D.qualities.indexOf(M.quality), function (i) { M.quality = D.qualities[i]; saveM(); openHome(); });
    var box = $('teamsSetup'); box.innerHTML = '';
    [0, 1].forEach(function (i) {
      if (i === 1) { var vs = document.createElement('div'); vs.className = 'vs'; vs.textContent = 'ضد'; box.appendChild(vs); }
      var card = document.createElement('div'); card.className = 'tcard'; card.style.setProperty('--tc', COLORS[i]);
      card.innerHTML = '<span class="fb-no">⚽ ' + (i + 1) + '</span><label class="pname">اسم الفريق<input id="tn' + i + '" type="text" maxlength="18" placeholder="' + DEF_NAMES[i] + '"></label><span class="pick-lbl">قائد الفريق</span><div class="pchars"></div>';
      var inp = card.querySelector('input'); inp.value = M.names[i]; inp.oninput = function () { M.names[i] = inp.value.trim(); saveM(); };
      charPicker(card.querySelector('.pchars'), M.chars[i], function (k) { M.chars[i] = k; saveM(); openHome(); });
      box.appendChild(card);
    });
    if (window.GameRosters && typeof getSubscriptionUserId === 'function') try { GameRosters.picker(S.index[S.grade].id, SEL.subject, ['tn0', 'tn1'], { labels: ['طالب الفريق الأول', 'طالب الفريق الثاني'] }); } catch (e) {}
    $('glNote').textContent = GL ? '' : '⚠️ هذا المتصفح لا يدعم الرسوم ثلاثية الأبعاد (WebGL). جرّب متصفح Chrome أو Edge حديثًا.';
    $('startGame').disabled = !GL;
    show('home');
  }

  var G = null, later = [], ENG = null, ENGQ = null;
  function wait(fn, ms) { later.push(setTimeout(fn, ms)); }
  function clearWait() { later.forEach(clearTimeout); later = []; }
  function releaseEngine() {
    if (ENG) {
      ENG.stop();
      ENG.renderer.dispose();
    }
    $('fbStage').replaceChildren();
    ENG = ENGQ = window.__footEngine = null;
  }
  function engine() {
    if (ENG && ENGQ === M.quality) return ENG;
    releaseEngine();
    ENG = window.FootEngine.create($('fbStage'), { quality: M.quality, preserve: /[?&]shot=1/.test(location.search) }); ENGQ = M.quality; window.__footEngine = ENG;
    ENG.debug.onSfx = sfx;
    return ENG;
  }
  function banner(t, cls, ms) { var b = $('banner'); b.innerHTML = t; b.className = 'fb-banner show ' + (cls || ''); clearTimeout(b._t); if (ms) b._t = setTimeout(function () { b.className = 'fb-banner'; }, ms); }
  function pop(t, cls) { var p = $('pop'); p.innerHTML = t; p.className = 'fb-pop ' + (cls || ''); void p.offsetWidth; p.classList.add('show'); }
  function fade(fn) { var f = $('fbFade'); f.classList.add('on'); wait(function () { fn(); wait(function () { f.classList.remove('on'); }, 120); }, 330); }

  function startGame() {
    if (!GL) return;
    window.Sound.unlock(); ax();
    closeQuestion(); clearWait();
    G = window.__fb = { qm: new window.QuestionManager(bankOf(), 0), teams: [0, 1].map(function (i) { return { name: tname(i), color: COLORS[i], char: M.chars[i], goals: 0, correct: 0, wrong: 0, shots: [] }; }), turn: 0, asked: 0, over: false, golden: false, state: 'load' };
    $('rModal').classList.remove('show');
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    [0, 1].forEach(function (i) {
      var T = G.teams[i], el = $('team' + i), src = 'assets/characters/' + T.char + '-walk.png';
      el.style.setProperty('--tc', T.color); el.querySelector('img').src = src; el.querySelector('.nm b').textContent = T.name;
      $('sbN' + i).textContent = T.name; document.querySelector('.fb-sbt.t' + i + ' img').src = src;
    });
    paintHud(); paintTeacher(); show('play');
    $('banner').className = 'fb-banner'; $('fbLoad').classList.add('show');
    var match = G;
    function loadFailed(error) {
      if (G !== match) return;
      console.error('Football renderer startup:', error);
      exitGame();
      $('glNote').textContent = 'تعذر تشغيل الملعب. اختر جودة رسوم خفيفة وأعد المحاولة.';
    }
    var startupTimer = setTimeout(function () {
      loadFailed(Error('Football renderer startup timed out'));
    }, 20000);
    later.push(startupTimer);

    var fontReady = document.fonts?.load('80px Taj').catch(function () {}) || Promise.resolve();
    Promise.race([fontReady, new Promise(function (resolve) { setTimeout(resolve, 1500); })]).then(async function () {
      if (G !== match) return;
      var renderer = engine();
      await renderer.setTeams(match.teams.map(function (team) {
        return { name: team.name, img: window.RACE_CHARS[team.char] };
      }));
      if (G !== match) return;
      renderer.start();
      renderer.intro(function () {
        if (G !== match) return;
        whistles(1);
        banner('صافرة البداية! 📣', 'go', 1300);
        match.state = 'kick';
        wait(nextTurn, 1400);
      });
      clearTimeout(startupTimer);
      $('fbLoad').classList.remove('show');
      match.state = 'intro';
      banner('<small>' + esc(SEL.subject) + '</small>ملعب المعرفة', 'small', 2600);
      sfx('crowd');
    }).catch(loadFailed);
  }
  function paintHud() {
    var A = M.att;
    [0, 1].forEach(function (i) {
      var T = G.teams[i], el = $('team' + i);
      el.querySelector('.nm i').textContent = T.goals;
      var n = Math.max(A, T.shots.length + (G.golden && G.turn === i && !G.over ? 1 : 0)), h = '';
      for (var k = 0; k < n; k++) { var s = T.shots[k], cur = !G.over && G.turn === i && k === T.shots.length && /turn|ask/.test(G.state); h += '<i class="' + (s === 'g' ? 'g' : s === 'x' ? 'x' : '') + (cur ? ' now' : '') + (k >= A ? ' gold' : '') + '">' + (s === 'g' ? '⚽' : s === 'x' ? '✕' : '') + '</i>'; }
      el.querySelector('.pips').innerHTML = h;
      el.classList.toggle('myturn', G.turn === i && !G.over && G.state !== 'intro' && G.state !== 'load');
      $('sbS' + i).textContent = T.goals;
    });
    var t = G.teams[G.turn];
    $('hAtt').textContent = G.over ? 'نهاية المباراة' : G.golden ? '⭐ الهدف الذهبي' : 'الهجمة ' + Math.min(A, t.shots.length + 1) + ' من ' + A;
    $('hQ').textContent = G.asked;
  }
  function nextTurn() {
    if (!G || G.over) return;
    var i = G.turn, T = G.teams[i], my = G;
    G.state = 'turn';
    fade(function () {
      if (G !== my) return;
      ENG.setup(i); ENG.sub('هجمة ' + T.name); paintHud();
      banner('<small>' + (G.golden ? '⭐ الهدف الذهبي' : 'الهجمة ' + (T.shots.length + 1) + ' من ' + M.att) + '</small>هجمة ' + esc(T.name), 'tb tb' + i, 1700);
      wait(function () {
        if (!G || G.over || G !== my) return;
        G.state = 'ask'; G.asked++; paintHud();
        showQuestion(G.qm, { time: M.time, tag: '⚽ ' + T.name, color: T.color, okText: 'إجابة صحيحة! انطلق نحو المرمى ⚽', badText: 'ضاعت الهجمة — سيعود السؤال لاحقًا 💪' }, function (ok) {
          if (!G || G.over || G !== my) return;
          if (ok === null) { G.asked--; return endMatch('empty'); }
          G.state = 'play';
          if (ok) T.correct++; else T.wrong++;
          ENG.debug.onEvent = function (ev) {
            if (G !== my) return;
            G.lastEv = ev;
            if (ev === 'goal') { T.goals++; T.shots.push('g'); paintHud(); var sEl = $('sbS' + i); sEl.classList.remove('bump'); void sEl.offsetWidth; sEl.classList.add('bump'); banner('هدف!', 'goal', 1800); pop('⚽ ' + esc(T.name) + '<small>إجابة صحيحة = هدف</small>'); window.Sound.play('correct'); }
            else { T.shots.push('x'); paintHud(); pop(ev === 'tackle' ? 'قطع المدافع الكرة!' : ev === 'save' ? 'تصدٍّ رائع من الحارس! 🧤' : 'القائم! 😱', 'bad'); }
          };
          ENG.attack(i, ok, function () { if (G !== my) return; ENG.debug.onEvent = null; after(); });
        });
      }, 1700);
    });
  }
  function decided() {
    var a = G.teams[0], b = G.teams[1], A = M.att;
    if (G.golden) return a.shots.length === b.shots.length && a.goals !== b.goals ? (a.goals > b.goals ? 0 : 1) : null;
    var ra = A - a.shots.length, rb = A - b.shots.length;
    if (a.goals + ra < b.goals) return 1; if (b.goals + rb < a.goals) return 0;
    if (ra === 0 && rb === 0) return a.goals === b.goals ? 'tie' : (a.goals > b.goals ? 0 : 1);
    return null;
  }
  function after() {
    if (!G || G.over) return;
    var d = decided();
    if (d === 0 || d === 1) return endMatch(d);
    if (d === 'tie' && !G.golden) {
      G.golden = true; G.turn = 0; G.state = 'golden'; paintHud(); whistles(1);
      banner('<small>تعادل!</small>⭐ الهدف الذهبي', 'tb', 2200); ENG.sub('⭐ الهدف الذهبي');
      return wait(nextTurn, 2300);
    }
    G.turn = 1 - G.turn; nextTurn();
  }
  function endMatch(win) {
    if (!G || G.over) return;
    closeQuestion(); var t = G.teams;
    if (win === 'empty') win = t[0].goals === t[1].goals ? -1 : (t[0].goals > t[1].goals ? 0 : 1);
    G.over = true; G.state = 'final'; G.winner = win; paintHud();
    var correct = t[0].correct + t[1].correct;
    var answered = correct + t[0].wrong + t[1].wrong;
    window.GameSCORM?.report({ score: answered ? 100 * correct / answered : 0, completed: true });
    whistles(3); var my = G;
    banner('<small>صافرة النهاية</small>' + (win < 0 ? 'تعادل الفريقان' : '🏆 ' + esc(t[win].name) + ' يفوز!'), win < 0 ? 'tb' : 'tb tb' + win, 0);
    wait(function () {
      if (G !== my) return;
      fade(function () { if (G !== my) return; $('banner').className = 'fb-banner'; if (win >= 0) sfx('roar'); ENG.finale(win, function () { if (G !== my) return; banner(win < 0 ? 'تعادل' : '🏆 ' + esc(t[win].name) + ' بطل المباراة!', 'go', 0); wait(results, 1800); }); });
    }, 2200);
  }
  function results() {
    if (!G) return; var t = G.teams, win = G.winner; G.state = 'over';
    $('banner').className = 'fb-banner';
    $('winArt').innerHTML = win >= 0 ? '<span class="crown">🏆</span><img src="assets/characters/' + t[win].char + '-jump.png" alt="">' : '<img src="assets/characters/' + t[0].char + '-jump.png" alt=""><img src="assets/characters/' + t[1].char + '-jump.png" alt="">';
    $('rTitle').textContent = win >= 0 ? 'فاز ' + t[win].name + ' بالمباراة ' + Math.max(t[0].goals, t[1].goals) + '–' + Math.min(t[0].goals, t[1].goals) + ' ⚽' : 'تعادل الفريقان ' + t[0].goals + '–' + t[1].goals;
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit + ' • ' + G.asked + ' سؤالًا';
    $('rTable').innerHTML = '<div class="vt-row vt-h fb-row"><span>الفريق</span><b>الأهداف</b><b>صحيحة</b><b>خاطئة</b><b>النتيجة</b></div>' + [0, 1].map(function (i) {
      var place = win < 0 ? '🤝' : (i === win ? '🏆 فوز' : 'خسارة');
      return '<div class="vt-row fb-row" style="--tc:' + t[i].color + '"><span><i class="fb-dot"></i>' + esc(t[i].name) + '</span><b>' + t[i].goals + '</b><b>' + t[i].correct + '</b><b>' + t[i].wrong + '</b><b>' + place + '</b></div>';
    }).join('');
    resultsActions(startGame, function () { exitGame(); });
    paintTeacher();
    $('rModal').classList.add('show');
  }
  function exitGame() {
    var loading = G?.state === 'load';
    if (G) G.over = true;
    closeQuestion();
    clearWait();
    if (loading) releaseEngine();
    else if (ENG) ENG.stop();
    $('fbLoad').classList.remove('show');
    $('fbFade').classList.remove('on');
    window.Sound.stopMusic();
    G = window.__fb = null;
    openHome();
  }
  function bind() {
    bindCommon();
    $('startGame').onclick = startGame;
    $('exitBtn').onclick = exitGame;
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
        game: 'football3d',
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
      console.error('Football game startup:', error);
      if (window.gameLibraryShowError) window.gameLibraryShowError(error);
      else $('grades').textContent = error.message || 'تعذر بدء اللعبة. أعد تحميل الصفحة.';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBoot);
  else startBoot();
})();
