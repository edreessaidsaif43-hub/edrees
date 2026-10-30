/* وضع العرض التلقائي (للتسجيل والاختبار فقط): ?demo=1&acc=0.8 */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = parseFloat(q.get('acc') || '0.8'), busy = false;
  setInterval(function () {
    var m = document.getElementById('qModal');
    var ab = document.getElementById('spinBtn');
    if (!busy && ab && !ab.disabled && ab.offsetParent && !(m && m.classList.contains('show'))) { busy = true; setTimeout(function () { ab.click(); busy = false; }, 900); return; }
    if (busy || !m || !m.classList.contains('show')) return;
    var conf = document.getElementById('qConfirm');
    if (conf.style.visibility === 'hidden') return;
    busy = true;
    setTimeout(function () {
      var btns = Array.prototype.slice.call(document.querySelectorAll('#qOpts .opt'));
      var raw = window.__curRaw && window.__curRaw();
      var right = raw ? window.__decodeAnswer(raw) : 0;
      var good = btns.find(function (b) { return +b.dataset.choice === right; }), bad = btns.filter(function (b) { return b !== good; });
      (Math.random() < acc ? good : bad[Math.floor(Math.random() * bad.length)]).click();
      setTimeout(function () { conf.click(); busy = false; }, 600);
    }, 1100);
  }, 200);
})();
