export function renderDropdown(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-dropdown';
    this.applyCommonStyles(el, cfg);

    // Normalise options: accept both YAML list and newline-separated string
    const options = Array.isArray(cfg.options)
        ? cfg.options.map(String)
        : String(cfg.options || '').split('\n').filter(Boolean);

    if (options.length === 0) options.push('(none)');

    // selected_index (corrected from #44 — NOT config.selected)
    const selectedIdx = cfg.selected_index ?? 0;
    const selectedText = options[selectedIdx] ?? options[0] ?? '';

    // Main part styling
    const mainPart = this.extractPartStyles ? this.extractPartStyles(cfg, 'main') : {};

    const text = document.createElement('span');
    text.className = 'lvgl-dropdown__text';
    text.textContent = String(selectedText).includes('__lambda__') ? '---' : selectedText;

    const arrow = document.createElement('span');
    arrow.className = 'lvgl-dropdown__arrow';

    // Arrow symbol: prefer cfg.symbol, then indicator.text, then default ▾
    const ind = cfg.indicator || {};
    const symbol = cfg.symbol ?? ind.text ?? '▾';
    arrow.textContent = String(symbol).includes('__lambda__') ? '▾' : symbol;

    if (cfg.text_color) {
        text.style.color = this.parseColor(cfg.text_color);
    }
    if (ind.text_color) {
        arrow.style.color = this.parseColor(ind.text_color);
    }
    if (cfg.text_font) {
        const fs = this.parseFontSize(cfg.text_font);
        const ff = this.parseFontFamily(cfg.text_font);
        text.style.fontSize = fs;
        text.style.fontFamily = ff;
        arrow.style.fontSize = fs;
    }

    el.appendChild(text);
    el.appendChild(arrow);
    return el;
}
