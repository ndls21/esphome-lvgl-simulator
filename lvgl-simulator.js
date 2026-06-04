import { SimulatorStateStore } from './core/store.js';
import { SignalGenerator } from './core/signal-generator.js';
import { LambdaEvaluator } from './core/lambda.js';
import { buildLVGLProxy, clearGPIOState } from './core/lvgl-proxy.js';
import { preprocessYAML, preprocessAndResolve, _loadSecrets } from './core/preprocessor.js';
import { resolveIncludes } from './core/resolver.js';
import { renderObj } from './widgets/obj.js';
import { renderLabel } from './widgets/label.js';
import { renderButton } from './widgets/button.js';
import { renderBar } from './widgets/bar.js';
import { renderArc, makeSVGArc, applyArcPosition } from './widgets/arc.js';
import { renderSlider } from './widgets/slider.js';
import { renderCheckbox } from './widgets/checkbox.js';
import { renderImg } from './widgets/img.js';
import { renderRoller } from './widgets/roller.js';
import { renderSpinner } from './widgets/spinner.js';
import { renderSwitch } from './widgets/switch.js';
import { renderDropdown } from './widgets/dropdown.js';
import { renderLine } from './widgets/line.js';
import { renderLed } from './widgets/led.js';
import { renderMeter } from './widgets/meter.js';
import { renderChart, drawChart } from './widgets/chart.js';
import { detectFeatures } from './core/feature-detector.js';

