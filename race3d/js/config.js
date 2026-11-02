/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  // حزمة SCORM: نسبة النجاح المطلوبة (من 100)
  scormMastery: 60,
  title: 'سباق المعرفة 3D',
  mode: 'race',
  // سباق المعرفة 3D: الإجابات الصحيحة اللازمة للفوز، وقت السؤال (ثانية، 0 = بلا وقت)، جودة الرسوم
  race: { wins: [4, 6, 8], defaultWins: 6, times: [0, 20, 30, 45], defaultTime: 30, qualities: ['high', 'medium', 'low'] },
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
