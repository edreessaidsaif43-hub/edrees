const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appPath = path.join(__dirname, 'Motivation+', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');
const start = source.indexOf('function normalizeName');
const end = source.indexOf('function getRecentLiveGameEvents');
if (start < 0 || end < 0) throw new Error('Could not locate session reader block');

const storage = new Map();
const sandbox = {
  localStorage: {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    key: (index) => Array.from(storage.keys())[index] || null,
    get length() { return storage.size; }
  },
  window: {},
  document: {}
};
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(`
const UNIFIED_BACKEND_SESSION_KEY = "lesson_platform_backend_session_v1";
const UNIFIED_AUTH_SESSION_KEY = "enjazy_session_v1";
const UNIFIED_CURRENT_USER_KEY = "lesson_platform_current_user_v1";
${source.slice(start, end)}
`, sandbox);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

storage.set('lesson_platform_backend_session_v1', JSON.stringify({
  userId: 'teacher-123',
  email: '95054153',
  full_name: 'أحمد'
}));

const teacher = vm.runInContext('getCurrentTeacher()', sandbox);
assert(teacher, 'Expected Motivation+ to detect the navbar-compatible session');
assert(teacher.userId === 'teacher-123', 'Expected userId from backend session');
assert(teacher.name === 'أحمد', 'Expected teacher name from backend session');

storage.clear();
storage.set('lesson_platform_backend_session_v1', JSON.stringify({
  full_name: 'سارة'
}));

const nameOnlyTeacher = vm.runInContext('getCurrentTeacher()', sandbox);
assert(nameOnlyTeacher, 'Expected Motivation+ to match navbar behavior for name-only sessions');
assert(nameOnlyTeacher.userId === 'سارة', 'Expected name-only session fallback');

console.log('Motivation session reader tests passed');
