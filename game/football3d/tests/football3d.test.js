// اختبار «ملعب المعرفة 3D»: شغّل خادمًا محليًا على 8808 ثم: node tests/football3d.test.js
const run = require('./testlib.js');
run(8808, async ({ p, G, rec, answer, waitQ }) => {
  const waitQL = () => p.waitForFunction(() => window.__fb.over || (document.getElementById('qModal').classList.contains('show') && document.getElementById('qConfirm').style.visibility !== 'hidden' && window.__curRaw()), null, { timeout: 90000 });
  await p.click('#optAtt .chip >> nth=0');     // 3 هجمات
  await p.click('#optTime .chip >> nth=2');    // 30 ثانية
  await p.click('#optQuality .chip >> nth=2'); // خفيفة
  await p.fill('#tn0', 'الصقور'); await p.fill('#tn1', 'المها');
  await p.click('#startGame');
  await p.waitForFunction(() => window.__fb && window.__fb.state === 'intro', null, { timeout: 60000 });
  await p.waitForTimeout(1200);
  let s = await G(() => ({ canvas: !!document.querySelector('#fbStage canvas'), mode: window.__footEngine.debug.cam.mode }));
  await p.screenshot({ path: '/tmp/claude-0/fb-intro.png' });
  rec('يُبنى الملعب ثلاثي الأبعاد وتبدأ جولة الكاميرا', s.canvas && s.mode === 'fly', s);
  await waitQ(); await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/claude-0/fb-q.png' });
  s = await G(() => ({ turn: window.__fb.turn, cls: document.getElementById('team0').className, tag: document.querySelector('#qModal').textContent.includes('الصقور'), att: window.__footEngine.debug.att, hAtt: document.getElementById('hAtt').textContent }));
  rec('الهجمة الأولى للفريق الأول والسؤال باسمه', s.turn === 0 && /myturn/.test(s.cls) && s.tag && s.att === 0 && /الهجمة 1 من 3/.test(s.hAtt), s);
  await answer(true);
  await p.waitForFunction(() => window.__fb.teams[0].goals === 1, null, { timeout: 40000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/claude-0/fb-goal.png' });
  s = await G(() => ({ sb: document.getElementById('sbS0').textContent, pips: document.querySelectorAll('#team0 .pips i.g').length, out: window.__footEngine.debug.outcome, net: window.__footEngine.B.mode }));
  rec('الإجابة الصحيحة: هجمة تنتهي بهدف وتتحدّث النتيجة', s.sb === '1' && s.pips === 1 && s.out === 'goal' && s.net === 'net', s);
  await waitQL();
  s = await G(() => ({ turn: window.__fb.turn, att: window.__footEngine.debug.att }));
  rec('يتناوب الدور: الهجمة التالية للفريق الثاني', s.turn === 1 && s.att === 1, s);
  await answer(false); await p.waitForTimeout(300);
  const good = await G(() => document.querySelectorAll('#qOpts .good').length);
  await p.waitForFunction(() => window.__fb.teams[1].shots.length === 1, null, { timeout: 40000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/claude-0/fb-miss.png' });
  s = await G(() => ({ g: window.__fb.teams[1].goals, x: document.querySelectorAll('#team1 .pips i.x').length, out: window.__fb.lastEv }));
  rec('الخطأ: لا كشف للإجابة، وتضيع الهجمة دون هدف', good === 0 && s.g === 0 && s.x === 1 && /tackle|save|post/.test(s.out), { s, good });
  // الصقور 3 أهداف مقابل 0 → ينتهي مبكرًا عند الحسم
  for (let i = 0; i < 6; i++) {
    if (await G(() => window.__fb.over)) break;
    await waitQL();
    if (await G(() => window.__fb.over)) break;
    const t = await G(() => window.__fb.turn); await answer(t === 0);
  }
  await p.waitForFunction(() => window.__fb.over, null, { timeout: 60000 });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: '/tmp/claude-0/fb-final.png' });
  await p.waitForSelector('#rModal.show', { timeout: 40000 });
  await p.screenshot({ path: '/tmp/claude-0/fb-end.png' });
  s = await G(() => ({ t: document.getElementById('rTitle').textContent, rows: document.querySelectorAll('#rTable .fb-row').length, win: window.__fb.winner, g: window.__fb.teams.map(x => x.goals) }));
  rec('ينتهي اللقاء عند الحسم ويفوز الأكثر أهدافًا', /فاز الصقور/.test(s.t) && s.win === 0 && s.g[0] > s.g[1] && s.rows === 3, s);
  await p.click('#rActions .btn >> nth=0');
  await p.waitForFunction(() => window.__fb && window.__fb.state === 'intro', null, { timeout: 60000 });
  s = await G(() => ({ g: window.__fb.teams.map(x => x.goals), sc: window.__footEngine.debug.scores }));
  rec('«العب مرة أخرى» يبدأ مباراة جديدة بنتيجة 0–0', s.g.join() === '0,0' && s.sc.join() === '0,0', s);
  await p.click('#exitBtn'); await p.waitForTimeout(300);
  s = await G(() => document.getElementById('home').classList.contains('active'));
  rec('الخروج يعيد إلى شاشة الفريقين', s, s);
  await p.close(); // تحرير المعالج قبل اختبار الهاتف
});
