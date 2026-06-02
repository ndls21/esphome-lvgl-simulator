const LV_CHART_POINT_NONE_PROXY = -32768;

function _drawChartInternal(c) {
  const canvas = c.canvas;
  const w = canvas.offsetWidth || canvas.width || 460;
  const h = canvas.offsetHeight || canvas.height || 300;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('[lvgl] chart: canvas 2d context unavailable, skipping draw');
    return;
  }

  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, w, h);

  const pad = { left: 38, right: 38, top: 8, bottom: 22 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top  - pad.bottom;

  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + ch * i / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
  }
  for (let i = 0; i <= 5; i++) {
    const x = pad.left + cw * i / 5;
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ch); ctx.stroke();
  }

  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, pad.top, cw, ch);

  const pMin = c.config.primaryMin, pMax = c.config.primaryMax;
  ctx.fillStyle = '#888888';
  ctx.font = '10px monospace';
  for (let i = 0; i <= 4; i++) {
    const val = pMax - (pMax - pMin) * i / 4;
    const y   = pad.top + ch * i / 4;
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(0), pad.left - 4, y + 3);
  }

  const hasSecondary = c.series.some(s => s.axis === 1);
  if (hasSecondary) {
    const sMin = c.config.secondaryMin, sMax = c.config.secondaryMax;
    for (let i = 0; i <= 4; i++) {
      const val = sMax - (sMax - sMin) * i / 4;
      const y   = pad.top + ch * i / 4;
      ctx.textAlign = 'left';
      ctx.fillText(val.toFixed(0), pad.left + cw + 4, y + 3);
    }
  }

  const n = c.config.pointCount || 200;
  c.series.forEach(series => {
    if (!series.data.length) return;
    const axMin = series.axis === 1 ? c.config.secondaryMin : pMin;
    const axMax = series.axis === 1 ? c.config.secondaryMax : pMax;
    const range = axMax - axMin || 1;

    ctx.strokeStyle = series.color;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    let penDown = false;
    for (let i = 0; i < series.data.length; i++) {
      const val = series.data[i];
      if (val === LV_CHART_POINT_NONE_PROXY) { penDown = false; continue; }
      const x = pad.left + cw * i / (n - 1 || 1);
      const y = pad.top  + ch - ch * (val - axMin) / range;
      if (!penDown) { ctx.moveTo(x, y); penDown = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
}

export function buildLVGLProxy(elements, navigateFn, simulator) {
  function getEl(id) {
    if (!id || id === 'null' || id === 'undefined') return null;
    const el = elements[id];
    if (!el) { console.warn(`[lvgl] element not found: ${id}`); return null; }
    return el;
  }

  // Chart state
  const charts = new Map();
  let chartHandleCounter = 1;

  return {
    // Visibility
    hide(id) { const el = getEl(id); if (el) el.style.display = 'none'; },
    show(id) { const el = getEl(id); if (el) el.style.display = ''; },

    // Text
    setText(id, text) {
      const el = getEl(id);
      if (!el) return;
      const textEl = el.querySelector('.lvgl-label-text') || el;
      textEl.textContent = String(text);
    },

    // Colors
    setTextColor(id, hex) { const el = getEl(id); if (el) el.style.color = hex; },
    setBgColor(id, hex) { const el = getEl(id); if (el) el.style.backgroundColor = hex; },

    // Positioning — align relative to parent
    align(id, alignType, dx, dy) {
      const el = getEl(id);
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;
      el.style.position = 'absolute';
      const pr = parent.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const pw = pr.width || parseInt(parent.style.width) || 0;
      const ph = pr.height || parseInt(parent.style.height) || 0;
      const ew = er.width || parseInt(el.style.width) || 0;
      const eh = er.height || parseInt(el.style.height) || 0;
      dx = dx || 0; dy = dy || 0;
      let left, top;
      switch (alignType) {
        case 'CENTER':       left = (pw-ew)/2 + dx; top = (ph-eh)/2 + dy; break;
        case 'TOP_LEFT':     left = dx;              top = dy;             break;
        case 'TOP_MID':      left = (pw-ew)/2 + dx; top = dy;             break;
        case 'TOP_RIGHT':    left = pw-ew + dx;      top = dy;             break;
        case 'LEFT_MID':     left = dx;              top = (ph-eh)/2 + dy; break;
        case 'RIGHT_MID':    left = pw-ew + dx;      top = (ph-eh)/2 + dy; break;
        case 'BOTTOM_LEFT':  left = dx;              top = ph-eh + dy;     break;
        case 'BOTTOM_MID':   left = (pw-ew)/2 + dx; top = ph-eh + dy;     break;
        case 'BOTTOM_RIGHT': left = pw-ew + dx;      top = ph-eh + dy;     break;
        default:             left = dx;              top = dy;
      }
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    },

    // Sizing
    setSize(id, w, h)   { const el = getEl(id); if (el) { el.style.width = w+'px'; el.style.height = h+'px'; } },
    setWidth(id, w)     { const el = getEl(id); if (el) el.style.width = w+'px'; },
    setHeight(id, h)    { const el = getEl(id); if (el) el.style.height = h+'px'; },
    setPos(id, x, y)    { const el = getEl(id); if (el) { el.style.position='absolute'; el.style.left=x+'px'; el.style.top=y+'px'; } },

    // Border styles
    setBorderColor(id, hex) {
      const el = getEl(id); if (!el) return;
      el.style.borderColor = typeof hex === 'string' ? hex : `#${Number(hex).toString(16).padStart(6, '0')}`;
    },
    setBorderWidth(id, w) {
      const el = getEl(id); if (!el) return;
      el.style.borderWidth = (Number(w) || 0) + 'px';
      el.style.borderStyle = 'solid';
    },
    setBorderOpacity(id, opa) {
      const el = getEl(id); if (!el) return;
      // LVGL opa is 0-255; approximate by setting the element's border-color alpha
      // Full solution would need rgba parsing; this is a best-effort for simulator
      el.style.opacity = (Number(opa) / 255).toFixed(2);
    },

    // Arc range
    setArcRange(id, min, max) {
      const el = getEl(id); if (!el) return;
      el.dataset.arcMin = min;
      el.dataset.arcMax = max;
      el.dispatchEvent(new CustomEvent('lvgl-arc-range-update', {
        detail: { min: Number(min), max: Number(max) }
      }));
    },

    // Arc value
    setArcValue(id, val) {
      const el = getEl(id);
      if (!el) return;
      el.dataset.arcValue = val;
      const svg = el.querySelector('svg');
      if (svg) {
        el.dispatchEvent(new CustomEvent('lvgl-arc-update', { detail: { value: val } }));
      }
    },

    // Page navigation
    showPage(pageId) { if (navigateFn) navigateFn(pageId); },

    // Chart API
    chartCreate(parentId) {
      const parent = (parentId ? getEl(parentId) : null)
        || document.querySelector('.lvgl-page-wrapper, .lvgl-display');
      const handle = chartHandleCounter++;
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display:block;width:100%;height:100%;';
      const container = document.createElement('div');
      container.className = 'lvgl-chart';
      container.style.cssText = 'position:absolute;background:#111111;border:1px solid #333333;box-sizing:border-box;overflow:hidden;width:460px;height:310px;';
      container.appendChild(canvas);
      if (parent) parent.appendChild(container);
      const chartObj = {
        el: container,
        canvas,
        series: [],
        config: { type: 'LINE', pointCount: 10, primaryMin: 0, primaryMax: 100, secondaryMin: 0, secondaryMax: 100 },
      };
      charts.set(handle, chartObj);
      // Also size the canvas once appended
      requestAnimationFrame(() => {
        canvas.width  = container.offsetWidth  || 460;
        canvas.height = container.offsetHeight || 310;
        _drawChartInternal(chartObj);
      });
      return handle;
    },

    chartSetType(handle, type) {
      const c = charts.get(handle); if (!c) return;
      c.config.type = (type === 'LV_CHART_TYPE_BAR' || type === 1) ? 'BAR' : 'LINE';
    },

    chartSetPointCount(handle, n) {
      const c = charts.get(handle); if (!c) return;
      c.config.pointCount = n;
    },

    chartSetRange(handle, axis, min, max) {
      const c = charts.get(handle); if (!c) return;
      if (axis === 0) { c.config.primaryMin = min; c.config.primaryMax = max; }
      else            { c.config.secondaryMin = min; c.config.secondaryMax = max; }
    },

    chartAddSeries(handle, color, axis) {
      const c = charts.get(handle); if (!c) return null;
      const seriesHandle = chartHandleCounter++;
      const colorStr = typeof color === 'string'
        ? color
        : `#${(color >>> 0).toString(16).padStart(6, '0')}`;
      const series = { handle: seriesHandle, color: colorStr, axis: axis || 0, data: [] };
      c.series.push(series);
      charts.set(seriesHandle, { isSeries: true, chartHandle: handle, series });
      return seriesHandle;
    },

    chartRemoveSeries(chartHandle, seriesHandle) {
      const c = charts.get(chartHandle); if (!c) return;
      c.series = c.series.filter(s => s.handle !== seriesHandle);
    },

    chartGetSeriesNext(chartHandle, seriesHandle) {
      const c = charts.get(chartHandle); if (!c) return 0;
      if (seriesHandle === 0) return c.series[0]?.handle || 0;
      const idx = c.series.findIndex(s => s.handle === seriesHandle);
      return c.series[idx + 1]?.handle || 0;
    },

    chartSetNextValue(seriesHandle, value) {
      const s = charts.get(seriesHandle);
      if (!s) {
        console.warn(`[lvgl] chartSetNextValue: no entry for handle ${seriesHandle}`);
        return;
      }
      if (!s.isSeries) {
        console.warn(`[lvgl] chartSetNextValue: handle ${seriesHandle} is a chart, not a series`);
        return;
      }
      s.series.data.push(value);
    },

    chartRefresh(handle) {
      const c = charts.get(handle); if (!c) return;
      const canvas = c.canvas;
      canvas.width  = canvas.offsetWidth  || c.el.offsetWidth  || 460;
      canvas.height = canvas.offsetHeight || c.el.offsetHeight || 310;
      _drawChartInternal(c);
    },

    // Display brightness
    setDisplayBrightness(n) {
      if (!simulator) return;
      const display = document.getElementById(simulator._displayElId || 'lvglDisplay');
      if (!display) return;
      const pct = Math.max(0, Math.min(255, Number(n) || 0)) / 255;
      // Keep screensaver filter if active — only override if not in screensaver state
      if (simulator._screensaver && simulator._screensaver._state !== 0) return;
      display.style.filter = pct < 0.005
        ? 'brightness(0)'
        : `brightness(${(0.08 + pct * 0.92).toFixed(3)})`;
    },

    // Display rotation
    setDisplayRotation(deg) {
      if (simulator && simulator.setRotation) simulator.setRotation(deg);
    },

    // Screensaver / inactivity timer
    triggerActivity() {
      if (simulator?._screensaver) simulator._screensaver.triggerActivity();
    },

    getInactiveTime() {
      // Return ms since last pointer/keyboard activity
      // Use the screensaver's _lastActivity if available, otherwise 0
      if (simulator?._screensaver) {
        return Math.round(performance.now() - simulator._screensaver._lastActivity);
      }
      return 0;
    },

    setPaused(paused) {
      if (simulator) simulator.setPaused?.(paused);
    },

    getCurrentPage() {
      // Return the current page index in the simulator
      return simulator?.currentPageIndex ?? 0;
    },

    // Touch mirror/swap — no-ops (coordinate remapping not supported in simulator)
    setMirrorX(v) { /* no-op */ },
    setMirrorY(v) { /* no-op */ },
    setSwapXY(v)  { /* no-op */ },

    // SNTP time mock — returns an ESPTime-like object from the system clock
    getSNTPTime() {
      const now = new Date();
      return {
        is_valid: () => true,
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
        day_of_week: now.getDay() + 1, // 1=Sunday, matches ESPHome
        day_of_month: now.getDate(),
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        timestamp: Math.floor(now.getTime() / 1000),
      };
    },

    // Child element access
    getChild(parentId, index) {
      const parent = getEl(parentId);
      if (!parent) return null;
      // Filter to direct children that are LVGL widget elements (skip text nodes etc.)
      const children = Array.from(parent.children);
      const child = children[index] || null;
      if (child) {
        const syntheticId = `__child_${parentId}_${index}`;
        elements[syntheticId] = child;
        return syntheticId;
      }
      return null;
    },

    getChildCount(parentId) {
      const parent = getEl(parentId);
      if (!parent) return 0;
      return parent.children.length;
    },

    // No-ops (must exist to avoid ReferenceError)
    noop() {},
  };
}
