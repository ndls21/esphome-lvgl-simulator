export function renderLabel(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-label';
    this.applyCommonStyles(el, cfg);

    const raw = cfg.text;
    if (raw !== undefined && raw !== null) {
        if (this.lambda.isLambda(raw)) {
            const result = this.lambda.evaluate(raw, null);
            if (result !== null) {
                el.textContent = String(result);
            } else {
                const body = this.lambda.getRawBody(raw);
                const indicator = document.createElement('span');
                indicator.className = 'lvgl-lambda-indicator';
                indicator.textContent = '[λ]';
                indicator.title = body ? body.trim() : 'Lambda (body not available)';
                if (body) indicator.dataset.lambda = body.trim();
                el.appendChild(indicator);
            }
        } else {
            el.textContent = String(raw);
        }
    }

    if (cfg.text_color) el.style.color = this.parseColor(cfg.text_color);
    if (cfg.text_font) {
        el.style.fontSize = this.parseFontSize(cfg.text_font);
        el.style.fontFamily = this.parseFontFamily(cfg.text_font);
    }
    if (cfg.text_align) {
        const ta = cfg.text_align.toUpperCase();
        el.style.textAlign = ta === 'CENTER' ? 'center' : ta === 'RIGHT' ? 'right' : 'left';
        el.style.justifyContent = ta === 'CENTER' ? 'center' : ta === 'RIGHT' ? 'flex-end' : 'flex-start';
    }

    return el;
}
