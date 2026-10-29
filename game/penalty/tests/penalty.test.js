// اختبار «ركلات الترجيح»: شغّل خادمًا محليًا على 8772 ثم: node tests/penalty.test.js
const { chromium } = require('playwright');
const URL = 'http://localhost:8772/index.html#g=g04&s=0&m=0&u=0&l=0.1.2';
const results = []; const rec = (name, pass, info) => results.push({ name, pass, info });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('#startGame');
  await p.evaluate(() => localStorage.clear());
  await p.click('#optKicks .chip >> nth=0'); // 3 ركلات
  await p.click('#optTime .chip >> nth=0'); // بلا وقت
  await p.fill('#tn0', 'الصقور');
  await p.click('#startGame'); await p.waitForTimeout(300);
  const G = (fn, a) => p.evaluate(fn, a);
  const answer = async (c) => { await G(c => { const g = window.__pk, r = window.__decodeAnswer(g.cur.item._raw); [...document.querySelectorAll('#qOpts .opt')].find(x => (+x.dataset.choice === r) === c).click(); }, c); await p.click('#qConfirm'); };
  const waitState = (st) => p.waitForFunction(s => s.split(',').includes(window.__pk.state), st, { timeout: 9000 });
  // keeper: Math.random → col/row؛ نتحكم به
  const keeper = (col, row) => G(([c, r]) => { const seq = [c / 3 + 0.01, r / 2 + 0.01]; let i = 0; Math.random = () => (i < 2 ? seq[i++] : 0.5); }, [col, row]);
  const zoneIdx = (row, col) => row * 3 + col;
  let s = await G(() => ({ n: window.__pk.n, turn: window.__pk.turn, name: window.__pk.teams[0].name, marks: document.querySelectorAll('#sbm0 .m').length, zones: document.querySelectorAll('#zones .zone').length }));
  rec('تبدأ المباراة: 3 ركلات لكل فريق و6 زوايا للتسديد', s.n === 3 && s.turn === 0 && s.name === 'الصقور' && s.marks === 3 && s.zones === 6, s);
  await p.keyboard.press('Space'); await p.waitForTimeout(150);
  s = await G(() => ({ st: window.__pk.state, tag: document.getElementById('qTeam').textContent }));
  rec('مفتاح المسافة يعرض سؤال الفريق صاحب الدور', s.st === 'ask' && /الصقور/.test(s.tag), s);
  await answer(true); await waitState('aim'); await p.waitForTimeout(350);
  s = await G(() => ({ aiming: document.getElementById('pitch').classList.contains('aiming'), vis: getComputedStyle(document.getElementById('zones')).opacity }));
  rec('الإجابة الصحيحة تفتح اختيار زاوية التسديد', s.aiming && s.vis === '1', s);
  // هدف: الحارس يقفز يمينًا والتسديد يسارًا
  await keeper(2, 1); await p.click('#zones .zone >> nth=' + zoneIdx(0, 0));
  await p.waitForSelector('#banner.show'); const bt = await G(() => document.getElementById('banner').textContent);
  await waitState('idle');
  s = await G(() => ({ g: window.__pk.teams[0].goals, k: window.__pk.teams[0].kicks.join(), turn: window.__pk.turn, mark: document.querySelectorAll('#sbm0 .m.goal').length }));
  rec('تسديدة بعيدة عن الحارس = هدف ويُسجَّل في اللوحة', /هدف/.test(bt) && s.g === 1 && s.k === 'goal' && s.turn === 1 && s.mark === 1, { bt, s });
  // تصدٍّ: الفريق 1 يجيب صحيحًا، الحارس في نفس العمود
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(true); await waitState('aim');
  await keeper(1, 0); await p.keyboard.press('Digit5'); // 5 = أسفل المنتصف
  await waitState('idle');
  s = await G(() => ({ k: window.__pk.teams[1].kicks.join(), saves: window.__pk.teams[0].saves, last: window.__pk.last }));
  rec('الحارس في جهة التسديدة نفسها يتصدّى (والأرقام 1–6 تعمل)', s.k === 'saved' && s.saves === 1 && s.last.zone === zoneIdx(1, 1), s);
  // خطأ: ركلة ضائعة، لا كشف
  await p.click('#askBtn'); await p.waitForTimeout(150);
  const wid = await G(() => window.__pk.cur.item.id);
  await answer(false); await p.waitForTimeout(300);
  const good = await G(() => document.querySelectorAll('#qOpts .good').length);
  await waitState('idle');
  s = await G(() => ({ k: window.__pk.teams[0].kicks.join(), turn: window.__pk.turn }));
  rec('الخطأ: ركلة ضائعة دون كشف الإجابة وينتقل الدور', s.k === 'goal,miss' && s.turn === 1 && good === 0, { s, good });
  await p.click('#askBtn'); await p.waitForTimeout(150);
  const id2 = await G(() => window.__pk.cur.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة', id2 !== wid, { id2, wid });
  // الفريق 1 يخطئ → 1-0، بقي لكل فريق ركلة: الفريق 0 يسجّل → 2-0 مع ركلة واحدة للخصم = حسم مبكر
  await answer(false); await waitState('idle');
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(true); await waitState('aim');
  await keeper(0, 0); await p.click('#zones .zone >> nth=' + zoneIdx(1, 2));
  await p.waitForSelector('#rModal.show', { timeout: 9000 });
  s = await G(() => ({ title: document.getElementById('rTitle').textContent, how: document.getElementById('rLesson').textContent, st: window.__pk.state }));
  rec('الحسم المبكر عندما لا يستطيع الخصم اللحاق', /الصقور/.test(s.title) && /قبل نهاية/.test(s.how) && s.st === 'over', s);
  // التعادل → ركلات حاسمة
  await p.click('#rActions .btn >> nth=0'); await p.waitForTimeout(300);
  await G(() => { const g = window.__pk; g.teams[0].kicks = ['goal', 'miss', 'miss']; g.teams[0].goals = 1; g.teams[1].kicks = ['goal', 'miss']; g.teams[1].goals = 1; g.turn = 1; });
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(false); await waitState('idle');
  s = await G(() => ({ sudden: window.__pk.sudden, turn: window.__pk.turn, round: document.getElementById('hRound').textContent }));
  rec('التعادل بعد الركلات المحددة يبدأ الركلات الحاسمة', s.sudden && s.turn === 0 && /حاسمة/.test(s.round), s);
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(true); await waitState('aim');
  await keeper(2, 0); await p.click('#zones .zone >> nth=' + zoneIdx(1, 0)); await waitState('idle');
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(false);
  await p.waitForSelector('#rModal.show', { timeout: 9000 });
  s = await G(() => ({ title: document.getElementById('rTitle').textContent, how: document.getElementById('rLesson').textContent }));
  rec('الركلات الحاسمة: يسجّل فريق ويضيّع الآخر فيفوز الأول', /الصقور/.test(s.title) && /الحاسمة/.test(s.how), s);
  // فوز بعد اكتمال الركلات (ليس حسمًا مبكرًا)
  await p.click('#rActions .btn >> nth=0'); await p.waitForTimeout(300);
  await G(() => { const g = window.__pk; g.teams[0].kicks = ['goal', 'goal', 'miss']; g.teams[0].goals = 2; g.teams[1].kicks = ['goal', 'miss']; g.teams[1].goals = 1; g.turn = 1; });
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(false);
  await p.waitForSelector('#rModal.show', { timeout: 9000 });
  s = await G(() => document.getElementById('rLesson').textContent);
  rec('الفوز بعد اكتمال كل الركلات يُذكر «بعد 3 ركلات» لا «حسم مبكر»', /بعد 3 ركلات/.test(s), s);
  // التسديدة القوية: الحارس في العمود نفسه لكن بارتفاع مختلف لا يتصدى
  await p.click('#rActions .btn >> nth=1'); await p.click('#optTime .chip >> nth=3'); await p.click('#startGame'); await p.waitForTimeout(300);
  await p.click('#askBtn'); await p.waitForTimeout(150); await answer(true); await waitState('aim');
  const fast = await G(() => window.__pk.fast);
  await keeper(0, 1); await p.click('#zones .zone >> nth=' + zoneIdx(0, 0)); await waitState('idle');
  s = await G(() => ({ k: window.__pk.teams[0].kicks.join(), power: window.__pk.teams[0].power }));
  rec('التسديدة القوية (إجابة سريعة) لا يصدّها الحارس إلا بتخمين الجهة والارتفاع', fast && s.k === 'goal' && s.power === 1, { fast, s });
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
