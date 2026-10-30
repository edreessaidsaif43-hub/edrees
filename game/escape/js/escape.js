/* «الهروب من قلعة جبرين»: غرفة هروب تعليمية؛ كل إجابة صحيحة تكشف دليلًا يفتح الأقفال حتى الخروج قبل الغروب.
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
    if(ready&&n<9){$('buildBtn').disabled=$('linkBtn').disabled=true;$('setupNote').textContent='تحتاج المغامرة 9 أسئلة على الأقل. اختر دروسًا أكثر (لديك '+n+' أسئلة).';}
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

  /* ---------- رسوم الغرف (SVG أصلية، 1600×900) ---------- */
  var DEFS = '<defs>' +
    '<linearGradient id="gWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2c193"/><stop offset="1" stop-color="#c99d68"/></linearGradient>' +
    '<linearGradient id="gWall2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7b27f"/><stop offset="1" stop-color="#b98b56"/></linearGradient>' +
    '<linearGradient id="gFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a87a4b"/><stop offset="1" stop-color="#7a5532"/></linearGradient>' +
    '<linearGradient id="gWood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b3f1d"/><stop offset=".5" stop-color="#8a5428"/><stop offset="1" stop-color="#5e3517"/></linearGradient>' +
    '<linearGradient id="gBrass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".35" stop-color="#e5b94a"/><stop offset=".7" stop-color="#b9862a"/><stop offset="1" stop-color="#7a5414"/></linearGradient>' +
    '<linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3c9a"/><stop offset=".45" stop-color="#e2667a"/><stop offset=".75" stop-color="#ff9a4d"/><stop offset="1" stop-color="#ffd27a"/></linearGradient>' +
    '<linearGradient id="gDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc8f2"/><stop offset="1" stop-color="#d5f0fc"/></linearGradient>' +
    '<radialGradient id="gGlow"><stop offset="0" stop-color="#fff6c4" stop-opacity=".95"/><stop offset=".5" stop-color="#ffd23f" stop-opacity=".45"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="gSun"><stop offset="0" stop-color="#fff8d6"/><stop offset=".6" stop-color="#ffc94d"/><stop offset="1" stop-color="#ff8a3d"/></radialGradient>' +
    '<pattern id="pMud" width="120" height="60" patternUnits="userSpaceOnUse"><path d="M0 30 Q30 26 60 31 T120 29" stroke="#a97c4c" stroke-opacity=".18" stroke-width="3" fill="none"/><circle cx="20" cy="12" r="2" fill="#8d6238" fill-opacity=".15"/><circle cx="90" cy="48" r="2.5" fill="#8d6238" fill-opacity=".12"/></pattern>' +
    '<pattern id="pCarpet" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#9b1d2a"/><path d="M40 6 L74 40 L40 74 L6 40Z" fill="#c43a3a" stroke="#f2c14e" stroke-width="3"/><circle cx="40" cy="40" r="9" fill="#1d4e6b" stroke="#f2c14e" stroke-width="2"/></pattern>' +
    '<pattern id="pCeil" width="120" height="70" patternUnits="userSpaceOnUse"><rect width="120" height="70" fill="#7a2e22"/><rect x="0" y="0" width="60" height="70" fill="#245c4a"/><circle cx="30" cy="35" r="16" fill="#e5b94a"/><circle cx="30" cy="35" r="8" fill="#7a2e22"/><path d="M90 10 L110 35 L90 60 L70 35Z" fill="#e5b94a"/><path d="M90 22 L100 35 L90 48 L80 35Z" fill="#245c4a"/></pattern>' +
    '<filter id="fSh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity=".35"/></filter>' +
    '</defs>';
  function studs(x0, y0, w, h, step) { var s = ''; for (var y = y0 + step / 2; y < y0 + h; y += step) for (var x = x0 + step / 2; x < x0 + w; x += step) s += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="url(#gBrass)"/>'; return s; }
  function archDoor(x, y, w, h, id) { // باب خشبي مقوّس بمسامير نحاسية
    var r = w / 2;
    return '<g id="' + id + '" class="door" filter="url(#fSh)">' +
      '<path d="M' + (x - 18) + ' ' + (y + h) + ' V' + (y + r) + ' A' + (r + 18) + ' ' + (r + 18) + ' 0 0 1 ' + (x + w + 18) + ' ' + (y + r) + ' V' + (y + h) + 'Z" fill="#7d5a36"/>' +
      '<g class="leaf" style="transform-origin:' + x + 'px ' + y + 'px">' +
      '<path d="M' + x + ' ' + (y + h) + ' V' + (y + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) + ' V' + (y + h) + 'Z" fill="url(#gWood)"/>' +
      '<path d="M' + (x + w / 2) + ' ' + y + ' V' + (y + h) + '" stroke="#4a2810" stroke-width="5"/>' +
      [0.33, 0.66].map(function (f) { return '<rect x="' + x + '" y="' + (y + r + (h - r) * f - 8) + '" width="' + w + '" height="16" fill="#4a2810" opacity=".7"/>'; }).join('') +
      studs(x + 14, y + r, w - 28, h - r - 20, 46) + '</g></g>';
  }
  function lockShape(x, y, kind) {
    var inner = kind === 'num' ? '<text x="' + x + '" y="' + (y + 22) + '" text-anchor="middle" font-size="26" font-weight="900" fill="#3b2408">١٢٣</text>' :
      kind === 'sym' ? '<text x="' + x + '" y="' + (y + 22) + '" text-anchor="middle" font-size="24" fill="#3b2408">☀☾★</text>' :
      '<circle cx="' + x + '" cy="' + (y + 6) + '" r="9" fill="#3b2408"/><rect x="' + (x - 4) + '" y="' + (y + 8) + '" width="8" height="20" fill="#3b2408"/>';
    return '<g class="hs lockhs" data-k="lock"><circle cx="' + x + '" cy="' + (y + 10) + '" r="78" class="hit"/>' +
      '<path d="M' + (x - 30) + ' ' + (y - 14) + ' V' + (y - 40) + ' A30 30 0 0 1 ' + (x + 30) + ' ' + (y - 40) + ' V' + (y - 14) + '" stroke="#9aa3ad" stroke-width="12" fill="none" class="shackle"/>' +
      '<rect x="' + (x - 52) + '" y="' + (y - 18) + '" width="104" height="70" rx="14" fill="url(#gBrass)" stroke="#6b4a12" stroke-width="4"/>' + inner + '</g>';
  }
  function hotspot(k, body, cx, cy, r, label) {
    return '<g class="hs" data-k="' + k + '" tabindex="0" role="button" aria-label="' + label + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" class="hit"/>' + body +
      '<g class="badge" transform="translate(' + (cx + r * 0.62) + ',' + (cy - r * 0.62) + ')"><circle r="24" fill="#22b35e" stroke="#fff" stroke-width="5"/><path d="M-10 0 L-3 8 L11 -8" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/></g></g>';
  }
  // ——— الغرفة 1: المجلس ———
  function room1() {
    var s = DEFS + '<rect width="1600" height="660" fill="url(#gWall)"/><rect width="1600" height="660" fill="url(#pMud)"/>';
    s += '<rect y="0" width="1600" height="70" fill="#5e3517"/>' + [80, 300, 520, 740, 960, 1180, 1400].map(function (x) { return '<rect x="' + x + '" y="0" width="40" height="86" fill="#4a2810"/>'; }).join('');
    // نافذة مقوّسة وضوء
    s += '<path d="M640 420 V210 A120 120 0 0 1 880 210 V420Z" fill="#7d5a36"/><path d="M660 410 V215 A100 100 0 0 1 860 215 V410Z" fill="url(#gDay)"/>' +
      '<path d="M760 115 V410 M660 290 H860" stroke="#6b3f1d" stroke-width="10"/><polygon points="660,410 860,410 1040,880 470,880" fill="#fff6c4" opacity=".16"/>';
    // كوّات
    [[150, 230], [1010, 230]].forEach(function (p) { s += '<path d="M' + p[0] + ' 470 V' + (p[1] + 70) + ' A70 70 0 0 1 ' + (p[0] + 140) + ' ' + (p[1] + 70) + ' V470Z" fill="#b48555" opacity=".75"/><path d="M' + (p[0] + 12) + ' 470 V' + (p[1] + 76) + ' A58 58 0 0 1 ' + (p[0] + 128) + ' ' + (p[1] + 76) + ' V470Z" fill="#8d6238" opacity=".55"/>'; });
    s += '<rect x="182" y="400" width="76" height="70" rx="10" fill="#2b6b8a"/><rect x="1040" y="410" width="34" height="60" fill="#e5b94a"/><rect x="1080" y="395" width="30" height="75" fill="#9b1d2a"/>';
    // أرضية وسجادة ومساند
    s += '<rect y="660" width="1600" height="240" fill="url(#gFloor)"/><path d="M300 700 H1180 L1260 900 H220Z" fill="url(#pCarpet)" stroke="#f2c14e" stroke-width="10"/>';
    s += '<rect x="40" y="560" width="1150" height="100" rx="30" fill="#9b1d2a"/><rect x="40" y="560" width="1150" height="22" rx="11" fill="#b8323d"/>' + [60, 320, 580, 840, 1100].map(function (x) { return '<rect x="' + x + '" y="520" width="70" height="80" rx="30" fill="#245c4a"/>'; }).join('');
    s += archDoor(1270, 210, 230, 450, 'door');
    // الدلّة والفناجين
    var dallah = '<g transform="translate(560,770)"><ellipse cx="0" cy="70" rx="150" ry="26" fill="#7a5414" opacity=".5"/><ellipse cx="0" cy="58" rx="140" ry="24" fill="url(#gBrass)"/>' +
      '<path d="M-40 50 Q-70 -10 -30 -40 Q-20 -70 0 -80 Q20 -70 30 -40 Q70 -10 40 50Z" fill="url(#gBrass)" stroke="#7a5414" stroke-width="3"/>' +
      '<path d="M-36 -20 Q-110 -40 -120 -90 Q-100 -60 -60 -50" fill="none" stroke="#c9952e" stroke-width="12" stroke-linecap="round"/>' +
      '<path d="M34 -30 Q80 -30 70 30" fill="none" stroke="#b9862a" stroke-width="9"/><path d="M-10 -80 L0 -118 L10 -80Z" fill="#e5b94a"/><circle cy="-122" r="9" fill="#fff0b0"/>' +
      [70, 100, 125].map(function (x) { return '<path d="M' + x + ' 55 l-12 -26 h28 l-12 26Z" fill="#f4f1ea" stroke="#9a8f7a" stroke-width="2"/>'; }).join('') + '</g>';
    s += hotspot(0, dallah, 560, 720, 150, 'الدّلّة');
    // المندوس
    var chest = '<g transform="translate(980,700)"><rect x="-120" y="20" width="240" height="120" rx="10" fill="url(#gWood)"/><path d="M-120 20 Q0 -50 120 20Z" fill="#7a4520" class="lid"/>' +
      '<rect x="-120" y="20" width="240" height="14" fill="#4a2810"/>' + studs(-110, 40, 220, 90, 30) + '<rect x="-18" y="56" width="36" height="40" rx="6" fill="url(#gBrass)"/></g>';
    s += hotspot(1, chest, 980, 760, 140, 'المندوس');
    // القنديل المعلّق
    var lamp = '<g transform="translate(400,80)"><line x1="0" y1="0" x2="0" y2="140" stroke="#3b2408" stroke-width="5"/><circle cy="210" r="90" fill="url(#gGlow)"/>' +
      '<path d="M-40 150 H40 L55 190 L40 280 H-40 L-55 190Z" fill="url(#gBrass)" stroke="#7a5414" stroke-width="4"/><path d="M-30 170 H30 L40 200 L30 265 H-30 L-40 200Z" fill="#ffe9a3"/>' +
      '<path d="M-25 140 H25 L40 150 H-40Z" fill="#b9862a"/><path d="M-12 280 L0 310 L12 280Z" fill="#b9862a"/></g>';
    s += hotspot(2, lamp, 400, 300, 120, 'القنديل');
    s += lockShape(1385, 520, 'num');
    return s;
  }
  // ——— الغرفة 2: المكتبة ———
  function room2() {
    var s = DEFS + '<rect width="1600" height="680" fill="url(#gWall2)"/><rect width="1600" height="680" fill="url(#pMud)"/>';
    s += '<rect y="0" width="1600" height="150" fill="url(#pCeil)"/><rect y="150" width="1600" height="18" fill="#4a2810"/>';
    // رفوف الكتب في الكوّات
    [[90, 230], [1000, 230]].forEach(function (p, j) {
      s += '<path d="M' + p[0] + ' 620 V' + (p[1] + 100) + ' A100 100 0 0 1 ' + (p[0] + 200) + ' ' + (p[1] + 100) + ' V620Z" fill="#8d6238"/>';
      for (var r = 0; r < 3; r++) {
        var y = p[1] + 130 + r * 110; s += '<rect x="' + (p[0] + 10) + '" y="' + (y + 80) + '" width="180" height="10" fill="#5e3517"/>';
        for (var b = 0; b < 7; b++) { var cols = ['#9b1d2a', '#245c4a', '#e5b94a', '#2b6b8a', '#7a2e22', '#3f5f2a', '#c27c2c']; var h = 55 + ((b * 7 + r * 3 + j) % 4) * 6; s += '<rect x="' + (p[0] + 16 + b * 25) + '" y="' + (y + 80 - h) + '" width="21" height="' + h + '" rx="3" fill="' + cols[(b + r + j) % 7] + '"/>'; }
      }
    });
    s += '<rect y="680" width="1600" height="220" fill="url(#gFloor)"/><path d="M380 720 H1000 L1060 900 H320Z" fill="url(#pCarpet)" stroke="#f2c14e" stroke-width="8" opacity=".95"/>';
    s += archDoor(1290, 230, 220, 450, 'door');
    // الرحل والمخطوطة
    var rehal = '<g transform="translate(560,640)"><path d="M-110 120 L0 -10 L110 120" stroke="#6b3f1d" stroke-width="18" fill="none"/><path d="M-110 120 L0 40 L110 120" stroke="#8a5428" stroke-width="12" fill="none"/>' +
      '<path d="M-130 -10 Q-65 -40 0 -10 Q65 -40 130 -10 L130 40 Q65 10 0 40 Q-65 10 -130 40Z" fill="#f6ecd2" stroke="#b39a6a" stroke-width="3"/>' +
      [-100, -80, -60, 20, 40, 60, 80].map(function (x, i) { return '<line x1="' + x + '" y1="' + (i < 3 ? -5 + i * 10 : -10 + (i - 3) * 10) + '" x2="' + (x + 30) + '" y2="' + (i < 3 ? -5 + i * 10 : -10 + (i - 3) * 10) + '" stroke="#6b5a3a" stroke-width="3"/>'; }).join('') + '</g>';
    s += hotspot(0, rehal, 560, 660, 150, 'المخطوطة');
    // الأسطرلاب
    var astro = '<g transform="translate(860,520)"><rect x="-60" y="170" width="120" height="16" fill="#5e3517"/><rect x="-10" y="90" width="20" height="90" fill="#6b3f1d"/>' +
      '<circle r="95" fill="url(#gBrass)" stroke="#6b4a12" stroke-width="5"/><circle r="70" fill="none" stroke="#7a5414" stroke-width="4"/><circle r="40" fill="#e9c66a" stroke="#7a5414" stroke-width="3"/>' +
      '<path d="M-90 0 H90 M0 -90 V90" stroke="#7a5414" stroke-width="3"/><path d="M-60 -60 L60 60" stroke="#3b2408" stroke-width="6" stroke-linecap="round"/><circle cy="-108" r="14" fill="none" stroke="#b9862a" stroke-width="6"/></g>';
    s += hotspot(1, astro, 860, 540, 125, 'الأسطرلاب');
    // نافذة خشبية مزخرفة
    var shutter = '<g transform="translate(660,190)"><rect x="-10" y="-10" width="200" height="260" rx="8" fill="#5e3517"/><rect width="180" height="240" fill="#8a5428"/>' +
      (function () { var g = ''; for (var y = 10; y < 230; y += 28) for (var x = 10; x < 170; x += 28) g += '<path d="M' + (x + 12) + ' ' + y + ' L' + (x + 24) + ' ' + (y + 12) + ' L' + (x + 12) + ' ' + (y + 24) + ' L' + x + ' ' + (y + 12) + 'Z" fill="#c9a06a" opacity=".8"/>'; return g; })() + '</g>';
    s += hotspot(2, shutter, 750, 310, 140, 'النافذة المزخرفة');
    s += lockShape(1400, 540, 'sym');
    return s;
  }
  // ——— الغرفة 3: سطح البرج ———
  function room3() {
    var s = DEFS + '<rect width="1600" height="900" fill="url(#gSky)"/><circle id="sun3" cx="1200" cy="470" r="90" fill="url(#gSun)"/>';
    s += '<path d="M0 520 L120 430 L260 480 L420 380 L560 460 L700 400 L860 470 L1000 390 L1160 450 L1320 400 L1480 460 L1600 420 V600 H0Z" fill="#6a4a73" opacity=".8"/>';
    s += '<path d="M0 560 L180 500 L360 540 L520 490 L720 545 L900 500 L1100 550 L1300 505 L1600 540 V620 H0Z" fill="#4c3a5c"/>';
    for (var i = 0; i < 16; i++) { var x = 40 + i * 100, h = 40 + (i * 37 % 30); s += '<path d="M' + x + ' 600 v-' + h + '" stroke="#2f4a2a" stroke-width="7"/><path d="M' + (x - 30) + ' ' + (600 - h) + ' Q' + x + ' ' + (590 - h - 30) + ' ' + (x + 30) + ' ' + (600 - h) + '" stroke="#2f5a2a" stroke-width="12" fill="none"/>'; }
    // الشرفات
    s += '<rect y="600" width="1600" height="300" fill="#c99d68"/><rect y="600" width="1600" height="300" fill="url(#pMud)"/>';
    for (var m = 0; m < 16; m++) s += '<path d="M' + (m * 100 + 10) + ' 600 V560 Q' + (m * 100 + 50) + ' 520 ' + (m * 100 + 90) + ' 560 V600Z" fill="#c99d68"/>';
    s += '<rect y="700" width="1600" height="200" fill="#b48555"/>';
    // المدفع
    var cannon = '<g transform="translate(330,650)"><ellipse cx="0" cy="110" rx="170" ry="22" fill="#000" opacity=".2"/><path d="M-140 -20 L150 -60 Q175 -60 175 -35 L170 10 L-140 40Z" fill="#3d3f45" stroke="#22242a" stroke-width="4"/>' +
      '<rect x="160" y="-62" width="22" height="76" rx="8" fill="#55585f"/><circle cx="-60" cy="60" r="55" fill="#6b3f1d" stroke="#3b2408" stroke-width="8"/><circle cx="-60" cy="60" r="12" fill="#e5b94a"/>' +
      [0, 60, 120, 180, 240, 300].map(function (a) { return '<line x1="-60" y1="60" x2="' + (-60 + 50 * Math.cos(a * Math.PI / 180)).toFixed(1) + '" y2="' + (60 + 50 * Math.sin(a * Math.PI / 180)).toFixed(1) + '" stroke="#3b2408" stroke-width="6"/>'; }).join('') + '</g>';
    s += hotspot(0, cannon, 340, 640, 170, 'المدفع');
    // المنظار
    var scope = '<g transform="translate(800,540)"><path d="M0 40 L-70 220 M0 40 L70 220 M0 40 L0 230" stroke="#5e3517" stroke-width="12" stroke-linecap="round"/>' +
      '<g transform="rotate(-18)"><rect x="-120" y="-22" width="240" height="44" rx="14" fill="url(#gBrass)" stroke="#6b4a12" stroke-width="4"/><rect x="100" y="-30" width="40" height="60" rx="10" fill="#b9862a"/><rect x="-150" y="-14" width="36" height="28" rx="6" fill="#7a5414"/></g></g>';
    s += hotspot(1, scope, 800, 620, 150, 'المنظار');
    // طاولة الخريطة
    var map = '<g transform="translate(1180,660)"><rect x="-130" y="40" width="260" height="20" fill="#5e3517"/><rect x="-110" y="60" width="18" height="110" fill="#6b3f1d"/><rect x="92" y="60" width="18" height="110" fill="#6b3f1d"/>' +
      '<path d="M-150 -20 L150 -20 L130 45 L-130 45Z" fill="#f2e2b8" stroke="#b39a6a" stroke-width="4"/><path d="M-100 0 Q-60 -14 -20 4 T60 0 T110 10" stroke="#2b6b8a" stroke-width="5" fill="none"/>' +
      '<path d="M30 10 L40 30 M40 10 L30 30" stroke="#c0392b" stroke-width="6"/><circle cx="-60" cy="22" r="8" fill="#3f5f2a"/><circle cx="-30" cy="28" r="6" fill="#3f5f2a"/></g>';
    s += hotspot(2, map, 1180, 660, 150, 'الخريطة');
    // بوابة النزول
    s += archDoor(1420, 300, 150, 300, 'door').replace('class="door"', 'class="door small"');
    s += lockShape(1495, 500, 'key');
    return s;
  }
  var ROOMS = [
    { name: 'المجلس', icon: '🛋️', draw: room1, kind: 'num', objs: ['الدّلّة', 'المندوس', 'القنديل'], intro: 'ابحث في المجلس: الدّلّة والمندوس والقنديل تخفي أرقام القفل.' },
    { name: 'المكتبة', icon: '📜', draw: room2, kind: 'sym', objs: ['المخطوطة', 'الأسطرلاب', 'النافذة المزخرفة'], intro: 'في المكتبة ثلاثة رموز مخبأة في المخطوطة والأسطرلاب والنافذة.' },
    { name: 'سطح البرج', icon: '🗝️', draw: room3, kind: 'key', objs: ['المدفع', 'المنظار', 'الخريطة'], intro: 'الشمس تقترب من الغروب! اجمع قطع المفتاح الثلاث وافتح البوابة.' }
  ];

  /* ---------- منطق غرفة الهروب ---------- */
  var SYM = ['☀', '☾', '★', '◆', '✿', '▲'];
  var POS = ['الأول', 'الثاني', 'الثالث'];
  var PIECES = ['رأس المفتاح', 'ساق المفتاح', 'أسنان المفتاح'];
  var M = store.get('escape-settings', null) || { char: 'girl', minutes: D.defaultMinutes, time: D.defaultTime };
  if (D.minutes.indexOf(M.minutes) < 0) M.minutes = D.defaultMinutes;
  if (D.times.indexOf(M.time) < 0) M.time = D.defaultTime;
  function saveM() { store.set('escape-settings', M); }
  function bestKey() { return 'escape-best:' + (SEL ? SEL.subject + '|' + SEL.unit + '|' + SEL.lessons.map(function (L) { return L.n; }).join(',') : ''); }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function openHome() {
    SEL = selection(); paintTeacher();
    $('homeTitle').textContent = SEL.subject + ' – الصف ' + SEL.gradeName;
    $('homeSub').textContent = SEL.unit + ' • ' + bankOf().qs.length + ' سؤالًا';
    charPicker($('charPick'), M.char, function (k) { M.char = k; saveM(); openHome(); });
    chips($('optMin'), D.minutes.map(function (m) { return m ? m + ' دقيقة' : 'بلا وقت'; }), D.minutes.indexOf(M.minutes), function (i) { M.minutes = D.minutes[i]; saveM(); openHome(); });
    chips($('optTime'), D.times.map(function (t) { return t ? t + ' ثانية' : 'بلا وقت'; }), D.times.indexOf(M.time), function (i) { M.time = D.times[i]; saveM(); openHome(); });
    window.GameRosters?.picker(S.index[S.grade].id,SEL.subject,[],{onChange:openHome});
    var b = store.get(bestKey(), null);
    $('best').textContent = b ? 'أفضل زمن هروب في هذه الدروس: ' + fmt(b) : '';
    var n = bankOf().qs.length;
    $('startGame').disabled = n < 9;
    if (n < 9) $('best').textContent = 'تحتاج المغامرة 9 أسئلة على الأقل — اختر دروسًا أكثر (لديك ' + n + ').';
    show('home');
  }

  var G = null, later = [], clockT = null;
  function wait(fn, ms) { later.push(setTimeout(fn, ms)); }
  function clearWait() { later.forEach(clearTimeout); later = []; clearInterval(clockT); }
  function startGame() {
    window.Sound.unlock(); window.Sound.startMusic();
    closeQuestion(); clearWait();
    var digits = [0, 1, 2].map(function () { return 1 + Math.floor(Math.random() * 9); });
    var syms = shuffle(SYM).slice(0, 3);
    G = window.__es = {
      qm: new window.QuestionManager(bankOf(), 0), room: 0, over: false, busy: false,
      codes: [digits, syms, PIECES],
      // لكل غرض موضع دليل عشوائي: الغرض k يكشف عنصر الرمز رقم order[k]
      orders: [shuffle([0, 1, 2]), shuffle([0, 1, 2]), [0, 1, 2]],
      found: [[], [], []], wrong: 0, correct: 0, left: M.minutes * 60, total: M.minutes * 60, started: performance.now(), opened: 0
    };
    $('rModal').classList.remove('show'); ['lockModal', 'clueModal'].forEach(function (id) { $(id).classList.remove('show'); });
    $('hSubj').textContent = SEL.subject + ' • الصف ' + SEL.gradeName;
    $('guide').src = 'assets/characters/' + M.char + '-walk.png';
    paintTeacher(); show('play');
    enterRoom(0);
    if (M.minutes) {
      var last = performance.now();
      clockT = setInterval(function () {
        if (!G || G.over) return;
        var now = performance.now(), dt = (now - last) / 1000; last = now;
        if (!Q && !$('clueModal').classList.contains('show')) G.left -= dt; // الوقت يتوقف أثناء قراءة السؤال
        paintSun();
        if (G.left <= 0) finish('time');
      }, 250);
    }
    paintSun();
  }
  function paintSun() {
    if (!M.minutes) { $('sunFill').style.width = '100%'; $('sunTxt').textContent = '☀ بلا وقت'; return; }
    var f = Math.max(0, G.left / G.total);
    $('sunFill').style.width = (f * 100) + '%';
    $('sunbar').classList.toggle('low', f < 0.2);
    $('sunTxt').textContent = '☀ ' + fmt(G.left);
  }
  function enterRoom(r) {
    G.room = r; G.busy = true;
    var R = ROOMS[r], svg = $('room');
    $('fade').className = 'es-fade on';
    wait(function () {
      svg.innerHTML = R.draw();
      $('hRoom').textContent = 'الغرفة ' + (r + 1) + ' / 3 • ' + R.icon + ' ' + R.name;
      svg.querySelectorAll('.hs').forEach(function (g) {
        var go = function () { clickHotspot(g.dataset.k); };
        g.addEventListener('click', go);
        g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      });
      paintRoom(); paintBag();
      $('fade').className = 'es-fade';
      showTitleCard(R);
      tip(R.intro);
      G.busy = false;
    }, 450);
  }
  function showTitleCard(R) {
    var c = document.createElement('div'); c.className = 'es-title'; c.innerHTML = '<small>الغرفة ' + (G.room + 1) + ' من 3</small><b>' + R.icon + ' ' + R.name + '</b>';
    $('stage').appendChild(c); setTimeout(function () { c.remove(); }, 2300);
  }
  var tipT = null;
  function tip(t) { var e = $('tip'); e.textContent = t; e.className = 'es-tip'; void e.offsetWidth; e.className = 'es-tip show'; clearTimeout(tipT); tipT = setTimeout(function () { e.className = 'es-tip'; }, 5500); }
  function paintRoom() {
    var f = G.found[G.room];
    $('room').querySelectorAll('.hs[data-k]').forEach(function (g) {
      var k = g.dataset.k;
      if (k === 'lock') g.classList.toggle('ready', f.length === 3);
      else g.classList.toggle('done', f.indexOf(+k) >= 0);
    });
  }
  function clueValue(r, k) { return G.codes[r][G.orders[r][k]]; }
  function slotHTML(r, k) {
    var pos = G.orders[r][k], v = clueValue(r, k);
    if (r === 2) return '<span class="slot key k' + pos + '"><i></i><small>' + v + '</small></span>';
    return '<span class="slot"><b>' + v + '</b><small>' + (r === 0 ? 'الرقم ' : 'الرمز ') + POS[pos] + '</small></span>';
  }
  function paintBag() {
    var r = G.room, f = G.found[r], h = '';
    f.forEach(function (k) { h += slotHTML(r, k); });
    for (var i = f.length; i < 3; i++) h += '<span class="slot empty">?</span>';
    $('slots').innerHTML = h;
    $('hint').textContent = f.length < 3 ? 'وجدت ' + f.length + ' من 3 أدلة — اضغط على الأشياء المضيئة' : '🔓 جمعت الأدلة! اضغط على القفل';
  }
  function clickHotspot(k) {
    if (!G || G.over || G.busy || Q) return;
    if (k === 'lock') return openLock();
    k = +k;
    if (G.found[G.room].indexOf(k) >= 0) { tip('فحصت ' + ROOMS[G.room].objs[k] + ' من قبل ✓ — جرّب شيئًا آخر.'); return; }
    G.busy = true;
    window.Sound.play('jump');
    showQuestion(G.qm, { time: M.time, tag: '🔍 ' + ROOMS[G.room].objs[k], color: '#7a4a1f', okText: 'إجابة صحيحة! وجدت دليلًا 🗝️', badText: 'ما زال ' + ROOMS[G.room].objs[k] + ' مغلقًا' + (M.minutes ? ' (−' + D.penalty + ' ثانية)' : '') + ' — حاول مرة أخرى بسؤال آخر' }, function (ok) {
      G.busy = false;
      if (!G || G.over) return;
      if (ok === null) return finish('empty');
      if (ok) {
        G.correct++; G.found[G.room].push(k);
        var r = G.room, v = clueValue(r, k), pos = G.orders[r][k];
        $('clueIc').innerHTML = r === 2 ? '<span class="slot key big k' + pos + '"><i></i></span>' : '<b>' + v + '</b>';
        $('clueTitle').textContent = r === 2 ? 'وجدت ' + v + '!' : 'وجدت ورقة مخبأة في ' + ROOMS[r].objs[k] + '!';
        $('clueText').textContent = r === 0 ? 'مكتوب فيها: «الرقم ' + POS[pos] + ' في القفل هو ' + v + '»' : r === 1 ? 'مرسوم فيها: «الرمز ' + POS[pos] + ' في القفل هو ' + v + '»' : 'قطعة من مفتاح البوابة النحاسي.';
        $('clueModal').classList.add('show');
        window.Sound.play('coin');
        $('guide').src = 'assets/characters/' + M.char + '-jump.png'; $('guide').classList.add('cheer');
        wait(function () { $('guide').src = 'assets/characters/' + M.char + '-walk.png'; $('guide').classList.remove('cheer'); }, 1500);
      } else {
        G.wrong++;
        if (M.minutes) { G.left = Math.max(0, G.left - D.penalty); paintSun(); }
        var g = $('room').querySelector('.hs[data-k="' + k + '"]'); if (g) { g.classList.remove('nope'); void g.getBBox(); g.classList.add('nope'); }
        tip('لم يُفتح ' + ROOMS[G.room].objs[k] + ' بعد. ابحث في شيء آخر أو عُد إليه.');
      }
    });
  }
  /* ---------- الأقفال ---------- */
  var dialVals = [];
  function openLock() {
    var r = G.room, f = G.found[r], R = ROOMS[r];
    if (f.length < 3) { tip('🔒 القفل يحتاج 3 أدلة. وجدت ' + f.length + ' فقط — ابحث في الأشياء المضيئة.'); window.Sound.play('hurt'); var lh = $('room').querySelector('.lockhs'); lh.classList.remove('nope'); void lh.getBBox(); lh.classList.add('nope'); return; }
    $('lockMsg').textContent = ''; $('lockMsg').className = 'es-lock-msg';
    var d = $('dials'); d.innerHTML = ''; dialVals = [];
    if (R.kind === 'key') {
      $('lockTitle').textContent = 'بوابة النزول'; $('lockSub').textContent = 'ركّب قطع المفتاح الثلاث، ثم افتح البوابة.';
      d.className = 'es-dials keybuild';
      d.innerHTML = '<div class="keyfull"><span class="slot key k0"><i></i></span><span class="slot key k1"><i></i></span><span class="slot key k2"><i></i></span></div>';
      $('lockTry').textContent = 'ركّب المفتاح وافتح البوابة 🗝️';
    } else {
      var opts = R.kind === 'num' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : SYM;
      $('lockTitle').textContent = R.kind === 'num' ? 'قفل الأرقام' : 'قفل الرموز';
      $('lockSub').textContent = 'أدخل ' + (R.kind === 'num' ? 'الأرقام' : 'الرموز') + ' بالترتيب: الأول من اليمين. انظر إلى الأدلة في حقيبتك.';
      d.className = 'es-dials';
      [0, 1, 2].forEach(function (i) {
        dialVals[i] = 0;
        var w = document.createElement('div'); w.className = 'dial';
        w.innerHTML = '<button type="button" class="up" aria-label="التالي">▲</button><b id="dv' + i + '">' + opts[0] + '</b><button type="button" class="down" aria-label="السابق">▼</button><small>' + POS[i] + '</small>';
        var set = function (dlt) { dialVals[i] = (dialVals[i] + dlt + opts.length) % opts.length; $('dv' + i).textContent = opts[dialVals[i]]; window.Sound.play('coin'); };
        w.querySelector('.up').onclick = function () { set(1); }; w.querySelector('.down').onclick = function () { set(-1); };
        d.appendChild(w);
      });
      $('lockTry').textContent = 'افتح القفل 🔓';
    }
    $('lockModal').classList.add('show');
  }
  function tryLock() {
    var r = G.room, R = ROOMS[r], ok;
    if (R.kind === 'key') ok = true;
    else { var opts = R.kind === 'num' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : SYM; ok = [0, 1, 2].every(function (i) { return opts[dialVals[i]] === G.codes[r][i]; }); }
    if (!ok) {
      var box = $('lockBox'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      $('lockMsg').textContent = 'الرمز غير صحيح. راجع الأدلة وانتبه للترتيب (الأول، الثاني، الثالث).'; $('lockMsg').className = 'es-lock-msg bad';
      window.Sound.play('wrong'); return;
    }
    $('lockMsg').textContent = 'انفتح القفل! 🔓'; $('lockMsg').className = 'es-lock-msg ok';
    window.Sound.play('clear'); G.busy = true; G.opened++;
    if (R.kind === 'key') $('dials').classList.add('joined');
    wait(function () {
      $('lockModal').classList.remove('show');
      var lh = $('room').querySelector('.lockhs'); if (lh) lh.classList.add('open');
      var door = $('room').querySelector('#door'); if (door) door.classList.add('open');
      tip(r < 2 ? 'انفتح الباب! هيا إلى الغرفة التالية…' : 'انفتحت البوابة! أنت حر 🎉');
    }, 900);
    wait(function () { if (r < 2) enterRoom(r + 1); else finish('escaped'); }, 2600);
  }
  /* ---------- النهاية ---------- */
  function finish(why) {
    if (!G || G.over) return;
    if(window.GameSCORM){var correct=G.correct||0,wrong=G.wrong||0;window.GameSCORM.report({score:correct+wrong?100*correct/(correct+wrong):0,completed:true});}
    G.over = true; closeQuestion(); clearWait();
    ['lockModal', 'clueModal'].forEach(function (id) { $(id).classList.remove('show'); });
    var used = (performance.now() - G.started) / 1000;
    var stars = why !== 'escaped' ? 0 : G.wrong <= 1 ? 3 : G.wrong <= 4 ? 2 : 1;
    if (why === 'escaped') { var b = store.get(bestKey(), null); if (!b || used < b) store.set(bestKey(), Math.round(used)); window.Sound.play('clear'); }
    else window.Sound.play('gameover');
    $('winArt').innerHTML = (why === 'escaped' ? '<span class="crown">🏆</span>' : '') + '<img src="assets/characters/' + M.char + '-jump.png" alt="">';
    $('rTitle').textContent = why === 'escaped' ? 'هربت من قلعة جبرين! ' + '⭐'.repeat(stars) : why === 'time' ? 'غربت الشمس قبل الهروب 🌇' : 'انتهت أسئلة الدروس المختارة';
    $('rLesson').textContent = SEL.subject + ' • ' + SEL.unit;
    var rows = [['الغرف المفتوحة', G.opened + ' / 3'], ['الأدلة', G.found.reduce(function (a, f) { return a + f.length; }, 0) + ' / 9'], ['إجابات صحيحة', G.correct], ['إجابات خاطئة', G.wrong], ['الزمن', fmt(used)]];
    var best = store.get(bestKey(), null); if (best) rows.push(['أفضل زمن هروب', fmt(best)]);
    $('rTable').innerHTML = rows.map(function (r) { return '<div class="vt-row pl-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
      '<p class="cs-fact">🏰 قلعة جبرين في ولاية بهلاء، بُنيت في أواخر القرن السابع عشر الميلادي في عهد الإمام بلعرب بن سلطان اليعربي، وتشتهر بسقوفها الخشبية المزخرفة.</p>';
    resultsActions(startGame, openHome);
    paintTeacher();
    wait(function () { $('rModal').classList.add('show'); }, 300);
  }
  function exitGame() { if (!G) return; G.over = true; closeQuestion(); clearWait(); window.Sound.stopMusic(); openHome(); }
  function bind() {
    bindCommon();
    $('startGame').onclick = startGame;
    $('exitBtn').onclick = exitGame;
    $('lockTry').onclick = tryLock;
    $('lockClose').onclick = function () { $('lockModal').classList.remove('show'); };
    $('clueOk').onclick = function () { $('clueModal').classList.remove('show'); paintRoom(); paintBag(); if (G.found[G.room].length === 3) tip('🔓 جمعت أدلة الغرفة! اضغط على القفل.'); };
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
    if(window.GamePublish?.configure)window.GamePublish.configure(function(){readTeacher();var sel=selection();return {version:1,id:crypto.randomUUID(),game:'escape',title:cfg.title||document.title,gradeId:S.index[S.grade].id,gradeName:'الصف '+S.index[S.grade].n,subject:sel.subject,sem:sel.sem,unit:sel.unit,lessons:JSON.parse(JSON.stringify(sel.lessons)),teacher:{name:S.teacher.name,ig:S.teacher.ig}};});
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
