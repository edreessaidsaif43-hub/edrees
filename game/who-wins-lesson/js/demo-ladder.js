/* وضع العرض التلقائي (للتسجيل فقط): ?demo=1 */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = parseFloat(q.get('acc') || '0.8'), seen = '';
  setInterval(function () {
    var G = window.__lad; if (!G || G.state !== 'ask') return;
    var key = G.step + ':' + G.cur.item.id + ':' + G.lives; if (key === seen) return; seen = key;
    setTimeout(function () {
      if (G.state !== 'ask') return;
      if (G.step === 3 && !G.used.f && G.cur.item.type === 'mc') { document.getElementById('ll5050').click(); }
      setTimeout(function () {
        if (G.state !== 'ask') return;
        var right = window.__decodeAnswer(G.cur.item._raw);
        var btns = Array.prototype.slice.call(document.querySelectorAll('#opts .lopt:not(.gone)'));
        var good = btns.find(function (b) { return +b.dataset.choice === right; });
        var bad = btns.filter(function (b) { return b !== good; });
        (Math.random() < acc || !bad.length ? good : bad[Math.floor(Math.random() * bad.length)]).click();
        setTimeout(function () { document.getElementById('confirmBtn').click(); }, 900);
      }, 900);
    }, 1500);
  }, 150);
})();
