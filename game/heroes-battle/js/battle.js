/* «معركة الأبطال»: فريق ضد فريق؛ كل إجابة صحيحة ضربة على بطل الخصم.
   يستخدم نفس اختيار (الصف ← المادة ← الفصل ← الوحدة ← الدروس) ونفس بنك الأسئلة ومدير الأسئلة. */
(function () {
  var cfg = window.GAME_CONFIG, D = cfg.battle;
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

  /* ---------- الفريقان ---------- */
  var SEL = null;
  var COLORS = ['#16a3a0', '#ff7a1a'];
  var DEF_NAMES = ['فريق الصقور', 'فريق النمور'];
  var CHAR_N = { girl: 'طالبة', girl2: 'طالبة (عنابي)', boy: 'طالب' };
  var M = store.get('battle-settings:'+getSubscriptionUserId(), null) || { names: ['', ''], chars: ['boy', 'girl2'], hp: D.defaultHp, time: D.defaultTime };
  function saveM() { store.set('battle-settings:'+getSubscriptionUserId(), M); }
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
    chips($('optHp'), D.hp.map(function (h) { return h + ' نقطة'; }), D.hp.indexOf(M.hp), function (i) { M.hp = D.hp[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    var box = $('teamsSetup'); box.innerHTML = '';
    [0, 1].forEach(function (i) {
      if (i === 1) { var vs = document.createElement('div'); vs.className = 'vs'; vs.textContent = 'ضد'; box.appendChild(vs); }
      var card = document.createElement('div'); card.className = 'tcard'; card.style.setProperty('--tc', COLORS[i]);
      card.innerHTML = '<span class="tdot"></span><label class="pname">اسم الفريق<input id="tn' + i + '" type="text" maxlength="18" placeholder="' + DEF_NAMES[i] + '"></label><span class="pick-lbl">اختر البطل</span><div class="pchars"></div>';
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
    window.GameRosters?.picker(S.index[S.grade].id,SEL.subject,["tn0","tn1"],{labels:["طالب الفريق الأول","طالب الفريق الثاني"]});
    show('home');
  }

  /* ---------- المعركة ---------- */
  var G = null, timerT = null;
  function startGame() {
    window.Sound.unlock(); window.Sound.startMusic();
    clearInterval(timerT);
    var teams = [0, 1].map(function (i) { return { name: tname(i), color: COLORS[i], char: M.chars[i] || 'boy', hp: M.hp, max: M.hp, streak: 0, best: 0, correct: 0, wrong: 0, dealt: 0, supers: 0 }; });
    G = window.__bt = { qm: new window.QuestionManager(bankOf(), 0), teams: teams, turn: 0, round: 1, state: 'idle', cur: null, chosen: null, askedAt: 0 };
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    ['qModal', 'rModal'].forEach(function (id) { $(id).classList.remove('show'); });
    [0, 1].forEach(function (i) {
      var t = teams[i], f = $('f' + i);
      f.className = 'fighter f' + i; f.style.setProperty('--tc', t.color);
      $('n' + i).textContent = t.name;
      $('img' + i).src = 'assets/characters/' + t.char + '-side.png';
    });
    paintTeacher(); show('play');
    paint();
  }
  function paint() {
    G.teams.forEach(function (t, i) {
      var pct = Math.max(0, t.hp) / t.max * 100;
      var bar = $('hp' + i); bar.style.width = pct + '%'; bar.className = pct <= 25 ? 'low' : pct <= 50 ? 'mid' : '';
      $('hpt' + i).textContent = Math.max(0, t.hp) + ' / ' + t.max;
      $('sk' + i).textContent = t.streak >= 2 ? '🔥 ×' + t.streak : '';
      $('f' + i).classList.toggle('myturn', i === G.turn && G.state !== 'over');
    });
    var t = G.teams[G.turn];
    $('hRound').textContent = 'الجولة ' + G.round;
    var tag = $('turnTag'); tag.style.background = t.color;
    tag.textContent = G.state === 'over' ? 'انتهت المعركة' : 'دور ' + t.name + (t.streak >= 2 ? ' — سلسلة ' + t.streak + ' 🔥' : '');
    $('askBtn').disabled = G.state !== 'idle';
  }
  function nextTurn() {
    G.turn = 1 - G.turn;
    if (G.turn === 0) G.round++;
    G.state = 'idle'; paint();
  }

  /* ---------- السؤال ---------- */
  function ask() {
    if (!G || G.state !== 'idle') return;
    var cur = null;
    for (var t = 0; t < 10 && !cur; t++) cur = G.qm.next();
    if (!cur) return finish(-1, 'empty');
    G.cur = cur; G.chosen = null; G.state = 'ask'; G.askedAt = performance.now();
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
      team.correct++; team.streak++; team.best = Math.max(team.best, team.streak);
      var dmg = D.damage + Math.min(D.streakMax, D.streakBonus * (team.streak - 1));
      var fast = M.time && secs <= M.time / 2;
      if (fast) dmg += D.speedBonus;
      var sup = team.streak % D.superEvery === 0;
      if (sup) { dmg *= 2; team.supers++; }
      $('qOpts').querySelector('.opt.sel').classList.add('good');
      fb.textContent = (sup ? '⚡ ضربة خارقة! ' : 'إجابة صحيحة! ') + 'قوة الضربة ' + dmg + (fast ? ' (+سرعة)' : '');
      fb.className = 'qfeedback ok';
      window.Sound.play('correct');
      setTimeout(function () { $('qModal').classList.remove('show'); attack(G.turn, dmg, sup); }, 1300);
    } else {
      team.wrong++; team.streak = 0;
      var sel = $('qOpts').querySelector('.opt.sel'); if (sel) sel.classList.remove('sel');
      fb.textContent = (why === 'time' ? 'انتهى الوقت. ' : '') + 'لا ضربة هذه المرة — حاولوا عندما يظهر السؤال لاحقًا 💪'; fb.className = 'qfeedback bad';
      $('qCard').classList.remove('shake'); void $('qCard').offsetWidth; $('qCard').classList.add('shake');
      window.Sound.play('wrong');
      setTimeout(function () { $('qModal').classList.remove('show'); var f = $('f' + G.turn); f.classList.add('miss'); setTimeout(function () { f.classList.remove('miss'); nextTurn(); }, 700); }, 1800);
    }
  }

  /* ---------- الضربة ---------- */
  function center(el) { var a = $('arena').getBoundingClientRect(), r = el.getBoundingClientRect(); return [r.left - a.left + r.width / 2, r.top - a.top + r.height * 0.45]; }
  function attack(a, dmg, sup) {
    G.state = 'attack';
    var d = 1 - a, fa = $('f' + a), fd = $('f' + d), fx = $('fx');
    fa.classList.add('lunge');
    window.Sound.play('jump');
    var p0 = center($('img' + a)), p1 = center($('img' + d));
    var orb = document.createElement('div'); orb.className = 'orb' + (sup ? ' super' : '');
    orb.style.setProperty('--oc', G.teams[a].color);
    orb.style.left = p0[0] + 'px'; orb.style.top = p0[1] + 'px';
    fx.appendChild(orb);
    setTimeout(function () { orb.style.transform = 'translate(' + (p1[0] - p0[0]) + 'px,' + (p1[1] - p0[1]) + 'px) scale(' + (sup ? 1.4 : 1) + ')'; }, 220);
    setTimeout(function () {
      orb.remove(); fa.classList.remove('lunge');
      var t = G.teams[d]; t.hp = Math.max(0, t.hp - dmg); G.teams[a].dealt += dmg;
      fd.classList.remove('hit'); void fd.offsetWidth; fd.classList.add('hit');
      var boom = document.createElement('div'); boom.className = 'boom' + (sup ? ' super' : ''); boom.style.left = p1[0] + 'px'; boom.style.top = p1[1] + 'px'; fx.appendChild(boom);
      var num = document.createElement('div'); num.className = 'dmg' + (sup ? ' super' : ''); num.textContent = '−' + dmg; num.style.left = p1[0] + 'px'; num.style.top = (p1[1] - 60) + 'px'; fx.appendChild(num);
      if (sup) { $('arena').classList.remove('quake'); void $('arena').offsetWidth; $('arena').classList.add('quake'); }
      window.Sound.play(sup ? 'clear' : 'stomp'); setTimeout(function () { window.Sound.play('hurt'); }, 120);
      paint();
      setTimeout(function () { boom.remove(); num.remove(); }, 1200);
      if (t.hp <= 0) { setTimeout(function () { fd.classList.add('down'); }, 500); setTimeout(function () { finish(a, 'ko'); }, 1700); }
      else setTimeout(nextTurn, 1100);
    }, 780);
  }

  /* ---------- النهاية ---------- */
  function finish(w, why) {
    if(window.GameSCORM){var correct=G.teams.reduce(function(a,t){return a+(t.correct||0);},0),wrong=G.teams.reduce(function(a,t){return a+(t.wrong||0);},0);window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}

    clearInterval(timerT); G.state = 'over';
    var T = G.teams;
    if (w < 0) w = T[0].hp === T[1].hp ? (T[0].dealt === T[1].dealt ? -1 : (T[0].dealt > T[1].dealt ? 0 : 1)) : (T[0].hp > T[1].hp ? 0 : 1);
    if (w >= 0) { $('img' + w).src = 'assets/characters/' + T[w].char + '-jump.png'; $('f' + w).classList.add('victory'); }
    $('winArt').innerHTML = w >= 0 ? '<span class="crown">👑</span><img src="assets/characters/' + T[w].char + '-jump.png" alt="">'
      : '<img src="assets/characters/' + T[0].char + '-jump.png" alt=""><img src="assets/characters/' + T[1].char + '-jump.png" alt="">';
    $('rTitle').textContent = w < 0 ? 'تعادل! معركة متكافئة' : why === 'ko' ? 'النصر لـ' + T[w].name + '!' : 'انتهت الأسئلة — الفائز: ' + T[w].name;
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit + ' • ' + G.round + ' جولات';
    var rows = [['الطاقة المتبقية', T[0].hp, T[1].hp], ['إجابات صحيحة', T[0].correct, T[1].correct], ['إجابات خاطئة', T[0].wrong, T[1].wrong], ['أطول سلسلة', T[0].best, T[1].best], ['ضربات خارقة', T[0].supers, T[1].supers], ['مجموع الضرر', T[0].dealt, T[1].dealt]];
    $('rTable').innerHTML = '<div class="vt-row vt-h"><span></span><b style="color:' + T[0].color + '">' + esc(T[0].name) + '</b><b style="color:' + T[1].color + '">' + esc(T[1].name) + '</b></div>' +
      rows.map(function (r) { return '<div class="vt-row"><span>' + r[0] + '</span><b>' + r[1] + '</b><b>' + r[2] + '</b></div>'; }).join('');
    var ra = $('rActions'); ra.innerHTML = '';
    [['معركة جديدة ↻', 'primary', startGame], ['تعديل الفريقين', 'ghost', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); openHome(); }], ['تغيير الدروس', 'teal', function () { $('rModal').classList.remove('show'); window.Sound.stopMusic(); show('setup'); renderSetup(); }]]
      .forEach(function (a) { var b = document.createElement('button'); b.className = 'btn big ' + a[1]; b.textContent = a[0]; b.onclick = a[2]; ra.appendChild(b); });
    paintTeacher(); paint();
    window.Sound.play('clear');
    setTimeout(function () { $('rModal').classList.add('show'); }, why === 'ko' ? 900 : 300);
  }
  function exitGame() { if (!G) return; clearInterval(timerT); G.state = 'over'; window.Sound.stopMusic(); $('qModal').classList.remove('show'); openHome(); }

  /* ---------- التحكم ---------- */
  function bind() {
    $('askBtn').onclick = ask;
    $('qConfirm').onclick = confirmAnswer;
    $('exitBtn').onclick = exitGame;
    $('startGame').onclick = startGame;
    $('backSetup').onclick = function () { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} show('setup'); renderSetup(); };
    window.addEventListener('keydown', function (e) {
      if (!$('play').classList.contains('active') || !G) return;
      if (e.code === 'Space' && G.state === 'idle') { e.preventDefault(); ask(); return; }
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
    if(window.GamePublish?.configure)window.GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'heroes-battle',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
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
    window.__battleStart = startGame;
  }
  function startBoot(){boot().catch(function(error){console.error('Game boot failed:',error);if(window.gameLibraryShowError){window.gameLibraryShowError(error);return;}var host=$('grades');if(host){host.textContent=error.message||'تعذر بدء اللعبة. أعد تحميل الصفحة.';var retry=document.createElement('button');retry.type='button';retry.textContent='إعادة المحاولة';retry.onclick=function(){location.reload();};host.appendChild(retry);}});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startBoot);else startBoot();
})();
