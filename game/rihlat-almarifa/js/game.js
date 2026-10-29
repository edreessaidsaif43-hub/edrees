/* محرك اللعبة: الفيزياء، التصادم، الذهبيات، الأرواح، نقاط الحفظ، وربط الأسئلة */
(function () {
  var VH = 360, GRAV = 0.55, JUMP_V = -10.8, MAX_FALL = 12;

  function Game(canvas, ui) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.ui = ui;
    this.input = { left: false, right: false, jump: false };
    this.jumpHeld = false; this.jumpBuffer = 0;
    this.running = false; this.time = 0;
    this.VW = 640; this.scale = 1;
    var self = this;
    this._loop = function (ts) { self.loop(ts); };
    window.addEventListener('resize', function () { self.resize(); });
    this.resize();
  }

  Game.prototype.resize = function () {
    var wrap = this.canvas.parentElement, w = wrap.clientWidth, h = wrap.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var s = h / VH, vw = w / s;
    if (vw < 420) { vw = 420; s = w / vw; }
    if (vw > 960) { vw = 960; s = w / vw; }
    this.VW = vw; this.scale = s;
    var ch = VH * s;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = ch + 'px';
    this.canvas.style.marginTop = Math.max(0, (h - ch) / 2) + 'px';
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(ch * dpr);
    this.dpr = dpr;
  };

  /* بدء مرحلة: stage = {index, total, lesson, lessonIndex} */
  Game.prototype.start = function (stage) {
    var cfg = window.GAME_CONFIG;
    this.stage = stage;
    this.level = window.LevelGen.generate(stage.index, stage.total, stage.lesson.n);
    this.qm = new window.QuestionManager(stage.lesson, stage.index); // جلسة أسئلة جديدة لكل محاولة
    this.lives = cfg.startLives; this.coins = 0; this.score = 0; this.timeLeft = cfg.stageTimeSec;
    this.particles = []; this.camX = 0;
    this.respawn = { x: this.level.start.x, y: this.level.start.y };
    this.player = { x: this.level.start.x, y: this.level.start.y, w: 18, h: 40, vx: 0, vy: 0, onGround: false, facing: 1, invuln: 0, anim: 0, coyote: 0, dead: false };
    this.state = 'play'; this.deathTimer = 0; this.allDoneShown = false; this.pendingQ = 0; this.safeFrames = 0; this.waitHintShown = false;
    this.ui.hud(this);
    if (!this.running) { this.running = true; this.last = performance.now(); this.acc = 0; requestAnimationFrame(this._loop); }
  };

  Game.prototype.stop = function () { this.running = false; this.state = 'idle'; };

  Game.prototype.loop = function (ts) {
    if (!this.running) return;
    var dt = Math.min(0.1, (ts - this.last) / 1000); this.last = ts;
    this.acc += dt;
    var stepT = 1 / 60;
    while (this.acc >= stepT) { this.update(); this.acc -= stepT; }
    this.draw();
    requestAnimationFrame(this._loop);
  };

  Game.prototype.solidAt = function (px, py) {
    var L = this.level, c = Math.floor(px / L.T), r = Math.floor(py / L.T);
    if (c < 0) return true;
    if (c >= L.cols || r < 0 || r >= L.rows) return false;
    var v = L.tiles[r * L.cols + c];
    return v === 1 || v === 2;
  };
  Game.prototype.tileAt = function (px, py) {
    var L = this.level, c = Math.floor(px / L.T), r = Math.floor(py / L.T);
    if (c < 0 || c >= L.cols || r < 0 || r >= L.rows) return 0;
    return L.tiles[r * L.cols + c];
  };

  Game.prototype.update = function () {
    if (this.state === 'play' || this.state === 'dying' || this.state === 'clearing') this.time += 1 / 60;
    // الجزيئات
    this.particles = (this.particles || []).filter(function (p) { p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; p.life--; return p.life > 0; });
    if (this.state === 'dying') {
      var pd = this.player; pd.vy += GRAV * 0.8; pd.y += pd.vy;
      if (--this.deathTimer <= 0) this.afterDeath();
      return;
    }
    if (this.state === 'clearing') {
      var pc = this.player; pc.vx = 1.6; pc.x += pc.vx; pc.anim++; pc.facing = 1; pc.onGround = true;
      if (--this.clearTimer <= 0) { this.state = 'clear'; this.ui.stageClear(this.summary()); }
      return;
    }
    if (this.state !== 'play') return; // متوقف أثناء السؤال/القوائم: لا حركة للشخصية أو الأعداء ولا للمؤقت

    var L = this.level, p = this.player, inp = this.input, d = L.difficulty;
    if (window.__demoPilot) window.__demoPilot(this);

    // المؤقت
    this.timeLeft -= 1 / 60;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.die('time'); return; }

    // الحركة الأفقية
    var maxS = 3.2 + 0.3 * d, acc = p.onGround ? 0.55 : 0.4;
    if (inp.left && !inp.right) { p.vx -= acc; p.facing = -1; }
    else if (inp.right && !inp.left) { p.vx += acc; p.facing = 1; }
    else { p.vx *= p.onGround ? 0.72 : 0.92; if (Math.abs(p.vx) < 0.05) p.vx = 0; }
    p.vx = Math.max(-maxS, Math.min(maxS, p.vx));

    // القفز (مع هامش بسيط لتسهيل التحكم على اللمس)
    if (inp.jump && !this.jumpHeld) this.jumpBuffer = 8;
    this.jumpHeld = inp.jump;
    if (this.jumpBuffer > 0) this.jumpBuffer--;
    p.coyote = p.onGround ? 7 : Math.max(0, p.coyote - 1);
    if (this.jumpBuffer > 0 && p.coyote > 0) {
      p.vy = JUMP_V; p.onGround = false; p.coyote = 0; this.jumpBuffer = 0; p.riding = null;
      window.Sound.play('jump'); this.dust(p.x + p.w / 2, p.y + p.h);
    }
    if (!inp.jump && p.vy < -4) p.vy = -4;
    p.vy = Math.min(MAX_FALL, p.vy + GRAV);

    // المنصات المتحركة
    var self = this;
    L.movers.forEach(function (m) {
      m.x += m.vx; if (m.x < m.x0 || m.x > m.x1) { m.vx = -m.vx; m.x = Math.max(m.x0, Math.min(m.x1, m.x)); }
      m.dx = m.vx;
    });
    if (p.riding) p.x += p.riding.dx;

    // تحريك وتصادم أفقي
    p.x += p.vx;
    if (p.x < 0) { p.x = 0; p.vx = 0; }
    var top = p.y + 2, bot = p.y + p.h - 2;
    if (p.vx > 0 || p.riding) {
      if (this.solidAt(p.x + p.w, top) || this.solidAt(p.x + p.w, bot) || this.solidAt(p.x + p.w, p.y + p.h / 2)) {
        p.x = Math.floor((p.x + p.w) / L.T) * L.T - p.w - 0.01; p.vx = 0;
      }
    }
    if (p.vx < 0 || p.riding) {
      if (this.solidAt(p.x, top) || this.solidAt(p.x, bot) || this.solidAt(p.x, p.y + p.h / 2)) {
        p.x = Math.floor(p.x / L.T + 1) * L.T + 0.01; p.vx = 0;
      }
    }
    // تحريك وتصادم عمودي
    var prevBottom = p.y + p.h;
    p.y += p.vy;
    var wasGround = p.onGround; p.onGround = false; p.riding = null;
    if (p.vy >= 0) {
      if (this.solidAt(p.x + 3, p.y + p.h) || this.solidAt(p.x + p.w - 3, p.y + p.h)) {
        p.y = Math.floor((p.y + p.h) / L.T) * L.T - p.h; p.vy = 0; p.onGround = true;
      } else {
        for (var i = 0; i < L.movers.length; i++) {
          var m = L.movers[i];
          if (p.x + p.w > m.x + 2 && p.x < m.x + m.w - 2 && prevBottom <= m.y + 4 && p.y + p.h >= m.y) {
            p.y = m.y - p.h; p.vy = 0; p.onGround = true; p.riding = m; break;
          }
        }
      }
    } else {
      if (this.solidAt(p.x + 3, p.y) || this.solidAt(p.x + p.w - 3, p.y)) {
        p.y = Math.floor(p.y / L.T + 1) * L.T; p.vy = 0;
      }
    }
    if (p.onGround && !wasGround) this.dust(p.x + p.w / 2, p.y + p.h);
    if (Math.abs(p.vx) > 0.2) p.anim++;
    if (p.invuln > 0) p.invuln--;

    // السقوط في حفرة
    if (p.y > L.rows * L.T + 20) { this.die('pit'); return; }
    // الأشواك
    var sx = [p.x + 5, p.x + p.w - 5], sy = p.y + p.h - 4;
    for (var s = 0; s < 2; s++) {
      if (this.tileAt(sx[s], sy) === 3 && ((sy % L.T) > 12)) { if (p.invuln <= 0) { this.die('spike'); return; } }
    }

    // الأعداء
    for (var e = 0; e < L.enemies.length; e++) {
      var en = L.enemies[e];
      if (en.squash) { if (--en.squash <= 0) en.squash = 0; continue; }
      if (!en.alive) continue;
      if (Math.abs(en.x - p.x) > this.VW * 1.2) continue; // الأعداء البعيدة لا تتحرك
      if (en.type === 'walker') {
        en.x += en.vx;
        var ahead = en.vx < 0 ? en.x - 1 : en.x + en.w + 1;
        if (!this.solidAt(ahead, en.y + en.h + 4) || this.solidAt(ahead, en.y + en.h / 2) || en.x < en.minX || en.x + en.w > en.maxX) en.vx = -en.vx;
      } else {
        en.t += 0.05; en.x += en.vx; en.y = en.baseY + Math.sin(en.t) * en.amp;
        if (en.x < en.minX || en.x + en.w > en.maxX) en.vx = -en.vx;
      }
      if (p.x + p.w > en.x + 3 && p.x < en.x + en.w - 3 && p.y + p.h > en.y + 3 && p.y < en.y + en.h) {
        if (p.vy > 0 && prevBottom <= en.y + 10) {
          en.alive = false; en.squash = en.type === 'walker' ? 24 : 0;
          p.vy = -7.5; this.addScore(window.GAME_CONFIG.points.stomp, en.x + en.w / 2, en.y);
          window.Sound.play('stomp'); this.burst(en.x + en.w / 2, en.y + en.h / 2, '#ffffff', 8);
        } else if (p.invuln <= 0) { this.die('enemy'); return; }
      }
    }

    // الذهبيات
    for (var c = 0; c < L.coins.length; c++) {
      var co = L.coins[c];
      if (co.taken) continue;
      if (Math.abs(co.x - (p.x + p.w / 2)) < 16 && Math.abs(co.y - (p.y + p.h / 2)) < 20) {
        co.taken = true; this.collectCoin(co);
        if (this.state !== 'play') return;
      }
    }

    // نقاط الحفظ
    for (var k = 0; k < L.checkpoints.length; k++) {
      var cp = L.checkpoints[k];
      if (!cp.active && p.x + p.w / 2 >= cp.x) {
        cp.active = true; this.respawn = { x: cp.x - 10, y: cp.y - p.h - 2 };
        window.Sound.play('checkpoint'); this.floatText('نقطة حفظ ✓', cp.x, cp.y - 70, '#bfffd5');
        this.ui.toast('تم الحفظ! ستعود هنا إذا خسرت روحًا');
      }
    }

    // نهاية المرحلة
    if (p.x + p.w / 2 >= L.goal.x + 20 && p.onGround) {
      this.state = 'clearing'; this.clearTimer = 50;
      this.score += window.GAME_CONFIG.points.stageClear;
      window.Sound.play('clear'); this.burst(L.goal.x + 30, L.goal.y - 100, '#ffd23f', 30);
    }

    // سؤال مؤجَّل ينتظر لحظة آمنة
    if (this.pendingQ > 0) {
      if (this.isSafe()) this.safeFrames++; else this.safeFrames = 0;
      if (this.safeFrames >= 14) { this.pendingQ--; this.safeFrames = 0; this.askQuestion('coins'); if (this.state !== 'play') return; }
    }

    // الكاميرا
    var target = p.x - this.VW * 0.38;
    this.camX += (target - this.camX) * 0.18;
    this.camX = Math.max(0, Math.min(L.cols * L.T - this.VW, this.camX));
    this.ui.hud(this);
  };

  /* هل اللاعب في وضع آمن لظهور سؤال؟ على أرض ثابتة، بعيد عن الحفر والأشواك والأعداء والمنصات المتحركة */
  Game.prototype.isSafe = function () {
    var p = this.player, L = this.level, T = L.T;
    if (!p.onGround || p.riding || p.dead || Math.abs(p.vy) > 0.1) return false;
    var feet = p.y + p.h, cx = p.x + p.w / 2;
    for (var dx = -2 * T; dx <= 3 * T; dx += T / 2) {
      var x = cx + dx;
      if (!this.solidAt(x, feet + 4) && !this.solidAt(x, feet - T + 4)) return false; // حفرة قريبة
      if (this.tileAt(x, feet - 6) === 3) return false;                             // أشواك قريبة
    }
    for (var i = 0; i < L.enemies.length; i++) {
      var e = L.enemies[i];
      if (e.alive && Math.abs(e.x + e.w / 2 - cx) < 5 * T) return false;
    }
    for (var j = 0; j < L.movers.length; j++) {
      var m = L.movers[j];
      if (cx > m.x0 - 2 * T && cx < m.x1 + m.w + 2 * T) return false;
    }
    return true;
  };

  Game.prototype.collectCoin = function (co) {
    var cfg = window.GAME_CONFIG;
    this.coins++; window.Sound.play('coin');
    this.addScore(cfg.points.coin, co.x, co.y - 8);
    this.burst(co.x, co.y, '#ffe066', 6);
    this.ui.hud(this);
    // لا يظهر السؤال فورًا: يُؤجَّل حتى يكون اللاعب في مكان آمن (لا قفز ولا حفرة ولا عدو قريب)
    if (this.coins % cfg.coinsPerQuestion === 0) this.pendingQ++;
  };

  /* إظهار سؤال (السبب: coins أو death). يتم إيقاف اللعب كليًا حتى تتم الإجابة */
  Game.prototype.askQuestion = function (reason, after) {
    var self = this;
    var q = this.qm.next();
    if (!q) {
      if (this.qm.allDone() && !this.allDoneShown) { this.allDoneShown = true; this.ui.toast('رائع! أجبت عن جميع أسئلة هذا الدرس 🌟'); }
      if (after) after();
      return;
    }
    this.state = 'question';
    this.input.left = this.input.right = this.input.jump = false;
    window.Sound.play('question');
    this.ui.showQuestion(q, this, function (choice) {
      var ok = self.qm.answer(choice);
      return ok;
    }, function (ok) {
      // يُستدعى بعد إغلاق نافذة السؤال
      if (ok) {
        self.addScore(window.GAME_CONFIG.points.correct, self.player.x + 10, self.player.y - 10);
      } else {
        // إجابة خاطئة: خصم روح واحدة فقط، ولا يُعرض سؤال جديد بسبب هذه الروح
        self.lives--; window.Sound.play('hurt');
        self.ui.hud(self);
        if (self.lives <= 0) { self.gameOver(); return; }
      }
      if (after) after(); else self.state = 'play';
      // مهلة قصيرة بعد السؤال: لا ضرر من الأعداء ويبدأ اللاعب ثابتًا
      self.player.vx = 0; self.player.invuln = Math.max(self.player.invuln, 60);
      self.input.left = self.input.right = self.input.jump = false; self.jumpHeld = true;
      self.ui.hud(self);
    });
  };

  Game.prototype.die = function (reason) {
    if (this.state !== 'play') return;
    var p = this.player;
    p.dead = true; p.vy = -8; p.vx = 0;
    this.deathReason = reason;
    this.state = 'dying'; this.deathTimer = 55;
    window.Sound.play('hurt');
  };

  Game.prototype.afterDeath = function () {
    var self = this;
    this.lives--;
    this.ui.hud(this);
    if (this.lives <= 0) { this.gameOver(); return; }
    // سؤال واحد بسبب الروح المفقودة أثناء اللعب، ثم العودة لنقطة الحفظ
    this.state = 'question-wait';
    this.askQuestion('death', function () { self.doRespawn(); });
    if (this.state === 'question-wait') this.doRespawn();
  };

  Game.prototype.doRespawn = function () {
    if (this.lives <= 0) return;
    var p = this.player, r = this.respawn;
    p.x = r.x; p.y = r.y; p.vx = 0; p.vy = 0; p.dead = false; p.invuln = 100; p.riding = null;
    if (this.deathReason === 'time' || this.timeLeft < 90) this.timeLeft = Math.max(this.timeLeft, this.deathReason === 'time' ? window.GAME_CONFIG.stageTimeSec : 90);
    this.camX = Math.max(0, p.x - this.VW * 0.38);
    // إبعاد الأعداء عن نقطة العودة
    var self = this;
    this.level.enemies.forEach(function (e) { if (e.alive && Math.abs(e.x - p.x) < 90) e.x = p.x + (e.x >= p.x ? 120 : -120); });
    this.state = 'play';
    this.ui.hud(this);
    void self;
  };

  Game.prototype.gameOver = function () {
    this.state = 'over';
    window.Sound.play('gameover');
    this.ui.gameOver(this.summary());
  };

  Game.prototype.summary = function () {
    var st = this.qm.stats;
    return {
      lesson: this.stage.lesson.n, stageIndex: this.stage.index, total: this.stage.total,
      score: this.score, coins: this.coins, lives: Math.max(0, this.lives),
      shown: st.shown, correct: st.correct, wrong: st.wrong,
      pct: (st.correct + st.wrong) ? Math.round(100 * st.correct / (st.correct + st.wrong)) : 0
    };
  };

  Game.prototype.addScore = function (n, x, y) { this.score += n; this.floatText('+' + n, x, y, '#fff6b0'); };
  Game.prototype.floatText = function (t, x, y, color) { this.particles.push({ text: t, x: x, y: y, vx: 0, vy: -0.7, life: 50, max: 50, color: color }); };
  Game.prototype.burst = function (x, y, color, n) {
    for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, s = 1 + Math.random() * 2.5; this.particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.08, life: 30, max: 30, color: color, s: 3 }); }
  };
  Game.prototype.dust = function (x, y) {
    for (var i = 0; i < 5; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 14, y: y - 2, vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 0.8, life: 18, max: 18, color: 'rgba(255,255,255,0.8)', s: 3 });
  };

  Game.prototype.draw = function () {
    if (!this.level) return;
    var ctx = this.ctx, s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    window.Render.frame(ctx, this, this.VW, VH, this.time);
  };

  window.Game = Game;
})();
