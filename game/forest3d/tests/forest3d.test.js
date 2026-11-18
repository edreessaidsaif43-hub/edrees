// اختبار «غابة الهدوء 3D»: node tests/forest3d.test.js  (يحتاج Playwright)
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '../index.html');
const res = []; const rec = (n, ok, d) => { res.push(ok); console.log((ok ? '✅ نجح — ' : '❌ يحتاج إصلاح — ') + n + (ok ? '' : '  ' + JSON.stringify(d))); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => errs.push(e.message));
  const G = (f, a) => p.evaluate(f, a);
  try {
    await p.goto(URL); await p.waitForFunction(() => window.__forest, null, { timeout: 120000 });
    rec('شاشة البداية تظهر مع الإعدادات', await G(() => document.getElementById('start').classList.contains('show') && document.querySelectorAll('.chip').length >= 14), null);
    await p.fill('#className', 'الخامس / 2'); await p.click('#optRet .chip >> nth=0'); await p.click('#optDur .chip >> nth=1');
    await p.click('#goManual'); await p.waitForTimeout(800);
    let s = await G(() => ({ hud: document.getElementById('hud').classList.contains('show'), c: __forest.counts(), cls: document.getElementById('hClass').textContent, t: document.getElementById('hTime').textContent }));
    rec('تبدأ الحصة والغابة مكتملة واسم الصف ظاهر', s.hud && s.c.here === s.c.tot && s.c.tot >= 20 && /الخامس/.test(s.cls) && /10:00|09:5/.test(s.t), s);
    await p.keyboard.down('KeyN'); await p.waitForFunction(() => __forest.counts().here < 22, null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(700);
    s = await G(() => ({ here: __forest.counts().here, al: __forest.debug.alert, shh: document.getElementById('shh').classList.contains('on'), b: document.getElementById('banner').textContent, fl: __forest.debug.agents.filter(a => a.state === 'flee').length }));
    await p.screenshot({ path: '/tmp/claude-0/ft-flee.png' });
    rec('الضجيج: تنتبه الحيوانات ثم تهرب مع رسالة', s.here < 22 && s.al > .4 && s.shh && /هرب|هربت/.test(s.b), s);
    await p.keyboard.up('KeyN'); await p.waitForTimeout(600);
    const n0 = await G(() => __forest.counts().here);
    await G(() => { __calm.quietT = 30; __calm.lastRet = -99; }); await p.waitForTimeout(700);
    s = await G(() => ({ here: __forest.counts().here, enter: __forest.debug.agents.filter(a => a.state === 'enter').length, b: document.getElementById('banner').textContent }));
    rec('الهدوء يعيد الحيوانات واحدًا تلو الآخر', s.enter > 0 && /عاد/.test(s.b), { n0, s });
    await p.click('#bTalk'); await p.keyboard.down('KeyN'); await p.waitForTimeout(2500); await p.keyboard.up('KeyN');
    s = await G(() => ({ fl: __calm.flees, talk: __calm.talk, tag: document.getElementById('talkTag').classList.contains('on') }));
    const fl0 = s.fl; await p.click('#bTalk');
    rec('«المعلم يشرح» يوقف الاستماع فلا تهرب الحيوانات', s.talk && s.tag && s.fl === await G(() => __calm.flees), s);
    await p.click('#bReturn'); await p.waitForTimeout(3000);
    rec('زر «أعِدها» يعيد كل الحيوانات', await G(() => __forest.counts().here === __forest.counts().tot), await G(() => __forest.counts()));
    await G(() => { __calm.streak = 119; __calm.sStars = 0; __calm.stars = 0; __calm.H = 0; }); await p.waitForFunction(() => __calm.stars > 0, null, { timeout: 20000 }).catch(() => {});
    s = await G(() => ({ st: __calm.stars, b: document.getElementById('banner').textContent }));
    rec('نجمة هدوء بعد دقيقتين دون هروب', s.st === 1 && /نجمة/.test(s.b), s);
    await G(() => { __calm.streak = 400; __calm.leoDone = false; }); await p.waitForTimeout(700);
    s = await G(() => ({ leo: __forest.hasLeopard(), b: document.getElementById('banner').textContent }));
    rec('الهدوء الطويل والغابة مكتملة: زيارة النمر العربي', s.leo && /النمر/.test(s.b), s);
    await G(() => { const a = __forest.debug.agents.find(a => a.c.id === 'leo'); a.d = a.L - 4; }); await p.waitForFunction(() => __forest.debug.agents.find(a => a.c.id === 'leo').state === 'idle', null, { timeout: 90000 });
    await p.waitForTimeout(800); await p.screenshot({ path: '/tmp/claude-0/ft-leo.png' });
    await p.keyboard.press('Space'); const ps = await G(() => __calm.paused); await p.keyboard.press('Space');
    rec('المسافة توقف الحصة مؤقتًا وتستأنفها', ps === true && await G(() => !__calm.paused), ps);
    await p.click('#bSensUp'); rec('أزرار الحساسية تعمل', await G(() => document.getElementById('bSens').textContent === '6'), null);
    await p.click('#bSensDn');
    await p.click('#bEnd'); await p.waitForTimeout(600);
    s = await G(() => ({ rep: document.getElementById('report').classList.contains('show'), cards: document.querySelectorAll('#rCards .card').length, msg: document.getElementById('rMsg').textContent }));
    await p.screenshot({ path: '/tmp/claude-0/ft-report.png' });
    rec('«إنهاء» يعرض تقرير الحصة مع الرسم البياني', s.rep && s.cards === 8 && s.msg.length > 10, s);
    await p.click('#rAgain'); await p.waitForTimeout(400);
    rec('«حصة جديدة» يعود إلى شاشة البداية', await G(() => document.getElementById('start').classList.contains('show')), null);
    // الميكروفون (جهاز صوت وهمي)
    await p.click('#goMic'); await p.waitForSelector('#calib.show', { timeout: 10000 });
    await p.waitForFunction(() => !document.getElementById('calib').classList.contains('show'), null, { timeout: 15000 });
    await p.waitForTimeout(1500);
    s = await G(() => ({ L: __calm.L, manual: __calm.manual, hud: document.getElementById('hud').classList.contains('show') }));
    rec('وضع الميكروفون: معايرة ثم استماع', !s.manual && s.hud && typeof s.L === 'number' && !isNaN(s.L), s);
  } catch (e) { rec('تنفيذ الاختبار دون استثناء', false, e.message); } finally { await p.close(); }
  // البيئات الخمس: الهروب الكامل والعودة والزائر النادر
  const q = await b.newPage({ viewport: { width: 1000, height: 560 } }); q.on('pageerror', e => errs.push(e.message));
  try {
    await q.goto(URL + '?auto=1'); await q.waitForFunction(() => window.__calm && window.__forest, null, { timeout: 120000 });
    rec('بطاقات البيئات الخمس في شاشة البداية', await q.evaluate(() => ForestEngine.SCENES.length === 5 && document.querySelectorAll('#scenePick .scn').length === 5), null);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      if (i) { await q.click('#bScene', { force: true }); await q.waitForFunction(n => window.__forest.sceneInfo.id !== n && !document.getElementById('swap').classList.contains('on'), seen[seen.length - 1], { timeout: 60000 }); }
      const id = await q.evaluate(() => __forest.sceneInfo.id); seen.push(id);
      const r = await q.evaluate(async () => {
        const F = __forest, E = F.debug, st = F.counts(); __calm.paused = true;
        let n = 0; while (F.fleeNext()) n++;
        const tick = () => new Promise(res => setTimeout(res, 60));
        for (let k = 0; k < 400; k++) { E.agents.forEach(a => { if (a.state === 'flee' && a.startle <= 0) a.d = Math.max(a.d, a.L - .05); }); await tick(); if (E.agents.every(a => a.state === 'gone' || a.state === 'hidden')) break; }
        const empty = F.counts().here;
        F.returnAll(); for (let k = 0; k < 600; k++) { E.agents.forEach(a => { if (a.state === 'enter') a.d = Math.max(a.d, a.L - .05); }); await tick(); if (E.agents.every(a => a.state !== 'enter')) break; }
        const full = F.counts();
        const v = F.leopardVisit(); for (let k = 0; k < 600; k++) { E.agents.forEach(a => { if (a.state === 'enter') a.d = Math.max(a.d, a.L - .05); }); await tick(); if (E.agents.every(a => a.state !== 'enter')) break; }
        const rare = F.hasLeopard(); __calm.paused = false;
        return { st, n, empty, full, v, rare, title: document.getElementById('hClass').textContent, em: document.querySelectorAll('#hEm span').length, groups: F.counts().groups };
      });
      await q.screenshot({ path: '/tmp/claude-0/ft-scene-' + id + '.png' });
      rec('البيئة «' + r.title.split('•')[0].trim() + '»: تهرب كل الحيوانات ثم تعود ويزورها الحيوان النادر', r.st.here === r.st.tot && r.st.tot >= 10 && r.n === r.groups && r.empty === 0 && r.full.here === r.full.tot && r.v && r.rare && r.em === r.groups, r);
    }
    rec('زر «البيئة» يتنقّل بين البيئات الخمس', new Set(seen).size === 5, seen);
  } catch (e) { rec('اختبار البيئات دون استثناء', false, e.message); } finally { await q.close(); }
  const m = await b.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true }); m.on('pageerror', e => errs.push(e.message));
  await m.goto(URL); await m.waitForTimeout(2500);
  rec('يعمل على الهاتف دون تمرير أفقي', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), null);
  await m.screenshot({ path: '/tmp/claude-0/ft-mobile.png' });
  await m.close();
  rec('لا أخطاء JavaScript', errs.length === 0, errs);
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
