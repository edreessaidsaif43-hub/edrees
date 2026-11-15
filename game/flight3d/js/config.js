/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  // حزمة SCORM: نسبة النجاح المطلوبة (من 100)
  scormMastery: 60,
  title: 'طيّار المعرفة 3D',
  mode: 'flight',
  // طيّار المعرفة 3D: الإجابات الصحيحة للهبوط، وقت الوصول إلى الحلقات (ثانية)، السرعة، جودة الرسوم
  flight: { goals: [8, 12, 16], defaultGoal: 8, times: [10, 15, 20], defaultTime: 15, speeds: ['slow', 'normal', 'fast'], defaultSpeed: 'normal', qualities: ['high', 'medium', 'low'] },
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
