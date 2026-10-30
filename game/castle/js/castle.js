/* «بناء القلعة»: كل إجابة صحيحة تضيف حجرًا إلى قلعة نزوى أو بهلاء حتى تكتمل.
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

  /* ---------- بناء القلعة ---------- */
  // أشكال القلاع (viewBox 800×500، الأرض عند y=470). كل شكل مضلّع؛ البوابة فتحة لا تُبنى.
  var FORTS = {
    nizwa: {
      name: 'قلعة نزوى',
      fact: 'قلعة نزوى بُنيت في القرن السابع عشر الميلادي في عهد الإمام سلطان بن سيف اليعربي، ويشتهر برجها الدائري الضخم.',
      shapes: [
        [[70, 470], [730, 470], [730, 352], [70, 352]],                       // السور السفلي
        [[262, 352], [538, 352], [524, 150], [276, 150]],                      // البرج الدائري
        [[70, 352], [150, 352], [150, 292], [70, 292]],                        // برج يمين صغير
        [[650, 352], [730, 352], [730, 292], [650, 292]],                      // برج يسار صغير
        [[300, 150], [500, 150], [490, 116], [310, 116]]                       // أعلى البرج
      ],
      holes: [[[372, 470], [428, 470], [428, 408], [400, 392], [372, 408]]],
      crenel: [[70, 352, 730], [262, 150, 538], [310, 116, 490], [70, 292, 150], [650, 292, 730]],
      flag: [400, 116]
    },
    bahla: {
      name: 'قلعة بهلاء',
      fact: 'قلعة بهلاء من أقدم القلاع في عُمان، وأُدرجت في قائمة التراث العالمي لليونسكو عام 1987م.',
      shapes: [
        [[40, 470], [760, 470], [760, 380], [40, 380]],                        // السور الطويل
        [[40, 380], [112, 380], [112, 300], [40, 300]],                        // برج طرفي
        [[688, 380], [760, 380], [760, 300], [688, 300]],                      // برج طرفي
        [[220, 380], [292, 380], [292, 320], [220, 320]],                      // برج أوسط
        [[370, 380], [570, 380], [570, 214], [370, 214]],                      // المبنى الرئيسي
        [[420, 214], [520, 214], [520, 160], [420, 160]],                      // البرج العالي
        [[600, 380], [652, 380], [652, 336], [600, 336]]
      ],
      holes: [[[452, 470], [508, 470], [508, 412], [480, 394], [452, 412]]],
      crenel: [[40, 380, 760], [40, 300, 112], [688, 300, 760], [220, 320, 292], [370, 214, 570], [420, 160, 520], [600, 336, 652]],
      flag: [470, 160]
    }
  };
  function inside(pt, poly) {
    var x = pt[0], y = pt[1], c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  function bricksOf(F) {
    var out = [], BW = 40, BH = 20;
    for (var y = 470 - BH, row = 0; y >= 90; y -= BH, row++) {
      for (var x = (row % 2 ? -BW / 2 : 0); x < 800; x += BW) {
        var cx = x + BW / 2, cy = y + BH / 2;
        if (!F.shapes.some(function (s) { return inside([cx, cy], s); })) continue;
        if (F.holes.some(function (h) { return inside([cx, cy], h); })) continue;
        out.push({ x: x, y: y, w: BW, h: BH });
      }
    }
    F.crenel.forEach(function (c) { for (var x = c[0]; x + 16 <= c[2]; x += 32) out.push({ x: x, y: c[1] - 18, w: 16, h: 18, top: true }); });
    // الترتيب: من الأسفل إلى الأعلى
    out.sort(function (a, b) { return (b.y + b.h) - (a.y + a.h) || a.x - b.x; });
    return out;
  }
  var M = store.get('castle-settings:'+getSubscriptionUserId(), null) || { fort: 'nizwa', char: 'girl', stones: D.defaultStones, time: D.defaultTime };
  if (!FORTS[M.fort]) M.fort = 'nizwa';
  if (D.stones.indexOf(M.stones) < 0) M.stones = D.defaultStones;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  function saveM() { store.set('castle-settings:'+getSubscriptionUserId(), M); }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function preview(key) {
    var F = FORTS[key], s = '<svg viewBox="0 0 800 500" aria-hidden="true">';
    F.shapes.forEach(function (p) { s += '<polygon points="' + p.map(function (q) { return q.join(','); }).join(' ') + '" fill="#e2c294" stroke="#9c6b3a" stroke-width="6"/>'; });
    F.holes.forEach(function (p) { s += '<polygon points="' + p.map(function (q) { return q.join(','); }).join(' ') + '" fill="#6e4422"/>'; });
    return s + '</svg>';
  }
  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    var box = $('fortPick'); box.innerHTML = '';
    Object.keys(FORTS).forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cs-fort' + (M.fort === k ? ' on' : ''); b.setAttribute('aria-pressed', String(M.fort === k));
      b.innerHTML = preview(k) + '<b>' + FORTS[k].name + '</b>';
      b.onclick = function () { M.fort = k; saveM(); openHome(); };
      box.appendChild(b);
    });
    charPicker($('charPick'), M.char, function (k) { M.char = k; saveM(); openHome(); });
    chips($('optStones'), D.stones.map(function (n) { return n + ' أحجار'; }), D.stones.indexOf(M.stones), function (i) { M.stones = D.stones[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    window.GameRosters?.picker(S.index[S.grade].id,SEL.subject,[],{onChange:openHome});
    show('home');
  }

  var G = null, later = [];
  function wait(fn, ms) { later.push(setTimeout(fn, ms)); }
  function clearWait() { later.forEach(clearTimeout); later = []; }
  var SAND = ['#e2c294', '#d8b27c', '#cfa36a', '#e8cba0', '#d4ab74'];
  function drawFort() {
    var svg = $('fort'); svg.innerHTML = '';
    var F = FORTS[M.fort];
    var ghost = el('g', { class: 'ghost' }, svg);
    F.shapes.forEach(function (p) { el('polygon', { points: p.map(function (q) { return q.join(','); }).join(' ') }, ghost); });
    el('rect', { x: 0, y: 470, width: 800, height: 30, class: 'ground' }, svg);
    var bricks = el('g', { id: 'bricks' }, svg);
    G.bricks.forEach(function (b, i) {
      var r = el('rect', { x: b.x + 1, y: b.y + 1, width: b.w - 2, height: b.h - 2, rx: 3, fill: SAND[(i * 7) % SAND.length], class: 'brick' }, bricks);
      b.el = r;
    });
    F.holes.forEach(function (p) { el('polygon', { points: p.map(function (q) { return q.join(','); }).join(' '), class: 'gate' }, svg); });
    var fl = el('g', { id: 'flag', class: 'flag', transform: 'translate(' + F.flag[0] + ',' + F.flag[1] + ')' }, svg);
    el('rect', { x: -3, y: -90, width: 6, height: 90, fill: '#6b4a2a' }, fl);
    el('path', { d: 'M3 -88 L70 -72 L3 -54 Z', fill: '#e53950' }, fl);
    el('path', { d: 'M3 -70 L44 -62 L3 -54 Z', fill: '#16a3a0' }, fl);
  }
  function chunk(i) { var B = G.bricks.length, n = M.stones; return G.bricks.slice(Math.floor(i * B / n), Math.floor((i + 1) * B / n)); }
  function paint() {
    var pct = Math.round(G.placed / M.stones * 100);
    $('hBar').style.width = pct + '%'; $('hPct').textContent = pct + '%';
    $('hCount').textContent = G.placed + ' / ' + M.stones + ' أحجار';
    $('askBtn').disabled = G.state !== 'idle';
  }
  function startGame() {
    window.Sound.unlock(); window.Sound.startMusic();
    closeQuestion(); clearWait();
    var F = FORTS[M.fort];
    G = window.__cs = { qm: new window.QuestionManager(bankOf(), 0), bricks: bricksOf(F), placed: 0, correct: 0, wrong: 0, state: 'idle', over: false };
    $('rModal').classList.remove('show');
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName; $('hFort').textContent = F.name;
    $('builder').src = 'assets/characters/' + M.char + '-walk.png'; $('builder').className = 'cs-builder';
    $('stage').classList.remove('done');
    paintTeacher(); show('play'); drawFort(); paint();
    wait(ask, 700);
  }
  function ask() {
    if (!G || G.over || G.state !== 'idle') return;
    G.state = 'ask'; paint();
    showQuestion(G.qm, { time: M.time, tag: 'الحجر ' + (G.placed + 1), color: '#c4802f', okText: 'إجابة صحيحة! حجر جديد 🧱', badText: 'سقط الحجر هذه المرة — سيعود السؤال لاحقًا 💪' }, function (ok) {
      if (!G || G.over) return;
      if (ok === null) return finish('empty');
      if (ok) place(); else drop();
    });
  }
  function place() {
    G.correct++; G.state = 'anim';
    var group = chunk(G.placed); G.placed++;
    var bd = $('builder'); bd.src = 'assets/characters/' + M.char + '-jump.png'; bd.classList.add('cheer');
    group.forEach(function (b, k) { setTimeout(function () { b.el.classList.add('on'); }, k * 35); });
    window.Sound.play('stomp');
    wait(function () { window.Sound.play('coin'); }, 200);
    paint();
    var dur = group.length * 35 + 600;
    wait(function () {
      bd.src = 'assets/characters/' + M.char + '-walk.png'; bd.classList.remove('cheer');
      if (G.placed >= M.stones) return finish('done');
      G.state = 'idle'; paint();
    }, dur);
  }
  function drop() {
    G.wrong++; G.state = 'anim';
    var fx = $('fx'), s = document.createElement('i'); s.className = 'falling-stone'; fx.appendChild(s);
    window.Sound.play('hurt');
    wait(function () { s.remove(); G.state = 'idle'; paint(); }, 1300);
  }
  function finish(why) {
    if (!G || G.over) return;
    if(window.GameSCORM){var correct=G.correct||0,wrong=G.wrong||0;window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}

    G.over = true; closeQuestion(); clearWait(); G.state = 'over'; paint();
    var F = FORTS[M.fort];
    if (why === 'done') { $('stage').classList.add('done'); window.Sound.play('clear'); fireworks(); }
    else window.Sound.play('clear');
    $('builder').src = 'assets/characters/' + M.char + '-jump.png';
    $('winArt').innerHTML = (why === 'done' ? '<span class="crown">🏰</span>' : '') + '<img src="assets/characters/' + M.char + '-jump.png" alt="">';
    $('rTitle').textContent = why === 'done' ? 'اكتملت ' + F.name + '! أحسنتم 🎉' : 'انتهت الأسئلة — اكتمل ' + Math.round(G.placed / M.stones * 100) + '% من ' + F.name;
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit;
    var rows = [['الأحجار المبنية', G.placed + ' / ' + M.stones], ['إجابات صحيحة', G.correct], ['إجابات خاطئة', G.wrong], ['نسبة الإنجاز', Math.round(G.placed / M.stones * 100) + '%']];
    $('rTable').innerHTML = rows.map(function (r) { return '<div class="vt-row pl-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') + '<p class="cs-fact">🏰 ' + F.fact + '</p>';
    resultsActions(startGame, openHome);
    paintTeacher();
    wait(function () { $('rModal').classList.add('show'); }, why === 'done' ? 2200 : 400);
  }
  function fireworks() {
    var fx = $('fx'), cols = ['#ffd23f', '#e53950', '#16a3a0', '#ffffff', '#ff7a1a'];
    for (var k = 0; k < 5; k++) for (var i = 0; i < 14; i++) {
      var p = document.createElement('i'); p.className = 'spark';
      var a = i / 14 * Math.PI * 2, r = 70 + Math.random() * 50;
      p.style.left = (15 + k * 17) + '%'; p.style.top = (12 + (k % 2) * 14) + '%'; p.style.background = cols[(i + k) % cols.length];
      p.style.setProperty('--dx', Math.cos(a) * r + 'px'); p.style.setProperty('--dy', Math.sin(a) * r + 'px'); p.style.animationDelay = (k * 0.25) + 's';
      fx.appendChild(p);
    }
    setTimeout(function () { fx.innerHTML = ''; }, 3500);
  }
  function exitGame() { if (!G) return; G.over = true; closeQuestion(); clearWait(); window.Sound.stopMusic(); openHome(); }
  function bind() {
    bindCommon();
    $('startGame').onclick = startGame;
    $('exitBtn').onclick = exitGame;
    $('askBtn').onclick = ask;
    window.addEventListener('keydown', function (e) { if (e.code === 'Space' && G && G.state === 'idle' && $('play').classList.contains('active') && !Q) { e.preventDefault(); ask(); } });
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
    if(window.GamePublish?.configure)window.GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'castle',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
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
