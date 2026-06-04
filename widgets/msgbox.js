export function renderMsgbox(config, parent) {
    const cfg = this.resolveStyles(config);
    const el = document.createElement('div');
    el.className = 'lvgl-msgbox';
    this.applyCommonStyles(el, cfg);

    const card = document.createElement('div');
    card.className = 'lvgl-msgbox__card';

    if (cfg.close_button) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'lvgl-msgbox__close';
        closeBtn.textContent = '×';
        card.appendChild(closeBtn);
    }

    if (cfg.title) {
        const title = document.createElement('h3');
        title.className = 'lvgl-msgbox__title';
        title.textContent = String(cfg.title);
        card.appendChild(title);
    }

    if (cfg.body) {
        const body = document.createElement('p');
        body.className = 'lvgl-msgbox__body';
        body.textContent = String(cfg.body);
        card.appendChild(body);
    }

    const buttons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
    if (buttons.length > 0) {
        const btnRow = document.createElement('div');
        btnRow.className = 'lvgl-msgbox__buttons';
        buttons.forEach(label => {
            const btn = document.createElement('button');
            btn.className = 'lvgl-msgbox__btn';
            btn.textContent = String(label);
            btnRow.appendChild(btn);
        });
        card.appendChild(btnRow);
    }

    el.appendChild(card);
    return el;
}
