export function renderAnimimg(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-animimg';
    this.applyCommonStyles(el, cfg);

    const src = Array.isArray(cfg.src) ? cfg.src : (cfg.src ? [cfg.src] : []);
    const frameCount = src.length || 1;

    // Parse duration: "500ms" → 500, "1s" → 1000, "2m" → 120000
    function parseDuration(val) {
        if (!val) return 500;
        const s = String(val).trim();
        if (s.endsWith('ms')) return parseInt(s, 10) || 500;
        if (s.endsWith('m')) return (parseInt(s, 10) || 1) * 60000;
        if (s.endsWith('s')) return (parseFloat(s) || 1) * 1000;
        return parseInt(s, 10) || 500;
    }
    const totalDurationMs = parseDuration(cfg.duration);
    const frameDurationMs = Math.max(50, Math.round(totalDurationMs / frameCount));

    // Set CSS animation duration to match total cycle time
    el.style.animationDuration = totalDurationMs + 'ms';

    const label = document.createElement('div');
    label.className = 'lvgl-animimg__label';
    label.textContent = `[animimg: ${frameCount} frame${frameCount !== 1 ? 's' : ''}]`;
    el.appendChild(label);

    const badge = document.createElement('div');
    badge.className = 'lvgl-animimg__badge';
    badge.textContent = '0';
    el.appendChild(badge);

    // Frame cycling — respect repeat_count
    const repeatCount = cfg.repeat_count !== undefined ? Number(cfg.repeat_count) : 255;
    const infinite = repeatCount >= 255;
    let frame = 0;
    let cycles = 0;

    const interval = setInterval(() => {
        frame = (frame + 1) % frameCount;
        badge.textContent = String(frame);
        if (frame === 0) {
            cycles++;
            if (!infinite && cycles >= repeatCount) {
                clearInterval(interval);
            }
        }
    }, frameDurationMs);

    // Clear interval on config reload — store on element for cleanup
    el._animimgInterval = interval;

    return el;
}
