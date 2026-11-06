(function () {
  'use strict';
  const status = document.getElementById('noor-ext-status');
  if (!status) return;
  const stores = {
    chrome: { name: 'Google Chrome', url: 'https://chromewebstore.google.com/detail/fgdlajfbjmobhaeabmgdfgmecpjjlmng' },
    firefox: { name: 'Mozilla Firefox', url: 'https://addons.mozilla.org/en-US/firefox/addon/التحضير-الذكي-للمعلم-العماني/' }
  };
  const channel = 'altahdir-noor-extension-status-v1';
  const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  const ua = navigator.userAgent || '';
  const mobile = !!(navigator.userAgentData && navigator.userAgentData.mobile)
    || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || ((navigator.platform === 'MacIntel' || /Macintosh/i.test(ua)) && navigator.maxTouchPoints > 1);
  const runtimeStore = /Firefox|FxiOS/i.test(ua) ? 'firefox' : /Chrome|Chromium|Edg|OPR|CriOS/i.test(ua) ? 'chrome' : '';
  const selectedStore = mobile ? 'firefox' : runtimeStore;
  let installedStore = runtimeStore;
  let installedVersion = '';
  let manualVersion = '';
  let manualStore = '';
  let confirmed = status.getAttribute('data-state') === 'ready';
  let detectionState = confirmed ? 'ready' : 'checking';
  let catalog = null;
  let catalogLoading = false;
  let catalogRequest = 0;
  let catalogController;
  let requestId;
  let detectionTimer;
  let probeTimer;
  let probeContainer;
  let message;
  let tools;
  let refs;
  let lastMessage = '';
  let lastLegacyVersion = '';
  let lastLegacyStore = '';

  function validVersion(value) {
    if (typeof value !== 'string') return '';
    const text = value.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));
    return /^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(text) && text.split('.').every(part => Number(part) <= 65535) ? text : '';
  }
  function compareVersions(a, b) {
    const left = validVersion(a), right = validVersion(b);
    if (!left || !right) return null;
    const x = left.split('.').map(Number), y = right.split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
    }
    return 0;
  }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function setHidden(node, hidden) { if (node.hidden !== hidden) node.hidden = hidden; }
  function setAttribute(node, key, value) { if (node.getAttribute(key) !== value) node.setAttribute(key, value); }
  function reportMatchesBrowser(store) { return !stores[store] || store === selectedStore; }

  // Store metadata belongs to this UI and must never be parsed as an installed version.
  function readLegacyReport() {
    if (status.getAttribute('data-state') !== 'ready') return null;
    const explicit = validVersion(status.getAttribute('data-version'));
    const legacyMessage = status.querySelector('.noor-extension-message');
    let text = '';
    if (legacyMessage) {
      if (legacyMessage.textContent !== lastMessage) text = legacyMessage.textContent;
    } else {
      text = Array.from(status.childNodes).filter(node => !(node.nodeType === 1 && node.hasAttribute('data-noor-version-ui'))).map(node => node.textContent).join(' ');
    }
    const match = text.match(/(?:الإصدار|version|\bv)\s*[:：]?\s*(\d{1,5}(?:\.\d{1,5}){0,3})/i);
    const store = status.getAttribute('data-browser') || status.getAttribute('data-store');
    return { version: explicit || validVersion(match && match[1]), store: stores[store] ? store : '' };
  }

  function ensureUI() {
    message = status.querySelector('.noor-extension-message');
    if (!message) {
      status.replaceChildren();
      message = document.createElement('span');
      message.className = 'noor-extension-message';
      status.appendChild(message);
    }
    if (tools && tools.isConnected) return;
    status.querySelectorAll('.noor-extension-actions, [data-noor-version-ui]').forEach(node => node.remove());
    tools = document.createElement('div');
    tools.className = 'noor-extension-tools';
    tools.setAttribute('data-noor-version-ui', '1');
    tools.innerHTML = '<div class="noor-extension-actions"><span class="noor-store-current"></span><a id="noor-ext-install" class="noor-extension-store-link" target="_blank" rel="noopener noreferrer"></a><button type="button" data-noor-extension-refresh>إعادة الفحص</button></div><div class="noor-version-numbers"></div><p class="noor-version-result"></p><details class="noor-manual-version" hidden><summary>مقارنة الإصدار يدويًا</summary><label for="noor-installed-version">الإصدار المثبّت كما يظهر في قائمة إضافات المتصفح</label><div class="noor-manual-row"><input id="noor-installed-version" type="text" inputmode="decimal" placeholder="مثل 2.14.0" maxlength="23" autocomplete="off" spellcheck="false" dir="ltr"><button type="button" data-noor-compare>مقارنة</button></div><p class="noor-version-error" role="status"></p></details>';
    status.appendChild(tools);
    refs = {
      browserLabel: tools.querySelector('.noor-store-current'), link: tools.querySelector('#noor-ext-install'),
      refresh: tools.querySelector('[data-noor-extension-refresh]'), numbers: tools.querySelector('.noor-version-numbers'),
      result: tools.querySelector('.noor-version-result'), manual: tools.querySelector('details'),
      input: tools.querySelector('input'), compare: tools.querySelector('[data-noor-compare]'), error: tools.querySelector('.noor-version-error')
    };
    refs.refresh.addEventListener('click', function () { restartDetection(); loadCatalog(); });
    refs.compare.addEventListener('click', function () {
      const value = validVersion(refs.input.value);
      if (!value) { setText(refs.error, 'أدخل رقم إصدار صحيحًا مثل 2.14.0.'); return; }
      manualVersion = value; manualStore = selectedStore;
      setText(refs.error, ''); render();
    });
  }

  function render() {
    ensureUI();
    setAttribute(status, 'data-device', mobile ? 'mobile' : 'desktop');
    setAttribute(status, 'data-state', confirmed ? 'ready' : detectionState);
    lastMessage = confirmed
      ? '✓ إضافة التحضير الذكي مثبتة' + (installedVersion ? ' (الإصدار ' + installedVersion + ')' : '') + '. سجّل الدخول في منصة نور قبل البدء.'
      : detectionState === 'checking' ? 'جارٍ التحقق من إضافة التحضير الذكي…' : 'لم يتم رصد إضافة التحضير الذكي في هذا المتصفح. إذا كانت مثبتة، فعّلها لهذا الموقع ثم أعد الفحص.';
    setText(message, lastMessage);
    refs.refresh.disabled = catalogLoading;
    const store = stores[selectedStore];
    setText(refs.browserLabel, store ? (mobile ? 'إضافة الهاتف: ' : 'إضافة المتصفح: ') + store.name : 'لم يتم تحديد متصفح متوافق');
    setHidden(refs.link, !store);
    if (store) { refs.link.href = store.url; setText(refs.link, (confirmed ? 'صفحة الإضافة في ' : 'تثبيت الإضافة من ') + store.name); }
    const matchesStore = !installedStore || installedStore === selectedStore;
    const effectiveVersion = matchesStore ? (installedVersion || (manualStore === selectedStore ? manualVersion : '')) : '';
    setHidden(refs.manual, !confirmed || !!installedVersion || !store || !matchesStore);
    let updateState = 'unknown', result = '', numbers = '';
    const entry = catalog && catalog[selectedStore];
    const latest = entry && !entry.error && validVersion(entry.version);
    if (!store) result = 'افتح هذه الصفحة من كروم أو فايرفوكس لفحص إضافة المتصفح المستخدم.';
    else if (catalogLoading) result = 'جارٍ جلب أحدث إصدار من المتجر الرسمي…';
    else if (!latest) result = 'تعذر جلب إصدار المتجر حاليًا. يمكنك فتح صفحة الإضافة أو إعادة الفحص.';
    else {
      const sourceLabel = manualVersion && !installedVersion && manualStore === selectedStore ? 'المثبّت (مدخل يدويًا)' : 'المثبّت';
      const installedLabel = ' في ' + store.name;
      numbers = sourceLabel + installedLabel + ': ' + (effectiveVersion || 'غير متاح') + ' · إصدار متجر ' + store.name + ': ' + latest;
      if (confirmed && !matchesStore) result = 'افتح هذه الصفحة من ' + store.name + ' لفحص إصدار الإضافة المثبّتة فيه.';
      else if (effectiveVersion) {
        const comparison = compareVersions(effectiveVersion, latest);
        if (comparison < 0) {
          updateState = 'outdated'; result = 'يتوفر تحديث للإضافة من ' + effectiveVersion + ' إلى ' + latest + '.';
          setText(refs.link, 'تحديث الإضافة من ' + store.name);
        } else if (comparison === 0) { updateState = 'current'; result = 'إصدار إضافتك يطابق أحدث إصدار في المتجر.'; }
        else { updateState = 'ahead'; result = 'إصدارك أحدث من الإصدار المعروض حاليًا في المتجر.'; }
      } else if (confirmed) result = 'تم رصد الإضافة، لكن رقم الإصدار المثبّت غير متاح للموقع. يمكنك إدخاله يدويًا للمقارنة.';
      else result = mobile ? 'على الهاتف، افتح رابط إضافة فايرفوكس لتثبيتها.' : 'افتح رابط إضافة ' + store.name + ' لتثبيتها على متصفحك الحالي.';
    }
    setAttribute(status, 'data-update-state', updateState);
    setText(refs.numbers, numbers); setHidden(refs.numbers, !numbers);
    setText(refs.result, result);
  }

  function confirm(version, store) {
    if (!reportMatchesBrowser(store)) return;
    confirmed = true; detectionState = 'ready';
    const value = validVersion(version);
    installedVersion = value;
    if (stores[store]) installedStore = store;
    clearTimeout(detectionTimer); clearTimeout(probeTimer);
    if (probeContainer) { probeContainer.remove(); probeContainer = null; }
    render();
  }

  async function loadCatalog() {
    const id = ++catalogRequest;
    if (catalogController) catalogController.abort();
    catalogController = new AbortController();
    const controller = catalogController;
    const timeout = setTimeout(() => controller.abort(), 12000);
    catalogLoading = true; render();
    try {
      const base = window.location.protocol === 'file:' ? 'https://altahdir.app' : '';
      const response = await fetch(base + '/api/noor-extension-versions', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Store version request failed');
      const data = await response.json();
      if (id !== catalogRequest) return;
      catalog = data && typeof data === 'object' ? data : null;
    } catch (error) { if (id === catalogRequest) catalog = null; }
    finally { clearTimeout(timeout); if (id === catalogRequest) { catalogLoading = false; render(); } }
  }

  function checkPublishedExtensionStyles() {
    if (confirmed || probeContainer || typeof window.getComputedStyle !== 'function') return;
    probeContainer = document.createElement('div');
    probeContainer.setAttribute('aria-hidden', 'true');
    probeContainer.style.setProperty('display', 'none', 'important');
    const probe = document.createElement('span');
    probe.className = 'noor-t-box'; probe.style.setProperty('forced-color-adjust', 'none');
    probeContainer.appendChild(probe); document.body.appendChild(probeContainer);
    let attempts = 0;
    function check() {
      if (confirmed) return;
      const style = window.getComputedStyle(probe);
      if (style.display === 'grid' && style.borderTopStyle === 'dashed' && parseFloat(style.borderTopWidth) > 0
          && style.borderTopColor.replace(/\s/g, '') === 'rgb(15,118,110)' && style.backgroundColor.replace(/\s/g, '') === 'rgb(240,253,250)') { confirm(''); return; }
      if (++attempts < 60) probeTimer = setTimeout(check, 500);
      else if (probeContainer) { probeContainer.remove(); probeContainer = null; }
    }
    check();
  }

  function acceptResponse(data) {
    if (!data || data.channel !== channel || data.type !== 'status-response' || data.requestId !== requestId || data.installed !== true) return;
    confirm(data.version, data.browser || data.store);
  }
  function requestStatus(fresh = true) {
    if (fresh || !requestId) requestId = window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const request = { channel, type: 'status-request', requestId };
    window.postMessage(request, targetOrigin);
    if (selectedStore === 'chrome' && window.chrome && window.chrome.runtime && typeof window.chrome.runtime.sendMessage === 'function') {
      try { window.chrome.runtime.sendMessage('fgdlajfbjmobhaeabmgdfgmecpjjlmng', request, function (response) {
        if (!window.chrome.runtime.lastError) acceptResponse(response);
      }); } catch (error) {}
    }
  }

  function restartDetection() {
    clearTimeout(detectionTimer); clearTimeout(probeTimer);
    if (probeContainer) { probeContainer.remove(); probeContainer = null; }
    confirmed = false; installedVersion = ''; installedStore = runtimeStore;
    manualVersion = ''; manualStore = ''; lastLegacyVersion = ''; lastLegacyStore = '';
    detectionState = 'checking';
    ['data-version', 'data-browser', 'data-store'].forEach(key => status.removeAttribute(key));
    render(); refs.input.value = ''; setText(refs.error, '');
    detectionTimer = setTimeout(function () { if (!confirmed) { detectionState = 'missing'; render(); } }, 4000);
    requestStatus(); checkPublishedExtensionStyles();
  }

  const initialReport = readLegacyReport();
  if (initialReport && reportMatchesBrowser(initialReport.store)) { installedVersion = initialReport.version; lastLegacyVersion = initialReport.version; lastLegacyStore = initialReport.store; if (initialReport.store) installedStore = initialReport.store; }
  else if (initialReport) { confirmed = false; detectionState = 'checking'; }
  ensureUI(); render();
  new MutationObserver(function () {
    const report = readLegacyReport();
    if (report && reportMatchesBrowser(report.store) && (!confirmed || (report.version && report.version !== lastLegacyVersion) || (report.store && report.store !== lastLegacyStore))) {
      lastLegacyVersion = report.version; lastLegacyStore = report.store;
      confirm(report.version, report.store);
    }
    else if (!message.isConnected || !tools.isConnected) render();
  }).observe(status, { attributes: true, attributeFilter: ['data-state', 'data-version', 'data-browser', 'data-store'], childList: true, subtree: true, characterData: true });
  window.addEventListener('message', function (event) { if (event.source === window && event.origin === window.location.origin) acceptResponse(event.data); });
  if (!confirmed) detectionTimer = setTimeout(function () { if (!confirmed) { detectionState = 'missing'; render(); } }, 4000);
  loadCatalog(); requestStatus(); checkPublishedExtensionStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { requestStatus(false); }, { once: true });
  window.addEventListener('focus', checkPublishedExtensionStyles);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkPublishedExtensionStyles(); });
})();
