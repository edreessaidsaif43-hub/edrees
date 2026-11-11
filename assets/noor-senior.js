/* «خدمات المعلم الأول» في صفحة خدمات نور (altahdir.app/noor/).
 * تُضاف بسطر واحد قبل </body>:
 *   <script src="/assets/noor-senior.js?v=1" defer></script>
 * - تضيف قسماً تحت «تسجيل الحضور والغياب» يظهر عند اختيار «معلم أول».
 * - الزران يفتحان حساب المعلم الأول في نور، وتفتح الإضافة (2.16.0 فأحدث) لوحتها هناك.
 * - يتبعان قيد الاشتراك نفسه: يُفعَّلان فقط عندما يكون زر الحضور مفعّلاً.
 */
(function () {
  'use strict';
  var NOOR = 'https://lms.moe.gov.om/tsupv/lectures_supervisors/teachers_list';
  var MIN = '2.16.0';

  var css = '' +
    '#noor-service-senior .service-icon{background:linear-gradient(135deg,#3b6ea5,#1e3a5f);box-shadow:0 12px 26px rgba(30,58,95,.28)}' +
    '#noor-service-senior .go{background:#1e3a5f}#noor-service-senior .go:hover{background:#274b78}' +
    '#noor-service-senior .go:disabled{background:#94a3b8}' +
    '#noor-service-senior .go.alt{background:#fff;color:#1e3a5f;border:2px solid #1e3a5f}' +
    '#noor-service-senior .go.alt:hover{background:#eef3f9}' +
    '#noor-service-senior .go.alt:disabled{background:#f1f5f9;color:#94a3b8;border-color:#cbd5e1}' +
    '#noor-service-senior .pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}' +
    '#noor-service-senior .tags{display:flex;flex-wrap:wrap;gap:6px}' +
    '#noor-service-senior .tags span{padding:3px 10px;border-radius:999px;font-size:13px;font-weight:700;background:#e8eef6;color:#1e3a5f}' +
    '#noor-service-senior .note{margin:0;padding:10px 14px;border-radius:12px;background:#fffbeb;color:#92400e;font-weight:700;font-size:14px}' +
    '#noor-service-senior .note[hidden],#noor-service-senior[hidden]{display:none}' +
    '@media (max-width:520px){#noor-service-senior .pair{grid-template-columns:1fr}}';

  function html() {
    return '' +
      '<div class="service-head">' +
        '<div class="service-icon" aria-hidden="true">📊</div>' +
        '<div>' +
          '<h2 id="senior-title">متابعة المعلمين والزيارات الإشرافية</h2>' +
          '<p class="service-sub">للمعلم الأول: نشاط معلميه في نور خلال فترة، والتعليق على تحاضيرهم في «التغذية الراجعة».</p>' +
        '</div>' +
      '</div>' +
      '<ol class="steps">' +
        '<li>سجّل الدخول في نور بحساب المعلم الأول، ثم اختر إحدى الخدمتين.</li>' +
        '<li><span><b>متابعة المعلمين:</b> اختر الفترة (من / إلى)، فيظهر جدول واحد لكل المعلمين، ومنه تفتح تحاضير أي معلم وتعلّق عليها.</span></li>' +
        '<li><span><b>زيارة إشرافية:</b> اختر المعلم والفصل والتاريخ، فيظهر تحضير تلك الحصة للاطلاع عليه وكتابة ملاحظاتك.</span></li>' +
      '</ol>' +
      '<div class="tags" aria-label="ما يظهر في المتابعة">' +
        '<span>التحاضير</span><span>الاختبارات</span><span>المهام</span><span>المرفقات</span>' +
        '<span>المكتبة الرقمية</span><span>رصد الحضور</span><span>الفصول الذكية</span>' +
      '</div>' +
      '<div class="pair">' +
        '<button type="button" class="go" id="noor-senior-go" data-noor-senior="stats" disabled>متابعة المعلمين</button>' +
        '<button type="button" class="go alt" id="noor-senior-visit" data-noor-senior="visit" disabled>زيارة إشرافية</button>' +
      '</div>' +
      '<p class="note" id="noor-senior-note" hidden></p>' +
      '<p class="privacy">التعليق لا يُرسل إلا بعد مراجعتك وتأكيدك، ويُحفظ في «التغذية الراجعة» بمنصة نور. بيانات المعلمين تبقى في نور ولا تُرسل إلى هذا الموقع.</p>';
  }

  function newer(a, b) {   // a >= b ?
    if (!/^\d+(?:\.\d+){0,3}$/.test(a)) return false;
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0;
    }
    return true;
  }

  function start() {
    var att = document.getElementById('noor-service-attendance');
    if (!att || document.getElementById('noor-service-senior')) return;

    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var sec = document.createElement('section');
    sec.className = 'service'; sec.id = 'noor-service-senior';
    sec.setAttribute('data-noor-role', 'senior-teacher');
    sec.setAttribute('aria-labelledby', 'senior-title');
    sec.hidden = att.getAttribute('data-noor-role') !== 'senior-teacher';
    sec.innerHTML = html();
    att.parentNode.insertBefore(sec, att.nextSibling);

    var attGo = document.getElementById('noor-att-go');
    var btns = sec.querySelectorAll('[data-noor-senior]');
    var note = document.getElementById('noor-senior-note');

    // same rule as the attendance button: subscribed + extension present
    function ver() { return document.documentElement.getAttribute('data-noor-ext') || ''; }
    function usable() { return !!attGo && !attGo.disabled && !!ver() && newer(ver(), MIN); }
    function paint() {
      var ok = usable();
      for (var i = 0; i < btns.length; i++) { btns[i].disabled = !ok; btns[i].title = ok ? '' : (attGo && attGo.title) || ''; }
      var v = ver();
      if (v && !newer(v, MIN)) { note.textContent = 'هذه الخدمة تحتاج إضافة التحضير الذكي ' + MIN + ' أو أحدث (المثبتة عندك ' + v + '). حدّث الإضافة ثم أعد تحميل الصفحة.'; note.hidden = false; }
      else note.hidden = true;
    }
    if (attGo) new MutationObserver(paint).observe(attGo, { attributes: true, attributeFilter: ['disabled', 'title'] });
    new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-noor-ext'] });
    paint();

    sec.addEventListener('click', function (e) {
      var b = e.target instanceof Element && e.target.closest('[data-noor-senior]');
      if (!b) return;
      e.preventDefault();
      if (!usable()) { paint(); return; }
      window.open(NOOR + (b.getAttribute('data-noor-senior') === 'visit' ? '#noorSupv-visit' : '#noorSupv'), '_blank', 'noopener');
    });

    new MutationObserver(function () {
      sec.hidden = att.getAttribute('data-noor-role') !== 'senior-teacher';
    }).observe(att, { attributes: true, attributeFilter: ['data-noor-role'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
