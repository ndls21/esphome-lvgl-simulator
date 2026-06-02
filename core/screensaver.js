class ScreensaverSimulator {
  constructor(store, proxy, simulator) {
    this._store = store;
    this._proxy = proxy;        // lvgl proxy (for show/hide, showPage)
    this._sim = simulator;      // simulator instance (for display dim/overlay)
    this._state = 0;            // 0=active, 1=dim, 2=screensaver, 3=off
    this._lastActivity = performance.now();
    this._speedMultiplier = 1;
    this._enabled = false;
    this._rafId = null;
    this._tick = this._tick.bind(this);
  }

  enable() {
    this._enabled = true;
    this._lastActivity = performance.now();
    if (!this._rafId) this._rafId = requestAnimationFrame(this._tick);
  }

  disable() {
    this._enabled = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._wake();
  }

  triggerActivity() {
    this._lastActivity = performance.now();
    if (this._state !== 0) this._wake();
  }

  triggerNow() {
    // Manual trigger — jump straight to screensaver by setting last activity far in the past
    this._lastActivity = performance.now() - 999999;
  }

  setSpeed(multiplier) { this._speedMultiplier = multiplier; }

  _tick(now) {
    if (!this._enabled) return;
    this._rafId = requestAnimationFrame(this._tick);

    const dimSec = (this._store.get('dim_timeout_sec') ?? 30);
    const offSec = (this._store.get('off_timeout_sec') ?? 60);
    const idleSec = (now - this._lastActivity) / 1000 * this._speedMultiplier;
    const state = this._state;

    if (state === 0 && idleSec >= dimSec) {
      this._setState(1);
    } else if (state === 1 && idleSec >= dimSec + offSec) {
      const mode = this._store.get('screensaver_mode') ?? 1;
      if (mode === 0) {
        this._setState(3);
      } else if (mode === 1) {
        this._store.set('screensaver_start_ms', Date.now());
        this._store.set('screen_state', 2);
        if (this._proxy) this._proxy.show('clock_screensaver');
        this._setState(2);
      } else {
        // mode 2: save current page, navigate to flow page
        const prevPage = this._sim?.currentPageIndex ?? 0;
        this._store.set('screensaver_prev_page', prevPage);
        this._store.set('screensaver_start_ms', Date.now());
        this._store.set('screen_state', 2);
        this._setState(2);
      }
    }

    this._store.set('screen_state', this._state);
    this._applyVisuals();
  }

  _setState(s) {
    this._state = s;
  }

  _wake() {
    const prevState = this._state;
    this._state = 0;
    this._store.set('screen_state', 0);
    if (prevState === 2) {
      const mode = this._store.get('screensaver_mode') ?? 1;
      if (mode === 1 && this._proxy) this._proxy.hide('clock_screensaver');
      if (mode === 2 && this._sim) {
        const prevPage = this._store.get('screensaver_prev_page') ?? 0;
        if (typeof prevPage === 'number') {
          this._sim.currentPageIndex = prevPage;
          this._sim.syncPageSelect?.();
          this._sim.renderCurrentPage?.('NONE');
        }
      }
    }
    this._applyVisuals();
  }

  _applyVisuals() {
    const display = document.getElementById('lvglDisplay');
    if (!display) return;
    switch (this._state) {
      case 0:
        display.style.filter = '';
        this._removeOverlay(display);
        break;
      case 1: // DIM
        display.style.filter = 'brightness(0.3)';
        this._removeOverlay(display);
        break;
      case 2: // SCREENSAVER
        display.style.filter = 'brightness(0.15)';
        this._removeOverlay(display);
        break;
      case 3: // OFF
        display.style.filter = '';
        this._ensureOverlay(display, '#000000');
        break;
    }
  }

  _ensureOverlay(display, color) {
    let overlay = display.querySelector('.ss-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'ss-overlay';
      overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:9999;cursor:pointer;';
      overlay.addEventListener('click', () => this.triggerActivity());
      display.appendChild(overlay);
    }
    overlay.style.backgroundColor = color;
  }

  _removeOverlay(display) {
    display.querySelector('.ss-overlay')?.remove();
  }
}

if (typeof module !== 'undefined') module.exports = { ScreensaverSimulator };
