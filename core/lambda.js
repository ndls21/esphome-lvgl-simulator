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
    constructor(store, proxy = null, histProxy = null) {
        this.store = store;
        this._proxy = proxy;
        this._histProxy = histProxy;
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
                this._cache.set(body, new Function('__store__', '_sprintf', '_constrain', '_map', '__lvgl__', '__hist__', 'history_ready', 'millis', 'NAN', 'INFINITY', 'M_PI', translated));
            }
            const result = this._cache.get(body)(this.store,
                (fmt, ...a) => _sprintfImpl(fmt, a),
                _constrainImpl,
                _mapImpl,
                this._proxy || {},
                this._histProxy || { get: () => ({ ordered_value: () => NaN }) },
                true,
                () => Date.now(),
                NaN,
                Infinity,
                Math.PI);
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

        // Global writes must come before read translations to avoid reads consuming id(x) first
        js = this._translateGlobalWrites(js);

        js = this._translateTypeDeclarations(js);

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
        b = b.replace(/lv_disp_trig_activity\s*\([^)]*\)\s*;?/g, '__lvgl__.triggerActivity();');
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

        // Chart API — must come BEFORE the catch-all lv_* stripper

        // LV_CHART_POINT_NONE / type constants
        b = b.replace(/\bLV_CHART_POINT_NONE\b/g, '-32768');
        b = b.replace(/\bLV_CHART_TYPE_LINE\b/g, '0');
        b = b.replace(/\bLV_CHART_TYPE_BAR\b/g,  '1');

        // lv_chart_t *varname = lv_chart_create(parent)
        b = b.replace(/lv_chart_t\s*\*\s*(\w+)\s*=\s*lv_chart_create\s*\(\s*(?:id\((\w+)\)|[^)]*)\s*\)/g,
            (_, varname, parentId) => {
                const store = (varname.includes('_chart') || varname.includes('_hist'))
                    ? `; __store__.set('${varname}', ${varname})`
                    : '';
                return `let ${varname} = __lvgl__.chartCreate('${parentId || ''}')${store}`;
            });

        // lv_chart_set_type
        b = b.replace(/lv_chart_set_type\s*\((\w+)\s*,\s*(\w+)\s*\)/g,
            (_, v, type) => `__lvgl__.chartSetType(${v}, '${type}')`);

        // lv_chart_set_point_count
        b = b.replace(/lv_chart_set_point_count\s*\((\w+)\s*,\s*([^)]+)\)/g,
            (_, v, n) => `__lvgl__.chartSetPointCount(${v}, ${n})`);

        // lv_chart_set_range
        b = b.replace(/lv_chart_set_range\s*\((\w+)\s*,\s*LV_CHART_AXIS_(\w+)\s*,\s*([^,]+),\s*([^)]+)\)/g,
            (_, v, axis, min, max) => `__lvgl__.chartSetRange(${v}, ${axis === 'PRIMARY_Y' ? 0 : 1}, ${min.trim()}, ${max.trim()})`);

        // lv_chart_series_t *varname = lv_chart_add_series(chart, color, axis)
        b = b.replace(/lv_chart_series_t\s*\*\s*(\w+)\s*=\s*lv_chart_add_series\s*\((\w+)\s*,\s*([^,]+),\s*LV_CHART_AXIS_(\w+)\s*\)/g,
            (_, varname, chart, color, axis) =>
                `let ${varname} = __lvgl__.chartAddSeries(${chart}, ${color.trim()}, ${axis === 'PRIMARY_Y' ? 0 : 1})`);

        // lv_chart_remove_series
        b = b.replace(/lv_chart_remove_series\s*\((\w+)\s*,\s*(\w+)\s*\)/g,
            (_, chart, series) => `__lvgl__.chartRemoveSeries(${chart}, ${series})`);

        // lv_chart_get_series_next
        b = b.replace(/lv_chart_get_series_next\s*\((\w+)\s*,\s*(\w+)\s*\)/g,
            (_, chart, series) => `__lvgl__.chartGetSeriesNext(${chart}, ${series})`);

        // lv_chart_set_next_value(chart, series, val)
        b = b.replace(/lv_chart_set_next_value\s*\((\w+)\s*,\s*(\w+)\s*,\s*([^)]+)\)/g,
            (_, _chart, series, val) => `__lvgl__.chartSetNextValue(${series}, ${val.trim()})`);

        // lv_chart_refresh
        b = b.replace(/lv_chart_refresh\s*\((\w+)\s*\)/g,
            (_, v) => `__lvgl__.chartRefresh(${v})`);

        // id(xxx_chart) global reads (chart handles stored in __store__)
        b = b.replace(/\bid\((\w+(?:_chart|_hist)\w*)\)/g,
            (_, id) => `(__store__.get('${id}') || 0)`);

        // Display rotation: id(xxx)->set_rotation(DISPLAY_ROTATION_N_DEGREES)
        b = b.replace(/id\(\w+\)\s*->\s*set_rotation\s*\(\s*[^)]*ROTATION_(\d+)_DEGREES[^)]*\)\s*;?/g,
            (_, deg) => `__lvgl__.setDisplayRotation(${deg})`);

        // Touch mirror/swap — no-ops
        b = b.replace(/id\(\w+\)\s*->\s*set_mirror_x\s*\([^)]*\)\s*;?/g, '/* set_mirror_x */');
        b = b.replace(/id\(\w+\)\s*->\s*set_mirror_y\s*\([^)]*\)\s*;?/g, '/* set_mirror_y */');
        b = b.replace(/id\(\w+\)\s*->\s*set_swap_xy\s*\([^)]*\)\s*;?/g, '/* set_swap_xy */');

        // HistBuffer array access: name[res].ordered_value(i)
        // Translate to: __hist__.get('name', res).ordered_value(i)
        b = b.replace(/(\w+_hist)\[(\w+)\]\.ordered_value\s*\(([^)]+)\)/g,
            (_, name, res, i) => `__hist__.get('${name}', ${res}).ordered_value(${i})`);

        // HistBuffer constants
        b = b.replace(/\bHIST_SLOTS\b/g, '200');
        b = b.replace(/\bHIST_RES_COUNT\b/g, '4');
        b = b.replace(/\bHIST_RES_LABEL\b/g, "['6h','12h','24h','7d']");

        // set_paused — pause/resume LVGL rendering simulation
        b = b.replace(/id\(\w+\)\s*->\s*set_paused\s*\(([^,)]+)[^)]*\)\s*;?/g,
            (_, paused) => `__lvgl__.setPaused(${paused.trim()});`);

        // Display brightness
        b = b.replace(/id\(\w+\)\s*\.\s*set_brightness\s*\(([^)]+)\)/g,
          (_, val) => `__lvgl__.setDisplayBrightness(${val.trim()})`);

        // Strip remaining component method calls (prevent ReferenceError)
        b = b.replace(/id\(\w+\)\s*->\s*\w+\s*\([^)]*\)\s*;?/g, '/* component call */');

        // Strip remaining unhandled lv_* function *calls* (standalone statements only)
        b = b.replace(/(^|\n)([ \t]*)(lv_\w+\s*\([^)]*\)\s*;)/g,
            (_, nl, indent, call) => `${nl}${indent}/* unhandled: ${call} */`);

        // millis() → Date.now()
        b = b.replace(/\bmillis\s*\(\s*\)/g, 'Date.now()');

        // ESP_LOG* → strip entirely (prevent ReferenceError)
        b = b.replace(/\bESP_LOG[IWED]\s*\([^;]*\)\s*;?/g, '/* ESP_LOG */');

        // Serial.print/println → strip
        b = b.replace(/\bSerial\.print(?:ln)?\s*\([^;]*\)\s*;?/g, '/* Serial */');

        return b;
    }

    _translateGlobalWrites(body) {
        let b = body;

        // Compound assignments first (more specific before simple)
        // id(x) += n  →  __store__.set('x', (__store__.get('x')||0) + (n))
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*\+=\s*([^;,\)]+)/g,
            (_, id, val) => `__store__.set('${id}', (__store__.get('${id}')||0) + (${val.trim()}))`);
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*-=\s*([^;,\)]+)/g,
            (_, id, val) => `__store__.set('${id}', (__store__.get('${id}')||0) - (${val.trim()}))`);
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*\*=\s*([^;,\)]+)/g,
            (_, id, val) => `__store__.set('${id}', (__store__.get('${id}')||0) * (${val.trim()}))`);

        // Increment/decrement
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*\+\+/g,
            (_, id) => `__store__.set('${id}', (__store__.get('${id}')||0) + 1)`);
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*--/g,
            (_, id) => `__store__.set('${id}', (__store__.get('${id}')||0) - 1)`);
        b = b.replace(/\+\+\s*id\s*\(\s*(\w+)\s*\)/g,
            (_, id) => `__store__.set('${id}', (__store__.get('${id}')||0) + 1)`);

        // Simple assignment: id(x) = expr  (must not match ==, !=, <=, >=)
        // Use negative lookbehind for !, <, > and lookahead to avoid ==
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*=(?![=])\s*([^;,\n]+)/g,
            (_, id, val) => `__store__.set('${id}', ${val.trim()})`);

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
        // std:: math functions → Math.*
        js = js.replace(/\bstd::abs\s*\(/g, 'Math.abs(');
        js = js.replace(/\bstd::ceil\s*\(/g, 'Math.ceil(');
        js = js.replace(/\bstd::floor\s*\(/g, 'Math.floor(');
        js = js.replace(/\bstd::round\s*\(/g, 'Math.round(');
        js = js.replace(/\bstd::sqrt\s*\(/g, 'Math.sqrt(');
        js = js.replace(/\bstd::pow\s*\(/g, 'Math.pow(');
        js = js.replace(/\bstd::log\s*\(/g, 'Math.log(');
        // Bare C math functions (no std:: prefix)
        js = js.replace(/(?<!Math\.)\babs\s*\(/g, 'Math.abs(');
        js = js.replace(/(?<!Math\.)\bsqrt\s*\(/g, 'Math.sqrt(');
        js = js.replace(/(?<!Math\.)\bfabs\s*\(/g, 'Math.abs(');
        js = js.replace(/(?<!Math\.)\bfmod\s*\(/g, '((a,b)=>a%b)(');

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
        // constrain / map → helper functions
        js = js.replace(/\bconstrain\s*\(/g, '_constrain(');
        js = js.replace(/\bmap\s*\(/g, '_map(');

        return js;
    }

    _translateTypeDeclarations(body) {
        let b = body;

        // Typed variable declarations with optional initialiser
        const typeKeywords = '(?:const\\s+)?(?:unsigned\\s+)?(?:' + [
            'int','float','double','bool','char','auto','void',
            'uint8_t','uint16_t','uint32_t','uint64_t',
            'int8_t','int16_t','int32_t','int64_t',
            'size_t','lv_coord_t','lv_color_t','lv_opa_t'
        ].join('|') + ')';

        // Simple declaration: type varname = ...  or  type varname;
        b = b.replace(new RegExp(`\\b${typeKeywords}\\s+(\\w+)\\s*(?==|;)`, 'g'),
            (_, varname) => `let ${varname}`);

        // Pointer declarations: lv_obj_t *varname  or  lv_chart_series_t *varname
        b = b.replace(/\blv_\w+_t\s*\*\s*(\w+)/g, 'let $1');

        // Array declarations: int arr[N] — convert to let arr = new Array(N)
        b = b.replace(/\blet\s+(\w+)\s*\[(\d+)\]/g, 'let $1 = new Array($2)');

        return b;
    }

    evaluateWithX(lambdaStr, xValue) {
        // Evaluate a lambda in on_value context with 'x' bound to the new sensor value.
        // lambdaStr may be a raw C++ string (from YAML on_value) or a __lambda__: encoded string.
        try {
            let body;
            if (typeof lambdaStr === 'string' && lambdaStr.startsWith('__lambda__:')) {
                body = decodeURIComponent(escape(atob(lambdaStr.slice(11))));
            } else if (typeof lambdaStr === 'string') {
                body = lambdaStr;
            } else {
                return;
            }
            const translated = this._translate(body);
            if (translated === null) return;
            // eslint-disable-next-line no-new-func
            const fn = new Function(
                '__store__', '_sprintf', '_constrain', '_map', '__lvgl__', '__hist__', 'history_ready', 'millis',
                'NAN', 'INFINITY', 'M_PI',
                'x', 'id',
                translated
            );
            fn(
                this.store,
                (fmt, ...a) => _sprintfImpl(fmt, a),
                _constrainImpl,
                _mapImpl,
                this._proxy || {},
                this._histProxy || { get: () => ({ ordered_value: () => NaN }) },
                true,
                () => Date.now(),
                NaN, Infinity, Math.PI,
                xValue, xValue
            );
        } catch (e) {
            console.warn('[lambda] on_value evaluation error:', e.message);
        }
    }

    _isUntranslatable(js) {
        return /\b(const\s|std::|new\s|delete\s|nullptr|->(?!>)|::)\b/.test(js);
    }
}
