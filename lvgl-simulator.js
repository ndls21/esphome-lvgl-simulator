class SimulatorStateStore {
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
      this._listeners[id] = this._listeners[id].filter(cb => cb !== callback);
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

class ESPHomeLVGLSimulator {
    constructor() {
        this.config = null;
        this.styleDefinitions = {};
        this.store = new SimulatorStateStore();
        this.pages = [];
        this.currentPageIndex = 0;
        this.displayElement = document.getElementById('lvglDisplay');
        this.yamlEditor = document.getElementById('yamlEditor');
        this.pageSelect = document.getElementById('pageSelect');
        this.pageInfo = document.getElementById('pageInfo');

        this.init();
        this.loadExampleConfig();
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
    }

    async loadConfigFile(file) {
        try {
            const text = await file.text();
            this.yamlEditor.value = text;
            this.renderFromEditor();
        } catch (error) {
            console.error('Error loading config file:', error);
            alert('Error loading config file: ' + error.message);
        }
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

    // Strip ESPHome-specific YAML tags that js-yaml cannot parse
    preprocessYAML(text) {
        const lines = text.split('\n');
        const result = [];
        let inLambdaBlock = false;
        let lambdaIndent = 0;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // Handle !secret
            line = line.replace(/!secret\s+(\S+)/g, '"__secret_$1__"');

            // Detect start of block lambda (!lambda |  or  !lambda |-)
            const blockLambdaMatch = line.match(/^(\s*\S.*?:\s*)!lambda\s+\|-?\s*$/);
            if (blockLambdaMatch) {
                result.push(blockLambdaMatch[1] + '"__lambda__"');
                inLambdaBlock = true;
                lambdaIndent = line.match(/^(\s*)/)[1].length;
                continue;
            }

            // If inside a block lambda, skip lines that are more indented
            if (inLambdaBlock) {
                const lineIndent = line.match(/^(\s*)/)[1].length;
                if (line.trim() === '' || lineIndent > lambdaIndent) {
                    continue; // skip lambda body lines
                } else {
                    inLambdaBlock = false; // end of block
                }
            }

            // Handle inline lambda (quoted or unquoted)
            // Quoted: !lambda "..." or !lambda '...'
            line = line.replace(/!lambda\s+"[^"]*"/g, '"__lambda__"');
            line = line.replace(/!lambda\s+'[^']*'/g, '"__lambda__"');
            // Unquoted: !lambda return ...;  (anything to end of line)
            line = line.replace(/!lambda\s+(.+)$/, '"__lambda__"');

            // Handle other ESPHome tags
            line = line.replace(/!extend\s+\w+/g, '');
            line = line.replace(/!remove\s+\w+/g, '"__remove__"');
            line = line.replace(/!include\s+\S+/g, '"__include__"');

            result.push(line);
        }
        return result.join('\n');
    }

    renderFromEditor() {
        try {
            this.store.clear();
            const raw = this.yamlEditor.value;
            const preprocessed = this.preprocessYAML(raw);
            this.config = jsyaml.load(preprocessed);
            this.currentPageIndex = 0;
            this.render();
        } catch (error) {
            console.error('Error parsing YAML:', error);
            this.displayError('YAML Parse Error: ' + error.message);
        }
    }

    render() {
        if (!this.config || !this.config.lvgl) {
            this.displayError('No LVGL configuration found');
            return;
        }

        try {
            this.styleDefinitions = {};
            (this.config.lvgl.style_definitions || []).forEach(def => {
                if (def.id) {
                    const { id, ...props } = def;
                    this.styleDefinitions[id] = props;
                }
            });

            this.setupDisplay();
            this.pages = this.config.lvgl.pages || [];

            if (this.pages.length === 0) {
                this.displayError('No pages found in configuration');
                return;
            }

            this.populatePageSelect();
            this.renderCurrentPage();
        } catch (error) {
            console.error('Error rendering:', error);
            this.displayError('Render Error: ' + error.message);
        }
    }

    setupDisplay() {
        const display = this.config.display?.[0];
        const lvgl = this.config.lvgl;

        // Default to 466x466 for Waveshare 1.75" AMOLED
        const width = display?.dimensions?.width || 466;
        const height = display?.dimensions?.height || 466;
        const colorDepth = lvgl?.color_depth || 16;

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

    renderCurrentPage() {
        this.displayElement.innerHTML = '';
        const page = this.pages[this.currentPageIndex];
        if (page) this.renderPage(page);
        this.syncPageSelect();
    }

    renderPage(page) {
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
    }

    renderWidget(widget, parent) {
        const type = Object.keys(widget)[0];
        const cfg = widget[type];

        switch (type) {
            case 'obj':    return this.renderObj(cfg, parent);
            case 'label':  return this.renderLabel(cfg, parent);
            case 'arc':    return this.renderArc(cfg, parent);
            case 'button': return this.renderButton(cfg, parent);
            default:
                console.warn(`Unsupported widget: ${type}`);
                return this.renderUnsupported(type, cfg, parent);
        }
    }

    resolveStyles(config) {
        const ids = config.styles
            ? (Array.isArray(config.styles) ? config.styles : [config.styles])
            : [];
        const base = {};
        ids.forEach(id => {
            const s = this.styleDefinitions[id];
            if (s) Object.assign(base, s);
        });
        return Object.assign(base, config);
    }

    renderObj(config, parent) {
        const cfg = this.resolveStyles(config);
        const el = document.createElement('div');
        el.className = 'lvgl-obj';
        this.applyCommonStyles(el, cfg);
        this.applyLayout(el, cfg);

        if (cfg.widgets) {
            cfg.widgets.forEach(child => {
                const childEl = this.renderWidget(child, el);
                if (childEl) el.appendChild(childEl);
            });
        }
        return el;
    }

    renderLabel(config, parent) {
        const cfg = this.resolveStyles(config);
        const el = document.createElement('div');
        el.className = 'lvgl-label';
        this.applyCommonStyles(el, cfg);

        if (cfg.text !== undefined) {
            const txt = String(cfg.text);
            el.textContent = txt.includes('__lambda__') ? '---' : txt;
        }

        if (cfg.text_color) el.style.color = this.parseColor(cfg.text_color);
        if (cfg.text_font) {
            el.style.fontSize = this.parseFontSize(cfg.text_font);
            el.style.fontFamily = this.parseFontFamily(cfg.text_font);
        }
        if (cfg.text_align) {
            const ta = cfg.text_align.toUpperCase();
            el.style.textAlign = ta === 'CENTER' ? 'center' : ta === 'RIGHT' ? 'right' : 'left';
            el.style.justifyContent = ta === 'CENTER' ? 'center' : ta === 'RIGHT' ? 'flex-end' : 'flex-start';
        }

        return el;
    }

    renderButton(config, parent) {
        const cfg = this.resolveStyles(config);
        const el = document.createElement('div');
        el.className = 'lvgl-button';
        this.applyCommonStyles(el, cfg);
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';

        if (cfg.text !== undefined) {
            const txt = String(cfg.text);
            el.textContent = txt.includes('__lambda__') ? '---' : txt;
        }
        if (cfg.text_color) el.style.color = this.parseColor(cfg.text_color);
        if (cfg.text_font) {
            el.style.fontSize = this.parseFontSize(cfg.text_font);
            el.style.fontFamily = this.parseFontFamily(cfg.text_font);
        }
        if (cfg.checkable && cfg.checked) {
            el.classList.add('lvgl-button--checked');
        }
        if (cfg.widgets) {
            cfg.widgets.forEach(w => {
                const child = this.renderWidget(w, el);
                if (child) el.appendChild(child);
            });
        }
        return el;
    }

    renderArc(config, parent) {
        const cfg = this.resolveStyles(config);
        const width = cfg.width || 100;
        const height = cfg.height || width;
        const arcWidth = cfg.arc_width || 8;
        const rounded = cfg.arc_rounded ? 'round' : 'butt';

        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.style.position = 'absolute';
        svg.style.overflow = 'visible';
        this.applyArcPosition(svg, cfg, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) / 2 - arcWidth / 2 - 2;

        // LVGL arc angles: 0° = 3 o'clock (right), clockwise (same as SVG path convention)
        const startAngle = cfg.start_angle ?? 135;
        const endAngle = cfg.end_angle ?? 45;
        const minVal = cfg.min_value ?? 0;
        const maxVal = cfg.max_value ?? 100;
        const value = cfg.value ?? minVal;

        // Clockwise span from start to end
        const totalSpan = ((endAngle - startAngle) + 360) % 360 || 360;

        // Background arc
        const bgColor = this.parseColor(cfg.arc_color ?? 0x333333);
        svg.appendChild(this.makeSVGArc(ns, cx, cy, r, startAngle, totalSpan, arcWidth, bgColor, rounded));

        // Indicator arc
        if (cfg.indicator) {
            const fraction = maxVal > minVal ? Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal))) : 0;
            const indicatorSpan = fraction * totalSpan;
            if (indicatorSpan > 0) {
                const indColor = this.parseColor(cfg.indicator.arc_color ?? 0x4DA6FF);
                const indWidth = cfg.indicator.arc_width ?? arcWidth;
                const indRounded = cfg.indicator.arc_rounded ? 'round' : rounded;
                svg.appendChild(this.makeSVGArc(ns, cx, cy, r, startAngle, indicatorSpan, indWidth, indColor, indRounded));
            }
        }

        // Child widgets overlay
        if (cfg.widgets) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:absolute;width:0;height:0;top:0;left:0;';
            wrapper.appendChild(svg);

            const overlay = document.createElement('div');
            overlay.style.cssText = `position:absolute;width:${width}px;height:${height}px;`;
            this.applyArcPosition(overlay, cfg, width, height);
            cfg.widgets.forEach(child => {
                const childEl = this.renderWidget(child, overlay);
                if (childEl) overlay.appendChild(childEl);
            });
            wrapper.appendChild(overlay);
            return wrapper;
        }

        return svg;
    }

    // Draw an arc starting at startDeg, sweeping clockwise by spanDeg
    makeSVGArc(ns, cx, cy, r, startDeg, spanDeg, strokeWidth, color, linecap) {
        if (spanDeg <= 0) return document.createElementNS(ns, 'g');

        if (spanDeg >= 360) {
            const circle = document.createElementNS(ns, 'circle');
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);
            circle.setAttribute('r', r);
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', color);
            circle.setAttribute('stroke-width', strokeWidth);
            return circle;
        }

        const toRad = d => d * Math.PI / 180;
        const endDeg = startDeg + spanDeg;
        const x1 = cx + r * Math.cos(toRad(startDeg));
        const y1 = cy + r * Math.sin(toRad(startDeg));
        const x2 = cx + r * Math.cos(toRad(endDeg));
        const y2 = cy + r * Math.sin(toRad(endDeg));
        const largeArc = spanDeg > 180 ? 1 : 0;

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', strokeWidth);
        path.setAttribute('stroke-linecap', linecap || 'round');
        return path;
    }

    applyArcPosition(el, config, width, height) {
        el.style.position = 'absolute';
        const align = (config.align || '').toUpperCase();
        const ox = config.x ?? 0;
        const oy = config.y ?? 0;

        switch (align) {
            case 'CENTER':
                el.style.left = `calc(50% - ${width / 2}px + ${ox}px)`;
                el.style.top  = `calc(50% - ${height / 2}px + ${oy}px)`;
                break;
            case 'TOP_MID':
                el.style.left = `calc(50% - ${width / 2}px + ${ox}px)`;
                el.style.top  = oy + 'px';
                break;
            case 'BOTTOM_MID':
                el.style.left   = `calc(50% - ${width / 2}px + ${ox}px)`;
                el.style.bottom = (-oy) + 'px';
                break;
            default:
                el.style.left = (config.x ?? 0) + 'px';
                el.style.top  = (config.y ?? 0) + 'px';
        }
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
    }

    applyPosition(el, config) {
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
        }
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

    displayError(message) {
        this.displayElement.innerHTML = `
            <div class="placeholder" style="color:#ff4444;padding:1rem;text-align:center;">
                <p>Error: ${message}</p>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ESPHomeLVGLSimulator();
});
