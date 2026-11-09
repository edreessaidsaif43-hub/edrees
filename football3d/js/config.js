/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  // حزمة SCORM: نسبة النجاح المطلوبة (من 100)
  scormMastery: 60,
  title: 'ملعب المعرفة 3D',
  mode: 'foot',
  // ملعب المعرفة 3D: عدد الهجمات لكل فريق، وقت السؤال (ثانية، 0 = بلا وقت)، جودة الرسوم
  foot: { attacks: [3, 5, 8], defaultAttacks: 5, times: [0, 20, 30, 45], defaultTime: 30, qualities: ['high', 'medium', 'low'] },
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
