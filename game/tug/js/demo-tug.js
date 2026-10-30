/* وضع العرض التلقائي: ?demo=1&acc=0.75 — الفريقان يجيبان بسرعات مختلفة */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = parseFloat(q.get('acc') || '0.75'), busy = [false, false];
  setInterval(function () {
    var G = window.__tg; if (!G || G.over || !G.started) return;
    [0, 1].forEach(function (i) {
      var t = G.teams[i]; if (busy[i] || t.lock || !t.cur) return;
      busy[i] = true;
      setTimeout(function () {
        busy[i] = false; if (t.lock || !t.cur || G.over) return;
        var right = window.__decodeAnswer(t.cur.item._raw), btns = Array.prototype.slice.call(document.querySelectorAll('#po' + i + ' .opt'));
        var good = btns.find(function (b) { return +b.dataset.choice === right; }), bad = btns.filter(function (b) { return b !== good; });
        (Math.random() < acc ? good : bad[Math.floor(Math.random() * bad.length)]).click();
      }, 1200 + Math.random() * 1800);
    });
  }, 150);
})();
