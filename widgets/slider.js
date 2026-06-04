export function renderSlider(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-slider';
    this.applyCommonStyles(el, cfg);

    const min = cfg.min_value ?? 0;
    const max = cfg.max_value ?? 100;
    el.dataset.sliderMin = min;
    el.dataset.sliderMax = max;
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

    if (cfg.indicator) this.applyPartStyles(indicator, cfg.indicator);

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

    // Apply knob radius default before applyPartStyles (so explicit config overrides it)
    const kr = k.radius ?? 255;
    knob.style.borderRadius = kr >= 100 ? '50%' : kr + 'px';
    if (cfg.knob) this.applyPartStyles(knob, cfg.knob);

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
