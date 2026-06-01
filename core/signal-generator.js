class SignalGenerator {
  constructor(store) {
    this._store = store;
    this._generators = new Map(); // id → { type, period, min, max, phase, startTime, lastVal }
    this._rafId = null;
    this._tick = this._tick.bind(this);
  }

  start(id, config) {
    // config: { type: 'sine'|'square'|'sawtooth'|'triangle'|'random', period, min, max, phase }
    this._generators.set(id, { ...config, startTime: performance.now(), lastVal: (config.min + config.max) / 2 });
    if (!this._rafId) this._rafId = requestAnimationFrame(this._tick);
  }

  stop(id) {
    this._generators.delete(id);
    if (this._generators.size === 0 && this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  isActive(id) { return this._generators.has(id); }

  getConfig(id) { return this._generators.get(id) || null; }

  _tick(now) {
    this._generators.forEach((cfg, id) => {
      const t = (now - cfg.startTime) / 1000; // seconds
      const val = this._compute(cfg, t);
      this._store.set(id, val);
    });
    if (this._generators.size > 0) {
      this._rafId = requestAnimationFrame(this._tick);
    } else {
      this._rafId = null;
    }
  }

  _compute(cfg, t) {
    const { type, period, min, max, phase } = cfg;
    const range = max - min;
    const p = period || 10;
    const phaseRad = ((phase || 0) / 360) * 2 * Math.PI;
    const tp = t / p;
    switch (type) {
      case 'sine':
        return min + range * (0.5 + 0.5 * Math.sin(2 * Math.PI * tp + phaseRad));
      case 'square':
        return ((t % p) < p / 2) ? max : min;
      case 'sawtooth':
        return min + range * ((t % p) / p);
      case 'triangle':
        return min + range * (1 - 2 * Math.abs(((t % p) / p) - 0.5));
      case 'random': {
        // Random walk — step ±2% of range each frame, clamped
        const step = (Math.random() - 0.5) * 0.04 * range;
        cfg.lastVal = Math.max(min, Math.min(max, (cfg.lastVal ?? (min + range / 2)) + step));
        return cfg.lastVal;
      }
      default:
        return min + range / 2;
    }
  }

  // Serialise active generators for share URL
  serialise() {
    const out = {};
    this._generators.forEach((cfg, id) => {
      out[id] = { type: cfg.type, period: cfg.period, min: cfg.min, max: cfg.max, phase: cfg.phase || 0 };
    });
    return out;
  }

  // Restore from serialised state
  restore(data) {
    if (!data) return;
    Object.entries(data).forEach(([id, cfg]) => this.start(id, cfg));
  }
}

export { SignalGenerator };
if (typeof module !== 'undefined') module.exports = { SignalGenerator };
