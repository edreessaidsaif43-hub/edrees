/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  title: 'معركة الأبطال',
  mode: 'battle',
  // إعدادات المعركة: الطاقة، الضرر الأساسي، مكافأة السلسلة، مكافأة السرعة، الضربة الخارقة كل 3 إجابات متتالية
  battle: { hp: [60, 100, 150], defaultHp: 100, damage: 20, streakBonus: 5, streakMax: 15, speedBonus: 5, superEvery: 3, times: [0, 20, 30, 45], defaultTime: 30 },
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
