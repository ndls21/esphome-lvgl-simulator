// Spinner widget renderer for ESPHome LVGL Simulator

export function renderSpinner(config, parent) {
    const cfg = this.resolveStyles(config);

    const w = cfg.width ?? 50;
    const h = cfg.height ?? w;
    const arcWidth = cfg.arc_width ?? 4;
    const arcLength = cfg.arc_length ?? 60;  // degrees of the indicator arc segment

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.overflow = 'visible';
    svg.classList.add('lvgl-spinner');

    const spinMs = parseDuration(cfg.spin_time ?? '1s');
    svg.style.animation = `lvgl-spin ${spinMs}ms linear infinite`;

    // Apply position using the shared arc position helper
    this.applyArcPosition(svg, cfg, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - arcWidth / 2 - 2;

    // Background track: full circle
    const trackColor = this.parseColor(cfg.arc_color ?? 0x333333);
    const track = this.makeSVGArc(ns, cx, cy, r, 0, 360, arcWidth, trackColor, 'butt');
    svg.appendChild(track);

    // Indicator arc: partial arc segment fixed at 12 o'clock (-90° in SVG coords)
    // In SVG, 0° = 3 o'clock, so -90° = 12 o'clock (top of circle)
    const ind = cfg.indicator || {};
    const indWidth = ind.arc_width ?? arcWidth;
    const indColor = this.parseColor(ind.arc_color ?? 0x4DA6FF);

    const arcLengthVal = String(arcLength).includes('__lambda__') ? 60 : Number(arcLength);
    const indicator = this.makeSVGArc(ns, cx, cy, r, -90, arcLengthVal, indWidth, indColor, 'round');
    svg.appendChild(indicator);

    return svg;
}

function parseDuration(val) {
    const s = String(val ?? '1s').trim();
    if (s.endsWith('ms')) return parseInt(s);
    return Math.round(parseFloat(s) * 1000);
}
