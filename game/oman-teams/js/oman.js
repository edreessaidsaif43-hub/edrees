/* «رحلة الفرق عبر عُمان»: لعبة لوحية للفرق على خريطة عُمان لشاشة العرض.
   يستخدم نفس اختيار (الصف ← المادة ← الفصل ← الوحدة ← الدروس) ونفس بنك الأسئلة ومدير الأسئلة. */
(function () {
  var cfg = window.GAME_CONFIG, D = cfg.oman;
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

  /* ---------- الفرق ---------- */
  var SEL = null, MAP = window.OmanMap, ST = MAP.STATIONS, FIN = ST.length - 1;
  var COLORS = ['#16a3a0', '#ff7a1a', '#7b4ad1', '#e53950'];
  var DEF_NAMES = ['فريق الصقور', 'فريق النوارس', 'فريق المها', 'فريق الغزلان'];
  var CHAR_N = { girl: 'طالبة', girl2: 'طالبة (عنابي)', boy: 'طالب' };
  var DEF_CHARS = ['boy', 'girl', 'girl2', 'boy'];
  var M = store.get('oman-settings:'+getSubscriptionUserId(), null) || { n: D.teams.def, names: ['', '', '', ''], chars: DEF_CHARS.slice(), time: D.defaultTime };
  function saveM() { store.set('oman-settings:'+getSubscriptionUserId(), M); }
  function tname(i) { return (M.names[i] || DEF_NAMES[i]); }
  function bankOf() {
    var qs = [];
    SEL.lessons.forEach(function (L) { L.qs.forEach(function (q) { var c = Object.assign({}, q); c.ref = (q.ref || '') + ' – ' + L.n; qs.push(c); }); });
    return { n: SEL.unit, qs: qs };
  }
  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    var nq = bankOf().qs.length;
    $('homeSub').textContent = SEL.unit + ' • ' + nq + ' سؤالًا';
    chips($('optTeams'), [2, 3, 4].map(function (n) { return n + ' فرق'; }), M.n - 2, function (i) { M.n = i + 2; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    var box = $('teamsSetup'); box.innerHTML = '';
    for (var i = 0; i < M.n; i++) (function (i) {
      var card = document.createElement('div'); card.className = 'tcard'; card.style.setProperty('--tc', COLORS[i]);
      card.innerHTML = '<span class="tdot"></span><label class="pname">اسم الفريق<input id="tn' + i + '" type="text" maxlength="18" placeholder="' + DEF_NAMES[i] + '"></label><div class="pchars"></div>';
      var inp = card.querySelector('input'); inp.value = M.names[i]; inp.oninput = function () { M.names[i] = inp.value.trim(); saveM(); };
      var pc = card.querySelector('.pchars');
      ['girl', 'girl2', 'boy'].forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'pchar' + (M.chars[i] === k ? ' on' : ''); b.setAttribute('aria-pressed', String(M.chars[i] === k));
        b.innerHTML = '<img src="assets/characters/' + k + '-walk.png" alt=""><span>' + CHAR_N[k] + '</span>';
        b.onclick = function () { M.chars[i] = k; saveM(); openHome(); };
        pc.appendChild(b);
      });
      box.appendChild(card);
    })(i);
    window.GameRosters?.picker(S.index[S.grade].id,SEL.subject,Array.from({length:M.n},function(_,i){return 'tn'+i;}),{labels:Array.from({length:M.n},function(_,i){return 'طالب الفريق '+(i+1);})});
    show('home');
  }

  /* ---------- اللعب ---------- */
  var G = null, timerT = null;
  function startGame() {
    window.Sound.unlock(); window.Sound.startMusic();
    clearInterval(timerT);
    var teams = [];
    for (var i = 0; i < M.n; i++) teams.push({ name: tname(i), color: COLORS[i], char: M.chars[i] || 'boy', pos: 0, correct: 0, wrong: 0 });
    G = window.__om = { qm: new window.QuestionManager(bankOf(), 0), teams: teams, turn: 0, round: 1, state: 'idle', cur: null, chosen: null, mode: 'turn' };
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    ['qModal', 'diceModal', 'eventModal', 'rModal'].forEach(function (id) { $(id).classList.remove('show'); });
    $('map').innerHTML = MAP.base();
    paintTeacher(); show('play');
    drawTokens(true); paintSide();
  }
  function paintSide() {
    var t = G.teams[G.turn];
    $('hRound').textContent = 'الجولة ' + G.round;
    $('turnCard').style.setProperty('--tc', t.color);
    $('turnCard').innerHTML = '<img src="assets/characters/' + t.char + '-walk.png" alt=""><div><span>الدور الآن</span><b>' + esc(t.name) + '</b><small>في ' + ST[t.pos].n + '</small></div>';
    var ol = $('teamList'); ol.innerHTML = '';
    var order = G.teams.map(function (x, i) { return i; }).sort(function (a, b) { return G.teams[b].pos - G.teams[a].pos || G.teams[b].correct - G.teams[a].correct; });
    order.forEach(function (i) {
      var x = G.teams[i], li = document.createElement('li');
      li.className = 'tm' + (i === G.turn ? ' now' : ''); li.style.setProperty('--tc', x.color);
      li.innerHTML = '<span class="tm-dot"></span><span class="tm-n">' + esc(x.name) + '</span><span class="tm-p">' + ST[x.pos].n + '</span><span class="tm-bar"><i style="width:' + Math.round(100 * x.pos / FIN) + '%"></i></span>';
      ol.appendChild(li);
    });
    $('askBtn').disabled = G.state !== 'idle';
    $('hint').textContent = G.state === 'idle' ? 'اضغط «اعرض السؤال» أو مفتاح المسافة.' : '';
  }
  function drawTokens(instant) {
    var g = $('map').querySelector('#tokens'); if (!g) return;
    var byPos = {};
    G.teams.forEach(function (t, i) { (byPos[t.pos] = byPos[t.pos] || []).push(i); });
    G.teams.forEach(function (t, i) {
      var el = g.querySelector('[data-t="' + i + '"]');
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'g'); el.setAttribute('data-t', i); el.setAttribute('class', 'token');
        el.innerHTML = '<ellipse cx="0" cy="6" rx="24" ry="8" fill="rgba(0,0,0,.3)"/><circle cx="0" cy="-30" r="31" fill="' + t.color + '" stroke="#fff" stroke-width="5"/>' +
          '<image href="assets/characters/' + t.char + '-walk.png" x="-18" y="-62" width="36" height="58" preserveAspectRatio="xMidYMax meet"/>';
        g.appendChild(el);
      }
      var group = byPos[t.pos], k = group.indexOf(i), n = group.length, s = ST[t.pos];
      var ox = n > 1 ? Math.cos(k / n * Math.PI * 2 - Math.PI / 2) * 34 : 0, oy = n > 1 ? Math.sin(k / n * Math.PI * 2 - Math.PI / 2) * 22 : 0;
      el.style.transition = instant ? 'none' : 'transform .32s ease-out';
      el.style.transform = 'translate(' + (s.x + ox) + 'px,' + (s.y - 10 + oy) + 'px)' + (i === G.turn ? ' scale(1.15)' : '');
      if (i === G.turn) g.appendChild(el); // الفريق صاحب الدور في الأعلى
    });
  }
  function nextTurn() {
    G.turn = (G.turn + 1) % G.teams.length;
    if (G.turn === 0) G.round++;
    G.state = 'idle'; G.mode = 'turn';
    paintSide(); drawTokens();
  }

  /* ---------- السؤال ---------- */
  function ask(mode) {
    if (!G || (G.state !== 'idle' && mode !== 'gift')) return;
    var cur = null;
    for (var t = 0; t < 10 && !cur; t++) cur = G.qm.next();
    if (!cur) return finish(-1, 'empty');
    G.cur = cur; G.chosen = null; G.state = 'ask'; G.mode = mode || 'turn';
    var it = cur.item, team = G.teams[G.turn];
    $('qTeam').textContent = (G.mode === 'gift' ? '🎁 سؤال إضافي – ' : '') + team.name; $('qTeam').style.background = team.color;
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
    paintSide();
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
    var ok = window.__decodeAnswer(G.cur.item._raw) === G.chosen;
    resolve(ok, 'answer');
  }
  function resolve(ok, why) {
    G.state = 'resolved'; clearInterval(timerT);
    var it = G.cur.item, right = window.__decodeAnswer(it._raw), team = G.teams[G.turn];
    G.qm.answer(ok ? right : (right + 1) % (it.type === 'mc' ? it.options.length : 2));
    $('qConfirm').disabled = true; $('qConfirm').style.visibility = 'hidden';
    $('qOpts').querySelectorAll('.opt').forEach(function (b) { b.disabled = true; });
    var fb = $('qFeedback');
    if (ok) {
      team.correct++;
      $('qOpts').querySelector('.opt.sel').classList.add('good');
      fb.textContent = 'إجابة صحيحة! أحسنتم 🎉'; fb.className = 'qfeedback ok';
      window.Sound.play('correct');
    } else {
      team.wrong++;
      var sel = $('qOpts').querySelector('.opt.sel'); if (sel) sel.classList.remove('sel');
      // لا نكشف الإجابة الصحيحة
      fb.textContent = (why === 'time' ? 'انتهى الوقت. ' : '') + 'حاولوا مرة أخرى عندما يظهر السؤال لاحقًا 💪'; fb.className = 'qfeedback bad';
      $('qCard').classList.remove('shake'); void $('qCard').offsetWidth; $('qCard').classList.add('shake');
      window.Sound.play('wrong');
    }
    setTimeout(function () {
      $('qModal').classList.remove('show');
      if (ok && G.mode === 'gift') { moveBy(2, 'gift'); return; }
      if (ok) openDice(); else nextTurn();
    }, ok ? 1300 : 1900);
  }

  /* ---------- النرد والحركة ---------- */
  var FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  function openDice() {
    G.state = 'dice';
    $('dieFace').textContent = '🎲'; $('diceTitle').textContent = 'إجابة صحيحة! ارمِ النرد يا ' + G.teams[G.turn].name;
    $('diceHint').textContent = 'اضغط على النرد';
    $('die').disabled = false; $('die').classList.remove('rolling');
    $('diceModal').classList.add('show');
  }
  function roll() {
    if (!G || G.state !== 'dice') return;
    G.state = 'rolling'; $('die').disabled = true; $('die').classList.add('rolling');
    var lo = D.dice[0], hi = D.dice[1], n = lo + Math.floor(Math.random() * (hi - lo + 1)), k = 0;
    var spin = setInterval(function () { $('dieFace').textContent = FACES[Math.floor(Math.random() * hi)]; window.Sound.play('jump'); if (++k > 9) {
      clearInterval(spin); $('die').classList.remove('rolling'); $('dieFace').textContent = FACES[n - 1];
      $('diceHint').textContent = 'تقدّموا ' + n + (n === 1 ? ' محطة' : n === 2 ? ' محطتين' : ' محطات');
      setTimeout(function () { $('diceModal').classList.remove('show'); moveBy(n, 'dice'); }, 1000);
    } }, 90);
  }
  function moveBy(n, src) {
    G.state = 'moving';
    var t = G.teams[G.turn], dir = n >= 0 ? 1 : -1, left = Math.abs(n);
    var stepT = setInterval(function () {
      if (left <= 0 || (dir > 0 && t.pos >= FIN) || (dir < 0 && t.pos <= 0)) { clearInterval(stepT); landed(src); return; }
      t.pos += dir; left--; drawTokens(); paintSide(); window.Sound.play('coin');
    }, 380);
  }
  function landed(src) {
    var t = G.teams[G.turn], s = ST[t.pos];
    if (t.pos >= FIN) return finish(G.turn, 'finish');
    // المفاجآت تعمل عند الوصول بالنرد فقط (لا سلاسل متتالية)
    if (src === 'dice' && s.ev) return showEvent(s.ev);
    setTimeout(nextTurn, 400);
  }
  function showEvent(ev) {
    G.state = 'event';
    var t = G.teams[G.turn], data = {
      star: ['⭐', 'ريح مواتية!', 'تتقدّم ' + t.name + ' محطة إضافية.'],
      storm: ['🌪', 'عاصفة رملية!', 'ترجع ' + t.name + ' محطة واحدة.'],
      gift: ['🎁', 'هدية المعرفة!', 'سؤال إضافي لـ' + t.name + ': الإجابة الصحيحة تقدّمكم محطتين.']
    }[ev];
    $('evIc').textContent = data[0]; $('evTitle').textContent = data[1]; $('evText').textContent = data[2];
    $('eventModal').classList.add('show');
    window.Sound.play(ev === 'storm' ? 'hurt' : 'checkpoint');
    $('evOk').onclick = function () {
      $('eventModal').classList.remove('show');
      if (ev === 'star') moveBy(1, 'event'); else if (ev === 'storm') moveBy(-1, 'event'); else ask('gift');
    };
  }

  /* ---------- النهاية ---------- */
  function finish(w, why) {
    if(window.GameSCORM){var correct=G.teams.reduce(function(a,t){return a+(t.correct||0);},0),wrong=G.teams.reduce(function(a,t){return a+(t.wrong||0);},0);window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}

    clearInterval(timerT); G.state = 'over';
    var order = G.teams.map(function (x, i) { return i; }).sort(function (a, b) { return G.teams[b].pos - G.teams[a].pos || G.teams[b].correct - G.teams[a].correct; });
    if (w < 0) w = order[0];
    var tie = why === 'empty' && order.length > 1 && G.teams[order[0]].pos === G.teams[order[1]].pos && G.teams[order[0]].correct === G.teams[order[1]].correct;
    var win = G.teams[w];
    $('winArt').innerHTML = '<span class="crown">👑</span><img src="assets/characters/' + win.char + '-jump.png" alt="">';
    $('rTitle').textContent = tie ? 'تعادل في الصدارة!' : (why === 'finish' ? win.name + ' وصل إلى خصب أولًا!' : 'انتهت الأسئلة — الفائز: ' + win.name);
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit + ' • ' + G.round + ' جولات';
    $('rTable').innerHTML = '<div class="vt-row om-row vt-h"><span>الفريق</span><b>المحطة</b><b>صحيحة</b><b>خاطئة</b></div>' + order.map(function (i, r) {
      var x = G.teams[i]; return '<div class="vt-row om-row" style="--tc:' + x.color + '"><span><i class="tm-dot"></i>' + (r + 1) + '. ' + esc(x.name) + '</span><b>' + ST[x.pos].n + '</b><b>' + x.correct + '</b><b>' + x.wrong + '</b></div>';
    }).join('');
    var ra = $('rActions'); ra.innerHTML = '';
    [['رحلة جديدة ↻', 'primary', startGame], ['تعديل الفرق', 'ghost', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); openHome(); }], ['تغيير الدروس', 'teal', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); show('setup'); renderSetup(); }]]
      .forEach(function (a) { var b = document.createElement('button'); b.className = 'btn big ' + a[1]; b.textContent = a[0]; b.onclick = a[2]; ra.appendChild(b); });
    paintTeacher(); paintSide();
    window.Sound.play('clear');
    $('rModal').classList.add('show');
  }
  function exitGame() { if (!G) return; clearInterval(timerT); G.state = 'over'; window.Sound.stopMusic(); ['qModal', 'diceModal', 'eventModal'].forEach(function (id) { $(id).classList.remove('show'); }); openHome(); }

  /* ---------- التحكم ---------- */
  function bind() {
    $('askBtn').onclick = function () { ask('turn'); };
    $('qConfirm').onclick = confirmAnswer;
    $('die').onclick = roll;
    $('exitBtn').onclick = exitGame;
    $('startGame').onclick = startGame;
    $('backSetup').onclick = function () { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} show('setup'); renderSetup(); };
    window.addEventListener('keydown', function (e) {
      if (!$('play').classList.contains('active') || !G) return;
      if (e.code === 'Space' && G.state === 'idle') { e.preventDefault(); ask('turn'); return; }
      if (e.code === 'Space' && G.state === 'dice') { e.preventDefault(); roll(); return; }
      if (G.state === 'ask') {
        var k = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
        if (k >= 0) { var b = $('qOpts').querySelector('.opt[data-pos="' + k + '"]'); if (b) b.click(); }
        if (e.code === 'Enter') { e.preventDefault(); confirmAnswer(); }
      }
    });
    document.querySelectorAll('.sound-btn').forEach(function (b) {
      b.onclick = function () { window.Sound.unlock(); window.Sound.toggle(); paintSound(); if (!window.Sound.isMuted() && $('play').classList.contains('active')) window.Sound.startMusic(); };
    });
    paintSound();
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
    if(window.GamePublish?.configure)window.GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'oman-teams',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
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
    window.__omanStart = startGame;
  }
  function startBoot(){boot().catch(function(error){console.error('Game boot failed:',error);if(window.gameLibraryShowError){window.gameLibraryShowError(error);return;}var host=$('grades');if(host){host.textContent=error.message||'تعذر بدء اللعبة. أعد تحميل الصفحة.';var retry=document.createElement('button');retry.type='button';retry.textContent='إعادة المحاولة';retry.onclick=function(){location.reload();};host.appendChild(retry);}});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startBoot);else startBoot();
})();
