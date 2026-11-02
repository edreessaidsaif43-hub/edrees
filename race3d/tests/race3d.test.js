// اختبار «سباق المعرفة 3D»: شغّل خادمًا محليًا على 8807 ثم: node tests/race3d.test.js
const run = require('./testlib.js');
run(8807, async ({ p, G, rec, answer, waitQ }) => {
  await p.click('#optWins .chip >> nth=0');    // 4 إجابات
  await p.click('#optTime .chip >> nth=2');    // 30 ثانية
  await p.click('#optQuality .chip >> nth=2'); // خفيفة
  await p.fill('#tn0', 'الصقور'); await p.fill('#tn1', 'المها');
  await p.click('#startGame');
  await p.waitForFunction(() => window.__rc && window.__rc.state === 'grid', null, { timeout: 60000 });
  await p.waitForTimeout(2200);
  await p.screenshot({ path: '/tmp/claude-0/rc-count.png' });
  let s = await G(() => ({ canvas: !!document.querySelector('#rcStage canvas'), lights: window.__raceEngine.debug.phase, banner: document.getElementById('banner').textContent }));
  rec('تُبنى الحلبة ثلاثية الأبعاد وتبدأ إشارة الانطلاق', s.canvas && /grid|race/.test(s.lights), s);
  await waitQ(); await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/claude-0/rc-q.png' });
  s = await G(() => ({ turn: window.__rc.turn, cls: document.getElementById('team0').className, tag: document.querySelector('#qModal').textContent.includes('الصقور'), phase: window.__raceEngine.debug.phase }));
  rec('بعد الانطلاق: الدور للفريق الأول والسؤال باسمه', s.turn === 0 && /myturn/.test(s.cls) && s.tag && s.phase === 'race', s);
  await answer(true);
  await p.waitForFunction(() => window.__rc.teams[0].correct === 1, null, { timeout: 8000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: '/tmp/claude-0/rc-nitro.png' });
  await p.waitForTimeout(1500);
  s = await G(() => ({ off: window.__raceEngine.debug.cars[0].off, pips: document.querySelectorAll('#team0 .pips i.on').length }));
  rec('الإجابة الصحيحة: نيترو يقدّم السيارة ويملأ مؤشر الفريق', s.off > 25 && s.pips === 1, s);
  await waitQ();
  s = await G(() => ({ turn: window.__rc.turn, active: window.__raceEngine.debug.active }));
  rec('يتناوب الدور والكاميرا تنتقل إلى سيارة الفريق الثاني', s.turn === 1 && s.active === 1, s);
  await answer(false); await p.waitForTimeout(300);
  const good = await G(() => document.querySelectorAll('#qOpts .good').length);
  await p.waitForFunction(() => window.__rc.teams[1].wrong === 1, null, { timeout: 8000 });
  await p.waitForTimeout(1000);
  await p.screenshot({ path: '/tmp/claude-0/rc-slip.png' });
  s = await G(() => ({ off: window.__raceEngine.debug.cars[1].off, correct: window.__rc.teams[1].correct }));
  rec('الخطأ: لا كشف للإجابة، والسيارة تنزلق وتتراجع', good === 0 && s.off < 0 && s.correct === 0, { s, good });
  for (let i = 0; i < 5; i++) {
    if (await G(() => window.__rc.over)) break;
    await waitQ(); const t = await G(() => window.__rc.turn); await answer(t === 0);
  }
  await p.waitForFunction(() => window.__rc.over, null, { timeout: 15000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: '/tmp/claude-0/rc-final.png' });
  await p.waitForSelector('#rModal.show', { timeout: 40000 });
  await p.screenshot({ path: '/tmp/claude-0/rc-end.png' });
  s = await G(() => ({ t: document.getElementById('rTitle').textContent, rows: document.querySelectorAll('#rTable .rc-row').length, win: window.__rc.winner, c: window.__rc.teams.map(x => x.correct) }));
  rec('أول فريق يصل إلى 4 إجابات يعبر خط النهاية ويفوز', /فاز الصقور/.test(s.t) && s.win === 0 && s.c[0] === 4 && s.rows === 3, s);
  await p.click('#rActions .btn >> nth=0');
  await p.waitForFunction(() => window.__rc && window.__rc.state === 'grid', null, { timeout: 60000 });
  s = await G(() => ({ c: window.__rc.teams.map(x => x.correct), off: window.__raceEngine.debug.cars.map(c => c.off) }));
  rec('«العب مرة أخرى» يعيد السيارتين إلى خط الانطلاق', s.c.join() === '0,0' && s.off.join() === '0,0', s);
  await p.click('#exitBtn'); await p.waitForTimeout(300);
  s = await G(() => document.getElementById('home').classList.contains('active'));
  rec('الخروج يعيد إلى شاشة الفريقين', s, s);
});
