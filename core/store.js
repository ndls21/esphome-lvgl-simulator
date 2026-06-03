export class SimulatorStateStore {
  constructor() {
    this._entries = {};
    this._listeners = {};
    this._globalListeners = [];
  }

  register(id, meta) {
    this._entries[id] = {
      ...meta,
      value: meta.initialValue !== undefined ? meta.initialValue : null,
      hasValue: meta.initialValue !== undefined,
    };
  }

  get(id) {
    return this._entries[id]?.value ?? null;
  }

  has(id) {
    return this._entries[id]?.hasValue ?? false;
  }

  getMeta(id) {
    return this._entries[id] ?? null;
  }

  getAllEntries() {
    return { ...this._entries };
  }

  set(id, value) {
    if (!this._entries[id]) {
      this._entries[id] = { entityType: 'unknown', hasValue: false };
    }
    const prev = this._entries[id].value;
    this._entries[id].value = value;
    this._entries[id].hasValue = true;
    if (prev !== value) {
      this._notify(id, value);
    }
  }

  subscribe(id, callback) {
    if (!this._listeners[id]) this._listeners[id] = [];
    this._listeners[id].push(callback);
    return () => {
      if (this._listeners[id]) {
        this._listeners[id] = this._listeners[id].filter(cb => cb !== callback);
      }
    };
  }

  subscribeAll(callback) {
    this._globalListeners.push(callback);
    return () => {
      this._globalListeners = this._globalListeners.filter(cb => cb !== callback);
    };
  }

  reset() {
    Object.keys(this._entries).forEach(id => {
      const entry = this._entries[id];
      entry.value = entry.initialValue !== undefined ? entry.initialValue : null;
      entry.hasValue = entry.initialValue !== undefined;
    });
    this._globalListeners.forEach(cb => cb());
  }

  clear() {
    this._entries = {};
    this._listeners = {};
  }

  _notify(id, value) {
    (this._listeners[id] || []).forEach(cb => cb(value, id));
    this._globalListeners.forEach(cb => cb(value, id));
  }
}
