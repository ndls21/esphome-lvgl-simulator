import { SimulatorStateStore } from './core/store.js';
import { LambdaEvaluator } from './core/lambda.js';
import { preprocessYAML } from './core/preprocessor.js';
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

class ESPHomeLVGLSimulator {
    constructor() {
        this.config = null;
        this.styleDefinitions = {};
        this.substitutions = {};
        this.fileMap = {};
        this.store = new SimulatorStateStore();
        this.lambda = new LambdaEvaluator(this.store);
        this.theme = {};
        this.currentWidgetType = '';
        this._renderedElements = {};
        this._deferredAlignments = [];
        this.pages = [];
        this.currentPageIndex = 0;
        this.displayOverride = null;
        this.displayElement = document.getElementById('lvglDisplay');
        this.yamlEditor = document.getElementById('yamlEditor');
        this.pageSelect = document.getElementById('pageSelect');
        this.pageInfo = document.getElementById('pageInfo');

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
                this.renderCurrentPage();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            if (this.currentPageIndex < this.pages.length - 1) {
                this.currentPageIndex++;
                this.syncPageSelect();
                this.renderCurrentPage();
            }
        });

        this.pageSelect.addEventListener('change', () => {
            this.currentPageIndex = parseInt(this.pageSelect.value);
            this.renderCurrentPage();
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

        document.getElementById('toggleMockPanel').addEventListener('click', () => {
            const panel = document.getElementById('mockPanel');
            const btn = document.getElementById('toggleMockPanel');
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

            const root = this._detectRootYaml(map);
            if (!root) { alert('No YAML file found in ZIP.'); return; }
            this.yamlEditor.value = map[root];
            this.renderFromEditor();
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

            const root = this._detectRootYaml(map);
            if (!root) { alert('No YAML file found in folder.'); return; }
            this.yamlEditor.value = map[root];
            this.renderFromEditor();
        } catch (error) {
            console.error('Error loading folder:', error);
            alert('Error loading folder: ' + error.message);
        }
    }

    _detectRootYaml(map) {
        const yamls = Object.keys(map).filter(k => /\.(yaml|yml)$/i.test(k));
        if (yamls.length === 0) return null;
        // Prefer root-level files (no slash in path)
        const rootLevel = yamls.filter(k => !k.includes('/'));
        const pool = rootLevel.length > 0 ? rootLevel : yamls;
        // Prefer the one containing lvgl: or display:
        const withLvgl = pool.filter(k => /^(lvgl|display)\s*:/m.test(map[k]));
        if (withLvgl.length > 0) return withLvgl[0];
        return pool.sort()[0];
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
            const resolved = await resolveIncludes(raw, this.fileMap);
            const { text: preprocessed, substitutions } = preprocessYAML(resolved);
            this.substitutions = substitutions;
            this.config = jsyaml.load(preprocessed);
            this.currentPageIndex = 0;
            this.render();
        } catch (error) {
            console.error('Error parsing YAML:', error);
            this.displayYAMLError(error, raw);
            const summaryEl = document.getElementById('entitySummary');
            if (summaryEl) summaryEl.style.display = 'none';
            const mockPanel = document.getElementById('mockPanel');
            if (mockPanel) mockPanel.classList.remove('mock-panel--visible');
        }
    }

    parseGlobals() {
        const globals = this.config.globals || [];
        globals.forEach(g => {
            if (!g.id) return;
            const cppType = (g.type || 'float').trim();
            const simType = this._mapCppType(cppType);
            const rawInitial = g.initial_value !== undefined ? String(g.initial_value) : undefined;
            const initialValue = rawInitial !== undefined
                ? this._coerceGlobalValue(rawInitial, simType)
                : this._defaultForType(simType);

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
        if (cpp === 'bool') return 'boolean';
        if (cpp === 'std::string' || cpp === 'string') return 'string';
        if (/^(float|double)$/.test(cpp)) return 'float';
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

    render() {
        if (!this.config || !this.config.lvgl) {
            this.displayError('No LVGL configuration found');
            return;
        }

        if (this._storeUnsub) { this._storeUnsub(); this._storeUnsub = null; }
        if (this._rerenderTimer) { clearTimeout(this._rerenderTimer); this._rerenderTimer = null; }

        try {
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

            this.parseGlobals();
            this.parseSensorComponents();
            this.setupDisplay();
            this.pages = this.config.lvgl.pages || [];

            if (this.pages.length === 0) {
                this.displayError('No pages found in configuration');
                return;
            }

            this.populatePageSelect();
            this.renderCurrentPage();
            this.updateEntitySummary();
            this.populateMockPanel();
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

        document.getElementById('displaySize').textContent = `${width}x${height}`;
        document.getElementById('colorDepth').textContent = `${colorDepth}-bit`;
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
        document.getElementById('prevPage').disabled = this.currentPageIndex === 0;
        document.getElementById('nextPage').disabled = this.currentPageIndex === this.pages.length - 1;
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

    renderCurrentPage() {
        this.displayElement.innerHTML = '';
        const page = this.pages[this.currentPageIndex];
        if (page) this.renderPage(page);
        this.syncPageSelect();
    }

    renderPage(page) {
        this._renderedElements = {};
        this._deferredAlignments = [];

        const pageEl = document.createElement('div');
        pageEl.className = 'lvgl-page';
        pageEl.style.cssText = 'position:absolute;width:100%;height:100%;top:0;left:0;';

        if (page.bg_color) pageEl.style.backgroundColor = this.parseColor(page.bg_color);

        if (page.widgets) {
            page.widgets.forEach(w => {
                const el = this.renderWidget(w, pageEl);
                if (el) pageEl.appendChild(el);
            });
        }

        this.displayElement.appendChild(pageEl);
        this._resolveAlignments();
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
            default:
                console.warn(`Unsupported widget: ${type}`);
                el = this.renderUnsupported(type, cfg, parent);
        }

        if (el) {
            if (cfg && cfg.id) this._renderedElements[cfg.id] = el;
            if (cfg && cfg.align_to) this._deferredAlignments.push({ el, alignTo: cfg.align_to });
        }
        return el;
    }

    resolveStyles(config) {
        const themeDefaults = (this.theme || {})[this.currentWidgetType] || {};
        const ids = config.styles
            ? (Array.isArray(config.styles) ? config.styles : [config.styles])
            : [];
        const base = Object.assign({}, themeDefaults);
        ids.forEach(id => {
            const s = this.styleDefinitions[id];
            if (s) this._deepMerge(base, s);
        });
        return Object.assign(base, config);
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

        if (config.radius !== undefined) el.style.borderRadius = config.radius + 'px';

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
            case 'TOP_MID':
                el.style.left = '50%';
                el.style.top = oy + 'px';
                el.style.transform = `translateX(calc(-50% + ${ox}px))`;
                return;
            case 'BOTTOM_MID':
                el.style.left = '50%';
                el.style.bottom = (-oy) + 'px';
                el.style.transform = `translateX(calc(-50% + ${ox}px))`;
                return;
            case 'LEFT_MID':
                el.style.left = ox + 'px';
                el.style.top = '50%';
                el.style.transform = `translateY(calc(-50% + ${oy}px))`;
                return;
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
            el.style.width = typeof config.width === 'string' && config.width.includes('%')
                ? config.width : config.width + 'px';
        }
        if (config.height !== undefined) {
            el.style.height = typeof config.height === 'string' && config.height.includes('%')
                ? config.height : config.height + 'px';
        }
    }

    applyLayout(el, config) {
        if (!config.layout) return;
        const layout = config.layout;

        if (layout.type === 'FLEX') {
            el.style.display = 'flex';
            const flow = (layout.flex_flow || 'ROW').toUpperCase();
            el.style.flexDirection = flow.includes('COLUMN')
                ? (flow.includes('REVERSE') ? 'column-reverse' : 'column')
                : (flow.includes('REVERSE') ? 'row-reverse' : 'row');

            el.style.justifyContent = this.flexAlign(layout.flex_align_main);
            el.style.alignItems     = this.flexAlign(layout.flex_align_cross);

            if (layout.pad_row !== undefined || layout.pad_column !== undefined) {
                el.style.gap = `${layout.pad_row ?? 0}px ${layout.pad_column ?? 0}px`;
            }
        } else if (layout.type === 'GRID') {
            el.style.display = 'grid';
            if (layout.grid_columns) {
                el.style.gridTemplateColumns = this.parseLvglGridTrack(layout.grid_columns);
            }
            if (layout.grid_rows) {
                el.style.gridTemplateRows = this.parseLvglGridTrack(layout.grid_rows);
            }
            if (layout.pad_column !== undefined) el.style.columnGap = layout.pad_column + 'px';
            if (layout.pad_row    !== undefined) el.style.rowGap    = layout.pad_row    + 'px';
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
        const match = String(font).match(/_(\d+)$/);
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

    getShareURL() {
        const yaml = this.yamlEditor.value;
        const encoded = btoa(unescape(encodeURIComponent(yaml)));
        return `${location.origin}${location.pathname}#yaml=${encoded}`;
    }

    loadFromHash() {
        const hash = location.hash;
        if (!hash.startsWith('#yaml=')) return false;
        try {
            const yaml = decodeURIComponent(escape(atob(hash.slice(6))));
            this.yamlEditor.value = yaml;
            this.renderFromEditor();
            return true;
        } catch (e) {
            return false;
        }
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

    populateMockPanel() {
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
            document.getElementById('mockPanel').classList.remove('mock-panel--visible');
            return;
        }
        document.getElementById('mockPanel').classList.add('mock-panel--visible');
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
            const isNumeric = numericTypes.has(type) && item.type !== 'boolean' && item.type !== 'string';
            const isBoolean = item.type === 'boolean' || type === 'binary_sensor';
            const isString = item.type === 'string' || type === 'text_sensor';
            if (isNumeric) {
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

        sliderRow.appendChild(slider);
        sliderRow.appendChild(numInput);
        wrapper.appendChild(labelRow);
        wrapper.appendChild(sliderRow);
        wrapper.appendChild(rangeRow);
        return wrapper;
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
});

document.addEventListener('DOMContentLoaded', () => {
    new ESPHomeLVGLSimulator();
});
