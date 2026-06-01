function _sprintfImpl(fmt, args) {
    if (typeof fmt !== 'string') return String(fmt ?? '');
    let i = 0;
    return fmt.replace(/%(-?0?\d*\.?\d*)?([difsoxX%])/g, (_, spec, type) => {
        if (type === '%') return '%';
        const val = args[i++];
        const width = parseInt(spec) || 0;
        const prec = spec && spec.includes('.') ? parseInt(spec.split('.')[1]) : undefined;
        const padCh = spec && spec.startsWith('0') ? '0' : ' ';
        switch (type) {
            case 'd': case 'i': { const n = String(Math.round(Number(val) || 0)); return width ? n.padStart(Math.abs(width), padCh) : n; }
            case 'f': return (Number(val) || 0).toFixed(prec ?? 6);
            case 's': return String(val ?? '');
            case 'x': return (Number(val) || 0).toString(16).toLowerCase().padStart(width, '0');
            case 'X': return (Number(val) || 0).toString(16).toUpperCase().padStart(width, '0');
            case 'o': return (Number(val) || 0).toString(8);
            default: return '';
        }
    });
}
const _constrainImpl = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const _mapImpl = (v, il, ih, ol, oh) => ol + (v - il) * (oh - ol) / (ih - il);

export class LambdaEvaluator {
    constructor(store, proxy = null) {
        this.store = store;
        this._proxy = proxy;
        this._cache = new Map();
    }

    evaluate(value, fallback = null) {
        if (typeof value !== 'string') return value ?? fallback;
        if (value === '__lambda__') return fallback;
        if (!value.startsWith('__lambda__:')) return value;
        const body = decodeURIComponent(escape(atob(value.slice(11))));
        return this._evaluateBody(body, fallback);
    }

    sprintf(fmt, ...args) {
        return _sprintfImpl(fmt, args);
    }

    isLambda(value) {
        return typeof value === 'string' && (value === '__lambda__' || value.startsWith('__lambda__:'));
    }

    getRawBody(value) {
        if (typeof value !== 'string') return null;
        if (value === '__lambda__') return null;
        if (!value.startsWith('__lambda__:')) return null;
        return decodeURIComponent(escape(atob(value.slice(11))));
    }

    isTranslatable(value) {
        if (!this.isLambda(value)) return false;
        const body = this.getRawBody(value);
        if (body === null) return false;
        return this._translate(body) !== null;
    }

    _evaluateBody(body, fallback) {
        const translated = this._translate(body);
        if (translated === null) return fallback;
        try {
            if (!this._cache.has(body)) {
                // eslint-disable-next-line no-new-func
                this._cache.set(body, new Function('__store__', '_sprintf', '_constrain', '_map', '__lvgl__', translated));
            }
            const result = this._cache.get(body)(this.store,
                (fmt, ...a) => _sprintfImpl(fmt, a),
                _constrainImpl,
                _mapImpl,
                this._proxy || {});
            return result ?? fallback;
        } catch (e) {
            return fallback;
        }
    }

    _translate(body) {
        let js = body.trim();

        // Translate LVGL C API calls first (before stripping return/semicolons)
        js = this._translateLVGLCalls(js);

        js = js.replace(/^return\s+/, '').replace(/;+$/, '').trim();

        // Global writes (id(x) = val) are read-only in the simulator — untranslatable
        if (/\bid\s*\(\s*\w+\s*\)\s*=[^=]/.test(js)) return null;

        js = this._translateIdHasState(js);
        js = this._translateIdState(js);
        js = this._translateIdGlobal(js);
        js = this._translateStrings(js);
        js = this._translateArith(js);

        if (this._isUntranslatable(js)) return null;
        return `return (${js});`;
    }

