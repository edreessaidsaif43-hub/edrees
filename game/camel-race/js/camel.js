/* لعبة «سباق الجمال»: نفس اختيار الدروس وبنك الأسئلة، بطريقة لعب مختلفة.
   الجمل يجري تلقائيًا، يقفز اللاعب فوق العوائق ويجمع الذهب، وعند كل «بئر أسئلة» يتوقف السباق لسؤال:
   الإجابة الصحيحة = اندفاع سريع، الخاطئة = خسارة روح وتباطؤ، ويعود السؤال بعد 3–5 أسئلة أخرى. */
(function () {
  var VH = 360, PX_PER_M = 20, GROUND = 326;
  var RIVALS = [
    { name: 'الصقر', saddle: '#d63c4a', cap: '#d63c4a', lane: 0 },
    { name: 'الريح', saddle: '#2f7fd1', cap: '#2f7fd1', lane: 1 },
    { name: 'البرق', saddle: '#7b4ad1', cap: '#7b4ad1', lane: 2 }
  ];
  var LANES = [{ y: 236, s: 0.62 }, { y: 264, s: 0.72 }, { y: 293, s: 0.84 }];
  var SPRITES = {};
  ['girl', 'boy'].forEach(function (k) { var im = new Image(); im.src = 'assets/characters/' + k + '-side.png'; SPRITES[k] = im; });

  function rng(seed) { var s = seed >>> 0 || 7; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function CamelGame(canvas, ui) {
    this.kind = 'camel';
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.ui = ui;
    this.input = { left: false, right: false, jump: false };
    this.running = false; this.state = 'idle'; this.time = 0;
    var self = this;
    this._loop = function (ts) { self.loop(ts); };
    window.addEventListener('resize', function () { if (self.running) self.resize(); });
  }

  CamelGame.prototype.resize = function () {
    var wrap = this.canvas.parentElement, w = wrap.clientWidth, h = wrap.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var s = h / VH, vw = w / s;
    if (vw < 420) { vw = 420; s = w / vw; }
    if (vw > 960) { vw = 960; s = w / vw; }
    this.VW = vw; this.scale = s; this.dpr = dpr;
    var ch = VH * s;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = ch + 'px';
    this.canvas.style.marginTop = Math.max(0, (h - ch) / 2) + 'px';
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(ch * dpr);
  };

  CamelGame.prototype.start = function (stage) {
    var cfg = window.GAME_CONFIG;
    this.stage = stage;
    var d = this.d = Math.min(1, stage.index / 6);
    var R = rng(hash(stage.lesson.n + '#camel' + stage.index));
    this.lengthM = Math.min(900, 520 + stage.index * 60);
    var L = this.lengthM * PX_PER_M;
    this.qm = new window.QuestionManager(stage.lesson, stage.index);
    // آبار الأسئلة: موزعة بالتساوي (عدد أسئلة الدرس + 3 فرص لإعادة الأسئلة الخاطئة)
    var nSt = Math.min(12, stage.lesson.qs.length + 3);
    this.stations = [];
    for (var i = 0; i < nSt; i++) this.stations.push({ x: L * (0.1 + 0.82 * i / Math.max(1, nSt - 1)), done: false });
    // العوائق: بعيدة عن الآبار وخط النهاية
    this.obstacles = []; this.coinsArr = [];
    var x = 520, gapMin = 330 - 110 * d, gapMax = 620 - 200 * d;
    while (x < L - 500) {
      x += gapMin + R() * (gapMax - gapMin);
      var nearStation = this.stations.some(function (s) { return Math.abs(s.x - x) < 340; });
      if (nearStation || x > L - 500) continue;
      var type = R() < 0.5 ? 'rock' : (R() < 0.6 ? 'bush' : 'barrel');
      this.obstacles.push({ x: x, type: type, w: type === 'rock' ? 30 : 32, h: type === 'barrel' ? 30 : 24, hit: false });
      // قوس ذهبي فوق العائق
      for (var c = 0; c < 3; c++) this.coinsArr.push({ x: x - 34 + c * 34, y: GROUND - 74 - (c === 1 ? 22 : 0), taken: false });
    }
    // ذهبيات على الأرض بين العوائق
    for (var cx = 700; cx < L - 300; cx += 900 + R() * 600) {
      if (this.stations.some(function (s) { return Math.abs(s.x - cx) < 200; })) continue;
      for (var k = 0; k < 4; k++) this.coinsArr.push({ x: cx + k * 30, y: GROUND - 40, taken: false });
    }
    // المتسابقون المنافسون
    this.rivals = RIVALS.map(function (r, i) {
      var base = (9.2 + d * 0.6) * [0.93, 0.98, 1.02][i];
      return { name: r.name, saddle: r.saddle, cap: r.cap, lane: LANES[i], dist: 0, base: base, phase: R() * 6, wob: 0.4 + R() * 0.4, finished: false, finishT: 0 };
    });
    this.player = { dist: 0, y: 0, vy: 0, onGround: true, boost: 0, slow: 0, invuln: 0, anim: 0 };
    this.lives = cfg.startLives; this.coins = 0; this.score = 0; this.timeLeft = 0; this.raceT = 0;
    this.particles = []; this.camX = 0; this.countdown = 200; this.state = 'countdown';
    this.jumpHeld = false; this.jumpBuffer = 0;
    this.resize();
    this.ui.hud(this);
    if (!this.running) { this.running = true; this.last = performance.now(); this.acc = 0; requestAnimationFrame(this._loop); }
  };

  CamelGame.prototype.stop = function () { this.running = false; this.state = 'idle'; };

  CamelGame.prototype.loop = function (ts) {
    if (!this.running) return;
    var dt = Math.min(0.1, (ts - this.last) / 1000); this.last = ts; this.acc += dt;
    while (this.acc >= 1 / 60) { this.update(); this.acc -= 1 / 60; }
    this.draw();
    requestAnimationFrame(this._loop);
  };

  CamelGame.prototype.playerSpeed = function () {
    var p = this.player, v = 9.2 + this.d * 0.6;            // م/ث
    if (p.boost > 0) v += 6 * Math.min(1, p.boost / 60);    // اندفاع بعد الإجابة الصحيحة
    if (p.slow > 0) v *= 0.35;                               // تعثّر
    return v;
  };

  CamelGame.prototype.rank = function () {
    var pd = this.player.dist, r = 1;
    this.rivals.forEach(function (rv) { if (rv.dist > pd) r++; });
    return r;
  };

  CamelGame.prototype.update = function () {
    this.time += 1 / 60;
    this.particles = this.particles.filter(function (q) { q.x += q.vx; q.y += q.vy; q.vy += q.g || 0; return --q.life > 0; });
    if (this.state === 'countdown') {
      if (this.countdown % 60 === 0 && this.countdown > 0) window.Sound.play('checkpoint');
      if (--this.countdown <= 0) { this.state = 'play'; window.Sound.play('question'); }
      this.ui.hud(this);
      return;
    }
    if (this.state === 'clearing') { this.advanceRivals(); if (--this.clearTimer <= 0) { this.state = 'clear'; this.ui.stageClear(this.summary()); } this.followCam(); return; }
    if (this.state !== 'play') return;   // متوقف أثناء السؤال/القوائم

    var p = this.player, L = this.lengthM * PX_PER_M;
    if (window.__camelPilot) window.__camelPilot(this);
    this.raceT += 1 / 60;
    // القفز
    if (this.input.jump && !this.jumpHeld) this.jumpBuffer = 8;
    this.jumpHeld = this.input.jump;
    if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.jumpBuffer > 0 && p.onGround) { p.vy = -9.6; p.onGround = false; this.jumpBuffer = 0; window.Sound.play('jump'); this.dust(p.dist); }
    if (!this.input.jump && p.vy < -4) p.vy = -4;
    if (!p.onGround) { p.vy += 0.5; p.y += p.vy; if (p.y >= 0) { p.y = 0; p.vy = 0; p.onGround = true; this.dust(p.dist); } }
    if (p.boost > 0) p.boost--; if (p.slow > 0) p.slow--; if (p.invuln > 0) p.invuln--;
    var v = this.playerSpeed();
    p.dist += v * PX_PER_M / 60;
    p.anim += v / 9;
    if (p.boost > 0 && Math.random() < 0.5) this.particles.push({ x: p.dist - 50, y: GROUND - 20 - Math.random() * 30, vx: -2, vy: 0, life: 18, max: 18, color: 'rgba(255,230,120,0.9)', s: 3 });

    this.advanceRivals();

    // العوائق
    var feetY = GROUND + p.y;
    for (var i = 0; i < this.obstacles.length; i++) {
      var o = this.obstacles[i];
      if (o.hit) continue;
      if (Math.abs(o.x - (p.dist + 6)) < (o.w / 2 + 26) && feetY > GROUND - o.h + 4 && p.invuln <= 0) {
        o.hit = true; p.slow = 70; p.invuln = 80; p.boost = 0;
        window.Sound.play('stomp'); this.burst(o.x, GROUND - 14, '#c9a46a', 12);
        this.floatText('تعثّر!', p.dist, GROUND - 110, '#ffd0d0');
      }
    }
    // الذهبيات
    var cy = GROUND - 48 + p.y;
    for (var c = 0; c < this.coinsArr.length; c++) {
      var co = this.coinsArr[c];
      if (co.taken) continue;
      if (Math.abs(co.x - (p.dist + 10)) < 30 && Math.abs(co.y - cy) < 46) {
        co.taken = true; this.coins++; this.score += window.GAME_CONFIG.points.coin;
        window.Sound.play('coin'); this.burst(co.x, co.y, '#ffe066', 6); this.floatText('+10', co.x, co.y - 10, '#fff6b0');
      }
    }
    // آبار الأسئلة (لا عوائق قريبة منها؛ والسؤال يظهر والجمل على الأرض فقط)
    for (var s = 0; s < this.stations.length; s++) {
      var st = this.stations[s];
      if (!st.done && p.dist >= st.x && p.onGround) { st.done = true; this.askQuestion(); if (this.state !== 'play') { this.ui.hud(this); return; } }
    }
    // خط النهاية
    if (p.dist >= L) {
      this.finalRank = this.rank();
      var bonus = [0, 300, 200, 100, 0][this.finalRank] || 0;
      this.score += window.GAME_CONFIG.points.stageClear + bonus;
      this.state = 'clearing'; this.clearTimer = 90;
      window.Sound.play('clear'); this.burst(L, GROUND - 120, '#ffd23f', 40);
    }
    this.followCam();
    this.ui.hud(this);
  };

  CamelGame.prototype.advanceRivals = function () {
    var L = this.lengthM * PX_PER_M, t = this.raceT, self = this;
    this.rivals.forEach(function (r) {
      if (r.dist >= L + 400) return;
      var v = r.base + Math.sin(t * r.wob + r.phase) * 0.7;
      r.dist += v * PX_PER_M / 60; r.anim = (r.anim || 0) + v / 9;
      if (!r.finished && r.dist >= L) { r.finished = true; r.finishT = self.raceT; }
    });
  };

  CamelGame.prototype.followCam = function () {
    var target = this.player.dist - this.VW * 0.34;
    this.camX += (target - this.camX) * 0.2;
  };

  CamelGame.prototype.askQuestion = function () {
    var self = this, q = this.qm.next();
    if (!q) {
      if (this.qm.allDone()) this.floatText('أحسنت! لا أسئلة متبقية', this.player.dist, GROUND - 130, '#bfffd5');
      return;
    }
    this.state = 'question';
    this.input.jump = false;
    window.Sound.play('question');
    this.ui.showQuestion(q, this, function (choice) { return self.qm.answer(choice); }, function (ok) {
      var p = self.player;
      if (ok) {
        self.score += window.GAME_CONFIG.points.correct;
        p.boost = 200; p.slow = 0;
        self.floatText('اندفاع! 🐪💨', p.dist, GROUND - 120, '#fff6b0');
      } else {
        self.lives--; window.Sound.play('hurt');
        p.slow = 60; p.boost = 0;
        if (self.lives <= 0) { self.ui.hud(self); self.state = 'over'; window.Sound.play('gameover'); self.ui.gameOver(self.summary()); return; }
      }
      self.jumpHeld = true;
      self.state = 'play';
      self.ui.hud(self);
    });
  };

  CamelGame.prototype.summary = function () {
    var st = this.qm.stats;
    return {
      lesson: this.stage.lesson.n, stageIndex: this.stage.index, total: this.stage.total,
      score: this.score, coins: this.coins, lives: Math.max(0, this.lives),
      shown: st.shown, correct: st.correct, wrong: st.wrong,
      pct: (st.correct + st.wrong) ? Math.round(100 * st.correct / (st.correct + st.wrong)) : 0,
      rank: this.finalRank || this.rank(), racers: 4
    };
  };

  CamelGame.prototype.floatText = function (t, x, y, color) { this.particles.push({ text: t, x: x, y: y, vx: 0, vy: -0.6, life: 60, max: 60, color: color }); };
  CamelGame.prototype.burst = function (x, y, color, n) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, s = 1 + Math.random() * 2.5; this.particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.08, life: 30, max: 30, color: color, s: 3 }); } };
  CamelGame.prototype.dust = function (dist) { for (var i = 0; i < 6; i++) this.particles.push({ x: dist - 20 + Math.random() * 30, y: GROUND - 2, vx: -1 - Math.random(), vy: -Math.random(), life: 20, max: 20, color: 'rgba(240,220,170,0.9)', s: 4 }); };

  /* ---------------- الرسم ---------------- */
  function drawCamel(ctx, x, y, s, phase, saddle, air) {
    // x,y: منتصف القدمين على الأرض
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    var body = '#c98f4e', dark = '#a8723a', light = '#e2b47a';
    var g = air ? 0 : phase;
    // الأرجل (عدو)
    var legs = [[-24, 0], [-14, Math.PI], [14, Math.PI / 2], [24, Math.PI * 1.5]];
    legs.forEach(function (L, i) {
      var a = air ? (i < 2 ? -0.5 : 0.6) : Math.sin(g + L[1]) * 0.55;
      ctx.save(); ctx.translate(L[0], -42); ctx.rotate(a);
      ctx.fillStyle = i % 2 ? dark : body;
      ctx.fillRect(-3.5, 0, 7, 24);
      ctx.translate(0, 24); ctx.rotate(air ? 0.6 : Math.max(0, -Math.sin(g + L[1])) * 0.9);
      ctx.fillRect(-3, 0, 6, 18); ctx.fillStyle = '#5b3d1e'; ctx.fillRect(-4, 16, 9, 4);
      ctx.restore();
    });
    // الجسم والسنام
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, -52, 36, 17, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-4, -66, 18, 16, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(-6, -74, 9, 5, 0, Math.PI, 0); ctx.fill();
    // الذيل
    ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-35, -56); ctx.quadraticCurveTo(-46, -50 + Math.sin(g) * 4, -42, -38); ctx.stroke();
    // العنق والرأس
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(26, -60); ctx.quadraticCurveTo(44, -64, 46, -92); ctx.lineTo(56, -94); ctx.quadraticCurveTo(56, -60, 32, -44); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(56, -96, 14, 8, 0.15, 0, 7); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(48, -104, 3, 5, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a1a0d'; ctx.beginPath(); ctx.arc(58, -99, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a4a26'; ctx.beginPath(); ctx.arc(68, -94, 1.6, 0, 7); ctx.fill();
    // حبل الزينة
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(46, -92); ctx.lineTo(54, -88); ctx.stroke();
    // السرج المزخرف
    ctx.fillStyle = saddle; ctx.beginPath(); ctx.moveTo(-26, -66); ctx.lineTo(18, -66); ctx.lineTo(22, -46); ctx.lineTo(-30, -46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd23f'; for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-26 + i * 8, -46); ctx.lineTo(-22 + i * 8, -40); ctx.lineTo(-18 + i * 8, -46); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-24, -60, 40, 3);
    ctx.restore();
  }
  function drawRivalRider(ctx, x, y, s, cap) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.translate(-12, 0); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-4, -80, 9, 14, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#d9a77c'; ctx.beginPath(); ctx.arc(-2, -102, 8, 0, 7); ctx.fill();
    ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(-2, -105, 8, Math.PI, 0); ctx.fill(); ctx.fillRect(-2, -106, 12, 3);
    ctx.fillStyle = '#2a1a0d'; ctx.beginPath(); ctx.arc(3, -102, 1.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -84); ctx.lineTo(14, -78); ctx.stroke();
    ctx.restore();
  }
  function drawPlayerRider(ctx, x, y, s, img, t, boost) {
    if (!img || !img.complete || !img.naturalWidth) return;
    // نرسم الجزء العلوي من الشخصية جالسًا على السرج (الجسم متجه نحو الحركة)
    var srcH = img.naturalHeight * 0.58, h = 50, w = h * img.naturalWidth / srcH;
    ctx.save(); ctx.translate(x - 16 * s, y - 60 * s); ctx.scale(s, s);
    ctx.rotate(boost ? 0.12 : 0.04 + Math.sin(t * 8) * 0.02);
    ctx.drawImage(img, 0, 0, img.naturalWidth, srcH, -w / 2, -h, w, h);
    ctx.restore();
  }
  function drawObstacle(ctx, o, x) {
    var y = GROUND;
    if (o.type === 'rock') {
      ctx.fillStyle = '#8f8576'; ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x - 11, y - 18); ctx.lineTo(x + 2, y - 25); ctx.lineTo(x + 14, y - 14); ctx.lineTo(x + 17, y); ctx.fill();
      ctx.fillStyle = '#b1a796'; ctx.beginPath(); ctx.moveTo(x - 8, y - 16); ctx.lineTo(x + 2, y - 22); ctx.lineTo(x + 6, y - 14); ctx.fill();
    } else if (o.type === 'bush') {
      ctx.fillStyle = '#6f8f3a'; [[-10, -10, 10], [2, -16, 12], [12, -9, 9]].forEach(function (b) { ctx.beginPath(); ctx.arc(x + b[0], y + b[1], b[2], 0, 7); ctx.fill(); });
      ctx.fillStyle = '#8fb04f'; ctx.beginPath(); ctx.arc(x, y - 18, 5, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#9a5b2d'; ctx.fillRect(x - 14, y - 30, 28, 30);
      ctx.fillStyle = '#6b3c1c'; ctx.fillRect(x - 14, y - 24, 28, 3); ctx.fillRect(x - 14, y - 9, 28, 3);
    }
    if (o.hit) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#fff'; ctx.fillRect(x - 16, y - 32, 32, 2); ctx.globalAlpha = 1; }
  }
  function drawStation(ctx, st, x) {
    var y = GROUND + 2;
    // بئر صغير ولافتة سؤال
    ctx.fillStyle = '#b77d47'; ctx.fillRect(x - 18, y - 22, 36, 22);
    ctx.fillStyle = '#8c5a2f'; ctx.fillRect(x - 20, y - 26, 40, 6);
    ctx.fillStyle = '#5b5f6b'; ctx.fillRect(x - 16, y - 58, 3, 32); ctx.fillRect(x + 13, y - 58, 3, 32); ctx.fillRect(x - 18, y - 60, 36, 4);
    ctx.fillStyle = st.done ? '#22b35e' : '#ffd23f';
    ctx.beginPath(); ctx.arc(x, y - 86, 16, 0, 7); ctx.fill();
    ctx.fillStyle = '#1d2b53'; ctx.font = 'bold 20px Tahoma, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(st.done ? '✓' : '؟', x, y - 85);
    ctx.fillStyle = '#5b5f6b'; ctx.fillRect(x - 1, y - 70, 2, 10);
  }
  function drawCoin(ctx, x, y, t) {
    var sx = Math.abs(Math.cos(t * 3 + x * 0.01));
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.15, sx), 1);
    ctx.fillStyle = '#c98a00'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff2a8'; ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.2 : 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.fill(); ctx.restore();
  }

  CamelGame.prototype.draw = function () {
    if (!this.stage) return;
    var ctx = this.ctx, s = this.scale * this.dpr, VW = this.VW, cam = this.camX, t = this.time, i, x;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // السماء
    var g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#ffab5e'); g.addColorStop(0.6, '#ffe6b0'); g.addColorStop(1, '#ffe6b0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(VW * 0.82, 60, 24, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (i = 0; i < 5; i++) { x = ((i * 260) - cam * 0.08 + t * 5) % (VW + 200); if (x < 0) x += VW + 200; x -= 100; var cy = 40 + (i * 29) % 50;
      ctx.beginPath(); ctx.arc(x, cy, 13, 0, 7); ctx.arc(x + 15, cy - 7, 17, 0, 7); ctx.arc(x + 33, cy, 12, 0, 7); ctx.fill(); ctx.fillRect(x, cy - 2, 33, 14); }
    // جبال وقلعة بعيدة
    ctx.fillStyle = '#e3a76a'; ctx.beginPath(); ctx.moveTo(0, 230);
    for (x = 0; x <= VW + 10; x += 10) { var wx = x + cam * 0.15; ctx.lineTo(x, 160 + 30 * Math.abs(Math.sin(wx / 140)) + 12 * Math.sin(wx / 41)); }
    ctx.lineTo(VW, 230); ctx.fill();
    var fx = ((900 - cam * 0.2) % (VW + 500) + VW + 500) % (VW + 500) - 250;
    ctx.fillStyle = '#c47b3f'; ctx.fillRect(fx, 150, 90, 70); ctx.fillRect(fx - 14, 130, 30, 90); ctx.fillRect(fx + 76, 135, 28, 85);
    for (i = 0; i < 6; i++) ctx.fillRect(fx + i * 16, 142, 9, 9);
    // الكثبان والنخيل
    ctx.fillStyle = '#efc07c'; ctx.beginPath(); ctx.moveTo(0, VH);
    for (x = 0; x <= VW + 10; x += 8) { var w2 = x + cam * 0.35; ctx.lineTo(x, 214 + 14 * Math.sin(w2 / 90)); }
    ctx.lineTo(VW, VH); ctx.fill();
    for (i = 0; i < 10; i++) { var px = ((i * 190) - cam * 0.35) % (VW + 190); if (px < 0) px += VW + 190; px -= 40; var py = 222;
      ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 6, py - 24, px + 3, py - 44); ctx.stroke();
      ctx.strokeStyle = '#3f8f3a'; ctx.lineWidth = 3;
      for (var l = 0; l < 5; l++) { var a = -2.6 + l * 0.55; ctx.beginPath(); ctx.moveTo(px + 3, py - 44); ctx.quadraticCurveTo(px + 3 + Math.cos(a) * 14, py - 56, px + 3 + Math.cos(a) * 24, py - 44 + Math.sin(a + 1.6) * 8 + 6); ctx.stroke(); } }
    // المضمار
    ctx.fillStyle = '#e9c98d'; ctx.fillRect(0, 222, VW, VH - 222);
    ctx.fillStyle = '#d9b475';
    for (i = 0; i < 3; i++) ctx.fillRect(0, LANES[i].y + 4, VW, 2);
    ctx.fillStyle = '#d4a865'; ctx.fillRect(0, GROUND + 4, VW, VH - GROUND);
    ctx.fillStyle = '#c4985a';
    for (x = -((cam) % 40); x < VW; x += 40) ctx.fillRect(x, GROUND + 14, 18, 3);
    // سياج المضمار البعيد
    ctx.fillStyle = '#ffffff';
    for (x = -((cam * 0.9) % 60); x < VW; x += 60) { ctx.fillRect(x, 208, 4, 18); }
    ctx.fillRect(0, 212, VW, 3);
    var Lpx = this.lengthM * PX_PER_M;
    // علامات المسافة
    ctx.fillStyle = '#1d2b53'; ctx.font = 'bold 11px Tahoma, sans-serif'; ctx.textAlign = 'center';
    for (var m = 100; m < this.lengthM; m += 100) { x = m * PX_PER_M - cam; if (x > -40 && x < VW + 40) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 16, 196, 32, 14); ctx.fillStyle = '#1d2b53'; ctx.fillText(m + 'م', x, 207); } }
    // خط النهاية
    x = Lpx - cam;
    if (x > -60 && x < VW + 60) {
      for (var r = 0; r < 12; r++) { ctx.fillStyle = r % 2 ? '#1d2b53' : '#ffffff'; ctx.fillRect(x - 4, 222 + r * 11.5, 8, 11.5); }
      ctx.fillStyle = '#5b5f6b'; ctx.fillRect(x - 40, 140, 4, 90); ctx.fillRect(x + 36, 140, 4, 90);
      ctx.fillStyle = '#e53950'; ctx.fillRect(x - 40, 140, 80, 22);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px Tahoma, sans-serif'; ctx.fillText('النهاية', x, 156);
    }
    // المتسابقون (من الخلف للأمام)
    var self = this;
    this.rivals.forEach(function (rv) {
      var rx = rv.dist - cam;
      if (rx < -120 || rx > VW + 120) return;
      drawCamel(ctx, rx, rv.lane.y, rv.lane.s, rv.anim || 0, rv.saddle, false);
      drawRivalRider(ctx, rx, rv.lane.y, rv.lane.s, rv.cap);
    });
    // الآبار والعوائق والذهب في مسار اللاعب
    this.stations.forEach(function (st) { var sx = st.x - cam; if (sx > -60 && sx < VW + 60) drawStation(ctx, st, sx); });
    this.obstacles.forEach(function (o) { var ox = o.x - cam; if (ox > -40 && ox < VW + 40) drawObstacle(ctx, o, ox); });
    this.coinsArr.forEach(function (c) { if (!c.taken) { var cx = c.x - cam; if (cx > -20 && cx < VW + 20) drawCoin(ctx, cx, c.y + Math.sin(t * 3 + c.x) * 1.5, t); } });
    // جمل اللاعب
    var p = this.player, pxp = p.dist - cam, pyp = GROUND + p.y;
    if (!(p.invuln > 0 && Math.floor(p.invuln / 5) % 2 === 0)) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(pxp, GROUND + 2, 34 + p.y * 0.2, 5, 0, 0, 7); ctx.fill();
      var img = SPRITES[window.__character || 'girl'];
      drawCamel(ctx, pxp, pyp, 1, p.anim, '#16a3a0', !p.onGround);
      drawPlayerRider(ctx, pxp, pyp, 1, img, t, p.boost > 0);
      // سهم يحدد جمل اللاعب
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); var ay = pyp - 160 + Math.sin(t * 5) * 3; ctx.moveTo(pxp - 8, ay); ctx.lineTo(pxp + 8, ay); ctx.lineTo(pxp, ay + 10); ctx.fill();
    }
    // الجزيئات والنصوص
    this.particles.forEach(function (q) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      if (q.text) { ctx.font = 'bold 14px Tahoma, sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.strokeText(q.text, q.x - cam, q.y); ctx.fillStyle = q.color; ctx.fillText(q.text, q.x - cam, q.y); }
      else { ctx.fillStyle = q.color; ctx.fillRect(q.x - cam - q.s / 2, q.y - q.s / 2, q.s, q.s); }
    });
    ctx.globalAlpha = 1;
    // شريط التقدم
    var bw = Math.min(360, VW - 60), bx = (VW - bw) / 2, by = 54;
    ctx.fillStyle = 'rgba(29,43,83,0.55)'; ctx.fillRect(bx, by, bw, 8);
    this.rivals.forEach(function (rv) { ctx.fillStyle = rv.cap; ctx.beginPath(); ctx.arc(bx + bw * Math.min(1, rv.dist / Lpx), by + 4, 5, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(bx + bw * Math.min(1, p.dist / Lpx), by + 4, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    // العد التنازلي
    if (this.state === 'countdown') {
      var n = Math.ceil(this.countdown / 60) - 0;
      var txt = this.countdown > 20 ? String(Math.min(3, Math.ceil((this.countdown - 20) / 60))) : 'انطلق!';
      ctx.font = 'bold 72px Tahoma, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = '#1d2b53'; ctx.strokeText(txt, VW / 2, VH / 2 - 30); ctx.fillStyle = '#ffd23f'; ctx.fillText(txt, VW / 2, VH / 2 - 30);
      ctx.textBaseline = 'alphabetic'; void n;
    }
  };

  window.CamelGame = CamelGame;
})();
