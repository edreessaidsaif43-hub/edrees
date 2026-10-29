// اختبار «من سيربح الدرس؟»: شغّل خادمًا محليًا على 8768 ثم: node tests/ladder.test.js
const { chromium } = require('playwright');
const URL = 'http://localhost:8768/index.html#g=g04&s=0&m=0&u=0&l=0.1.2';
const results = []; const rec = (name, pass, info) => results.push({ name, pass, info });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('#startGame');
  await p.fill('#pname', 'فريق النجوم');
  await p.click('#startGame'); await p.waitForTimeout(300);
  const G = (fn, a) => p.evaluate(fn, a);
  const choose = async (correct) => {
    await G(c => { const L = window.__lad, r = window.__decodeAnswer(L.cur.item._raw); [...document.querySelectorAll('#opts .lopt:not(.gone)')].find(x => (+x.dataset.choice === r) === c).click(); }, correct);
    await p.click('#confirmBtn');
  };
  let s = await G(() => ({ st: window.__lad.state, n: window.__lad.L.pts.length, type: window.__lad.cur.item.type, now: document.querySelector('.rung.now .rp').textContent }));
  rec('يبدأ السلّم من الدرجة الأولى (15 درجة) بسؤال صح/خطأ', s.st === 'ask' && s.n === 15 && s.type === 'tf' && s.now === '100', s);
  await G(() => document.querySelector('#opts .lopt').click());
  s = await G(() => window.__lad.state);
  rec('اختيار خيار لا يُحتسب قبل «تأكيد الإجابة النهائية»', s === 'ask', s);
  await choose(true); await p.waitForTimeout(1600);
  s = await G(() => ({ step: window.__lad.step, fb: document.getElementById('feedback').textContent }));
  rec('الإجابة الصحيحة ترفع درجة', s.step === 1 && /صحيحة/.test(s.fb), s);
  await p.waitForFunction(() => window.__lad.state === 'ask', null, { timeout: 5000 });
  const wid = await G(() => window.__lad.cur.item.id);
  await choose(false); await p.waitForTimeout(1600);
  s = await G(() => ({ step: window.__lad.step, lives: window.__lad.lives, good: document.querySelectorAll('#opts .good').length, fb: document.getElementById('feedback').textContent }));
  rec('الخطأ: محاولة واحدة أقل، دون نزول الدرجة ودون كشف الإجابة', s.step === 1 && s.lives === 2 && s.good === 0 && /لاحقًا/.test(s.fb), s);
  await p.waitForFunction(() => window.__lad.state === 'ask', null, { timeout: 5000 });
  s = await G(() => window.__lad.cur.item.id);
  rec('السؤال الخاطئ لا يُعاد مباشرة', s !== wid, { s, wid });
  // تغيير السؤال
  const before = await G(() => ({ id: window.__lad.cur.item.id, shown: window.__lad.qm.stats.shown }));
  await p.click('#llSwap'); await p.waitForTimeout(200);
  s = await G(() => ({ id: window.__lad.cur.item.id, shown: window.__lad.qm.stats.shown, used: window.__lad.used.s, dis: document.getElementById('llSwap').disabled }));
  rec('«تغيير السؤال» يبدّل السؤال مرة واحدة دون احتسابه', s.id !== before.id && s.shown === before.shown && s.used && s.dis, { before, s });
  // تصويت الصف يوقف الوقت
  await p.click('#llPoll'); await p.waitForTimeout(200);
  const t1 = await G(() => document.getElementById('timerNum').textContent);
  await p.click('.poll-row .pp'); await p.click('.poll-row .pp');
  await p.waitForTimeout(1500);
  const t2 = await G(() => ({ t: document.getElementById('timerNum').textContent, c: document.querySelector('.poll-row .pc').textContent, w: document.querySelector('.poll-row .pbar i').style.width }));
  rec('«تصويت الصف»: عدّاد لكل خيار، والوقت متوقف أثناء التصويت', t1 === t2.t && t2.c === '2' && t2.w === '100%', { t1, t2 });
  await p.click('#pollDone');
  // الوصول إلى أسئلة الاختيار من متعدد ثم 50:50
  for (let i = 0; i < 6; i++) {
    const ty = await G(() => window.__lad.cur.item.type);
    if (ty === 'mc') break;
    await choose(true); await p.waitForTimeout(1500); await p.waitForFunction(() => window.__lad.state === 'ask', null, { timeout: 5000 });
  }
  s = await G(() => window.__lad.cur.item.type);
  if (s === 'mc') {
    await p.click('#ll5050'); await p.waitForTimeout(100);
    s = await G(() => { const L = window.__lad, r = window.__decodeAnswer(L.cur.item._raw); const gone = [...document.querySelectorAll('#opts .lopt.gone')]; return { gone: gone.length, keepsRight: gone.every(x => +x.dataset.choice !== r) }; });
    rec('«حذف إجابتين» يحذف خيارين خاطئين فقط', s.gone === 2 && s.keepsRight, s);
  } else rec('«حذف إجابتين» يحذف خيارين خاطئين فقط', false, 'no mc');
  // الانسحاب
  const cur = await G(() => { const L = window.__lad; return L.step > 0 ? L.L.pts[L.step - 1] : 0; });
  await p.click('#walkBtn'); await p.waitForTimeout(300);
  s = await G(() => ({ st: window.__lad.state, fin: window.__lad.final, title: document.getElementById('rTitle').textContent }));
  rec('الانسحاب يحتفظ بالنقاط الحالية', s.st === 'over' && s.fin === cur && /انسحاب/.test(s.title), { s, cur });
  // نفاد المحاولات: نقاط آخر درجة أمان
  await p.click('#rActions button >> nth=0'); await p.waitForTimeout(300);
  for (let i = 0; i < 6; i++) { await choose(true); await p.waitForTimeout(1500); await p.waitForFunction(() => window.__lad.state === 'ask', null, { timeout: 6000 }); }
  for (let i = 0; i < 3; i++) { await choose(false); await p.waitForTimeout(1500); if (i < 2) await p.waitForFunction(() => window.__lad.state === 'ask', null, { timeout: 6000 }); }
  await p.waitForFunction(() => window.__lad.state === 'over', null, { timeout: 6000 });
  s = await G(() => ({ st: window.__lad.state, fin: window.__lad.final, step: window.__lad.step, safe: window.__lad.L.pts[4] }));
  rec('نفاد المحاولات: يحتفظ بنقاط آخر درجة أمان (1,000)', s.st === 'over' && s.fin === s.safe && s.step === 6, s);
  // انتهاء الوقت = خطأ
  await p.click('#rActions button >> nth=1'); await p.waitForTimeout(200);
  await p.click('#optTime .chip >> nth=1'); // 30 ثانية
  await G(() => { window.GAME_CONFIG.ladder.times[1] = 2; });
  await p.click('#optTime .chip >> nth=1');
  await p.click('#startGame'); await p.waitForTimeout(400);
  await G(() => { window.__lad && 0; });
  await p.waitForTimeout(3200);
  s = await G(() => ({ lives: window.__lad.lives, fb: document.getElementById('feedback').textContent }));
  rec('انتهاء الوقت يُحتسب خطأ', s.lives === 2 && /انتهى الوقت/.test(s.fb), s);
  rec('لا أخطاء JavaScript', errs.length === 0, errs);
  await b.close();
  results.forEach(r => console.log((r.pass ? '✅ نجح' : '❌ يحتاج إصلاح') + ' — ' + r.name + (r.pass ? '' : '  ' + JSON.stringify(r.info))));
  process.exit(results.every(r => r.pass) ? 0 : 1);
})();
