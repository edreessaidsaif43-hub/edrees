// اختبار «عدّاء الكورنيش 3D»: شغّل خادمًا محليًا على 8809 ثم: node tests/corniche3d.test.js
const run = require('./testlib.js');
run(8809, async ({ p, G, rec }) => {
  try {
  await p.click('#optGoal .chip >> nth=0');    // 8 إجابات
  await p.click('#optTime .chip >> nth=0');    // 10 ثوانٍ
  await p.click('#optSpeed .chip >> nth=2');   // سريعة
  await p.click('#optHearts .chip >> nth=0');  // 3 قلوب
  await p.click('#optQuality .chip >> nth=2'); // خفيفة
  await p.click('.pchar >> nth=2');            // الطالب
  await p.fill('#stName', 'سالم');
  await p.click('#startGame');
  await p.waitForFunction(() => window.__cr && window.__cr.state === 'intro', null, { timeout: 60000 });
  let s = await G(() => ({ canvas: !!document.querySelector('#crStage canvas'), kid: window.__runEngine.debug.kidType, cars: window.__runEngine.debug.vehicles.length }));
  rec('يُبنى الكورنيش والعدّاء المختار وحركة السير', s.canvas && s.kid === 'boy' && s.cars >= 6, s);
  await p.waitForFunction(() => window.__cr.state === 'run', null, { timeout: 60000 });
  // التحكم: الأسهم والقفز
  s = await G(() => window.__runEngine.debug.lane);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150);
  const l1 = await G(() => window.__runEngine.debug.lane);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  const l2 = await G(() => window.__runEngine.debug.lane);
  await p.keyboard.press('ArrowUp'); await p.waitForTimeout(120);
  const jy = await G(() => window.__runEngine.debug.y);
  rec('الأسهم تنقل العدّاء بين المسارات والسهم الأعلى يقفز', l1 === s + 1 && l2 === s - 1 && jy > 0, { s, l1, l2, jy });
  // السؤال الأول وبوابته
  await p.waitForFunction(() => window.__cr.gate, null, { timeout: 60000 });
  await p.waitForTimeout(600);
  s = await G(() => ({ show: document.getElementById('qc').classList.contains('show'), text: document.getElementById('qcText').textContent.length, ops: document.querySelectorAll('#qcOps span').length, n: window.__cr.gate.n, panels: window.__cr.gate.obj.userData.panels.length }));
  rec('يظهر السؤال وتقترب بوابة بعدد الخيارات', s.show && s.text > 3 && s.ops === s.n && s.panels === s.n, s);
  await p.screenshot({ path: '/tmp/claude-0/cr-q.png' });
  const steer = async (good) => G(g => { const C = window.__cr, r = window.__decodeAnswer(C.cur.item._raw); let pos = C.cur.order.indexOf(r); if (!g) pos = (pos + 1) % C.gate.n; window.__runEngine.lane(C.gate.n === 2 ? pos * 2 : pos); return pos; }, good);
  await steer(true);
  await p.waitForFunction(() => window.__cr.correct === 1, null, { timeout: 60000 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: '/tmp/claude-0/cr-ok.png' });
  s = await G(() => ({ c: window.__cr.coins, boost: window.__runEngine.debug.boost, fill: document.getElementById('pFill').style.width }));
  rec('دخول بوابة الإجابة الصحيحة: عملات ودفعة سرعة وتقدّم نحو القلعة', s.c >= 5 && s.boost > 0 && s.fill !== '0%', s);
  // الإجابة الخاطئة
  await p.waitForFunction(() => window.__cr.gate, null, { timeout: 60000 });
  await steer(false);
  await p.waitForFunction(() => window.__cr.wrong === 1, null, { timeout: 60000 });
  s = await G(() => ({ h: window.__cr.hearts, hud: document.getElementById('hHearts').textContent, st: window.__runEngine.debug.stumble, cards: document.getElementById('qc').textContent.includes('الإجابة الصحيحة هي') }));
  await p.screenshot({ path: '/tmp/claude-0/cr-bad.png' });
  rec('البوابة الخاطئة: تعثّر وخسارة قلب دون كشف الإجابة', s.h === 2 && /🤍/.test(s.hud) && s.st > 0 && !s.cards, s);
  // السؤال الخاطئ يعود لاحقًا
  const wrongId = await G(() => window.__cr.qm.history[window.__cr.qm.history.length - 1]);
  for (let i = 0; i < 14; i++) {
    if (await G(() => window.__cr.over || window.__cr.state === 'fort')) break;
    await p.waitForFunction(() => window.__cr.gate || window.__cr.state === 'fort' || window.__cr.over, null, { timeout: 60000 });
    if (await G(() => !window.__cr.gate)) break;
    const before = await G(() => window.__cr.correct + window.__cr.wrong);
    await steer(true);
    await p.waitForFunction(n => window.__cr.correct + window.__cr.wrong > n, before, { timeout: 60000 });
  }
  s = await G(id => ({ back: window.__cr.qm.history.filter(x => x === id).length, st: window.__cr.state, c: window.__cr.correct }), wrongId);
  rec('يعود السؤال الخاطئ بعد أسئلة أخرى، وتنتهي الإجابات بالوصول إلى القلعة', s.back >= 2 && (s.st === 'fort' || s.st === 'finish'), s);
  await p.waitForFunction(() => window.__runEngine.debug.finished, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/claude-0/cr-fort.png' });
  await p.waitForSelector('#rModal.show', { timeout: 30000 });
  await p.screenshot({ path: '/tmp/claude-0/cr-end.png' });
  s = await G(() => ({ t: document.getElementById('rTitle').textContent, rows: document.querySelectorAll('#rTable .vt-row').length }));
  rec('شاشة النتيجة باسم الطالب والنجوم والعملات', /سالم/.test(s.t) && /القلعة/.test(s.t) && s.rows >= 6, s);
  await p.click('#rActions .btn >> nth=0');
  await p.waitForFunction(() => window.__cr && window.__cr.state === 'intro', null, { timeout: 60000 });
  s = await G(() => ({ c: window.__cr.correct, h: window.__cr.hearts, d: window.__runEngine.debug.dist, g: window.__runEngine.debug.gates.length }));
  rec('«العب مرة أخرى» يبدأ جريًا جديدًا', s.c === 0 && s.h === 3 && s.d < 5 && s.g === 0, s);
  await p.click('#exitBtn'); await p.waitForTimeout(300);
  s = await G(() => document.getElementById('home').classList.contains('active'));
  rec('الخروج يعيد إلى شاشة اختيار العدّاء', s, s);
  } finally { await p.close(); } // تحرير المعالج قبل اختبار الهاتف
});
