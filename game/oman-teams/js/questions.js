/* مدير أسئلة المرحلة: منع التكرار + إعادة الأسئلة الخاطئة بعد 3–5 أسئلة أخرى */
(function () {
  function decodeAnswer(q) {
    var n = q.t === 'mc' ? q.o.length : 2;
    // k = (answer + len(question)) mod n
    return ((q.k - q.q.length) % n + n) % n;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  function QuestionManager(lesson, lessonIndex) {
    var cfg = window.GAME_CONFIG;
    this.lessonName = lesson.n;
    this.items = lesson.qs.map(function (q, i) {
      return {
        id: 'L' + lessonIndex + '-Q' + (i + 1),
        lesson: lesson.n,
        type: q.t, text: q.q, options: q.o || null, ref: q.ref || ('سؤال ' + (i + 1)),
        _raw: q,
        status: 'new',       // new | done | wrong
        timesShown: 0, timesWrong: 0,
        waiting: false,      // ينتظر إعادة العرض؟
        wait: 0              // عدد الأسئلة/الفرص المتبقية قبل السماح بعودته
      };
    });
    this.lastType = null;
    this.stats = { shown: 0, correct: 0, wrong: 0 };
    this.gapMin = cfg.retryGapMin; this.gapMax = cfg.retryGapMax;
    this.current = null;
    this.history = []; // لأغراض الاختبار
  }

  QuestionManager.prototype.remaining = function () {
    return this.items.filter(function (q) { return q.status !== 'done'; }).length;
  };
  QuestionManager.prototype.allDone = function () { return this.remaining() === 0; };

  /* يعيد سؤالًا أو null إن لم يتوفر سؤال مسموح به الآن */
  QuestionManager.prototype.next = function (prefer) {
    if (this.current) return this.current; // لا يُعرض سؤالان معًا
    var self = this;
    var dueWrong = this.items.filter(function (q) { return q.status === 'wrong' && q.wait <= 0; });
    var fresh = this.items.filter(function (q) { return q.status === 'new'; });
    var pick = null;
    if (dueWrong.length) {
      dueWrong.sort(function (a, b) { return a.wait - b.wait; });
      pick = dueWrong[0];
    } else if (fresh.length) {
      var diff = fresh.filter(function (q) { return prefer ? q.type === prefer : q.type !== self.lastType; });
      var pool = diff.length ? diff : fresh;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!pick) {
      // لا يوجد سؤال مسموح: تُحتسب الفرصة ضمن المسافة المطلوبة للأسئلة المنتظرة
      this.items.forEach(function (q) { if (q.status === 'wrong') q.wait--; });
      return null;
    }
    // كل سؤال آخر منتظر تمر عليه هذه الفرصة
    this.items.forEach(function (q) { if (q.status === 'wrong' && q !== pick) q.wait--; });
    pick.timesShown++;
    this.stats.shown++;
    this.lastType = pick.type;
    // ترتيب عشوائي للخيارات في كل عرض حتى لا يُحفظ موضع الإجابة
    var n = pick.type === 'mc' ? pick.options.length : 2;
    var order = pick.type === 'mc' ? shuffle(Array.from({ length: n }, function (_, i) { return i; })) : [1, 0];
    this.current = { item: pick, order: order, answered: false };
    this.history.push(pick.id);
    return this.current;
  };

  /* choice = فهرس الخيار الأصلي (أو 1=صح / 0=خطأ). يعيد true/false. لا يمكن الإجابة مرتين. */
  QuestionManager.prototype.answer = function (choice) {
    var cur = this.current;
    if (!cur || cur.answered) return null;
    cur.answered = true;
    var it = cur.item;
    var ok = decodeAnswer(it._raw) === choice;
    if (ok) {
      it.status = 'done'; it.waiting = false; it.wait = 0;
      this.stats.correct++;
    } else {
      it.status = 'wrong'; it.waiting = true; it.timesWrong++;
      it.wait = randInt(this.gapMin, this.gapMax);
      this.stats.wrong++;
    }
    this.current = null;
    return ok;
  };

  /* إرجاع السؤال الحالي دون احتسابه (وسيلة «تغيير السؤال») */
  QuestionManager.prototype.skip = function () {
    var cur = this.current; if (!cur || cur.answered) return false;
    cur.item.timesShown--; this.stats.shown--; this.history.pop();
    cur.item.skipped = true; this.current = null; return true;
  };

  window.QuestionManager = QuestionManager;
  window.__decodeAnswer = decodeAnswer; // يُستخدم فقط في وضع العرض التجريبي/الاختبار
})();
