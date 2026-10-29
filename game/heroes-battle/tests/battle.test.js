// اختبار «معركة الأبطال»: شغّل خادمًا محليًا على 8771 ثم: node tests/battle.test.js
const { chromium } = require('playwright');
const URL = 'http://localhost:8771/index.html#g=g04&s=0&m=0&u=0&l=0.1.2';
const results = []; const rec = (name, pass, info) => results.push({ name, pass, info });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('#startGame');
  await p.click('#optTime .chip >> nth=0'); // بلا وقت
  await p.click('#startGame'); await p.waitForTimeout(300);
  const G = (fn, a) => p.evaluate(fn, a);
  const answer = async (c) => { await G(c => { const g = window.__bt, r = window.__decodeAnswer(g.cur.item._raw); [...document.querySelectorAll('#qOpts .opt')].find(x => (+x.dataset.choice === r) === c).click(); }, c); await p.click('#qConfirm'); };
  const waitIdle = () => p.waitForFunction(() => window.__bt.state === 'idle' || window.__bt.state === 'over', null, { timeout: 8000 });
  let s = await G(() => ({ hp: window.__bt.teams.map(t => t.hp).join(), turn: window.__bt.turn, vis: [0, 1].map(i => getComputedStyle(document.getElementById('f' + i)).opacity) }));
  rec('يبدأ البطلان بطاقة 100 وكلاهما ظاهر', s.hp === '100,100' && s.turn === 0 && s.vis.every(v => v === '1'), s);
  await p.keyboard.press('Space'); await p.waitForTimeout(150);
  await answer(true); await waitIdle();
  s = await G(() => ({ hp: window.__bt.teams.map(t => t.hp).join(), turn: window.__bt.turn, sk: window.__bt.teams[0].streak }));
  rec('الإجابة الصحيحة: ضربة 20 على الخصم وينتقل الدور', s.hp === '100,80' && s.turn === 1 && s.sk === 1, s);
  await p.click('#askBtn'); await p.waitForTimeout(150);
  const wid = await G(() => window.__bt.cur.item.id);
  await answer(false); await p.waitForTimeout(300);
  const good = await G(() => document.querySelectorAll('#qOpts .good').length);
  await waitIdle();
  s = await G(() => ({ hp: window.__bt.teams.map(t => t.hp).join(), turn: window.__bt.turn }));
  rec('الخطأ: لا ضربة ولا كشف للإجابة وينتقل الدور', s.hp === '100,80' && s.turn === 0 && good === 0, { s, good });
  // سلسلة: الفريق 0 يصيب مرتين أخريين → 25 ثم ضربة خارقة (20+10)*2=60
  await p.click('#askBtn'); await p.waitForTimeout(150);
  const id2 = await G(() => window.__bt.cur.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة', id2 !== wid, { id2, wid });
  await answer(true); await waitIdle();
  s = await G(() => window.__bt.teams[1].hp);
  rec('مكافأة السلسلة: الضربة الثانية المتتالية 25', s === 55, s);
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(false); await waitIdle(); // الفريق 1 يخطئ
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(true);
  await p.waitForSelector('.boom.super', { timeout: 6000 });
  await waitIdle();
  s = await G(() => ({ hp: window.__bt.teams[1].hp, supers: window.__bt.teams[0].supers }));
  rec('الضربة الخارقة بعد 3 إجابات متتالية تضاعف الضرر (60)', s.hp === 0 || s.hp === -5 || s.hp === Math.max(0, 55 - 60), s);
  await p.waitForSelector('#rModal.show', { timeout: 6000 });
  s = await G(() => ({ st: window.__bt.state, title: document.getElementById('rTitle').textContent, rows: document.querySelectorAll('#rTable .vt-row').length }));
  rec('إسقاط طاقة الخصم إلى صفر يعلن الفائز مع إحصاءات', s.st === 'over' && /الصقور/.test(s.title) && s.rows === 7, s);
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(URL); await m.waitForSelector('#startGame'); await m.click('#startGame'); await m.waitForTimeout(400);
  const sc = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  rec('يعمل على الهاتف دون تمرير أفقي', !sc, sc);
  rec('لا أخطاء JavaScript', errs.length === 0, errs);
  await b.close();
  results.forEach(r => console.log((r.pass ? '✅ نجح' : '❌ يحتاج إصلاح') + ' — ' + r.name + (r.pass ? '' : '  ' + JSON.stringify(r.info))));
  process.exit(results.every(r => r.pass) ? 0 : 1);
})();
