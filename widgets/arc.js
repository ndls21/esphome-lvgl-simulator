export function renderArc(config, parent) {
    const cfg = this.resolveStyles(config);
    const width = cfg.width || 100;
    const height = cfg.height || width;
    const mainPart = this.extractPartStyles(cfg, 'main');
    const arcWidth = mainPart.arc_width || 8;
    const rounded = mainPart.arc_rounded ? 'round' : 'butt';

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.position = 'absolute';
    svg.style.overflow = 'visible';
    this.applyArcPosition(svg, cfg, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2 - arcWidth / 2 - 2;

    const startAngle = cfg.start_angle ?? 135;
    const endAngle = cfg.end_angle ?? 45;
    const minVal = cfg.min_value ?? 0;
    const maxVal = cfg.max_value ?? 100;
    // LVGL 0° = 6 o'clock, SVG 0° = 3 o'clock → subtract 90
    const svgStartAngle = startAngle - 90;
    const svgEndAngle = endAngle - 90;
    // Lambda value renders at midpoint with dashed indicator
    const rawValue = cfg.value;
    const isLambda = rawValue !== undefined && String(rawValue).includes('__lambda__');
    const value = isLambda ? (minVal + maxVal) / 2 : (rawValue ?? minVal);

    const totalSpan = ((svgEndAngle - svgStartAngle) + 360) % 360 || 360;
    const mode = String(cfg.mode || 'NORMAL').toUpperCase();

    const bgColor = this.parseColor(mainPart.arc_color ?? 0x333333);
    const bgArcEl = this.makeSVGArc(ns, cx, cy, r, svgStartAngle, totalSpan, arcWidth, bgColor, rounded);
    if (cfg.arc_opa !== undefined) bgArcEl.setAttribute('stroke-opacity', this.parseOpacity(cfg.arc_opa));
    svg.appendChild(bgArcEl);

    if (cfg.indicator) {
        const fraction = maxVal > minVal ? Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal))) : 0;
        const { indStartAngle, indicatorSpan } = _computeIndicatorAngles(mode, svgStartAngle, totalSpan, fraction);
        if (indicatorSpan > 0) {
            const indColor = this.parseColor(cfg.indicator.arc_color ?? 0x4DA6FF);
            const indWidth = cfg.indicator.arc_width ?? arcWidth;
            const indRounded = cfg.indicator.arc_rounded ? 'round' : rounded;
            const indicatorEl = this.makeSVGArc(ns, cx, cy, r, indStartAngle, indicatorSpan, indWidth, indColor, indRounded);
            indicatorEl.classList.add('arc-indicator');
            if (isLambda) indicatorEl.setAttribute('stroke-dasharray', '8 4');
            if (cfg.indicator.arc_opa !== undefined) indicatorEl.setAttribute('stroke-opacity', this.parseOpacity(cfg.indicator.arc_opa));
            svg.appendChild(indicatorEl);
        }
    }

    const el = svg;
    el.dataset.arcValue = value.toString();

    el.addEventListener('lvgl-arc-update', (e) => {
        const newVal = e.detail.value;
        const svgEl = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
        if (!svgEl) return;

        const minVal = cfg.min_value ?? 0;
        const maxVal = cfg.max_value ?? 100;
        const clamped = Math.max(minVal, Math.min(maxVal, newVal));
        const pct = maxVal > minVal ? (clamped - minVal) / (maxVal - minVal) : 0;

        const indicatorPath = svgEl.querySelector('.arc-indicator');
        if (indicatorPath) {
            const newD = _computeArcIndicatorPath(cfg, pct, cx, cy, r, arcWidth, rounded);
            if (newD) indicatorPath.setAttribute('d', newD);
        }
    });

    el.addEventListener('lvgl-arc-range-update', (e) => {
        cfg.min_value = e.detail.min;
        cfg.max_value = e.detail.max;
        const currentVal = parseFloat(el.dataset.arcValue ?? cfg.value ?? cfg.min_value ?? 0);
        el.dispatchEvent(new CustomEvent('lvgl-arc-update', { detail: { value: currentVal } }));
    });

    if (cfg.widgets) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:absolute;width:0;height:0;top:0;left:0;';
        wrapper.appendChild(svg);

        const overlay = document.createElement('div');
        overlay.style.cssText = `position:absolute;width:${width}px;height:${height}px;`;
        this.applyArcPosition(overlay, cfg, width, height);
        cfg.widgets.forEach(child => {
            const childEl = this.renderWidget(child, overlay);
            if (childEl) overlay.appendChild(childEl);
        });
        wrapper.appendChild(overlay);

        wrapper.addEventListener('lvgl-arc-update', (e) => {
            const newVal = e.detail.value;
            const svgEl = wrapper.querySelector('svg');
            if (!svgEl) return;

            const minVal = cfg.min_value ?? 0;
            const maxVal = cfg.max_value ?? 100;
            const clamped = Math.max(minVal, Math.min(maxVal, newVal));
            const pct = maxVal > minVal ? (clamped - minVal) / (maxVal - minVal) : 0;

            const indicatorPath = svgEl.querySelector('.arc-indicator');
            if (indicatorPath) {
                const newD = _computeArcIndicatorPath(cfg, pct, cx, cy, r, arcWidth, rounded);
                if (newD) indicatorPath.setAttribute('d', newD);
            }
        });

        return wrapper;
    }

    return svg;
}

