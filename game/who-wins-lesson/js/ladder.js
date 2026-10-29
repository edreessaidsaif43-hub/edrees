/* «من سيربح الدرس؟»: سلّم نقاط من 15 درجة، درجات أمان، 3 محاولات، ووسائل مساعدة.
   يستخدم نفس اختيار (الصف ← المادة ← الفصل ← الوحدة ← الدروس) ونفس بنك الأسئلة ومدير الأسئلة. */
(function () {
  var cfg = window.GAME_CONFIG, D = cfg.ladder;
  var $ = function (id) { return document.getElementById(id); };
  var LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var S = { index: null, grade: null, gradeData: null, subj: null, sem: null, unit: null, lessons: [], teacher: { name: '', ig: '' } };
  var gradeCache = {};
  function show(id) { if(window.PublishedGame && id==='setup')id='home'; ['setup', 'home', 'play'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); }

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
    [['teacherHome', 'teacher-badge'], ['teacherHud', 'teacher-mini'], ['teacherR', 'teacher-mini center']].forEach(function (x) { var el = $(x[0]); el.innerHTML = h; el.classList.toggle('show', !!h); });
  }

  /* ---------- المتسابق ---------- */
  var SEL = null;
  var M = store.get('ladder-settings:'+getSubscriptionUserId(), null) || { name: '', char: 'girl', time: D.defaultTime };
  var CHAR_N = { girl: 'طالبة', girl2: 'طالبة (عنابي)', boy: 'طالب' };
  function saveM() { store.set('ladder-settings:'+getSubscriptionUserId(), M); }
  function pname() { return M.name || 'المتسابق'; }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function bankOf() {
    var qs = [];
    SEL.lessons.forEach(function (L) { L.qs.forEach(function (q) { var c = Object.assign({}, q); c.ref = (q.ref || '') + ' – ' + L.n; qs.push(c); }); });
    return { n: SEL.unit, qs: qs };
  }
  /* السلّم: 15 درجة، أو أقل إذا كانت الأسئلة أقل (مع الحفاظ على أعلى قيمة) */
  function buildLadder(nq) {
    var all = D.points, n = Math.max(3, Math.min(all.length, nq));
    var pts = [];
    for (var i = 0; i < n; i++) pts.push(all[Math.round(i * (all.length - 1) / Math.max(1, n - 1))]);
    var safe = n === all.length ? D.safe.slice() : [Math.round(n / 3) - 1, Math.round(2 * n / 3) - 1].filter(function (x) { return x > 0 && x < n - 1; });
    return { pts: pts, safe: safe };
  }
  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + SEL.lessons.length + ' درس';
    var box = $('chars'); box.innerHTML = '';
    ['girl', 'girl2', 'boy'].forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'pchar' + (M.char === k ? ' on' : ''); b.setAttribute('aria-pressed', String(M.char === k));
      b.innerHTML = '<img src="assets/characters/' + k + '-walk.png" alt=""><span>' + CHAR_N[k] + '</span>';
      b.onclick = function () { M.char = k; saveM(); openHome(); };
      box.appendChild(b);
    });
    var inp = $('pname'); inp.value = M.name; inp.oninput = function () { M.name = inp.value.trim(); saveM(); };
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    var nq = bankOf().qs.length;
    $('ruleSteps').textContent = buildLadder(nq).pts.length;
    GameRosters.picker(S.index[S.grade].id,SEL.subject,["pname"],{labels:["المتسابق"]});
    show('home');
  }

  /* ---------- اللعب ---------- */
  var G = null, timerT = null;
  function startGame() {
    window.Sound.unlock(); window.Sound.startMusic();
    var bank = bankOf(), L = buildLadder(bank.qs.length);
    if (G) clearInterval(timerT);
    G = window.__lad = { qm: new window.QuestionManager(bank, 0), L: L, step: 0, lives: D.lives, used: { f: false, p: false, s: false }, state: 'idle', cur: null, chosen: null, correct: 0, wrong: 0, removed: [] };
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    $('hName').textContent = pname();
    ['ll5050', 'llPoll', 'llSwap'].forEach(function (id) { $(id).disabled = false; $(id).classList.remove('used'); });
    $('rModal').classList.remove('show');
    paintTeacher(); show('play');
    drawLadder(); paintLives();
    nextQuestion();
  }
  function drawLadder() {
    var ol = $('ladder'); ol.innerHTML = '';
    for (var i = G.L.pts.length - 1; i >= 0; i--) {
      var li = document.createElement('li');
      var safe = G.L.safe.indexOf(i) >= 0;
      li.className = 'rung' + (safe ? ' safe' : '') + (i < G.step ? ' done' : '') + (i === G.step && G.state !== 'over' ? ' now' : '');
      li.innerHTML = '<span class="rn">' + (i + 1) + '</span><span class="rp">' + fmt(G.L.pts[i]) + '</span>' + (safe ? '<span class="rs" title="درجة أمان">🛡</span>' : '<span class="rs"></span>');
      ol.appendChild(li);
    }
  }
  function paintLives() {
    var h = ''; for (var i = 0; i < D.lives; i++) h += '<span class="' + (i < G.lives ? '' : 'lost') + '">❤</span>';
    $('hLives').innerHTML = h;
  }
  function banked() { // نقاط آخر درجة أمان مكتملة
    var b = 0; G.L.safe.forEach(function (s) { if (G.step > s) b = G.L.pts[s]; }); return b;
  }
  function current() { return G.step > 0 ? G.L.pts[G.step - 1] : 0; }
  function prefType() { return G.step < Math.ceil(G.L.pts.length / 3) ? 'tf' : 'mc'; } // البداية بأسئلة صح/خطأ ثم الاختيار من متعدد
  function nextQuestion(keepStepMsg) {
    clearInterval(timerT);
    if (G.step >= G.L.pts.length) return finish('top');
    var cur = null;
    for (var t = 0; t < 10 && !cur; t++) cur = G.qm.next(prefType());
    if (!cur) return finish('empty');
    G.cur = cur; G.chosen = null; G.removed = []; G.state = 'ask';
    renderQuestion();
  }
  function renderQuestion() {
    var it = G.cur.item;
    $('qType').textContent = it.type === 'mc' ? 'اختيار من متعدد' : 'صح أو خطأ';
    $('qStep').textContent = 'السؤال ' + (G.step + 1) + ' • على ' + fmt(G.L.pts[G.step]) + ' نقطة';
    $('qText').textContent = it.text;
    $('qRef').textContent = it._raw.p ? ('صفحة ' + it._raw.p) : ('المرجع: ' + it.ref);
    $('feedback').className = 'lad-feedback'; $('feedback').textContent = '';
    $('confirmBtn').disabled = true; $('confirmBtn').hidden = false; $('walkBtn').disabled = false;
    $('ll5050').disabled = G.used.f || it.type !== 'mc';
    $('llPoll').disabled = G.used.p; $('llSwap').disabled = G.used.s;
    var box = $('opts'); box.className = 'lad-opts' + (it.type === 'tf' ? ' tf' : ''); box.innerHTML = '';
    G.cur.order.forEach(function (orig, pos) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'lopt';
      b.dataset.choice = orig; b.dataset.pos = pos;
      b.innerHTML = it.type === 'mc' ? '<span class="let">' + LETTERS[pos] + '</span><span class="otx" dir="auto">' + esc(it.options[orig]) + '</span>'
        : '<span class="let ' + (orig === 1 ? 'yes' : 'no') + '">' + (orig === 1 ? '✓' : '✗') + '</span><span class="otx">' + (orig === 1 ? 'صح' : 'خطأ') + '</span>';
      b.onclick = function () { if (G.state !== 'ask' || b.classList.contains('gone')) return; G.chosen = orig; box.querySelectorAll('.lopt').forEach(function (x) { x.classList.toggle('sel', x === b); }); $('confirmBtn').disabled = false; window.Sound.play('jump'); };
      box.appendChild(b);
    });
    drawLadder();
    if (M.time) runTimer(M.time, function () { if (G.state === 'ask') wrong('time'); });
    else { $('timer').hidden = true; }
    if (M.time) $('timer').hidden = false;
    window.Sound.play('question');
  }
  function runTimer(sec, onEnd) {
    clearInterval(timerT);
    var arc = $('timerArc'), len = 2 * Math.PI * 19, t0 = performance.now(), paused = 0;
    arc.style.strokeDasharray = len; arc.style.strokeDashoffset = 0;
    $('timerNum').textContent = sec; $('timer').classList.remove('low');
    timerT = setInterval(function () {
      if (G.state === 'poll') { paused += 0.1; return; } // يتوقف الوقت أثناء تصويت الصف
      var rem = Math.max(0, sec - ((performance.now() - t0) / 1000 - paused));
      $('timerNum').textContent = Math.ceil(rem);
      arc.style.strokeDashoffset = len * (1 - rem / sec);
      $('timer').classList.toggle('low', rem <= 5);
      if (rem <= 0) { clearInterval(timerT); onEnd(); }
    }, 100);
  }
  function confirmAnswer() {
    if (!G || G.state !== 'ask' || G.chosen === null) return;
    G.state = 'suspense'; clearInterval(timerT);
    $('confirmBtn').disabled = true; $('walkBtn').disabled = true;
    ['ll5050', 'llPoll', 'llSwap'].forEach(function (id) { $(id).disabled = true; });
    $('opts').querySelectorAll('.lopt').forEach(function (b) { b.disabled = true; });
    var sel = $('opts').querySelector('.lopt.sel'); sel.classList.add('locked-in');
    $('feedback').textContent = 'إجابة نهائية…'; $('feedback').className = 'lad-feedback wait';
    var ok = G.qm.answer(G.chosen);
    setTimeout(function () { ok ? right(sel) : wrong('wrong'); }, 1400);
  }
  function right(sel) {
    G.state = 'reveal'; G.correct++;
    sel.classList.remove('locked-in'); sel.classList.add('good');
    G.step++;
    var safe = G.L.safe.indexOf(G.step - 1) >= 0;
    $('feedback').textContent = 'إجابة صحيحة! ' + fmt(current()) + ' نقطة' + (safe ? ' — وصلت إلى درجة أمان 🛡' : '');
    $('feedback').className = 'lad-feedback ok';
    drawLadder();
    window.Sound.play(safe ? 'clear' : 'correct');
    setTimeout(function () { if (G.state === 'reveal') nextQuestion(); }, safe ? 2600 : 1900);
  }
  function wrong(why) {
    if (G.state === 'ask') { G.qm.answer(-1); } // انتهاء الوقت: يُحتسب خطأ ويعود السؤال لاحقًا
    G.state = 'reveal'; G.wrong++; G.lives--; clearInterval(timerT);
    paintLives();
    $('opts').querySelectorAll('.lopt').forEach(function (b) { b.disabled = true; b.classList.remove('sel', 'locked-in'); });
    // لا تُكشف الإجابة الصحيحة
    $('feedback').textContent = (why === 'time' ? 'انتهى الوقت. ' : 'إجابة خاطئة. ') + (G.lives > 0 ? 'حاول مرة أخرى عندما يظهر السؤال لاحقًا — بقيت ' + G.lives + ' محاولة' : 'انتهت المحاولات');
    $('feedback').className = 'lad-feedback bad';
    window.Sound.play('wrong');
    setTimeout(function () { if (G.state !== 'reveal') return; if (G.lives <= 0) finish('out'); else nextQuestion(); }, 2300);
  }
  /* ---------- الوسائل المساعدة ---------- */
  function fifty() {
    if (!G || G.state !== 'ask' || G.used.f || G.cur.item.type !== 'mc') return;
    G.used.f = true; $('ll5050').classList.add('used'); $('ll5050').disabled = true;
    var right = window.__decodeAnswer(G.cur.item._raw);
    var wrongs = Array.prototype.slice.call($('opts').querySelectorAll('.lopt')).filter(function (b) { return +b.dataset.choice !== right; });
    wrongs.sort(function () { return Math.random() - 0.5; }).slice(0, 2).forEach(function (b) { b.classList.add('gone'); b.classList.remove('sel'); b.disabled = true; if (G.chosen === +b.dataset.choice) { G.chosen = null; $('confirmBtn').disabled = true; } });
    window.Sound.play('checkpoint');
  }
  function poll() {
    if (!G || G.state !== 'ask' || G.used.p) return;
    G.used.p = true; $('llPoll').classList.add('used'); $('llPoll').disabled = true;
    G.state = 'poll';
    var rows = $('pollRows'); rows.innerHTML = '';
    var it = G.cur.item, counts = {};
    G.cur.order.forEach(function (orig, pos) {
      var btn = $('opts').querySelector('.lopt[data-pos="' + pos + '"]');
      if (btn.classList.contains('gone')) return;
      counts[pos] = 0;
      var row = document.createElement('div'); row.className = 'poll-row';
      var label = it.type === 'mc' ? LETTERS[pos] + '. ' + it.options[orig] : (orig === 1 ? 'صح' : 'خطأ');
      row.innerHTML = '<span class="pl" dir="auto">' + esc(label) + '</span><button class="pm" type="button" aria-label="إنقاص">−</button><b class="pc">0</b><button class="pp" type="button" aria-label="زيادة">+</button><span class="pbar"><i></i></span>';
      var paint = function () {
        var tot = Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0) || 1;
        rows.querySelectorAll('.poll-row').forEach(function (r) { var k = r.dataset.pos; r.querySelector('.pc').textContent = counts[k]; r.querySelector('.pbar i').style.width = Math.round(100 * counts[k] / tot) + '%'; });
      };
      row.dataset.pos = pos;
      row.querySelector('.pp').onclick = function () { counts[pos]++; paint(); };
      row.querySelector('.pm').onclick = function () { counts[pos] = Math.max(0, counts[pos] - 1); paint(); };
      rows.appendChild(row);
    });
    $('pollModal').classList.add('show');
    $('pollDone').onclick = function () { $('pollModal').classList.remove('show'); G.state = 'ask'; };
  }
  function swap() {
    if (!G || G.state !== 'ask' || G.used.s) return;
    var old = G.cur;
    if (!G.qm.skip()) return;
    var nx = null;
    for (var t = 0; t < 10 && !nx; t++) { nx = G.qm.next(old.item.type); if (nx && nx.item === old.item) { G.qm.skip(); nx = null; } }
    if (!nx) { old.item.timesShown++; G.qm.stats.shown++; G.qm.history.push(old.item.id); G.qm.current = old; G.cur = old; return; }
    G.used.s = true; $('llSwap').classList.add('used');
    G.cur = nx; G.chosen = null; G.removed = [];
    window.Sound.play('checkpoint');
    renderQuestion();
  }
  function walk() {
    if (!G || G.state !== 'ask') return;
    finish('walk');
  }
  /* ---------- النهاية ---------- */
  function finish(why) {
    if(window.GameSCORM){var correct=G.correct||0,wrong=G.wrong||0;window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}

    clearInterval(timerT);
    var pts = why === 'walk' || why === 'top' || why === 'empty' ? current() : banked();
    G.state = 'over'; G.final = pts;
    drawLadder();
    var art = $('winArt');
    art.innerHTML = (why === 'top' ? '<span class="crown">👑</span>' : '') + '<img src="assets/characters/' + M.char + (why === 'out' ? '-walk' : '-jump') + '.png" alt="">';
    $('rTitle').textContent = why === 'top' ? 'مبروك! ' + pname() + ' ربح الدرس!' : why === 'walk' ? 'انسحاب ذكي يا ' + pname() + '!' : why === 'empty' ? 'انتهت أسئلة الدروس المختارة' : 'انتهت المحاولات';
    $('rPoints').textContent = fmt(pts) + ' نقطة';
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit;
    var items = [['الدرجة التي وصلتها', G.step + ' من ' + G.L.pts.length], ['إجابات صحيحة', G.correct], ['إجابات خاطئة', G.wrong], ['الوسائل المستخدمة', (G.used.f ? 1 : 0) + (G.used.p ? 1 : 0) + (G.used.s ? 1 : 0) + ' من 3']];
    $('rStats').innerHTML = items.map(function (x) { return '<div class="rstat"><b>' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('');
    var best = store.get('ladder-best:'+getSubscriptionUserId(), {}), key = SEL.subject + '|' + SEL.unit;
    if (!best[key] || pts > best[key]) { best[key] = pts; store.set('ladder-best:'+getSubscriptionUserId(), best); }
    var ra = $('rActions'); ra.innerHTML = '';
    [['العب مرة أخرى ↻', 'primary', startGame], ['متسابق جديد', 'ghost', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); openHome(); }], ['تغيير الدروس', 'teal', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); show('setup'); renderSetup(); }]]
      .forEach(function (a) { var b = document.createElement('button'); b.className = 'btn big ' + a[1]; b.textContent = a[0]; b.onclick = a[2]; ra.appendChild(b); });
    paintTeacher();
    window.Sound.play(why === 'out' ? 'gameover' : 'clear');
    $('rModal').classList.add('show');
  }
  function exitGame() { if (!G) return; clearInterval(timerT); G.state = 'over'; window.Sound.stopMusic(); $('pollModal').classList.remove('show'); openHome(); }

  /* ---------- التحكم ---------- */
  function bind() {
    $('confirmBtn').onclick = confirmAnswer;
    $('walkBtn').onclick = walk;
    $('ll5050').onclick = fifty; $('llPoll').onclick = poll; $('llSwap').onclick = swap;
    $('exitBtn').onclick = exitGame;
    $('startGame').onclick = startGame;
    $('backSetup').onclick = function () { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} show('setup'); renderSetup(); };
    window.addEventListener('keydown', function (e) {
      if (!$('play').classList.contains('active') || !G || G.state !== 'ask') return;
      var k = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (k >= 0) { var b = $('opts').querySelector('.lopt[data-pos="' + k + '"]'); if (b) b.click(); }
      if (e.code === 'Enter') { e.preventDefault(); confirmAnswer(); }
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
    GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'who-wins-lesson',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
    $('selAll').onclick = function () { var gd = gradeCache[S.index[S.grade].id]; S.lessons = gd[S.subj].s[S.sem].u[S.unit].l.map(function (_, k) { return k; }); renderSetup(); };
    $('selNone').onclick = function () { S.lessons = []; renderSetup(); };
    loadScriptData('index').then(function (idx) {
      S.index = idx;
      var h = new URLSearchParams(window.PUBLISHED_SELECTION || location.hash.slice(1));
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
    window.__ladStart = startGame;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
