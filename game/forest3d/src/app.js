/* غابة الهدوء 3D — واجهة المعلم، الميكروفون، منطق الهروب والعودة، الأصوات والتقرير */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var store = { get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var DURS = [0, 10, 20, 30, 45], RETS = [['سريعة', 6], ['عادية', 10], ['بطيئة', 16]], STARS = [1, 2, 3], QS = [['high', 'عالية'], ['medium', 'متوسطة'], ['low', 'خفيفة']];
  function autoQ() { var small = Math.min(screen.width, screen.height) < 700; return small ? 'low' : 'medium'; }
  var S = store.get('forest-calm', null) || {};
  S = { cls: S.cls || '', tch: S.tch || '', sens: S.sens || 5, dur: DURS.indexOf(S.dur) >= 0 ? S.dur : 0, ret: S.ret >= 0 && S.ret < 3 ? S.ret : 1, star: STARS.indexOf(S.star) >= 0 ? S.star : 2, q: S.q || autoQ(), snd: S.snd !== false, meter: S.meter !== false };
  function save() { store.set('forest-calm', S); }
  var WARN = 55, LOUD = 75;
  var ENG = null, GL = window.ForestEngine && window.ForestEngine.supported();
  var urlQ = new URLSearchParams(location.search);
  var standalone = location.protocol === 'file:', canStart = false;

  async function verifyLibraryAccess() {
    if (standalone) return;
    if (typeof refreshSubscriptionStatus !== 'function') throw new Error('تعذر تحميل نظام الاشتراك. أعد تحميل الصفحة.');
    if (!getSubscriptionUserId()) throw new Error('سجّل الدخول من مكتبة الألعاب لتشغيل غابة الهدوء.');
    $('note').textContent = 'جارٍ التحقق من الاشتراك…';
    var status = await refreshSubscriptionStatus();
    if (status.loadError) throw new Error(status.loadError);
    var grades = subscriptionGradeDefinitions(), subjects = getActiveSubscriptionSubjects();
    var subscribed = subjects.length
      ? subjects.some(function (item) { return grades.some(function (grade) { return isSameSubscriptionGrade(item.grade, grade.display); }); })
      : grades.some(function (grade) { return isGradeSubscribed(grade.display); });
    if (!subscribed) throw new Error('فعّل اشتراك إحدى المواد من مكتبة الألعاب لتشغيل غابة الهدوء.');
  }

  /* ---------- المحرك ---------- */
  function engine() {
    if (ENG && ENG.q === S.q) return ENG;
    if (ENG) { ENG.stop(); var c = $('stage').querySelector('canvas'); if (c) c.remove(); try { ENG.renderer.dispose(); } catch (e) {} }
    ENG = window.ForestEngine.create($('stage'), { quality: S.q, preserve: urlQ.get('shot') === '1' }); ENG.q = S.q; window.__forest = ENG;
    ENG.debug.onSfx = function (n) { sfx(n); };
    ENG.start(); return ENG;
  }

  /* ---------- شاشة البداية ---------- */
  function chips(el, labels, idx, cb) { el.innerHTML = labels.map(function (l, i) { return '<button class="chip' + (i === idx ? ' on' : '') + '">' + l + '</button>'; }).join(''); Array.prototype.forEach.call(el.children, function (b, i) { b.onclick = function () { cb(i); }; }); }
  function sensName(v) { return v; }
  function paintStart() {
    $('className').value = S.cls; $('teacherName').value = S.tch;
    $('sens').value = S.sens; $('sensVal').textContent = S.sens;
    chips($('optDur'), DURS.map(function (d) { return d ? d + ' دقيقة' : 'بلا مؤقّت'; }), DURS.indexOf(S.dur), function (i) { S.dur = DURS[i]; save(); paintStart(); });
    chips($('optRet'), RETS.map(function (r) { return r[0]; }), S.ret, function (i) { S.ret = i; save(); paintStart(); });
    chips($('optStar'), STARS.map(function (m) { return m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : '3 دقائق'; }), STARS.indexOf(S.star), function (i) { S.star = STARS[i]; save(); paintStart(); });
    chips($('optQ'), QS.map(function (q) { return q[1]; }), QS.map(function (q) { return q[0]; }).indexOf(S.q), function (i) { S.q = QS[i][0]; save(); paintStart(); if (canStart) engine(); });
    chips($('optSnd'), ['تشغيل', 'إيقاف'], S.snd ? 0 : 1, function (i) { S.snd = !i; save(); paintStart(); });
    if (!GL) { $('note').textContent = '⚠️ هذا المتصفح لا يدعم الرسوم ثلاثية الأبعاد (WebGL). جرّب Chrome أو Edge حديثًا.'; $('goMic').disabled = $('goManual').disabled = true; }
  }
  $('className').oninput = function () { S.cls = this.value.trim(); save(); };
  $('teacherName').oninput = function () { S.tch = this.value.trim(); save(); };
  $('sens').oninput = function () { S.sens = +this.value; $('sensVal').textContent = S.sens; save(); };
  function show(id, on) { $(id).classList.toggle('show', on); }

  /* ---------- الميكروفون ---------- */
  var AC = null, AN = null, BUF = null, MIC = null, floorDb = -58, envDb = -90;
  function audioCtx() { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} return AC; }
  function openMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('nomic'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } }).then(function (st) {
      MIC = st; var c = audioCtx(), src = c.createMediaStreamSource(st); AN = c.createAnalyser(); AN.fftSize = 2048; AN.smoothingTimeConstant = 0; src.connect(AN); BUF = new Float32Array(AN.fftSize);
    });
  }
  function readDb() {
    if (!AN) return -90; AN.getFloatTimeDomainData(BUF); var s = 0; for (var i = 0; i < BUF.length; i++) s += BUF[i] * BUF[i];
    var db = 20 * Math.log10(Math.sqrt(s / BUF.length) + 1e-9); envDb = db > envDb ? envDb + (db - envDb) * .55 : envDb + (db - envDb) * .07; return envDb;
  }
  function rangeDb() { return [44, 39, 35, 31, 28, 25, 22, 19, 16, 13][S.sens - 1]; }
  function levelFromDb(db) { return Math.max(0, Math.min(100, (db - floorDb - 3) / rangeDb() * 100)); }

  /* ---------- الأصوات ---------- */
  var OUT = null, AMB = null;
  function out() { var c = audioCtx(); if (!c) return null; if (!OUT) { OUT = c.createGain(); OUT.gain.value = .4; OUT.connect(c.destination); } return c; }
  function noiseBuf(dur) { var n = AC.sampleRate * dur, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
  function env(g, t, a, p, d) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(p, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + d); }
  function tone(t, f, type, p, d, f2) { var o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d); o.connect(g); g.connect(OUT); env(g, t, .01, p, d); o.start(t); o.stop(t + d + .05); }
  function nz(t, d, type, f1, f2, p, a) { var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = noiseBuf(d + .1); f.type = type; f.frequency.setValueAtTime(f1, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + d); s.connect(f); f.connect(g); g.connect(OUT); env(g, t, a || .02, p, d); s.start(t); }
  function chirp(t, base) { for (var i = 0; i < 3; i++) tone(t + i * .11, base * (1 + i * .08), 'sine', .05, .08, base * 1.5); }
  var gateUntil = 0;
  var FX = {
    rustle: function (t) { nz(t, .7, 'bandpass', 2500, 900, .22, .03); for (var i = 0; i < 6; i++) nz(t + .1 + i * .09, .06, 'lowpass', 600, 0, .12); },
    wings: function (t) { for (var i = 0; i < 7; i++) nz(t + i * .07, .06, 'bandpass', 1400, 0, .2); chirp(t, 2600); },
    'return': function (t) { [784, 988, 1175].forEach(function (f, i) { tone(t + i * .1, f, 'triangle', .07, .45); }); },
    star: function (t) { [1047, 1319, 1568, 2093].forEach(function (f, i) { tone(t + i * .09, f, 'triangle', .09, .6); }); },
    leo: function (t) { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(t + i * .12, f, 'sine', .08, .9); }); },
    end: function (t) { [523, 659, 784, 1047].forEach(function (f, i) { tone(t + i * .15, f, 'triangle', .1, .8); }); }
  };
  function sfx(n) { if (!S.snd) return; var c = out(); if (!c || !FX[n]) return; gateUntil = performance.now() + 700; try { FX[n](c.currentTime + .01); } catch (e) {} }
  // صوت الغابة: الشلال والريح وتغريد متقطّع
  function ambient(on) {
    if (!on || !S.snd) { if (AMB) { clearTimeout(AMB.to); try { AMB.src.stop(); } catch (e) {} AMB = null; } return; }
    var c = out(); if (!c || AMB) return;
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noiseBuf(4); s.loop = true; f.type = 'lowpass'; f.frequency.value = 650; g.gain.value = .06; s.connect(f); f.connect(g); g.connect(OUT); s.start();
    AMB = { src: s };
    (function birds() { if (!AMB) return; if (!G || (!G.paused && G.cnt > 2)) { var t = AC.currentTime + .05, b = 2200 + Math.random() * 1600; if (Math.random() < .6) chirp(t, b); else { tone(t, b, 'sine', .035, .18, b * .7); tone(t + .22, b * 1.1, 'sine', .03, .16, b * .8); } } AMB.to = setTimeout(birds, 2500 + Math.random() * 4500); })();
  }

  /* ---------- اللعب ---------- */
  var G = null, raf = 0;
  function emRow() { var E = ENG.debug; return E.groups.slice(1).map(function (g) { return { g: g.g, em: g.list[0].c.em }; }); }
  function startSession(manual) {
    if (!canStart) return;
    engine(); audioCtx();
    G = window.__calm = { manual: manual, L: 0, H: 0, alert: 0, quietT: 0, lastRet: 0, streak: 0, best: 0, stars: 0, flees: 0, returns: 0, t: 0, calmSec: 0, warnSec: 0, loudSec: 0, samples: [], secAcc: 0, secMax: 0, paused: false, talk: false, cool: 0, burstT: 0, simNoise: false, leoVisits: 0, sStars: 0, leoDone: false, ended: false, left: S.dur * 60, cnt: 99 };
    ENG.returnAll(); ENG.debug.agents.forEach(function (a) { if (a.c.rare && a.state !== 'gone') { a.state = 'gone'; a.o.visible = false; } });
    ENG.debug.fled = [];
    show('start', false); $('dim').classList.add('off');
    $('hClass').textContent = [S.cls, S.tch].filter(Boolean).join(' • ') || 'التحضير الذكي للمعلم العماني';
    $('hTimeBox').style.display = S.dur ? '' : 'none';
    $('hEm').innerHTML = emRow().map(function (r) { return '<span data-g="' + r.g + '">' + r.em + '</span>'; }).join('');
    $('meter').classList.toggle('off', !S.meter); $('bMeter').classList.toggle('on', S.meter); $('bSound').textContent = ''; paintSound(); $('bSens').textContent = S.sens;
    show('hud', true); paintHud(); ambient(true);
    if (manual) { $('bNoise').style.display = ''; banner('🌳 الغابة هادئة', 'وضع التجربة: اضغط مطوّلًا على 📢 أو حرف N لمحاكاة الضجيج', 'good', 3800); loopStart(); return; }
    $('bNoise').style.display = urlQ.get('demo') ? '' : 'none';
    openMic().then(function () { calibrate(); }).catch(function () {
      ambient(false); stopMic();
      show('hud', false); show('start', true); $('dim').classList.remove('off');
      $('note').textContent = '⚠️ تعذّر الوصول إلى الميكروفون. اسمح للمتصفح باستخدام الميكروفون، أو جرّب «تجربة بدون ميكروفون».'; G = null;
    });
  }
  function calibrate() {
    show('calib', true); var t0 = performance.now(), vals = [], D = 3000, my = G;
    (function step() {
      if (G !== my) return;
      var db = readDb(), k = Math.min(1, (performance.now() - t0) / D); vals.push(db);
      $('calRing').style.strokeDashoffset = 327 * (1 - k); $('calNum').textContent = Math.max(1, Math.ceil(3 - k * 3));
      $('calBar').style.width = Math.max(0, Math.min(100, (db + 80) / 60 * 100)) + '%';
      if (k < 1 && !my.skip) { requestAnimationFrame(step); return; }
      vals.sort(function (a, b) { return a - b; }); var med = vals.length ? vals[Math.floor(vals.length * .5)] : -58;
      floorDb = Math.max(-75, Math.min(-30, med)); if (my.skip && vals.length < 20) floorDb = -58;
      show('calib', false); banner('🌳 الغابة تستمع الآن', 'حافظوا على الهدوء لتبقى الحيوانات', 'good', 3200); loopStart();
    })();
  }
  $('calSkip').onclick = function () { if (G) G.skip = true; };
  function loopStart() { G.last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); hideBarSoon(); }
  function fmt(s) { s = Math.max(0, Math.floor(s)); var m = Math.floor(s / 60), x = s % 60; return (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  function loop(now) {
    if (!G || G.ended) return; raf = requestAnimationFrame(loop);
    var dt = Math.min(.25, (now - G.last) / 1000); G.last = now;
    if (G.paused) return;
    // مستوى الصوت
    var L = 0;
    if (G.talk) L = 0;
    else if (G.manual || G.simNoise) L = G.simNoise ? Math.min(100, (G.L || 0) + dt * 160) : 0;
    else { L = levelFromDb(readDb()); if (performance.now() < gateUntil) L = Math.min(L, WARN - 1); }
    if (G.simNoise && !G.manual && !G.talk) L = Math.max(L, Math.min(100, (G.L || 0) + dt * 160));
    G.L = L; G.t += dt;
    // الحرارة: ضجيج متواصل يملؤها، والهدوء يفرغها
    G.cool = Math.max(0, G.cool - dt);
    if (L >= LOUD) G.H += dt * .85 * (1 + (L - LOUD) / 25); else if (L >= WARN) G.H += dt * .1; else G.H = Math.max(0, G.H - dt * .35);
    if (L >= 97) G.burstT += dt; else G.burstT = 0;
    var fled = 0;
    if (G.burstT > .3 && G.cool <= 0) { fled = fleeN(3); G.burstT = 0; G.cool = 2.2; G.H = .3; ENG.shake(.8); }
    else if (G.H >= 1 && G.cool <= 0) { fled = fleeN(1); G.H = .35; G.cool = 1.1; }
    G.H = Math.min(1.2, G.H);
    // تنبّه الحيوانات
    var al = Math.max(0, Math.min(1, (L - WARN + 8) / 22)); G.alert += (Math.max(al, G.H > .3 ? .6 : 0) - G.alert) * Math.min(1, dt * 4); ENG.setAlert(G.alert);
    $('shh').classList.toggle('on', L >= WARN && !G.talk);
    // الهدوء والعودة والنجوم
    if (L < WARN) G.quietT += dt; else if (L >= LOUD) G.quietT = 0;
    if (fled) { G.streak = 0; G.quietT = 0; G.sStars = 0; }
    else G.streak += dt;
    G.best = Math.max(G.best, G.streak);
    var rd = RETS[S.ret][1];
    if (G.quietT >= rd && G.t - G.lastRet >= rd * .6) { var r = ENG.returnNext(); if (r) { G.returns++; G.lastRet = G.t; banner('عاد ' + r.ar + ' ' + r.em, 'الهدوء يعيد الحيوانات ✨', 'good', 2200); pop(r.g); } else G.lastRet = G.t; }
    var si = S.star * 60;
    if (Math.floor(G.streak / si) > G.sStars) { G.sStars = Math.floor(G.streak / si); G.stars++; sfx('star'); banner('⭐ نجمة هدوء!', 'أحسنتم — ' + (S.star === 1 ? 'دقيقة' : S.star === 2 ? 'دقيقتان' : '3 دقائق') + ' دون أن تهرب الحيوانات', 'gold', 3000); }
    // زيارة النمر العربي: الغابة مكتملة وهدوء طويل
    var c = ENG.counts(); G.cnt = c.groupsHere;
    if (!G.leoDone && c.groupsHere === c.groups && G.streak >= Math.max(150, si * 1.5) && !ENG.hasLeopard()) { if (ENG.leopardVisit()) { G.leoDone = true; G.leoVisits++; sfx('leo'); banner('🐆 زائر نادر: النمر العربي!', 'هدوؤكم الرائع أخرجه من مخبئه — لا تخيفوه!', 'gold', 4500); } }
    if (fled) G.leoDone = false;
    // إحصاءات كل ثانية
    G.secAcc += dt; G.secMax = Math.max(G.secMax, L);
    if (G.secAcc >= 1) { G.samples.push(Math.round(G.secMax)); if (G.secMax >= LOUD) G.loudSec++; else if (G.secMax >= WARN) G.warnSec++; else G.calmSec++; G.secAcc -= 1; G.secMax = 0; }
    if (S.dur) { G.left -= dt; if (G.left <= 0) { endSession(true); return; } }
    paintHud();
  }
  function fleeN(n) { var k = 0, names = []; for (var i = 0; i < n; i++) { var r = ENG.fleeNext(); if (!r) break; k++; names.push(r.ar + ' ' + r.em); pop(r.g); } if (k) { G.flees++; banner(k > 1 ? 'ضجيج كبير! هربت حيوانات كثيرة 😟' : 'هرب ' + names[0] + '!', k > 1 ? names.join(' • ') : 'اخفضوا أصواتكم لتعود', 'bad', 2400); if (ENG.counts().groupsHere === 0) banner('أصبحت الغابة خالية… 🍂', 'لنهدأ جميعًا لتعود الحيوانات', 'bad', 3500); } return k; }
  function pop(g) { var el = $('hEm').querySelector('[data-g="' + g + '"]'); if (!el) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  function paintHud() {
    var c = ENG.counts(); $('hCount').textContent = c.here + ' من ' + c.tot; $('hLife').style.width = (c.here / c.tot * 100) + '%';
    var E = ENG.debug; E.groups.slice(1).forEach(function (g) { var el = $('hEm').querySelector('[data-g="' + g.g + '"]'); if (el) el.classList.toggle('off', !g.list.some(function (a) { return a.state === 'idle' || a.state === 'enter'; })); });
    $('hCalm').textContent = fmt(G.streak); $('hStars').textContent = G.stars + ' ⭐';
    var si = S.star * 60; $('hStarProg').style.width = ((G.streak % si) / si * 100) + '%';
    if (S.dur) $('hTime').textContent = fmt(G.left);
    var L = G.L; $('mLvl').style.height = L + '%'; $('mWarn').style.bottom = WARN + '%'; $('mLoud').style.bottom = LOUD + '%';
    $('mFace').textContent = G.talk ? '🗣️' : L >= LOUD ? '😣' : L >= WARN ? '😟' : L >= 30 ? '🙂' : '😊'; $('mTxt').textContent = G.talk ? 'المعلم' : L >= LOUD ? 'ضجيج' : L >= WARN ? 'مرتفع' : 'هادئ';
  }
  var bT = 0;
  function banner(t, sub, cls, ms) { var b = $('banner'); b.innerHTML = t + (sub ? '<small>' + sub + '</small>' : ''); b.className = 'banner show ' + (cls || ''); clearTimeout(bT); bT = setTimeout(function () { b.className = 'banner'; }, ms || 2500); }
  function endSession(auto) {
    if (!G || G.ended) return; G.ended = true; cancelAnimationFrame(raf); ambient(false); if (auto) sfx('end');
    $('shh').classList.remove('on'); $('banner').className = 'banner';
    var tot = Math.max(1, G.calmSec + G.warnSec + G.loudSec), pc = Math.round(G.calmSec / tot * 100);
    $('rSub').textContent = [S.cls, S.tch, new Date().toLocaleDateString('ar-OM', { weekday: 'long', day: 'numeric', month: 'long' })].filter(Boolean).join(' • ');
    var cards = [[fmt(G.t), 'مدة الحصة'], [pc + '%', 'من الوقت هادئ'], [G.stars + ' ⭐', 'نجوم الهدوء'], [fmt(G.best), 'أطول هدوء متواصل'], [G.flees, 'مرّات هروب الحيوانات'], [G.returns, 'مرّات عودة الحيوانات'], [ENG.counts().here + ' / ' + ENG.counts().tot, 'الحيوانات في النهاية'], [G.leoVisits ? 'نعم 🐆' : 'لا', 'زيارة النمر العربي']];
    $('rCards').innerHTML = cards.map(function (c) { return '<div class="card"><b>' + c[0] + '</b><small>' + c[1] + '</small></div>'; }).join('');
    $('rMsg').textContent = pc >= 85 ? '🌟 صفّ رائع! كانت الغابة مطمئنة معظم الحصة.' : pc >= 65 ? '👍 أداء جيد — يمكننا أن نكون أهدأ قليلًا لتبقى كل الحيوانات.' : '🌱 لنحاول في المرة القادمة أن نحافظ على هدوء أكثر لتبقى الحيوانات.';
    drawChart(); show('report', true); $('bar').classList.remove('hide');
  }
  function drawChart() {
    var cv = $('rChart'), c = cv.getContext('2d'), W = cv.width, H = cv.height, d = G.samples.length ? G.samples : [0]; c.clearRect(0, 0, W, H);
    c.fillStyle = '#e6f4ec'; c.fillRect(0, 0, W, H);
    [[WARN, '#ffc23f'], [LOUD, '#ff5a3a']].forEach(function (l) { var y = H - l[0] / 100 * (H - 10); c.strokeStyle = l[1]; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }); c.setLineDash([]);
    var n = Math.min(d.length, 300), step = d.length / n, bw = W / n;
    for (var i = 0; i < n; i++) { var a = 0; for (var j = Math.floor(i * step); j < Math.floor((i + 1) * step) || j === Math.floor(i * step); j++) a = Math.max(a, d[Math.min(d.length - 1, j)]); var h = Math.max(2, a / 100 * (H - 10)); c.fillStyle = a >= LOUD ? '#ff5a3a' : a >= WARN ? '#ffc23f' : '#3fd08a'; c.fillRect(W - (i + 1) * bw, H - h, Math.max(1, bw - 1), h); }
  }
  $('rAgain').onclick = function () { show('report', false); show('hud', false); stopMic(); G = null; show('start', true); $('dim').classList.remove('off'); paintStart(); };
  $('rBack').onclick = function () { show('report', false); if (G) { G.ended = false; ambient(true); loopStart(); } };
  function stopMic() { if (MIC) { MIC.getTracks().forEach(function (t) { t.stop(); }); MIC = null; AN = null; } }

  /* ---------- أزرار المعلم ---------- */
  function setTalk(v) { if (!G) return; G.talk = v; $('bTalk').classList.toggle('on', v); $('talkTag').classList.toggle('on', v); if (!v) G.quietT = Math.min(G.quietT, 1); }
  function setPause(v) { if (!G) return; G.paused = v; $('bPause').innerHTML = v ? '▶️<span>متابعة</span>' : '⏸️<span>إيقاف</span>'; $('pausedTag').classList.toggle('on', v); if (!v) G.last = performance.now(); ENG.setAlert(0); $('shh').classList.remove('on'); }
  function sens(d) { S.sens = Math.max(1, Math.min(10, S.sens + d)); save(); $('bSens').textContent = S.sens; banner('الحساسية: ' + S.sens, d > 0 ? 'الغابة أكثر انتباهًا للأصوات' : 'الغابة أكثر تسامحًا', '', 1300); }
  function paintSound() { $('bSound').innerHTML = (S.snd ? '🔊' : '🔇') + '<span>الصوت</span>'; }
  function full() { var d = document; if (!d.fullscreenElement) { (d.documentElement.requestFullscreen || function () {}).call(d.documentElement); } else d.exitFullscreen(); }
  $('bTalk').onclick = function () { setTalk(!G.talk); };
  $('bPause').onclick = function () { setPause(!G.paused); };
  $('bSensUp').onclick = function () { sens(1); }; $('bSensDn').onclick = function () { sens(-1); };
  $('bReturn').onclick = function () { ENG.returnAll(); G.quietT = 0; G.H = 0; banner('🐾 عادت كل الحيوانات', 'لنحافظ عليها بالهدوء', 'good', 2200); sfx('return'); };
  $('bMeter').onclick = function () { S.meter = !S.meter; save(); $('meter').classList.toggle('off', !S.meter); $('bMeter').classList.toggle('on', S.meter); };
  $('bSound').onclick = function () { S.snd = !S.snd; save(); paintSound(); ambient(S.snd); };
  $('bFull').onclick = full; $('bEnd').onclick = function () { endSession(false); };
  var bn = $('bNoise'); function simOn(e) { if (G) G.simNoise = true; if (e) e.preventDefault(); } function simOff() { if (G) G.simNoise = false; }
  bn.addEventListener('pointerdown', simOn); bn.addEventListener('pointerup', simOff); bn.addEventListener('pointerleave', simOff); bn.addEventListener('pointercancel', simOff);
  window.addEventListener('keydown', function (e) {
    if (!G || G.ended || e.target.tagName === 'INPUT') return;
    var k = e.code;
    if (k === 'Space') { setPause(!G.paused); e.preventDefault(); } else if (k === 'KeyF') full(); else if (k === 'KeyM') $('bMeter').onclick(); else if (k === 'KeyT') setTalk(!G.talk);
    else if (k === 'ArrowUp') sens(1); else if (k === 'ArrowDown') sens(-1); else if (k === 'KeyR') $('bReturn').onclick(); else if (k === 'KeyN') G.simNoise = true; else if (k === 'Escape' && !document.fullscreenElement) endSession(false); else return;
    wake();
  });
  window.addEventListener('keyup', function (e) { if (e.code === 'KeyN' && G) G.simNoise = false; });
  // إخفاء شريط الأدوات تلقائيًا
  var hideT = 0; function hideBarSoon() { clearTimeout(hideT); hideT = setTimeout(function () { if (G && !G.ended) $('bar').classList.add('hide'); }, 3500); }
  function wake() { $('bar').classList.remove('hide'); hideBarSoon(); }
  window.addEventListener('pointermove', wake);
  $('stage').addEventListener('pointerdown', function (e) { wake(); if (ENG && G) { var a = ENG.pick(e.clientX, e.clientY); if (a) sfx('return'); } });

  /* ---------- البدء ---------- */
  $('goMic').onclick = function () { startSession(false); };
  $('goManual').onclick = function () { startSession(true); };
  paintStart();
  if (GL) {
    verifyLibraryAccess().then(function () {
      engine();
      canStart = true;
      $('note').textContent = '';
      $('goMic').disabled = $('goManual').disabled = false;
      if (standalone && urlQ.get('auto') === '1') startSession(true);
    }).catch(function (error) {
      $('note').textContent = error.message || 'تعذر تشغيل غابة الهدوء. أعد تحميل الصفحة.';
    });
  }
})();
