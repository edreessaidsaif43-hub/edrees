// اختبار منطق اللعب في المتصفح: شغّل خادمًا محليًا على 8765 ثم: node tests/browser.test.js
const { chromium } = require('playwright');
const URL = 'http://localhost:8765/index.html#g=g04&s=0&m=0&u=0&l=0.1.2.3.4.5';
const results = [];
function rec(name, pass, info) { results.push({ name, pass, info }); }

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('.stage');
  const start = async (i = 0) => { await p.evaluate(i => window.__startStage(i), i); await p.waitForTimeout(300); };
  const G = (fn, arg) => p.evaluate(fn, arg);
  const answer = async (correct) => {
    await p.waitForSelector('#qModal.show');
    await G(c => {
      const cur = window.__game.qm.current, r = window.__decodeAnswer(cur.item._raw);
      const opts = [...document.querySelectorAll('#qOpts .opt')];
      const t = opts.find(o => (+o.dataset.choice === r) === c); t.click();
    }, correct);
    await p.click('#qConfirm');
    await p.click('#qConfirm', { force: true }).catch(() => {}); // نقرة مكررة يجب تجاهلها
    await p.waitForSelector('#qModal:not(.show)', { state: 'attached', timeout: 4000 });
  };
  const collectCoin = () => G(() => {
    const g = window.__game, pl = g.player, c = g.level.coins.find(c => !c.taken);
    c.x = pl.x + pl.w / 2; c.y = pl.y + pl.h / 2;
  });

  // 1) 5 ذهبيات = سؤال واحد فقط
  await start(0);
  await G(() => { window.__game.coins = 4; });
  await collectCoin(); await p.waitForTimeout(200);
  let s = await G(() => ({ st: window.__game.state, shown: window.__game.qm.stats.shown, modal: document.getElementById('qModal').classList.contains('show') }));
  rec('الحالة 1: جمع 5 ذهبيات يوقف اللعب ويظهر سؤال واحد', s.st === 'question' && s.shown === 1 && s.modal, s);

  // توقف الحركة أثناء السؤال
  const before = await G(() => ({ x: window.__game.player.x, t: window.__game.timeLeft, e: window.__game.level.enemies.map(e => e.x).join() }));
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(900); await p.keyboard.up('ArrowRight');
  const after = await G(() => ({ x: window.__game.player.x, t: window.__game.timeLeft, e: window.__game.level.enemies.map(e => e.x).join() }));
  rec('أثناء السؤال: لا تتحرك الشخصية ولا الأعداء ويتوقف المؤقت', before.x === after.x && before.t === after.t && before.e === after.e, { before, after });

  // 3) إجابة خاطئة: روح واحدة، لا كشف للإجابة، لا سؤال إضافي
  const wrongId = await G(() => window.__game.qm.current.item.id);
  await p.waitForSelector('#qModal.show');
  await G(() => { const cur = window.__game.qm.current, r = window.__decodeAnswer(cur.item._raw); [...document.querySelectorAll('#qOpts .opt')].find(o => +o.dataset.choice !== r).click(); });
  await p.click('#qConfirm');
  await p.waitForTimeout(300);
  const reveal = await G(() => ({ good: document.querySelectorAll('#qOpts .opt.good').length, fb: document.getElementById('qFeedback').textContent }));
  await p.waitForSelector('#qModal:not(.show)', { state: 'attached', timeout: 4000 }); await p.waitForTimeout(300);
  s = await G(() => ({ lives: window.__game.lives, st: window.__game.state, shown: window.__game.qm.stats.shown, modal: document.getElementById('qModal').classList.contains('show') }));
  rec('الحالة 3: الخطأ يخصم روحًا واحدة ولا يكشف الإجابة ولا يظهر سؤال إضافي', s.lives === 2 && s.st === 'play' && s.shown === 1 && !s.modal && reveal.good === 0 && !/الصحيحة هي/.test(reveal.fb), { s, reveal });

  // 2) إجابة صحيحة لا تخصم روحًا + منع النقر المزدوج
  await G(() => { window.__game.coins = 9; }); await collectCoin(); await p.waitForTimeout(200);
  const correctId = await G(() => window.__game.qm.current.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة', correctId !== wrongId, { correctId, wrongId });
  await answer(true); await p.waitForTimeout(200);
  s = await G(() => ({ lives: window.__game.lives, correct: window.__game.qm.stats.correct, score: window.__game.score }));
  rec('الحالة 2: الإجابة الصحيحة لا تخصم روحًا وتُحتسب مرة واحدة', s.lives === 2 && s.correct === 1, s);

  // 5) السقوط في حفرة → روح + سؤال → العودة لنقطة الحفظ
  const cp = await G(() => { const g = window.__game, c = g.level.checkpoints[0]; g.player.x = c.x + 5; g.player.y = c.y - 40; return c.x; });
  await p.waitForTimeout(300);
  const respawn = await G(() => window.__game.respawn.x);
  await G(() => { const g = window.__game; g.player.x += 300; g.player.y = 600; });
  await p.waitForTimeout(1300);
  s = await G(() => ({ st: window.__game.state, lives: window.__game.lives }));
  rec('الحالة 5أ: السقوط يخصم روحًا ويُظهر سؤالًا', s.st === 'question' && s.lives === 1, s);
  await answer(true); await p.waitForTimeout(200);
  s = await G(() => ({ x: window.__game.player.x, st: window.__game.state, lives: window.__game.lives }));
  rec('الحالة 5ب: بعد السؤال يعود اللاعب لآخر نقطة حفظ', Math.abs(s.x - respawn) < 2 && s.st === 'play' && Math.abs(respawn - cp) < 40, { s, respawn, cp });

  // 6) الاصطدام بعدو → روح + سؤال واحد
  await start(2);
  await p.waitForTimeout(200);
  await G(() => { const g = window.__game, pl = g.player; g.level.enemies.push({ type: 'walker', x: pl.x + 2, y: pl.y + 4, w: 26, h: 24, vx: 0, alive: true, minX: 0, maxX: 99999 }); pl.vy = 0; });
  await p.waitForTimeout(1300);
  s = await G(() => ({ st: window.__game.state, lives: window.__game.lives, shown: window.__game.qm.stats.shown }));
  rec('الحالة 6: الاصطدام بعدو يخصم روحًا ويظهر سؤال واحد', s.st === 'question' && s.lives === 2 && s.shown === 1, s);
  // خطأ بعد سؤال الموت: روح واحدة فقط ولا سؤال جديد
  await answer(false); await p.waitForTimeout(300);
  s = await G(() => ({ st: window.__game.state, lives: window.__game.lives, shown: window.__game.qm.stats.shown }));
  rec('منع الحلقة: الخطأ في سؤال الروح يخصم روحًا دون سؤال جديد', s.st === 'play' && s.lives === 1 && s.shown === 1, s);

  // 7) نفاد الأرواح
  await G(() => { const g = window.__game; g.player.y = 700; });
  await p.waitForTimeout(1400);
  s = await G(() => ({ st: window.__game.state, title: document.getElementById('rTitle').textContent, modal: document.getElementById('rModal').classList.contains('show'), btns: [...document.querySelectorAll('#rActions button')].map(b => b.textContent) }));
  rec('الحالة 7: صفر أرواح → شاشة انتهاء المحاولة وزر الإعادة', s.st === 'over' && s.modal && s.btns.some(t => t.includes('إعادة')), s);

  // 10) إعادة المرحلة = جلسة أسئلة جديدة و3 أرواح
  await p.click('#rActions button >> nth=0'); await p.waitForTimeout(300);
  s = await G(() => ({ lives: window.__game.lives, shown: window.__game.qm.stats.shown, coins: window.__game.coins }));
  rec('الحالة 10: إعادة المحاولة تبدأ بـ 3 أرواح وجلسة أسئلة جديدة', s.lives === 3 && s.shown === 0 && s.coins === 0, s);

  // 8) أسئلة المرحلة من درسها فقط
  s = await G(() => { const g = window.__game; return g.qm.items.every(i => i.lesson === g.stage.lesson.n) && g.qm.items.length === g.stage.lesson.qs.length; });
  rec('الحالة 8: بنك المرحلة مأخوذ من درسها فقط', s, s);

  // إنهاء المرحلة + الحفظ المحلي
  await G(() => { const g = window.__game; g.player.x = g.level.goal.x + 30; g.player.y = g.level.goal.y - 40; });
  await p.waitForTimeout(2200);
  s = await G(() => ({ st: window.__game.state, title: document.getElementById('rTitle').textContent, stats: document.getElementById('rStats').innerText, prog: Object.keys(localStorage).filter(k => k.startsWith('edu-progress')).map(k => localStorage.getItem(k)) }));
  rec('نهاية المرحلة تعرض النتائج وتحفظ التقدم محليًا', s.st === 'clear' && /نسبة/.test(s.stats) && s.prog.some(v => v.includes('"2":true')), s);

  // الصوت
  const m1 = await G(() => window.Sound.isMuted());
  await p.click('#play .sound-btn');
  const m2 = await G(() => window.Sound.isMuted());
  rec('زر تشغيل/كتم الصوت', m1 !== m2, { m1, m2 });

  // الهاتف: أزرار اللمس ظاهرة ولا تغطي الشخصية
  const ctx2 = await b.newContext({ viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true });
  const m = await ctx2.newPage(); await m.goto(URL); await m.waitForSelector('.stage');
  await m.evaluate(() => window.__startStage(0)); await m.waitForTimeout(500);
  const tinfo = await m.evaluate(() => {
    const t = document.getElementById('touch'), r = [...document.querySelectorAll('.tbtn')].map(b => b.getBoundingClientRect());
    const g = window.__game, cv = document.getElementById('gameCanvas').getBoundingClientRect();
    const px = (g.player.x - g.camX) * g.scale, py = g.player.y * g.scale + cv.top, pr = { l: px, r: px + g.player.w * g.scale, t: py, b: py + g.player.h * g.scale };
    const overlap = r.some(b => !(b.right < pr.l || b.left > pr.r || b.bottom < pr.t || b.top > pr.b));
    return { show: getComputedStyle(t).display !== 'none', overlap, scroll: document.documentElement.scrollWidth > innerWidth };
  });
  // تحريك باللمس
  const x0 = await m.evaluate(() => window.__game.player.x);
  const rb = await m.$('.tbtn[data-k="right"]'); const bb = await rb.boundingBox();
  await m.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await m.mouse.down(); await m.waitForTimeout(600); await m.mouse.up();
  const x1 = await m.evaluate(() => window.__game.player.x);
  await m.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/mobile.png' : '/tmp/mobile.png' });
  rec('الهاتف: أزرار لمس ظاهرة، لا تحجب الشخصية، وتحرك اللاعب', tinfo.show && !tinfo.overlap && x1 > x0 + 20 && !tinfo.scroll, { tinfo, x0, x1 });

  rec('لا أخطاء JavaScript', errs.length === 0, errs);
  await b.close();
  results.forEach(r => console.log((r.pass ? '✅ نجح' : '❌ يحتاج إصلاح') + ' — ' + r.name + (r.pass ? '' : '  ' + JSON.stringify(r.info))));
  require('fs').writeFileSync(require('path').join(__dirname, 'last-results.json'), JSON.stringify(results, null, 1));
  process.exit(results.every(r => r.pass) ? 0 : 1);
})();
