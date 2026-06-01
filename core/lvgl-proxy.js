export function buildLVGLProxy(elements, navigateFn) {
  function getEl(id) {
    const el = elements[id];
    if (!el) { console.warn(`[lvgl] element not found: ${id}`); return null; }
    return el;
  }

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
      const pw = parent.offsetWidth || parseInt(parent.style.width) || 0;
      const ph = parent.offsetHeight || parseInt(parent.style.height) || 0;
      const ew = el.offsetWidth || parseInt(el.style.width) || 0;
      const eh = el.offsetHeight || parseInt(el.style.height) || 0;
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
      el.style.position = 'absolute';
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    },

    // Sizing
    setSize(id, w, h)   { const el = getEl(id); if (el) { el.style.width = w+'px'; el.style.height = h+'px'; } },
    setWidth(id, w)     { const el = getEl(id); if (el) el.style.width = w+'px'; },
    setHeight(id, h)    { const el = getEl(id); if (el) el.style.height = h+'px'; },
    setPos(id, x, y)    { const el = getEl(id); if (el) { el.style.position='absolute'; el.style.left=x+'px'; el.style.top=y+'px'; } },

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

    // No-ops (must exist to avoid ReferenceError)
    noop() {},
  };
}
