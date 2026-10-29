/* مولّد مراحل بتدرّج في الصعوبة (بذرة ثابتة لكل درس حتى تبقى المرحلة نفسها عند الإعادة) */
(function () {
  var T = 30, ROWS = 12;
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function generate(stageIndex, totalStages, lessonName) {
    var R = rng(hash(lessonName + '#' + stageIndex));
    var ri = function (a, b) { return a + Math.floor(R() * (b - a + 1)); };
    // الصعوبة تتدرج مع رقم المرحلة
    var d = Math.min(1, stageIndex / 6);
    var length = 150 + Math.min(stageIndex, 6) * 14;
    var cols = length + 20;
    var tiles = new Uint8Array(cols * ROWS);
    var coins = [], enemies = [], movers = [], checkpoints = [];
    function setT(c, r, v) { if (c >= 0 && c < cols && r >= 0 && r < ROWS) tiles[r * cols + c] = v; }
    function ground(c, h) { for (var r = h; r < ROWS; r++) setT(c, r, 1); }
    function coin(c, r) { coins.push({ x: c * T + T / 2, y: r * T + T / 2, taken: false }); }
    var h = 9, c = 0, lastCP = 0, lastEnemy = -99;
    // بداية آمنة
    for (; c < 9; c++) ground(c, h);
    for (var k = 3; k < 7; k++) coin(k, h - 1);

    function flat(len, opts) {
      opts = opts || {};
      var start = c;
      for (var i = 0; i < len; i++, c++) ground(c, h);
      if (!opts.noCoins && R() < 0.75) {
        var n = Math.min(len - 1, ri(3, 5)), off = start + Math.floor((len - n) / 2);
        var row = R() < 0.5 ? h - 1 : h - 2;
        for (var j = 0; j < n; j++) coin(off + j, row);
      }
      var safe = start - lastCP > 4 && start > 12;
      if (!opts.noEnemy && safe && len >= 5 && start - lastEnemy > 6 && R() < 0.3 + 0.4 * d) {
        enemies.push({ type: 'walker', x: (start + len - 2) * T, y: h * T - 24, w: 26, h: 24, vx: -(0.55 + 0.6 * d), alive: true, minX: start * T, maxX: (start + len) * T });
        lastEnemy = start;
      }
      if (!opts.noEnemy && safe && d > 0.35 && len >= 5 && R() < 0.25 * d) {
        enemies.push({ type: 'flyer', x: (start + 2) * T, y: (h - 3) * T, baseY: (h - 3) * T, w: 26, h: 20, t: R() * 6, amp: 26, vx: -(0.5 + 0.4 * d), alive: true, minX: start * T, maxX: (start + len) * T });
      }
      if (len >= 4 && c - lastCP >= 42) {
        checkpoints.push({ x: (start + 1) * T + T / 2, y: h * T, active: false });
        lastCP = start + 1;
      }
      return start;
    }
    function pit() {
      var w = 2 + (R() < 0.15 + 0.6 * d ? 1 : 0);
      var start = c;
      c += w; // أعمدة فارغة = حفرة
      for (var j = 0; j < 3; j++) coin(start - 1 + j * (w + 1) / 2 + 0.5, h - 3 + (j === 1 ? -1 : 0));
    }
    function step() {
      var nh = h + (R() < 0.5 ? -1 : 1) * ri(1, 2);
      nh = Math.max(7, Math.min(10, nh));
      if (h - nh > 2) nh = h - 2;
      h = nh;
    }
    function platforms() {
      var start = c, len = ri(7, 9);
      flat(len, { noCoins: true, noEnemy: true }); // لا أعداء تحت المنصات المنخفضة
      var pw = ri(3, 4), px = start + 3, pr = h - 3;
      for (var i = 0; i < pw; i++) { setT(px + i, pr, 2); coin(px + i, pr - 1); }
      if (R() < 0.4 + 0.3 * d && pr - 3 >= 3) {
        var qx = px + pw + 1, qr = pr - 2;
        for (var j = 0; j < 3; j++) { setT(qx + j, qr, 2); coin(qx + j, qr - 1); }
      }
    }
    function spikes() {
      var start = c, len = 6;
      flat(len, { noCoins: true, noEnemy: true });
      var n = d > 0.6 ? 2 : 1;
      for (var i = 0; i < n; i++) setT(start + 3 + i, h - 1, 3);
      for (var j = 0; j < 3; j++) coin(start + 2 + j + (n - 1) * 0.5, h - 3);
    }
    function mover() {
      var w = ri(5, 6), start = c;
      c += w;
      // المنصة بمستوى الأرض وتتداخل مع الحافتين بمقدار مربع كامل لتسهيل الركوب والنزول
      var y = h * T - 2;
      movers.push({ x: (start - 1) * T, y: y, w: 3 * T, h: 12, x0: (start - 1) * T, x1: (start + w - 2) * T, vx: 0.7 + 0.4 * d });
      for (var j = 0; j < w; j++) coin(start + j, h - 3);
    }

    var guard = 0;
    while (c < length && guard++ < 500) {
      var roll = R();
      if (roll < 0.30) flat(ri(3, 7));
      else if (roll < 0.50) { flat(2, { noCoins: true, noEnemy: true }); pit(); flat(2, { noCoins: true, noEnemy: true }); }
      else if (roll < 0.62) { step(); flat(ri(3, 5)); }
      else if (roll < 0.78) platforms();
      else if (roll < 0.88) { if (d > 0.15) spikes(); else flat(4); }
      else { if (d > 0.3) { flat(2, { noCoins: true, noEnemy: true }); mover(); flat(2, { noCoins: true, noEnemy: true }); } else platforms(); }
    }
    // نهاية المرحلة
    var endStart = c;
    for (var e = 0; e < 16 && c < cols; e++, c++) ground(c, h);
    var goal = { x: (endStart + 7) * T, y: h * T };
    return {
      T: T, rows: ROWS, cols: cols, tiles: tiles, coins: coins, enemies: enemies, movers: movers,
      checkpoints: checkpoints, goal: goal, start: { x: 2 * T, y: 9 * T - 42 },
      theme: stageIndex % 5, difficulty: d
    };
  }
  window.LevelGen = { generate: generate, T: T, ROWS: ROWS };
})();
