// اختبار «طيّار المعرفة 3D»: شغّل خادمًا محليًا على 8810 ثم: node tests/flight3d.test.js
const run = require('./testlib.js');
run(8810, async ({ p, G, rec }) => {
  try {
    await p.click('#optGoal .chip >> nth=0'); await p.click('#optTime .chip >> nth=0'); await p.click('#optSpeed .chip >> nth=2'); await p.click('#optQuality .chip >> nth=2');
    await p.click('.fl-plane >> nth=1'); await p.click('.pchar >> nth=1'); await p.fill('#stName', 'مريم');
    await p.click('#startGame');
    await p.waitForFunction(() => window.__fl && window.__fl.state === 'intro', null, { timeout: 120000 });
    let s = await G(() => ({ canvas: !!document.querySelector('#flStage canvas'), kind: window.__flyEngine.debug.kind, kid: window.__flyEngine.debug.kid, L: window.__fl.L }));
    rec('تُبنى السماء والساحل والطائرة المختارة', s.canvas && s.kind === 'jet' && /girl/.test(s.kid) && s.L > 3000, s);
    await p.waitForFunction(() => window.__fl.state === 'fly', null, { timeout: 60000 });
    // التحكم بالأسهم
    const a0 = await G(() => ({ x: window.__flyEngine.debug.off, y: window.__flyEngine.debug.alt }));
    await p.keyboard.down('ArrowRight'); await p.keyboard.down('ArrowUp'); await p.waitForTimeout(900); await p.keyboard.up('ArrowRight'); await p.keyboard.up('ArrowUp');
    const a1 = await G(() => ({ x: window.__flyEngine.debug.off, y: window.__flyEngine.debug.alt }));
    rec('الأسهم توجّه الطائرة يمينًا وإلى أعلى', a1.x > a0.x + .5 && a1.y > a0.y + .5, { a0, a1 });
    await p.click('#camBtn'); const cm = await G(() => window.__flyEngine.debug.camMode); await p.click('#camBtn');
    rec('زر الكاميرا يبدّل إلى منظر القمرة', cm === 'cockpit', cm);
    await p.waitForFunction(() => window.__fl.gate, null, { timeout: 90000 }); await p.waitForTimeout(500);
    s = await G(() => ({ show: document.getElementById('qc').classList.contains('show'), ops: document.querySelectorAll('#qcOps span').length, n: window.__fl.gate.n, rings: window.__fl.gate.rings.length }));
    rec('يظهر السؤال وتقترب حلقات بعدد الخيارات', s.show && s.ops === s.n && s.rings === s.n, s);
    await p.screenshot({ path: '/tmp/claude-0/fl-q.png' });
    const steer = (good) => G(g => { const C = window.__fl, E = window.__flyEngine.debug, r = window.__decodeAnswer(C.cur.item._raw); let pos = C.cur.order.indexOf(r); if (!g) pos = (pos + 1) % C.gate.n; const ring = C.gate.rings[pos]; E.off = ring.position.x; E.alt = C.gate.obj.position.y + ring.position.y; return pos; }, good);
    const keep = async (good, n) => { for (let i = 0; i < 60; i++) { if (await G(m => window.__fl.correct + window.__fl.wrong > m, n)) return; await steer(good); await p.waitForTimeout(250); } };
    await keep(true, 0);
    s = await G(() => ({ c: window.__fl.correct, f: window.__fl.fuel, boost: window.__flyEngine.debug.boost }));
    rec('العبور من حلقة الإجابة الصحيحة: دفعة ووقود', s.c === 1 && s.boost > 0, s);
    await p.screenshot({ path: '/tmp/claude-0/fl-ok.png' });
    await p.waitForFunction(() => window.__fl.gate, null, { timeout: 90000 });
    await keep(false, 1);
    s = await G(() => ({ w: window.__fl.wrong, f: window.__fl.fuel, sh: window.__flyEngine.debug.shake, rev: document.getElementById('qc').textContent.includes('الصحيحة هي') }));
    rec('الحلقة الخاطئة: مطبّات ونقص وقود دون كشف الإجابة', s.w === 1 && s.f < 100 && s.sh > 0 && !s.rev, s);
    const wrongId = await G(() => window.__fl.qm.history[window.__fl.qm.history.length - 1]);
    for (let i = 0; i < 14; i++) {
      if (await G(() => window.__fl.state !== 'fly')) break;
      await p.waitForFunction(() => window.__fl.gate || window.__fl.state !== 'fly', null, { timeout: 120000 });
      if (await G(() => !window.__fl.gate)) break;
      const before = await G(() => window.__fl.correct + window.__fl.wrong);
      await keep(true, before);
    }
    s = await G(id => ({ back: window.__fl.qm.history.filter(x => x === id).length, st: window.__fl.state, c: window.__fl.correct }), wrongId);
    rec('يعود السؤال الخاطئ لاحقًا، وبعد الإجابات تتجه الطائرة إلى المطار', s.back >= 2 && /cruise|land|done/.test(s.st), s);
    await p.evaluate(() => { const E = window.__flyEngine.debug; E.pos.z = -(window.__fl.L - 1510); });
    await p.waitForFunction(() => window.__flyEngine.debug.state === 'land', null, { timeout: 60000 });
    await p.evaluate(() => { const E = window.__flyEngine.debug; E.pos.z = E.geo.air.z0 - 150; E.pos.x = E.geo.air.x; });
    await p.waitForFunction(() => window.__flyEngine.debug.landed, null, { timeout: 180000 });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: '/tmp/claude-0/fl-land.png' });
    await p.waitForSelector('#rModal.show', { timeout: 60000 });
    s = await G(() => ({ t: document.getElementById('rTitle').textContent, rows: document.querySelectorAll('#rTable .vt-row').length }));
    rec('الهبوط في المطار ثم شاشة النتيجة باسم الطالب', /مريم/.test(s.t) && /مطار مسقط/.test(s.t) && s.rows >= 6, s);
    await p.click('#rActions .btn >> nth=0');
    await p.waitForFunction(() => window.__fl && window.__fl.state === 'intro', null, { timeout: 120000 });
    s = await G(() => ({ c: window.__fl.correct, f: window.__fl.fuel, z: window.__flyEngine.debug.pos.z }));
    rec('«العب مرة أخرى» يبدأ رحلة جديدة', s.c === 0 && s.f === 100 && Math.abs(s.z) < 5, s);
    await p.evaluate(() => { window.__fl.fuel = 10; }); await p.waitForFunction(() => window.__fl.state === 'fly', null, { timeout: 60000 });
    await p.evaluate(() => window.__flyEngine.debug.onHit('balloon'));
    await p.waitForFunction(() => window.__flyEngine.debug.state === 'crash', null, { timeout: 20000 });
    await p.waitForSelector('#rModal.show', { timeout: 90000 });
    s = await G(() => document.getElementById('rTitle').textContent);
    rec('نفاد الوقود: هبوط اضطراري ثم إعادة المحاولة', /نفد الوقود/.test(s), s);
    await p.click('#rActions .btn >> nth=1'); await p.waitForTimeout(400);
    s = await G(() => document.getElementById('home').classList.contains('active'));
    rec('الخروج يعيد إلى شاشة اختيار الطائرة', s, s);
  } finally { await p.close(); }
});
