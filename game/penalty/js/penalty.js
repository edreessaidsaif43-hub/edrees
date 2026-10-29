/* «ركلات الترجيح»: فريقان؛ كل إجابة صحيحة تفتح ركلة جزاء أمام حارس الخصم.
   يستخدم نفس اختيار (الصف ← المادة ← الفصل ← الوحدة ← الدروس) ونفس بنك الأسئلة ومدير الأسئلة. */
(function () {
  var cfg = window.GAME_CONFIG, D = cfg.penalty;
  var $ = function (id) { return document.getElementById(id); };
  var LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var S = { index: null, grade: null, gradeData: null, subj: null, sem: null, unit: null, lessons: [], teacher: { name: '', ig: '' } };
  var gradeCache = {};
  function show(id) { ['setup', 'home', 'play'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); }

  /* ---------- البيانات (ملفات JS تعمل دون خادم) ---------- */
  window.__BANK = window.__BANK || {};
  function loadScriptData(name) {
    if (window.__BANK[name]) return Promise.resolve(window.__BANK[name]);
    return new Promise(function (res, rej) {
      var sc = document.createElement('script'); sc.src = cfg.dataPath + name + '.js';
      sc.onload = function () { window.__BANK[name] ? res(window.__BANK[name]) : rej(new Error('no data')); };
      sc.onerror = function () { rej(new Error('تعذّر تحميل ' + name)); };
      document.head.appendChild(sc);
    });
  }
  function loadGrade(id) {
    if (gradeCache[id]) return Promise.resolve(gradeCache[id]);
    return loadScriptData('grades/' + id).then(function (d) { d=d.filter(function(s){return window.gameLibraryAllows(id,s.n);});gradeCache[id] = d; return d; });
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
      loadGrade(S.index[i].id).then(function (d) { S.gradeData = d; renderSetup(); });
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
    $('buildBtn').disabled = $('linkBtn').disabled = !ready;
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

  /* ---------- الفريقان ---------- */
  var SEL = null;
  var COLORS = ['#16a3a0', '#ff7a1a'];
  var DEF_NAMES = ['فريق الصقور', 'فريق النمور'];
  var CHAR_N = { girl: 'طالبة', girl2: 'طالبة (عنابي)', boy: 'طالب' };
  var M = store.get('penalty-settings:'+getSubscriptionUserId(), null) || { names: ['', ''], chars: ['boy', 'girl2'], kicks: D.defaultKicks, time: D.defaultTime };
  if (D.kicks.indexOf(M.kicks) < 0) M.kicks = D.defaultKicks;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  function saveM() { store.set('penalty-settings:'+getSubscriptionUserId(), M); }
  function tname(i) { return M.names[i] || DEF_NAMES[i]; }
  function bankOf() {
    var qs = [];
    SEL.lessons.forEach(function (L) { L.qs.forEach(function (q) { var c = Object.assign({}, q); c.ref = (q.ref || '') + ' – ' + L.n; qs.push(c); }); });
    return { n: SEL.unit, qs: qs };
  }
  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    chips($('optKicks'), D.kicks.map(function (k) { return k + ' ركلات'; }), D.kicks.indexOf(M.kicks), function (i) { M.kicks = D.kicks[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    var box = $('teamsSetup'); box.innerHTML = '';
    [0, 1].forEach(function (i) {
      if (i === 1) { var vs = document.createElement('div'); vs.className = 'vs'; vs.textContent = 'ضد'; box.appendChild(vs); }
      var card = document.createElement('div'); card.className = 'tcard'; card.style.setProperty('--tc', COLORS[i]);
      card.innerHTML = '<span class="tdot"></span><label class="pname">اسم الفريق<input id="tn' + i + '" type="text" maxlength="18" placeholder="' + DEF_NAMES[i] + '"></label><span class="pick-lbl">اختر اللاعب</span><div class="pchars"></div>';
      var inp = card.querySelector('input'); inp.value = M.names[i]; inp.oninput = function () { M.names[i] = inp.value.trim(); saveM(); };
      var pc = card.querySelector('.pchars');
      ['girl', 'girl2', 'boy'].forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'pchar' + (M.chars[i] === k ? ' on' : ''); b.setAttribute('aria-pressed', String(M.chars[i] === k));
        b.innerHTML = '<img src="assets/characters/' + k + '-walk.png" alt=""><span>' + CHAR_N[k] + '</span>';
        b.onclick = function () { M.chars[i] = k; saveM(); openHome(); };
        pc.appendChild(b);
      });
      box.appendChild(card);
    });
    show('home');
  }

  /* ---------- المباراة ---------- */
  // المناطق الست: row 0 أعلى، row 1 أسفل؛ col 0 يسار المرمى، 2 يمينه. الترقيم يبدأ من أعلى اليمين.
  var ZONES = [];
  for (var r = 0; r < 2; r++) for (var c = 0; c < 3; c++) ZONES.push({ row: r, col: c, label: r * 3 + (2 - c) + 1 });
  var ZNAME = { '0,0': 'أعلى اليسار', '0,1': 'أعلى المنتصف', '0,2': 'أعلى اليمين', '1,0': 'أسفل اليسار', '1,1': 'أسفل المنتصف', '1,2': 'أسفل اليمين' };
  var G = null, timerT = null, T = [];
  function later(fn, ms) { var id = setTimeout(fn, ms); T.push(id); return id; }
  function clearLater() { T.forEach(clearTimeout); T = []; }

  function buildZones() {
    var z = $('zones'); z.innerHTML = '';
    ZONES.forEach(function (Z, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'zone'; b.dataset.z = i;
      b.style.gridRow = Z.row + 1; b.style.gridColumn = Z.col + 1;
      b.setAttribute('aria-label', 'سدّد إلى ' + ZNAME[Z.row + ',' + Z.col]);
      b.innerHTML = '<span>' + Z.label + '</span>';
      b.onclick = function () { shoot(i); };
      z.appendChild(b);
    });
  }
  function startGame() {
    window.Sound.unlock(); window.Sound.startMusic();
    clearInterval(timerT); clearLater();
    var teams = [0, 1].map(function (i) { return { name: tname(i), color: COLORS[i], char: M.chars[i] || 'boy', kicks: [], goals: 0, correct: 0, wrong: 0, saves: 0, power: 0 }; });
    G = window.__pk = { qm: new window.QuestionManager(bankOf(), 0), teams: teams, n: M.kicks, turn: 0, state: 'idle', sudden: false, cur: null, chosen: null, askedAt: 0, fast: false, last: null };
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    ['qModal', 'rModal'].forEach(function (id) { $(id).classList.remove('show'); });
    $('fx').innerHTML = ''; $('banner').className = 'pk-banner';
    paintTeacher(); show('play');
    resetScene(); paint();
  }
  function marks(t) {
    var total = Math.max(G.n, t.kicks.length + (G.sudden ? 1 : 0));
    if (G.sudden) total = Math.max(total, Math.max(G.teams[0].kicks.length, G.teams[1].kicks.length) + 1);
    var h = '';
    for (var i = 0; i < total; i++) {
      var k = t.kicks[i];
      var cls = k === 'goal' ? 'm goal' : k === 'saved' ? 'm saved' : k === 'miss' ? 'm miss' : 'm';
      var ic = k === 'goal' ? '⚽' : k === 'saved' ? '🧤' : k === 'miss' ? '✗' : '';
      var tip = k === 'goal' ? 'هدف' : k === 'saved' ? 'تصدّى الحارس' : k === 'miss' ? 'ركلة ضائعة' : 'لم تُسدَّد';
      if (i === G.n) h += '<i class="sd-sep" title="ركلات حاسمة">|</i>';
      h += '<span class="' + cls + '" title="' + tip + '">' + ic + '</span>';
    }
    return h;
  }
  function paint() {
    G.teams.forEach(function (t, i) {
      var row = $('sb' + i); row.style.setProperty('--tc', t.color);
      row.classList.toggle('myturn', i === G.turn && G.state !== 'over');
      $('sbn' + i).textContent = t.name;
      $('sbm' + i).innerHTML = marks(t);
      $('sbg' + i).textContent = t.goals;
    });
    var t = G.teams[G.turn];
    $('hRound').textContent = G.sudden ? 'ركلات حاسمة' : 'الركلة ' + Math.min(G.n, t.kicks.length + 1) + ' من ' + G.n;
    var tag = $('turnTag'); tag.style.background = t.color;
    tag.textContent = G.state === 'over' ? 'انتهت المباراة' : 'دور ' + t.name + ' في التسديد';
    $('askBtn').disabled = G.state !== 'idle';
    $('askBtn').hidden = G.state === 'aim';
    $('hint').textContent = G.state === 'aim' ? 'اختر زاوية التسديد داخل المرمى (أو الأرقام 1–6)' + (G.fast ? ' — ⚡ تسديدة قوية' : '') : 'اضغط «اعرض السؤال» أو مفتاح المسافة.';
    $('pitch').classList.toggle('aiming', G.state === 'aim');
  }
  function resetScene() {
    var t = G.teams[G.turn], o = G.teams[1 - G.turn];
    var kk = $('kicker'), kp = $('keeper'), ball = $('ball');
    [kk, kp, ball].forEach(function (el) { el.style.transition = 'none'; el.style.transform = ''; });
    kk.className = 'kicker'; kp.className = 'keeper'; ball.className = 'ball';
    kk.src = 'assets/characters/' + t.char + '-side.png';
    kp.src = KP + 'ready.png'; kp.style.height = ''; $('ball').style.opacity = '';
    kk.style.setProperty('--tc', t.color); kp.style.setProperty('--tc', o.color);
    $('keeperTag').textContent = 'حارس ' + o.name; $('keeperTag').style.background = o.color;
    $('goal').classList.remove('ripple');
    void kk.offsetWidth;
    [kk, kp, ball].forEach(function (el) { el.style.transition = ''; });
  }

  /* ---------- السؤال ---------- */
  function ask() {
    if (!G || G.state !== 'idle') return;
    var cur = null;
    for (var t = 0; t < 10 && !cur; t++) cur = G.qm.next();
    if (!cur) return finish(-1, 'empty');
    G.cur = cur; G.chosen = null; G.state = 'ask'; G.askedAt = performance.now(); G.fast = false;
    var it = cur.item, team = G.teams[G.turn];
    $('qTeam').textContent = team.name; $('qTeam').style.background = team.color;
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
      b.onclick = function () { if (G.state !== 'ask') return; G.chosen = orig; box.querySelectorAll('.opt').forEach(function (x) { x.classList.toggle('sel', x === b); }); conf.disabled = false; };
      box.appendChild(b);
    });
    $('timer').hidden = !M.time;
    if (M.time) runTimer(M.time, function () { if (G.state === 'ask') resolve(false, 'time'); });
    $('qModal').classList.add('show');
    window.Sound.play('question');
    paint();
  }
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
  function confirmAnswer() {
    if (!G || G.state !== 'ask' || G.chosen === null) return;
    resolve(window.__decodeAnswer(G.cur.item._raw) === G.chosen, 'answer');
  }
  function resolve(ok, why) {
    G.state = 'resolved'; clearInterval(timerT);
    var it = G.cur.item, right = window.__decodeAnswer(it._raw), team = G.teams[G.turn];
    var secs = (performance.now() - G.askedAt) / 1000;
    G.qm.answer(ok ? right : (right + 1) % (it.type === 'mc' ? it.options.length : 2));
    $('qConfirm').disabled = true; $('qConfirm').style.visibility = 'hidden';
    $('qOpts').querySelectorAll('.opt').forEach(function (b) { b.disabled = true; });
    var fb = $('qFeedback');
    if (ok) {
      team.correct++;
      G.fast = !!(M.time && secs <= M.time / 2);
      if (G.fast) team.power++;
      $('qOpts').querySelector('.opt.sel').classList.add('good');
      fb.textContent = 'إجابة صحيحة! اختر زاوية التسديد' + (G.fast ? ' — ⚡ تسديدة قوية لسرعة إجابتكم' : '');
      fb.className = 'qfeedback ok';
      window.Sound.play('correct');
      later(function () { $('qModal').classList.remove('show'); G.state = 'aim'; paint(); }, 1300);
    } else {
      team.wrong++;
      var sel = $('qOpts').querySelector('.opt.sel'); if (sel) sel.classList.remove('sel');
      fb.textContent = (why === 'time' ? 'انتهى الوقت. ' : '') + 'ضاعت الركلة هذه المرة — حاولوا عندما يظهر السؤال لاحقًا 💪'; fb.className = 'qfeedback bad';
      $('qCard').classList.remove('shake'); void $('qCard').offsetWidth; $('qCard').classList.add('shake');
      window.Sound.play('wrong');
      later(function () { $('qModal').classList.remove('show'); missKick(); }, 1800);
    }
  }

  /* ---------- التسديد ---------- */
  function rel(el) { var p = $('pitch').getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - p.left + r.width / 2, y: r.top - p.top + r.height / 2, w: r.width, h: r.height }; }
  function runUp(then) {
    var kk = $('kicker'), b = rel($('ball')), k = rel(kk);
    kk.classList.add('run');
    kk.style.transform = 'translateX(' + Math.max(0, b.x - b.w * 0.7 - (k.x + k.w / 2)) + 'px)';
    later(function () { kk.classList.add('strike'); window.Sound.play('stomp'); then(); }, 480);
  }
  function flyTo(x, y, sc, spin) {
    var ball = $('ball'), b = rel(ball);
    ball.style.transform = 'translate(' + (x - b.x) + 'px,' + (y - b.y) + 'px) scale(' + sc + ') rotate(' + spin + 'deg)';
  }
  // حارس المرمى ثابت (ليس من شخصيات الاختيار): وقفة الاستعداد + قفزة يسار/يمين (مع الكرة عند التصدي وبدونها عند الهدف)
  var KP = 'assets/keeper/', DIVE_AR = { L: 485 / 303, R: 468 / 311 }, DIVE_H = 0.82;
  function dive(col, row) {
    var kp = $('keeper'), g = $('goal').getBoundingClientRect(), gw = g.width, gh = g.height;
    kp.classList.add('diving');
    if (col === 1) {
      kp.style.transform = row === 0 ? 'translateX(-50%) translateY(' + (-gh * 0.26) + 'px)' : 'translateX(-50%) scaleY(.84)';
      return;
    }
    var side = col === 0 ? 'L' : 'R', h = gh * DIVE_H, w = h * DIVE_AR[side];
    kp.src = KP + 'dive' + side + '-noball.png';
    kp.style.height = (DIVE_H * 100) + '%';
    var cx = col === 0 ? w / 2 - gw * 0.03 : gw - w / 2 + gw * 0.03;
    var dy = row === 0 ? -gh * (1 - DIVE_H) - gh * 0.04 : gh * 0.1;
    var rot = row === 0 ? 0 : (col === 0 ? -16 : 16);
    kp.style.transform = 'translateX(-50%) translate(' + (cx - gw / 2) + 'px,' + dy + 'px) rotate(' + rot + 'deg)';
  }
  function shoot(zi) {
    if (!G || G.state !== 'aim') return;
    G.state = 'shoot'; paint();
    var Z = ZONES[zi], zb = rel($('zones').children[zi]);
    var kc = Math.floor(Math.random() * 3), kr = Math.floor(Math.random() * 2);
    var saved = G.fast ? (kc === Z.col && kr === Z.row) : kc === Z.col;
    G.last = { zone: zi, keeper: [kc, kr], saved: saved, fast: G.fast };
    runUp(function () {
      $('ball').classList.add('fly'); if (G.fast) $('ball').classList.add('power');
      flyTo(zb.x + (Math.random() - 0.5) * zb.w * 0.3, zb.y + (Math.random() - 0.5) * zb.h * 0.3, 0.5, 720);
      later(function () { dive(kc, kr); }, 60);
      later(function () {
        if (saved) {
          window.Sound.play('hurt');
          if (Z.col !== 1) { $('keeper').src = KP + 'dive' + (Z.col === 0 ? 'L' : 'R') + '.png'; $('ball').style.opacity = '0'; }
          else { var side = Math.random() < 0.5 ? -1 : 1; $('ball').classList.add('deflect'); flyTo(zb.x + side * zb.w * 1.6, zb.y + zb.h * 2.4, 0.62, 1080); }
          G.teams[1 - G.turn].saves++;
          banner('تصدّى الحارس! 🧤', G.teams[1 - G.turn].color);
          record('saved');
        } else {
          $('goal').classList.add('ripple');
          window.Sound.play('clear');
          var kk = $('kicker'); kk.src = 'assets/characters/' + G.teams[G.turn].char + '-jump.png'; kk.classList.add('celebrate');
          banner('هدف! ⚽', G.teams[G.turn].color);
          confetti(G.teams[G.turn].color);
          G.teams[G.turn].goals++;
          record('goal');
        }
      }, 620);
    });
  }
  function missKick() {
    G.state = 'shoot'; paint();
    var g = rel($('goal')), side = Math.random() < 0.5 ? -1 : 1;
    G.last = { zone: -1, saved: false, miss: true };
    runUp(function () {
      $('ball').classList.add('fly');
      flyTo(g.x + side * g.w * 0.62, g.y - g.h * 0.9, 0.42, 900);
      later(function () { window.Sound.play('hurt'); banner('ركلة ضائعة ✗', '#6b7591'); record('miss'); }, 620);
    });
  }
  function banner(txt, color) {
    var b = $('banner'); b.textContent = txt; b.style.setProperty('--bc', color);
    b.className = 'pk-banner'; void b.offsetWidth; b.className = 'pk-banner show';
  }
  function confetti(color) {
    var fx = $('fx'), cols = [color, '#ffd23f', '#ffffff', '#e53950', '#5ec2ff'];
    for (var i = 0; i < 36; i++) {
      var c = document.createElement('i'); c.className = 'conf';
      c.style.left = (10 + Math.random() * 80) + '%'; c.style.background = cols[i % cols.length];
      c.style.animationDelay = (Math.random() * 0.4) + 's'; c.style.setProperty('--dx', ((Math.random() - 0.5) * 160) + 'px');
      fx.appendChild(c);
    }
    later(function () { fx.innerHTML = ''; }, 2400);
  }
  function record(res) {
    G.teams[G.turn].kicks.push(res);
    paint();
    later(afterKick, 1700);
  }
  function afterKick() {
    var a = G.teams[0], b = G.teams[1], N = G.n;
    if (!G.sudden) {
      var remA = N - a.kicks.length, remB = N - b.kicks.length;
      if (remA === 0 && remB === 0) {
        if (a.goals !== b.goals) return finish(a.goals > b.goals ? 0 : 1, 'reg');
        G.sudden = true;
        G.turn = 0; G.state = 'idle'; resetScene(); paint();
        banner('تعادل! ركلات حاسمة 🔥', '#e53950');
        return;
      }
      if (a.goals > b.goals + remB) return finish(0, 'early');
      if (b.goals > a.goals + remA) return finish(1, 'early');
    } else if (a.kicks.length === b.kicks.length && a.goals !== b.goals) {
      return finish(a.goals > b.goals ? 0 : 1, 'sudden');
    }
    G.turn = 1 - G.turn; G.state = 'idle';
    resetScene(); paint();
  }

  /* ---------- النهاية ---------- */
  function finish(w, why) {
    clearInterval(timerT); G.state = 'over';
    var T2 = G.teams;
    if (w < 0) w = T2[0].goals === T2[1].goals ? -1 : (T2[0].goals > T2[1].goals ? 0 : 1);
    $('winArt').innerHTML = w >= 0 ? '<span class="crown">🏆</span><img src="assets/characters/' + T2[w].char + '-jump.png" alt="">'
      : '<img src="assets/characters/' + T2[0].char + '-jump.png" alt=""><img src="assets/characters/' + T2[1].char + '-jump.png" alt="">';
    $('rTitle').textContent = w < 0 ? 'تعادل! مباراة متكافئة' : 'الفوز لـ' + T2[w].name + '!';
    var how = why === 'early' ? 'حُسمت قبل نهاية الركلات' : why === 'sudden' ? 'حُسمت بالركلات الحاسمة' : why === 'empty' ? 'انتهت أسئلة الدروس المختارة' : 'بعد ' + G.n + ' ركلات لكل فريق';
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit + ' • ' + how;
    var rows = [['الأهداف', T2[0].goals, T2[1].goals], ['الركلات المسددة', T2[0].kicks.length, T2[1].kicks.length], ['إجابات صحيحة', T2[0].correct, T2[1].correct], ['إجابات خاطئة', T2[0].wrong, T2[1].wrong], ['تسديدات قوية ⚡', T2[0].power, T2[1].power], ['تصدّيات الحارس 🧤', T2[0].saves, T2[1].saves]];
    $('rTable').innerHTML = '<div class="vt-row vt-h"><span></span><b style="color:' + T2[0].color + '">' + esc(T2[0].name) + '</b><b style="color:' + T2[1].color + '">' + esc(T2[1].name) + '</b></div>' +
      rows.map(function (r) { return '<div class="vt-row' + (r[0] === 'الأهداف' ? ' vt-big' : '') + '"><span>' + r[0] + '</span><b>' + r[1] + '</b><b>' + r[2] + '</b></div>'; }).join('');
    var ra = $('rActions'); ra.innerHTML = '';
    [['مباراة جديدة ↻', 'primary', startGame], ['تعديل الفريقين', 'ghost', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); openHome(); }], ['تغيير الدروس', 'teal', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); show('setup'); renderSetup(); }]]
      .forEach(function (a) { var b = document.createElement('button'); b.className = 'btn big ' + a[1]; b.textContent = a[0]; b.onclick = a[2]; ra.appendChild(b); });
    paintTeacher(); paint();
    window.Sound.play('clear');
    later(function () { $('rModal').classList.add('show'); }, 500);
  }
  function exitGame() { if (!G) return; clearInterval(timerT); clearLater(); G.state = 'over'; window.Sound.stopMusic(); $('qModal').classList.remove('show'); openHome(); }

  /* ---------- التحكم ---------- */
  function bind() {
    buildZones();
    ['ready', 'diveL', 'diveR', 'diveL-noball', 'diveR-noball'].forEach(function (n) { var im = new Image(); im.src = KP + n + '.png'; });
    $('askBtn').onclick = ask;
    $('qConfirm').onclick = confirmAnswer;
    $('exitBtn').onclick = exitGame;
    $('startGame').onclick = startGame;
    $('backSetup').onclick = function () { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} show('setup'); renderSetup(); };
    window.addEventListener('keydown', function (e) {
      if (!$('play').classList.contains('active') || !G) return;
      if (e.code === 'Space' && G.state === 'idle') { e.preventDefault(); ask(); return; }
      var d = /^(Digit|Numpad)([1-6])$/.exec(e.code);
      if (G.state === 'ask') {
        if (d && +d[2] <= 4) { var b = $('qOpts').querySelector('.opt[data-pos="' + (d[2] - 1) + '"]'); if (b) b.click(); }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); confirmAnswer(); }
      } else if (G.state === 'aim' && d) {
        var zi = ZONES.findIndex(function (Z) { return Z.label === +d[2]; }); if (zi >= 0) shoot(zi);
      }
    });
    document.querySelectorAll('.sound-btn').forEach(function (b) {
      b.onclick = function () { window.Sound.unlock(); window.Sound.toggle(); paintSound(); if (!window.Sound.isMuted() && $('play').classList.contains('active')) window.Sound.startMusic(); };
    });
    paintSound();
  }
  function paintSound() { var m = window.Sound.isMuted(); document.querySelectorAll('.sound-btn').forEach(function (b) { b.textContent = m ? '🔇' : '🔊'; }); }

  async function boot() {
    if (!(await window.GameLibraryAccess)) return;
    bind();
    var t = store.get('edu-teacher', null);
    S.teacher = t || { name: cfg.teacherName || '', ig: cfg.teacherInstagram || '' };
    $('tName').value = S.teacher.name; $('tIg').value = S.teacher.ig;
    $('tName').oninput = $('tIg').oninput = readTeacher;
    $('buildBtn').onclick = function () { readTeacher(); try { history.replaceState(null, '', hashFor()); } catch (e) {} openHome(); };
    $('linkBtn').onclick = function () {
      readTeacher();
      var url = location.href.split('#')[0] + hashFor();
      var done = function () { $('setupNote').textContent = 'تم نسخ الرابط ✓'; };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { $('setupNote').textContent = url; }); else $('setupNote').textContent = url;
    };
    $('selAll').onclick = function () { var gd = gradeCache[S.index[S.grade].id]; S.lessons = gd[S.subj].s[S.sem].u[S.unit].l.map(function (_, k) { return k; }); renderSetup(); };
    $('selNone').onclick = function () { S.lessons = []; renderSetup(); };
    loadScriptData('index').then(function (idx) {
      S.index = idx;
      var h = new URLSearchParams(location.hash.slice(1));
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
    window.__penaltyStart = startGame;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
