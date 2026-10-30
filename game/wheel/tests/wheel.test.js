// اختبار «العجلة الدوّارة»: شغّل خادمًا محليًا على 8804 ثم: node tests/wheel.test.js
const run = require('./testlib.js');
run(8804, async ({ p, G, rec, answer }) => {
  let s = await G(() => document.getElementById('startGame').disabled);
  rec('لا تبدأ العجلة قبل إدخال اسمين على الأقل', s === true, s);
  await p.fill('#namesBox', 'سارة\nعلي\nهدى\nسالم'); await p.dispatchEvent('#namesBox', 'input');
  await p.click('#optTime .chip >> nth=0');
  await p.click('#startGame'); await p.waitForTimeout(300);
  s = await G(() => ({ segs: document.querySelectorAll('#wheel .seg').length, board: document.querySelectorAll('#board li').length }));
  rec('العجلة ولوحة الصف تعرضان أسماء الشعبة (4)', s.segs === 4 && s.board === 4, s);
  await G(() => { Math.random = () => 0.6; }); // يختار العنصر 2 من 4 = «هدى»
  await p.keyboard.press('Space');
  await p.waitForSelector('#picked.show', { timeout: 8000 });
  s = await G(() => { const g = window.__wh, rot = ((g.rot % 360) + 360) % 360, n = g.students.length, top = Math.floor(((360 - rot) % 360) / (360 / n)); return { picked: document.querySelector('#picked b').textContent, pick: g.students[g.pick].name, top: g.students[top].name }; });
  rec('المؤشر يتوقف عند الطالب المختار نفسه', s.picked === s.pick && s.top === s.pick, s);
  await answer(true);
  await p.waitForFunction(() => window.__wh.state === 'idle', null, { timeout: 8000 });
  s = await G(() => ({ pts: window.__wh.students.find(x => x.name === 'هدى').points, first: document.querySelector('#board li b').textContent, done: document.querySelectorAll('#wheel .seg.done').length }));
  rec('الإجابة الصحيحة: +10 نقاط للطالب ويتصدّر لوحة الصف', s.pts === 10 && s.first === 'هدى' && s.done === 1, s);
  await G(() => { Math.random = () => 0.6; });
  await p.click('#spinBtn'); await p.waitForSelector('#picked.show', { timeout: 8000 });
  s = await G(() => window.__wh.students[window.__wh.pick].name);
  rec('لا يتكرر الاسم حتى يأتي دور الجميع', s !== 'هدى', s);
  const wid = await (async () => { await p.waitForFunction(() => window.__curRaw()); return G(() => window.__wh.qm.current.item.id); })();
  await answer(false); await p.waitForTimeout(300);
  const good = await G(() => document.querySelectorAll('#qOpts .good').length);
  await p.waitForFunction(() => window.__wh.state === 'idle', null, { timeout: 8000 });
  s = await G(() => window.__wh.students.reduce((a, x) => a + x.points, 0));
  rec('الخطأ: لا نقاط ولا كشف للإجابة الصحيحة', s === 10 && good === 0, { s, good });
  await p.click('#spinBtn'); await p.waitForFunction(() => window.__curRaw(), null, { timeout: 8000 });
  const id2 = await G(() => window.__wh.qm.current.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة', id2 !== wid, { id2, wid });
  await answer(true); await p.waitForFunction(() => window.__wh.state === 'idle', null, { timeout: 8000 });
  await p.click('#spinBtn'); await p.waitForFunction(() => window.__curRaw(), null, { timeout: 8000 }); await answer(true);
  await p.waitForFunction(() => window.__wh.state === 'idle', null, { timeout: 8000 });
  s = await G(() => ({ round: window.__wh.round, done: window.__wh.students.every(x => x.done) }));
  await p.click('#spinBtn'); await p.waitForTimeout(300);
  const s2 = await G(() => ({ round: window.__wh.round, done: document.querySelectorAll('#wheel .seg.done').length }));
  rec('بعد أن يأتي دور الجميع تبدأ دورة جديدة', s.done && s2.round === 2, { s, s2 });
  await p.waitForFunction(() => window.__curRaw(), null, { timeout: 8000 }); await answer(true);
  await p.waitForFunction(() => window.__wh.state === 'idle', null, { timeout: 8000 });
  await p.click('#endBtn');
  s = await G(() => ({ show: document.getElementById('rModal').classList.contains('show'), t: document.getElementById('rTitle').textContent, rows: document.querySelectorAll('#rTable .wh-row').length }));
  rec('إنهاء الجلسة يعرض لوحة الشرف بكل الطلاب', s.show && /لوحة الشرف/.test(s.t) && s.rows === 5, s);
  // حفظ الأسماء لنفس الصف والمادة
  await p.click('#rActions .btn >> nth=1'); await p.waitForTimeout(200);
  s = await G(() => document.getElementById('namesBox').value.split('\n').length);
  rec('الأسماء محفوظة للصف والمادة', s === 4, s);
});
