// اختبار «سباق الجمال»: شغّل خادمًا محليًا على 8765 ثم: node tests/camel.test.js
const { chromium } = require('playwright');
const URL = 'http://localhost:8766/index.html#g=g04&s=0&m=0&u=0&l=0.1.2.3.4.5';
const results = []; const rec = (name, pass, info) => results.push({ name, pass, info });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('.stage');
  const G = (fn, a) => p.evaluate(fn, a);
  let s = await G(() => ({ title: document.getElementById('homeTitle').textContent, how: !document.querySelector('[data-how="camel"]').hidden }));
  rec('شاشة البداية خاصة بسباق الجمال', s.how && /لعبة/.test(s.title), s);
  await G(() => window.__startStage(0));
  await p.waitForTimeout(300);
  s = await G(() => ({ k: window.__game.kind, st: window.__game.state, rank: document.getElementById('hRankPill').hidden, time: document.getElementById('hTimePill').hidden, left: getComputedStyle(document.querySelector('.pad-left')).visibility }));
  rec('يبدأ السباق بعدّ تنازلي ويظهر مؤشر المركز', s.k === 'camel' && s.st === 'countdown' && !s.rank && s.time, s);
  await p.waitForTimeout(3600);
  s = await G(() => window.__game.state);
  rec('بعد العد التنازلي ينطلق السباق', s === 'play', s);
  // الوصول لبئر الأسئلة
  await G(() => { const g = window.__game; g.player.dist = g.stations[0].x - 5; });
  await p.waitForTimeout(400);
  s = await G(() => ({ st: window.__game.state, shown: window.__game.qm.stats.shown, modal: document.getElementById('qModal').classList.contains('show') }));
  rec('عند بئر الأسئلة يتوقف السباق ويظهر سؤال واحد', s.st === 'question' && s.shown === 1 && s.modal, s);
  const r0 = await G(() => window.__game.rivals.map(r => r.dist).join());
  await p.waitForTimeout(800);
  const r1 = await G(() => window.__game.rivals.map(r => r.dist).join());
  rec('المتسابقون لا يتحركون أثناء السؤال', r0 === r1, { r0, r1 });
  // إجابة خاطئة
  await G(() => { const cur = window.__game.qm.current, r = window.__decodeAnswer(cur.item._raw); [...document.querySelectorAll('#qOpts .opt')].find(o => +o.dataset.choice !== r).click(); });
  await p.click('#qConfirm');
  await p.waitForSelector('#qModal:not(.show)', { state: 'attached', timeout: 4000 }); await p.waitForTimeout(300);
  s = await G(() => ({ st: window.__game.state, lives: window.__game.lives, shown: window.__game.qm.stats.shown, good: document.querySelectorAll('#qOpts .opt.good').length }));
  rec('الخطأ: روح واحدة، دون كشف الإجابة، ودون سؤال إضافي', s.st === 'play' && s.lives === 2 && s.shown === 1 && s.good === 0, s);
  // إجابة صحيحة = اندفاع
  await G(() => { const g = window.__game; g.player.dist = g.stations[1].x - 5; });
  await p.waitForTimeout(400);
  await G(() => { const cur = window.__game.qm.current, r = window.__decodeAnswer(cur.item._raw); [...document.querySelectorAll('#qOpts .opt')].find(o => +o.dataset.choice === r).click(); });
  await p.click('#qConfirm');
  await p.waitForSelector('#qModal:not(.show)', { state: 'attached', timeout: 4000 }); await p.waitForTimeout(200);
  s = await G(() => ({ boost: window.__game.player.boost > 0, v: window.__game.playerSpeed(), lives: window.__game.lives }));
  rec('الإجابة الصحيحة تمنح اندفاعًا ولا تخصم روحًا', s.boost && s.v > 12 && s.lives === 2, s);
  // العائق يسبب تعثرًا
  await G(() => { const g = window.__game, o = g.obstacles.find(o => !o.hit && o.x > g.player.dist + 60); g.player.dist = o.x - 30; g.player.invuln = 0; g.player.y = 0; g.player.onGround = true; });
  await p.waitForTimeout(250);
  s = await G(() => ({ slow: window.__game.player.slow > 0, lives: window.__game.lives }));
  rec('الاصطدام بعائق يسبب تعثّرًا دون خسارة روح', s.slow && s.lives === 2, s);
  // خط النهاية
  await G(() => { const g = window.__game; g.stations.forEach(st => st.done = true); g.player.dist = g.lengthM * 20 - 3; });
  await p.waitForTimeout(2300);
  s = await G(() => ({ st: window.__game.state, title: document.getElementById('rTitle').textContent, stats: document.getElementById('rStats').innerText, prog: Object.keys(localStorage).filter(k => k.startsWith('edu-progress:camel')).length }));
  rec('خط النهاية: شاشة نتائج بالمركز وحفظ التقدم', s.st === 'clear' && /المركز/.test(s.stats) && s.prog === 1, s);
  // نفاد الأرواح
  await G(() => window.__startStage(1)); await p.waitForTimeout(3800);
  for (let i = 0; i < 3; i++) {
    await G(i => { const g = window.__game; const st = g.stations.find(s => !s.done); g.player.dist = st.x - 5; }, i);
    await p.waitForSelector('#qModal.show', { timeout: 3000 });
    await G(() => { const cur = window.__game.qm.current, r = window.__decodeAnswer(cur.item._raw); [...document.querySelectorAll('#qOpts .opt')].find(o => +o.dataset.choice !== r).click(); });
    await p.click('#qConfirm');
    await p.waitForSelector('#qModal:not(.show)', { state: 'attached', timeout: 4000 }); await p.waitForTimeout(300);
  }
  s = await G(() => ({ st: window.__game.state, title: document.getElementById('rTitle').textContent }));
  rec('صفر أرواح ← انتهاء المحاولة', s.st === 'over' && /انتهت/.test(s.title), s);
  rec('لا أخطاء JavaScript', errs.length === 0, errs);
  await b.close();
  results.forEach(r => console.log((r.pass ? '✅ نجح' : '❌ يحتاج إصلاح') + ' — ' + r.name + (r.pass ? '' : '  ' + JSON.stringify(r.info))));
  process.exit(results.every(r => r.pass) ? 0 : 1);
})();
