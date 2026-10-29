/* وضع العرض التجريبي (للتسجيل والاختبار فقط): يُفعّل بإضافة ?demo=1 إلى الرابط */
(function () {
  var params = new URLSearchParams(location.search);
  if (!params.get('demo')) return;
  var accuracy = parseFloat(params.get('acc') || '0.8');
  var hold = 0, waitMover = false;

  window.__demoPilot = function (g) {
    var p = g.player, L = g.level, T = L.T, inp = g.input;
    inp.jump = hold > 0; if (hold > 0) hold--;
    inp.right = true; inp.left = false;
    if (!p.onGround || inp.jump) return;
    var feet = p.y + p.h, front = p.x + p.w;
    var jump = function () { hold = 16; inp.jump = true; };
    if (p.riding) {
      var m = p.riding;
      inp.right = false;
      if (g.solidAt(m.x + m.w - 12, feet + 8) && m.vx > 0) inp.right = true;
      return;
    }
    // حفرة أمامية
    if (!g.solidAt(front + 8, feet + 6) && !g.solidAt(front + 8, feet + 36) && !g.solidAt(front + 8, feet + 66)) {
      var w = 0; while (w < 10 && !g.solidAt(front + 8 + w * T, feet + 6) && !g.solidAt(front + 8 + w * T, feet - 24)) w++;
      if (w >= 4) {
        // انتظار المنصة المتحركة
        var mv = L.movers.find(function (m) { return m.x0 <= front + T && m.x1 + m.w >= front + 2 * T; });
        if (mv) {
          inp.right = false;
          // اصعد عندما تكون المنصة تحت قدميك وتتجه للأمام
          if (mv.x <= p.x && mv.x + mv.w >= front + 10 && mv.vx > 0) inp.right = true;
          return;
        }
      }
      jump(); return;
    }
    // جدار أو درجة
    if (g.solidAt(front + 14, feet - 10) || g.solidAt(front + 14, feet - 40)) { jump(); return; }
    // أشواك
    for (var dx = 6; dx <= 40; dx += 8) if (g.tileAt(front + dx, feet - 10) === 3) { jump(); return; }
    // أعداء
    for (var i = 0; i < L.enemies.length; i++) {
      var e = L.enemies[i]; if (!e.alive) continue;
      var dist = e.x - front;
      if (dist > -10 && dist < (e.type === 'walker' ? 64 : 50) && Math.abs((e.y + e.h) - feet) < 60) { jump(); return; }
    }
  };

  // سباق الجمال: القفز قبل العوائق
  var chold = 0;
  window.__camelPilot = function (g) {
    var p = g.player;
    g.input.jump = chold > 0; if (chold > 0) chold--;
    if (!p.onGround || g.input.jump) return;
    var v = g.playerSpeed() * 20 / 60;
    for (var i = 0; i < g.obstacles.length; i++) {
      var o = g.obstacles[i]; if (o.hit) continue;
      var dx = o.x - p.dist;
      if (dx > 0 && dx < 40 + v * 10) { chold = 18; g.input.jump = true; return; }
    }
  };

  // الإجابة التلقائية على الأسئلة
  setInterval(function () {
    var modal = document.getElementById('qModal');
    if (!modal.classList.contains('show') || modal.dataset.demo === '1') return;
    var conf = document.getElementById('qConfirm');
    if (conf.style.visibility === 'hidden') return;
    modal.dataset.demo = '1';
    setTimeout(function () {
      var cur = window.__game.qm.current; if (!cur) { modal.dataset.demo = ''; return; }
      var right = window.__decodeAnswer(cur.item._raw);
      var opts = Array.prototype.slice.call(document.querySelectorAll('#qOpts .opt'));
      var good = opts.find(function (b) { return +b.dataset.choice === right; });
      var bad = opts.filter(function (b) { return b !== good; });
      var pick = Math.random() < accuracy ? good : bad[Math.floor(Math.random() * bad.length)];
      pick.click();
      setTimeout(function () { conf.click(); setTimeout(function () { modal.dataset.demo = ''; }, 2000); }, 700);
    }, 1300);
  }, 200);
})();
