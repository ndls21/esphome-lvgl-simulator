/**
 * Parse LVGL recolor markup (#RRGGBB text#) into HTML spans.
 * Malformed or unclosed markup is returned as plain text (no crash).
 * @param {string} text
 * @returns {string} HTML string safe to assign to innerHTML
 */
function applyRecolor(text) {
    const RECOLOR_RE = /#([0-9A-Fa-f]{6})\s([^#]*)#/g;
    // If no markup found, return escaped plain text
    if (!RECOLOR_RE.test(text)) {
        return escapeHtml(text);
    }
    // Reset lastIndex after test()
    RECOLOR_RE.lastIndex = 0;
    let result = '';
    let lastIndex = 0;
    let match;
    while ((match = RECOLOR_RE.exec(text)) !== null) {
        // Append any plain text before this match (escaped)
        if (match.index > lastIndex) {
            result += escapeHtml(text.slice(lastIndex, match.index));
        }
        const color = match[1].toUpperCase();
        const content = match[2];
        result += `<span style="color:#${color}">${escapeHtml(content)}</span>`;
        lastIndex = RECOLOR_RE.lastIndex;
    }
    // Append any remaining plain text after the last match
    if (lastIndex < text.length) {
        result += escapeHtml(text.slice(lastIndex));
    }
    return result;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

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
        } else if (typeof raw === 'object') {
            if (raw.time_format) {
                el.textContent = this._formatTime(raw.time_format);
            } else if (raw.format) {
                el.textContent = this._evalFormatArgs(raw.format, raw.args || []);
            } else {
                el.textContent = '[format?]';
            }
        } else {
            const text = String(raw);
            if (cfg.recolor === true) {
                el.innerHTML = applyRecolor(text);
            } else {
                el.textContent = text;
            }
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

    const longMode = String(cfg.long_mode || 'WRAP').toUpperCase();
    if (longMode === 'DOT' || longMode === 'DOTS') {
        el.style.overflow = 'hidden';
        el.style.textOverflow = 'ellipsis';
        el.style.whiteSpace = 'nowrap';
    } else if (longMode === 'CLIP') {
        el.style.overflow = 'hidden';
        el.style.whiteSpace = 'nowrap';
        el.style.textOverflow = '';
    } else if (longMode === 'SCROLL') {
        el.style.overflow = 'hidden';
        el.style.whiteSpace = 'nowrap';
        el.style.animation = 'lvgl-scroll 4s linear infinite';
    } else {
        // WRAP (default) — allow text to wrap
        el.style.whiteSpace = 'normal';
        el.style.overflow = 'visible';
        el.style.textOverflow = '';
    }

    return el;
}