function deepMergeStyles(target, source) {
  if (!source || typeof source !== 'object') return target;
  const result = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) &&
        result[k] !== null && typeof result[k] === 'object' && !Array.isArray(result[k])) {
      result[k] = deepMergeStyles(result[k], v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

class LiveDeviceClient {
  constructor(store, onStatusChange) {
    this.store = store;
    this.onStatusChange = onStatusChange;
    this.ws = null;
    this.status = 'disconnected';
    this.entityKeyMap = {};
    this.entityInfoMap = {};
  }

  connect(wsUrl) {
    this.setStatus('connecting');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.setStatus('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'entities') {
          this._handleEntities(msg.entities);
        } else if (msg.type === 'state') {
          this._handleState(msg);
        }
      } catch (e) {
        console.warn('Failed to parse proxy message:', e);
      }
    };

    this.ws.onerror = () => {
      this.setStatus('error', 'Could not connect to proxy. Is esphome_proxy.py running?');
    };

    this.ws.onclose = () => {
      if (this.status !== 'error') this.setStatus('disconnected');
    };
  }

  disconnect() {
    if (this.ws) this.ws.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  _handleEntities(entities) {
    this.entityKeyMap = {};
    this.entityInfoMap = {};

    entities.forEach(e => {
      this.entityKeyMap[e.key] = e.object_id;
      this.entityInfoMap[e.object_id] = {
        key: e.key,
        name: e.name,
        type: e.type,
        unit: e.unit,
      };
    });

    this.status = 'live';
    const allYamlIds = Object.keys(this.store.getAllEntries());
    const sensorTypes = new Set(['sensor', 'binary_sensor', 'text_sensor', 'number']);
    const yamlSensorIds = allYamlIds.filter(id => {
      const meta = this.store.getMeta(id);
      return meta && sensorTypes.has(meta.entityType);
    });
    const deviceYamlIds = new Set(Object.values(this.entityKeyMap));
    const matchedCount = [...deviceYamlIds].filter(id => allYamlIds.includes(id)).length;
    const unmatchedYaml = yamlSensorIds.filter(id => !deviceYamlIds.has(id)).length;

    console.info(`Live: ${entities.length} device entities, ${matchedCount} matched to YAML IDs`);
    this.onStatusChange('live', entities.length, null, matchedCount, unmatchedYaml);
  }

  _handleState(msg) {
    const yamlId = this.entityKeyMap[msg.key];
    if (!yamlId || !this.store.getMeta(yamlId)) return;

    const info = this.entityInfoMap[yamlId];
    let value = msg.value;
    if (info) {
      if (info.type === 'SensorInfo' || info.type === 'NumberInfo') value = parseFloat(value);
      else if (info.type === 'BinarySensorInfo') value = Boolean(value);
      else if (info.type === 'TextSensorInfo') value = String(value);
    }
    this.store.set(yamlId, value);
  }

  setStatus(status, errorMsg) {
    this.status = status;
    this.onStatusChange(status, null, errorMsg);
  }
}

class ESPHomeLVGLSimulator {
    constructor() {
        this.config = null;
        this.styleDefinitions = {};
        this.substitutions = {};
        this.fileMap = {};
        this.store = new SimulatorStateStore();
        this.signalGen = new SignalGenerator(this.store);
        this.store.set('history_ready', true);
        initSyntheticHistBuffers();
        const histProxy = {
            get(name, res) {
                return getOrCreateHistBuffer(name).get(parseInt(res) || 0);
            }
        };
        // Build direct-access Proxy objects for each named HistBuffer array so lambdas
        // can access e.g. solar_pv_hist[res].ordered_value(i) directly by name.
        const knownHistBuffers = [
            'batt_v_hist', 'batt_i_hist', 'batt_soc_hist',
            'solar_pv_hist', 'solar_charge_hist',
            'mains_power_hist', 'mains_current_hist',
            'dcdc_in_v_hist', 'dcdc_out_v_hist', 'dcdc_in_a_hist', 'dcdc_out_a_hist', 'dcdc_pwr_hist',
            'fridge_hist', 'van_hist', 'outside_hist', 'battery_hist',
        ];
        const histArrays = {};
        knownHistBuffers.forEach(name => {
            histArrays[name] = new Proxy({}, {
                get(_, res) { return getOrCreateHistBuffer(name).get(parseInt(res) || 0); }
            });
        });
        this._staticVars = new Map(); // persistent across lambda calls (C++ static locals)
        this.lambda = new LambdaEvaluator(this.store, null, histProxy, histArrays, this._staticVars);
        this.theme = {};
        this.currentWidgetType = '';
        this._renderedElements = {};
        this._selectedWidgetId = null;
        this._deferredAlignments = [];
        this.pages = [];
        this.currentPageIndex = 0;
        this.displayOverride = null;
        this._currentRotation = 0;
        this._topLayerEl = null;
        this._onLoadTimer = null;
        this._screensaver = null;
        this._intervalsEnabled = false;
        this._intervalSpeed = 1;
        this._intervalRafId = null;
        this._intervalHandlers = [];
        this._intervalEpoch = 0;
        this._intervalStartReal = 0;
        this._gpioPollInterval = null;
        this._lastRaw = null;
        this.displayElement = document.getElementById('lvglDisplay');
        this.yamlEditor = document.getElementById('yamlEditor');
        this.pageSelect = document.getElementById('pageSelect');
        this.pageInfo = document.getElementById('pageInfo');

        // Expose globally for test access (Playwright, devtools)
        window.__sim = this;

        this.init();
        if (!this.loadFromHash()) this.loadExampleConfig();
    }

    init() {
        document.getElementById('renderPreview').addEventListener('click', () => {
            this.renderFromEditor();
        });

        document.getElementById('loadExample').addEventListener('click', () => {
            this.loadExampleConfig();
        });

        document.getElementById('loadConfig').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.yaml,.yml';
            input.onchange = (e) => this.loadConfigFile(e.target.files[0]);
            input.click();
        });

        document.getElementById('loadZip').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.zip';
            input.onchange = (e) => this.loadZipFile(e.target.files[0]);
            input.click();
        });

        document.getElementById('loadFolder').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.onchange = (e) => this.loadFolder(e.target.files);
            input.click();
        });

        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPageIndex > 0) {
                this.currentPageIndex--;
                this.syncPageSelect();
                this.renderCurrentPage('MOVE_RIGHT');
            } else if (this.pageWrap) {
                this.currentPageIndex = this.pages.length - 1;
                this.syncPageSelect();
                this.renderCurrentPage('MOVE_RIGHT');
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            if (this.currentPageIndex < this.pages.length - 1) {
                this.currentPageIndex++;
                this.syncPageSelect();
                this.renderCurrentPage('MOVE_LEFT');
            } else if (this.pageWrap) {
                this.currentPageIndex = 0;
                this.syncPageSelect();
                this.renderCurrentPage('MOVE_LEFT');
            }
        });

        this.pageSelect.addEventListener('change', () => {
            this.currentPageIndex = parseInt(this.pageSelect.value);
            this.renderCurrentPage('NONE');
        });

        document.getElementById('rotationSelect')?.addEventListener('change', (e) => {
            this._currentRotation = parseInt(e.target.value);
            this._applyRotation();
        });

        document.getElementById('shareBtn').addEventListener('click', () => {
            const url = this.getShareURL();
            navigator.clipboard.writeText(url).then(() => {
                const btn = document.getElementById('shareBtn');
                const orig = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = orig; }, 1500);
            });
        });

        // toggleMockPanel only existed in the old layout shell; guard for new shell
        document.getElementById('toggleMockPanel')?.addEventListener('click', () => {
            const panel = document.getElementById('mockPanel');
            const btn = document.getElementById('toggleMockPanel');
            if (!panel || !btn) return;
            const isVisible = panel.classList.contains('mock-panel--visible');
            panel.classList.toggle('mock-panel--visible', !isVisible);
            btn.innerHTML = isVisible ? '&#9654;' : '&#9664;';
        });


        document.getElementById('resetMockData').addEventListener('click', () => {
            this.store.reset();
            this.renderFromEditor();
        });

        document.getElementById('displayPreset').addEventListener('change', e => {
            const val = e.target.value;
            if (!val) {
                this.displayOverride = null;
                document.getElementById('customSizeInputs').style.display = 'none';
            } else if (val === 'custom') {
                document.getElementById('customSizeInputs').style.display = 'inline';
                localStorage.setItem('esphome-sim-display-preset', val);
                return;
            } else {
                const [w, h] = val.split('x').map(Number);
                this.displayOverride = { width: w, height: h };
                document.getElementById('customSizeInputs').style.display = 'none';
            }
            localStorage.setItem('esphome-sim-display-preset', val);
            this._rerenderCurrentPage();
        });

        ['customWidth', 'customHeight'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                const w = parseInt(document.getElementById('customWidth').value);
                const h = parseInt(document.getElementById('customHeight').value);
                if (w > 0 && h > 0) {
                    this.displayOverride = { width: w, height: h };
                    this._rerenderCurrentPage();
                }
            });
        });

        // Restore from localStorage
        const savedPreset = localStorage.getItem('esphome-sim-display-preset');
        if (savedPreset) {
            document.getElementById('displayPreset').value = savedPreset;
            document.getElementById('displayPreset').dispatchEvent(new Event('change'));
        }

        document.getElementById('savePreset')?.addEventListener('click', () => {
            const name = prompt('Preset name:');
            if (name && name.trim()) this.savePreset(name.trim());
        });
        document.getElementById('deletePreset')?.addEventListener('click', () => {
            const sel = document.getElementById('presetSelect');
            if (sel && sel.value && sel.value !== '__default__') {
                const all = this._loadAllPresets();
                delete all[sel.value];
                localStorage.setItem('esphome-lvgl-sim-presets', JSON.stringify(all));
                this._refreshPresetDropdown();
            }
        });
        document.getElementById('presetSelect')?.addEventListener('change', e => {
            this.loadPreset(e.target.value);
        });

        this._refreshPresetDropdown();

        this.liveClient = new LiveDeviceClient(this.store, (status, entityCount, errorMsg, matchedCount, unmatchedYaml) => {
          const dot = document.getElementById('liveDot');
          const statusText = document.getElementById('liveStatusText');
          const errorEl = document.getElementById('liveError');
          const infoEl = document.getElementById('liveInfo');
          const warnEl = document.getElementById('liveWarn');
          const connectBtn = document.getElementById('liveConnect');
          const disconnectBtn = document.getElementById('liveDisconnect');

          dot.className = 'live-dot';
          errorEl.style.display = 'none';
          infoEl.style.display = 'none';
          if (warnEl) warnEl.style.display = 'none';

          switch (status) {
            case 'connecting':
              dot.classList.add('live-dot--connecting');
              statusText.textContent = 'Connecting...';
              connectBtn.disabled = true;
              disconnectBtn.disabled = false;
              break;
            case 'connected':
              dot.classList.add('live-dot--connecting');
              statusText.textContent = 'Connected';
              break;
            case 'live':
              dot.classList.add('live-dot--live');
              statusText.textContent = 'LIVE';
              infoEl.style.display = 'block';
              infoEl.textContent = `✓ ${matchedCount}/${entityCount} entities matched to YAML`;
              if (warnEl && unmatchedYaml > 0) {
                warnEl.style.display = 'block';
                warnEl.textContent = `⚠ ${unmatchedYaml} YAML sensor${unmatchedYaml === 1 ? '' : 's'} not found on device (may be template sensors)`;
              }
              break;
            case 'disconnected':
              dot.classList.add('live-dot--off');
              statusText.textContent = 'Not connected';
              connectBtn.disabled = false;
              disconnectBtn.disabled = true;
              break;
            case 'error':
              dot.classList.add('live-dot--error');
              statusText.textContent = 'Error';
              errorEl.style.display = 'block';
              errorEl.textContent = errorMsg;
              connectBtn.disabled = false;
              disconnectBtn.disabled = true;
              break;
          }
        });

        document.getElementById('liveConnect')?.addEventListener('click', () => {
          const url = document.getElementById('liveProxyUrl').value || 'ws://localhost:6054';
          localStorage.setItem('esphome-sim-last-host', document.getElementById('liveHost').value);
          localStorage.setItem('esphome-sim-proxy-url', url);
          this.liveClient.connect(url);
        });

        document.getElementById('liveDisconnect')?.addEventListener('click', () => {
          this.liveClient.disconnect();
        });

        // Restore from localStorage
        const savedHost = localStorage.getItem('esphome-sim-last-host');
        const savedProxy = localStorage.getItem('esphome-sim-proxy-url');
        if (savedHost) document.getElementById('liveHost').value = savedHost;
        if (savedProxy) document.getElementById('liveProxyUrl').value = savedProxy;

        // Interval runner UI controls
        document.getElementById('intervalsEnable')?.addEventListener('change', e => {
            this._intervalsEnabled = e.target.checked;
            if (e.target.checked) {
                this._intervalStartReal = performance.now();
                this._intervalEpoch = 0;
                this._startIntervalRunner();
            } else {
                this._stopIntervalRunner();
            }
        });

        document.getElementById('intervalSpeed')?.addEventListener('change', e => {
            const wasEnabled = this._intervalsEnabled;
            // Reset epoch so speed change doesn't cause a time jump
            this._intervalEpoch = 0;
            this._intervalStartReal = performance.now();
            this._intervalSpeed = parseFloat(e.target.value) || 1;
            if (wasEnabled) this._startIntervalRunner();
        });

        // Screensaver UI controls
        document.getElementById('ssEnable')?.addEventListener('change', e => {
            if (e.target.checked) this._screensaver?.enable();
            else this._screensaver?.disable();
        });
        document.getElementById('ssSpeed')?.addEventListener('change', e => {
            this._screensaver?.setSpeed(parseFloat(e.target.value));
        });
        document.getElementById('ssTrigger')?.addEventListener('click', () => {
            if (!this._screensaver) return;
            const cb = document.getElementById('ssEnable');
            if (cb) cb.checked = true;
            this._screensaver.enable();
            this._screensaver.triggerNow();
        });

        // State label update interval
        setInterval(() => {
            const labels = ['ACTIVE', 'DIM', 'SCREENSAVER', 'OFF'];
            const colors = ['#44ff44', '#ffaa00', '#ff8800', '#ff4444'];
            const s = this._screensaver?._state ?? 0;
            const el = document.getElementById('ssStateLabel');
            if (el && this._screensaver?._enabled) {
                el.textContent = labels[s] || 'ACTIVE';
                el.style.color = colors[s] || '#888';
            } else if (el) {
                el.textContent = 'OFF';
                el.style.color = '';
            }
        }, 250);

        this._initSwipeHandlers();

        // Swipe arrows act as click-to-navigate buttons (visible on mobile)
        document.getElementById('swipe-left')?.addEventListener('click',  () => this._handleSwipe('left'));
        document.getElementById('swipe-right')?.addEventListener('click', () => this._handleSwipe('right'));
        document.getElementById('swipe-up')?.addEventListener('click',    () => this._handleSwipe('up'));

        // Mobile rail toggles
        document.getElementById('toggle-left-rail')?.addEventListener('click', () => {
            document.getElementById('left-rail')?.classList.toggle('rail-open');
        });
        document.getElementById('toggle-right-rail')?.addEventListener('click', () => {
            document.getElementById('right-rail')?.classList.toggle('rail-open');
        });
        // Tap outside an open rail to close it
        document.getElementById('hero-canvas')?.addEventListener('click', () => {
            document.getElementById('left-rail')?.classList.remove('rail-open');
            document.getElementById('right-rail')?.classList.remove('rail-open');
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
            const map = { ArrowLeft: 'right', ArrowRight: 'left', ArrowUp: 'down', ArrowDown: 'up' };
            if (map[e.key]) { e.preventDefault(); this._handleSwipe(map[e.key]); }
        });

        // SD card logging
        this._initSDLogging();

        document.getElementById('sdDownload')?.addEventListener('click', () => {
            if (!this._sdBuffer?.length) return;
            const header = 'timestamp,sensor_id,value\n';
            const rows = this._sdBuffer.map(r => `${r.ts},${r.id},${r.value}`).join('\n');
            const blob = new Blob([header + rows], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'd5os_sensors.csv'; a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('sdClear')?.addEventListener('click', () => {
            this._sdBuffer = [];
            document.getElementById('sdRowCount').textContent = '';
        });

        this.store.subscribe('sd_logging_enabled', (val) => {
            this._sdEnabled = !!val;
            const statusEl = document.getElementById('sdStatus');
            if (statusEl) statusEl.textContent = val ? 'logging' : 'idle';
            if (statusEl) statusEl.style.color = val ? '#4f4' : '';
            document.getElementById('sdDownload').disabled = !this._sdBuffer?.length;
        });

        setInterval(() => {
            const count = this._sdBuffer?.length || 0;
            const el = document.getElementById('sdRowCount');
            if (el) el.textContent = count > 0 ? `${count} rows` : '';
            const dlBtn = document.getElementById('sdDownload');
            if (dlBtn) dlBtn.disabled = count === 0;
        }, 1000);

        // Online status
        const updateOnline = () => {
            const el = document.getElementById('netOnline');
            if (el) { el.textContent = navigator.onLine ? '● Online' : '○ Offline'; el.style.color = navigator.onLine ? '#4f4' : '#f44'; }
        };
        updateOnline();
        window.addEventListener('online', updateOnline);
        window.addEventListener('offline', updateOnline);

        // Ping test
        document.getElementById('netPingBtn')?.addEventListener('click', () => {
            const host = document.getElementById('netPingHost')?.value?.trim();
            if (!host) return;
            const resultEl = document.getElementById('netPingResult');
            if (resultEl) resultEl.textContent = 'pinging...';
            const start = Date.now();
            fetch(`https://${host}`, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache' })
                .then(() => { if (resultEl) resultEl.textContent = `${Date.now()-start}ms`; })
                .catch(() => { if (resultEl) resultEl.textContent = 'unreachable'; });
        });

        // Supabase test connection
        document.getElementById('sbTest')?.addEventListener('click', async () => {
            const url = document.getElementById('sbUrl')?.value;
            const key = document.getElementById('sbKey')?.value;
            if (!url) return;
            try {
                const res = await fetch(`${url}/rest/v1/`, {
                    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
                });
                document.getElementById('sbStatus').textContent = res.ok ? '✓ Connected' : `✗ ${res.status}`;
            } catch(e) {
                document.getElementById('sbStatus').textContent = `✗ ${e.message}`;
            }
        });
    }

    _transformPointerCoords(clientX, clientY) {
        const display = document.getElementById(this._displayElId || 'lvglDisplay');
        if (!display) return { x: clientX, y: clientY };
        const rect = display.getBoundingClientRect();
        // Raw coords relative to display element
        let x = clientX - rect.left;
        let y = clientY - rect.top;
        // Use LVGL base dimensions (pre-rotation), not CSS rendered size
        const W = this.displayWidth  || rect.width;
        const H = this.displayHeight || rect.height;
        // Inverse transform based on rotation (undo CSS rotation)
        switch (this._currentRotation) {
            case 90:  return { x: y * W / rect.height, y: W - x * W / rect.width };
            case 180: return { x: W - x * W / rect.width,  y: H - y * H / rect.height };
            case 270: return { x: H - y * H / rect.height, y: x * H / rect.width  };
            default:  return { x, y };
        }
    }

    _initSwipeHandlers() {
        const display = document.getElementById('lvglDisplay');
        if (!display) return;

        let startX = 0, startY = 0, startTime = 0;
        const MIN_SWIPE_DIST = 50;
        const MAX_SWIPE_TIME = 500;
        const MAX_CROSS = 80;

        display.addEventListener('pointerdown', (e) => {
            const c = this._transformPointerCoords(e.clientX, e.clientY);
            startX = c.x; startY = c.y; startTime = Date.now();
            this._screensaver?.triggerActivity();
        });

        display.addEventListener('pointerup', (e) => {
            const c = this._transformPointerCoords(e.clientX, e.clientY);
            const dx = c.x - startX;
            const dy = c.y - startY;
            const dt = Date.now() - startTime;
            if (dt > MAX_SWIPE_TIME) return;

            const absDx = Math.abs(dx), absDy = Math.abs(dy);
            if (absDx < MIN_SWIPE_DIST && absDy < MIN_SWIPE_DIST) return;

            let dir;
            if (absDx > absDy && absDx > MIN_SWIPE_DIST && absDy < MAX_CROSS) {
                dir = dx < 0 ? 'left' : 'right';
            } else if (absDy > absDx && absDy > MIN_SWIPE_DIST && absDx < MAX_CROSS) {
                dir = dy < 0 ? 'up' : 'down';
            }
            if (dir) this._handleSwipe(dir);
        });
    }


    _handleSwipe(dir) {
        const page = this.pages[this.currentPageIndex];
        if (!page) return;

        const handlerKey = `on_swipe_${dir}`;
        const animMap = { left: 'MOVE_LEFT', right: 'MOVE_RIGHT', up: 'MOVE_TOP', down: 'MOVE_BOTTOM' };

        if (page[handlerKey]) {
            // Try to parse a show_page(id(X)->index, ...) call from the lambda body.
            // This lets us honour the YAML author's navigation intent without executing C++.
            const nav = this._parseShowPageNav(page[handlerKey]);
            if (nav !== null) {
                const targetIdx = this.pages.findIndex(p => p.id === nav.pageId);
                if (targetIdx !== -1) {
                    this.currentPageIndex = targetIdx;
                    this.syncPageSelect();
                    this.renderCurrentPage(nav.anim || animMap[dir], nav.duration ?? null);
                }
            } else {
                // Lambda exists but doesn't contain a show_page call — evaluate as-is
                this.lambda.evaluate(page[handlerKey], null);
            }
        }
        // No handler → no navigation. The YAML author decides what swipes do;
        // we don't assume a default direction mapping.
    }

    /**
     * Extract the decoded body from a preprocessed lambda value.
     * Handles both inline string ("__lambda__:BASE64") and action-list
     * ([{lambda: "__lambda__:BASE64"}, ...]) forms.
     */
    _extractLambdaBody(handler) {
        let encoded = null;
        if (typeof handler === 'string' && handler.startsWith('__lambda__:')) {
            encoded = handler.slice(11);
        } else if (Array.isArray(handler)) {
            for (const item of handler) {
                if (item && typeof item.lambda === 'string' && item.lambda.startsWith('__lambda__:')) {
                    encoded = item.lambda.slice(11);
                    break;
                }
            }
        }
        if (!encoded) return null;
        try {
            return decodeURIComponent(escape(atob(encoded)));
        } catch {
            return null;
        }
    }

    /**
     * If the lambda body contains a show_page(id(PAGE_ID)->index, ...) call,
     * return { pageId, anim } so _handleSwipe can navigate directly.
     * Returns null if no navigable show_page call is found.
     */
    _parseShowPageNav(handler) {
        const body = this._extractLambdaBody(handler);
        if (!body) return null;
        const pageMatch = body.match(/show_page\s*\(\s*id\s*\(\s*(\w+)\s*\)\s*->\s*index/);
        if (!pageMatch) return null;
        const animMatch = body.match(/LV_SCR_LOAD_ANIM_MOVE_(\w+)/);
        const anim = animMatch ? `MOVE_${animMatch[1]}` : null;
        const durationMatch = body.match(/LV_SCR_LOAD_ANIM_\w+\s*,\s*(\d+)\s*\)/);
        const duration = durationMatch ? parseInt(durationMatch[1], 10) : null;
        return { pageId: pageMatch[1], anim, duration };
    }

    async loadConfigFile(file) {
        try {
            const text = await file.text();
            this.fileMap = {};
            this.yamlEditor.value = text;
            this.renderFromEditor();
        } catch (error) {
            console.error('Error loading config file:', error);
            alert('Error loading config file: ' + error.message);
        }
    }

    async loadZipFile(file) {
        try {
            if (typeof JSZip === 'undefined') {
                alert('JSZip not loaded — check your internet connection.');
                return;
            }
            const zip = await JSZip.loadAsync(file);
            const map = {};
            const loads = [];
            zip.forEach((relPath, entry) => {
                if (!entry.dir) {
                    loads.push(
                        entry.async('string').then(content => { map[relPath] = content; })
                    );
                }
            });
            await Promise.all(loads);
            this.fileMap = map;

            const candidates = this._detectRootYaml(map);
            if (candidates.length === 0) { alert('No YAML file found in ZIP.'); return; }
            if (candidates.length === 1) {
                this.yamlEditor.value = map[candidates[0]];
                this.renderFromEditor();
            } else {
                this._showDevicePicker(candidates, map);
            }
        } catch (error) {
            console.error('Error loading ZIP:', error);
            alert('Error loading ZIP: ' + error.message);
        }
    }

    async loadFolder(files) {
        try {
            const map = {};
            const loads = Array.from(files).map(f =>
                f.text().then(content => {
                    // webkitRelativePath is "foldername/path/to/file.yaml"
                    // strip the top-level folder prefix so paths match !include references
                    const rel = f.webkitRelativePath || f.name;
                    const key = rel.includes('/') ? rel.slice(rel.indexOf('/') + 1) : rel;
                    map[key] = content;
                })
            );
            await Promise.all(loads);
            this.fileMap = map;

            const candidates = this._detectRootYaml(map);
            if (candidates.length === 0) { alert('No YAML file found in folder.'); return; }
            if (candidates.length === 1) {
                this.yamlEditor.value = map[candidates[0]];
                this.renderFromEditor();
            } else {
                this._showDevicePicker(candidates, map);
            }
        } catch (error) {
            console.error('Error loading folder:', error);
            alert('Error loading folder: ' + error.message);
        }
    }

    _detectRootYaml(map) {
        const yamls = Object.keys(map).filter(k => /\.(yaml|yml)$/i.test(k));
        if (yamls.length === 0) return [];
        const rootLevel = yamls.filter(k => !k.includes('/'));
        const pool = rootLevel.length > 0 ? rootLevel : yamls;
        const withEsphome = pool.filter(k => /^esphome\s*:/m.test(map[k]));
        if (withEsphome.length > 0) return withEsphome;
        // Fallback: no esphome: key found — return all candidates
        return pool.sort();
    }

    _showDevicePicker(candidates, map) {
        const existing = document.getElementById('lvgl-device-picker-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'lvgl-device-picker-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#1e1e2e;border:1px solid #444;border-radius:8px;padding:24px;min-width:280px;max-width:480px;';

        const title = document.createElement('div');
        title.textContent = 'Select device config';
        title.style.cssText = 'font-size:14px;font-weight:600;color:#ccc;margin-bottom:16px;';
        box.appendChild(title);

        const select = document.createElement('select');
        select.style.cssText = 'width:100%;padding:8px;background:#2a2a3e;color:#ddd;border:1px solid #555;border-radius:4px;font-size:13px;';
        candidates.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c.split('/').pop();
            select.appendChild(opt);
        });
        box.appendChild(select);

        const btn = document.createElement('button');
        btn.textContent = 'Load';
        btn.style.cssText = 'margin-top:16px;width:100%;padding:8px;background:#4a9eff;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;';
        btn.onclick = () => {
            this.yamlEditor.value = map[select.value];
            this.renderFromEditor();
            modal.remove();
        };
        box.appendChild(btn);

        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        modal.appendChild(box);
        document.body.appendChild(modal);
    }

    loadExampleConfig() {
        fetch('./example_config.yaml')
            .then(response => response.text())
            .then(text => {
                this.yamlEditor.value = text;
                this.renderFromEditor();
            })
            .catch(() => {
                const fallback = `display:
  - platform: rpi_dpi_rgb
    dimensions:
      width: 466
      height: 466

lvgl:
  color_depth: 16
  pages:
    - id: main_page
      widgets:
        - obj:
            align: CENTER
            width: 100%
            height: 100%
            bg_color: 0x0a0a1a
            border_opa: TRANSP
            widgets:
              - label:
                  align: CENTER
                  text: "Load your waveshare-175.yaml"
                  text_color: 0x4DA6FF
`;
                this.yamlEditor.value = fallback;
                this.renderFromEditor();
            });
    }

    async renderFromEditor() {
        let raw = '';
        try {
            this.store.clear();
            raw = this.yamlEditor.value;
            this._detectedFeatures = detectFeatures(raw);

            // Determine base URL from the config URL input (if present)
            const urlInputEl = document.getElementById('configFileUrl');
            const inputUrl = urlInputEl ? urlInputEl.value.trim() : '';
            const baseUrl = inputUrl ? new URL('.', inputUrl).href : null;

            // If there are locally uploaded files, use the old resolver path first
            const resolved = await resolveIncludes(raw, this.fileMap);

            // Use the async preprocessor that handles packages: and remote !include
            const config = await preprocessAndResolve(resolved, baseUrl, this.fileMap || {});
            this.config = config;
            // Merge secrets into substitutions so supabase_url etc. resolve via either path
            this._secrets = config ? (config.__secrets || {}) : {};
            this.substitutions = config
                ? Object.assign({}, config.__secrets || {}, config.__substitutions || {})
                : {};

            // Show package warning if needed
            this._showPackageWarnings(config && config.__packageWarnings);

            this.currentPageIndex = 0;
            this._lastRaw = raw;
            this.render();
            const pageId = this.pages[0]?.id || null;
            this.buildYamlTabs(raw, pageId);
        } catch (error) {
            console.error('Error parsing YAML:', error);
            this.displayYAMLError(error, raw);
            const summaryEl = document.getElementById('entitySummary');
            if (summaryEl) summaryEl.style.display = 'none';
        }
    }

    _showPackageWarnings(warnings) {
        // Remove any existing warning
        const existing = document.getElementById('packageWarningBanner');
        if (existing) existing.remove();

        if (!warnings || warnings.length === 0) return;

        const banner = document.createElement('div');
        banner.id = 'packageWarningBanner';
        banner.style.cssText = [
            'background:#7a3a00', 'color:#ffd580', 'padding:8px 12px',
            'font-size:13px', 'border-radius:4px', 'margin:4px 0',
            'white-space:pre-wrap'
        ].join(';');
        banner.textContent = '⚠ Some package files could not be loaded. Enter the config file URL above for full resolution.\n'
            + warnings.map(w => '  • ' + w).join('\n');

        // Insert above the textarea
        const editor = document.getElementById('yamlEditor');
        if (editor && editor.parentNode) {
            editor.parentNode.insertBefore(banner, editor);
        }
    }

    parseGlobals() {
        const globals = this.config.globals || [];
        globals.forEach(g => {
            if (!g.id) return;

            // Auto-enable sim_mode for browser simulation
            // (BLE devices never connect in browser; sim_mode=true makes D5 generate data itself)
            if (g.id === 'sim_mode') {
                this.store.register(g.id, {
                    entityType: 'global',
                    type: 'boolean',
                    cppType: 'bool',
                    initialValue: true,
                    restoreValue: false,
                });
                this.store.set(g.id, true);
                return;
            }

            const cppType = (g.type || 'float').trim();
            const simType = this._mapCppType(cppType);
            const rawInitial = g.initial_value !== undefined ? String(g.initial_value) : undefined;
            let initialValue;
            if (rawInitial === 'nullptr' || rawInitial === 'NULL') {
                initialValue = null;
            } else {
                initialValue = rawInitial !== undefined
                    ? this._coerceGlobalValue(rawInitial, simType)
                    : this._defaultForType(simType);
            }

            this.store.register(g.id, {
                entityType: 'global',
                type: simType,
                cppType: cppType,
                initialValue,
                restoreValue: g.restore_value ?? false,
            });
        });
    }

    _mapCppType(cpp) {
        if (!cpp) return 'integer';
        const t = String(cpp).trim();
        if (t === 'bool') return 'boolean';
        if (t === 'std::string' || t === 'string') return 'string';
        if (/^(float|double)$/.test(t)) return 'float';
        // Pointer types (lv_obj_t *, lv_chart_t *, etc.) — stored as handles (numbers or null)
        if (t.includes('*') || t.includes('_t')) return 'pointer';
        return 'integer'; // int, uint8_t, uint16_t, etc.
    }

    _coerceGlobalValue(raw, simType) {
        // C++ string literals use double quotes: '"AUTO"' → 'AUTO'
        const stripped = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        if (simType === 'boolean') return stripped === 'true' || stripped === '1';
        if (simType === 'float') return parseFloat(stripped) || 0;
        if (simType === 'integer') return parseInt(stripped) || 0;
        return stripped; // string
    }

    _defaultForType(simType) {
        if (simType === 'boolean') return false;
        if (simType === 'float' || simType === 'integer') return 0;
        return '';
    }

    _collectOnValueHandlers() {
        this._onValueHandlers = {}; // { sensorId: lambdaStr }

        const componentTypes = ['sensor', 'binary_sensor', 'text_sensor', 'number', 'switch', 'select'];
        // globals uses plural key; include it alongside the standard component types
        const allComponents = componentTypes.flatMap(t => [].concat(this.config[t] || []));
        allComponents.push(...[].concat(this.config.globals || []));

        for (const comp of allComponents) {
                const id = comp.id;
                if (!id) continue;

                const onValue = comp.on_value;
                if (!onValue) continue;

                // Handle multiple YAML forms:
                //   on_value: !lambda |...         → string after preprocessor encodes as __lambda__:...
                //   on_value: - lambda: |...        → array with {lambda: str}
                //   on_value: then: - lambda: |...  → object with .then array
                let lambdaStr = null;
                if (typeof onValue === 'string') {
                    lambdaStr = onValue;
                } else if (Array.isArray(onValue)) {
                    for (const action of onValue) {
                        if (action?.lambda) { lambdaStr = action.lambda; break; }
                        if (action?.then) {
                            for (const a of (Array.isArray(action.then) ? action.then : [action.then])) {
                                if (a?.lambda) { lambdaStr = a.lambda; break; }
                            }
                            if (lambdaStr) break;
                        }
                    }
                } else if (onValue?.then) {
                    const then = Array.isArray(onValue.then) ? onValue.then : [onValue.then];
                    for (const a of then) {
                        if (a?.lambda) { lambdaStr = a.lambda; break; }
                    }
                } else if (onValue?.lambda) {
                    lambdaStr = onValue.lambda;
                }

                if (lambdaStr) this._onValueHandlers[id] = lambdaStr;
        }
    }

    _wireOnValueHandlers() {
        if (!this._onValueHandlers) return;

        // Unsubscribe any previous on_value subscriptions
        if (this._onValueUnsubs) {
            this._onValueUnsubs.forEach(unsub => unsub());
        }
        this._onValueUnsubs = [];

        function debounce(fn, ms) {
            let t;
            return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
        }

        Object.entries(this._onValueHandlers).forEach(([sensorId, lambdaStr]) => {
            const handler = debounce((newValue) => {
                this.lambda._proxy = this._buildLVGLProxy();
                this.lambda.evaluateWithX(lambdaStr, newValue);
            }, 100);

            const unsub = this.store.subscribe(sensorId, handler);
            this._onValueUnsubs.push(unsub);
        });
    }

    render() {
        if (!this.config || !this.config.lvgl) {
            this.displayError('No LVGL configuration found');
            return;
        }

        this._stopIntervalRunner();
        if (this._storeUnsub) { this._storeUnsub(); this._storeUnsub = null; }
        if (this._onValueUnsubs) { this._onValueUnsubs.forEach(u => u()); this._onValueUnsubs = []; }
        if (this._rerenderTimer) { clearTimeout(this._rerenderTimer); this._rerenderTimer = null; }

        try {
            this._topLayerEl = null;
            this.styleDefinitions = {};
            (this.config.lvgl.style_definitions || []).forEach(def => {
                if (def.id) {
                    const { id, ...props } = def;
                    this.styleDefinitions[id] = props;
                }
            });

            this.theme = {};
            const themeCfg = this.config.lvgl.theme || {};
            Object.keys(themeCfg).forEach(type => {
                this.theme[type] = themeCfg[type];
            });

            // Global defaults from the lvgl: root (lowest priority, overridden by widget config)
            this._globalWidgetDefaults = {};
            if (this.config.lvgl.text_font) this._globalWidgetDefaults.text_font = this.config.lvgl.text_font;
            if (this.config.lvgl.align)     this._globalWidgetDefaults.align     = this.config.lvgl.align;

            this.parseGlobals();
            this.parseSensorComponents();
            this.setupDisplay();
            this.pages = this.config.lvgl.pages || [];
            this.pageWrap = this.config?.lvgl?.page_wrap ?? true;

            // Register pages in store so id(page_id)->index works in lambdas
            if (this.pages) {
                this.pages.forEach((page, idx) => {
                    if (page.id) this.store.set(page.id, { index: idx, id: page.id });
                });
            }

            if (this.pages.length === 0) {
                this.displayError('No pages found in configuration');
                return;
            }

            this._collectOnValueHandlers();
            this._wireOnValueHandlers();

            this._collectIntervalHandlers();
            const countEl = document.getElementById('intervalCount');
            if (countEl) countEl.textContent = `${this._intervalHandlers.length} handler${this._intervalHandlers.length !== 1 ? 's' : ''}`;

            this._buildGPIOPanel();

            this.populatePageSelect();
            this.buildPageList();
            this.renderCurrentPage();
            this.updateEntitySummary();
            this.buildDrivePanel();
            this._maybeShowSupabasePanel();
            this._storeUnsub = this.store.subscribeAll(() => this._scheduleRerender());
        } catch (error) {
            console.error('Error rendering:', error);
            this.displayError('Render Error: ' + error.message);
        }
    }

    parseSensorComponents() {
        const sensors = this.config.sensor || [];
        [].concat(sensors).forEach(s => {
            if (!s.id) return;
            this.store.register(s.id, {
                entityType: 'sensor',
                type: 'float',
                name: s.name || s.id,
                unit: s.unit_of_measurement || '',
                decimals: s.accuracy_decimals ?? 1,
                min: s.min_value,
                max: s.max_value,
                platform: s.platform || 'unknown',
                initialValue: null,
            });
        });

        const binarySensors = this.config.binary_sensor || [];
        [].concat(binarySensors).forEach(s => {
            if (!s.id) return;
            this.store.register(s.id, {
                entityType: 'binary_sensor',
                type: 'boolean',
                name: s.name || s.id,
                deviceClass: s.device_class || '',
                initialValue: false,
            });
        });

        const textSensors = this.config.text_sensor || [];
        [].concat(textSensors).forEach(s => {
            if (!s.id) return;
            this.store.register(s.id, {
                entityType: 'text_sensor',
                type: 'string',
                name: s.name || s.id,
                initialValue: '',
            });
        });

        const numbers = this.config.number || [];
        [].concat(numbers).forEach(s => {
            if (!s.id) return;
            this.store.register(s.id, {
                entityType: 'number',
                type: 'float',
                name: s.name || s.id,
                unit: s.unit_of_measurement || '',
                min: s.min_value ?? 0,
                max: s.max_value ?? 100,
                step: s.step ?? 1,
                initialValue: s.initial_value ?? s.min_value ?? 0,
            });
        });
    }

    setupDisplay() {
        const display = this.config.display?.[0];
        const lvgl = this.config.lvgl;

        // Default to 466x466 for Waveshare 1.75" AMOLED
        let width = display?.dimensions?.width || 466;
        let height = display?.dimensions?.height || 466;
        const colorDepth = lvgl?.color_depth || 16;

        // Override with user-selected preset if set
        if (this.displayOverride) {
            width = this.displayOverride.width;
            height = this.displayOverride.height;
        }

        this.displayWidth = width;
        this.displayHeight = height;

        this.displayElement.style.width = width + 'px';
        this.displayElement.style.height = height + 'px';

        const captionEl = document.getElementById('top-bar-caption');
        if (captionEl) captionEl.textContent = `${width}×${height} · ${colorDepth}-bit`;
        const displaySizeEl = document.getElementById('displaySize');
        if (displaySizeEl) displaySizeEl.textContent = `${width}x${height}`;
        const colorDepthEl = document.getElementById('colorDepth');
        if (colorDepthEl) colorDepthEl.textContent = `${colorDepth}-bit`;

        // Re-apply rotation after display size changes
        this._applyRotation();
    }

    _applyRotation() {
        const display = this.displayElement;
        const rot = this._currentRotation;
        const baseW = this.displayWidth || 466;
        const baseH = this.displayHeight || 466;

        // Effective visual dimensions after rotation
        const effectiveW = (rot === 90 || rot === 270) ? baseH : baseW;
        const effectiveH = (rot === 90 || rot === 270) ? baseW : baseH;

        // Auto-scale: fit display within hero-void container (12px margin each side)
        const container = document.getElementById('hero-void');
        let scale = 1;
        if (container && container.clientWidth > 0) {
            const availW = container.clientWidth - 24;
            const availH = container.clientHeight - 24;
            if (availW > 0 && availH > 0) {
                scale = Math.min(1, availW / effectiveW, availH / effectiveH);
            }
        }
        // CSS zoom affects layout (unlike transform), so flex centering works naturally;
        // margin compensation for rotation is specified pre-zoom (zoom auto-scales it)
        display.style.zoom = scale < 0.999 ? scale.toFixed(4) : '';
        display.style.width = baseW + 'px';
        display.style.height = baseH + 'px';
        display.style.transform = rot !== 0 ? `rotate(${rot}deg)` : '';

        if (rot === 90 || rot === 270) {
            const offset = (baseW - baseH) / 2;
            display.style.marginLeft = offset + 'px';
            display.style.marginRight = offset + 'px';
        } else {
            display.style.marginLeft = '';
            display.style.marginRight = '';
        }
    }

    setRotation(deg) {
        this._currentRotation = deg;
        const select = document.getElementById('rotationSelect');
        if (select) select.value = String(deg);
        this._applyRotation();
    }

    populatePageSelect() {
        this.pageSelect.innerHTML = '';
        this.pages.forEach((page, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `[${idx}] ${page.id || 'page_' + idx}`;
            this.pageSelect.appendChild(opt);
        });
        this.syncPageSelect();
    }

    syncPageSelect() {
        this.pageSelect.value = this.currentPageIndex;
        this.pageInfo.textContent = `${this.currentPageIndex + 1} / ${this.pages.length}`;
        const wrap = this.pageWrap ?? true;
        document.getElementById('prevPage').disabled = this.currentPageIndex === 0 && !wrap;
        document.getElementById('nextPage').disabled = this.currentPageIndex === this.pages.length - 1 && !wrap;

        // Update page selector pill
        const pillIndex = document.getElementById('page-selector-index');
        const pillTitle = document.getElementById('page-selector-title');
        const curPage = this.pages[this.currentPageIndex];
        if (pillIndex) pillIndex.textContent = `${this.currentPageIndex + 1}/${this.pages.length}`;
        if (pillTitle) pillTitle.textContent = curPage?.id ? this.pageDisplayTitle(curPage.id) : `Page ${this.currentPageIndex + 1}`;

        // Highlight active row in left rail
        document.querySelectorAll('.page-list-row').forEach((row, idx) => {
            row.classList.toggle('active', idx === this.currentPageIndex);
        });
    }

    buildPageList() {
        const listEl = document.getElementById('page-list');
        const countEl = document.getElementById('page-count-badge');
        if (!listEl) return;
        listEl.innerHTML = '';
        if (countEl) countEl.textContent = this.pages.length;
        this.pages.forEach((page, idx) => {
            const row = document.createElement('div');
            row.className = 'page-list-row' + (idx === this.currentPageIndex ? ' active' : '');
            row.innerHTML = `
                <span class="page-list-row__index">${idx + 1}</span>
                <span class="page-list-row__dot"></span>
                <span class="page-list-row__title">${page.id ? this.pageDisplayTitle(page.id) : `page_${idx}`}</span>
            `;
            row.addEventListener('click', () => {
                this.currentPageIndex = idx;
                this.syncPageSelect();
                this.renderCurrentPage('NONE');
            });
            listEl.appendChild(row);
        });
    }

    _scheduleRerender() {
        if (this._rerenderTimer) clearTimeout(this._rerenderTimer);
        this._rerenderTimer = setTimeout(() => {
            this._rerenderTimer = null;
            this._rerenderCurrentPage();
        }, 50);
    }

    _rerenderCurrentPage() {
        if (this.config) this.setupDisplay();
        this.displayElement.innerHTML = '';
        const page = this.pages[this.currentPageIndex];
        if (page) this.renderPage(page);
    }

    _buildLVGLProxy() {
        const proxy = buildLVGLProxy(this._renderedElements, (pageId) => {
            const idx = this.pages.findIndex(p => p.id === pageId);
            if (idx >= 0) {
                this.currentPageIndex = idx;
                this.syncPageSelect();
                this.renderCurrentPage('NONE');
            }
        }, this);

        if (!this._screensaver) {
            this._screensaver = new ScreensaverSimulator(this.store, proxy, this);
        } else {
            this._screensaver._proxy = proxy;
        }

        // Expose for test access
        this._proxy = proxy;

        return proxy;
    }

    setPaused(paused) {
        // When unpaused, treat as activity (wake from screensaver if active)
        if (!paused && this._screensaver) this._screensaver.triggerActivity();
    }

    renderCurrentPage(animType = 'NONE', duration = null) {
        if (this._onLoadTimer) {
            clearTimeout(this._onLoadTimer);
            this._onLoadTimer = null;
        }
        const page = this.pages[this.currentPageIndex];
        if (!page) { this.syncPageSelect(); return; }

        if (animType === 'NONE') {
            this.displayElement.innerHTML = '';
            this.renderPage(page);
            this.syncPageSelect();
            if (this._lastRaw) {
                const pageId = this.pages[this.currentPageIndex]?.id || null;
                this.buildYamlTabs(this._lastRaw, pageId);
            }
            return;
        }

        // Directional slide animation
        const enterClassMap = {
            MOVE_LEFT:   'page-enter-right',
            MOVE_RIGHT:  'page-enter-left',
            MOVE_TOP:    'page-enter-bottom',
            MOVE_BOTTOM: 'page-enter-top',
        };
        const exitClassMap = {
            MOVE_LEFT:   'page-exit-left',
            MOVE_RIGHT:  'page-exit-right',
            MOVE_TOP:    'page-exit-top',
            MOVE_BOTTOM: 'page-exit-bottom',
        };

        const enterClass = enterClassMap[animType] || 'page-enter-right';
        const exitClass  = exitClassMap[animType]  || 'page-exit-left';

        // Wrap existing content in a wrapper div (old page)
        const oldWrapper = document.createElement('div');
        oldWrapper.className = 'lvgl-page-wrapper';
        while (this.displayElement.firstChild) {
            oldWrapper.appendChild(this.displayElement.firstChild);
        }
        this.displayElement.appendChild(oldWrapper);

        // Build new page content in a wrapper div
        const newWrapper = document.createElement('div');
        newWrapper.className = `lvgl-page-wrapper ${enterClass}`;
        this.renderPageInto(page, newWrapper);
        this.displayElement.appendChild(newWrapper);

        // Double-rAF to ensure initial classes are painted before transition starts
        const transMs = duration ?? 200;
        oldWrapper.style.transition = `transform ${transMs}ms ease-in-out`;
        newWrapper.style.transition = `transform ${transMs}ms ease-in-out`;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                oldWrapper.classList.add(exitClass);
                newWrapper.classList.remove(enterClass);
                setTimeout(() => {
                    oldWrapper.remove();
                }, transMs + 10);
            });
        });

        this.syncPageSelect();
        if (this._lastRaw) {
            const pageId = this.pages[this.currentPageIndex]?.id || null;
            this.buildYamlTabs(this._lastRaw, pageId);
        }
    }

    renderPage(page) {
        this.renderPageInto(page, this.displayElement);
    }

    renderPageInto(page, container) {
        // Preserve top-layer element registrations across page navigation
        this._renderedElements = {};
        if (this._topLayerEl) {
            this._topLayerEl.querySelectorAll('[data-lvgl-id]').forEach(el => {
                this._renderedElements[el.dataset.lvglId] = el;
            });
        }
        this._deferredAlignments = [];

        const pageEl = document.createElement('div');
        pageEl.className = 'lvgl-page';
        pageEl.style.cssText = 'position:absolute;width:100%;height:100%;top:0;left:0;';

        if (page.bg_color) pageEl.style.backgroundColor = this.parseColor(page.bg_color);
        this.applyLayout(pageEl, page);

        if (page.scrollable === true) {
            pageEl.style.overflowY = 'auto';
            pageEl.style.overflowX = 'hidden';
        }

        if (page.widgets) {
            page.widgets.forEach(w => {
                const el = this.renderWidget(w, pageEl);
                if (el) pageEl.appendChild(el);
            });
        }

        container.appendChild(pageEl);
        this._resolveAlignments();

        // Wire up the proxy now that _renderedElements is populated
        this.lambda._proxy = this._buildLVGLProxy();

        // Render top_layer widgets on top of page content (persistent across page navigation)
        this._ensureTopLayer();

        // Fire on_load handler if present
        if (page.on_load) {
            this._onLoadTimer = setTimeout(() => {
                this._onLoadTimer = null;
                this.lambda._proxy = this._buildLVGLProxy();
                this.lambda.evaluate(page.on_load, null);
            }, 50);
        }

        // Populate widget tree in right rail
        this.buildWidgetTree();
    }

    _ensureTopLayer() {
        const topLayerCfg = this.config?.lvgl?.top_layer;
        if (!topLayerCfg?.widgets) return;

        // Create once and keep — only rebuild when config changes (render() resets _topLayerEl)
        if (this._topLayerEl && document.body.contains(this._topLayerEl)) return;

        const display = document.getElementById(this._displayElId || 'lvglDisplay');
        if (!display) return;

        // Remove old one if it exists but got detached
        if (this._topLayerEl) this._topLayerEl.remove();

        const topEl = document.createElement('div');
        topEl.id = 'lvgl-top-layer';
        topEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;overflow:hidden;';

        topLayerCfg.widgets.forEach(w => {
            const el = this.renderWidget(w, topEl);
            if (el) {
                // Top-layer widgets need pointer events for buttons/interactive elements
                el.style.pointerEvents = 'auto';
                topEl.appendChild(el);
            }
        });

        display.appendChild(topEl);
        this._topLayerEl = topEl;

        // Re-register top-layer elements now that they exist
        topEl.querySelectorAll('[data-lvgl-id]').forEach(el => {
            this._renderedElements[el.dataset.lvglId] = el;
        });

        // Fire on_load for top_layer if present
        if (topLayerCfg.on_load) {
            setTimeout(() => {
                this.lambda._proxy = this._buildLVGLProxy();
                this.lambda.evaluate(topLayerCfg.on_load, null);
            }, 50);
        }
    }

    _resolveAlignments() {
        for (const { el, alignTo } of this._deferredAlignments) {
            const targetEl = this._renderedElements[alignTo.id];
            if (!targetEl) continue;

            const tl = targetEl.offsetLeft;
            const tt = targetEl.offsetTop;
            const tw = targetEl.offsetWidth;
            const th = targetEl.offsetHeight;
            const ew = el.offsetWidth;
            const eh = el.offsetHeight;
            const ox = alignTo.x ?? 0;
            const oy = alignTo.y ?? 0;

            el.style.position = 'absolute';

            switch ((alignTo.align || '').toUpperCase()) {
                case 'OUT_TOP_LEFT':
                    el.style.left = (tl + ox) + 'px';
                    el.style.top  = (tt - eh + oy) + 'px';
                    break;
                case 'OUT_TOP_MID':
                    el.style.left = (tl + tw/2 - ew/2 + ox) + 'px';
                    el.style.top  = (tt - eh + oy) + 'px';
                    break;
                case 'OUT_TOP_RIGHT':
                    el.style.left = (tl + tw - ew + ox) + 'px';
                    el.style.top  = (tt - eh + oy) + 'px';
                    break;
                case 'OUT_BOTTOM_LEFT':
                    el.style.left = (tl + ox) + 'px';
                    el.style.top  = (tt + th + oy) + 'px';
                    break;
                case 'OUT_BOTTOM_MID':
                    el.style.left = (tl + tw/2 - ew/2 + ox) + 'px';
                    el.style.top  = (tt + th + oy) + 'px';
                    break;
                case 'OUT_BOTTOM_RIGHT':
                    el.style.left = (tl + tw - ew + ox) + 'px';
                    el.style.top  = (tt + th + oy) + 'px';
                    break;
                case 'OUT_LEFT_TOP':
                    el.style.left = (tl - ew + ox) + 'px';
                    el.style.top  = (tt + oy) + 'px';
                    break;
                case 'OUT_LEFT_MID':
                    el.style.left = (tl - ew + ox) + 'px';
                    el.style.top  = (tt + th/2 - eh/2 + oy) + 'px';
                    break;
                case 'OUT_LEFT_BOTTOM':
                    el.style.left = (tl - ew + ox) + 'px';
                    el.style.top  = (tt + th - eh + oy) + 'px';
                    break;
                case 'OUT_RIGHT_TOP':
                    el.style.left = (tl + tw + ox) + 'px';
                    el.style.top  = (tt + oy) + 'px';
                    break;
                case 'OUT_RIGHT_MID':
                    el.style.left = (tl + tw + ox) + 'px';
                    el.style.top  = (tt + th/2 - eh/2 + oy) + 'px';
                    break;
                case 'OUT_RIGHT_BOTTOM':
                    el.style.left = (tl + tw + ox) + 'px';
                    el.style.top  = (tt + th - eh + oy) + 'px';
                    break;
                default:
                    el.style.left = ox + 'px';
                    el.style.top  = oy + 'px';
            }
        }
    }

    renderWidget(widget, parent) {
        const type = Object.keys(widget)[0];
        const cfg = widget[type];
        this.currentWidgetType = type;

        let el;
        switch (type) {
            case 'obj':      el = this.renderObj(cfg, parent);      break;
            case 'label':    el = this.renderLabel(cfg, parent);    break;
            case 'arc':      el = this.renderArc(cfg, parent);      break;
            case 'button':   el = this.renderButton(cfg, parent);   break;
            case 'bar':      el = this.renderBar(cfg, parent);      break;
            case 'slider':   el = this.renderSlider(cfg, parent);   break;
            case 'checkbox': el = this.renderCheckbox(cfg, parent); break;
            case 'img':      el = this.renderImg(cfg, parent);      break;
            case 'roller':   el = this.renderRoller(cfg, parent);   break;
            case 'spinner':  el = this.renderSpinner(cfg, parent);  break;
            case 'switch':   el = this.renderSwitch(cfg, parent);   break;
            case 'dropdown': el = this.renderDropdown(cfg, parent); break;
            case 'line':     el = this.renderLine(cfg, parent);     break;
            case 'led':      el = this.renderLed(cfg, parent);      break;
            case 'meter':    el = this.renderMeter(cfg, parent);    break;
            case 'chart':    el = this.renderChart(cfg, parent);    break;
            default:
                console.warn(`Unsupported widget: ${type}`);
                el = this.renderUnsupported(type, cfg, parent);
        }

        if (el) {
            if (cfg && cfg.id) {
                this._renderedElements[cfg.id] = el;
                el.dataset.lvglId = cfg.id;
                el.dataset.widgetId = cfg.id;
            }
            if (cfg) {
                const widgetType = type;
                el.style.cursor = 'pointer';
                el.addEventListener('click', e => {
                    e.stopPropagation();
                    this.selectWidget(cfg.id || null, cfg, widgetType);
                });
            }
            if (cfg && cfg.align_to) this._deferredAlignments.push({ el, alignTo: cfg.align_to });
        }
        return el;
    }

    resolveStyles(config) {
        const globalDefaults = this._globalWidgetDefaults || {};
        const themeDefaults = (this.theme || {})[this.currentWidgetType] || {};
        const mainPart = (typeof config.main === 'object' && !Array.isArray(config.main)) ? config.main : {};
        const ids = config.styles
            ? (Array.isArray(config.styles) ? config.styles : [config.styles])
            : [];
        let resolved = {};
        resolved = deepMergeStyles(resolved, globalDefaults);
        resolved = deepMergeStyles(resolved, themeDefaults);
        resolved = deepMergeStyles(resolved, mainPart);
        ids.forEach(id => {
            const s = this.styleDefinitions[id];
            if (s) resolved = deepMergeStyles(resolved, s);
        });
        resolved = deepMergeStyles(resolved, config);
        return resolved;
    }

    _deepMerge(target, source) {
        Object.keys(source || {}).forEach(key => {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                target[key] = this._deepMerge(target[key] || {}, source[key]);
            } else {
                target[key] = source[key];
            }
        });
        return target;
    }

    renderUnsupported(type, config, parent) {
        const el = document.createElement('div');
        el.className = 'lvgl-unsupported';
        el.textContent = `[${type}]`;
        el.style.cssText = 'position:absolute;background:#2a1a2a;border:1px dashed #664466;color:#aa88aa;font-size:11px;padding:2px 4px;border-radius:3px;';
        this.applyCommonStyles(el, config);
        return el;
    }

    applyCommonStyles(el, config) {
        this.applyPosition(el, config);
        this.applySize(el, config);

        if (config.bg_color !== undefined) {
            if (config.bg_grad_color && config.bg_grad_dir) {
                const dir = this.parseGradientDirection(config.bg_grad_dir);
                el.style.background = `linear-gradient(${dir}, ${this.parseColor(config.bg_color)}, ${this.parseColor(config.bg_grad_color)})`;
            } else {
                el.style.backgroundColor = this.parseColor(config.bg_color);
            }
        }

        if (config.bg_opa !== undefined && this.parseOpacity(config.bg_opa) < 0.01) {
            el.style.backgroundColor = 'transparent';
        }

        if (config.border_width > 0) {
            el.style.borderWidth = config.border_width + 'px';
            el.style.borderStyle = 'solid';
            if (config.border_color) el.style.borderColor = this.parseColor(config.border_color);
        }
        if (config.border_opa !== undefined && this.parseOpacity(config.border_opa) < 0.01) {
            el.style.borderColor = 'transparent';
        }

        if (config.border_side !== undefined) {
            const sides = (typeof config.border_side === 'string' ? config.border_side : String(config.border_side)).toUpperCase();
            if (sides === 'NONE') {
                el.style.borderWidth = '0';
            } else if (sides !== 'FULL') {
                const bw = (config.border_width || 0) + 'px';
                el.style.borderTopWidth    = sides.includes('TOP')    ? bw : '0';
                el.style.borderBottomWidth = sides.includes('BOTTOM') ? bw : '0';
                el.style.borderLeftWidth   = sides.includes('LEFT')   ? bw : '0';
                el.style.borderRightWidth  = sides.includes('RIGHT')  ? bw : '0';
            }
        }

        if (config.shadow_width > 0) {
            const sx = config.shadow_offset_x ?? 0;
            const sy = config.shadow_offset_y ?? 0;
            const shadowHex = config.shadow_color ? this.parseColor(config.shadow_color) : '#000000';
            const opa = config.shadow_opa !== undefined ? this.parseOpacity(config.shadow_opa) : 0.5;
            const m = shadowHex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
            const shadowColor = m
                ? `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${opa.toFixed(2)})`
                : shadowHex;
            el.style.boxShadow = `${sx}px ${sy}px ${config.shadow_width}px ${shadowColor}`;
        }

        if (config.radius !== undefined) {
            el.style.borderRadius = config.radius >= 100 ? '50%' : config.radius + 'px';
        }

        if (config.pad_all !== undefined) {
            el.style.padding = config.pad_all + 'px';
        } else {
            if (config.pad_left !== undefined)   el.style.paddingLeft   = config.pad_left   + 'px';
            if (config.pad_right !== undefined)  el.style.paddingRight  = config.pad_right  + 'px';
            if (config.pad_top !== undefined)    el.style.paddingTop    = config.pad_top    + 'px';
            if (config.pad_bottom !== undefined) el.style.paddingBottom = config.pad_bottom + 'px';
        }

        if (config.clip_corner || config.scrollable === false) {
            el.style.overflow = 'hidden';
        }

        if (config.opacity !== undefined) {
            el.style.opacity = this.parseOpacity(config.opacity).toFixed(3);
        }

        // Grid child placement
        if (config.grid_cell_column_pos !== undefined) {
            el.style.gridColumnStart = config.grid_cell_column_pos + 1; // CSS is 1-based
        }
        if (config.grid_cell_row_pos !== undefined) {
            el.style.gridRowStart = config.grid_cell_row_pos + 1;
        }
        if (config.grid_cell_column_span !== undefined && config.grid_cell_column_span > 1) {
            el.style.gridColumnEnd = `span ${config.grid_cell_column_span}`;
        }
        if (config.grid_cell_row_span !== undefined && config.grid_cell_row_span > 1) {
            el.style.gridRowEnd = `span ${config.grid_cell_row_span}`;
        }
        // Flex child sizing
        if (config.flex_grow !== undefined) el.style.flexGrow = config.flex_grow;
        if (config.flex_shrink !== undefined) el.style.flexShrink = config.flex_shrink;
        if (config.flex_basis !== undefined) el.style.flexBasis =
            typeof config.flex_basis === 'number' ? config.flex_basis + 'px' : config.flex_basis;

        if (config.grid_cell_x_align) {
            const a = config.grid_cell_x_align.toUpperCase();
            el.style.justifySelf = a === 'CENTER' ? 'center' : a === 'STRETCH' ? 'stretch' : a === 'END' ? 'end' : 'start';
        }
        if (config.grid_cell_y_align) {
            const a = config.grid_cell_y_align.toUpperCase();
            el.style.alignSelf = a === 'CENTER' ? 'center' : a === 'STRETCH' ? 'stretch' : a === 'END' ? 'end' : 'start';
        }
    }

    applyPosition(el, config) {
        // Grid children use flow positioning — absolute would break grid placement
        if (config.grid_cell_column_pos !== undefined || config.grid_cell_row_pos !== undefined) {
            return;
        }
        const align = (config.align || '').toUpperCase();
        if (!align && config.x === undefined && config.y === undefined) return;

        el.style.position = 'absolute';
        const ox = config.x ?? 0;
        const oy = config.y ?? 0;

        switch (align) {
            case 'CENTER':
                el.style.left = '50%';
                el.style.top = '50%';
                el.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
                return;
            case 'TOP_CENTER':
            case 'TOP_MID':
                el.style.left = '50%';
                el.style.top = oy + 'px';
                el.style.transform = `translateX(calc(-50% + ${ox}px))`;
                return;
            case 'BOTTOM_CENTER':
            case 'BOTTOM_MID':
                el.style.left = '50%';
                el.style.bottom = (-oy) + 'px';
                el.style.transform = `translateX(calc(-50% + ${ox}px))`;
                return;
            case 'LEFT_CENTER':
            case 'LEFT_MID':
                el.style.left = ox + 'px';
                el.style.top = '50%';
                el.style.transform = `translateY(calc(-50% + ${oy}px))`;
                return;
            case 'RIGHT_CENTER':
            case 'RIGHT_MID':
                el.style.right = (-ox) + 'px';
                el.style.top = '50%';
                el.style.transform = `translateY(calc(-50% + ${oy}px))`;
                return;
            case 'TOP_LEFT':
                el.style.left = ox + 'px';
                el.style.top = oy + 'px';
                return;
            case 'TOP_RIGHT':
                el.style.right = (-ox) + 'px';
                el.style.top = oy + 'px';
                return;
            case 'BOTTOM_LEFT':
                el.style.left = ox + 'px';
                el.style.bottom = (-oy) + 'px';
                return;
            case 'BOTTOM_RIGHT':
                el.style.right = (-ox) + 'px';
                el.style.bottom = (-oy) + 'px';
                return;
            default:
                if (config.x !== undefined) el.style.left = config.x + 'px';
                if (config.y !== undefined) el.style.top  = config.y + 'px';
        }
    }

    applySize(el, config) {
        if (config.width !== undefined) {
            if (config.width === 'SIZE_CONTENT' || config.width === 'LV_SIZE_CONTENT') el.style.width = 'max-content';
            else el.style.width = typeof config.width === 'string' && config.width.includes('%')
                ? config.width : config.width + 'px';
        }
        if (config.height !== undefined) {
            if (config.height === 'SIZE_CONTENT' || config.height === 'LV_SIZE_CONTENT') el.style.height = 'max-content';
            else el.style.height = typeof config.height === 'string' && config.height.includes('%')
                ? config.height : config.height + 'px';
        }
        if (config.min_width  !== undefined) el.style.minWidth  = config.min_width  + 'px';
        if (config.max_width  !== undefined) el.style.maxWidth  = config.max_width  + 'px';
        if (config.min_height !== undefined) el.style.minHeight = config.min_height + 'px';
        if (config.max_height !== undefined) el.style.maxHeight = config.max_height + 'px';
    }

    applyLayout(el, config) {
        if (!config.layout) return;
        const layout = config.layout;
        const ltype = (layout.type || '').toUpperCase();
        const toPx = (val) => {
            if (val === undefined) return undefined;
            const n = typeof val === 'number' ? val : parseFloat(String(val));
            return isNaN(n) ? '0px' : n + 'px';
        };

        if (ltype === 'FLEX') {
            el.style.display = 'flex';
            const flow = (layout.flex_flow || 'ROW').toUpperCase();
            el.style.flexDirection = flow.includes('COLUMN')
                ? (flow.includes('REVERSE') ? 'column-reverse' : 'column')
                : (flow.includes('REVERSE') ? 'row-reverse' : 'row');
            if (flow.includes('WRAP')) el.style.flexWrap = 'wrap';

            el.style.justifyContent = this.flexAlign(layout.flex_align_main);
            el.style.alignItems     = this.flexAlign(layout.flex_align_cross);

            const rowGap = toPx(layout.pad_row);
            const colGap = toPx(layout.pad_column);
            if (rowGap !== undefined || colGap !== undefined) {
                el.style.gap = `${rowGap ?? '0px'} ${colGap ?? '0px'}`;
            }
        } else if (ltype === 'GRID') {
            el.style.display = 'grid';
            if (layout.grid_columns) {
                el.style.gridTemplateColumns = this.parseLvglGridTrack(layout.grid_columns);
            }
            if (layout.grid_rows) {
                el.style.gridTemplateRows = this.parseLvglGridTrack(layout.grid_rows);
            }
            const colGap = toPx(layout.pad_column);
            const rowGap = toPx(layout.pad_row);
            if (colGap !== undefined) el.style.columnGap = colGap;
            if (rowGap !== undefined) el.style.rowGap    = rowGap;
        }
    }

    parseLvglGridTrack(trackStr) {
        const parts = Array.isArray(trackStr)
            ? trackStr.map(String)
            : String(trackStr).trim().split(/\s+/);
        return parts.map(part => {
            const frMatch = part.match(/^FR\((\d+(?:\.\d+)?)\)$/i);
            if (frMatch) return frMatch[1] + 'fr';
            if (part.toUpperCase() === 'CONTENT') return 'auto';
            const num = parseFloat(part);
            if (!isNaN(num)) return num + 'px';
            return 'auto';
        }).join(' ');
    }

    flexAlign(val) {
        switch ((val || '').toUpperCase()) {
            case 'CENTER':        return 'center';
            case 'END':           return 'flex-end';
            case 'SPACE_BETWEEN': return 'space-between';
            case 'SPACE_AROUND':  return 'space-around';
            case 'SPACE_EVENLY':  return 'space-evenly';
            case 'STRETCH':       return 'stretch';
            default:              return 'flex-start';
        }
    }

    parseColor(color) {
        if (typeof color === 'number') return '#' + color.toString(16).padStart(6, '0');
        if (typeof color === 'string') {
            // ── LVGL function syntax ──────────────────────────────────────────
            const s = color.trim();

            // lv_color_hex(0xRRGGBB)
            const hexMatch = s.match(/^lv_color_hex\(\s*(0[xX][0-9a-fA-F]+)\s*\)$/);
            if (hexMatch) return '#' + hexMatch[1].slice(2).padStart(6, '0');

            // lv_color_hex3(0xRGB)
            const hex3Match = s.match(/^lv_color_hex3\(\s*(0[xX][0-9a-fA-F]+)\s*\)$/);
            if (hex3Match) {
                const nibbles = hex3Match[1].slice(2).padStart(3, '0');
                return '#' + nibbles.split('').map(n => n + n).join('');
            }

            // lv_color_white() / lv_color_black()
            if (s === 'lv_color_white()') return '#ffffff';
            if (s === 'lv_color_black()') return '#000000';

            // lv_palette_main(LV_PALETTE_X) and lv_palette_lighten/darken (use main colour as approximation)
            const paletteMatch = s.match(/^lv_palette(?:_main|_lighten|_darken)\(\s*LV_PALETTE_([A-Z_]+)(?:\s*,\s*\d+)?\s*\)$/);
            if (paletteMatch) {
                const palette = {
                    RED:         '#f44336', PINK:        '#e91e63', PURPLE:      '#9c27b0',
                    DEEP_PURPLE: '#673ab7', INDIGO:      '#3f51b5', BLUE:        '#2196f3',
                    LIGHT_BLUE:  '#03a9f4', CYAN:        '#00bcd4', TEAL:        '#009688',
                    GREEN:       '#4caf50', LIGHT_GREEN: '#8bc34a', LIME:        '#cddc39',
                    YELLOW:      '#ffeb3b', AMBER:       '#ffc107', ORANGE:      '#ff9800',
                    DEEP_ORANGE: '#ff5722', BROWN:       '#795548', BLUE_GREY:   '#607d8b',
                    GREY:        '#9e9e9e',
                };
                const key = paletteMatch[1];
                if (palette[key]) return palette[key];
                console.warn(`parseColor: unknown LV_PALETTE_${key}, falling back to #000000`);
                return '#000000';
            }

            // Any other lv_* function call — unknown, warn and return black
            if (/^lv_\w+\(/.test(s)) {
                console.warn(`parseColor: unrecognised LVGL colour function "${s}", falling back to #000000`);
                return '#000000';
            }

            // ── existing logic ────────────────────────────────────────────────
            if (color.startsWith('0x') || color.startsWith('0X')) return '#' + color.slice(2);
            return color;
        }
        return '#000000';
    }

    parseOpacity(opacity) {
        if (opacity === 'TRANSP' || opacity === 0) return 0;
        if (opacity === 'COVER') return 1;
        if (typeof opacity === 'number') return opacity / 255;
        return 1;
    }

    parseGradientDirection(dir) {
        switch ((dir || '').toUpperCase()) {
            case 'HOR': return 'to right';
            case 'VER': return 'to bottom';
            default:    return 'to bottom';
        }
    }

    parseFontSize(font) {
        const match = String(font).match(/_?(\d+)$/);
        if (match) {
            const size = parseInt(match[1]);
            return (size > 100 ? Math.round(size * 0.5) : size) + 'px';
        }
        return '16px';
    }

    parseFontFamily(font) {
        const f = String(font).toLowerCase();
        if (f.includes('montserrat')) return "'Montserrat', Arial, sans-serif";
        if (f.includes('roboto'))     return "'Roboto', Arial, sans-serif";
        if (f.includes('mono'))       return 'monospace';
        return 'Arial, sans-serif';
    }

    _getMockSnapshot() {
        const snapshot = {};
        const entries = this.store.getAllEntries?.() || {};
        for (const [id, meta] of Object.entries(entries)) {
            const current = this.store.get(id);
            const initial = meta.initialValue ?? meta.initial_value;
            if (current !== undefined && current !== initial) {
                snapshot[id] = current;
            }
        }
        return snapshot;
    }

    _getScreensaverSettings() {
        return {
            enabled: document.getElementById('ssEnable')?.checked || false,
            speed: parseFloat(document.getElementById('ssSpeed')?.value || '1'),
        };
    }

    getShareURL() {
        const yaml = this.yamlEditor.value;
        const signals = this.signalGen.serialise();
        const state = { yaml };
        if (Object.keys(signals).length > 0) state.signals = signals;
        const mockValues = this._getMockSnapshot();
        if (Object.keys(mockValues).length > 0) state.mockValues = mockValues;
        const screensaver = this._getScreensaverSettings();
        if (screensaver.enabled || screensaver.speed !== 1) state.screensaver = screensaver;
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
        return `${location.origin}${location.pathname}#state=${encoded}`;
    }

    loadFromHash() {
        const hash = location.hash;
        // Support new #state= format with signal generator state
        if (hash.startsWith('#state=')) {
            try {
                const state = JSON.parse(decodeURIComponent(escape(atob(hash.slice(7)))));
                if (state.yaml) {
                    this.yamlEditor.value = state.yaml;
                    this.renderFromEditor();
                    if (state.signals) this.signalGen.restore(state.signals);
                    // Restore mock values (deferred until after populateMockPanel)
                    if (state.mockValues) {
                        this._pendingMockRestore = state.mockValues;
                    }
                    // Restore screensaver settings
                    if (state.screensaver) {
                        const ssEnable = document.getElementById('ssEnable');
                        const ssSpeed = document.getElementById('ssSpeed');
                        if (ssEnable && state.screensaver.enabled) {
                            ssEnable.checked = true;
                            ssEnable.dispatchEvent(new Event('change'));
                        }
                        if (ssSpeed && state.screensaver.speed) {
                            ssSpeed.value = String(state.screensaver.speed);
                            ssSpeed.dispatchEvent(new Event('change'));
                        }
                    }
                    return true;
                }
            } catch (e) {
                // fall through to legacy format
            }
        }
        // Legacy #yaml= format
        if (hash.startsWith('#yaml=')) {
            try {
                const yaml = decodeURIComponent(escape(atob(hash.slice(6))));
                this.yamlEditor.value = yaml;
                this.renderFromEditor();
                return true;
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    _evalFormatArgs(format, args) {
        const values = args.map(arg => {
            const val = this.store.get(arg.id);
            if (val === null || val === undefined) {
                return arg.type === 'string' ? '?' : 0;
            }
            switch ((arg.type || 'float').toLowerCase()) {
                case 'int': case 'integer': return Math.round(Number(val));
                case 'bool': case 'boolean': return Boolean(val);
                case 'string': return String(val);
                default: return Number(val);
            }
        });
        return this.lambda.sprintf(format, ...values);
    }

    _formatTime(fmtStr) {
        const now = new Date();
        return fmtStr
            .replace('%H', String(now.getHours()).padStart(2, '0'))
            .replace('%M', String(now.getMinutes()).padStart(2, '0'))
            .replace('%S', String(now.getSeconds()).padStart(2, '0'))
            .replace('%I', String(now.getHours() % 12 || 12).padStart(2, '0'))
            .replace('%p', now.getHours() < 12 ? 'AM' : 'PM');
    }

    displayError(message) {
        this.displayElement.innerHTML = `
            <div class="placeholder" style="color:#ff4444;padding:1rem;text-align:center;">
                <p>Error: ${message}</p>
            </div>`;
    }

    displayYAMLError(error, yamlText) {
        const line = error.mark?.line ?? null;
        const col  = error.mark?.column ?? null;

        let html = '<div class="error-panel">';
        html += `<div class="error-title">&#10060; ${error.name || 'Error'}</div>`;

        if (line !== null) {
            html += `<div class="error-location">at line ${line + 1}${col !== null ? ', column ' + (col + 1) : ''}</div>`;
            const lines = yamlText.split('\n');
            const start = Math.max(0, line - 2);
            const end   = Math.min(lines.length - 1, line + 2);
            html += '<div class="error-context">';
            for (let i = start; i <= end; i++) {
                const num     = String(i + 1).padStart(4);
                const escaped = lines[i].replace(/&/g, '&amp;').replace(/</g, '&lt;');
                if (i === line) {
                    html += `<div class="error-line error-line--highlight">${num} │ ${escaped}</div>`;
                    if (col !== null) {
                        html += `<div class="error-pointer">${' '.repeat(num.length + 3 + col)}^</div>`;
                    }
                } else {
                    html += `<div class="error-line">${num} │ ${escaped}</div>`;
                }
            }
            html += '</div>';
        }

        const hints = [
            [/unexpected/i,                 'Check for incorrect indentation or missing YAML structure.'],
            [/duplicate key/i,              'The same key is defined twice in one block.'],
            [/end of the stream/i,          'The file may end abruptly or have an unclosed quote or block.'],
            [/tab character/i,              'YAML does not allow tab characters for indentation — use spaces.'],
            [/cannot read property/i,       'The YAML parsed but produced unexpected structure — check nesting.'],
        ];
        for (const [pattern, hint] of hints) {
            if (pattern.test(error.message)) {
                html += `<div class="error-hint">&#128161; Hint: ${hint}</div>`;
                break;
            }
        }

        html += `<div class="error-raw">${error.message.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`;
        html += '</div>';

        this.displayElement.innerHTML = html;
    }

    extractPartStyles(cfg, part) {
        return cfg[part] || {};
    }

    updateEntitySummary() {
        const el = document.getElementById('entitySummary');
        const badges = document.getElementById('entityBadges');
        if (!el || !badges) return;
        const entries = this.store.getAllEntries();

        const counts = { sensor: 0, binary_sensor: 0, text_sensor: 0, number: 0, global: 0 };
        Object.values(entries).forEach(e => {
            if (counts[e.entityType] !== undefined) counts[e.entityType]++;
        });

        const subCount = Object.keys(this.substitutions || {}).length;
        const parts = [];

        if (counts.sensor > 0) parts.push(`${counts.sensor} sensor${counts.sensor > 1 ? 's' : ''}`);
        if (counts.binary_sensor > 0) parts.push(`${counts.binary_sensor} binary`);
        if (counts.text_sensor > 0) parts.push(`${counts.text_sensor} text sensor${counts.text_sensor > 1 ? 's' : ''}`);
        if (counts.number > 0) parts.push(`${counts.number} number${counts.number > 1 ? 's' : ''}`);
        if (counts.global > 0) parts.push(`${counts.global} global${counts.global > 1 ? 's' : ''}`);
        if (subCount > 0) parts.push(`${subCount} substitution${subCount > 1 ? 's' : ''}`);

        if (parts.length === 0) {
            el.style.display = 'none';
            return;
        }

        badges.innerHTML = parts.map(p => `<span class="entity-badge">${p}</span>`).join('');
        el.style.display = 'flex';
    }

    buildDrivePanel() {
        const container = document.getElementById('mockControls');
        if (!container) return;
        container.innerHTML = '';

        const entries = this.store.getAllEntries();
        const groups = { sensor: [], binary_sensor: [], text_sensor: [], number: [], global: [] };
        Object.entries(entries).forEach(([id, meta]) => {
            if (groups[meta.entityType] !== undefined) groups[meta.entityType].push({ id, ...meta });
        });

        const sectionTitles = {
            sensor: 'Sensors', binary_sensor: 'Binary Sensors',
            text_sensor: 'Text Sensors', number: 'Numbers', global: 'Globals'
        };

        let hasAny = false;
        Object.entries(groups).forEach(([type, items]) => {
            if (items.length === 0) return;
            hasAny = true;
            container.appendChild(this.createMockSection(sectionTitles[type], items, type));
        });

        if (!hasAny) {
            container.innerHTML = '<div class="mock-empty">No sensors or globals detected.</div>';
            document.getElementById('mockPanel')?.classList.remove('mock-panel--visible');
        } else {
            document.getElementById('mockPanel')?.classList.add('mock-panel--visible');
        }

        // Top Layer section (always rendered when config has top_layer widgets with ids)
        const topLayerSection = this._buildTopLayerSection();
        if (topLayerSection) container.appendChild(topLayerSection);

        // Feature-detected sections (screensaver, gpio, audio, sd_card, network)
        this._buildFeatureSections(container);

        // Apply any pending mock restore from loadFromHash (deferred to here so controls exist)
        if (this._pendingMockRestore) {
            const restore = this._pendingMockRestore;
            this._pendingMockRestore = null;
            setTimeout(() => {
                for (const [id, val] of Object.entries(restore)) {
                    this.store.set(id, val);
                }
            }, 0);
        }
    }

    // Backward-compat alias — other code that calls populateMockPanel() still works
    populateMockPanel() {
        return this.buildDrivePanel();
    }

    _buildFeatureSections(container) {
        const features = this._detectedFeatures || [];
        const sectionMap = {
            screensaver: () => this._buildScreensaverSection(),
            gpio:        () => this._buildGPIOSection(),
            audio:       () => this._buildAudioSection(),
            sd_card:     () => this._buildSDSection(),
            network:     () => this._buildNetworkSection(),
        };
        for (const id of features) {
            const builder = sectionMap[id];
            if (builder) {
                const el = builder();
                if (el) container.appendChild(el);
            }
        }
    }

    _buildSectionWrapper(title, contentEl) {
        if (!contentEl) return null;
        const section = document.createElement('div');
        section.className = 'mock-section drive-feature-section';
        const header = document.createElement('div');
        header.className = 'mock-section-header';
        header.innerHTML = `<span class="mock-section-icon">&#9660;</span><span>${title}</span>`;
        header.addEventListener('click', () => section.classList.toggle('mock-section--collapsed'));
        section.appendChild(header);
        section.appendChild(contentEl);
        return section;
    }

    _buildScreensaverSection() {
        const el = document.getElementById('screensaverControls');
        if (!el) return null;
        return this._buildSectionWrapper('Screensaver', el);
    }

    _buildGPIOSection() {
        const el = document.getElementById('gpioControls');
        if (!el) return null;
        return this._buildSectionWrapper('GPIO', el);
    }

    _buildAudioSection() {
        // Audio mute checkbox lives inside screensaverControls; wrap a clone here
        // to avoid removing the element from screensaverControls when both are shown.
        // When screensaver is also detected, the mute control is accessible there too.
        // For audio-only (no screensaver feature), move the audioMute row into Audio section.
        const features = this._detectedFeatures || [];
        if (features.includes('screensaver')) {
            // Already in the Screensaver section — don't duplicate
            return null;
        }
        const muteEl = document.getElementById('audioMute');
        if (!muteEl) return null;
        const row = muteEl.closest('.drive-row') || muteEl.parentElement;
        return this._buildSectionWrapper('Audio', row);
    }

    _buildSDSection() {
        const el = document.getElementById('sdCardControls');
        if (!el) return null;
        return this._buildSectionWrapper('SD Card', el);
    }

    _buildNetworkSection() {
        const el = document.getElementById('networkControls');
        if (!el) return null;
        return this._buildSectionWrapper('Network', el);
    }

    _buildTopLayerSection() {
        const widgets = this.config?.lvgl?.top_layer?.widgets || [];
        const withIds = widgets.filter(w => {
            const cfg = Object.values(w)[0];
            return cfg && cfg.id;
        });
        if (withIds.length === 0) return null;

        const section = document.createElement('div');
        section.className = 'mock-section drive-feature-section';
        const header = document.createElement('div');
        header.className = 'mock-section-header';
        header.innerHTML = `<span class="mock-section-icon">&#9660;</span><span>Top Layer</span>`;
        header.addEventListener('click', () => section.classList.toggle('mock-section--collapsed'));
        section.appendChild(header);

        const body = document.createElement('div');
        body.className = 'mock-section-body';

        withIds.forEach(w => {
            const cfg = Object.values(w)[0];
            const widgetId = cfg.id;
            const row = document.createElement('div');
            row.className = 'mock-item';
            const lbl = document.createElement('span');
            lbl.className = 'mock-item-id';
            lbl.textContent = widgetId;
            const btnWrap = document.createElement('span');
            btnWrap.style.cssText = 'display:flex;gap:4px;';

            const showBtn = document.createElement('button');
            showBtn.className = 'mock-btn';
            showBtn.textContent = 'Show';
            showBtn.addEventListener('click', () => {
                const entry = this._renderedElements?.[widgetId];
                if (entry?.el) entry.el.style.display = '';
            });

            const hideBtn = document.createElement('button');
            hideBtn.className = 'mock-btn';
            hideBtn.textContent = 'Hide';
            hideBtn.addEventListener('click', () => {
                const entry = this._renderedElements?.[widgetId];
                if (entry?.el) entry.el.style.display = 'none';
            });

            btnWrap.appendChild(showBtn);
            btnWrap.appendChild(hideBtn);
            row.appendChild(lbl);
            row.appendChild(btnWrap);
            body.appendChild(row);
        });

        section.appendChild(body);
        return section;
    }

    _initSDLogging() {
        this._sdBuffer = [];
        this._sdEnabled = false;

        this._sdUnsubAll = this.store.subscribeAll((value, id) => {
            if (!this._sdEnabled) return;
            if (!id || id.startsWith('__')) return;
            this._sdBuffer.push({ ts: Date.now(), id, value });
            if (this._sdBuffer.length > 10000) this._sdBuffer.shift();
        });
    }

    _maybeShowSupabasePanel() {
        // Check substitutions (includes resolved secrets) and store
        const subs = this.substitutions || {};
        let url = subs.supabase_url || this.store.get('supabase_url') || '';
        let key = subs.supabase_anon_key || this.store.get('supabase_anon_key') || '';

        // Skip if still a placeholder or empty
        if (!url || url.includes('__secret_') || url.includes('${') || url.includes('SUPABASE')) return;

        const panel = document.getElementById('supabasePanel');
        if (!panel) return;
        panel.style.display = 'block';
        const urlEl = document.getElementById('sbUrl');
        const keyEl = document.getElementById('sbKey');
        if (urlEl && !urlEl.value) urlEl.value = url;
        if (keyEl && !keyEl.value) keyEl.value = key;
    }

    createMockSection(title, items, type) {
        const section = document.createElement('div');
        section.className = 'mock-section';

        const header = document.createElement('div');
        header.className = 'mock-section-header';
        header.innerHTML = `<span class="mock-section-icon">&#9660;</span><span>${title} (${items.length})</span>`;
        header.addEventListener('click', () => section.classList.toggle('mock-section--collapsed'));

        const body = document.createElement('div');
        body.className = 'mock-section-body';

        const numericTypes = new Set(['sensor', 'number', 'global']);
        items.forEach(item => {
            const isPointer = item.type === 'pointer';
            const isNumeric = numericTypes.has(type) && item.type !== 'boolean' && item.type !== 'string' && !isPointer;
            const isBoolean = item.type === 'boolean' || type === 'binary_sensor';
            const isString = item.type === 'string' || type === 'text_sensor';
            if (isPointer) {
                const row = document.createElement('div');
                row.className = 'mock-item';
                row.dataset.entityId = item.id;
                row.innerHTML = `<span class="mock-item-id">${item.id}</span><span class="mock-item-type" style="opacity:0.4">ptr</span>`;
                body.appendChild(row);
            } else if (isNumeric) {
                body.appendChild(this.createNumericControl(item.id, item));
            } else if (isBoolean) {
                body.appendChild(this.createBooleanControl(item.id, item));
            } else if (isString) {
                body.appendChild(this.createStringControl(item.id, item));
            } else {
                const row = document.createElement('div');
                row.className = 'mock-item';
                row.dataset.entityId = item.id;
                row.innerHTML = `
                    <span class="mock-item-id">${item.id}</span>
                    <span class="mock-item-type">${item.type || type}</span>
                `;
                body.appendChild(row);
            }
        });

        section.appendChild(header);
        section.appendChild(body);
        return section;
    }

    _smartRange(meta) {
        if (meta.min !== undefined && meta.max !== undefined) {
            return { min: meta.min, max: meta.max };
        }
        const unit = (meta.unit || '').toLowerCase();
        if (unit === '%') return { min: 0, max: 100 };
        if (unit === '°c' || unit === 'c') return { min: -20, max: 60 };
        if (unit === '°f' || unit === 'f') return { min: 0, max: 150 };
        if (unit === 'v') return { min: 0, max: 60 };
        if (unit === 'a') return { min: 0, max: 50 };
        if (unit === 'w') return { min: 0, max: 400 };
        if (unit === 'kw') return { min: 0, max: 10 };
        if (unit === 'wh' || unit === 'kwh') return { min: 0, max: 1000 };
        if (unit === 'mah') return { min: 0, max: 200000 };
        if (unit === 'mph' || unit === 'km/h') return { min: 0, max: 200 };
        return { min: meta.min ?? 0, max: meta.max ?? 100 };
    }

    createNumericControl(id, meta) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mock-control mock-control--numeric';
        wrapper.dataset.entityId = id;

        const labelRow = document.createElement('div');
        labelRow.className = 'mock-control__label-row';
        const nameEl = document.createElement('span');
        nameEl.className = 'mock-control__name';
        nameEl.textContent = meta.name || id;
        nameEl.title = id;
        const unitEl = document.createElement('span');
        unitEl.className = 'mock-control__unit';
        unitEl.textContent = meta.unit || '';
        labelRow.appendChild(nameEl);
        labelRow.appendChild(unitEl);

        const { min, max } = this._smartRange(meta);
        const isInt = meta.type === 'integer';
        const decimals = meta.accuracy_decimals ?? meta.decimals ?? (isInt ? 0 : 1);
        const step = meta.step ?? (isInt ? 1 : Math.pow(10, -decimals));
        const currentVal = this.store.get(id) ?? meta.initialValue ?? min;

        const sliderRow = document.createElement('div');
        sliderRow.className = 'mock-control__slider-row';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = currentVal;
        slider.className = 'mock-control__slider';

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.min = min;
        numInput.max = max;
        numInput.step = step;
        numInput.value = isInt ? Math.round(currentVal) : Number(currentVal).toFixed(decimals);
        numInput.className = 'mock-control__number';

        const update = (val) => {
            const parsed = parseFloat(val);
            if (isNaN(parsed)) return;
            const clamped = Math.min(max, Math.max(min, parsed));
            const display = isInt ? Math.round(clamped) : clamped.toFixed(decimals);
            slider.value = clamped;
            numInput.value = display;
            this.store.set(id, isInt ? Math.round(clamped) : clamped);
        };
        slider.addEventListener('input', e => update(e.target.value));
        numInput.addEventListener('change', e => update(e.target.value));

        const rangeRow = document.createElement('div');
        rangeRow.className = 'mock-control__range-row';
        rangeRow.innerHTML = `<span>${min}</span><span>${max}</span>`;

        // Generator toggle button
        const genBtn = document.createElement('button');
        genBtn.className = 'mock-gen-btn';
        genBtn.title = 'Signal generator';
        genBtn.textContent = '⌇';
        genBtn.addEventListener('click', () => this._toggleGeneratorPanel(id, meta, sliderRow));
        if (this.signalGen.isActive(id)) genBtn.classList.add('mock-gen-btn--active');

        sliderRow.appendChild(slider);
        sliderRow.appendChild(numInput);
        sliderRow.appendChild(genBtn);
        wrapper.appendChild(labelRow);
        wrapper.appendChild(sliderRow);
        wrapper.appendChild(rangeRow);
        return wrapper;
    }

    _toggleGeneratorPanel(id, meta, parentRow) {
        // Remove existing panel if open
        const existing = parentRow.nextElementSibling;
        if (existing && existing.classList.contains('mock-gen-panel')) {
            existing.remove();
            return;
        }

        const { min, max } = this._smartRange(meta);
        const cfg = this.signalGen.getConfig(id) || {
            type: 'sine', period: 10, min, max, phase: 0
        };

        const panel = document.createElement('div');
        panel.className = 'mock-gen-panel';
        panel.innerHTML = `
            <div class="mock-gen-row">
                <label>Wave</label>
                <select class="gen-type">
                    ${['sine','square','sawtooth','triangle','random'].map(t =>
                        `<option value="${t}" ${cfg.type===t?'selected':''}>${t}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="mock-gen-row">
                <label>Period (s)</label>
                <input type="number" class="gen-period" value="${cfg.period}" min="0.1" step="0.5" style="width:60px">
            </div>
            <div class="mock-gen-row">
                <label>Min</label>
                <input type="number" class="gen-min" value="${cfg.min}" style="width:60px">
                <label>Max</label>
                <input type="number" class="gen-max" value="${cfg.max}" style="width:60px">
            </div>
            <div class="mock-gen-row">
                <label>Phase °</label>
                <input type="number" class="gen-phase" value="${cfg.phase||0}" min="0" max="360" style="width:60px">
            </div>
            <div class="mock-gen-row">
                <button class="gen-start-btn mock-btn">${this.signalGen.isActive(id) ? 'Stop' : 'Start'}</button>
            </div>
        `;

        const startBtn = panel.querySelector('.gen-start-btn');
        startBtn.addEventListener('click', () => {
            if (this.signalGen.isActive(id)) {
                this.signalGen.stop(id);
                startBtn.textContent = 'Start';
                parentRow.querySelector('.mock-gen-btn')?.classList.remove('mock-gen-btn--active');
            } else {
                const newCfg = {
                    type: panel.querySelector('.gen-type').value,
                    period: parseFloat(panel.querySelector('.gen-period').value) || 10,
                    min: parseFloat(panel.querySelector('.gen-min').value),
                    max: parseFloat(panel.querySelector('.gen-max').value),
                    phase: parseFloat(panel.querySelector('.gen-phase').value) || 0,
                };
                this.signalGen.start(id, newCfg);
                startBtn.textContent = 'Stop';
                parentRow.querySelector('.mock-gen-btn')?.classList.add('mock-gen-btn--active');
            }
        });

        parentRow.insertAdjacentElement('afterend', panel);
    }

    createBooleanControl(id, meta) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mock-control mock-control--boolean';
        wrapper.dataset.entityId = id;

        const labelRow = document.createElement('div');
        labelRow.className = 'mock-control__label-row';
        const nameEl = document.createElement('span');
        nameEl.className = 'mock-control__name';
        nameEl.textContent = meta.name || id;
        nameEl.title = id;
        const hintEl = document.createElement('span');
        hintEl.className = 'mock-control__unit';
        hintEl.textContent = meta.deviceClass || '';
        labelRow.appendChild(nameEl);
        labelRow.appendChild(hintEl);

        const toggle = document.createElement('label');
        toggle.className = 'mock-toggle';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this.store.get(id) === true;
        const sliderSpan = document.createElement('span');
        sliderSpan.className = 'mock-toggle__slider';
        toggle.appendChild(cb);
        toggle.appendChild(sliderSpan);

        const label = document.createElement('span');
        label.className = 'mock-toggle__label';
        label.textContent = cb.checked ? 'ON' : 'OFF';

        if (id === 'sim_mode') {
            nameEl.textContent += ' ★';
            nameEl.title = 'Auto-enabled — BLE devices simulate data when this is on';
        }

        cb.addEventListener('change', e => {
            this.store.set(id, e.target.checked);
            label.textContent = e.target.checked ? 'ON' : 'OFF';
        });

        const row = document.createElement('div');
        row.className = 'mock-control__toggle-row';
        row.appendChild(toggle);
        row.appendChild(label);

        wrapper.appendChild(labelRow);
        wrapper.appendChild(row);
        return wrapper;
    }

    createStringControl(id, meta) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mock-control mock-control--string';
        wrapper.dataset.entityId = id;

        const labelRow = document.createElement('div');
        labelRow.className = 'mock-control__label-row';
        const nameEl = document.createElement('span');
        nameEl.className = 'mock-control__name';
        nameEl.textContent = meta.name || id;
        nameEl.title = id;
        labelRow.appendChild(nameEl);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'mock-control__text';
        input.value = this.store.get(id) ?? meta.initialValue ?? '';
        input.placeholder = `${meta.name || id}...`;
        input.addEventListener('input', e => this.store.set(id, e.target.value));

        wrapper.appendChild(labelRow);
        wrapper.appendChild(input);
        return wrapper;
    }

    savePreset(name) {
        const entries = this.store.getAllEntries();
        const snapshot = {};
        Object.entries(entries).forEach(([id, meta]) => {
            if (meta.hasValue) snapshot[id] = meta.value;
        });
        const all = this._loadAllPresets();
        all[name] = snapshot;
        localStorage.setItem('esphome-lvgl-sim-presets', JSON.stringify(all));
        this._refreshPresetDropdown();
    }

    loadPreset(name) {
        if (name === '__default__') {
            this.store.reset();
            return;
        }
        const all = this._loadAllPresets();
        const preset = all[name];
        if (!preset) return;
        Object.entries(preset).forEach(([id, value]) => {
            if (this.store.getMeta(id)) this.store.set(id, value);
        });
    }

    _loadAllPresets() {
        try {
            return JSON.parse(localStorage.getItem('esphome-lvgl-sim-presets') || '{}');
        } catch { return {}; }
    }

    _refreshPresetDropdown() {
        const sel = document.getElementById('presetSelect');
        if (!sel) return;
        const all = this._loadAllPresets();
        // Keep __default__ option, replace the rest
        sel.innerHTML = '<option value="__default__">Default</option>';
        Object.keys(all).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        });
    }

    _buildGPIOPanel() {
        const container = document.getElementById('gpioPins');
        if (!container) return;
        container.innerHTML = '';

        // Collect all GPIO pins used in this config
        const allLambdas = JSON.stringify(this.config || '');
        const pinMatches = [...allLambdas.matchAll(/GPIO_NUM_(\d+)/g)];
        const pins = [...new Set(pinMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);

        if (pins.length === 0) {
            container.innerHTML = '<span style="opacity:0.4;font-size:11px">No GPIO pins detected</span>';
            return;
        }

        pins.forEach(pin => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;align-items:center;gap:3px;';

            // Level indicator LED
            const led = document.createElement('span');
            led.id = `gpio-led-${pin}`;
            led.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#333;border:1px solid #555;display:inline-block;';

            // Label
            const lbl = document.createElement('span');
            lbl.textContent = `G${pin}`;
            lbl.style.cssText = 'opacity:0.6;font-size:10px;';

            // Pulse button
            const btn = document.createElement('button');
            btn.className = 'mock-btn';
            btn.style.cssText = 'font-size:10px;padding:1px 5px;';
            btn.textContent = '⏻';
            btn.title = `Pulse GPIO ${pin} (200ms)`;
            btn.addEventListener('click', () => {
                const proxy = this.lambda?._proxy;
                if (proxy?.pulseGPIO) {
                    proxy.pulseGPIO(pin, 200);
                    // Flash the LED
                    led.style.background = '#4af';
                    setTimeout(() => { led.style.background = '#333'; }, 250);
                }
            });

            // Hold toggle button
            const hold = document.createElement('button');
            hold.className = 'mock-btn';
            hold.style.cssText = 'font-size:10px;padding:1px 5px;';
            hold.textContent = 'H';
            hold.title = `Hold GPIO ${pin} HIGH`;
            let held = false;
            hold.addEventListener('click', () => {
                held = !held;
                const proxy = this.lambda?._proxy;
                if (proxy?.setGPIO) proxy.setGPIO(pin, held ? 1 : 0);
                hold.style.color = held ? '#4af' : '';
                led.style.background = held ? '#4af' : '#333';
            });

            wrap.appendChild(led);
            wrap.appendChild(lbl);
            wrap.appendChild(btn);
            wrap.appendChild(hold);
            container.appendChild(wrap);
        });

        // Update LED states periodically (clear previous interval to avoid leaks on rebuild)
        if (this._gpioPollInterval) clearInterval(this._gpioPollInterval);
        this._gpioPollInterval = setInterval(() => {
            pins.forEach(pin => {
                const ledEl = document.getElementById(`gpio-led-${pin}`);
                if (!ledEl) return;
                const proxy = this.lambda?._proxy;
                const val = proxy?.getGPIO ? proxy.getGPIO(pin) : 0;
                if (val) ledEl.style.background = '#4af';
                else if (ledEl.style.background === 'rgb(68, 170, 255)') ledEl.style.background = '#333';
            });
        }, 100);
    }

    _collectIntervalHandlers() {
        this._intervalHandlers = [];
        const intervals = this.config?.interval || [];
        const list = Array.isArray(intervals) ? intervals : [intervals];

        for (const entry of list) {
            if (!entry) continue;

            // Parse interval duration string: "50ms", "500ms", "1s", "2s", "30s"
            const ms = this._parseIntervalMs(entry.interval || entry.period || '1s');

            // Extract lambda from then: block
            let lambdaStr = null;
            const then = entry.then;
            if (typeof then === 'string') lambdaStr = then;
            else if (Array.isArray(then)) {
                for (const a of then) {
                    if (a?.lambda) { lambdaStr = a.lambda; break; }
                }
            } else if (then?.lambda) {
                lambdaStr = then.lambda;
            } else if (entry.lambda) {
                lambdaStr = entry.lambda;
            }

            if (lambdaStr) {
                // Ensure the lambda is base64-encoded so evaluate() can process it.
                // Raw strings from YAML then: - lambda: "..." are not yet encoded.
                if (!lambdaStr.startsWith('__lambda__:')) {
                    lambdaStr = '__lambda__:' + btoa(unescape(encodeURIComponent(lambdaStr)));
                }
                this._intervalHandlers.push({ ms, lambda: lambdaStr, lastRun: 0 });
            }
        }
    }

    _parseIntervalMs(str) {
        if (typeof str === 'number') return str;
        const s = String(str).trim().toLowerCase();
        if (s.endsWith('ms')) return parseFloat(s);
        if (s.endsWith('s'))  return parseFloat(s) * 1000;
        if (s.endsWith('m'))  return parseFloat(s) * 60000;
        return parseFloat(s) * 1000; // default: seconds
    }

    _startIntervalRunner() {
        if (this._intervalRafId) cancelAnimationFrame(this._intervalRafId);
        if (!this._intervalHandlers?.length || !this._intervalsEnabled) return;

        const tick = (now) => {
            if (!this._intervalsEnabled) return;
            const speed = this._intervalSpeed || 1;
            const scaledNow = this._intervalEpoch + (now - this._intervalStartReal) * speed;

            for (const handler of this._intervalHandlers) {
                if (scaledNow - handler.lastRun >= handler.ms) {
                    handler.lastRun = scaledNow;
                    const t0 = performance.now();
                    try {
                        this.lambda._proxy = this._buildLVGLProxy();
                        this.lambda.evaluate(handler.lambda, null);
                    } catch(e) {
                        console.warn('[interval] lambda error:', e.message);
                    }
                    const elapsed = performance.now() - t0;
                    if (elapsed > 50) console.warn(`[interval] slow lambda (${elapsed.toFixed(0)}ms) — consider reducing interval speed`);
                }
            }

            this._intervalRafId = requestAnimationFrame(tick);
        };

        this._intervalEpoch = 0;
        this._intervalStartReal = performance.now();
        this._intervalRafId = requestAnimationFrame(tick);
    }

    _stopIntervalRunner() {
        if (this._intervalRafId) {
            cancelAnimationFrame(this._intervalRafId);
            this._intervalRafId = null;
        }
    }

    // ── Widget Tree ──────────────────────────────────────────────────────────

    buildWidgetTree() {
        const treeEl = document.getElementById('tree-body');
        if (!treeEl) return;
        treeEl.innerHTML = '';

        const page = this.pages[this.currentPageIndex];
        if (!page) return;

        // Page section header
        const pageHeader = document.createElement('div');
        pageHeader.className = 'tree-section-header';
        pageHeader.textContent = page.id || `page_${this.currentPageIndex}`;
        treeEl.appendChild(pageHeader);

        (page.widgets || []).forEach(w => this._renderTreeNode(w, treeEl, 0));

        // Top layer section
        const topWidgets = this.config?.lvgl?.top_layer?.widgets || [];
        if (topWidgets.length > 0) {
            const tlHeader = document.createElement('div');
            tlHeader.className = 'tree-section-header';
            tlHeader.textContent = 'Top layer';
            treeEl.appendChild(tlHeader);
            topWidgets.forEach(w => this._renderTreeNode(w, treeEl, 0));
        }
    }

    _renderTreeNode(widgetObj, container, depth) {
        const type = Object.keys(widgetObj)[0];
        const cfg = widgetObj[type] || {};
        const id = cfg.id;
        const isHidden = cfg.hidden === true;

        const ICONS = { label:'T', arc:'◯', obj:'▣', button:'▭', bar:'▬', slider:'▬', checkbox:'☑', img:'◻', meter:'◉', chart:'▤', led:'●', line:'╱', spinner:'↻', switch:'⏻', dropdown:'▾', roller:'≡' };

        const node = document.createElement('div');
        node.className = 'tree-node' + (isHidden ? ' tree-node--hidden' : '');
        node.style.paddingLeft = `${8 + depth * 14}px`;
        if (id) node.dataset.widgetId = id;
        if (id === this._selectedWidgetId) node.classList.add('tree-node--selected');

        node.innerHTML = `
            <span class="tree-node-icon">${ICONS[type] || '▪'}</span>
            <span class="tree-node-label">${id || `(${type})`}</span>
            <span class="tree-node-type">${type}</span>
            ${isHidden ? '<span class="tree-node-hidden">○</span>' : ''}
        `;

        if (id) {
            node.addEventListener('click', () => this.selectWidget(id, cfg));
        }
        container.appendChild(node);

        // Recurse into children
        (cfg.widgets || []).forEach(child => this._renderTreeNode(child, container, depth + 1));
    }

    // ── Widget Inspector ─────────────────────────────────────────────────────

    selectWidget(id, cfg, widgetType) {
        this._selectedWidgetId = id;
        // Update right rail subtitle
        const nameEl = document.getElementById('inspector-widget-name');
        if (nameEl) nameEl.textContent = id || '(anonymous)';
        // Highlight tree node
        document.querySelectorAll('.tree-node').forEach(n => {
            n.classList.toggle('tree-node--selected', id && n.dataset.widgetId === id);
        });
        // Populate inspector
        this.buildInspector(cfg, widgetType);
    }

    buildInspector(cfg, widgetType) {
        const el = document.getElementById('inspector-body');
        if (!el) return;
        el.innerHTML = '';

        const type = widgetType || this.currentWidgetType || 'widget';
        const isLambda = v => v && String(v).includes('__lambda__');

        // Header chip
        const chip = document.createElement('div');
        chip.className = 'inspector-chip';
        const isBound = Object.values(cfg).some(v => isLambda(v));
        chip.innerHTML = `
            <span class="inspector-chip-icon">${type === 'label' ? 'T' : '▣'}</span>
            <div class="inspector-chip-info">
                <div class="inspector-chip-name">${cfg.id || '(anonymous)'}</div>
                <div class="inspector-chip-sub">${type}</div>
            </div>
            ${isBound ? '<span class="inspector-bound-badge">bound</span>' : ''}
        `;
        el.appendChild(chip);

        // Property sections
        const SECTIONS = [
            { title: 'Position', keys: ['align','x','y','width','height'] },
            { title: 'Style',    keys: ['bg_color','border_color','border_width','radius','opacity','bg_opa'] },
            { title: 'Text',     keys: ['text','text_font','text_color','text_align'] },
            { title: 'Arc',      keys: ['min_value','max_value','value','start_angle','end_angle','arc_width','arc_color'] },
        ];

        for (const sec of SECTIONS) {
            const fields = sec.keys
                .filter(k => cfg[k] !== undefined)
                .map(k => ({ k, v: cfg[k] }));
            if (fields.length === 0) continue;

            const secEl = document.createElement('div');
            secEl.className = 'inspector-section';
            const header = document.createElement('div');
            header.className = 'inspector-section-title';
            header.textContent = sec.title;
            secEl.appendChild(header);

            for (const { k, v } of fields) {
                const row = document.createElement('div');
                row.className = 'inspector-row';
                const isColor = (typeof v === 'number') || String(v).startsWith('0x') || String(v).startsWith('#');
                const hexColor = isColor ? this.parseColor(v) : null;
                const isDriven = isLambda(v);
                row.innerHTML = `
                    <span class="inspector-key">${k}</span>
                    <span class="inspector-value">
                        ${hexColor ? `<span class="inspector-swatch" style="background:${hexColor}"></span>` : ''}
                        ${isDriven ? '<span class="inspector-driven">↻</span>' : ''}
                        <span>${String(v).replace('__lambda__','λ').substring(0,40)}</span>
                    </span>
                `;
                secEl.appendChild(row);
            }
            el.appendChild(secEl);
        }
    }

    // ── YAML Slice Tabs ──────────────────────────────────────────────────────

    extractYamlSlices(raw, pageId) {
        const lines = raw.split('\n');
        const result = { page: null, topLayer: null, globals: null };

        // Find page block: look for "  - id: {pageId}" or "- id: {pageId}"
        if (pageId) {
            const startRe = new RegExp(`^(\\s*)- id:\\s*${pageId}\\s*$`);
            let startIdx = -1, indent = '';
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(startRe);
                if (m) { startIdx = i; indent = m[1]; break; }
            }
            if (startIdx >= 0) {
                const nextPageRe = new RegExp(`^${indent}- id:`);
                let endIdx = lines.length;
                for (let i = startIdx + 1; i < lines.length; i++) {
                    if (nextPageRe.test(lines[i])) { endIdx = i; break; }
                }
                result.page = lines.slice(startIdx, endIdx).join('\n');
            }
        }

        // Find top_layer: block (may be indented inside lvgl:)
        for (let i = 0; i < lines.length; i++) {
            const tlMatch = lines[i].match(/^(\s*)top_layer\s*:/);
            if (tlMatch) {
                const tlIndent = tlMatch[1].length;
                let end = lines.length;
                for (let j = i + 1; j < lines.length; j++) {
                    const trimmed = lines[j].trimStart();
                    if (trimmed.length === 0) continue;
                    const lineIndent = lines[j].length - trimmed.length;
                    // Stop when we hit a sibling or ancestor key (same/lesser indent, non-empty)
                    if (lineIndent <= tlIndent && /^[a-z_\-]/.test(trimmed)) { end = j; break; }
                }
                result.topLayer = lines.slice(i, end).join('\n');
                break;
            }
        }

        // Find globals: block
        for (let i = 0; i < lines.length; i++) {
            if (/^globals\s*:/.test(lines[i])) {
                let end = lines.length;
                for (let j = i + 1; j < lines.length; j++) {
                    if (/^[a-z_]/.test(lines[j])) { end = j; break; }
                }
                result.globals = lines.slice(i, end).join('\n');
                break;
            }
        }

        return result;
    }

    pageDisplayTitle(id) {
        return (id || '')
            .replace(/_page$/, '').replace(/_hub$/, ' Hub')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            || '—';
    }

    renderYamlPane(source, lineOffset = 0) {
        const pane = document.createElement('div');
        pane.className = 'yaml-pane';
        const lines = (source || '').split('\n');
        lines.forEach((line, i) => {
            const row = document.createElement('div');
            row.className = 'yaml-pane-row';
            const gutter = document.createElement('span');
            gutter.className = 'yaml-pane-gutter';
            gutter.textContent = i + 1 + lineOffset;
            const code = document.createElement('span');
            code.className = 'yaml-pane-line';
            code.innerHTML = this._colorYaml(line);
            row.appendChild(gutter);
            row.appendChild(code);
            pane.appendChild(row);
        });
        return pane;
    }

    _colorYaml(line) {
        const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let out = esc(line);
        if (/^\s*#/.test(line)) return `<span class="yaml-comment">${out}</span>`;
        out = out.replace(/0x([0-9A-Fa-f]{6})\b/g, (_, h) => `<span style="color:#${h}">0x${h}</span>`);
        out = out.replace(/"([^"]*)"/g, '<span class="yaml-string">"$1"</span>');
        out = out.replace(/^(\s*-?\s*)([a-z_][a-z0-9_]*)(\s*:)/i, '$1<span class="yaml-key">$2</span>$3');
        out = out.replace(/\b(\d+\.?\d*)\b/g, '<span class="yaml-number">$1</span>');
        out = out.replace(/\b([A-Z_]{3,})\b/g, '<span class="yaml-const">$1</span>');
        return out;
    }

    buildYamlTabs(raw, pageId) {
        const slices = this.extractYamlSlices(raw, pageId);
        const tabsContainer = document.getElementById('yaml-tabs');
        if (!tabsContainer) return;

        // Clear existing yaml tabs
        tabsContainer.innerHTML = '';

        const tabDefs = [
            { id: 'page',    label: this.pageDisplayTitle(pageId), slice: slices.page,     bodyId: 'tab-page'    },
            { id: 'overlay', label: 'Overlay',                      slice: slices.topLayer, bodyId: 'tab-overlay' },
            { id: 'globals', label: 'Globals',                      slice: slices.globals,  bodyId: 'tab-globals' },
        ];

        for (const def of tabDefs) {
            // Create tab button
            const btn = document.createElement('button');
            btn.className = 'console-tab';
            btn.dataset.tab = def.id;
            btn.textContent = def.label;
            tabsContainer.appendChild(btn);

            // Wire click — toggle active, show body
            btn.addEventListener('click', () => {
                document.querySelectorAll('.console-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-body').forEach(b => b.style.display = 'none');
                btn.classList.add('active');
                const body = document.getElementById('tab-' + def.id);
                if (body) body.style.display = 'flex';
            });

            // Populate body
            const body = document.getElementById(def.bodyId);
            if (!body) continue;
            body.innerHTML = '';
            if (def.slice) {
                body.appendChild(this.renderYamlPane(def.slice));
            } else {
                body.innerHTML = '<p class="rail-placeholder">Not found in this config (may be in an included file).</p>';
            }
        }
    }
}

Object.assign(ESPHomeLVGLSimulator.prototype, {
    renderObj,
    renderLabel,
    renderButton,
    renderBar,
    renderLed,
    renderArc,
    makeSVGArc,
    applyArcPosition,
    renderSlider,
    renderCheckbox,
    renderImg,
    renderRoller,
    renderSpinner,
    renderSwitch,
    renderDropdown,
    renderLine,
    renderMeter,
    renderChart,
    drawChart,
});

document.addEventListener('DOMContentLoaded', () => {
    new ESPHomeLVGLSimulator();
});
