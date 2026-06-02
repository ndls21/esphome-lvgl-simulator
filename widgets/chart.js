export function renderChart(config, parent) {
    const cfg = this.resolveStyles ? this.resolveStyles(config) : config;
    const width  = cfg.width  || 460;
    const height = cfg.height || 310;
    const type   = (cfg.type || 'LINE').toUpperCase();
    const pointCount = cfg.point_count || 200;

    const container = document.createElement('div');
    container.className = 'lvgl-chart';
    container.style.cssText = `position:relative;width:${width}px;height:${height}px;background:#111111;border:1px solid #333333;box-sizing:border-box;overflow:hidden;`;

    if (cfg.id) container.dataset.id = cfg.id;

    // Common positioning via applyCommonStyles if available
    if (typeof this.applyCommonStyles === 'function') {
        this.applyCommonStyles(container, cfg);
    } else {
        const ox = cfg.x ?? 0;
        const oy = cfg.y ?? 0;
        container.style.position = 'absolute';
        container.style.left = ox + 'px';
        container.style.top  = oy + 'px';
    }

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    canvas.width  = width;
    canvas.height = height;
    container.appendChild(canvas);

    // Init chart state
    container._chartSeries = [];
    container._chartConfig = {
        type,
        pointCount,
        rangeMin:    cfg.range_min    ?? 0,
        rangeMax:    cfg.range_max    ?? 100,
        rangeMinY2:  cfg.range_min_y2 ?? 0,
        rangeMaxY2:  cfg.range_max_y2 ?? 100,
    };
    container._chartCanvas = canvas;

    // Pre-populate series from YAML if given
    if (Array.isArray(cfg.series)) {
        cfg.series.forEach((s, i) => {
            const colorVal = typeof s.color === 'string'
                ? s.color
                : `#${(s.color || 0x2288FF).toString(16).padStart(6, '0')}`;
            container._chartSeries.push({
                color: colorVal,
                name:  s.name || `series${i}`,
                axis:  s.axis === 'secondary' || s.axis === 1 ? 1 : 0,
                data:  [],
            });
        });
    }

    // Draw initial placeholder
    _drawChartCanvas(container);

    return container;
}

export function drawChart(el) {
    _drawChartCanvas(el);
}

const LV_CHART_POINT_NONE = -32768;

function _drawChartCanvas(container) {
    const canvas = container._chartCanvas;
    if (!canvas) return;
    const cfg    = container._chartConfig || {};
    const series = container._chartSeries || [];

    const w = canvas.width  || container.offsetWidth  || 460;
    const h = canvas.height || container.offsetHeight || 310;
    canvas.width  = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, w, h);

    const pad = { left: 38, right: 38, top: 8, bottom: 22 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top  - pad.bottom;

    // Grid lines
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    const hLines = 4, vLines = 5;
    for (let i = 0; i <= hLines; i++) {
        const y = pad.top + ch * i / hLines;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    }
    for (let i = 0; i <= vLines; i++) {
        const x = pad.left + cw * i / vLines;
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ch); ctx.stroke();
    }

    // Axis border lines
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, cw, ch);

    // Y-axis labels (primary — left)
    const pMin = cfg.rangeMin ?? 0;
    const pMax = cfg.rangeMax ?? 100;
    ctx.fillStyle = '#888888';
    ctx.font = '10px monospace';
    for (let i = 0; i <= hLines; i++) {
        const val = pMax - (pMax - pMin) * i / hLines;
        const y   = pad.top + ch * i / hLines;
        ctx.textAlign = 'right';
        ctx.fillText(val.toFixed(0), pad.left - 4, y + 3);
    }

    // Y-axis labels (secondary — right), only if any series uses axis 1
    const hasSecondary = series.some(s => s.axis === 1);
    if (hasSecondary) {
        const sMin = cfg.rangeMinY2 ?? 0;
        const sMax = cfg.rangeMaxY2 ?? 100;
        for (let i = 0; i <= hLines; i++) {
            const val = sMax - (sMax - sMin) * i / hLines;
            const y   = pad.top + ch * i / hLines;
            ctx.textAlign = 'left';
            ctx.fillText(val.toFixed(0), pad.left + cw + 4, y + 3);
        }
    }

    // Draw each series
    const n = cfg.pointCount || 200;
    series.forEach(s => {
        if (!s.data || !s.data.length) return;
        const axMin = s.axis === 1 ? (cfg.rangeMinY2 ?? 0)   : pMin;
        const axMax = s.axis === 1 ? (cfg.rangeMaxY2 ?? 100) : pMax;
        const range = axMax - axMin || 1;

        ctx.strokeStyle = s.color || '#2288FF';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        let penDown = false;
        for (let i = 0; i < s.data.length; i++) {
            const val = s.data[i];
            if (val === LV_CHART_POINT_NONE) { penDown = false; continue; }
            const x = pad.left + cw * i / (n - 1 || 1);
            const y = pad.top  + ch - ch * (val - axMin) / range;
            if (!penDown) { ctx.moveTo(x, y); penDown = true; }
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });
}
