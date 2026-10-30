/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  // حزمة SCORM: نسبة النجاح المطلوبة (من 100)
  scormMastery: 60,
  title: 'الهروب من قلعة جبرين',
  mode: 'escape',
  // الهروب من قلعة جبرين: مدة المغامرة بالدقائق (0 = بلا وقت)، خصم الثواني عند الخطأ، أوقات السؤال
  escape: { minutes: [0, 10, 15, 20], defaultMinutes: 15, penalty: 15, times: [0, 30, 45], defaultTime: 0 },
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
