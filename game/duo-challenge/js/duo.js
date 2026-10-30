/* «تحدي الثنائي»: طالبان على جهاز واحد، الأسرع في الإجابة الصحيحة يكسب النقطة.
   يستخدم نفس اختيار (الصف ← المادة ← الفصل ← الوحدة ← الدروس) ونفس بنك الأسئلة ومدير الأسئلة. */
(function () {
  var cfg = window.GAME_CONFIG, D = cfg.duo;
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
      loadGrade(S.index[i].id).then(function (d) { if(S.grade!==i)return;S.gradeData = d; $('setupNote').textContent='';renderSetup(); }).catch(function(error){$('setupNote').textContent=error.message;});
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
    $('setupNote').textContent = ready ? ('بنك المباراة: ' + n + ' سؤالًا من ' + S.lessons.length + ' درس') : '';
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

  /* ---------- إعداد المباراة ---------- */
  var SEL = null;
  var M = store.get('duo-settings:'+getSubscriptionUserId(), null) || { names: ['', ''], chars: ['boy', 'girl'], count: D.defaultCount, time: D.defaultTime };
  var CHAR_N = { girl: 'طالبة', girl2: 'طالبة (عنابي)', boy: 'طالب' };
  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = 'تحدي ' + SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + SEL.lessons.length + ' درس';
    [0, 1].forEach(function (i) {
      var box = $('chars' + i); box.innerHTML = '';
      ['boy', 'girl', 'girl2'].forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'pchar' + (M.chars[i] === k ? ' on' : ''); b.setAttribute('aria-pressed', String(M.chars[i] === k));
        b.innerHTML = '<img src="assets/characters/' + k + '-walk.png" alt=""><span>' + CHAR_N[k] + '</span>';
        b.onclick = function () { M.chars[i] = k; saveM(); openHome(); };
        box.appendChild(b);
      });
      var inp = $('name' + i); inp.value = M.names[i]; inp.placeholder = i ? 'اللاعب الثاني' : 'اللاعب الأول';
      inp.oninput = function () { M.names[i] = inp.value.trim(); saveM(); };
    });
    var total = SEL.lessons.reduce(function (a, L) { return a + L.qs.length; }, 0);
    chips($('optCount'), D.counts.map(function (c) { return c ? c + ' أسئلة' : 'الكل (' + total + ')'; }), D.counts.indexOf(M.count), function (i) { M.count = D.counts[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t + ' ثانية'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    window.GameRosters?.picker(S.index[S.grade].id,SEL.subject,["name0","name1"],{labels:["الطالب الأول","الطالب الثاني"]});
    show('home');
  }
  function saveM() { store.set('duo-settings:'+getSubscriptionUserId(), M); }
  function pname(i) { return M.names[i] || (i ? 'اللاعب الثاني' : 'اللاعب الأول'); }

  /* ---------- المباراة (نظام الجرس: لكل طالب زر واحد) ---------- */
  var G = null, timerT = null;
  var BUZZ_KEYS = [['Enter', 'NumpadEnter', 'KeyL'], ['Space', 'KeyA']];
  var ANS_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'], ANS_NUM = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'];
  function buildBank() {
    var qs = [];
    SEL.lessons.forEach(function (L) { L.qs.forEach(function (q) { var c = Object.assign({}, q); c.ref = (q.ref || '') + ' – ' + L.n; qs.push(c); }); });
    return { n: SEL.unit, qs: qs };
  }
  function startMatch() {
    window.Sound.unlock(); window.Sound.startMusic();
    var bank = buildBank();
    var total = M.count ? Math.min(M.count, bank.qs.length) : bank.qs.length;
    if (G) { clearInterval(timerT); clearInterval(G._ct); }
    G = window.__duo = { qm: new window.QuestionManager(bank, 0), total: total, round: 0, score: [0, 0], correct: [0, 0], wrong: [0, 0], buzz: [0, 0], speed: [[], []], state: 'idle', cur: null, locked: [false, false], turn: -1 };
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    [0, 1].forEach(function (i) {
      $('av' + i).src = 'assets/characters/' + M.chars[i] + '-walk.png';
      $('sn' + i).textContent = pname(i); $('sc' + i).textContent = '0';
    });
    $('rModal').classList.remove('show');
    paintTeacher(); show('play');
    nextRound();
  }
  function setBuzz(i, mode, label) {
    var b = $('bz' + i);
    b.className = 'buzzer ' + mode; b.disabled = mode !== 'ready';
    $('bl' + i).textContent = label;
  }
  function runTimer(sec, onEnd) {
    clearInterval(timerT);
    var arc = $('timerArc'), len = 2 * Math.PI * 19, t0 = performance.now();
    arc.style.strokeDasharray = len; arc.style.strokeDashoffset = 0;
    $('timerNum').textContent = sec; $('timer').classList.remove('low');
    timerT = setInterval(function () {
      var rem = Math.max(0, sec - (performance.now() - t0) / 1000);
      $('timerNum').textContent = Math.ceil(rem);
      arc.style.strokeDashoffset = len * (1 - rem / sec);
      $('timer').classList.toggle('low', rem <= 3);
      if (rem <= 0) { clearInterval(timerT); onEnd(); }
    }, 100);
  }
  function nextRound() {
    clearInterval(timerT);
    if (G.round >= G.total) return endMatch();
    var cur = null;
    for (var tries = 0; tries < 8 && !cur; tries++) cur = G.qm.next();
    if (!cur) return endMatch();
    G.round++; G.cur = cur; G.locked = [false, false]; G.turn = -1; G.state = 'reading';
    var it = cur.item;
    $('hRound').textContent = 'سؤال ' + G.round + ' من ' + G.total;
    $('qType').textContent = it.type === 'mc' ? 'اختيار من متعدد' : 'صح أو خطأ';
    $('qText').textContent = it.text;
    $('qRef').textContent = it._raw.p ? ('صفحة ' + it._raw.p) : ('المرجع: ' + it.ref);
    document.querySelectorAll('.sq').forEach(function (e) { e.textContent = it.text; });
    $('banner').className = 'banner'; $('banner').textContent = '';
    $('turnTag').className = 'turn'; $('turnTag').textContent = '';
    [0, 1].forEach(function (i) { $('side' + i).classList.remove('won', 'lost', 'locked', 'shake', 'active'); $('st' + i).textContent = ''; setBuzz(i, 'wait', 'استعد…'); });
    // الخيارات تظهر للجميع، ولا يجيب إلا من ضغط زرّه أولًا
    var box = $('opts'); box.className = 'aopts' + (it.type === 'tf' ? ' tf' : '') + ' idle'; box.innerHTML = '';
    cur.order.forEach(function (orig, pos) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'dopt'; b.disabled = true;
      b.dataset.choice = orig; b.dataset.pos = pos;
      b.innerHTML = it.type === 'mc' ? '<span class="let">' + LETTERS[pos] + '</span><span class="otx" dir="auto">' + esc(it.options[orig]) + '</span><kbd class="hk">' + (pos + 1) + '</kbd>'
        : '<span class="let ' + (orig === 1 ? 'yes' : 'no') + '">' + (orig === 1 ? '✓' : '✗') + '</span><span class="otx">' + (orig === 1 ? 'صح' : 'خطأ') + '</span><kbd class="hk">' + (pos + 1) + '</kbd>';
      b.addEventListener('click', function () { answer(orig, b); });
      box.appendChild(b);
    });
    var n = D.readSeconds, c = $('count');
    c.className = 'count show'; c.textContent = n;
    window.Sound.play('question');
    clearInterval(G._ct);
    G._ct = setInterval(function () {
      n--;
      if (n > 0) { c.textContent = n; window.Sound.play('checkpoint'); }
      else { clearInterval(G._ct); c.textContent = 'اضغطوا!'; setTimeout(function () { c.className = 'count'; }, 450); openBuzzers(); }
    }, 1000);
  }
  function openBuzzers() {
    if (!G || G.state !== 'reading') return;
    G.state = 'buzz'; G.openedAt = performance.now();
    [0, 1].forEach(function (i) { setBuzz(i, 'ready', 'اضغط!'); });
    runTimer(M.time, function () { if (G.state === 'buzz') noWinner('time'); });
  }
  function buzz(p) {
    if (!G || G.state !== 'buzz' || G.locked[p]) return;
    G.buzz[p]++;
    G.buzzT = (performance.now() - G.openedAt) / 1000;
    window.Sound.play('jump');
    giveTurn(p, 'buzz');
  }
  function giveTurn(p, why) {
    G.state = 'answer'; G.turn = p;
    [0, 1].forEach(function (i) {
      $('side' + i).classList.toggle('active', i === p);
      if (i === p) setBuzz(i, 'hit', why === 'steal' ? 'فرصتك!' : 'أجب الآن');
      else if (!G.locked[i]) setBuzz(i, 'wait', 'انتظر…');
    });
    if (why === 'buzz') $('st' + p).textContent = 'ضغط أولًا في ' + G.buzzT.toFixed(1) + ' ث';
    var tag = $('turnTag'); tag.className = 'turn show t' + p;
    tag.textContent = (why === 'steal' ? 'فرصة ' : 'دور ') + pname(p) + ' للإجابة';
    var box = $('opts'); box.className = box.className.replace(' idle', '').replace(/ t[01]/g, '') + ' t' + p;
    box.querySelectorAll('.dopt').forEach(function (b) { b.disabled = false; });
    G.answerAt = performance.now();
    runTimer(D.answerSeconds || 8, function () { if (G.state === 'answer' && G.turn === p) wrongAnswer(p, 'time'); });
  }
  function answer(choice, btn) {
    if (!G || G.state !== 'answer') return;
    var p = G.turn, right = window.__decodeAnswer(G.cur.item._raw) === choice;
    if (right) {
      btn.classList.add('good');
      G.speed[p].push(G.buzzT || 0);
      win(p);
    } else wrongAnswer(p, 'wrong');
  }
  function wrongAnswer(p, why) {
    G.locked[p] = true; G.wrong[p]++;
    var side = $('side' + p);
    side.classList.remove('active', 'shake'); void side.offsetWidth; side.classList.add('locked', 'shake');
    setBuzz(p, 'off', why === 'time' ? 'انتهى وقتك' : 'خطأ ✗');
    $('st' + p).textContent = why === 'time' ? 'انتهى وقت الإجابة' : 'إجابة خاطئة';
    window.Sound.play('wrong');
    // لا نعلّم الخيار الخاطئ حتى لا يستفيد المنافس، والدور ينتقل له مباشرة
    var o = 1 - p;
    if (!G.locked[o]) giveTurn(o, 'steal');
    else noWinner('both');
  }
  function win(p) {
    G.state = 'reveal'; clearInterval(timerT);
    var it = G.cur.item, right = window.__decodeAnswer(it._raw);
    G.qm.answer(right);
    G.score[p]++; G.correct[p]++;
    $('opts').querySelectorAll('.dopt').forEach(function (b) { b.disabled = true; });
    $('sc' + p).textContent = G.score[p];
    $('side' + p).classList.add('won'); $('side' + (1 - p)).classList.add('lost');
    $('av' + p).src = 'assets/characters/' + M.chars[p] + '-jump.png';
    setBuzz(p, 'hit', '+1 نقطة');
    $('turnTag').className = 'turn';
    var bn = $('banner'); bn.textContent = '⚡ نقطة لـ ' + pname(p) + '!'; bn.className = 'banner show w' + p;
    window.Sound.play('correct');
    setTimeout(after, 2300);
  }
  function noWinner(why) {
    G.state = 'reveal'; clearInterval(timerT);
    var it = G.cur.item, right = window.__decodeAnswer(it._raw);
    // لا تُكشف الإجابة، ويعود السؤال بعد 3–5 أسئلة أخرى
    G.qm.answer((right + 1) % (it.type === 'mc' ? it.options.length : 2));
    $('opts').querySelectorAll('.dopt').forEach(function (b) { b.disabled = true; });
    [0, 1].forEach(function (i) { if (!G.locked[i]) setBuzz(i, 'off', '—'); });
    $('turnTag').className = 'turn';
    var bn = $('banner');
    bn.textContent = why === 'time' ? '⏱ لم يضغط أحد — سيعود السؤال لاحقًا' : 'لم يُجب أحد بشكل صحيح — سيعود السؤال لاحقًا';
    bn.className = 'banner show none';
    window.Sound.play('hurt');
    setTimeout(after, 2600);
  }
  function after() {
    [0, 1].forEach(function (i) { $('av' + i).src = 'assets/characters/' + M.chars[i] + '-walk.png'; });
    if (G && G.state === 'reveal') nextRound();
  }
  function avg(a) { return a.length ? (a.reduce(function (x, y) { return x + y; }, 0) / a.length).toFixed(1) + ' ث' : '—'; }
  function endMatch() {
    if(window.GameSCORM){var correct=G.correct.reduce(function(a,b){return a+b;},0),wrong=G.wrong.reduce(function(a,b){return a+b;},0);window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}

    clearInterval(timerT); G.state = 'over';
    var w = G.score[0] === G.score[1] ? -1 : (G.score[0] > G.score[1] ? 0 : 1);
    var art = $('winArt');
    if (w >= 0) { art.innerHTML = '<span class="crown">👑</span><img src="assets/characters/' + M.chars[w] + '-jump.png" alt="">'; $('rTitle').textContent = 'الفائز: ' + pname(w) + '!'; }
    else { art.innerHTML = '<img src="assets/characters/' + M.chars[0] + '-jump.png" alt=""><img src="assets/characters/' + M.chars[1] + '-jump.png" alt="">'; $('rTitle').textContent = 'تعادل! أداء رائع من الطرفين'; }
    window.Sound.play('clear');
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit + ' • ' + G.round + ' سؤالًا';
    var rows = [['النقاط', G.score[0], G.score[1]], ['مرات الضغط على الجرس', G.buzz[0], G.buzz[1]], ['إجابات صحيحة', G.correct[0], G.correct[1]], ['إجابات خاطئة', G.wrong[0], G.wrong[1]], ['متوسط سرعة الضغط (عند الفوز)', avg(G.speed[0]), avg(G.speed[1])]];
    $('rTable').innerHTML = '<div class="vt-row vt-h"><span></span><b class="c1">' + esc(pname(0)) + '</b><b class="c2">' + esc(pname(1)) + '</b></div>' +
      rows.map(function (r) { return '<div class="vt-row"><span>' + r[0] + '</span><b>' + r[1] + '</b><b>' + r[2] + '</b></div>'; }).join('');
    var ra = $('rActions'); ra.innerHTML = '';
    [['مباراة جديدة ↻', 'primary', startMatch], ['تغيير اللاعبين والإعدادات', 'ghost', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); openHome(); }], ['تغيير الدروس', 'teal', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); show('setup'); renderSetup(); }]]
      .forEach(function (a) { var b = document.createElement('button'); b.className = 'btn big ' + a[1]; b.textContent = a[0]; b.onclick = a[2]; ra.appendChild(b); });
    paintTeacher();
    $('rModal').classList.add('show');
  }
  function exitMatch() {
    if (!G) return;
    clearInterval(timerT); clearInterval(G._ct); G.state = 'over'; $('count').className = 'count';
    window.Sound.stopMusic(); openHome();
  }

  /* ---------- التحكم ---------- */
  function bind() {
    [0, 1].forEach(function (i) {
      var b = $('bz' + i);
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); buzz(i); });
      b.addEventListener('click', function (e) { if (e.detail === 0) buzz(i); });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    window.addEventListener('keydown', function (e) {
      if (!$('play').classList.contains('active') || !G) return;
      for (var p = 0; p < 2; p++) if (BUZZ_KEYS[p].indexOf(e.code) >= 0) { e.preventDefault(); if (!e.repeat) buzz(p); return; }
      var idx = ANS_KEYS.indexOf(e.code); if (idx < 0) idx = ANS_NUM.indexOf(e.code);
      if (idx >= 0 && G.state === 'answer') {
        var b = $('opts').querySelector('.dopt[data-pos="' + idx + '"]');
        if (b) { e.preventDefault(); answer(+b.dataset.choice, b); }
      }
    });
    document.querySelectorAll('.sound-btn').forEach(function (b) {
      b.onclick = function () { window.Sound.unlock(); window.Sound.toggle(); paintSound(); if (!window.Sound.isMuted() && $('play').classList.contains('active')) window.Sound.startMusic(); };
    });
    paintSound();
    $('exitBtn').onclick = exitMatch;
    $('startMatch').onclick = startMatch;
    $('backSetup').onclick = function () { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} show('setup'); renderSetup(); };
  }
  function paintSound() { var m = window.Sound.isMuted(); document.querySelectorAll('.sound-btn').forEach(function (b) { b.textContent = m ? '🔇' : '🔊'; }); }

  async function boot() {
    if(!window.GameLibraryAccess)throw Error('تعذر تحميل ملف تشغيل اللعبة. أعد تحميل الصفحة.');
    if (!(await window.GameLibraryAccess)) return;
    bind();
    var t = store.get('edu-teacher', null);
    S.teacher = t || { name: cfg.teacherName || '', ig: cfg.teacherInstagram || '' };
    $('tName').value = S.teacher.name; $('tIg').value = S.teacher.ig;
    $('tName').oninput = $('tIg').oninput = readTeacher;
    $('buildBtn').onclick = function () { readTeacher(); try { history.replaceState(null, '', hashFor()); } catch (e) {} openHome(); };
    if(window.GamePublish?.configure)window.GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'duo-challenge',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
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
    window.__duoStart = startMatch;
  }
  function startBoot(){boot().catch(function(error){console.error('Game boot failed:',error);if(window.gameLibraryShowError){window.gameLibraryShowError(error);return;}var host=$('grades');if(host){host.textContent=error.message||'تعذر بدء اللعبة. أعد تحميل الصفحة.';var retry=document.createElement('button');retry.type='button';retry.textContent='إعادة المحاولة';retry.onclick=function(){location.reload();};host.appendChild(retry);}});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startBoot);else startBoot();
})();
