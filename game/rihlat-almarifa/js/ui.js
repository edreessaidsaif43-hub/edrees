/* الواجهات: إعداد المعلم، شاشة البداية، الواجهة أثناء اللعب، نافذة السؤال، النتائج، الحفظ المحلي */
(function () {
  var cfg = window.GAME_CONFIG;
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
    ['setup', 'home', 'play'].forEach(function (s) { $(s).classList.toggle('active', s === id); });
    if (id === 'play') { game.resize(); checkRotate(); } else { $('rotateHint').classList.remove('show'); }
  }

  /* ---------- البيانات ---------- */
  // تحميل البيانات كملفات JS حتى تعمل اللعبة مباشرة من الجهاز دون خادم أو إنترنت
  window.__BANK = window.__BANK || {};
  function loadScriptData(name) {
    if (window.__BANK[name]) return Promise.resolve(window.__BANK[name]);
    return new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = cfg.dataPath + name + '.js';
      sc.onload = function () { window.__BANK[name] ? res(window.__BANK[name]) : rej(new Error('no data')); };
      sc.onerror = function () { rej(new Error('تعذّر تحميل ' + name)); };
      document.head.appendChild(sc);
    });
  }
  function loadJSON() { return loadScriptData('index'); }
  function loadGrade(id) {
    if (gradeCache[id]) return Promise.resolve(gradeCache[id]);
    return loadScriptData('grades/' + id).then(function (d) { d=d.filter(function(s){return window.gameLibraryAllows(id,s.n);});gradeCache[id] = d; return d; });
  }

  /* ---------- إعداد المعلم ---------- */
  function chips(el, items, cur, onPick) {
    el.innerHTML = '';
    items.forEach(function (it, i) {
      var b = document.createElement('button');
      b.className = 'chip' + (i === cur ? ' on' : ''); b.textContent = it; b.type = 'button';
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
      chips($('subjects'), gd.map(function (s) { return s.n; }), S.subj, function (i) { S.subj = i; S.sem = S.unit = null; S.lessons = []; var sm = gd[i].s; if (sm.length === 1) S.sem = 0; renderSetup(); });
      if (S.subj != null) {
        var sems = gd[S.subj].s;
        chips($('sems'), sems.map(function (s) { return 'الفصل ' + s.n; }), S.sem, function (i) { S.sem = i; S.unit = null; S.lessons = []; renderSetup(); });
        if (S.sem != null) {
          var units = sems[S.sem].u;
          chips($('units'), units.map(function (u) { return u.n; }), S.unit, function (i) { S.unit = i; S.lessons = units[i].l.map(function (_, k) { return k; }); renderSetup(); });
          if (S.unit != null) {
            units[S.unit].l.forEach(function (L, k) {
              var lab = document.createElement('label');
              var on = S.lessons.indexOf(k) >= 0;
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
    $('setupNote').textContent = ready ? ('سيتم إنشاء ' + S.lessons.length + ' مرحلة') : '';
  }

  function selection() {
    var gd = gradeCache[S.index[S.grade].id], subj = gd[S.subj], sem = subj.s[S.sem], unit = sem.u[S.unit];
    return {
      gradeName: S.index[S.grade].n, subject: subj.n, sem: sem.n, unit: unit.n,
      lessons: S.lessons.map(function (k) { return unit.l[k]; }),
      key: [S.index[S.grade].id, S.subj, S.sem, S.unit, S.lessons.join('.')].join('|')
    };
  }
  function hashFor() {
    var p = new URLSearchParams();
    p.set('g', S.index[S.grade].id); p.set('s', S.subj); p.set('m', S.sem); p.set('u', S.unit); p.set('l', S.lessons.join('.'));
    if (S.teacher.name) p.set('t', S.teacher.name);
    if (S.teacher.ig) p.set('ig', S.teacher.ig);
    return '#' + p.toString();
  }
  function readTeacher() {
    S.teacher.name = $('tName').value.trim();
    S.teacher.ig = $('tIg').value.trim().replace(/^@+/, '');
    store.set('edu-teacher', S.teacher);
  }

  /* ---------- بيانات المعلم ---------- */
  function teacherHTML() {
    if (!S.teacher.name && !S.teacher.ig) return '';
    var h = '';
    if (S.teacher.name) h += '<span>إعداد المعلم: ' + esc(S.teacher.name) + '</span>';
    if (S.teacher.ig) h += (h ? '<span>|</span>' : '') + '<span class="ig"><i class="ig-ic">@</i>Instagram: @' + esc(S.teacher.ig) + '</span>';
    return h;
  }
  function paintTeacher() {
    var h = teacherHTML();
    [['teacherHome', 'teacher-badge'], ['teacherHud', 'teacher-mini'], ['teacherQ', 'teacher-mini'], ['teacherR', 'teacher-mini center']].forEach(function (x) {
      var el = $(x[0]); el.innerHTML = h; el.classList.toggle('show', !!h);
    });
  }

  /* ---------- شاشة البداية ---------- */
  var SEL = null;
  function progressKey() { return 'edu-progress:rihlat-almarifa:'+getSubscriptionUserId()+':'+MODE+':'+(window.gameLibraryStudent?'student:'+encodeURIComponent(JSON.stringify([window.gameLibrarySection,window.gameLibraryStudent]))+':':'')+SEL.key; }
  function getProgress() { return store.get(progressKey(), { last: 0, high: 0, bestCoins: 0, completed: {}, best: {} }); }

  function openHome() {
    SEL = selection();
    GameRosters.picker(S.index[S.grade].id,SEL.subject,[],{onChange:openHome});

    paintTeacher();
    $('homeTitle').textContent = 'لعبة ' + SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + SEL.lessons.length + ' مراحل';
    var pr = getProgress(), list = $('stageList');
    list.innerHTML = '';
    SEL.lessons.forEach(function (L, i) {
      var b = document.createElement('button');
      var done = !!pr.completed[i];
      b.className = 'stage' + (done ? ' done' : '');
      b.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="meta"><b dir="auto">' + esc(L.n) + '</b><small>' +
        L.qs.length + ' أسئلة' + (pr.best[i] ? ' • أفضل نتيجة ' + pr.best[i] : '') + '</small></span><span class="star">' + (done ? '⭐' : '') + '</span>';
      b.onclick = function () { startStage(i); };
      list.appendChild(b);
    });
    $('playBtn').onclick = function () {
      var first = SEL.lessons.findIndex(function (_, i) { return !pr.completed[i]; });
      startStage(first >= 0 ? first : Math.min(pr.last || 0, SEL.lessons.length - 1));
    };
    show('home');
    drawHero();
    drawGames();
  }

  /* اختيار اللعبة */
  var GAMES = { platform: { n: 'مغامرة المنصات', i: '🏃' }, camel: { n: 'سباق الجمال', i: '🐪' } };
  // كل لعبة مشروع مستقل: يحدد config.js نوع اللعبة
  var MODE = cfg.mode && GAMES[cfg.mode] ? cfg.mode : 'platform';
  function drawGames() {
    if (!$('gamePick')) { document.querySelectorAll('[data-how]').forEach(function (el) { el.hidden = el.getAttribute('data-how') !== MODE; }); return; }
    var box = $('gamePick'); box.innerHTML = '';
    Object.keys(GAMES).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'gcard' + (MODE === k ? ' on' : '');
      b.setAttribute('aria-pressed', String(MODE === k));
      b.innerHTML = '<span class="gi">' + GAMES[k].i + '</span><span>' + GAMES[k].n + '</span>';
      b.onclick = function () { MODE = k; store.set('edu-mode', k); openHome(); };
      box.appendChild(b);
    });
    document.querySelectorAll('[data-how]').forEach(function (el) { el.hidden = el.getAttribute('data-how') !== MODE; });
  }

  /* اختيار الشخصية (طالبة / طالب) */
  var CHARS = { girl: 'الطالبة', girl2: 'الطالبة (عنابي)', boy: 'الطالب' };
  window.__character = store.get('edu-character', 'girl');
  if (!CHARS[window.__character]) window.__character = 'girl';
  function drawHero() {
    var box = $('charPick'); box.innerHTML = '';
    Object.keys(CHARS).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'char' + (window.__character === k ? ' on' : '');
      b.setAttribute('aria-pressed', String(window.__character === k));
      b.innerHTML = '<img src="assets/characters/' + k + (window.__character === k ? '-jump' : '-walk') + '.png" alt=""><span>' + CHARS[k] + '</span>';
      b.onclick = function () { window.__character = k; store.set('edu-character', k); drawHero(); };
      box.appendChild(b);
    });
  }

  /* ---------- اللعب ---------- */
  var game, games, curStage = 0, hudCache = {};
  function startStage(i) {
    curStage = i;
    var pr = getProgress(); pr.last = i; store.set(progressKey(), pr);
    closeModal('rModal'); closeModal('qModal');
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    $('hStage').textContent = 'المرحلة ' + (i + 1) + ': ' + SEL.lessons[i].n;
    $('hStage').title = SEL.lessons[i].n;
    hudCache = {};
    if (game && game !== games[MODE]) game.stop();
    game = games[MODE]; window.__game = game;
    var camel = MODE === 'camel';
    $('touch').classList.toggle('camel', camel);
    $('hTimePill').hidden = camel; $('hRankPill').hidden = !camel;
    show('play');
    window.Sound.unlock(); window.Sound.startMusic();
    game.start({ index: i, total: SEL.lessons.length, lesson: SEL.lessons[i] });
  }

  function setText(id, v) { if (hudCache[id] !== v) { var el = $(id); el.textContent = v; if (hudCache[id] !== undefined && (id === 'hCoins' || id === 'hScore')) { el.parentNode.classList.remove('bump'); void el.offsetWidth; el.parentNode.classList.add('bump'); } hudCache[id] = v; } }

  var ui = {
    hud: function (g) {
      var lives = Math.max(0, g.lives), total = cfg.startLives;
      var key = 'L' + lives;
      if (hudCache.lives !== key) {
        var h = ''; for (var i = 0; i < Math.max(total, lives); i++) h += '<span class="' + (i < lives ? '' : 'lost') + '">❤</span>';
        $('hLives').innerHTML = h; hudCache.lives = key;
        $('hLives').classList.remove('bump'); void $('hLives').offsetWidth; $('hLives').classList.add('bump');
      }
      setText('hCoins', String(g.coins));
      setText('hScore', String(g.score));
      if (g.kind === 'camel') setText('hRank', g.rank() + ' من 4');
      else setText('hTime', String(Math.ceil(g.timeLeft)));
    },
    toast: function (msg) {
      var t = $('toast'); t.textContent = msg; t.classList.add('show');
      clearTimeout(ui._tt); ui._tt = setTimeout(function () { t.classList.remove('show'); }, 2200);
    },
    showQuestion: function (cur, g, answerFn, done) {
      var it = cur.item, opts = $('qOpts'), confirm = $('qConfirm'), fb = $('qFeedback'), card = $('qCard');
      var chosen = null, locked = false;
      $('qType').textContent = it.type === 'mc' ? 'اختيار من متعدد' : 'صح أو خطأ';
      $('qLesson').textContent = it.lesson;
      $('qText').textContent = it.text;
      $('qRef').textContent = it._raw.p ? ('صفحة ' + it._raw.p) : ('المرجع: ' + it.ref + ' – ' + it.lesson);
      fb.textContent = ''; fb.className = 'qfeedback';
      opts.className = 'qopts' + (it.type === 'tf' ? ' tf' : '');
      opts.innerHTML = '';
      confirm.disabled = true; confirm.style.visibility = 'visible';
      cur.order.forEach(function (orig, pos) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'opt';
        if (it.type === 'mc') {
          b.innerHTML = '<span class="let">' + LETTERS[pos] + '</span><span dir="auto">' + esc(it.options[orig]) + '</span>';
        } else {
          b.className += orig === 1 ? ' t-yes' : ' t-no';
          b.innerHTML = '<span class="let">' + (orig === 1 ? '✓' : '✗') + '</span><span>' + (orig === 1 ? 'صح' : 'خطأ') + '</span>';
        }
        b.dataset.choice = orig;
        b.onclick = function () {
          if (locked) return;
          chosen = orig;
          Array.prototype.forEach.call(opts.children, function (x) { x.classList.toggle('sel', x === b); });
          confirm.disabled = false;
        };
        opts.appendChild(b);
      });
      confirm.onclick = function () {
        if (locked || chosen === null) return;
        locked = true; confirm.disabled = true; // منع الضغط المتكرر
        Array.prototype.forEach.call(opts.children, function (x) { x.disabled = true; });
        var ok = answerFn(chosen);
        if (ok) {
          fb.textContent = 'إجابة صحيحة! أحسنت 🎉  +' + cfg.points.correct; fb.className = 'qfeedback ok';
          opts.querySelector('.sel').classList.add('good');
          window.Sound.play('correct');
        } else {
          // لا نكشف الإجابة الصحيحة ولا نلوّن أي خيار
          fb.textContent = 'حاول مرة أخرى عندما يظهر السؤال لاحقًا 💪'; fb.className = 'qfeedback bad';
          opts.querySelector('.sel').classList.remove('sel');
          card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
          window.Sound.play('wrong');
        }
        confirm.style.visibility = 'hidden';
        setTimeout(function () { closeModal('qModal'); done(ok); }, ok ? 1200 : 1700);
      };
      openModal('qModal');
    },
    gameOver: function (sum) {
      saveResult(sum, false);
      results('💔', 'انتهت المحاولة', sum, [
        ['إعادة المحاولة ↻', 'primary', function () { startStage(curStage); }],
        ['قائمة الدروس', 'ghost', function () { exitToHome(); }]
      ], false);
    },
    stageClear: function (sum) {
      saveResult(sum, true);
      var acts = [['إعادة المرحلة ↻', 'ghost', function () { startStage(curStage); }]];
      if (curStage + 1 < SEL.lessons.length) acts.push(['المرحلة التالية ◀', 'primary', function () { startStage(curStage + 1); }]);
      acts.push(['قائمة الدروس', 'teal', function () { exitToHome(); }]);
      if (sum.rank) {
        var medal = ['', '🥇', '🥈', '🥉', '🏅'][sum.rank] || '🏅';
        results(medal, sum.rank === 1 ? 'فزت بالمركز الأول!' : 'وصلت إلى خط النهاية!', sum, acts, true);
        $('rBadge').innerHTML = '<span class="medal">' + medal + '</span><img class="rhero" src="assets/characters/' + window.__character + '-jump.png" alt="">';
        return;
      }
      results('🏆', 'أحسنت! أكملت المرحلة', sum, acts, true);
      $('rBadge').innerHTML = '<img class="rhero" src="assets/characters/' + window.__character + '-jump.png" alt="">';
    }
  };

  function saveResult(sum, cleared) {
    var pr = getProgress();
    if (cleared) { pr.completed[sum.stageIndex] = true; pr.last = Math.min(sum.stageIndex + 1, SEL.lessons.length - 1); }
    pr.high = Math.max(pr.high || 0, sum.score);
    pr.bestCoins = Math.max(pr.bestCoins || 0, sum.coins);
    pr.best[sum.stageIndex] = Math.max(pr.best[sum.stageIndex] || 0, sum.score);
    store.set(progressKey(), pr);
  }

  function results(badge, title, s, actions, full) {
    $('rBadge').textContent = badge; $('rTitle').textContent = title;
    $('rLesson').textContent = 'المرحلة ' + (s.stageIndex + 1) + ': ' + s.lesson;
    var items = full
      ? (s.rank ? [['المركز', s.rank + ' من ' + s.racers]] : []).concat([['النقاط', s.score], ['الذهب', s.coins], ['الأسئلة', s.correct + s.wrong], ['صحيحة', s.correct], ['خاطئة', s.wrong], ['نسبة الصحيح', s.pct + '%'], ['الأرواح المتبقية', s.lives]])
      : [['الذهب', s.coins], ['الأسئلة المجاب عنها', s.correct + s.wrong], ['صحيحة', s.correct], ['خاطئة', s.wrong], ['النقاط', s.score]];
    $('rStats').innerHTML = items.map(function (x) { return '<div class="rstat"><b>' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('');
    var ra = $('rActions'); ra.innerHTML = '';
    actions.forEach(function (a) { var b = document.createElement('button'); b.className = 'btn big ' + a[1]; b.textContent = a[0]; b.onclick = a[2]; ra.appendChild(b); });
    paintTeacher();
    openModal('rModal');
  }

  function openModal(id) { $(id).classList.add('show'); }
  function closeModal(id) { $(id).classList.remove('show'); }

  function exitToHome() { game.stop(); window.Sound.stopMusic(); closeModal('rModal'); closeModal('qModal'); openHome(); }

  function pauseMenu() {
    if (!game || game.state !== 'play') return;
    game.state = 'paused';
    game.input.left = game.input.right = game.input.jump = false;
    $('rBadge').textContent = '⏸'; $('rTitle').textContent = 'إيقاف مؤقت';
    $('rLesson').textContent = 'المرحلة ' + (curStage + 1) + ': ' + SEL.lessons[curStage].n;
    $('rStats').innerHTML = '';
    var ra = $('rActions'); ra.innerHTML = '';
    [['متابعة ▶', 'primary', function () { closeModal('rModal'); game.state = 'play'; }],
     ['إعادة المرحلة ↻', 'ghost', function () { startStage(curStage); }],
     ['قائمة الدروس', 'teal', function () { exitToHome(); }]].forEach(function (a) {
      var b = document.createElement('button'); b.className = 'btn big ' + a[1]; b.textContent = a[0]; b.onclick = a[2]; ra.appendChild(b);
    });
    openModal('rModal');
  }

  /* ---------- التحكم ---------- */
  function bindControls() {
    var map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump' };
    window.addEventListener('keydown', function (e) {
      if (!$('play').classList.contains('active')) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { pauseMenu(); return; }
      var k = map[e.code]; if (!k) return;
      e.preventDefault();
      if (game.state === 'play') game.input[k] = true;
    });
    window.addEventListener('keyup', function (e) { var k = map[e.code]; if (k && game) game.input[k] = false; });
    document.querySelectorAll('.tbtn').forEach(function (b) {
      var k = b.dataset.k;
      var on = function (e) { e.preventDefault(); if (b.setPointerCapture && e.pointerId != null) try { b.setPointerCapture(e.pointerId); } catch (x) {} b.classList.add('down'); if (game.state === 'play') game.input[k] = true; window.Sound.unlock(); };
      var off = function (e) { e.preventDefault(); b.classList.remove('down'); game.input[k] = false; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    var touchy = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches || /[?&]touch=1/.test(location.search);
    $('touch').classList.toggle('show', touchy);
    document.querySelectorAll('.desk').forEach(function (d) { d.style.display = touchy ? 'none' : ''; });
    document.querySelectorAll('.sound-btn').forEach(function (b) {
      b.onclick = function () { window.Sound.unlock(); window.Sound.toggle(); paintSound(); if (!window.Sound.isMuted() && $('play').classList.contains('active')) window.Sound.startMusic(); };
    });
    paintSound();
    $('pauseBtn').onclick = pauseMenu;
    document.addEventListener('visibilitychange', function () { if (document.hidden) pauseMenu(); });
    $('rotateDismiss').onclick = function () { rotateDismissed = true; $('rotateHint').classList.remove('show'); };
    window.addEventListener('resize', checkRotate);
  }
  var rotateDismissed = false;
  function checkRotate() {
    var portrait = window.innerHeight > window.innerWidth * 1.1 && window.innerWidth < 700;
    $('rotateHint').classList.toggle('show', portrait && !rotateDismissed && $('play').classList.contains('active'));
  }
  function paintSound() { var m = window.Sound.isMuted(); document.querySelectorAll('.sound-btn').forEach(function (b) { b.textContent = m ? '🔇' : '🔊'; b.setAttribute('aria-pressed', String(!m)); }); }

  /* ---------- الإقلاع ---------- */
  async function boot() {
    if (!(await window.GameLibraryAccess)) return;
    games = {};
    if (window.Game) games.platform = new window.Game($('gameCanvas'), ui);
    if (window.CamelGame) games.camel = new window.CamelGame($('gameCanvas'), ui);
    game = games[MODE];
    window.__game = game; window.__ui = ui; window.__startStage = startStage;
    window.__setMode = function (m) { MODE = m; store.set('edu-mode', m); };
    bindControls();
    var t = store.get('edu-teacher', null);
    S.teacher = t || { name: cfg.teacherName || '', ig: cfg.teacherInstagram || '' };
    $('tName').value = S.teacher.name; $('tIg').value = S.teacher.ig;
    $('tName').oninput = $('tIg').oninput = readTeacher;
    $('buildBtn').onclick = function () { readTeacher(); history.replaceState(null, '', hashFor()); openHome(); };
    $('linkBtn').onclick = function () {
      readTeacher();
      var url = location.href.split('#')[0] + hashFor();
      var done = function () { $('setupNote').textContent = 'تم نسخ رابط الطلاب ✓'; };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('انسخ الرابط:', url); });
      else prompt('انسخ الرابط:', url);
    };
    $('selAll').onclick = function () { var gd = gradeCache[S.index[S.grade].id]; S.lessons = gd[S.subj].s[S.sem].u[S.unit].l.map(function (_, k) { return k; }); renderSetup(); };
    $('selNone').onclick = function () { S.lessons = []; renderSetup(); };
    $('backSetup').onclick = function () { history.replaceState(null, '', location.pathname + location.search); show('setup'); renderSetup(); };

    loadJSON('index.json').then(function (idx) {
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
    }).catch(function (e) {
      $('grades').innerHTML = '<span class="muted">تعذّر تحميل بنك الأسئلة (' + esc(e.message) + '). تأكد من وجود مجلد data بجانب الملف.</span>';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
