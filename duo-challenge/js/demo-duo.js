/* وضع العرض التلقائي (للتسجيل فقط): ?demo=1 */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = [parseFloat(q.get('a1') || '0.75'), parseFloat(q.get('a2') || '0.7')];
  var seen = '';
  setInterval(function () {
    var G = window.__duo; if (!G) return;
    var key = G.round + ':' + G.state + ':' + G.turn;
    if (key === seen) return; seen = key;
    if (G.state === 'buzz') {
      [0, 1].forEach(function (p) {
        setTimeout(function () { if (G.state === 'buzz') document.getElementById('bz' + p).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }, 700 + Math.random() * 3000);
      });
    } else if (G.state === 'answer') {
      var p = G.turn;
      setTimeout(function () {
        if (G.state !== 'answer' || G.turn !== p) return;
        var right = window.__decodeAnswer(G.cur.item._raw);
        var btns = Array.prototype.slice.call(document.querySelectorAll('#opts .dopt'));
        var good = btns.find(function (b) { return +b.dataset.choice === right; });
        var bad = btns.filter(function (b) { return b !== good; });
        (Math.random() < acc[p] ? good : bad[Math.floor(Math.random() * bad.length)]).click();
      }, 1400 + Math.random() * 1500);
    }
  }, 120);
})();
