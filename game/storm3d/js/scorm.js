/* نشر SCORM للطلاب — مشترك بين كل الألعاب.
   1) يضيف زر «تنزيل حزمة SCORM» بجانب «نسخ رابط للطلاب».
   2) يبني حزمة SCORM 1.2 (ملف zip) داخل المتصفح دون أي مكتبة خارجية:
      imsmanifest.xml + index.html (مشغّل يفتح رابط اللعبة بالدروس المختارة ويتصل بنظام إدارة التعلّم LMS).
   3) داخل نظام إدارة التعلّم: ترسل اللعبة نتيجة الطالب (نسبة الإجابات الصحيحة) إلى المشغّل، فيسجّلها في LMS. */
(function () {
  'use strict';
  if (window.EduScorm) return; // تحميل مرة واحدة فقط

  /* ---------- تتبّع الإجابات (لكل جلسات الأسئلة في الصفحة) ---------- */
  var T = { correct: 0, wrong: 0, done: false };
  function inFrame() { try { return window.parent !== window; } catch (e) { return true; } }
  function post(final) {
    if (!inFrame()) return;
    var n = T.correct + T.wrong;
    var msg = { type: 'edu-game-result', correct: T.correct, wrong: T.wrong, score: n ? Math.round(100 * T.correct / n) : 0, final: !!final, game: (window.GAME_CONFIG || {}).title || document.title };
    try { window.parent.postMessage(msg, '*'); } catch (e) {}
  }
  function wrapQM() {
    var QM = window.QuestionManager;
    if (!QM || QM.__scorm) return;
    var orig = QM.prototype.answer;
    QM.prototype.answer = function () {
      var c0 = this.stats.correct, w0 = this.stats.wrong;
      var r = orig.apply(this, arguments);
      T.correct += Math.max(0, this.stats.correct - c0); T.wrong += Math.max(0, this.stats.wrong - w0);
      post(false);
      return r;
    };
    QM.__scorm = true;
  }
  function watchResults() {
    var m = document.getElementById('rModal');
    if (!m || !window.MutationObserver) return;
    new MutationObserver(function () { if (m.classList.contains('show')) post(true); }).observe(m, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- ZIP (تخزين دون ضغط) ---------- */
  var CRC = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) { // files: [{name, text}]
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    var d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (a, p) { return a + p.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }

  /* ---------- محتوى الحزمة ---------- */
  function x(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function manifest(info) {
    var id = 'EDU-' + Date.now();
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<manifest identifier="' + id + '" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">\n' +
      '  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>\n' +
      '  <organizations default="ORG-1">\n    <organization identifier="ORG-1">\n      <title>' + x(info.packTitle) + '</title>\n' +
      '      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">\n        <title>' + x(info.packTitle) + '</title>\n        <adlcp:masteryscore>' + info.mastery + '</adlcp:masteryscore>\n      </item>\n    </organization>\n  </organizations>\n' +
      '  <resources>\n    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">\n      <file href="index.html"/>\n    </resource>\n  </resources>\n</manifest>\n';
  }
  function launcher(info) {
    var cfgJson = JSON.stringify({ url: info.url, title: info.packTitle, mastery: info.mastery }).replace(/</g, '\\u003c');
    return '<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + x(info.packTitle) + '</title>\n<style>\n' +
      'html,body{margin:0;height:100%;font-family:Tahoma,"Segoe UI",Arial,sans-serif;background:#0d3b5e;color:#fff}\n' +
      '#bar{height:44px;display:flex;align-items:center;gap:12px;padding:0 14px;background:#0a2c47;font-size:15px}\n#bar b{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}\n#st{background:#16a3a0;border-radius:999px;padding:3px 12px;font-weight:700}\n' +
      'iframe{display:block;width:100%;height:calc(100% - 44px);border:0;background:#fff}\n#off{display:none;padding:30px;text-align:center;line-height:1.8}\n</style></head>\n<body>\n' +
      '<div id="bar"><b id="ttl"></b><span id="st">جارٍ التحميل…</span></div>\n<iframe id="game" allow="autoplay; fullscreen" allowfullscreen></iframe>\n' +
      '<div id="off">تحتاج اللعبة إلى اتصال بالإنترنت. إذا لم تظهر، افتح الرابط مباشرة: <a id="lnk" style="color:#ffd23f" target="_blank"></a></div>\n' +
      '<script>\nvar CFG=' + cfgJson + ';\n' +
      // SCORM 1.2 API discovery
      'function findAPI(w){var n=0;while(w&&!w.API&&w.parent&&w.parent!==w&&n<10){w=w.parent;n++;}return w&&w.API?w.API:null;}\n' +
      'var API=findAPI(window)||(window.opener?findAPI(window.opener):null),started=Date.now(),best=-1,prevBest=-1,finished=false;\n' +
      'function sv(k,v){if(API)try{API.LMSSetValue(k,String(v));}catch(e){}}\nfunction gv(k){if(API)try{return API.LMSGetValue(k);}catch(e){}return "";}\n' +
      'function commit(){if(API)try{API.LMSCommit("");}catch(e){}}\n' +
      'function tm(ms){var s=Math.round(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60);s=s%60;function p(n,l){n=String(n);while(n.length<l)n="0"+n;return n;}return p(h,4)+":"+p(m,2)+":"+p(s,2);}\n' +
      'var st=document.getElementById("st"),sname="";\n' +
      'if(API){try{API.LMSInitialize("");}catch(e){}var ls=gv("cmi.core.lesson_status");if(!ls||ls==="not attempted")sv("cmi.core.lesson_status","incomplete");sname=gv("cmi.core.student_name")||"";var prev=parseInt(gv("cmi.core.score.raw"),10);if(!isNaN(prev))prevBest=prev;sv("cmi.core.score.min",0);sv("cmi.core.score.max",100);commit();st.textContent="متصل بنظام التعلّم";}else{st.textContent="معاينة (خارج نظام التعلّم)";}\n' +
      'document.getElementById("ttl").textContent=CFG.title+(sname?" — "+sname:"");\n' +
      'var u=CFG.url+(CFG.url.indexOf("#")>=0?"&":"#")+"scorm=1";\n' +
      'var fr=document.getElementById("game");fr.src=u;document.getElementById("lnk").href=u;document.getElementById("lnk").textContent=CFG.url.split("#")[0];\n' +
      'var loaded=false;fr.onload=function(){loaded=true;};setTimeout(function(){if(!loaded||!navigator.onLine)document.getElementById("off").style.display="block";},12000);\n' +
      'window.addEventListener("message",function(e){var d=e.data;if(!d||d.type!=="edu-game-result")return;\n' +
      ' var sc=Math.max(0,Math.min(100,d.score|0));best=Math.max(prevBest,sc);sv("cmi.core.score.raw",best);\n' +
      ' st.textContent="صحيحة: "+d.correct+" • خاطئة: "+d.wrong+" • النتيجة: "+sc+"%";\n' +
      ' if(d.final){sv("cmi.core.lesson_status",best>=CFG.mastery?"passed":"failed");finished=true;}\n' +
      ' sv("cmi.core.session_time",tm(Date.now()-started));commit();});\n' +
      'function done(){if(!API||done.x)return;done.x=1;sv("cmi.core.session_time",tm(Date.now()-started));if(!finished&&best>=0)sv("cmi.core.exit","suspend");commit();try{API.LMSFinish("");}catch(e){}}\n' +
      'window.addEventListener("pagehide",done);window.addEventListener("beforeunload",done);\n' +
      '<\/script>\n</body></html>\n';
  }
  function readme(info) {
    return 'حزمة SCORM 1.2 — ' + info.packTitle + '\r\n\r\n' +
      'الصف: ' + info.grade + '\r\nالمادة: ' + info.subject + '\r\nالوحدة: ' + info.unit + '\r\nالدروس: ' + info.lessons.join('، ') + '\r\n\r\n' +
      'الرابط المباشر للطلاب:\r\n' + info.url + '\r\n\r\n' +
      'طريقة الرفع (مثال Moodle): أضف نشاطًا ← حزمة SCORM ← ارفع ملف zip هذا كما هو (دون فك الضغط).\r\n' +
      'تسجّل الحزمة: نسبة الإجابات الصحيحة (0–100)، والحالة (ناجح إذا بلغت ' + info.mastery + '% أو أكثر)، ومدة الجلسة.\r\n' +
      'ملاحظة: اللعبة تُفتح من الرابط أعلاه، لذلك يحتاج الطالب إلى اتصال بالإنترنت.\r\n';
  }
  function safe(s) { return String(s).replace(/[\\/:*?"<>|#]+/g, '').replace(/\s+/g, '-').slice(0, 60); }
  /* ---------- معرّف المعلم في روابط الطلاب ---------- */
  function teacherId() { try { return typeof getSubscriptionUserId === 'function' ? getSubscriptionUserId() : ''; } catch (e) { return ''; } }
  function addTid(url) {
    var id = teacherId();
    if (!id || !/#.*\bg=/.test(url) || /[#&]tid=/.test(url)) return url;
    return url + '&tid=' + encodeURIComponent(id);
  }
  var capture = null;
  function patchClipboard() {
    var cb = navigator.clipboard;
    if (!cb || cb.__edu) return;
    var orig = cb.writeText ? cb.writeText.bind(cb) : null;
    try {
      cb.writeText = function (t) {
        t = addTid(String(t));
        if (capture) { var c = capture; capture = null; c(t); return Promise.resolve(); }
        return orig ? orig(t) : Promise.reject(new Error('no clipboard'));
      };
      cb.__edu = true;
    } catch (e) {}
  }
  function chipText(sel) { var e = document.querySelector(sel); return e ? e.textContent.trim() : ''; }
  function infoFromPage(url) {
    return { url: url, title: (window.GAME_CONFIG || {}).title || document.title,
      grade: chipText('#grades .chip.on').replace(/^الصف\s*/, ''), subject: chipText('#subjects .chip.on'), unit: chipText('#units .chip.on'),
      lessons: Array.prototype.map.call(document.querySelectorAll('.lesson-item.on b, .lesson-item.on .lesson-name'), function (b) { return b.textContent.trim(); }) };
  }
  // رابط الطلاب الحالي: من دالة اللعبة إن وُجدت، وإلا من زر «نسخ رابط للطلاب» نفسه
  function currentLink(cb) {
    if (typeof window.__eduLink === 'function') { var i = window.__eduLink(); i.url = addTid(i.url); return cb(i); }
    var link = document.getElementById('linkBtn'), done = false, note = document.getElementById('setupNote');
    capture = function (t) { done = true; cb(infoFromPage(t)); };
    link.click();
    setTimeout(function () {
      if (done) return; capture = null;
      var m = note && note.textContent.match(/https?:\/\/\S+/);
      cb(m ? infoFromPage(addTid(m[0])) : null);
    }, 400);
  }
  function download() { currentLink(build); }
  function build(info) {
    if (!info) { alertNote('تعذّر إنشاء الرابط. اختر الدروس ثم حاول مرة أخرى.'); return; }
    if (/^file:/i.test(info.url)) {
      alertNote('حزمة SCORM تحتاج رابطًا منشورًا على الإنترنت. افتح اللعبة من موقعها (مثل altahdir.app) ثم أنشئ الحزمة.');
      return;
    }
    info.mastery = (window.GAME_CONFIG && window.GAME_CONFIG.scormMastery) || 60;
    info.packTitle = info.title + ' – ' + info.subject + ' – الصف ' + info.grade + ' – ' + info.unit;
    var blob = zip([{ name: 'imsmanifest.xml', text: manifest(info) }, { name: 'index.html', text: launcher(info) }, { name: 'اقرأني.txt', text: readme(info) }]);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'SCORM-' + safe(info.title) + '-' + safe(info.subject) + '-' + safe(info.grade) + '.zip';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    setTimeout(function () { alertNote('تم تنزيل حزمة SCORM ✓ ارفعها كما هي في نظام إدارة التعلّم (مثل Moodle).'); }, 120);
    window.__lastScorm = blob;
  }
  function alertNote(t) { var n = document.getElementById('setupNote'); if (n) n.textContent = t; }

  /* ---------- الزر ---------- */
  function addButton() {
    var link = document.getElementById('linkBtn');
    if (!link || document.getElementById('scormBtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'scormBtn'; b.className = link.className; b.textContent = 'تنزيل حزمة SCORM';
    b.title = 'حزمة SCORM 1.2 لنظام إدارة التعلّم (Moodle وغيره) — تفتح اللعبة بالدروس المختارة وتسجّل نتيجة الطالب';
    b.disabled = link.disabled;
    b.onclick = download;
    link.parentNode.insertBefore(b, link.nextSibling);
    new MutationObserver(function () { b.disabled = link.disabled; }).observe(link, { attributes: true, attributeFilter: ['disabled'] });
  }

  function boot() { wrapQM(); patchClipboard(); addButton(); watchResults(); }
  wrapQM();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.EduScorm = { download: download, zip: zip, totals: T };
})();
