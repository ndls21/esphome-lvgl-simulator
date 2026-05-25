export function renderLabel(config, parent) {
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
