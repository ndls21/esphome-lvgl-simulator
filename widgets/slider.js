export function renderSlider(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-slider';
    this.applyCommonStyles(el, cfg);

    const min = cfg.min_value ?? 0;
    const max = cfg.max_value ?? 100;
    const rawVal = cfg.value;
    const isLambda = rawVal !== undefined && String(rawVal).includes('__lambda__');
    const val = isLambda
        ? (min + max) / 2
        : Math.min(max, Math.max(min, Number(rawVal ?? min)));
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;

    // Indicator (filled portion)
    const indicator = document.createElement('div');
    indicator.className = 'lvgl-slider__indicator';
    indicator.style.width = pct + '%';
    if (isLambda) indicator.classList.add('lvgl-slider__indicator--unknown');

    const ind = cfg.indicator || {};
    if (ind.bg_color !== undefined) {
        indicator.style.backgroundColor = this.parseColor(ind.bg_color);
    }
    if (ind.radius !== undefined) {
        indicator.style.borderRadius = ind.radius >= 100 ? '50%' : ind.radius + 'px';
    }

    // Knob
    const knob = document.createElement('div');
    knob.className = 'lvgl-slider__knob';
    knob.style.left = pct + '%';

    const k = cfg.knob || {};
    const knobW = k.width ?? 16;
    const knobH = k.height ?? knobW;
    knob.style.width = knobW + 'px';
    knob.style.height = knobH + 'px';
    knob.style.marginLeft = -(knobW / 2) + 'px';

    if (k.bg_color !== undefined) {
        knob.style.backgroundColor = this.parseColor(k.bg_color);
    }
    const kr = k.radius ?? 255;
    knob.style.borderRadius = kr >= 100 ? '50%' : kr + 'px';

    // Lambda marker: '?' overlaid on the knob
    if (isLambda) {
        knob.classList.add('lvgl-slider__knob--unknown');
        const marker = document.createElement('span');
        marker.className = 'lvgl-slider__lambda-marker';
        marker.textContent = '?';
        knob.appendChild(marker);
    }

    el.appendChild(indicator);
    el.appendChild(knob);
    return el;
}
