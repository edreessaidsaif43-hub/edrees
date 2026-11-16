/* عرض تلقائي: ?demo=1&acc=0.75 — يوجّه المركبة نحو منحدر الإجابة ويتجنّب العوائق */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = parseFloat(q.get('acc') || '0.75'), plan = null;
  setInterval(function () {
    var G = window.__sr, ENG = window.__stormEngine; if (!G || G.over || !ENG) return;
    var E = ENG.debug; if (E.state !== 'drive' && E.state !== 'cruise') return;
    var tx = E.geo.corridorX(E.pos.z);
    if (G.cur && G.gate) {
      if (!plan || plan.g !== G.gate) { var r = window.__decodeAnswer(G.cur.item._raw), pos = G.cur.order.indexOf(r); if (Math.random() > acc) pos = (pos + 1) % G.gate.n; plan = { g: G.gate, i: pos }; }
      tx = G.gate.rings[plan.i].matrixWorld.elements[12];
    } else {
      var best = null; E.stars.concat(E.dates).forEach(function (s) { var dz = E.pos.z - s.obj.position.z; if (!s.got && dz > 4 && dz < 60 && (!best || dz < best.dz)) best = { dz: dz, x: s.obj.position.x }; });
      if (best) tx = best.x;
    }
    E.obs.forEach(function (o) { if (o.kind === 'kick') return; var dz = E.pos.z - o.obj.position.z; if (dz > 0 && dz < 45 && Math.abs(o.obj.position.x - tx) < 5) tx += o.obj.position.x > tx ? -7 : 7; });
    ENG.setInput(Math.max(-1, Math.min(1, (tx - E.pos.x) / 3)));
  }, 60);
})();
