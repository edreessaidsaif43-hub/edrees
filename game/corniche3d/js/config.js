/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  // حزمة SCORM: نسبة النجاح المطلوبة (من 100)
  scormMastery: 60,
  title: 'عدّاء الكورنيش 3D',
  mode: 'runner',
  // عدّاء الكورنيش 3D: عدد الإجابات الصحيحة للوصول إلى القلعة، وقت الوصول إلى البوابة (ثانية)، السرعة، القلوب (0 = بلا حدود)، جودة الرسوم
  runner: { goals: [8, 12, 16], defaultGoal: 8, times: [10, 15, 20], defaultTime: 15, speeds: ['slow', 'normal', 'fast'], defaultSpeed: 'normal', hearts: [3, 5, 0], defaultHearts: 3, qualities: ['high', 'medium', 'low'] },
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
