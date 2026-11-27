const maxBytes = 4 * 1024 * 1024;
const maxFiles = 50;
const formats = new Map([
  ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'],
  ['webp', 'image/webp'], ['gif', 'image/gif']
]);
const allowedTypes = new Set(formats.values());
const endpoint = '/api/image-upload';
const input = document.getElementById('files');
const choose = document.getElementById('choose');
const uploadButton = document.getElementById('upload');
const dropZone = document.getElementById('drop-zone');
const queue = document.getElementById('queue');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
const feedback = document.getElementById('feedback');
const signIn = document.getElementById('sign-in');
const rowTemplate = document.getElementById('file-row');
const number = new Intl.NumberFormat('ar', { maximumFractionDigits: 1 });

const items = [];
let checking = true;
let signedOut = false;
let running = false;

function message(text, error = false) {
  feedback.textContent = text;
  feedback.dataset.error = String(error);
}

function renderControls() {
  empty.hidden = items.length > 0;
  count.hidden = items.length === 0;
  count.textContent = number.format(items.length);
  const pending = items.filter(item => item.state === 'ready' || item.state === 'failed').length;
  uploadButton.disabled = checking || signedOut || running || !pending;
  uploadButton.textContent = running ? 'جارٍ رفع الصور…' : pending ? 'رفع الصور (' + number.format(pending) + ')' : 'رفع الصور';
  choose.disabled = running;
  signIn.hidden = !signedOut;
  for (const item of items) item.remove.disabled = running;
}

function fileSize(bytes) {
  return bytes < 1024 * 1024 ? number.format(Math.max(1, bytes / 1024)) + ' كيلوبايت' :
    number.format(bytes / (1024 * 1024)) + ' ميغابايت';
}

function clearItem(item) {
  items.splice(items.indexOf(item), 1);
  item.row.remove();
  URL.revokeObjectURL(item.previewUrl);
  renderControls();
  choose.focus();
}

async function copyLink(item) {
  const link = item.result.querySelector('input');
  try {
    await navigator.clipboard.writeText(link.value);
    item.copy.textContent = 'تم النسخ';
    message('تم نسخ رابط الصورة.');
  } catch {
    link.focus();
    link.select();
    message('تم تحديد الرابط. استخدم أمر النسخ في المتصفح.');
  }
}

function addFile(file, type) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  const item = {
    file, type, row, state: 'ready', previewUrl: URL.createObjectURL(file),
    remove: row.querySelector('.remove'),
    status: row.querySelector('.file-status'),
    progress: row.querySelector('progress'),
    result: row.querySelector('.result'),
    copy: row.querySelector('.copy')
  };
  const thumbnail = row.querySelector('img');
  row.querySelector('.filename').textContent = file.name;
  item.status.textContent = fileSize(file.size);
  item.remove.setAttribute('aria-label', 'إزالة ' + file.name);
  item.remove.addEventListener('click', () => clearItem(item));
  item.copy.addEventListener('click', () => void copyLink(item));
  thumbnail.addEventListener('error', () => {
    thumbnail.hidden = true;
    if (item.state !== 'ready') return;
    item.state = 'invalid';
    item.status.classList.add('error');
    item.status.textContent = 'تعذّرت قراءة الصورة.';
    renderControls();
  });
  items.push(item);
  queue.append(row);
  thumbnail.src = item.previewUrl;
}

function addFiles(files) {
  if (running) return;
  const errors = new Set();
  for (const file of files) {
    if (items.length === maxFiles) {
      errors.add('يمكن اختيار ' + number.format(maxFiles) + ' صورة في المرة الواحدة.');
      break;
    }
    const type = file.type || formats.get(file.name.split('.').pop().toLowerCase());
    if (!allowedTypes.has(type) || !file.size) {
      errors.add('اختر صورًا صالحة بصيغة JPG أو PNG أو WebP أو GIF.');
    } else if (file.size > maxBytes) {
      errors.add('الحد الأقصى لكل صورة 4 ميغابايت.');
    } else {
      addFile(file, type);
    }
  }
  if (signedOut) errors.add('سجّل الدخول بحساب التحضير الذكي للرفع.');
  message([...errors].join(' '), errors.size > 0);
  renderControls();
}

function uploadFile(item) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', endpoint);
    request.responseType = 'json';
    request.timeout = 60000;
    request.setRequestHeader('Content-Type', item.type);
    request.upload.addEventListener('progress', event => {
      if (event.lengthComputable) item.progress.value = event.loaded / event.total * 100;
    });
    request.addEventListener('load', () => {
      const url = request.response?.url;
      if (request.status === 201 && typeof url === 'string' && url.startsWith('https://')) {
        resolve(url);
        return;
      }
      const error = new Error(request.response?.message ||
        (request.status === 413 ? 'الحد الأقصى لكل صورة 4 ميغابايت.' : 'تعذّر رفع الصورة.'));
      error.status = request.status;
      reject(error);
    });
    request.addEventListener('error', () => reject(new Error('انقطع الاتصال. حاول الرفع مجددًا.')));
    request.addEventListener('timeout', () => reject(new Error('انتهت مهلة الرفع. حاول مجددًا.')));
    request.send(item.file);
  });
}

async function uploadPending() {
  if (uploadButton.disabled) return;
  running = true;
  renderControls();
  const pending = items.filter(item => item.state === 'ready' || item.state === 'failed');
  let completed = 0;
  for (const [index, item] of pending.entries()) {
    message('جارٍ رفع الصورة ' + number.format(index + 1) + ' من ' + number.format(pending.length) + '…');
    item.state = 'uploading';
    item.status.classList.remove('error');
    item.status.textContent = 'جارٍ الرفع…';
    item.progress.removeAttribute('value');
    item.progress.hidden = false;
    try {
      const url = await uploadFile(item);
      item.state = 'complete';
      item.status.classList.add('complete');
      item.status.textContent = 'تم الرفع';
      item.result.querySelector('input').value = url;
      item.result.hidden = false;
      item.remove.textContent = 'إخفاء';
      item.remove.setAttribute('aria-label', 'إخفاء ' + item.file.name + ' من القائمة');
      completed++;
    } catch (error) {
      item.state = 'failed';
      item.status.classList.add('error');
      item.status.textContent = error.message;
      if (error.status === 401) {
        signedOut = true;
        break;
      }
    } finally {
      item.progress.hidden = true;
    }
  }
  running = false;
  renderControls();
  if (signedOut) message('سجّل الدخول بحساب التحضير الذكي لمتابعة الرفع.', true);
  else if (completed === pending.length) message('تم رفع الصور. يمكنك نسخ الروابط الآن.');
  else message('راجع حالة الصور في القائمة وأعد المحاولة عند الحاجة.', true);
}

choose.addEventListener('click', () => input.click());
input.addEventListener('change', () => {
  addFiles(input.files);
  input.value = '';
});
for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    if (!running) dropZone.classList.add('dragging');
    if (event.dataTransfer) event.dataTransfer.dropEffect = running ? 'none' : 'copy';
  });
}
dropZone.addEventListener('dragleave', event => {
  if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('dragging');
});
dropZone.addEventListener('drop', event => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  if (event.dataTransfer) addFiles(event.dataTransfer.files);
});
uploadButton.addEventListener('click', () => void uploadPending());

async function checkSession() {
  try {
    const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
    signedOut = response.status === 401;
    if (signedOut) message('سجّل الدخول بحساب التحضير الذكي للرفع.');
  } catch {
    // An upload request checks the session again.
  } finally {
    checking = false;
    renderControls();
  }
}

void checkSession();
