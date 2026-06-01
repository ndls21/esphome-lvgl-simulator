export function renderImg(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-img';

    // Default size to 40×40 if not specified (common icon size)
    if (cfg.width === undefined) el.style.width = '40px';
    if (cfg.height === undefined) el.style.height = '40px';

    this.applyCommonStyles(el, cfg);

    const src = cfg.src !== undefined ? String(cfg.src) : '';

    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
        // Renderable source: use actual <img> tag
        const img = document.createElement('img');
        img.src = src;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.onerror = () => {
            img.style.display = 'none';
            el.appendChild(_imgPlaceholder(src));
        };
        el.appendChild(img);
    } else {
        // Firmware image reference — render placeholder
        el.appendChild(_imgPlaceholder(src));
    }

    return el;
}

function _imgPlaceholder(src) {
    const ph = document.createElement('div');
    ph.className = 'lvgl-img__placeholder';
    const icon = document.createElement('span');
    icon.className = 'lvgl-img__icon';
    icon.textContent = '\u{1F5BC}';
    const label = document.createElement('span');
    label.className = 'lvgl-img__src';
    label.textContent = src || '(no src)';
    ph.appendChild(icon);
    ph.appendChild(label);
    return ph;
}
