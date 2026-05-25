export function renderCheckbox(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-checkbox';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '8px';
    this.applyPosition(el, cfg);

    // The checkbox box (indicator)
    const box = document.createElement('div');
    box.className = 'lvgl-checkbox__box';
    const ind = cfg.indicator || {};
    if (ind.bg_color) box.style.backgroundColor = this.parseColor(ind.bg_color);
    if (ind.border_color) box.style.borderColor = this.parseColor(ind.border_color);
    if (ind.border_width !== undefined) box.style.borderWidth = ind.border_width + 'px';
    if (ind.radius !== undefined) box.style.borderRadius = ind.radius + 'px';
    if (cfg.checked) box.classList.add('lvgl-checkbox__box--checked');

    // The text label
    const label = document.createElement('span');
    label.className = 'lvgl-checkbox__label';
    if (cfg.text !== undefined) {
        const txt = String(cfg.text);
        label.textContent = txt.includes('__lambda__') ? '---' : txt;
    }
    if (cfg.text_color) label.style.color = this.parseColor(cfg.text_color);
    if (cfg.text_font) {
        label.style.fontSize = this.parseFontSize(cfg.text_font);
        label.style.fontFamily = this.parseFontFamily(cfg.text_font);
    }

    el.appendChild(box);
    el.appendChild(label);
    return el;
}
