export function renderSwitch(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-switch';
    this.applyCommonStyles(el, cfg);

    // Resolve checked state — 'checked' can be boolean OR a style sub-block
    const isChecked = typeof cfg.checked === 'boolean' ? cfg.checked : false;
    const isLambda = cfg.checked !== undefined && String(cfg.checked).includes('__lambda__');
    const checkedStyle = (typeof cfg.checked === 'object' && cfg.checked !== null && !Array.isArray(cfg.checked))
        ? cfg.checked : {};

    // Apply checked-state bg_color override when checked
    if (isChecked && checkedStyle.bg_color) {
        el.style.backgroundColor = this.parseColor(checkedStyle.bg_color);
    }

    if (isChecked && !isLambda) {
        el.classList.add('lvgl-switch--on');
    }

    // Set knob size from switch height for correct proportions
    const switchHeight = typeof cfg.height === 'number' ? cfg.height : 26;
    const knobSize = Math.max(4, switchHeight - 6);
    el.style.setProperty('--switch-h', switchHeight + 'px');

    // Build knob element
    const knob = document.createElement('div');
    knob.className = 'lvgl-switch__knob';
    knob.style.width = knobSize + 'px';
    knob.style.height = knobSize + 'px';

    // Apply knob part styles (cfg.knob is the knob sub-block from YAML)
    const k = cfg.knob || {};
    if (k.bg_color) knob.style.backgroundColor = this.parseColor(k.bg_color);
    const kr = k.radius ?? 255;
    knob.style.borderRadius = kr >= 100 ? '50%' : kr + 'px';

    el.appendChild(knob);
    return el;
}
