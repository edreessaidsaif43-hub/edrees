/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  title: 'ركلات الترجيح',
  mode: 'penalty',
  // ركلات الترجيح: عدد الركلات لكل فريق، وأوقات السؤال. الإجابة السريعة (النصف الأول من الوقت) = تسديدة قوية
  penalty: { kicks: [3, 5, 7], defaultKicks: 5, times: [0, 20, 30, 45], defaultTime: 30 },
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
