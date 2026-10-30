// أدوات مشتركة لاختبارات الألعاب الجديدة
const { chromium } = require('playwright');
const H = '#g=g04&s=0&m=0&u=0&l=0.1.2';
module.exports = async function run(port, body) {
  const results = []; const rec = (name, pass, info) => results.push({ name, pass, info });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const G = (fn, a) => p.evaluate(fn, a);
  const waitQ = () => p.waitForFunction(() => { const m = document.getElementById('qModal'); return m.classList.contains('show') && document.getElementById('qConfirm').style.visibility !== 'hidden' && window.__curRaw(); }, null, { timeout: 15000 });
  const answer = async (c) => { await waitQ(); await G(c => { const r = window.__decodeAnswer(window.__curRaw()); [...document.querySelectorAll('#qOpts .opt')].find(x => (+x.dataset.choice === r) === c).click(); }, c); await p.click('#qConfirm'); };
  await p.goto(`http://localhost:${port}/index.html${H}`); await p.evaluate(() => localStorage.clear()); await p.goto(`http://localhost:${port}/index.html${H}`); await p.reload();
  await p.waitForSelector('#startGame');
  try { await body({ p, G, rec, answer, waitQ, b, port, H }); } catch (e) { rec('تنفيذ الاختبار دون استثناء', false, e.message); }
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(`http://localhost:${port}/index.html${H}`); await m.waitForSelector('#startGame'); if (await m.$('#sampleNames')) await m.click('#sampleNames'); await m.click('#startGame'); await m.waitForTimeout(600);
  const sc = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  rec('يعمل على الهاتف دون تمرير أفقي', !sc, sc);
  const ss = await m.evaluate(() => !!document.getElementById('scormBtn'));
  rec('زر حزمة SCORM موجود بجانب رابط الطلاب', ss, ss);
  rec('لا أخطاء JavaScript', errs.length === 0, errs);
  await b.close();
  results.forEach(r => console.log((r.pass ? '✅ نجح' : '❌ يحتاج إصلاح') + ' — ' + r.name + (r.pass ? '' : '  ' + JSON.stringify(r.info))));
  process.exit(results.every(r => r.pass) ? 0 : 1);
};
