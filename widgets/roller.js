export function renderRoller(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-roller';
    this.applyCommonStyles(el, cfg);

    // Normalise options: accept both a YAML list and a newline-separated string
    const options = Array.isArray(cfg.options)
        ? cfg.options.map(String)
        : String(cfg.options || '').split('\n').filter(Boolean);

    // selected_index (integer, 0-based) — NOT cfg.selected which is a PART styling block
    const selectedIdx = cfg.selected_index ?? 0;
    const selectedPartStyle = cfg.selected || {};

    const visibleRows = cfg.visible_row_count ?? 3;

    // Show a window of visibleRows items centred on selectedIdx
    const half = Math.floor(visibleRows / 2);
    let startIdx = Math.max(0, selectedIdx - half);
    const endIdx = Math.min(options.length - 1, startIdx + visibleRows - 1);
    // Adjust start if we hit the end of the list
    startIdx = Math.max(0, endIdx - visibleRows + 1);

    for (let i = startIdx; i <= endIdx; i++) {
        const row = document.createElement('div');
        const isSelected = (i === selectedIdx);
        row.className = 'lvgl-roller__option' + (isSelected ? ' lvgl-roller__option--selected' : '');

        const txt = options[i] ?? '';
        row.textContent = String(txt).includes('__lambda__') ? '---' : txt;

        if (isSelected) {
            // Apply selected PART styling
            if (selectedPartStyle.text_color) {
                row.style.color = this.parseColor(selectedPartStyle.text_color);
            } else if (cfg.text_color) {
                row.style.color = this.parseColor(cfg.text_color);
            }
            if (selectedPartStyle.text_font) {
                row.style.fontSize = this.parseFontSize(selectedPartStyle.text_font);
                row.style.fontFamily = this.parseFontFamily(selectedPartStyle.text_font);
            } else if (cfg.text_font) {
                row.style.fontSize = this.parseFontSize(cfg.text_font);
                row.style.fontFamily = this.parseFontFamily(cfg.text_font);
            }
            if (selectedPartStyle.bg_color) {
                row.style.backgroundColor = this.parseColor(selectedPartStyle.bg_color);
            }
        } else {
            if (cfg.text_color) row.style.color = this.parseColor(cfg.text_color);
            if (cfg.text_font) {
                row.style.fontSize = this.parseFontSize(cfg.text_font);
                row.style.fontFamily = this.parseFontFamily(cfg.text_font);
            }
        }

        el.appendChild(row);
    }

    return el;
}
