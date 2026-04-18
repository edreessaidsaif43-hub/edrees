/**
 * Patch: Remote Storage for users + metrics + comments
 * Add these helpers and handlers to your existing Apps Script project.
 */

const STORAGE_KEY = 'EDU_REMOTE_STORAGE_V1';

function getDefaultRemoteStorage_() {
  return {
    version: 1,
    users: [],
    contentMetrics: {},
    contentComments: {}
  };
}

function loadRemoteStorage_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(STORAGE_KEY);
  if (!raw) return getDefaultRemoteStorage_();
  try {
    const parsed = JSON.parse(raw);
    return {
      version: Number(parsed.version) || 1,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      contentMetrics: parsed.contentMetrics && typeof parsed.contentMetrics === 'object' ? parsed.contentMetrics : {},
      contentComments: parsed.contentComments && typeof parsed.contentComments === 'object' ? parsed.contentComments : {}
    };
  } catch (err) {
    return getDefaultRemoteStorage_();
  }
}

function saveRemoteStorage_(storage) {
  const safe = {
    version: Number(storage && storage.version) || 1,
    users: Array.isArray(storage && storage.users) ? storage.users : [],
    contentMetrics: storage && storage.contentMetrics && typeof storage.contentMetrics === 'object' ? storage.contentMetrics : {},
    contentComments: storage && storage.contentComments && typeof storage.contentComments === 'object' ? storage.contentComments : {}
  };
  PropertiesService.getScriptProperties().setProperty(STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Add to your existing doGet router:
 * if (action === 'getStorage') return jsonOutput_({ success: true, storage: loadRemoteStorage_() });
 */
function handleGetStorage_() {
  return jsonOutput_({ success: true, storage: loadRemoteStorage_() });
}

/**
 * Add to your existing doPost router:
 * if (payload.action === 'saveStorage') return handleSaveStorage_(payload);
 */
function handleSaveStorage_(payload) {
  const saved = saveRemoteStorage_(payload && payload.storage ? payload.storage : {});
  return jsonOutput_({ success: true, storage: saved });
}

