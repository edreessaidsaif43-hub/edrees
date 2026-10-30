/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  // حزمة SCORM: نسبة النجاح المطلوبة (من 100)
  scormMastery: 60,
  title: 'غوص اللؤلؤ',
  mode: 'pearl',
  // غوص اللؤلؤ: العمق لكل إجابة صحيحة (متر)، الأعماق المستهدفة، أسطوانات الأكسجين، أوقات السؤال
  pearl: { step: 10, goals: [50, 100, 150], defaultGoal: 100, oxygen: 3, times: [0, 15, 20, 30], defaultTime: 20 },
  // بيانات المعلم الافتراضية (اختيارية) — اتركها فارغة لإخفائها، ويمكن تعديلها أيضًا من شاشة الإعداد
  teacherName: '',
  teacherInstagram: '',
  startLives: 3,
  coinsPerQuestion: 5,
  stageTimeSec: 300,
  // نظام النقاط ثابت لكل المراحل
  points: { coin: 10, correct: 100, stomp: 50, stageClear: 500 },
  // عدد الأسئلة الأخرى التي يجب أن تمر قبل عودة السؤال الخاطئ
  retryGapMin: 3,
  retryGapMax: 5,
  dataPath: 'data/'
};