    _translateLVGLCalls(body) {
        let b = body;
        const id = String.raw`id\((\w+)\)`;

        // No-ops first (so they don't partially match other patterns)
        b = b.replace(/lv_refr_now\s*\([^)]*\)\s*;?/g, '/* lv_refr_now */');
        b = b.replace(/lv_indev_wait_release\s*\([^)]*\)\s*;?/g, '/* lv_indev_wait_release */');
        b = b.replace(/lv_disp_trig_activity\s*\([^)]*\)\s*;?/g, '/* lv_disp_trig_activity */');
        b = b.replace(/lv_indev_get_act\s*\(\s*\)/g, 'null');

        // Visibility
        b = b.replace(new RegExp(`lv_obj_add_flag\\s*\\(\\s*${id}\\s*,\\s*LV_OBJ_FLAG_HIDDEN\\s*\\)`, 'g'),
            (_, wid) => `__lvgl__.hide('${wid}')`);
        b = b.replace(new RegExp(`lv_obj_clear_flag\\s*\\(\\s*${id}\\s*,\\s*LV_OBJ_FLAG_HIDDEN\\s*\\)`, 'g'),
            (_, wid) => `__lvgl__.show('${wid}')`);

        // Text
        b = b.replace(new RegExp(`lv_label_set_text_static\\s*\\(\\s*${id}\\s*,\\s*`, 'g'),
            (_, wid) => `__lvgl__.setText('${wid}', `);
        b = b.replace(new RegExp(`lv_label_set_text\\s*\\(\\s*${id}\\s*,\\s*`, 'g'),
            (_, wid) => `__lvgl__.setText('${wid}', `);

        // lv_color_hex(0xRRGGBB) → '#rrggbb'
        b = b.replace(/lv_color_hex\s*\(\s*(0x[0-9A-Fa-f]+)\s*\)/g,
            (_, hex) => `'#${parseInt(hex, 16).toString(16).padStart(6, '0')}'`);

        // Colors
        b = b.replace(new RegExp(`lv_obj_set_style_text_color\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
            (_, wid, color) => `__lvgl__.setTextColor('${wid}', ${color})`);
        b = b.replace(new RegExp(`lv_obj_set_style_bg_color\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
            (_, wid, color) => `__lvgl__.setBgColor('${wid}', ${color})`);

        // Sizing
        b = b.replace(new RegExp(`lv_obj_set_size\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*([^)]+)\\)`, 'g'),
            (_, wid, w, h) => `__lvgl__.setSize('${wid}', ${w}, ${h})`);
        b = b.replace(new RegExp(`lv_obj_set_width\\s*\\(\\s*${id}\\s*,\\s*([^)]+)\\)`, 'g'),
            (_, wid, w) => `__lvgl__.setWidth('${wid}', ${w})`);
        b = b.replace(new RegExp(`lv_obj_set_height\\s*\\(\\s*${id}\\s*,\\s*([^)]+)\\)`, 'g'),
            (_, wid, h) => `__lvgl__.setHeight('${wid}', ${h})`);
        b = b.replace(new RegExp(`lv_obj_set_pos\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*([^)]+)\\)`, 'g'),
            (_, wid, x, y) => `__lvgl__.setPos('${wid}', ${x}, ${y})`);

        // Align — LV_ALIGN_* constant extraction
        const alignConst = `LV_ALIGN_(\\w+)`;
        b = b.replace(new RegExp(`lv_obj_align\\s*\\(\\s*${id}\\s*,\\s*${alignConst}\\s*,\\s*([^,]+),\\s*([^)]+)\\)`, 'g'),
            (_, wid, align, dx, dy) => `__lvgl__.align('${wid}', '${align}', ${dx}, ${dy})`);

        // Arc
        b = b.replace(new RegExp(`lv_arc_set_value\\s*\\(\\s*${id}\\s*,\\s*([^)]+)\\)`, 'g'),
            (_, wid, val) => `__lvgl__.setArcValue('${wid}', ${val})`);

        // Page navigation: id(lvgl_comp)->show_page(id(PAGE), anim, duration)
        b = b.replace(/id\(\w+\)\s*->\s*show_page\s*\(\s*id\((\w+)\)[^)]*\)/g,
            (_, pageId) => `__lvgl__.showPage('${pageId}')`);

        // Strip remaining component method calls (prevent ReferenceError)
        b = b.replace(/id\(\w+\)\s*->\s*\w+\s*\([^)]*\)\s*;?/g, '/* component call */');

        // Strip remaining lv_* calls that we don't handle (prevent ReferenceError)
        b = b.replace(/\blv_\w+\s*\([^;]*\)\s*;?/g, (match) => `/* unhandled: ${match.trim()} */`);

        return b;
    }

    _translateIdHasState(js) {
        return js.replace(/\bid\s*\(\s*(\w+)\s*\)\.has_state\s*\(\s*\)/g, "__store__.has('$1')");
    }

    _translateIdState(js) {
        js = js.replace(/\bid\s*\(\s*(\w+)\s*\)\.state\b/g, "__store__.get('$1')");
        js = js.replace(/\bid\s*\(\s*(\w+)\s*\)\.get_state\s*\(\s*\)/g, "__store__.get('$1')");
        js = js.replace(/\bid\s*\(\s*(\w+)\s*\)\.get_raw_state\s*\(\s*\)/g, "__store__.get('$1')");
        return js;
    }

    _translateIdGlobal(js) {
        // Any remaining id(name) not followed by . or ( — these are global reads
        return js.replace(/\bid\s*\(\s*(\w+)\s*\)(?!\s*[.(])/g, "__store__.get('$1')");
    }

    _translateStrings(js) {
        // sprintf / esphome::str_sprintf → _sprintf
        js = js.replace(/\besphome::str_sprintf\s*\(/g, '_sprintf(');
        js = js.replace(/\bsprintf\s*\(/g, '_sprintf(');

        // std::to_string / to_string → String
        js = js.replace(/\bstd::to_string\s*\(/g, 'String(');
        js = js.replace(/\bto_string\s*\(/g, 'String(');

        // std::string("lit") → "lit"; std::string(x) → String(x)
        js = js.replace(/\bstd::string\s*\(\s*("[^"]*")\s*\)/g, '$1');
        js = js.replace(/\bstd::string\s*\(/g, 'String(');

        // .c_str() — no-op in JS
        js = js.replace(/\.c_str\(\)/g, '');

        // C-style casts: (int)expr → Math.round(expr), (float)/(double) → no-op
        js = js.replace(/\(int\)\s*([^\s;,)]+)/g, 'Math.round($1)');
        js = js.replace(/\(float\)\s*/g, '');
        js = js.replace(/\(double\)\s*/g, '');

        return js;
    }

    _translateArith(js) {
        // C++ type declarations → let declarations
        js = js.replace(/\b(int|float|double|bool|uint8_t|uint16_t|uint32_t|std::string)\s+(\w+)\s*=/g, 'let $2 =');

        // constrain / map → helper functions
        js = js.replace(/\bconstrain\s*\(/g, '_constrain(');
        js = js.replace(/\bmap\s*\(/g, '_map(');

        return js;
    }

    _isUntranslatable(js) {
        return /\b(auto\s|const\s|std::|new\s|delete\s|nullptr|->(?!>)|::)\b/.test(js);
    }
}
