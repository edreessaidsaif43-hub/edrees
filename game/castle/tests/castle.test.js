// اختبار «بناء القلعة»: شغّل خادمًا محليًا على 8802 ثم: node tests/castle.test.js
const run = require('./testlib.js');
run(8802, async ({ p, G, rec, answer }) => {
  await p.click('#fortPick .cs-fort >> nth=1'); // بهلاء
  await p.click('#optStones .chip >> nth=0'); // 8 أحجار
  await p.click('#startGame'); await p.waitForTimeout(300);
  let s = await G(() => ({ fort: document.getElementById('hFort').textContent, bricks: document.querySelectorAll('#fort .brick').length, on: document.querySelectorAll('#fort .brick.on').length }));
  rec('تبدأ قلعة بهلاء فارغة وفيها مخطط الأحجار', /بهلاء/.test(s.fort) && s.bricks > 100 && s.on === 0, s);
  await answer(true);
  await p.waitForFunction(() => window.__cs.state === 'idle', null, { timeout: 8000 });
  s = await G(() => ({ placed: window.__cs.placed, on: document.querySelectorAll('#fort .brick.on').length, pct: document.getElementById('hPct').textContent }));
  rec('الإجابة الصحيحة تضيف حجرًا ويتحرك شريط التقدّم', s.placed === 1 && s.on > 5 && s.pct === '13%', s);
  await p.keyboard.press('Space');
  const wid = await (async () => { await p.waitForFunction(() => window.__curRaw()); return G(() => window.__cs.qm.current.item.id); })();
  await answer(false); await p.waitForTimeout(300);
  const good = await G(() => document.querySelectorAll('#qOpts .good').length);
  await p.waitForFunction(() => window.__cs.state === 'idle', null, { timeout: 8000 });
  s = await G(() => ({ placed: window.__cs.placed, wrong: window.__cs.wrong }));
  rec('الخطأ: لا يُضاف حجر ولا تظهر الإجابة الصحيحة', s.placed === 1 && s.wrong === 1 && good === 0, { s, good });
  await p.click('#askBtn'); await p.waitForFunction(() => window.__curRaw());
  const id2 = await G(() => window.__cs.qm.current.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة', id2 !== wid, { id2, wid });
  await answer(true);
  for (let i = 0; i < 6; i++) { await p.waitForFunction(() => window.__cs.state === 'idle', null, { timeout: 8000 }); await p.click('#askBtn'); await answer(true); }
  await p.waitForSelector('#rModal.show', { timeout: 10000 });
  s = await G(() => ({ t: document.getElementById('rTitle').textContent, done: document.getElementById('stage').classList.contains('done'), all: document.querySelectorAll('#fort .brick.on').length === document.querySelectorAll('#fort .brick').length, fact: document.querySelector('.cs-fact').textContent }));
  rec('8 إجابات صحيحة تُكمل القلعة كلها ويُرفع العلم', /اكتملت قلعة بهلاء/.test(s.t) && s.done && s.all, s);
  rec('معلومة عن القلعة في النهاية', /يونسكو/.test(s.fact), s.fact);
});
