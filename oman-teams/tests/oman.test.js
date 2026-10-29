// اختبار «رحلة الفرق عبر عُمان»: شغّل خادمًا محليًا على 8769 ثم: node tests/oman.test.js
const { chromium } = require('playwright');
const URL = 'http://localhost:8769/index.html#g=g04&s=0&m=0&u=0&l=0.1.2';
const results = []; const rec = (name, pass, info) => results.push({ name, pass, info });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('#startGame');
  await p.click('#optTeams .chip >> nth=1'); // 3 فرق
  await p.fill('#tn0', 'الصقور'); await p.click('#startGame'); await p.waitForTimeout(300);
  const G = (fn, a) => p.evaluate(fn, a);
  const answer = async (correct) => {
    await G(c => { const g = window.__om, r = window.__decodeAnswer(g.cur.item._raw); [...document.querySelectorAll('#qOpts .opt')].find(x => (+x.dataset.choice === r) === c).click(); }, correct);
    await p.click('#qConfirm');
  };
  let s = await G(() => ({ n: window.__om.teams.length, pos: window.__om.teams.map(t => t.pos).join(), turn: window.__om.turn, name: window.__om.teams[0].name, tokens: document.querySelectorAll('#tokens .token').length }));
  rec('تبدأ 3 فرق من مسقط وتظهر قطعها على الخريطة', s.n === 3 && s.pos === '0,0,0' && s.turn === 0 && s.name === 'الصقور' && s.tokens === 3, s);
  await p.keyboard.press('Space'); await p.waitForTimeout(200);
  s = await G(() => ({ st: window.__om.state, tag: document.getElementById('qTeam').textContent }));
  rec('مفتاح المسافة يعرض سؤال الفريق صاحب الدور', s.st === 'ask' && /الصقور/.test(s.tag), s);
  // خطأ: لا حركة، لا كشف، ينتقل الدور
  const wid = await G(() => window.__om.cur.item.id);
  await answer(false); await p.waitForTimeout(300);
  s = await G(() => ({ good: document.querySelectorAll('#qOpts .good').length, fb: document.getElementById('qFeedback').textContent }));
  await p.waitForTimeout(1900);
  const s2 = await G(() => ({ pos: window.__om.teams[0].pos, turn: window.__om.turn, st: window.__om.state }));
  rec('الخطأ: لا حركة ولا كشف للإجابة وينتقل الدور', s.good === 0 && /لاحقًا/.test(s.fb) && s2.pos === 0 && s2.turn === 1 && s2.st === 'idle', { s, s2 });
  // صحيح: نرد ثم حركة
  await p.click('#askBtn'); await p.waitForTimeout(200);
  const id2 = await G(() => window.__om.cur.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة', id2 !== wid, { id2, wid });
  await answer(true); await p.waitForSelector('#diceModal.show', { timeout: 4000 });
  s = await G(() => window.__om.state);
  rec('الإجابة الصحيحة تفتح النرد', s === 'dice', s);
  await G(() => { window.__fixRoll = true; Math.random = (() => { let n = 0; return () => (n++ < 20 ? 0.5 : 0.99); })(); });
  await p.click('#die');
  await p.waitForFunction(() => window.__om.state === 'idle' || window.__om.state === 'event', null, { timeout: 8000 });
  s = await G(() => ({ pos: window.__om.teams[1].pos, st: window.__om.state }));
  rec('النرد (1–3) يحرّك الفريق محطة بمحطة', s.pos >= 1 && s.pos <= 4, s);
  if (s.st === 'event') { await p.click('#evOk'); await p.waitForTimeout(1500); }
  // مفاجأة العاصفة: ضع الفريق قبلها بخطوة ثم حرّك بالنرد
  await G(() => { const g = window.__om; g.turn = 2; g.state = 'idle'; g.teams[2].pos = 6; });
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(true);
  await p.waitForSelector('#diceModal.show', { timeout: 4000 });
  await G(() => { Math.random = () => 0.0; }); // نرد = 1 → الدقم (عاصفة)
  await p.click('#die');
  await p.waitForSelector('#eventModal.show', { timeout: 8000 });
  s = await G(() => ({ title: document.getElementById('evTitle').textContent, pos: window.__om.teams[2].pos }));
  await p.click('#evOk'); await p.waitForTimeout(900);
  const s3 = await G(() => window.__om.teams[2].pos);
  rec('محطة العاصفة الرملية تُرجع الفريق محطة', /عاصفة/.test(s.title) && s.pos === 7 && s3 === 6, { s, s3 });
  // الفوز بالوصول إلى خصب
  await p.waitForFunction(() => window.__om.state === 'idle', null, { timeout: 5000 });
  await G(() => { const g = window.__om; g.teams[g.turn].pos = 20; });
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(true);
  await p.waitForSelector('#diceModal.show', { timeout: 4000 });
  await p.click('#die');
  await p.waitForSelector('#rModal.show', { timeout: 8000 });
  s = await G(() => ({ title: document.getElementById('rTitle').textContent, rows: document.querySelectorAll('#rTable .om-row').length }));
  rec('أول فريق يصل إلى خصب يفوز وتظهر نتائج الفرق', /خصب/.test(s.title) && s.rows === 4, s);
  // الهاتف
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(URL); await m.waitForSelector('#startGame'); await m.click('#startGame'); await m.waitForTimeout(400);
  const sc = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  rec('يعمل على الهاتف دون تمرير أفقي', !sc, sc);
  rec('لا أخطاء JavaScript', errs.length === 0, errs);
  await b.close();
  results.forEach(r => console.log((r.pass ? '✅ نجح' : '❌ يحتاج إصلاح') + ' — ' + r.name + (r.pass ? '' : '  ' + JSON.stringify(r.info))));
  process.exit(results.every(r => r.pass) ? 0 : 1);
})();
