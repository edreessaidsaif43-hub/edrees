// اختبار «شدّ الحبل»: شغّل خادمًا محليًا على 8803 ثم: node tests/tug.test.js
const run = require('./testlib.js');
run(8803, async ({ p, G, rec }) => {
  await p.click('#optSteps .chip >> nth=0'); // 4 سحبات
  await p.click('#optDur .chip >> nth=0');   // بلا وقت
  await p.click('#startGame');
  await p.waitForFunction(() => window.__tg.started && window.__tg.teams[0].cur && window.__tg.teams[1].cur, null, { timeout: 8000 });
  const pickT = (i, c) => G(([i, c]) => { const t = window.__tg.teams[i], r = window.__decodeAnswer(t.cur.item._raw); [...document.querySelectorAll('#po' + i + ' .opt')].find(x => (+x.dataset.choice === r) === c).click(); }, [i, c]);
  let s = await G(() => ({ q0: document.getElementById('pq0').textContent.length > 3, q1: document.getElementById('pq1').textContent.length > 3, pos: window.__tg.pos }));
  rec('بعد العدّ التنازلي يظهر سؤال لكل فريق في الوقت نفسه', s.q0 && s.q1 && s.pos === 0, s);
  await pickT(0, true); await p.waitForTimeout(200);
  s = await G(() => ({ pos: window.__tg.pos, pulls: window.__tg.teams[0].pulls, tr: document.getElementById('rope').style.transform }));
  rec('إجابة صحيحة للفريق الأيمن تسحب الحبل نحوه', s.pos === 1 && s.pulls === 1 && /translateX\(\d/.test(s.tr), s);
  const wid = await G(() => window.__tg.teams[1].cur.item.id);
  await pickT(1, false); await p.waitForTimeout(200);
  s = await G(() => ({ pos: window.__tg.pos, good: document.querySelectorAll('#po1 .good').length, lock: window.__tg.teams[1].lock, locked: document.getElementById('panel1').classList.contains('locked') }));
  rec('الخطأ: لا سحب ولا كشف للإجابة، وينتظر الفريق لحظة', s.pos === 1 && s.good === 0 && s.lock && s.locked, s);
  await p.waitForFunction(() => !window.__tg.teams[1].lock, null, { timeout: 4000 });
  const id2 = await G(() => window.__tg.teams[1].cur.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة للفريق', id2 !== wid, { id2, wid });
  // مفاتيح لوحة المفاتيح للفريق الأيسر (7–0)
  const k = await G(() => { const t = window.__tg.teams[1], r = window.__decodeAnswer(t.cur.item._raw); return +[...document.querySelectorAll('#po1 .opt')].find(x => +x.dataset.choice === r).dataset.pos; });
  await p.keyboard.press(['Digit7', 'Digit8', 'Digit9', 'Digit0'][k]); await p.waitForTimeout(200);
  s = await G(() => window.__tg.pos);
  rec('الفريق الأيسر يجيب بالمفاتيح 7–0 ويسحب نحوه', s === 0, s);
  for (let i = 0; i < 4; i++) { await p.waitForFunction(() => !window.__tg.teams[0].lock && window.__tg.teams[0].cur, null, { timeout: 4000 }); await pickT(0, true); await p.waitForTimeout(150); }
  await p.waitForSelector('#rModal.show', { timeout: 6000 });
  s = await G(() => ({ t: document.getElementById('rTitle').textContent, pos: window.__tg.pos, win: document.getElementById('field').classList.contains('win0') }));
  rec('أول فريق يصل إلى خطّه (4 سحبات) يفوز', /الصقور/.test(s.t) && s.pos === 4 && s.win, s);
});
