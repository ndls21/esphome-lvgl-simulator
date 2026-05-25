export function renderLine(config, parent) {
    const cfg = this.resolveStyles(config);

    const points = cfg.points || [];
    if (points.length < 2) return this.renderUnsupported('line (needs ≥2 points)', cfg, parent);

    const xs = points.map(p => p.x ?? 0);
    const ys = points.map(p => p.y ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const lw = cfg.line_width ?? 2;
    const pad = lw;
    const w = (maxX - minX) + pad * 2;
    const h = (maxY - minY) + pad * 2;

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${w} ${h}`);
    svg.style.position = 'absolute';
    svg.style.overflow = 'visible';

    const ox = cfg.x ?? 0;
    const oy = cfg.y ?? 0;
    const align = (cfg.align || '').toUpperCase();
    if (align === 'CENTER') {
        svg.style.left = `calc(50% - ${w / 2}px + ${ox}px)`;
        svg.style.top  = `calc(50% - ${h / 2}px + ${oy}px)`;
    } else if (align === 'TOP_MID') {
        svg.style.left = `calc(50% - ${w / 2}px + ${ox}px)`;
        svg.style.top  = oy + 'px';
    } else if (align === 'BOTTOM_MID') {
        svg.style.left   = `calc(50% - ${w / 2}px + ${ox}px)`;
        svg.style.bottom = (-oy) + 'px';
    } else {
        svg.style.left = ox + 'px';
        svg.style.top  = oy + 'px';
    }

    const rawColor = cfg.line_color;
    const colorVal = (rawColor !== undefined && String(rawColor).includes('__lambda__'))
        ? 0x888888
        : (rawColor ?? 0x888888);

    const polyline = document.createElementNS(ns, 'polyline');
    const pts = points.map(p => `${p.x ?? 0},${p.y ?? 0}`).join(' ');
    polyline.setAttribute('points', pts);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', this.parseColor(colorVal));
    polyline.setAttribute('stroke-width', lw);
    polyline.setAttribute('stroke-linecap', cfg.line_rounded ? 'round' : 'butt');
    polyline.setAttribute('stroke-linejoin', cfg.line_rounded ? 'round' : 'miter');

    svg.appendChild(polyline);
    return svg;
}
