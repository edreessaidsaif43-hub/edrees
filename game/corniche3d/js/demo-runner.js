/* عرض تلقائي: ?demo=1&acc=0.75 — يوجّه العدّاء إلى بوابة الإجابة ويقفز فوق العوائق */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = parseFloat(q.get('acc') || '0.75'), plan = null;
  setInterval(function () {
    var G = window.__cr, ENG = window.__runEngine; if (!G || G.over || !ENG || G.state !== 'run') return;
    var E = ENG.debug;
    if (G.cur && G.gate) {
      if (!plan || plan.g !== G.gate) { var r = window.__decodeAnswer(G.cur.item._raw), pos = G.cur.order.indexOf(r), n = G.gate.n; if (Math.random() > acc) pos = (pos + 1) % n; plan = { g: G.gate, lane: n === 2 ? pos * 2 + (Math.random() < .5 ? 0 : 1) : pos }; }
      if (ENG.gateDist() < 30) ENG.lane(plan.lane);
    }
    E.obs.forEach(function (o) { var dd = o.d - E.dist; if (!o.hit && dd > 1.2 && dd < 3.4 && Math.abs(o.x - E.x) < 1) ENG.jump(); });
  }, 60);
})();
