/* عرض تلقائي: ?demo=1&acc=0.8 — يفحص الأشياء ويجيب ويفتح الأقفال */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get('demo')) return;
  var acc = parseFloat(q.get('acc') || '0.85'), busy = false;
  function click(el) { if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  setInterval(function () {
    var G = window.__es; if (!G || G.over || busy) return;
    var qm = document.getElementById('qModal'), cm = document.getElementById('clueModal'), lm = document.getElementById('lockModal');
    busy = true;
    if (qm.classList.contains('show')) {
      if (document.getElementById('qConfirm').style.visibility === 'hidden' || !window.__curRaw()) { busy = false; return; }
      setTimeout(function () { var r = window.__decodeAnswer(window.__curRaw()), bs = Array.prototype.slice.call(document.querySelectorAll('#qOpts .opt')); var good = bs.find(function (b) { return +b.dataset.choice === r; }), bad = bs.filter(function (b) { return b !== good; }); (Math.random() < acc ? good : bad[0]).click(); setTimeout(function () { document.getElementById('qConfirm').click(); busy = false; }, 600); }, 1000); return;
    }
    if (cm.classList.contains('show')) { setTimeout(function () { document.getElementById('clueOk').click(); busy = false; }, 1400); return; }
    if (lm.classList.contains('show')) {
      setTimeout(function () {
        var r = G.room, opts = r === 0 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : ['☀', '☾', '★', '◆', '✿', '▲'];
        if (r < 2) [0, 1, 2].forEach(function (i) { var cur = document.getElementById('dv' + i).textContent, want = String(G.codes[r][i]), n = 0; while (document.getElementById('dv' + i).textContent !== want && n++ < 12) document.querySelectorAll('.dial')[i].querySelector('.up').click(); });
        setTimeout(function () { document.getElementById('lockTry').click(); busy = false; }, 900);
      }, 800); return;
    }
    if (G.busy) { busy = false; return; }
    setTimeout(function () {
      var f = G.found[G.room];
      if (f.length === 3) click(document.querySelector('#room .lockhs'));
      else { var k = [0, 1, 2].find(function (i) { return f.indexOf(i) < 0; }); click(document.querySelector('#room .hs[data-k="' + k + '"]')); }
      busy = false;
    }, 1200);
  }, 250);
})();
