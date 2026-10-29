/* إعدادات عامة قابلة للتعديل بسهولة */
window.GAME_CONFIG = {
  title: 'رحلة الفرق عبر عُمان',
  mode: 'oman',
  // إعدادات الرحلة
  oman: { teams: { min: 2, max: 4, def: 3 }, times: [0, 30, 45, 60], defaultTime: 45, dice: [1, 3], readBonus: 0 },
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
