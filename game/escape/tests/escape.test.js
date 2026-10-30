// اختبار «الهروب من قلعة جبرين»: شغّل خادمًا محليًا على 8805 ثم: node tests/escape.test.js
const run = require('./testlib.js');
run(8805, async ({ p, G, rec, answer }) => {
  await p.click('#optMin .chip >> nth=2'); // 15 دقيقة
  await p.click('#optTime .chip >> nth=0');
  await p.click('#startGame'); await p.waitForTimeout(1300);
  await p.screenshot({ path: '/tmp/claude-0/es-room1.png' });
  let s = await G(() => ({ room: window.__es.room, hs: document.querySelectorAll('#room .hs').length, slots: document.querySelectorAll('#slots .slot.empty').length, sun: document.getElementById('sunTxt').textContent }));
  rec('تبدأ المغامرة في المجلس: 3 أشياء وقفل و3 خانات أدلة فارغة', s.room === 0 && s.hs === 4 && s.slots === 3 && /15:00|14:5/.test(s.sun), s);
  const clickHs = k => G(k => document.querySelector('#room .hs[data-k="' + k + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })), k);
  await clickHs('lock'); await p.waitForTimeout(200);
  s = await G(() => ({ lock: document.getElementById('lockModal').classList.contains('show'), tip: document.getElementById('tip').textContent }));
  rec('القفل لا يُفتح قبل جمع الأدلة الثلاثة', !s.lock && /3 أدلة/.test(s.tip), s);
  await clickHs(0); const t0 = await G(() => window.__es.left);
  await answer(false); await p.waitForTimeout(300);
  const good = await G(() => document.querySelectorAll('#qOpts .good').length);
  await p.waitForFunction(() => !document.getElementById('qModal').classList.contains('show'), null, { timeout: 5000 });
  s = await G(() => ({ found: window.__es.found[0].length, left: window.__es.left, wrong: window.__es.wrong }));
  rec('الخطأ: لا دليل ولا كشف للإجابة، ويُخصم 15 ثانية', s.found === 0 && s.wrong === 1 && good === 0 && t0 - s.left >= 14, { s, t0, good });
  for (const k of [0, 1, 2]) {
    await clickHs(k); await answer(true);
    await p.waitForSelector('#clueModal.show', { timeout: 5000 }); await p.click('#clueOk');
  }
  s = await G(() => ({ found: window.__es.found[0].length, slots: [...document.querySelectorAll('#slots .slot b')].map(b => b.textContent).join(), ready: document.querySelector('#room .lockhs').classList.contains('ready') }));
  rec('ثلاث إجابات صحيحة تكشف أرقام القفل الثلاثة', s.found === 3 && s.slots.split(',').length === 3 && s.ready, s);
  // رمز خاطئ ثم صحيح
  await clickHs('lock'); await p.waitForSelector('#lockModal.show');
  await G(() => { const g = window.__es; const want = g.codes[0]; if (want[0] !== 0) return; });
  await p.click('#lockTry'); await p.waitForTimeout(300);
  s = await G(() => ({ msg: document.getElementById('lockMsg').textContent, room: window.__es.room }));
  rec('الرمز الخاطئ لا يفتح القفل', /غير صحيح/.test(s.msg) && s.room === 0, s);
  const setDials = () => G(() => { const g = window.__es, r = g.room, opts = r === 0 ? [0,1,2,3,4,5,6,7,8,9] : ['☀','☾','★','◆','✿','▲']; [0,1,2].forEach(i => { let n = 0; while (document.getElementById('dv' + i).textContent !== String(g.codes[r][i]) && n++ < 12) document.querySelectorAll('.dial')[i].querySelector('.up').click(); }); });
  await setDials(); await p.click('#lockTry');
  await p.waitForFunction(() => window.__es.room === 1 && !window.__es.busy, null, { timeout: 8000 }); await p.waitForTimeout(900);
  await p.screenshot({ path: '/tmp/claude-0/es-room2.png' });
  rec('الرمز الصحيح يفتح الباب وينقل إلى المكتبة', true, '');
  for (const k of [0, 1, 2]) { await clickHs(k); await answer(true); await p.waitForSelector('#clueModal.show', { timeout: 5000 }); await p.click('#clueOk'); }
  await clickHs('lock'); await p.waitForSelector('#lockModal.show'); await setDials(); await p.click('#lockTry');
  await p.waitForFunction(() => window.__es.room === 2 && !window.__es.busy, null, { timeout: 8000 }); await p.waitForTimeout(900);
  await p.screenshot({ path: '/tmp/claude-0/es-room3.png' });
  s = await G(() => document.getElementById('hRoom').textContent);
  rec('قفل الرموز يفتح وينقل إلى سطح البرج', /سطح البرج/.test(s), s);
  for (const k of [0, 1, 2]) { await clickHs(k); await answer(true); await p.waitForSelector('#clueModal.show', { timeout: 5000 }); await p.click('#clueOk'); }
  await clickHs('lock'); await p.waitForSelector('#lockModal.show'); await p.click('#lockTry');
  await p.waitForSelector('#rModal.show', { timeout: 8000 });
  s = await G(() => ({ t: document.getElementById('rTitle').textContent, opened: window.__es.opened, fact: document.querySelector('.cs-fact').textContent }));
  rec('تركيب المفتاح يفتح البوابة: هروب ناجح مع النجوم', /هربت/.test(s.t) && /⭐⭐⭐/.test(s.t) && s.opened === 3, s);
  rec('معلومة عن قلعة جبرين في النهاية', /بهلاء/.test(s.fact), s.fact);
  // انتهاء الوقت
  await p.click('#rActions .btn >> nth=0'); await p.waitForTimeout(800);
  await G(() => { window.__es.left = 0.3; });
  await p.waitForSelector('#rModal.show', { timeout: 5000 });
  s = await G(() => document.getElementById('rTitle').textContent);
  rec('عند انتهاء الوقت: غربت الشمس', /غربت/.test(s), s);
});
