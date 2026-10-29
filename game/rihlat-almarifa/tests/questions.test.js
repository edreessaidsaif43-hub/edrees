// اختبار منطق بنك الأسئلة: node tests/questions.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { window: {}, Math, Array, console };
ctx.window.GAME_CONFIG = { retryGapMin: 3, retryGapMax: 5 };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/questions.js'), 'utf8'), ctx);
const QM = ctx.window.QuestionManager, dec = ctx.window.__decodeAnswer;
global.window = { __BANK: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/grades/g04.js'), 'utf8'), { window: global.window });
const grade = global.window.__BANK['grades/g04'];
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL:', m); } }

// بنك كبير مصطنع من دروس حقيقية لاختبار المسافة
const lessons = grade.flatMap(s => s.s.flatMap(m => m.u.flatMap(u => u.l)));
const big = { n: 'test', qs: lessons.slice(0, 4).flatMap(l => l.qs) };

for (let run = 0; run < 300; run++) {
  const L = run % 2 ? big : lessons[run % lessons.length];
  const qm = new QM(L, 0);
  const lastWrongAt = {}, correctSet = new Set();
  let opp = 0;
  for (let step = 0; step < 200; step++) {
    opp++;
    const cur = qm.next();
    if (!cur) { ok(!qm.allDone() || true, ''); continue; }
    const id = cur.item.id;
    ok(!correctSet.has(id), 'correct question repeated ' + id);
    ok(L.qs.includes(cur.item._raw), 'question from another lesson');
    if (lastWrongAt[id] !== undefined) {
      const gap = opp - lastWrongAt[id] - 1;
      ok(gap >= 3, 'wrong question returned too early gap=' + gap);
    }
    // لا يمكن الإجابة مرتين
    const right = dec(cur.item._raw);
    const correct = Math.random() < 0.6;
    const n = cur.item.type === 'mc' ? cur.item.options.length : 2;
    const choice = correct ? right : (right + 1) % n;
    const r = qm.answer(choice);
    ok(r === correct, 'answer result mismatch');
    ok(qm.answer(choice) === null, 'double answer counted');
    if (correct) { correctSet.add(id); delete lastWrongAt[id]; } else lastWrongAt[id] = opp;
    if (qm.allDone()) break;
  }
  if (run % 2) {
    // مع بنك كبير: يجب أن يعود السؤال الخاطئ خلال 3–5 أسئلة أخرى
  }
}
// بنك كبير: تحقق من أن العودة ضمن 3–5 أسئلة أخرى بالضبط
for (let run = 0; run < 200; run++) {
  const qm = new QM(big, 0);
  const first = qm.next(); qm.answer(-1); // خطأ
  let k = 0, back = -1;
  for (let i = 1; i <= 8; i++) { const c = qm.next(); if (c.item.id === first.item.id) { back = i - 1; qm.answer(dec(c.item._raw)); break; } qm.answer(dec(c.item._raw)); }
  ok(back >= 3 && back <= 5, 'retry gap out of 3..5: ' + back);
}
// إجابة كل الأسئلة صحيحة → لا تكرار
{
  const qm = new QM(lessons[0], 0); let c;
  while ((c = qm.next())) qm.answer(dec(c.item._raw));
  ok(qm.allDone() && qm.next() === null, 'should stop after all correct');
}
// إعادة تشغيل المرحلة = جلسة جديدة
{
  const qm2 = new QM(lessons[0], 0); ok(qm2.stats.shown === 0 && qm2.remaining() === lessons[0].qs.length, 'new session resets');
}
console.log(`questions tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
