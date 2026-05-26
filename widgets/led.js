export function renderLed(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-led';

    this.applyCommonStyles(el, cfg);

    const color = cfg.color !== undefined
        ? this.parseColor(cfg.color)
        : '#ffffff';

    let brightness = 1.0;
    const rawBright = cfg.brightness;
    if (rawBright !== undefined) {
        if (typeof rawBright === 'string' && rawBright.endsWith('%')) {
            brightness = parseFloat(rawBright) / 100;
        } else {
            brightness = Math.min(1, Math.max(0, Number(rawBright) / 255));
        }
    }

    el.style.backgroundColor = color;
    el.style.opacity = String(0.2 + brightness * 0.8);
    if (brightness > 0.5) {
        el.style.boxShadow = `0 0 ${Math.round(brightness * 12)}px ${color}`;
    }

    return el;
}
