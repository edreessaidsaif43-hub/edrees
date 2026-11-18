'use strict';

function createIhtiyatStore({ key, getWorkspace, openWorkspace, paint, newWriteId }) {
  const hosted = /^https?:$/.test(location.protocol);
  const endpoint = '/api/ihtiyat';
  const draftPrefix = key + ':draft:';
  const devicePrefix = key + ':device:';
  const tabId = newWriteId();
  let previousTabId = performance.getEntriesByType('navigation')[0]?.type === 'reload'
    ? read(sessionStorage, key + ':tab') : null;

  let owner = null;
  let revision = 0;
  let pending = null;
  let attempted = null;
  let conflict = null;
  let active = false;
  let queued = false;
  let checkAgain = false;
  let switchingAccount = false;
  let timer;
  let localFailed = false;

  const store = {
    status: hosted ? 'checking' : 'local',
    get localFailed() { return localFailed; },
    get hasPending() { return !!pending; },
    get hasConflict() { return !!conflict; },
    get hasOwner() { return !!owner; },
    get canImport() { return !!owner && revision === 0 && !pending && !!legacyWorkspace(); },
    start,
    save,
    openLocal: () => { if (!owner && !getWorkspace()) openLocal(); },
    retry: () => sync(true),
    importLegacy,
    recoverDraft,
    hasDraft: () => !!latestDraft(),
    useRemote,
  };

  function read(storage, storageKey) {
    try { return JSON.parse(storage.getItem(storageKey)); }
    catch { return null; }
  }

  function write(storage, storageKey, value) {
    try {
      if (value == null) storage.removeItem(storageKey);
      else storage.setItem(storageKey, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function valid(workspace) {
    return !!workspace && Array.isArray(workspace.schools) && Array.isArray(workspace.users);
  }

  function legacyWorkspace() {
    const workspace = read(localStorage, key);
    return valid(workspace) && workspace.demo !== true
      && (workspace.activated || workspace.users.length || workspace.setup?.started)
      ? workspace : null;
  }

  function accountPrefix() {
    return draftPrefix + encodeURIComponent(owner) + ':';
  }

  function draftKey() {
    return accountPrefix() + tabId;
  }

  function readDraft(storageKey) {
    const draft = read(localStorage, storageKey);
    return draft && valid(draft.workspace) && draft.pending && Number.isSafeInteger(draft.revision) ? draft : null;
  }

  function latestDraft() {
    if (!owner || pending) return null;
    let newest = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (!storageKey?.startsWith(accountPrefix()) || storageKey === draftKey()) continue;
        const draft = readDraft(storageKey);
        if (draft && (!newest || draft.workspace.updatedAt > newest.draft.workspace.updatedAt)) newest = { storageKey, draft };
      }
    } catch {}
    return newest;
  }

  function deviceState(workspace) {
    return { session: workspace?.session ?? null, currentSchoolId: workspace?.currentSchoolId ?? null };
  }

  function cloudWorkspace() {
    const { session, currentSchoolId, ...workspace } = getWorkspace();
    return workspace;
  }

  function persist() {
    const workspace = getWorkspace();
    if (!owner) {
      localFailed = !write(localStorage, key, workspace);
      return;
    }
    write(sessionStorage, devicePrefix + owner, deviceState(workspace));
    if (workspace.demo) {
      localFailed = !write(sessionStorage, devicePrefix + owner + ':demo', workspace);
      return;
    }
    write(sessionStorage, devicePrefix + owner + ':demo', null);
    localFailed = !write(localStorage, draftKey(), pending ? {
      workspace: cloudWorkspace(), revision, pending, attempted,
    } : null);
  }

  function setStatus(status) {
    store.status = status;
    paint();
  }

  function openLocal() {
    const legacy = read(localStorage, key);
    openWorkspace(valid(legacy) ? legacy : null, deviceState(legacy));
  }

  function start() {
    if (!hosted) {
      openLocal();
      return;
    }
    if (!navigator.onLine && read(sessionStorage, key + ':scope') === 'guest') openLocal();
    void sync(true);
    window.addEventListener('online', () => void sync(true));
    window.addEventListener('offline', () => setStatus('offline'));
    window.addEventListener('pageshow', event => { if (event.persisted) void sync(true); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void sync(true);
    });
    window.addEventListener('storage', event => {
      if (!event.key || ['enjazy_session_v1', 'lesson_platform_backend_session_v1', 'altahdir_logout_v1'].includes(event.key)) {
        void sync(true);
      }
    });
    setInterval(() => {
      if (owner && document.visibilityState === 'visible'
          && !document.activeElement?.matches('input, textarea, select, [contenteditable]')) void sync(true);
    }, 30000);
  }

  function save() {
    if (switchingAccount) return;
    const workspace = getWorkspace();
    workspace.updatedAt = Date.now();
    if (owner && !workspace.demo) pending = newWriteId();
    persist();
    if (!owner || workspace.demo || conflict) {
      paint();
      return;
    }
    setStatus(navigator.onLine ? 'saving' : 'offline');
    clearTimeout(timer);
    timer = setTimeout(() => void sync(false), 400);
  }

  async function request(method, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(endpoint, {
        method, cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      throw Object.assign(new Error(data.error || 'workspace_unavailable'), { status: response.status });
    } finally {
      clearTimeout(timeout);
    }
  }

  function openCloud(workspace) {
    const device = read(sessionStorage, devicePrefix + owner);
    openWorkspace(workspace, device);
  }

  function changeOwner(remote) {
    owner = remote?.ownerId ?? null;
    pending = null;
    attempted = null;
    conflict = null;
    revision = remote?.revision ?? 0;
    localFailed = false;
    if (!owner) {
      write(sessionStorage, key + ':scope', 'guest');
      openLocal();
      return;
    }
    write(sessionStorage, key + ':scope', 'account');
    const previousKey = previousTabId ? accountPrefix() + previousTabId : null;
    const draft = previousKey ? readDraft(previousKey) : null;
    previousTabId = null;
    if (draft) {
      revision = draft.revision;
      pending = draft.pending;
      attempted = draft.attempted;
    }
    const demo = remote.revision === 0 ? read(sessionStorage, devicePrefix + owner + ':demo') : null;
    openCloud(draft?.workspace ?? remote.workspace ?? (valid(demo) ? demo : null));
    if (draft) keepDraft(previousKey, draft);
    if (!localFailed) write(sessionStorage, key + ':tab', tabId);
  }

  function reloadForAccountChange() {
    switchingAccount = true;
    location.reload();
  }

  function applyRemote(remote, discard = false) {
    if (owner !== remote.ownerId) {
      if (owner || getWorkspace()) {
        reloadForAccountChange();
        return;
      }
      changeOwner(remote);
    }
    if (discard) {
      pending = null;
      attempted = null;
      conflict = null;
      revision = remote.revision;
      openCloud(remote.workspace);
      persist();
      return;
    }
    if (pending && attempted && remote.revision === revision + 1 && remote.lastWriteId === attempted) {
      revision = remote.revision;
      if (pending === attempted) pending = null;
      attempted = null;
      persist();
    }
    if (pending) {
      conflict = remote.revision === revision ? null : remote;
      return;
    }
    conflict = null;
    if (remote.revision !== revision) {
      revision = remote.revision;
      openCloud(remote.workspace);
    }
  }

  async function fetchRemote() {
    const remote = await request('GET');
    if (!remote.ownerId || !Number.isSafeInteger(remote.revision)
        || (remote.revision === 0 ? remote.workspace !== null : !valid(remote.workspace))) {
      throw new Error('workspace_unavailable');
    }
    return remote;
  }

  async function push() {
    if (!pending || conflict || getWorkspace().demo) return;
    const writeId = pending;
    attempted = writeId;
    persist();
    setStatus('saving');
    try {
      const saved = await request('PUT', { ownerId: owner, expectedRevision: revision, writeId, workspace: cloudWorkspace() });
      if (saved.revision !== revision + 1) throw new Error('workspace_unavailable');
      revision = saved.revision;
      attempted = null;
      if (pending === writeId) pending = null;
      persist();
    } catch (error) {
      if (error.message !== 'workspace_conflict' && error.message !== 'account_changed') throw error;
      applyRemote(await fetchRemote());
    }
    if (pending && pending !== writeId && !conflict) queued = true;
  }

  async function sync(checkRemote, discard = false) {
    if (switchingAccount) return;
    if (active) {
      queued = true;
      checkAgain ||= checkRemote;
      return;
    }
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    active = true;
    const previousOwner = owner;
    const discardWrite = discard ? pending : null;
    try {
      if (checkRemote || attempted || !owner) {
        const remote = await fetchRemote();
        applyRemote(remote, discard && previousOwner === remote.ownerId && pending === discardWrite);
      }
      if (switchingAccount) return;
      await push();
      if (switchingAccount) return;
      setStatus(conflict ? 'conflict' : pending ? 'saving' : revision ? 'saved' : 'ready');
    } catch (error) {
      if (error.status === 401) {
        if (owner) {
          reloadForAccountChange();
          return;
        }
        if (!getWorkspace()) changeOwner(null);
        write(sessionStorage, key + ':scope', 'guest');
        setStatus('guest');
      } else {
        setStatus(error.status === 413 ? 'large' : 'error');
      }
    } finally {
      active = false;
      if (queued) {
        const refresh = checkAgain;
        queued = false;
        checkAgain = false;
        void sync(refresh);
      }
    }
  }

  function importLegacy() {
    const legacy = legacyWorkspace();
    if (!store.canImport || !legacy) return;
    openWorkspace(legacy, null);
    save();
  }

  function recoverDraft() {
    const item = latestDraft();
    if (!item) return;
    const { storageKey, draft } = item;
    revision = draft.revision;
    pending = draft.pending;
    attempted = draft.attempted;
    openCloud(draft.workspace);
    keepDraft(storageKey, draft);
    void sync(true);
  }

  function keepDraft(storageKey, draft) {
    persist();
    if (!localFailed && readDraft(storageKey)?.pending === draft.pending) write(localStorage, storageKey, null);
  }

  function useRemote() {
    if (conflict && !active) void sync(true, true);
  }

  return store;
}
