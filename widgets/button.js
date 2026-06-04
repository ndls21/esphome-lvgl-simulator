export function renderButton(config, parent) {
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
    if (cfg.on_click) {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.lambda._proxy = this._buildLVGLProxy();
            this.lambda.evaluate(cfg.on_click, null);
        });
    }
    if (cfg.widgets) {
        cfg.widgets.forEach(w => {
            const child = this.renderWidget(w, el);
            if (child) el.appendChild(child);
        });
    }
    return el;
}
