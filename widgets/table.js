export function renderTable(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-table';
    this.applyCommonStyles(el, cfg);

    const colWidths = Array.isArray(cfg.column_widths) ? cfg.column_widths : [];
    const rows = Array.isArray(cfg.rows) ? cfg.rows : [];

    const table = document.createElement('table');
    rows.forEach((row, rowIdx) => {
        const cells = Array.isArray(row) ? row : [row];
        const tr = document.createElement('tr');
        cells.forEach((cell, colIdx) => {
            const td = document.createElement(rowIdx === 0 ? 'th' : 'td');
            td.textContent = String(cell ?? '');
            if (colWidths[colIdx] !== undefined) {
                td.style.width = colWidths[colIdx] + 'px';
            }
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });
    el.appendChild(table);

    if (cfg.text_color) el.style.color = this.parseColor(cfg.text_color);
    if (cfg.text_font) {
        el.style.fontSize = this.parseFontSize(cfg.text_font);
        el.style.fontFamily = this.parseFontFamily(cfg.text_font);
    }

    return el;
}
