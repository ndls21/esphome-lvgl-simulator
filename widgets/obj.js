export function renderObj(config, parent) {
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
