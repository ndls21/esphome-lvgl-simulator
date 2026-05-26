export function renderMeter(config, parent) {
    const cfg = this.resolveStyles(config);
    const width  = cfg.width  ?? 200;
    const height = cfg.height ?? 200;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width',  width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.overflow = 'visible';

    const scales = cfg.scales || [];
    for (const scale of scales) {
        const cx = width  / 2;
        const cy = height / 2;
        const padding = 20;
        const r = Math.min(width, height) / 2 - padding;

        const rangeFrom   = scale.range_from   ?? 0;
        const rangeTo     = scale.range_to     ?? 100;
        const angleRange  = scale.angle_range  ?? 270;
        const rotation    = scale.rotation     ?? 135;

        // SVG 0° is 3 o'clock; LVGL rotation is clockwise offset from 3 o'clock
        // startAngleSVG: the actual SVG angle (degrees) for rangeFrom
        const startAngleSVG = rotation - 90;  // convert LVGL rotation to SVG degrees

        const valueToAngle = (v) => {
            const frac = Math.max(0, Math.min(1, (v - rangeFrom) / (rangeTo - rangeFrom)));
            return startAngleSVG + frac * angleRange;
        };

        const toRad = d => d * Math.PI / 180;

        // --- Draw arc indicators (behind ticks) ---
        const indicators = scale.indicators || [];
        for (const ind of indicators) {
            if (ind.arc === undefined) continue;
            const arc = ind.arc;
            const rMod  = arc.r_mod ?? 0;
            const arcR  = r + rMod;
            const color = arc.color !== undefined ? this.parseColor(arc.color) : '#888888';
            const sv    = arc.start_value ?? rangeFrom;
            const ev    = arc.end_value   ?? rangeTo;
            const aStart = valueToAngle(sv);
            const aSpan  = valueToAngle(ev) - aStart;
            if (arcR > 0 && Math.abs(aSpan) > 0.1) {
                const arcEl = this.makeSVGArc(ns, cx, cy, arcR, aStart, aSpan, arc.width ?? 8, color, 'butt');
                svg.appendChild(arcEl);
            }
        }

        // --- Draw tick marks ---
        const ticks = scale.ticks || {};
        const tickCount  = ticks.count  ?? 11;
        const tickLen    = ticks.length ?? 8;
        const tickWidth  = ticks.width  ?? 2;
        const tickColor  = ticks.color !== undefined ? this.parseColor(ticks.color) : '#888888';
        const major      = ticks.major  ?? {};
        const majorStride = major.stride ?? 5;
        const majorLen    = major.length ?? 14;
        const majorWidth  = major.width  ?? 3;
        const majorColor  = major.color  !== undefined ? this.parseColor(major.color) : '#cccccc';
        const labelGap    = major.label_gap ?? 6;

        const rangeSpan = rangeTo - rangeFrom;
        const stepPerTick = tickCount > 1 ? rangeSpan / (tickCount - 1) : 0;
        const isIntStep = Number.isInteger(stepPerTick);

        for (let i = 0; i < tickCount; i++) {
            const isMajor = (i % majorStride === 0);
            const angleDeg = startAngleSVG + (i / Math.max(1, tickCount - 1)) * angleRange;
            const rad = toRad(angleDeg);
            const outerX = cx + r * Math.cos(rad);
            const outerY = cy + r * Math.sin(rad);
            const len    = isMajor ? majorLen  : tickLen;
            const w      = isMajor ? majorWidth : tickWidth;
            const col    = isMajor ? majorColor : tickColor;
            const innerX = cx + (r - len) * Math.cos(rad);
            const innerY = cy + (r - len) * Math.sin(rad);

            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1', outerX.toFixed(2));
            line.setAttribute('y1', outerY.toFixed(2));
            line.setAttribute('x2', innerX.toFixed(2));
            line.setAttribute('y2', innerY.toFixed(2));
            line.setAttribute('stroke', col);
            line.setAttribute('stroke-width', w);
            line.setAttribute('stroke-linecap', 'round');
            svg.appendChild(line);

            // Major tick label
            if (isMajor && major.label_gap !== undefined || (isMajor && ticks.major)) {
                const labelR = r - majorLen - labelGap;
                const lx = cx + labelR * Math.cos(rad);
                const ly = cy + labelR * Math.sin(rad);
                const value = rangeFrom + i * stepPerTick;
                const labelText = isIntStep ? String(Math.round(value)) : value.toFixed(1);
                const text = document.createElementNS(ns, 'text');
                text.setAttribute('x', lx.toFixed(2));
                text.setAttribute('y', ly.toFixed(2));
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'central');
                text.setAttribute('fill', majorColor);
                text.setAttribute('font-size', '10');
                text.textContent = labelText;
                svg.appendChild(text);
            }
        }

        // --- Draw needle (line indicators, on top) ---
        for (const ind of indicators) {
            if (ind.line === undefined) continue;
            const needle = ind.line;
            const rMod   = needle.r_mod ?? 0;
            const needleR = r + rMod;
            const color   = needle.color !== undefined ? this.parseColor(needle.color) : '#ff4444';
            const nWidth  = needle.width ?? 3;
            // value: if lambda/string, default to rangeFrom (centre start)
            const rawVal  = needle.value;
            const value   = (typeof rawVal === 'number') ? rawVal : rangeFrom;
            const angleDeg = valueToAngle(value);
            const rad = toRad(angleDeg);
            const tipX = cx + needleR * Math.cos(rad);
            const tipY = cy + needleR * Math.sin(rad);

            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1', cx.toFixed(2));
            line.setAttribute('y1', cy.toFixed(2));
            line.setAttribute('x2', tipX.toFixed(2));
            line.setAttribute('y2', tipY.toFixed(2));
            line.setAttribute('stroke', color);
            line.setAttribute('stroke-width', nWidth);
            line.setAttribute('stroke-linecap', 'round');
            svg.appendChild(line);

            // Centre hub
            const hub = document.createElementNS(ns, 'circle');
            hub.setAttribute('cx', cx);
            hub.setAttribute('cy', cy);
            hub.setAttribute('r', nWidth + 2);
            hub.setAttribute('fill', color);
            svg.appendChild(hub);
        }
    }

    // Wrap in a positioned div for alignment
    const el = document.createElement('div');
    el.className = 'lvgl-meter';
    this.applyCommonStyles(el, cfg);
    el.appendChild(svg);
    return el;
}
