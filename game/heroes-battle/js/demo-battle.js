/* وضع العرض التلقائي (للتسجيل فقط): ?demo=1 */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = parseFloat(q.get('acc') || '0.75'), seen = '';
  setInterval(function () {
    var G = window.__bt; if (!G) return;
    var key = G.state + ':' + G.turn + ':' + G.round + ':' + (G.cur ? G.cur.item.id : '');
    if (key === seen) return; seen = key;
    if (G.state === 'idle') setTimeout(function () { if (G.state === 'idle') document.getElementById('askBtn').click(); }, 900);
    else if (G.state === 'ask') setTimeout(function () {
      if (G.state !== 'ask') return;
      var right = window.__decodeAnswer(G.cur.item._raw);
      var btns = Array.prototype.slice.call(document.querySelectorAll('#qOpts .opt'));
      var good = btns.find(function (b) { return +b.dataset.choice === right; }), bad = btns.filter(function (b) { return b !== good; });
      (Math.random() < acc ? good : bad[Math.floor(Math.random() * bad.length)]).click();
      setTimeout(function () { document.getElementById('qConfirm').click(); }, 700);
    }, 1500);
  }, 150);
})();
