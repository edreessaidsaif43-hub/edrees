'use strict';

// محرك رسم الشهادات (الإصدار 2): تصاميم عصرية بأختام معدنية وأشكال هندسية وزخارف.
// مواصفات القوالب (style/palette/fonts) يرسلها الخادم للمشتركين فقط.
window.CertificateRenderer = (() => {
  const DW = 1000;
  const DH = 707;
  const TAU = Math.PI * 2;

  // ---------- أدوات الألوان ----------
  function rgb(hex) {
    const v = parseInt(String(hex || '#000000').slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function mix(hex, target, amount) {
    const a = rgb(hex); const b = rgb(target);
    return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * amount)).join(',')})`;
  }
  const light = (hex, a) => mix(hex, '#ffffff', a);
  const dark = (hex, a) => mix(hex, '#000000', a);
  const alpha = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;

  function metal(ctx, x0, y0, x1, y1, base) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, light(base, 0.55));
    g.addColorStop(0.22, base);
    g.addColorStop(0.45, light(base, 0.35));
    g.addColorStop(0.62, dark(base, 0.22));
    g.addColorStop(0.82, light(base, 0.25));
    g.addColorStop(1, dark(base, 0.3));
    return g;
  }

  function seeded(seed) {
    let value = seed % 2147483647;
    if (value <= 0) value += 2147483646;
    return () => (value = (value * 16807) % 2147483647) / 2147483647;
  }

  // ---------- أشكال أساسية ----------
  function star(ctx, cx, cy, points, outer, inner, rotation = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = rotation + (i * Math.PI) / points;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function octagram(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const rr = i % 2 ? r * 0.72 : r;
      const a = (i * Math.PI) / 8 - Math.PI / 8;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function poly(ctx, points, fill) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function mirror(ctx, fn) {
    fn();
    ctx.save();
    ctx.translate(DW, DH);
    ctx.rotate(Math.PI);
    fn();
    ctx.restore();
  }

  function rosette(ctx, cx, cy, r, color, lw = 0.6, loops = 36) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    for (let i = 0; i < loops; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.38, (i * Math.PI) / loops, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function cornerBrackets(ctx, inset, len, color, width) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const [x, y, sx, sy] of [[inset, inset, 1, 1], [DW - inset, inset, -1, 1], [inset, DH - inset, 1, -1], [DW - inset, DH - inset, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * len); ctx.lineTo(x, y); ctx.lineTo(x + sx * len, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + sx * 8, y + sy * (len - 14)); ctx.lineTo(x + sx * 8, y + sy * 8); ctx.lineTo(x + sx * (len - 14), y + sy * 8);
      ctx.stroke();
      ctx.save();
      ctx.translate(x + sx * 8, y + sy * 8); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color; ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    ctx.restore();
  }

  function islamicPattern(ctx, color, step, x0 = 0, y0 = 0, x1 = DW, y1 = DH) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    for (let y = y0; y <= y1 + step; y += step) {
      for (let x = x0; x <= x1 + step; x += step) {
        octagram(ctx, x, y, step * 0.36); ctx.stroke();
        ctx.beginPath();
        ctx.rect(x + step / 2 - step * 0.12, y + step / 2 - step * 0.12, step * 0.24, step * 0.24);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function leafBranch(ctx, x, y, scale, rotation, stroke, fill) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scale, scale);
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(60, -10, 120, 10, 190, -30); ctx.stroke();
    const leaves = [[30, -3, -0.9], [55, -5, 0.8], [80, -2, -0.7], [105, 0, 0.9], [130, -4, -0.6], [155, -14, 0.7], [178, -24, -0.4]];
    for (const [lx, ly, a] of leaves) {
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(11, -9, 24, 0); ctx.quadraticCurveTo(11, 9, 0, 0);
      ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    for (const [bx, by] of [[192, -31], [70, -14], [140, 2]]) {
      ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, TAU); ctx.fillStyle = stroke; ctx.fill();
    }
    ctx.restore();
  }

  // ---------- الخلفيات والزخارف لكل نمط ----------
  const styles = {
    'luxe-dark'(ctx, p) {
      const g = ctx.createRadialGradient(DW / 2, DH / 2, 60, DW / 2, DH / 2, 640);
      g.addColorStop(0, light(p.primary, 0.12)); g.addColorStop(1, dark(p.primary, 0.45));
      ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
      rosette(ctx, DW / 2, DH / 2 - 10, 330, alpha(p.accent, 0.06), 0.7, 48);
      islamicPattern(ctx, alpha(p.accent, 0.035), 70);
      ctx.lineWidth = 3; ctx.strokeStyle = metal(ctx, 0, 0, DW, DH, p.accent); ctx.strokeRect(22, 22, DW - 44, DH - 44);
      ctx.lineWidth = 1; ctx.strokeRect(32, 32, DW - 64, DH - 64);
      cornerBrackets(ctx, 44, 74, p.accent, 1.6);
    },
    'geo-modern'(ctx, p) {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, DW, DH);
      ctx.strokeStyle = alpha(p.primary, 0.12); ctx.lineWidth = 1; ctx.strokeRect(26, 26, DW - 52, DH - 52);
      mirror(ctx, () => {
        poly(ctx, [[DW, 0], [DW - 300, 0], [DW, 230]], p.primary);
        poly(ctx, [[DW, 0], [DW - 170, 0], [DW, 150]], dark(p.primary, 0.3));
        poly(ctx, [[DW, 120], [DW, 330], [DW - 150, 215]], alpha(p.secondary || p.accent, 0.85));
        poly(ctx, [[DW - 300, 0], [DW - 380, 0], [DW - 210, 120]], alpha(p.primary, 0.18));
        ctx.save(); ctx.strokeStyle = metal(ctx, DW - 400, 0, DW, 300, p.accent); ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(DW - 330, 0); ctx.lineTo(DW, 255); ctx.stroke(); ctx.restore();
      });
    },
    'side-band'(ctx, p) {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, DW, DH);
      islamicPattern(ctx, alpha(p.primary, 0.035), 60, 0, 0, 740, DH);
      const g = ctx.createLinearGradient(760, 0, DW, DH);
      g.addColorStop(0, light(p.primary, 0.08)); g.addColorStop(1, dark(p.primary, 0.35));
      ctx.fillStyle = g; ctx.fillRect(760, 0, 240, DH);
      ctx.save(); ctx.beginPath(); ctx.rect(760, 0, 240, DH); ctx.clip();
      islamicPattern(ctx, alpha('#ffffff', 0.07), 48, 760, 0, DW, DH); ctx.restore();
      ctx.fillStyle = metal(ctx, 0, 0, 0, DH, p.accent); ctx.fillRect(752, 0, 6, DH);
      ctx.fillRect(744, 0, 1.5, DH);
      ctx.strokeStyle = alpha(p.primary, 0.25); ctx.lineWidth = 1; ctx.strokeRect(26, 26, 700, DH - 52);
    },
    islamic(ctx, p) {
      const g = ctx.createLinearGradient(0, 0, 0, DH);
      g.addColorStop(0, p.bg); g.addColorStop(1, p.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
      islamicPattern(ctx, alpha(p.primary, 0.07), 56);
      ctx.fillStyle = p.primary; ctx.beginPath(); ctx.rect(0, 0, DW, DH); ctx.rect(26, 26, DW - 52, DH - 52); ctx.fill('evenodd');
      ctx.strokeStyle = metal(ctx, 0, 0, DW, DH, p.accent); ctx.lineWidth = 2.5; ctx.strokeRect(34, 34, DW - 68, DH - 68);
      ctx.lineWidth = 0.8; ctx.strokeRect(40, 40, DW - 80, DH - 80);
      // قوس المحراب
      const arch = (inset) => {
        ctx.beginPath();
        ctx.moveTo(120 + inset, 668);
        ctx.lineTo(120 + inset, 250);
        ctx.quadraticCurveTo(120 + inset, 96 + inset, DW / 2, 58 + inset);
        ctx.quadraticCurveTo(DW - 120 - inset, 96 + inset, DW - 120 - inset, 250);
        ctx.lineTo(DW - 120 - inset, 668);
      };
      ctx.save(); arch(0); ctx.closePath(); ctx.fillStyle = alpha(p.bg, 0.92); ctx.fill(); ctx.restore();
      ctx.strokeStyle = metal(ctx, 120, 58, DW - 120, 668, p.accent); ctx.lineWidth = 2.2; arch(0); ctx.stroke();
      ctx.lineWidth = 0.8; arch(9); ctx.stroke();
      ctx.fillStyle = p.accent; octagram(ctx, DW / 2, 58, 9); ctx.fill();
    },
    'hex-tech'(ctx, p, random) {
      const g = ctx.createLinearGradient(0, 0, DW, DH);
      g.addColorStop(0, light(p.primary, 0.05)); g.addColorStop(1, dark(p.primary, 0.5));
      ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
      ctx.strokeStyle = alpha('#ffffff', 0.05); ctx.lineWidth = 1;
      const r = 26; const h = Math.sqrt(3) * r;
      for (let row = -1; row < DH / h + 1; row++) {
        for (let col = -1; col < DW / (r * 1.5) + 1; col++) {
          const cx = col * r * 1.5; const cy = row * h + (col % 2 ? h / 2 : 0);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) ctx.lineTo(cx + r * Math.cos((i * Math.PI) / 3), cy + r * Math.sin((i * Math.PI) / 3));
          ctx.closePath(); ctx.stroke();
        }
      }
      const nodes = [];
      for (let i = 0; i < 26; i++) {
        const corner = i % 2;
        nodes.push([corner ? DW - random() * 260 : random() * 260, corner ? random() * 200 : DH - random() * 200]);
      }
      ctx.strokeStyle = alpha(p.accent, 0.35); ctx.lineWidth = 0.9;
      nodes.forEach(([x, y], i) => nodes.slice(i + 1).forEach(([x2, y2]) => {
        if (Math.hypot(x - x2, y - y2) < 95) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); }
      }));
      nodes.forEach(([x, y]) => {
        ctx.save(); ctx.shadowColor = p.accent; ctx.shadowBlur = 12;
        ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill(); ctx.restore();
      });
      ctx.strokeStyle = alpha(p.accent, 0.8); ctx.lineWidth = 2; ctx.strokeRect(24, 24, DW - 48, DH - 48);
      cornerBrackets(ctx, 36, 60, p.accent, 1.4);
    },
    playful(ctx, p, random) {
      ctx.fillStyle = p.bg2; ctx.fillRect(0, 0, DW, DH);
      const colors = p.fun || [p.primary, p.accent, '#ffc83d', '#7c5cff', '#ff7aa2'];
      const blobs = [[0, 0, 170], [DW, 0, 150], [0, DH, 150], [DW, DH, 180], [DW * 0.5, -40, 70], [DW * 0.5, DH + 40, 70]];
      blobs.forEach(([x, y, r], i) => { ctx.fillStyle = alpha(colors[i % colors.length], 0.28); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
      ctx.save(); ctx.shadowColor = 'rgba(30,40,80,.18)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
      roundRect(ctx, 42, 42, DW - 84, DH - 84, 30); ctx.fillStyle = p.bg; ctx.fill(); ctx.restore();
      ctx.setLineDash([2, 10]); ctx.lineCap = 'round'; ctx.strokeStyle = alpha(p.primary, 0.55); ctx.lineWidth = 3;
      roundRect(ctx, 56, 56, DW - 112, DH - 112, 22); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 46; i++) {
        const side = i % 4; const t = random();
        const x = side < 2 ? t * DW : (side === 2 ? 8 + random() * 26 : DW - 8 - random() * 26);
        const y = side < 2 ? (side === 0 ? 8 + random() * 26 : DH - 8 - random() * 26) : t * DH;
        ctx.fillStyle = colors[Math.floor(random() * colors.length)];
        if (random() > 0.55) { star(ctx, x, y, 5, 7 + random() * 5, 3, random() * 3); ctx.fill(); }
        else { ctx.save(); ctx.translate(x, y); ctx.rotate(random() * 3); ctx.fillRect(-5, -2.5, 10, 5); ctx.restore(); }
      }
    },
    'minimal-lux'(ctx, p) {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, DW, DH);
      const g = ctx.createRadialGradient(DW / 2, DH / 2, 100, DW / 2, DH / 2, 620);
      g.addColorStop(0, alpha(p.bg2, 0)); g.addColorStop(1, alpha(p.bg2, 1));
      ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
      ctx.strokeStyle = p.primary; ctx.lineWidth = 0.9; ctx.strokeRect(40, 40, DW - 80, DH - 80);
      ctx.lineWidth = 0.5; ctx.strokeRect(46, 46, DW - 92, DH - 92);
      cornerBrackets(ctx, 28, 58, p.accent, 1.8);
    },
    floral(ctx, p) {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, DW, DH);
      const wash = (x, y, r, c) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, alpha(c, 0.55)); g.addColorStop(1, alpha(c, 0));
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      };
      wash(60, 60, 260, p.bg2); wash(170, 20, 160, p.secondary || p.accent);
      wash(DW - 60, DH - 60, 260, p.bg2); wash(DW - 170, DH - 10, 160, p.secondary || p.accent);
      ctx.strokeStyle = metal(ctx, 0, 0, DW, DH, p.accent); ctx.lineWidth = 1.6;
      roundRect(ctx, 30, 30, DW - 60, DH - 60, 18); ctx.stroke();
      leafBranch(ctx, 46, 120, 1, -0.5, p.accent, alpha(p.primary, 0.22));
      leafBranch(ctx, 120, 46, 0.9, 0.05, p.accent, alpha(p.primary, 0.22));
      leafBranch(ctx, DW - 46, DH - 120, 1, Math.PI - 0.5, p.accent, alpha(p.primary, 0.22));
      leafBranch(ctx, DW - 120, DH - 46, 0.9, Math.PI + 0.05, p.accent, alpha(p.primary, 0.22));
    },
    'ribbon-corner'(ctx, p) {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, DW, DH);
      rosette(ctx, DW / 2, DH / 2, 300, alpha(p.primary, 0.04), 0.7, 40);
      ctx.strokeStyle = metal(ctx, 0, 0, DW, DH, p.accent); ctx.lineWidth = 2; ctx.strokeRect(30, 30, DW - 60, DH - 60);
      ctx.lineWidth = 0.7; ctx.strokeRect(37, 37, DW - 74, DH - 74);
      mirror(ctx, () => {
        poly(ctx, [[DW, 0], [DW - 230, 0], [DW, 230]], p.primary);
        ctx.save(); ctx.lineWidth = 9; ctx.strokeStyle = metal(ctx, DW - 260, 0, DW, 260, p.accent);
        ctx.beginPath(); ctx.moveTo(DW - 262, 0); ctx.lineTo(DW, 262); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(DW - 282, 0); ctx.lineTo(DW, 282); ctx.stroke();
        ctx.restore();
        poly(ctx, [[DW, 0], [DW - 120, 0], [DW, 120]], dark(p.primary, 0.25));
      });
    },
    waves(ctx, p) {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, DW, DH);
      const layer = (pts, c1, c2) => {
        const g = ctx.createLinearGradient(DW, 0, DW - 500, 300);
        g.addColorStop(0, c1); g.addColorStop(1, c2);
        ctx.beginPath(); ctx.moveTo(DW, 0); ctx.lineTo(pts[0], 0);
        ctx.bezierCurveTo(pts[1], pts[2], pts[3], pts[4], DW, pts[5]); ctx.closePath();
        ctx.fillStyle = g; ctx.fill();
      };
      mirror(ctx, () => {
        layer([DW - 520, DW - 360, 120, DW - 170, 60, 300], alpha(p.secondary || p.accent, 0.35), alpha(p.secondary || p.accent, 0.05));
        layer([DW - 430, DW - 300, 90, DW - 150, 30, 230], dark(p.primary, 0.15), light(p.primary, 0.25));
        layer([DW - 260, DW - 170, 70, DW - 80, 30, 150], dark(p.primary, 0.4), p.primary);
        ctx.save(); ctx.strokeStyle = metal(ctx, DW - 470, 0, DW, 270, p.accent); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(DW - 470, 0); ctx.bezierCurveTo(DW - 330, 110, DW - 160, 50, DW, 268); ctx.stroke(); ctx.restore();
      });
    },
    guilloche(ctx, p) {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, DW, DH);
      rosette(ctx, DW / 2, DH / 2, 310, alpha(p.primary, 0.045), 0.6, 44);
      const band = (color, phase, amp) => {
        ctx.strokeStyle = color; ctx.lineWidth = 0.9;
        const side = (len, fn) => { ctx.beginPath(); for (let t = 0; t <= len; t += 3) { const [x, y] = fn(t, Math.sin(t / 9 + phase) * amp); t ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); };
        side(DW - 60, (t, o) => [30 + t, 34 + o]);
        side(DW - 60, (t, o) => [30 + t, DH - 34 + o]);
        side(DH - 60, (t, o) => [34 + o, 30 + t]);
        side(DH - 60, (t, o) => [DW - 34 + o, 30 + t]);
      };
      for (let i = 0; i < 5; i++) band(i % 2 ? p.primary : alpha(p.secondary || p.accent, 0.9), i * 1.25, 9);
      ctx.strokeStyle = p.primary; ctx.lineWidth = 1.4; ctx.strokeRect(18, 18, DW - 36, DH - 36); ctx.strokeRect(52, 52, DW - 104, DH - 104);
      for (const [x, y] of [[34, 34], [DW - 34, 34], [34, DH - 34], [DW - 34, DH - 34]]) {
        ctx.fillStyle = p.bg; ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fill();
        ctx.fillStyle = metal(ctx, x - 14, y - 14, x + 14, y + 14, p.accent); octagram(ctx, x, y, 14); ctx.fill();
      }
    },
    heritage(ctx, p, random) {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, DW, DH);
      for (let i = 0; i < 2600; i++) { ctx.fillStyle = alpha(p.primary, random() * 0.05); ctx.fillRect(random() * DW, random() * DH, 1.4, 1.4); }
      const g = ctx.createRadialGradient(DW / 2, DH / 2, 200, DW / 2, DH / 2, 640);
      g.addColorStop(0, alpha(p.bg2, 0)); g.addColorStop(1, alpha(p.bg2, 0.9)); ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
      ctx.fillStyle = p.primary; ctx.beginPath(); ctx.rect(18, 18, DW - 36, DH - 36); ctx.rect(46, 46, DW - 92, DH - 92); ctx.fill('evenodd');
      const diamond = (x, y, s, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill(); };
      for (let x = 46; x <= DW - 46; x += 24) { diamond(x, 32, 8, p.bg); diamond(x, DH - 32, 8, p.bg); diamond(x, 32, 3.5, p.accent); diamond(x, DH - 32, 3.5, p.accent); }
      for (let y = 70; y <= DH - 70; y += 24) { diamond(32, y, 8, p.bg); diamond(DW - 32, y, 8, p.bg); diamond(32, y, 3.5, p.accent); diamond(DW - 32, y, 3.5, p.accent); }
      ctx.strokeStyle = p.accent; ctx.lineWidth = 1.2; ctx.strokeRect(56, 56, DW - 112, DH - 112);
    },
  };

  // ---------- الأختام ----------
  function ribbons(ctx, x, y, color, length = 70, spread = 26) {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(x + side * 13, y + length * 0.25);
      ctx.rotate(side * 0.32);
      const g = ctx.createLinearGradient(-12, 0, 12, 0);
      g.addColorStop(0, dark(color, 0.25)); g.addColorStop(0.5, light(color, 0.15)); g.addColorStop(1, dark(color, 0.3));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.lineTo(13, length); ctx.lineTo(0, length - 13); ctx.lineTo(-13, length); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    void spread;
  }

  const seals = {
    rosette(ctx, p, x, y, r = 46, opts = {}) {
      if (opts.ribbons !== false) ribbons(ctx, x, y, opts.ribbon || p.primary, r * 1.3);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
      ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, p.accent); star(ctx, x, y, 30, r, r - 5); ctx.fill(); ctx.restore();
      ctx.fillStyle = metal(ctx, x + r, y - r, x - r, y + r, p.accent); ctx.beginPath(); ctx.arc(x, y, r - 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = dark(p.accent, 0.35); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r - 13, 0, TAU); ctx.stroke();
      ctx.setLineDash([1.5, 3]); ctx.beginPath(); ctx.arc(x, y, r - 17, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = opts.center || dark(p.accent, 0.38); star(ctx, x, y - 1, 5, r * 0.36, r * 0.15); ctx.fill();
    },
    medal(ctx, p, x, y, r = 40) {
      const g = ctx.createLinearGradient(x - 30, y - 90, x + 30, y - 90);
      g.addColorStop(0, dark(p.primary, 0.2)); g.addColorStop(0.5, light(p.primary, 0.2)); g.addColorStop(1, dark(p.primary, 0.2));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 30, y - 96); ctx.lineTo(x - 8, y - 96); ctx.lineTo(x + 6, y - 20); ctx.lineTo(x - 14, y - 20); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 30, y - 96); ctx.lineTo(x + 8, y - 96); ctx.lineTo(x - 6, y - 20); ctx.lineTo(x + 14, y - 20); ctx.fill();
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, p.accent); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
      ctx.strokeStyle = light(p.accent, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r - 7, 0, TAU); ctx.stroke();
      ctx.fillStyle = dark(p.accent, 0.35); star(ctx, x, y + 1, 5, r * 0.45, r * 0.19); ctx.fill();
    },
    emblem(ctx, p, x, y, r = 34) {
      ctx.strokeStyle = metal(ctx, x - r, y - r, x + r, y + r, p.accent); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, r - 5, 0, TAU); ctx.stroke();
      ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, p.accent); octagram(ctx, x, y, r * 0.55); ctx.fill();
      ctx.fillStyle = p.bg; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, TAU); ctx.fill();
    },
    'fun-star'(ctx, p, x, y, r = 48) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#ffc83d'; star(ctx, x, y, 5, r, r * 0.46); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#ffdf7a'; star(ctx, x, y, 5, r * 0.62, r * 0.29); ctx.fill();
      ctx.fillStyle = '#5a3d00'; ctx.beginPath(); ctx.arc(x - 8, y - 3, 2.6, 0, TAU); ctx.arc(x + 8, y - 3, 2.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5a3d00'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y + 2, 7, 0.2, Math.PI - 0.2); ctx.stroke();
    },
  };

  // ---------- النصوص ----------
  function fontStack(name) {
    return `"${name}", "Amiri", "Cairo", "Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif`;
  }

  function wrap(ctx, value, maxWidth) {
    const lines = [];
    for (const paragraph of String(value || '').split(/\n/)) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function fit(ctx, value, size, font, weight, maxWidth) {
    let current = size;
    ctx.font = `${weight} ${current}px ${fontStack(font)}`;
    while (ctx.measureText(value).width > maxWidth && current > 10) {
      current -= 1;
      ctx.font = `${weight} ${current}px ${fontStack(font)}`;
    }
    return current;
  }

  function text(ctx, value, x, y, size, fill, font, weight = 700, maxWidth = 800) {
    if (!value) return 0;
    const used = fit(ctx, value, size, font, weight, maxWidth);
    if (fill === 'metal') {
      const w = ctx.measureText(value).width;
      ctx.fillStyle = metal(ctx, x - w / 2, y - used, x + w / 2, y, ctx.__accent);
    } else ctx.fillStyle = fill;
    ctx.fillText(value, x, y);
    return used;
  }

  function latin(ctx, value, x, y, size, color, spacing) {
    if (!value) return;
    ctx.save();
    ctx.direction = 'ltr';
    ctx.font = `600 ${size}px "Cairo", "Poppins", "Segoe UI", sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillStyle = color;
    ctx.fillText(value.toUpperCase(), x, y);
    ctx.restore();
  }

  function divider(ctx, cx, y, color, width = 120) {
    ctx.save();
    const g = ctx.createLinearGradient(cx - width, 0, cx + width, 0);
    g.addColorStop(0, alpha(color, 0)); g.addColorStop(0.5, color); g.addColorStop(1, alpha(color, 0));
    ctx.strokeStyle = g; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx - width, y); ctx.lineTo(cx - 14, y); ctx.moveTo(cx + 14, y); ctx.lineTo(cx + width, y); ctx.stroke();
    ctx.fillStyle = color; ctx.translate(cx, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-4.5, -4.5, 9, 9);
    ctx.restore();
  }

  function swash(ctx, cx, y, color, width) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - width, y);
    ctx.bezierCurveTo(cx - width * 0.4, y + 10, cx - width * 0.25, y - 8, cx, y + 2);
    ctx.bezierCurveTo(cx + width * 0.25, y - 8, cx + width * 0.4, y + 10, cx + width, y);
    ctx.stroke();
    ctx.restore();
  }

  // data: { heading, subtitle, intro, name, note, phrase, extra, teacherTitle, teacherName, principalTitle, principalName, date }
  function draw(ctx, width, height, template, data, options = {}) {
    const p = { ...template.palette };
    if (options.colors?.primary) p.primary = options.colors.primary;
    if (options.colors?.accent) p.accent = options.colors.accent;
    const f = template.fonts || {};
    const fonts = {
      heading: options.font || f.heading || template.font || 'Amiri',
      name: options.font || f.name || f.heading || template.font || 'Amiri',
      body: options.font || f.body || 'Cairo',
    };
    const side = template.layout === 'side';
    const cx = side ? 386 : DW / 2;
    const maxW = side ? 600 : 740;
    const random = seeded(options.seed || 11);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.scale(width / DW, height / DH);
    ctx.__accent = p.accent;
    if (template.style === 'image') {
      // خلفية مصممة (من ChatGPT) — يُرسم المحتوى داخل المساحة الفارغة المحددة للقالب
      if (options.background) ctx.drawImage(options.background, 0, 0, DW, DH);
      else { ctx.fillStyle = p.bg; ctx.fillRect(0, 0, DW, DH); }
      const [x0, y0, x1, y1] = template.safe || [0.12, 0.12, 0.88, 0.88];
      const bw = (x1 - x0) * DW; const bh = (y1 - y0) * DH;
      const s = Math.min(bw / 780, bh / 620);
      ctx.translate(x0 * DW + bw / 2 - 500 * s, y0 * DH + bh / 2 - 370 * s);
      ctx.scale(s, s);
    } else (styles[template.style] || styles['minimal-lux'])(ctx, p, random);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const headingFill = template.metalText ? 'metal' : (p.heading || p.primary);
    const nameFill = template.metalText ? 'metal' : (p.name || p.primary);

    let top = template.style === 'islamic' ? 14 : 0;
    if (options.logo) {
      const image = options.logo;
      const scale = Math.min(104 / image.width, 66 / image.height);
      const w = image.width * scale; const h = image.height * scale;
      if (side) ctx.drawImage(image, 880 - w / 2, 46, w, h);
      else { ctx.drawImage(image, cx - w / 2, 62 + top, w, h); top += h + 4; }
    }

    if (options.brandLogo) {
      // شعار برنامج تحفيز+ في الزاوية العليا
      const size = 128;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      ctx.drawImage(options.brandLogo, side ? 60 : 118, (template.style === 'islamic' ? 66 : 52), size, size);
      ctx.restore();
    }
    text(ctx, data.heading, cx, 140 + top, 64, headingFill, fonts.heading, 700, maxW - 80);
    if (data.subtitle) latin(ctx, data.subtitle, cx, 177 + top, 12, p.accentText || p.accent, 6);
    divider(ctx, cx, (data.subtitle ? 194 : 172) + top, p.accent, 130);
    const shift = data.subtitle ? 14 : 0;

    text(ctx, data.intro, cx, 226 + top + shift, 20, p.muted, fonts.body, 500, maxW);
    const nameSize = text(ctx, data.name, cx, 298 + top + shift, 60, nameFill, fonts.name, 700, maxW - 20);
    ctx.font = `700 ${nameSize}px ${fontStack(fonts.name)}`;
    const nameW = Math.min(maxW - 20, Math.max(180, ctx.measureText(data.name || '').width));
    swash(ctx, cx, 316 + top + shift, alpha(p.accent, 0.85), nameW / 2 + 16);
    let y = 350 + top + shift;
    if (data.note) { text(ctx, data.note, cx, y, 18, p.accentText || p.accent, fonts.body, 700, maxW); y += 34; }
    else y += 6;

    ctx.font = `500 21px ${fontStack(fonts.body)}`;
    ctx.fillStyle = p.text;
    const lines = wrap(ctx, data.phrase, maxW - 30).slice(0, 3);
    lines.forEach((line, index) => ctx.fillText(line, cx, y + index * 35));
    y += lines.length * 35;
    if (data.extra) text(ctx, data.extra, cx, Math.min(y + 2, 512), 17, p.muted, fonts.body, 500, maxW);

    // التوقيعات والختم
    const signY = 574;
    const cols = side ? [[cx + 200, data.teacherTitle, data.teacherName], [cx - 200, data.principalTitle, data.principalName]]
      : [[DW - 250, data.teacherTitle, data.teacherName], [250, data.principalTitle, data.principalName]];
    for (const [x, title, name] of cols) {
      if (!title && !name) continue;
      text(ctx, title, x, signY, 16, p.muted, fonts.body, 600, 230);
      text(ctx, name, x, signY + 30, 20, p.text, fonts.body, 700, 230);
      const g = ctx.createLinearGradient(x - 100, 0, x + 100, 0);
      g.addColorStop(0, alpha(p.accent, 0)); g.addColorStop(0.5, p.accent); g.addColorStop(1, alpha(p.accent, 0));
      ctx.strokeStyle = g; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 100, signY + 42); ctx.lineTo(x + 100, signY + 42); ctx.stroke();
    }
    const seal = template.seal === 'none' ? () => {} : (seals[template.seal] || seals.rosette);
    if (side) {
      seal(ctx, p, 880, options.logo ? 250 : 210, 62, { ribbon: light(p.primary, 0.3), center: p.primary });
      ctx.save(); ctx.__accent = p.accent; text(ctx, 'تقدير', 880, (options.logo ? 250 : 210) + 140, 40, 'metal', fonts.heading, 700, 200); ctx.restore();
      divider(ctx, 880, (options.logo ? 250 : 210) + 160, p.accent, 70);
      if (data.date) text(ctx, data.date, cx - 200, signY + 64, 13.5, p.muted, fonts.body, 500, 220);
    } else {
      seal(ctx, p, cx, 566, 44, { ribbon: template.ribbon || p.primary });
      if (data.date) text(ctx, data.date, 250, signY + 64, 13.5, p.muted, fonts.body, 500, 220);
    }
    ctx.restore();
  }

  function dataUrlBytes(dataUrl) {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // يبني ملف PDF بصفحات A4 أفقية، كل صفحة صورة JPEG كاملة الدقة.
  function buildPdf(pages) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let length = 0;
    const push = (part) => {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    };
    const pageWidth = 842;
    const pageHeight = 595;
    const pageObjects = pages.map((_, index) => 3 + index * 3);
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    offsets[1] = length; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offsets[2] = length;
    push(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageObjects.map((id) => `${id} 0 R`).join(' ')}] >>\nendobj\n`);
    pages.forEach((page, index) => {
      const pageId = 3 + index * 3;
      const contentId = pageId + 1;
      const imageId = pageId + 2;
      const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
      offsets[pageId] = length;
      push(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
      offsets[contentId] = length;
      push(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
      offsets[imageId] = length;
      push(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);
      push(page.bytes);
      push('\nendstream\nendobj\n');
    });
    const total = 3 + pages.length * 3;
    const xref = length;
    let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let id = 1; id < total; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    push(table);
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  return { draw, buildPdf, dataUrlBytes, DW, DH };
})();
