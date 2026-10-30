// اختبار «غوص اللؤلؤ»: شغّل خادمًا محليًا على 8801 ثم: node tests/pearl.test.js
const run = require('./testlib.js');
run(8801, async ({ p, G, rec, answer }) => {
  await p.click('#optGoal .chip >> nth=0'); // 50 م
  await p.click('#optTime .chip >> nth=0'); // بلا وقت
  await p.click('#startGame');
  await answer(true); await p.waitForTimeout(400);
  let s = await G(() => ({ good: document.querySelectorAll('#qOpts .good').length }));
  await p.waitForFunction(() => window.__pl.depth === 10, null, { timeout: 8000 });
  s = await G(() => ({ pearls: window.__pl.pearls, depth: window.__pl.depth, o2: window.__pl.o2, hud: document.getElementById('hPearls').textContent }));
  rec('الإجابة الصحيحة: لؤلؤة وعمق +10 م', s.pearls === 1 && s.depth === 10 && s.o2 === 3, s);
  const wid = await (async () => { await p.waitForFunction(() => window.__curRaw()); return G(() => window.__pl.qm.current.item.id); })();
  await answer(false); await p.waitForTimeout(300);
  const good = await G(() => document.querySelectorAll('#qOpts .good').length);
  await p.waitForTimeout(1600);
  s = await G(() => ({ o2: window.__pl.o2, depth: window.__pl.depth, tanks: document.querySelectorAll('#o2 .tank-ic.empty').length }));
  rec('الخطأ: ينقص الأكسجين دون كشف الإجابة ولا ينزل الغوّاص', s.o2 === 2 && s.depth === 10 && s.tanks === 1 && good === 0, { s, good });
  await p.waitForFunction(() => window.__curRaw(), null, { timeout: 8000 });
  const id2 = await G(() => window.__pl.qm.current.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة', id2 !== wid, { id2, wid });
  for (let i = 0; i < 4; i++) { await answer(true); await p.waitForTimeout(2200); }
  await p.waitForSelector('#rModal.show', { timeout: 10000 });
  s = await G(() => ({ t: document.getElementById('rTitle').textContent, chest: document.getElementById('chest').classList.contains('open'), depth: window.__pl.depth }));
  rec('الوصول إلى العمق المطلوب (50 م) يفتح صندوق الكنز ويُنهي الغوصة', /القاع/.test(s.t) && s.chest && s.depth === 50, s);
  // نفاد الأكسجين
  await p.click('#rActions .btn >> nth=0'); await p.waitForTimeout(300);
  for (let i = 0; i < 3; i++) { await answer(false); await p.waitForTimeout(1900); }
  await p.waitForSelector('#rModal.show', { timeout: 10000 });
  s = await G(() => ({ t: document.getElementById('rTitle').textContent, o2: window.__pl.o2 }));
  rec('ثلاث إجابات خاطئة: ينفد الأكسجين وتظهر النتائج', /الأكسجين/.test(s.t) && s.o2 === 0, s);
  s = await G(() => document.getElementById('rTable').textContent);
  rec('النتائج تحفظ أفضل عمق', /أفضل عمق.*50/.test(s), s);
});
