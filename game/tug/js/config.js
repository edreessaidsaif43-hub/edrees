/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  // حزمة SCORM: نسبة النجاح المطلوبة (من 100)
  scormMastery: 60,
  title: 'شدّ الحبل',
  mode: 'tug',
  // شدّ الحبل: عدد السحبات اللازمة للفوز، مدة المباراة (ثانية، 0 = بلا وقت)، مدة الانتظار بعد الخطأ (مللي ثانية)
  tug: { steps: [4, 6, 8], defaultSteps: 6, durations: [0, 120, 180, 300], defaultDuration: 180, lockMs: 1500 },
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
