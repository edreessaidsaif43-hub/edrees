'use strict';

function createIhtiyatStore({ key, getWorkspace, openWorkspace, closeWorkspace, accessChanged, paint, newWriteId }) {
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
  let access = hosted ? 'checking' : 'site_required';

  const store = {
    status: 'checking',
    get access() { return access; },
    get hasAccess() { return access === 'granted'; },
    get localFailed() { return localFailed; },
    get hasPending() { return !!pending; },
    get hasConflict() { return !!conflict; },
    get hasOwner() { return !!owner; },
    get canImport() { return store.hasAccess && !!owner && revision === 0 && !pending && !!legacyWorkspace(); },
    start,
    save,
    shareContext: () => store.hasAccess && owner && !switchingAccount
      ? { ownerId: owner, expectedRevision: !pending && !conflict ? revision : null } : null,
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
    if (!store.hasAccess || !owner || pending) return null;
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

  function setAccess(next) {
    if (access === next) return;
    if (store.hasAccess && next !== 'granted') document.activeElement?.blur();
    access = next;
    accessChanged();
  }

  function denyAccess(reason) {
    setAccess(reason);
    if (!owner) return;
    clearTimeout(timer);
    owner = null;
    revision = 0;
    pending = null;
    attempted = null;
    conflict = null;
    localFailed = false;
    closeWorkspace();
  }

  function start() {
    if (!hosted) return;
    void sync(true);
    window.addEventListener('online', () => void sync(true));
    window.addEventListener('offline', () => setAccess('offline'));
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
      if (owner && document.visibilityState === 'visible') void sync(true);
    }, 30000);
  }

  function save() {
    if (!store.hasAccess || !owner || switchingAccount) return;
    const workspace = getWorkspace();
    workspace.updatedAt = Date.now();
    if (!workspace.demo) pending = newWriteId();
    persist();
    if (workspace.demo || conflict) {
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
    owner = remote.ownerId;
    pending = null;
    attempted = null;
    conflict = null;
    revision = remote.revision;
    localFailed = false;
    const previousKey = previousTabId ? accountPrefix() + previousTabId : null;
    const currentDraft = readDraft(draftKey());
    const draft = currentDraft ?? (previousKey ? readDraft(previousKey) : null);
    previousTabId = null;
    if (draft) {
      revision = draft.revision;
      pending = draft.pending;
      attempted = draft.attempted;
    }
    const demo = remote.revision === 0 ? read(sessionStorage, devicePrefix + owner + ':demo') : null;
    openCloud(draft?.workspace ?? remote.workspace ?? (valid(demo) ? demo : null));
    if (draft && !currentDraft) keepDraft(previousKey, draft);
    if (!localFailed) write(sessionStorage, key + ':tab', tabId);
  }

  function reloadForAccountChange() {
    switchingAccount = true;
    setAccess('checking');
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
    if (!hosted || switchingAccount) return;
    if (active) {
      queued = true;
      checkAgain ||= checkRemote;
      return;
    }
    if (!navigator.onLine) {
      setAccess('offline');
      return;
    }
    active = true;
    const previousOwner = owner;
    const discardWrite = discard ? pending : null;
    try {
      if (checkRemote || attempted || !owner || !store.hasAccess) {
        const remote = await fetchRemote();
        if (!navigator.onLine) {
          setAccess('offline');
          return;
        }
        applyRemote(remote, discard && previousOwner === remote.ownerId && pending === discardWrite);
        if (switchingAccount) return;
        setAccess('granted');
      }
      await push();
      if (switchingAccount) return;
      setStatus(conflict ? 'conflict' : pending ? 'saving' : revision ? 'saved' : 'ready');
    } catch (error) {
      if (error.status === 401) {
        denyAccess('guest');
      } else if (error.status === 403 && ['subscription_required', 'account_stopped'].includes(error.message)) {
        denyAccess(error.message);
      } else if (!navigator.onLine) {
        setAccess('offline');
      } else if (error.status === 413) {
        setStatus('large');
      } else {
        setStatus('error');
        setAccess('error');
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
    if (store.hasAccess && conflict && !active) void sync(true, true);
  }

  return store;
}