// Compute indicator start angle and span based on arc mode.
// mode: 'NORMAL'      — fill from svgStartAngle forward by pct * totalSpan
// mode: 'REVERSE'     — fill from svgEndAngle backward by pct * totalSpan
// mode: 'SYMMETRICAL' — fill centered on arc midpoint, pct * totalSpan / 2 each side
function _computeIndicatorAngles(mode, svgStartAngle, totalSpan, fraction) {
    const svgEndAngle = svgStartAngle + totalSpan;
    const indicatorSpan = fraction * totalSpan;

    if (mode === 'REVERSE') {
        return {
            indStartAngle: svgEndAngle - indicatorSpan,
            indicatorSpan,
        };
    }

    if (mode === 'SYMMETRICAL') {
        const midAngle = svgStartAngle + totalSpan / 2;
        const halfSpan = indicatorSpan / 2;
        return {
            indStartAngle: midAngle - halfSpan,
            indicatorSpan,
        };
    }

    // NORMAL (default)
    return {
        indStartAngle: svgStartAngle,
        indicatorSpan,
    };
}

function _computeArcIndicatorPath(cfg, pct, cx, cy, r, arcWidth, rounded) {
    const startAngle = cfg.start_angle ?? 135;
    const endAngle = cfg.end_angle ?? 45;
    const svgStartAngle = startAngle - 90;
    const svgEndAngle = endAngle - 90;
    const totalSpan = ((svgEndAngle - svgStartAngle) + 360) % 360 || 360;
    const mode = String(cfg.mode || 'NORMAL').toUpperCase();

    const { indStartAngle, indicatorSpan } = _computeIndicatorAngles(mode, svgStartAngle, totalSpan, pct);
    if (indicatorSpan <= 0) return null;

    const toRad = d => d * Math.PI / 180;
    const endDeg = indStartAngle + indicatorSpan;
    const x1 = cx + r * Math.cos(toRad(indStartAngle));
    const y1 = cy + r * Math.sin(toRad(indStartAngle));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    const largeArc = indicatorSpan > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function makeSVGArc(ns, cx, cy, r, startDeg, spanDeg, strokeWidth, color, linecap) {
    if (spanDeg <= 0) return document.createElementNS(ns, 'g');

    if (spanDeg >= 360) {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', color);
        circle.setAttribute('stroke-width', strokeWidth);
        return circle;
    }

    const toRad = d => d * Math.PI / 180;
    const endDeg = startDeg + spanDeg;
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    const largeArc = spanDeg > 180 ? 1 : 0;

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', strokeWidth);
    path.setAttribute('stroke-linecap', linecap || 'round');
    return path;
}

export function applyArcPosition(el, config, width, height) {
    el.style.position = 'absolute';
    const align = (config.align || '').toUpperCase();
    const ox = config.x ?? 0;
    const oy = config.y ?? 0;

    switch (align) {
        case 'CENTER':
            el.style.left = `calc(50% - ${width / 2}px + ${ox}px)`;
            el.style.top  = `calc(50% - ${height / 2}px + ${oy}px)`;
            break;
        case 'TOP_MID':
            el.style.left = `calc(50% - ${width / 2}px + ${ox}px)`;
            el.style.top  = oy + 'px';
            break;
        case 'BOTTOM_MID':
            el.style.left   = `calc(50% - ${width / 2}px + ${ox}px)`;
            el.style.bottom = (-oy) + 'px';
            break;
        default:
            el.style.left = (config.x ?? 0) + 'px';
            el.style.top  = (config.y ?? 0) + 'px';
    }
}
