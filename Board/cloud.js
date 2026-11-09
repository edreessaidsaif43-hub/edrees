'use strict';

// One serialized writer per signed-in teacher. A retry always uses the same
// bytes and write ID because the server may already have applied that write.
window.BoardCloud = (() => {
  const endpoint = '/api/subscriptions?action=board_workspace';
  const debounceMs = 400;
  const retryDelayMs = 300;
  const timeoutMs = 9000;
  const maxBytes = 3 * 1024 * 1024;

  function validRevision(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function newWriteId() {
    return globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  return class BoardCloud {
    constructor({ teacherId, revision, readWorkspace, onStatus = () => {}, onAccessLost = () => {} }) {
      if (!validRevision(revision)) throw new TypeError('Invalid workspace revision');
      this.teacherId = teacherId;
      this.currentRevision = revision;
      this.readWorkspace = readWorkspace;
      this.onStatus = onStatus;
      this.onAccessLost = onAccessLost;
      this.version = 0;
      this.savedVersion = 0;
      this.timer = null;
      this.draining = null;
      this.pending = null;
      this.disposed = false;
      this.blocked = false;
      this.lastError = null;
      this.statusKind = null;
      this.statusCode = null;
    }

    get dirty() { return this.savedVersion !== this.version; }
    get busy() { return this.draining !== null; }
    get revision() { return this.currentRevision; }
    get error() { return this.lastError; }

    acceptRevision(revision) {
      if (this.disposed || this.dirty || this.busy || !validRevision(revision) || revision < this.currentRevision) return false;
      this.currentRevision = revision;
      return true;
    }

    schedule() {
      if (this.disposed) return;
      this.version++;
      if (this.blocked || this.busy) return;
      this.report('pending');
      this.defer();
    }

    flush() {
      this.clearTimer();
      if (this.disposed || this.blocked) return Promise.resolve(false);
      if (this.draining) return this.draining;
      if (!this.dirty) return Promise.resolve(true);

      this.draining = Promise.resolve().then(() => this.drain()).finally(() => {
        this.draining = null;
        if (this.dirty && !this.lastError) this.defer();
      });
      return this.draining;
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.clearTimer();
      clearTimeout(this.requestTimeout);
      this.requestController?.abort();
      this.cancelRetry?.();
      this.pending = null;
    }

    defer() {
      if (this.disposed || this.blocked || this.busy) return;
      this.clearTimer();
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, debounceMs);
    }

    clearTimer() {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    }

    report(kind, code = null) {
      if (this.disposed || (this.statusKind === kind && this.statusCode === code)) return;
      this.statusKind = kind;
      this.statusCode = code;
      this.onStatus(kind, code);
    }

    createBatch() {
      const version = this.version;
      try {
        const workspace = this.readWorkspace();
        if (!workspace || typeof workspace !== 'object') return { code: 'invalid_workspace' };
        const body = JSON.stringify({
          teacherId: this.teacherId,
          workspace,
          expectedRevision: this.currentRevision,
          writeId: newWriteId(),
        });
        if (new TextEncoder().encode(body).byteLength > maxBytes) return { code: 'workspace_too_large' };
        return { batch: Object.freeze({ version, body }) };
      } catch {
        return { code: 'invalid_workspace' };
      }
    }

    async drain() {
      while (!this.disposed && this.dirty) {
        if (!this.pending) {
          const result = this.createBatch();
          if (!result.batch) return this.fail(result);
          this.pending = result.batch;
        }
        const batch = this.pending;
        this.report('saving');
        if (this.disposed) return false;
        const result = await this.write(batch);
        if (this.disposed) return false;
        if (result.code) return this.fail(result);

        this.currentRevision = result.revision;
        this.savedVersion = batch.version;
        this.lastError = null;
        this.pending = null;
      }
      if (this.disposed) return false;
      this.report('saved');
      return !this.dirty;
    }

    fail({ code, retryable = false, conflict = false, accessLost = false }) {
      this.lastError = code;
      this.blocked = conflict || accessLost;
      if (!retryable) this.pending = null;
      this.report(conflict ? 'conflict' : 'error', code);
      if (accessLost && !this.disposed) this.onAccessLost();
      return false;
    }

    async write(batch) {
      const result = await this.request(batch);
      if (!result.retryable || this.disposed) return result;
      const retry = await this.waitToRetry();
      if (!retry || this.disposed) return result;
      return this.request(batch);
    }

    waitToRetry() {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          this.cancelRetry = null;
          resolve(true);
        }, retryDelayMs);
        this.cancelRetry = () => {
          clearTimeout(timer);
          this.cancelRetry = null;
          resolve(false);
        };
      });
    }

    async request(batch) {
      const controller = new AbortController();
      this.requestController = controller;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      this.requestTimeout = timeout;
      try {
        const response = await fetch(endpoint, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: batch.body,
        });
        const result = await response.json().catch(() => null);
        if (controller.signal.aborted) return { code: 'network', retryable: true };
        const code = typeof result?.error === 'string' && result.error ? result.error : null;
        if (response.ok) {
          if (!validRevision(result?.revision) || result.revision <= this.currentRevision) return { code: 'network', retryable: true };
          return { revision: result.revision };
        }
        if (response.status === 401 || response.status === 403 || (response.status === 409 && code === 'account_changed')) {
          return { code: code || 'sign_in_required', accessLost: true };
        }
        if (response.status === 409) return { code: code || 'workspace_conflict', conflict: true };
        if (response.status === 413) return { code: 'workspace_too_large' };
        if (response.status >= 500) return { code: code || 'network', retryable: true };
        return { code: code || 'workspace_save_failed' };
      } catch {
        return { code: 'network', retryable: true };
      } finally {
        clearTimeout(timeout);
        this.requestController = null;
        this.requestTimeout = null;
      }
    }
  };
})();
