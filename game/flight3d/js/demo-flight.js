/* عرض تلقائي: ?demo=1&acc=0.75 — يوجّه الطائرة نحو حلقة الإجابة ويتجنّب العوائق */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = parseFloat(q.get('acc') || '0.75'), plan = null;
  setInterval(function () {
    var G = window.__fl, ENG = window.__flyEngine; if (!G || G.over || !ENG) return;
    var E = ENG.debug; if (E.state !== 'fly' && E.state !== 'cruise') return;
    var tx = 0, ty = 50;
    if (G.cur && G.gate) {
      if (!plan || plan.g !== G.gate) { var r = window.__decodeAnswer(G.cur.item._raw), pos = G.cur.order.indexOf(r); if (Math.random() > acc) pos = (pos + 1) % G.gate.n; plan = { g: G.gate, i: pos }; }
      var ring = G.gate.rings[plan.i]; tx = ring.position.x; ty = 50 + ring.position.y;
    }
    E.obs.forEach(function (o) { var dz = E.pos.z - o.obj.position.z; if (dz > 0 && dz < 90 && Math.abs(o.obj.position.x - E.pos.x) < 12) ty += 16; });
    var dx = tx - E.off, dy = ty - E.alt;
    ENG.setInput(Math.max(-1, Math.min(1, dx / 6)), Math.max(-1, Math.min(1, dy / 6)));
  }, 60);
})();
