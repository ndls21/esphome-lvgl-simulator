export function renderBar(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-bar';
    this.applyCommonStyles(el, cfg);

    const min = cfg.min_value ?? 0;
    const max = cfg.max_value ?? 100;
    const rawVal = cfg.value;
    const isLambda = rawVal !== undefined && String(rawVal).includes('__lambda__');
    const val = isLambda
        ? (min + max) / 2
        : Math.min(max, Math.max(min, Number(rawVal ?? min)));
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;

    const indicator = document.createElement('div');
    indicator.className = 'lvgl-bar__indicator';
    indicator.style.width = pct + '%';
    if (isLambda) indicator.classList.add('lvgl-bar__indicator--unknown');

    const ind = cfg.indicator || {};
    if (ind.bg_color && ind.bg_grad_color && ind.bg_grad_dir) {
        const dir = this.parseGradientDirection(ind.bg_grad_dir);
        indicator.style.background = `linear-gradient(${dir}, ${this.parseColor(ind.bg_color)}, ${this.parseColor(ind.bg_grad_color)})`;
    } else if (ind.bg_color) {
        indicator.style.backgroundColor = this.parseColor(ind.bg_color);
    }
    if (ind.radius !== undefined) indicator.style.borderRadius = ind.radius + 'px';

    el.appendChild(indicator);
    return el;
}
