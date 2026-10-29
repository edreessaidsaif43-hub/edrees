/* رسم كل عناصر اللعبة برمجيًا (رسومات أصلية بالكامل) */
(function () {
  var THEMES = [
    { name: 'المروج', sky: ['#5ec2ff', '#c8f1ff'], far: '#9edb93', near: '#62b85c', top: '#4caf50', topHi: '#7ad36f', dirt: '#a46a3c', dirtDk: '#7d4b25', block: '#f0a64a', blockDk: '#b8722a', deco: 'trees' },
    { name: 'الصحراء', sky: ['#ffab5e', '#ffe6b0'], far: '#efc07c', near: '#dca15a', top: '#f0cf87', topHi: '#fae2ad', dirt: '#d0a05c', dirtDk: '#a97c40', block: '#c98b4f', blockDk: '#8f5c2e', deco: 'palms' },
    { name: 'الساحل', sky: ['#62cfff', '#e8f9ff'], far: '#2f9ae8', near: '#1f7fcf', top: '#f3dc9a', topHi: '#fff0c2', dirt: '#9a8a7a', dirtDk: '#6f6256', block: '#ff8a7a', blockDk: '#c95a4d', deco: 'sea' },
    { name: 'الجبال', sky: ['#9fc4ea', '#eef5fc'], far: '#8796ae', near: '#64748d', top: '#6aa84f', topHi: '#93cc72', dirt: '#8a6b58', dirtDk: '#634a3b', block: '#b0a090', blockDk: '#7b6d60', deco: 'mountains' },
    { name: 'ليل النجوم', sky: ['#121a45', '#40307a'], far: '#2d2763', near: '#221c4d', top: '#8a6be0', topHi: '#b49cf5', dirt: '#4f3a85', dirtDk: '#372763', block: '#6f5bc8', blockDk: '#46378c', deco: 'night' }
  ];

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawBackground(ctx, th, camX, VW, VH, time) {
    var g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    var i, x;
    if (th.deco === 'night') {
      ctx.fillStyle = '#fff';
      for (i = 0; i < 60; i++) {
        x = ((i * 137.5) - camX * 0.05) % (VW + 20); if (x < 0) x += VW + 20;
        var y = (i * 71) % 200 + 10, tw = 0.5 + 0.5 * Math.sin(time * 2 + i);
        ctx.globalAlpha = 0.4 + 0.6 * tw; ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff6c9'; ctx.beginPath(); ctx.arc(VW * 0.8, 70, 26, 0, 7); ctx.fill();
      ctx.fillStyle = th.sky[0]; ctx.beginPath(); ctx.arc(VW * 0.8 + 11, 62, 22, 0, 7); ctx.fill();
    } else {
      // شمس
      ctx.fillStyle = th.deco === 'palms' ? '#fff3c4' : 'rgba(255,255,220,0.9)';
      ctx.beginPath(); ctx.arc(VW * 0.82, 64, 24, 0, 7); ctx.fill();
      // غيوم
      ctx.fillStyle = '#ffffff';
      for (i = 0; i < 6; i++) {
        x = ((i * 260) - camX * 0.15 + time * 6) % (VW + 200); if (x < 0) x += VW + 200; x -= 100;
        var cy = 50 + (i * 37) % 70;
        ctx.beginPath(); ctx.arc(x, cy, 16, 0, 7); ctx.arc(x + 18, cy - 8, 20, 0, 7); ctx.arc(x + 40, cy, 15, 0, 7); ctx.fill();
        ctx.fillRect(x, cy - 2, 40, 17);
      }
    }
    // طبقة بعيدة
    ctx.fillStyle = th.far;
    ctx.beginPath(); ctx.moveTo(0, VH);
    for (x = 0; x <= VW + 10; x += 10) {
      var wx = x + camX * 0.25;
      var hh = th.deco === 'mountains' ? 150 + 60 * Math.abs(Math.sin(wx / 160)) + 25 * Math.sin(wx / 47)
        : th.deco === 'sea' ? 240 : 200 + 30 * Math.sin(wx / 120) + 14 * Math.sin(wx / 37);
      ctx.lineTo(x, VH - (VH - hh) * 0.55 - 40);
    }
    ctx.lineTo(VW, VH); ctx.fill();
    if (th.deco === 'sea') {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (i = 0; i < 14; i++) {
        x = ((i * 90) - camX * 0.25 + Math.sin(time + i) * 6) % (VW + 60); if (x < 0) x += VW + 60;
        ctx.fillRect(x - 30, 222 + (i % 3) * 14, 22, 2);
      }
      // قارب شراعي
      var bx = ((900 - camX * 0.3) % (VW + 300) + VW + 300) % (VW + 300) - 150;
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.moveTo(bx, 214); ctx.lineTo(bx + 60, 214); ctx.lineTo(bx + 48, 226); ctx.lineTo(bx + 8, 226); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(bx + 30, 168); ctx.lineTo(bx + 30, 210); ctx.lineTo(bx + 6, 210); ctx.fill();
    }
    if (th.deco === 'palms' || th.deco === 'mountains') {
      // قلعة/برج بعيد
      var fx = ((700 - camX * 0.3) % (VW + 400) + VW + 400) % (VW + 400) - 200;
      ctx.fillStyle = th.deco === 'palms' ? '#c47b3f' : '#6f7f97';
      ctx.fillRect(fx, 150, 90, 70); ctx.fillRect(fx - 14, 130, 30, 90); ctx.fillRect(fx + 76, 135, 28, 85);
      for (i = 0; i < 6; i++) ctx.fillRect(fx + i * 16, 142, 9, 9);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(fx + 36, 186, 18, 34);
    }
    // طبقة قريبة
    ctx.fillStyle = th.near;
    ctx.beginPath(); ctx.moveTo(0, VH);
    for (x = 0; x <= VW + 10; x += 8) {
      var wx2 = x + camX * 0.5;
      var h2 = th.deco === 'palms' ? 255 + 18 * Math.sin(wx2 / 90) : 250 + 22 * Math.sin(wx2 / 70) + 10 * Math.sin(wx2 / 23);
      ctx.lineTo(x, h2);
    }
    ctx.lineTo(VW, VH); ctx.fill();
    // زخارف قريبة
    for (i = 0; i < 12; i++) {
      var px = ((i * 170) - camX * 0.5) % (VW + 170); if (px < 0) px += VW + 170; px -= 40;
      var py = 255;
      if (th.deco === 'trees') {
        ctx.fillStyle = '#7d4b25'; ctx.fillRect(px + 8, py - 30, 6, 30);
        ctx.fillStyle = '#3f9a45'; ctx.beginPath(); ctx.arc(px + 11, py - 36, 16, 0, 7); ctx.fill();
      } else if (th.deco === 'palms') {
        ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 8, py - 30, px + 4, py - 55); ctx.stroke();
        ctx.strokeStyle = '#3f8f3a'; ctx.lineWidth = 4;
        for (var l = 0; l < 5; l++) { var a = -2.6 + l * 0.55; ctx.beginPath(); ctx.moveTo(px + 4, py - 55); ctx.quadraticCurveTo(px + 4 + Math.cos(a) * 18, py - 70, px + 4 + Math.cos(a) * 30, py - 55 + Math.sin(a + 1.6) * 10 + 8); ctx.stroke(); }
      } else if (th.deco === 'night' && i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,240,150,' + (0.5 + 0.5 * Math.sin(time * 3 + i)) + ')';
        ctx.beginPath(); ctx.arc(px + 20, py - 40 - 10 * Math.sin(time + i), 2.5, 0, 7); ctx.fill();
      }
    }
  }

  function drawTiles(ctx, L, th, camX, VW, time) {
    var T = L.T, c0 = Math.max(0, Math.floor(camX / T) - 1), c1 = Math.min(L.cols - 1, Math.ceil((camX + VW) / T) + 1);
    for (var c = c0; c <= c1; c++) {
      for (var r = 0; r < L.rows; r++) {
        var v = L.tiles[r * L.cols + c]; if (!v) continue;
        var x = Math.floor(c * T - camX), y = r * T;
        if (v === 1) {
          var above = r > 0 ? L.tiles[(r - 1) * L.cols + c] : 0;
          ctx.fillStyle = th.dirt; ctx.fillRect(x, y, T + 1, T + 1);
          ctx.fillStyle = th.dirtDk;
          ctx.fillRect(x + 5 + ((c * 7 + r * 3) % 12), y + 10 + ((c * 5 + r) % 10), 5, 4);
          ctx.fillRect(x + 18 - ((c * 3 + r * 7) % 10), y + 20, 4, 3);
          if (above !== 1) {
            ctx.fillStyle = th.top; ctx.fillRect(x, y, T + 1, 9);
            ctx.fillStyle = th.topHi; ctx.fillRect(x, y, T + 1, 3);
            ctx.fillStyle = th.top;
            for (var k = 0; k < 3; k++) ctx.fillRect(x + 4 + k * 10, y + 9, 5, 3);
          }
        } else if (v === 2) {
          ctx.fillStyle = th.block; roundRect(ctx, x + 1, y + 1, T - 2, T - 2, 5); ctx.fill();
          ctx.fillStyle = th.blockDk; ctx.fillRect(x + 1, y + T / 2 - 1, T - 2, 2); ctx.fillRect(x + T / 2 - 1, y + 2, 2, T / 2 - 2);
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 4, y + 4, T - 8, 3);
        } else if (v === 3) {
          ctx.fillStyle = '#d9dde6';
          for (var s = 0; s < 3; s++) { ctx.beginPath(); ctx.moveTo(x + s * 10, y + T); ctx.lineTo(x + s * 10 + 5, y + 10); ctx.lineTo(x + s * 10 + 10, y + T); ctx.fill(); }
          ctx.fillStyle = '#8b93a7'; ctx.fillRect(x, y + T - 4, T, 4);
        }
      }
    }
  }

  function drawCoin(ctx, x, y, time) {
    var sx = Math.abs(Math.cos(time * 3 + x * 0.01));
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.15, sx), 1);
    ctx.fillStyle = '#c98a00'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff2a8';
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.2 : 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.fill(); ctx.restore();
  }

  /* الشخصيات: صور الطالب/الطالبة (مشي + قفز) */
  var SPRITES = {};
  ['girl', 'girl2', 'boy'].forEach(function (k) {
    // المنظر الجانبي (متجه نحو اليمين) يُستخدم داخل اللعب، ويُعكس عند الحركة لليسار
    SPRITES[k] = { side: new Image(), jump: new Image() };
    SPRITES[k].side.src = 'assets/characters/' + k + '-side.png';
    SPRITES[k].jump.src = 'assets/characters/' + k + '-jump.png';  // وضعية القفز
  });
  var DRAW_H = 58; // ارتفاع الشخصية المرسومة (وحدات منطقية)

  function drawPlayer(ctx, p, camX, time) {
    if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0 && !p.dead) return;
    var set = SPRITES[window.__character || 'girl'] || SPRITES.girl;
    var air = !p.onGround || p.dead;
    var img = air && set.jump.complete && set.jump.naturalWidth ? set.jump : set.side;
    if (!img.complete || !img.naturalWidth) return;
    var running = p.onGround && Math.abs(p.vx) > 0.3;
    var h = img === set.jump ? DRAW_H * 0.92 : DRAW_H, w = h * img.naturalWidth / img.naturalHeight;
    var x = p.x - camX + p.w / 2, y = p.y + p.h;
    if (p.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x, y - 1, 11, 3, 0, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(x, y);
    if (p.facing < 0) ctx.scale(-1, 1);   // الجسم يتجه دائمًا نحو جهة الحركة
    if (p.dead) ctx.rotate(Math.sin(time * 20) * 0.3);
    if (running) {
      var ph = p.anim * 0.32, sp = Math.min(1, Math.abs(p.vx) / 3);
      ctx.translate(0, -Math.abs(Math.sin(ph)) * 3.2 * sp);  // ارتداد الخطوات
      ctx.rotate(0.07 * sp + Math.sin(ph * 2) * 0.025);      // ميلان للأمام أثناء الجري
      ctx.scale(1 + Math.abs(Math.cos(ph)) * 0.03, 1 - Math.abs(Math.cos(ph)) * 0.03);
    } else if (!air) {
      ctx.scale(1, 1 + Math.sin(time * 3) * 0.012);
    } else {
      // القفز: صورة وضعية القفز مع ميلان خفيف نحو جهة الحركة
      ctx.rotate(Math.max(-0.08, Math.min(0.14, -p.vy * 0.012 + 0.05)));
    }
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
  }

  function drawEnemy(ctx, e, camX, time) {
    var x = e.x - camX, y = e.y;
    ctx.save();
    if (e.type === 'walker') {
      if (e.squash) { ctx.translate(x + e.w / 2, y + e.h); ctx.scale(1.3, 0.35); ctx.translate(-e.w / 2, -e.h); x = 0; y = 0; }
      var step = Math.sin(time * 10 + e.x) * 2;
      ctx.fillStyle = '#3a2442'; ctx.fillRect(x + 4, y + e.h - 5 + step * 0.3, 5, 5); ctx.fillRect(x + e.w - 9, y + e.h - 5 - step * 0.3, 5, 5);
      ctx.fillStyle = '#c2348a'; ctx.beginPath(); ctx.ellipse(x + e.w / 2, y + e.h - 6, e.w / 2, e.h - 6, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(x, y + e.h - 7, e.w, 3);
      ctx.fillStyle = '#ffb3de'; ctx.beginPath(); ctx.arc(x + 8, y + 9, 3, 0, 7); ctx.arc(x + 18, y + 6, 2.5, 0, 7); ctx.fill();
      var dir = e.vx < 0 ? -1 : 1;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + e.w / 2 + dir * 5, y + 12, 4, 0, 7); ctx.arc(x + e.w / 2 + dir * -1, y + 12, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x + e.w / 2 + dir * 6, y + 13, 1.8, 0, 7); ctx.arc(x + e.w / 2 + dir * 0, y + 13, 1.8, 0, 7); ctx.fill();
    } else {
      // نحلة مرحة
      var flap = Math.sin(time * 30) * 4;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.ellipse(x + 10, y + 2 - flap * 0.3, 7, 5 + flap * 0.4, -0.4, 0, 7); ctx.ellipse(x + 17, y + 2 + flap * 0.3, 7, 5 - flap * 0.4, 0.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffc83a'; ctx.beginPath(); ctx.ellipse(x + 13, y + 11, 13, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2b2b2b'; ctx.fillRect(x + 9, y + 3, 4, 16); ctx.fillRect(x + 16, y + 3, 4, 16);
      var d2 = e.vx < 0 ? 0 : 1;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(d2 ? x + 22 : x + 4, y + 9, 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(d2 ? x + 23 : x + 3, y + 9, 1.5, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawMover(ctx, m, camX, th) {
    var x = m.x - camX;
    ctx.fillStyle = th.blockDk; roundRect(ctx, x, m.y, m.w, m.h, 5); ctx.fill();
    ctx.fillStyle = th.block; roundRect(ctx, x, m.y, m.w, m.h - 4, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (var i = 8; i < m.w - 4; i += 16) ctx.fillRect(x + i, m.y + 3, 8, 2);
  }

  function drawCheckpoint(ctx, cp, camX, time) {
    var x = cp.x - camX, y = cp.y;
    ctx.fillStyle = '#5b5f6b'; ctx.fillRect(x - 2, y - 62, 4, 62);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x, y - 64, 4, 0, 7); ctx.fill();
    var wave = Math.sin(time * 6) * 3;
    ctx.fillStyle = cp.active ? '#2bbf6a' : '#a9adb8';
    ctx.beginPath(); ctx.moveTo(x + 2, y - 60); ctx.quadraticCurveTo(x + 16, y - 56 + wave, x + 30, y - 52); ctx.lineTo(x + 2, y - 40); ctx.fill();
    if (cp.active) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 12, y - 51, 3, 0, 7); ctx.fill(); }
  }

  function drawGoal(ctx, g, camX, time) {
    var x = g.x - camX, y = g.y;
    // بوابة/برج النهاية
    ctx.fillStyle = '#e8d2a6'; ctx.fillRect(x - 10, y - 120, 80, 120);
    ctx.fillStyle = '#cfb27c';
    for (var i = 0; i < 5; i++) ctx.fillRect(x - 10 + i * 17, y - 132, 11, 12);
    ctx.fillRect(x - 10, y - 70, 80, 4);
    ctx.fillStyle = '#7b4a26'; ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(x + 14, y - 34); ctx.arc(x + 30, y - 34, 16, Math.PI, 0); ctx.lineTo(x + 46, y); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + 30, y - 95, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#5b5f6b'; ctx.fillRect(x + 28, y - 175, 3, 45);
    var wave = Math.sin(time * 5) * 4;
    ctx.fillStyle = '#e53950'; ctx.beginPath(); ctx.moveTo(x + 31, y - 175); ctx.quadraticCurveTo(x + 46, y - 170 + wave, x + 62, y - 165); ctx.lineTo(x + 31, y - 155); ctx.fill();
  }

  function drawParticles(ctx, parts, camX) {
    parts.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      if (p.text) {
        ctx.fillStyle = p.color || '#fff'; ctx.font = 'bold 13px Tahoma, sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.strokeText(p.text, p.x - camX, p.y); ctx.fillText(p.text, p.x - camX, p.y);
      } else { ctx.fillStyle = p.color; ctx.fillRect(p.x - camX - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    });
    ctx.globalAlpha = 1;
  }

  window.Render = {
    THEMES: THEMES,
    SPRITES: SPRITES,
    frame: function (ctx, G, VW, VH, time) {
      var L = G.level, th = THEMES[L.theme], camX = G.camX;
      drawBackground(ctx, th, camX, VW, VH, time);
      drawGoal(ctx, L.goal, camX, time);
      L.checkpoints.forEach(function (cp) { if (cp.x - camX > -40 && cp.x - camX < VW + 40) drawCheckpoint(ctx, cp, camX, time); });
      drawTiles(ctx, L, th, camX, VW, time);
      L.movers.forEach(function (m) { drawMover(ctx, m, camX, th); });
      L.coins.forEach(function (c) { if (!c.taken && c.x - camX > -20 && c.x - camX < VW + 20) drawCoin(ctx, c.x - camX, c.y + Math.sin(time * 3 + c.x) * 1.5, time); });
      L.enemies.forEach(function (e) { if ((e.alive || e.squash) && e.x - camX > -40 && e.x - camX < VW + 40) drawEnemy(ctx, e, camX, time); });
      drawPlayer(ctx, G.player, camX, time);
      drawParticles(ctx, G.particles, camX);
    }
  };
})();
