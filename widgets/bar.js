export function renderBar(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-bar';
    this.applyCommonStyles(el, cfg);

    const min = cfg.min_value ?? 0;
    const max = cfg.max_value ?? 100;
    el.dataset.barMin = min;
    el.dataset.barMax = max;
    const rawVal = cfg.value;
    const isLambda = rawVal !== undefined && String(rawVal).includes('__lambda__');
    const val = isLambda
        ? (min + max) / 2
        : Math.min(max, Math.max(min, Number(rawVal ?? min)));
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;

    const direction = String(cfg.direction || 'LEFT_RIGHT').toUpperCase();

    const indicator = document.createElement('div');
    indicator.className = 'lvgl-bar__indicator';

    if (direction === 'TOP_BOTTOM' || direction === 'BOTTOM_TOP') {
        // Vertical bar: container uses flex column layout, indicator fills by height
        el.style.display = 'flex';
        if (direction === 'BOTTOM_TOP') {
            el.style.flexDirection = 'column-reverse';
        } else {
            el.style.flexDirection = 'column';
        }
        indicator.style.width = '100%';
        indicator.style.height = pct + '%';
    } else if (direction === 'RIGHT_LEFT') {
        // Horizontal bar filling right-to-left: push indicator to right edge
        el.style.display = 'flex';
        el.style.flexDirection = 'row';
        indicator.style.marginLeft = 'auto';
        indicator.style.width = pct + '%';
        indicator.style.height = '100%';
    } else {
        // LEFT_RIGHT (default): fill from left to right
        indicator.style.width = pct + '%';
    }

    if (isLambda) indicator.classList.add('lvgl-bar__indicator--unknown');

    if (cfg.indicator) this.applyPartStyles(indicator, cfg.indicator);

    el.appendChild(indicator);
    return el;
}
