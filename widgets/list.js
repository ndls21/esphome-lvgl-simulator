export function renderList(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-list';
    this.applyCommonStyles(el, cfg);

    // items: array of { text, icon } objects
    if (Array.isArray(cfg.items)) {
        cfg.items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'lvgl-list__item';
            if (item.icon) {
                const icon = document.createElement('span');
                icon.className = 'lvgl-list__icon';
                icon.textContent = String(item.icon);
                row.appendChild(icon);
            }
            const label = document.createElement('span');
            label.className = 'lvgl-list__text';
            label.textContent = String(item.text || '');
            row.appendChild(label);
            el.appendChild(row);
        });
    }

    // widgets: children passed through renderWidget
    if (Array.isArray(cfg.widgets)) {
        cfg.widgets.forEach(child => {
            const childEl = this.renderWidget(child, el);
            if (childEl) el.appendChild(childEl);
        });
    }

    return el;
}
