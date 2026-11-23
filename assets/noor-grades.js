/* «رصد الدرجات» في صفحة خدمات نور (altahdir.app/noor/) — للمعلم وللمعلم الأول.
 * سطر واحد قبل </body>:
 *   <script src="/assets/noor-grades.js?v=1" defer></script>
 * - يضيف قسمًا بعد أقسام الخدمات الموجودة، ظاهرًا في «معلم» و«معلم أول».
 * - الزر يفتح «رصد و متابعة الأداء» في نور، وتفتح الإضافة (2.18.0 فأحدث) لوحة «رصد الدرجات» هناك.
 * - يتبع قيد الاشتراك نفسه: يُفعَّل فقط عندما يكون زر الحضور مفعّلًا.
 */
(function () {
  'use strict';
  var NOOR = 'https://lms.moe.gov.om/teacher#noorGrades';
  var MIN = '2.18.0';

  var css = '' +
    '#noor-service-grades .service-icon{background:linear-gradient(135deg,#f59e0b,#b45309);box-shadow:0 12px 26px rgba(180,83,9,.28)}' +
    '#noor-service-grades .go{background:#b45309}#noor-service-grades .go:hover{background:#92400e}' +
    '#noor-service-grades .go:disabled{background:#94a3b8}' +
    '#noor-service-grades .ways{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}' +
    '#noor-service-grades .way{border:1px solid #f3dfc1;background:#fffbf3;border-radius:14px;padding:12px 14px;display:grid;gap:4px}' +
    '#noor-service-grades .way b{font-size:16px}#noor-service-grades .way span{font-size:14px;color:#6b5a45;line-height:1.6}' +
    '#noor-service-grades .note{margin:0;padding:10px 14px;border-radius:12px;background:#fffbeb;color:#92400e;font-weight:700;font-size:14px}' +
    '#noor-service-grades .note[hidden]{display:none}' +
    '@media (max-width:520px){#noor-service-grades .ways{grid-template-columns:1fr}}';

  function html() {
    return '' +
      '<div class="service-head">' +
        '<div class="service-icon" aria-hidden="true">📊</div>' +
        '<div>' +
          '<h2 id="grades-title">رصد الدرجات</h2>' +
          '<p class="service-sub">أدخل درجات طلابك ثم تُنقل إلى «رصد و متابعة الأداء» في منصة نور، لكل فصولك دفعة واحدة.</p>' +
        '</div>' +
      '</div>' +
      '<div class="ways">' +
        '<div class="way"><b>📄 من ملف Excel</b><span>نزّل نموذجًا جاهزًا فيه ورقة لكل فصل بأسماء الطلبة وأرقامهم والتقييمات بدرجتها القصوى، املأه وارفعه.</span></div>' +
        '<div class="way"><b>⚡ إدخال سريع</b><span>اختر الفصل والتقييم، واكتب الدرجات أو الصق عمودًا من Excel مرة واحدة.</span></div>' +
      '</div>' +
      '<ol class="steps">' +
        '<li>سجّل الدخول في منصة نور، ثم اضغط الزر أدناه فتُفتح «رصد و متابعة الأداء».</li>' +
        '<li>في نور اضغط «📊 رصد الدرجات السريع» واختر Excel أو الإدخال السريع.</li>' +
        '<li>تُعرض كل درجة قبل الحفظ: الجديدة، والتي ستتغيّر، والأخطاء (مثل درجة أعلى من القصوى). ثم «تأكيد الحفظ».</li>' +
      '</ol>' +
      '<button type="button" class="go" id="noor-grades-go" data-noor-service="grades" disabled>فتح رصد الدرجات في نور</button>' +
      '<p class="note" id="noor-grades-note" hidden></p>' +
      '<p class="privacy">الدرجات وأسماء الطلبة تبقى في منصة نور على جهازك ولا تُرسل إلى هذا الموقع.</p>';
  }

  function newer(a, b) {
    if (!/^\d+(?:\.\d+){0,3}$/.test(a)) return false;
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
    return true;
  }

  function start() {
    var att = document.getElementById('noor-service-attendance');
    if (!att || document.getElementById('noor-service-grades')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var sec = document.createElement('section');
    sec.className = 'service'; sec.id = 'noor-service-grades';
    sec.setAttribute('aria-labelledby', 'grades-title');
    sec.innerHTML = html();
    // after the last service card, so it shows for both «معلم» and «معلم أول»
    var cards = att.parentNode.querySelectorAll('section.service');
    var last = cards[cards.length - 1] || att;
    last.parentNode.insertBefore(sec, last.nextSibling);
    // a card added later by another script (e.g. «معلم أول») goes above this one
    new MutationObserver(function () {
      if (sec.nextElementSibling && sec.nextElementSibling.matches && sec.nextElementSibling.matches('section.service')) sec.parentNode.appendChild(sec);
    }).observe(att.parentNode, { childList: true });

    var attGo = document.getElementById('noor-att-go');
    var go = document.getElementById('noor-grades-go'), note = document.getElementById('noor-grades-note');
    function ver() { return document.documentElement.getAttribute('data-noor-ext') || ''; }
    function usable() { return !!attGo && !attGo.disabled && !!ver() && newer(ver(), MIN); }
    function paint() {
      var ok = usable();
      go.disabled = !ok; go.title = ok ? '' : (attGo && attGo.title) || '';
      var v = ver();
      if (v && !newer(v, MIN)) { note.textContent = 'هذه الخدمة تحتاج إضافة التحضير الذكي ' + MIN + ' أو أحدث (المثبتة عندك ' + v + '). حدّث الإضافة ثم أعد تحميل الصفحة.'; note.hidden = false; }
      else note.hidden = true;
    }
    if (attGo) new MutationObserver(paint).observe(attGo, { attributes: true, attributeFilter: ['disabled', 'title'] });
    new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-noor-ext'] });
    paint();
    go.addEventListener('click', function (e) {
      e.preventDefault();
      if (!usable()) { paint(); return; }
      window.open(NOOR, '_blank', 'noopener');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();