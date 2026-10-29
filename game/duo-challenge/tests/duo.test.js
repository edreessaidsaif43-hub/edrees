// اختبار «تحدي الثنائي» (نظام الجرس): شغّل خادمًا محليًا على 8767 ثم: node tests/duo.test.js
const { chromium } = require('playwright');
const URL = 'http://localhost:8767/index.html#g=g04&s=0&m=0&u=0&l=0.1';
const results = []; const rec = (name, pass, info) => results.push({ name, pass, info });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('#startMatch');
  await p.fill('#name0', 'سارة'); await p.fill('#name1', 'خالد');
  await p.click('#optCount .chip >> nth=0');
  await p.click('#startMatch');
  const G = (fn, a) => p.evaluate(fn, a);
  const pickOpt = (correct) => G(c => { const cur = window.__duo.cur, r = window.__decodeAnswer(cur.item._raw); const btn = [...document.querySelectorAll('#opts .dopt')].find(x => (+x.dataset.choice === r) === c); btn.click(); }, correct);
  await p.waitForTimeout(400);
  let s = await G(() => ({ st: window.__duo.state, bz: [0, 1].map(i => document.getElementById('bz' + i).disabled), opts: document.querySelectorAll('#opts .dopt').length, dis: [...document.querySelectorAll('#opts .dopt')].every(x => x.disabled) }));
  rec('وقت القراءة: السؤال وخياراته ظاهرة والجرسان مقفلان', s.st === 'reading' && s.bz.every(Boolean) && s.opts >= 2 && s.dis, s);
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  s = await G(() => window.__duo.state);
  rec('الضغط المبكر على الجرس لا يُحتسب', s === 'reading', s);
  await p.waitForFunction(() => window.__duo.state === 'buzz', null, { timeout: 5000 });
  s = await G(() => [0, 1].map(i => document.getElementById('bz' + i).disabled));
  rec('بعد العد يُفتح الجرسان معًا', s.every(x => !x), s);
  // الطالبان يضغطان معًا تقريبًا: الأسبق يأخذ الدور فقط
  await p.keyboard.press('Space'); await p.keyboard.press('Enter');
  await p.waitForTimeout(100);
  s = await G(() => ({ st: window.__duo.state, turn: window.__duo.turn, tag: document.getElementById('turnTag').textContent, en: [...document.querySelectorAll('#opts .dopt')].every(x => !x.disabled) }));
  rec('أول من يضغط جرسه يحصل على دور الإجابة (والضغطة الثانية لا تغيّره)', s.st === 'answer' && s.turn === 1 && /خالد/.test(s.tag) && s.en, s);
  // خالد يخطئ → الدور لسارة دون كشف
  await pickOpt(false); await p.waitForTimeout(150);
  s = await G(() => ({ st: window.__duo.state, turn: window.__duo.turn, locked: window.__duo.locked, marks: document.querySelectorAll('#opts .good,#opts .bad,#opts .sel').length, tag: document.getElementById('turnTag').textContent }));
  rec('الخطأ ينقل الدور للمنافس مباشرة دون كشف الإجابة', s.st === 'answer' && s.turn === 0 && s.locked[1] && s.marks === 0 && /سارة/.test(s.tag), s);
  await p.keyboard.press('Space'); await p.waitForTimeout(80);
  s = await G(() => window.__duo.turn);
  rec('جرس اللاعب المقفول لا يعمل', s === 0, s);
  // سارة تصيب
  await pickOpt(true); await p.waitForTimeout(150);
  s = await G(() => ({ st: window.__duo.state, sc: window.__duo.score.join(), banner: document.getElementById('banner').textContent }));
  rec('الإجابة الصحيحة تكسب النقطة', s.st === 'reveal' && s.sc === '1,0' && /سارة/.test(s.banner), s);
  // السؤال الثاني: لا أحد يضغط حتى انتهاء الوقت (نقصّر الوقت للاختبار)
  await p.waitForFunction(() => window.__duo.state === 'reading', null, { timeout: 6000 });
  const id2 = await G(() => window.__duo.cur.item.id);
  await p.waitForFunction(() => window.__duo.state === 'buzz', null, { timeout: 6000 });
  // الاثنان يخطئان
  await p.keyboard.press('Enter'); await p.waitForTimeout(80); await pickOpt(false); await p.waitForTimeout(80); await pickOpt(false); await p.waitForTimeout(150);
  s = await G(() => ({ st: window.__duo.state, sc: window.__duo.score.join(), banner: document.getElementById('banner').textContent, good: document.querySelectorAll('#opts .good').length }));
  rec('خطأ الاثنين: لا نقطة ولا كشف للإجابة والسؤال يعود لاحقًا', s.st === 'reveal' && s.sc === '1,0' && /سيعود/.test(s.banner) && s.good === 0, s);
  // السؤال التالي ليس السؤال الخاطئ نفسه
  await p.waitForFunction(() => window.__duo.state === 'reading', null, { timeout: 6000 });
  const id3 = await G(() => window.__duo.cur.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة', id3 !== id2, { id2, id3 });
  // مهلة الإجابة: من يضغط ولا يجيب يخسر الدور
  await p.waitForFunction(() => window.__duo.state === 'buzz', null, { timeout: 6000 });
  await p.keyboard.press('Space');
  await p.waitForTimeout(8600);
  s = await G(() => ({ st: window.__duo.state, turn: window.__duo.turn, locked: window.__duo.locked }));
  rec('انتهاء وقت الإجابة ينقل الدور للمنافس', s.locked[1] && s.turn === 0 && s.st === 'answer', s);
  await pickOpt(true); await p.waitForTimeout(100);
  // إنهاء المباراة
  await G(() => { window.__duo.round = window.__duo.total; });
  await p.waitForSelector('#rModal.show', { timeout: 6000 });
  s = await G(() => ({ title: document.getElementById('rTitle').textContent, table: document.getElementById('rTable').innerText }));
  rec('نهاية المباراة: إعلان الفائز وجدول المقارنة', /الفائز: سارة/.test(s.title) && /الجرس/.test(s.table), s);
  // الهاتف عموديًا
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(URL); await m.waitForSelector('#startMatch'); await m.click('#startMatch'); await m.waitForTimeout(3600);
  const rot = await m.evaluate(() => { const r0 = document.getElementById('bz0').getBoundingClientRect(), r1 = document.getElementById('bz1').getBoundingClientRect(); return { t: getComputedStyle(document.getElementById('side1')).transform, p2top: r1.top < r0.top, scroll: document.documentElement.scrollWidth > innerWidth }; });
  await m.screenshot({ path: '/tmp/claude-0/shots/duo-portrait.png' });
  rec('الهاتف عموديًا: وضع الطاولة (جرس اللاعب الثاني في الأعلى مقلوبًا)', rot.t !== 'none' && rot.p2top && !rot.scroll, rot);
  rec('لا أخطاء JavaScript', errs.length === 0, errs);
  await b.close();
  results.forEach(r => console.log((r.pass ? '✅ نجح' : '❌ يحتاج إصلاح') + ' — ' + r.name + (r.pass ? '' : '  ' + JSON.stringify(r.info))));
  process.exit(results.every(r => r.pass) ? 0 : 1);
})();
