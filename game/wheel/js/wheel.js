/* «العجلة الدوّارة»: عجلة بأسماء طلاب الشعبة تختار طالبًا عشوائيًا، ثم يظهر له سؤال، وتُجمع النقاط في لوحة الصف.
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

  /* ---------- العجلة الدوّارة ---------- */
  var SAMPLE = ['أحمد', 'مريم', 'سالم', 'فاطمة', 'خالد', 'عائشة', 'يوسف', 'شهد', 'محمد', 'ريم', 'ناصر', 'جنى'];
  var WCOL = ['#16a3a0', '#ff7a1a', '#6b3fa0', '#e53950', '#2b8fd6', '#f4b400', '#1c8a4c', '#d94f9b'];
  var M = store.get('wheel-settings:'+getSubscriptionUserId(), null) || { points: D.defaultPoints, time: D.defaultTime, noRepeat: true };
  if (D.points.indexOf(M.points) < 0) M.points = D.defaultPoints;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  function saveM() { store.set('wheel-settings:'+getSubscriptionUserId(), M); }
  function namesKey() { return 'wheel-names:' + getSubscriptionUserId()+':' + S.index[S.grade].id + ':' + SEL.subject; }
  function parseNames(t) { var seen = {}; return String(t || '').split(/[\n\r,،;\t]+/).map(function (s) { return s.trim(); }).filter(function (s) { if (!s || seen[s]) return false; seen[s] = 1; return true; }).slice(0, 60); }
  function countNames() {
    var n = parseNames($('namesBox').value).length;
    $('namesCount').textContent = n ? n + ' طالبًا' : 'لا توجد أسماء بعد';
    $('startGame').disabled = n < 2;
    $('namesWarn').textContent = n < 2 ? 'أضف اسمين على الأقل لبدء العجلة.' : '';
  }
  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    $('namesBox').value = (store.get(namesKey(), []) || []).join('\n');
    $('namesBox').oninput = function () { store.set(namesKey(), parseNames($('namesBox').value)); countNames(); };
    $('sampleNames').onclick = function () { $('namesBox').value = SAMPLE.join('\n'); $('namesBox').oninput(); };
    $('clearNames').onclick = function () { $('namesBox').value = ''; $('namesBox').oninput(); };
    // قوائم الشعب المحفوظة في الموقع (إن وُجدت)
    var rb = $('rosterBox'); rb.hidden = true;
    try {
      if (window.GameRosters && typeof getSubscriptionUserId === 'function') {
        var data = GameRosters.read(getSubscriptionUserId(), S.index[S.grade].id, SEL.subject), secs = Object.keys(data);
        if (secs.length) {
          var sel = $('rosterSel'); sel.innerHTML = '<option value="">اختر الشعبة</option>' + secs.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
          sel.onchange = function () { if (sel.value) { $('namesBox').value = GameRosters.names(data, sel.value).join('\n'); $('namesBox').oninput(); } };
          rb.hidden = false;
        }
      }
    } catch (e) {}
    chips($('optPoints'), D.points.map(function (p) { return p + ' نقاط'; }), D.points.indexOf(M.points), function (i) { M.points = D.points[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    $('optNoRepeat').checked = !!M.noRepeat; $('optNoRepeat').onchange = function () { M.noRepeat = $('optNoRepeat').checked; saveM(); };
    countNames();
    show('home');
  }

  var G = null, later = [];
  function wait(fn, ms) { later.push(setTimeout(fn, ms)); }
  function clearWait() { later.forEach(clearTimeout); later = []; }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function drawWheel() {
    var g = $('wheelRot'); g.innerHTML = '';
    var n = G.students.length, R = 200, step = 2 * Math.PI / n;
    G.students.forEach(function (st, i) {
      var a0 = -Math.PI / 2 + i * step, a1 = a0 + step;
      var p = 'M0 0 L' + (R * Math.cos(a0)).toFixed(2) + ' ' + (R * Math.sin(a0)).toFixed(2) + ' A' + R + ' ' + R + ' 0 ' + (step > Math.PI ? 1 : 0) + ' 1 ' + (R * Math.cos(a1)).toFixed(2) + ' ' + (R * Math.sin(a1)).toFixed(2) + ' Z';
      var seg = el('g', { class: 'seg' + (st.done ? ' done' : ''), 'data-i': i }, g);
      el('path', { d: p, fill: WCOL[i % WCOL.length] }, seg);
      var am = (a0 + a1) / 2, deg = am * 180 / Math.PI, fs = Math.max(11, Math.min(22, 260 / n + 6));
      var nd = ((deg % 360) + 360) % 360, flip = nd > 90 && nd < 270; // النصف الأيسر: نقلب النص ليُقرأ معتدلًا
      var t = el('text', { x: 0, y: 0, transform: flip ? 'rotate(' + (deg + 180).toFixed(2) + ') translate(' + (-(R - 16)) + ' ' + (fs * 0.36).toFixed(1) + ')' : 'rotate(' + deg.toFixed(2) + ') translate(' + (R - 16) + ' ' + (fs * 0.36).toFixed(1) + ')', 'text-anchor': flip ? 'start' : 'end', 'font-size': fs, class: 'seg-t' }, seg);
      t.textContent = st.name.length > 14 ? st.name.slice(0, 13) + '…' : st.name;
    });
    el('circle', { r: R, class: 'rim' }, g);
  }
  function paintBoard() {
    var list = G.students.slice().sort(function (a, b) { return b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name, 'ar'); });
    $('board').innerHTML = list.map(function (s, k) {
      var medal = s.points > 0 ? (['🥇', '🥈', '🥉'][k] || '') : '';
      return '<li class="' + (G.last === s ? 'last' : '') + '"><span class="m">' + (medal || (k + 1)) + '</span><b>' + esc(s.name) + '</b><em>' + s.points + '</em></li>';
    }).join('');
    $('hRound').textContent = 'الدورة ' + G.round + ' • أسئلة: ' + G.asked;
    $('spinBtn').disabled = G.state !== 'idle';
  }
  function startGame() {
    var names = parseNames($('namesBox').value);
    if (names.length < 2) { countNames(); return; }
    store.set(namesKey(), names);
    window.Sound.unlock(); window.Sound.startMusic();
    closeQuestion(); clearWait();
    G = window.__wh = { qm: new window.QuestionManager(bankOf(), 0), students: names.map(function (n) { return { name: n, points: 0, correct: 0, wrong: 0, turns: 0, done: false }; }), rot: 0, state: 'idle', round: 1, asked: 0, last: null, over: false };
    $('rModal').classList.remove('show'); $('picked').className = 'wh-picked';
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    $('wheelRot').style.transition = 'none'; $('wheelRot').style.transform = 'rotate(0deg)';
    paintTeacher(); show('play'); drawWheel(); paintBoard();
  }
  function spin() {
    if (!G || G.over || G.state !== 'idle') return;
    var pool = G.students.map(function (s, i) { return i; }).filter(function (i) { return !M.noRepeat || !G.students[i].done; });
    if (!pool.length) { G.students.forEach(function (s) { s.done = false; }); G.round++; drawWheel(); pool = G.students.map(function (s, i) { return i; }); }
    var idx = pool[Math.floor(Math.random() * pool.length)], n = G.students.length;
    var center = (idx + 0.5) * 360 / n; // الزاوية من الأعلى باتجاه عقارب الساعة
    var cur = ((G.rot % 360) + 360) % 360, target = ((360 - center) % 360 + 360) % 360;
    var delta = (target - cur + 360) % 360; if (delta < 30) delta += 360;
    G.rot += 360 * 5 + delta; G.state = 'spin'; G.pick = idx; paintBoard();
    $('picked').className = 'wh-picked';
    var w = $('wheelRot'); w.style.transition = 'transform ' + D.spinMs + 'ms cubic-bezier(.15,.85,.25,1)'; w.style.transform = 'rotate(' + G.rot + 'deg)';
    window.Sound.play('jump');
    var ticks = 0, tk = setInterval(function () { if (++ticks > 14) return clearInterval(tk); window.Sound.play('coin'); }, D.spinMs / 18);
    later.push(tk);
    wait(function () { landed(idx); }, D.spinMs + 150);
  }
  function landed(idx) {
    var st = G.students[idx]; G.last = st; st.turns++;
    var pk = $('picked'); pk.innerHTML = '<small>الدور على</small><b>' + esc(st.name) + '</b>'; pk.className = 'wh-picked show';
    window.Sound.play('clear');
    G.state = 'ask'; paintBoard();
    wait(function () {
      G.asked++;
      showQuestion(G.qm, { time: M.time, tag: st.name, color: '#6b3fa0', okText: 'إجابة صحيحة! +' + M.points + ' نقاط لـ' + st.name, badText: 'لا نقاط هذه المرة — سيعود السؤال لاحقًا 💪' }, function (ok) {
        if (!G || G.over) return;
        if (ok === null) { G.asked--; return endSession('empty'); }
        if (M.noRepeat) st.done = true;
        if (ok) { st.points += M.points; st.correct++; $('hero1').classList.add('cheer'); $('hero2').classList.add('cheer'); wait(function () { $('hero1').classList.remove('cheer'); $('hero2').classList.remove('cheer'); }, 1500); }
        else st.wrong++;
        pk.className = 'wh-picked';
        G.state = 'idle'; drawWheel(); paintBoard();
      });
    }, 1300);
  }
  function endSession(why) {
    if (!G || G.over) return;
    if(window.GameSCORM){var correct=G.students.reduce(function(a,s){return a+s.correct;},0),wrong=G.students.reduce(function(a,s){return a+s.wrong;},0);window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}

    G.over = true; closeQuestion(); clearWait(); G.state = 'over';
    var list = G.students.slice().sort(function (a, b) { return b.points - a.points || b.correct - a.correct; });
    var top = list.filter(function (s) { return s.points > 0; }).slice(0, 3);
    $('winArt').innerHTML = '<span class="crown">🏆</span><img src="assets/characters/boy-jump.png" alt=""><img src="assets/characters/girl2-jump.png" alt=""><img src="assets/characters/girl-jump.png" alt="">';
    $('rTitle').textContent = top.length ? 'لوحة الشرف: ' + top.map(function (s) { return s.name; }).join('، ') : 'انتهت الجلسة';
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit + (why === 'empty' ? ' • انتهت أسئلة الدروس المختارة' : '') + ' • ' + G.asked + ' سؤالًا';
    $('rTable').innerHTML = '<div class="vt-row vt-h wh-row"><span>الطالب</span><b>النقاط</b><b>صحيحة</b><b>خاطئة</b></div>' + list.map(function (s, k) {
      return '<div class="vt-row wh-row"><span>' + (['🥇', '🥈', '🥉'][k] && s.points ? ['🥇', '🥈', '🥉'][k] + ' ' : '') + esc(s.name) + '</span><b>' + s.points + '</b><b>' + s.correct + '</b><b>' + s.wrong + '</b></div>';
    }).join('');
    resultsActions(startGame, openHome);
    paintTeacher(); window.Sound.play('clear');
    $('rModal').classList.add('show');
  }
  function exitGame() { if (!G) return; G.over = true; closeQuestion(); clearWait(); window.Sound.stopMusic(); openHome(); }
  function bind() {
    bindCommon();
    $('startGame').onclick = startGame;
    $('exitBtn').onclick = exitGame;
    $('spinBtn').onclick = spin;
    $('endBtn').onclick = function () { endSession('end'); };
    window.addEventListener('keydown', function (e) { if (e.code === 'Space' && G && G.state === 'idle' && $('play').classList.contains('active') && !Q) { e.preventDefault(); spin(); } });
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
    if(window.GamePublish?.configure)window.GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'wheel',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
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
