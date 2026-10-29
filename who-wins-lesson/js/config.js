/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  title: 'من سيربح الدرس؟',
  mode: 'ladder',
  // سلّم النقاط ودرجات الأمان (يُختصر السلّم تلقائيًا إذا كانت أسئلة الدروس أقل من 15)
  ladder: { points: [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000], safe: [4, 9], times: [0, 30, 45, 60], defaultTime: 45, lives: 3 },
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
