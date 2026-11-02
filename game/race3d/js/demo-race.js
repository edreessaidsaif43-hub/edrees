/* عرض تلقائي: ?demo=1&acc=0.75 — يجيب عن الأسئلة تلقائيًا */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = parseFloat(q.get('acc') || '0.75'), busy = false;
  setInterval(function () {
    var G = window.__rc; if (!G || G.over || busy) return;
    var qm = document.getElementById('qModal');
    if (!qm.classList.contains('show') || document.getElementById('qConfirm').style.visibility === 'hidden' || !window.__curRaw()) return;
    busy = true;
    setTimeout(function () { var r = window.__decodeAnswer(window.__curRaw()), bs = Array.prototype.slice.call(document.querySelectorAll('#qOpts .opt')); var good = bs.find(function (b) { return +b.dataset.choice === r; }), bad = bs.filter(function (b) { return b !== good; }); (Math.random() < acc ? good : bad[0]).click(); setTimeout(function () { document.getElementById('qConfirm').click(); busy = false; }, 600); }, 1400);
  }, 250);
})();
