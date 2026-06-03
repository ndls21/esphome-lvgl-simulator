function _sprintfImpl(fmt, args) {
    if (typeof fmt !== 'string') return String(fmt ?? '');
    let i = 0;
    return fmt.replace(/%(-?0?\d*\.?\d*)?(l{0,2}[diufseoxX%])/g, (_, spec, type) => {
        const baseType = type.replace(/^l+/, ''); // strip l/ll prefix
        if (baseType === '%') return '%';
        const val = args[i++];
        const width = parseInt(spec) || 0;
        const prec = spec && spec.includes('.') ? parseInt(spec.split('.')[1]) : undefined;
        const padCh = spec && spec.startsWith('0') ? '0' : ' ';
        switch (baseType) {
            case 'd': case 'i': { const n = String(Math.trunc(Number(val) || 0)); return width ? n.padStart(Math.abs(width), padCh) : n; }
            case 'u': { const n = String(Math.abs(Math.trunc(Number(val) || 0))); return width ? n.padStart(Math.abs(width), padCh) : n; }
            case 'f': return (Number(val) || 0).toFixed(prec ?? 6);
            case 's': return String(val ?? '');
            case 'x': return (Number(val) >>> 0).toString(16).toLowerCase().padStart(width, '0');
            case 'X': return (Number(val) >>> 0).toString(16).toUpperCase().padStart(width, '0');
            case 'o': return (Number(val) >>> 0).toString(8);
            default: return '';
        }
    });
}
const _constrainImpl = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const _mapImpl = (v, il, ih, ol, oh) => ol + (v - il) * (oh - ol) / (ih - il);

export class LambdaEvaluator {
    constructor(store, proxy = null, histProxy = null, histArrays = {}, statics = null) {
        this.store = store;
        this._proxy = proxy;
        this._histProxy = histProxy;
        this._histArrays = histArrays;
        this._statics = statics || new Map();
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
            const arrayNames = Object.keys(this._histArrays || {});
            const cacheKey = body;
            if (!this._cache.has(cacheKey)) {
                // eslint-disable-next-line no-new-func
                this._cache.set(cacheKey, new Function(
                    '__store__', '_sprintf', '_constrain', '_map', '__lvgl__', '__hist__',
                    'history_ready', 'millis', 'NAN', 'INFINITY', 'M_PI',
                    'fridge_dmm', 'van_dmm', 'outside_dmm', 'battery_dmm',
                    '__statics__',
                    ...arrayNames,
                    translated
                ));
            }
            const arrayVals = arrayNames.map(n => this._histArrays[n]);
            const result = this._cache.get(cacheKey)(
                this.store,
                (fmt, ...a) => _sprintfImpl(fmt, a),
                _constrainImpl,
                _mapImpl,
                this._proxy || {},
                this._histProxy || { get: () => ({ ordered_value: () => NaN }) },
                true,
                () => Date.now(),
                NaN,
                Infinity,
                Math.PI,
                typeof fridge_dmm !== 'undefined' ? fridge_dmm : null,
                typeof van_dmm !== 'undefined' ? van_dmm : null,
                typeof outside_dmm !== 'undefined' ? outside_dmm : null,
                typeof battery_dmm !== 'undefined' ? battery_dmm : null,
                this._statics,
                ...arrayVals
            );
            return result ?? fallback;
        } catch (e) {
            return fallback;
        }
    }

    _translate(body) {
        let js = body.trim();

        // Detect multi-statement BEFORE LVGL translations — stripping side-effect calls
        // (ESP_LOG, Serial.println) can reduce the statement count and fool the check.
        const origLineTermSemis = (js.match(/;\s*$/gm) || []).length;
        const isMultiStatement = /;[^'"\n]*\S/.test(js) ||
            origLineTermSemis >= 2 ||
            /\b(for|while|if|switch)\s*\(/.test(js) ||
            /\belse\b/.test(js);

        // Translate LVGL C API calls first (before stripping return/semicolons)
        js = this._translateLVGLCalls(js);

        if (!isMultiStatement) {
            js = js.replace(/^return\s+/, '').replace(/;+$/, '').trim();
        }

        // Global writes must come before read translations to avoid reads consuming id(x) first
        js = this._translateGlobalWrites(js);

        js = this._translateTypeDeclarations(js);

        js = this._translateIdHasState(js);
        js = this._translateIdState(js);
        js = this._translateIdGlobal(js);
        js = this._translateStrings(js);
        js = this._translateArith(js);

        if (this._isUntranslatable(js)) return null;

        // Inject C stdlib helpers for any remaining untranslated functions
        const helpers = [];
        if (/\bstrcmp\s*\(/.test(js))
            helpers.push("const strcmp=(a,b)=>{const sa=String(a??''),sb=String(b??'');return sa<sb?-1:sa>sb?1:0;};");
        if (/\bstrtol\s*\(/.test(js))
            helpers.push('const strtol=(s,_,b)=>parseInt(String(s??\'\'),(b||10));');
        const preamble = helpers.join('');

        if (isMultiStatement) {
            return preamble + js;
        }
        return preamble + `return (${js});`;
    }

    _translateLVGLCalls(body) {
        let b = body;
        const id = String.raw`id\((\w+)\)`;

        // Preprocessor directives — strip to comments (keep both branches; branch bodies are no-ops in sim)
        b = b.replace(/#if\s+[^\n]*/g, '/* #if */');
        b = b.replace(/#else\b[^\n]*/g, '/* #else */');
        b = b.replace(/#endif\b[^\n]*/g, '/* #endif */');

        // C++ static_cast<T>(expr) → (expr)
        b = b.replace(/\bstatic_cast\s*<[^>]+>\s*\(/g, '(');

        // C-style string array initializers: {"a","b","c"} → ["a","b","c"]
        // Only converts braces containing string literals (safe — doesn't affect code blocks)
        b = b.replace(/\{\s*("[^"]*"(?:\s*,\s*"[^"]*")*)\s*\}/g, (_, items) => `[${items}]`);

        // strcpy(dst, src) → dst = src  (C string copy; src preserved)
        b = b.replace(/\bstrcpy\s*\(\s*(\w+)\s*,\s*((?:[^()]+|\([^()]*\))*)\)/g, '$1 = $2');

        // No-ops first (so they don't partially match other patterns)
        b = b.replace(/lv_refr_now\s*\([^)]*\)\s*;?/g, '/* lv_refr_now */');
        b = b.replace(/lv_indev_wait_release\s*\([^)]*\)\s*;?/g, '/* lv_indev_wait_release */');
        b = b.replace(/lv_disp_trig_activity\s*\([^)]*\)\s*;?/g, '__lvgl__.triggerActivity();');
        b = b.replace(/lv_indev_get_act\s*\(\s*\)/g, 'null');
        b = b.replace(/lv_indev_get_next\s*\([^)]*\)/g, 'null');
        b = b.replace(/lv_indev_set_scroll_limit\s*\([^)]*\)\s*;?/g, '/* lv_indev_set_scroll_limit */');
        b = b.replace(/lv_obj_set_scroll_dir\s*\([^)]*\)\s*;?/g, '/* lv_obj_set_scroll_dir */');
        b = b.replace(/lv_obj_clear_flag\s*\([^,)]+,\s*LV_OBJ_FLAG_SCROLL_\w+\s*\)\s*;?/g, '/* lv_obj_clear_flag scroll */');
        b = b.replace(/lv_obj_set_style_pad_\w+\s*\([^)]*LV_PART_SCROLLBAR[^)]*\)\s*;?/g, '/* scrollbar pad */');

        // LVGL getters — read DOM widget state via proxy
        b = b.replace(new RegExp(`lv_arc_get_value\\s*\\(\\s*${id}\\s*\\)`, 'g'),
            (_, wid) => `__lvgl__.arcGetValue('${wid}')`);
        b = b.replace(new RegExp(`lv_slider_get_value\\s*\\(\\s*${id}\\s*\\)`, 'g'),
            (_, wid) => `__lvgl__.sliderGetValue('${wid}')`);
        b = b.replace(new RegExp(`lv_label_get_text\\s*\\(\\s*${id}\\s*\\)`, 'g'),
            (_, wid) => `__lvgl__.labelGetText('${wid}')`);
        // Arc range getters — return 0/100 stubs; handle nested parens like id(arc_id)
        b = b.replace(/lv_arc_get_min_value\s*\((?:[^()]*|\([^()]*\))*\)/g, '0');
        b = b.replace(/lv_arc_get_max_value\s*\((?:[^()]*|\([^()]*\))*\)/g, '100');

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

        // Arc — optional cast prefix handles (int)x, (uint8_t)x, etc.
        b = b.replace(new RegExp(`lv_arc_set_value\\s*\\(\\s*${id}\\s*,\\s*(?:\\([^)]{1,20}\\)\\s*)?([^)]+)\\)`, 'g'),
            (_, wid, val) => `__lvgl__.setArcValue('${wid}', ${val.trim()})`);

        // Bar — lv_bar_set_value(id, val, anim) — third arg ignored in sim
        // (?:[^)]{1,20}\)\s*)? handles C casts like (int) or (uint8_t) before the value
        b = b.replace(new RegExp(`lv_bar_set_value\\s*\\(\\s*${id}\\s*,\\s*(?:\\([^)]{1,20}\\)\\s*)?([^,)]+)[^)]*\\)`, 'g'),
            (_, wid, val) => `__lvgl__.setBarValue('${wid}', ${val.trim()})`);

        // Slider — lv_slider_set_value(id, val, anim) — third arg ignored in sim
        b = b.replace(new RegExp(`lv_slider_set_value\\s*\\(\\s*${id}\\s*,\\s*(?:\\([^)]{1,20}\\)\\s*)?([^,)]+)[^)]*\\)`, 'g'),
            (_, wid, val) => `__lvgl__.setSliderValue('${wid}', ${val.trim()})`);


        // Page index property: id(page_id)->index → store lookup .index
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*->\s*index\b/g,
            (_, pageId) => `(__store__.get('${pageId}') || {}).index`);

        // id(comp)->get_current_page() → __lvgl__.getCurrentPage()
        b = b.replace(/id\(\w+\)\s*->\s*get_current_page\s*\(\s*\)/g,
            '__lvgl__.getCurrentPage()');

        // Page navigation: id(lvgl_comp)->show_page(id(PAGE), anim, duration)
        b = b.replace(/id\(\w+\)\s*->\s*show_page\s*\(\s*id\((\w+)\)[^)]*\)/g,
            (_, pageId) => `__lvgl__.showPage('${pageId}')`);

        // nullptr/NULL comparisons — must come BEFORE nullptr→null substitution in _translateStrings
        // id(x) == nullptr  →  !__store__.get('x')
        // id(x) != nullptr  →  !!__store__.get('x')
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*==\s*(?:nullptr|NULL)\b/g,
            (_, id) => `!__store__.get('${id}')`);
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*!=\s*(?:nullptr|NULL)\b/g,
            (_, id) => `!!__store__.get('${id}')`);
        b = b.replace(/\b(?:nullptr|NULL)\s*==\s*id\s*\(\s*(\w+)\s*\)/g,
            (_, id) => `!__store__.get('${id}')`);
        b = b.replace(/\b(?:nullptr|NULL)\s*!=\s*id\s*\(\s*(\w+)\s*\)/g,
            (_, id) => `!!__store__.get('${id}')`);

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
        // No || 0 fallback — null must remain null so nullptr checks work correctly
        b = b.replace(/\bid\((\w+(?:_chart|_hist)\w*)\)/g,
            (_, id) => `__store__.get('${id}')`);

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

        // id(sensor).publish_state(val) → __store__.set('sensor', val)
        // store.set triggers on_value subscriptions via subscribe mechanism
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*\.\s*publish_state\s*\(\s*([^)]+)\)/g,
            (_, sensorId, val) => `__store__.set('${sensorId}', ${val.trim()})`);

        // ESPHome component namespace access → mock values
        b = b.replace(/\bwifi\s*::\s*global_wifi_component\s*->\s*is_connected\s*\(\s*\)/g,
            "__store__.get('wifi_connected') || false");
        b = b.replace(/\bapi\s*::\s*global_api_server\s*->\s*is_connected\s*\(\s*\)/g,
            "__store__.get('api_connected') || false");
        b = b.replace(/\bapi\s*::\s*global_api_server\s*->\s*get_client_count\s*\(\s*\)/g, '0');

        // General namespace:: stripping — remove any remaining namespace::identifier patterns
        // This must run before _isUntranslatable() which rejects :: as untranslatable
        b = b.replace(/\b\w+\s*::\s*(\w+)/g, '$1');

        // C++11 lambda syntax: auto funcname = [...](params) { body }
        // Replace entire signature with a variadic JS arrow function to prevent SyntaxError
        b = b.replace(/\bauto\s+(\w+)\s*=\s*\[[^\]]*\]\s*\([^)]*\)\s*(?:->\s*\w+\s*)?\{/g,
            (_, name) => `let ${name} = (..._args) => {`);

        // POSIX/lwIP network API stubs — always fail gracefully in simulator
        b = b.replace(/\blwip_getaddrinfo\s*\([^)]*\)/g, '(-1)');
        b = b.replace(/\blwip_freeaddrinfo\s*\([^)]*\)\s*;?/g, '/* lwip_freeaddrinfo */');
        b = b.replace(/\blwip_socket\s*\([^)]*\)/g, '(-1)');
        b = b.replace(/\blwip_connect\s*\([^)]*\)/g, '(-1)');
        b = b.replace(/\blwip_close\s*\([^)]*\)\s*;?/g, '/* lwip_close */');
        b = b.replace(/\blwip_\w+\s*\([^)]*\)\s*;?/g, '(-1)');
        b = b.replace(/\bAF_INET\b/g, '2');
        b = b.replace(/\bSOCK_STREAM\b/g, '1');
        b = b.replace(/\bIPPROTO_TCP\b/g, '6');

        // struct declarations → stripped (not executable in simulator)
        b = b.replace(/\bstruct\s+(\w+)\s+(\w+)\b/g, 'let $2');

        // lv_obj_get_child(id(parent), idx) → __lvgl__.getChild('parent', idx)
        b = b.replace(/lv_obj_get_child\s*\(\s*id\s*\(\s*(\w+)\s*\)\s*,\s*([^)]+)\)/g,
            (_, parentId, idx) => `__lvgl__.getChild('${parentId}', ${idx.trim()})`);

        // lv_obj_get_child_cnt(id(parent)) → __lvgl__.getChildCount('parent')
        b = b.replace(/lv_obj_get_child_cnt\s*\(\s*id\s*\(\s*(\w+)\s*\)\s*\)/g,
            (_, parentId) => `__lvgl__.getChildCount('${parentId}')`);

        // LVGL pointer variable assignment: auto w = id(widget) or lv_obj_t* w = id(widget)
        // → let w = 'widget' so the variable holds the string ID for proxy lookup.
        // The negative lookahead prevents matching id(x).state, id(x)(), or id(x)->method (sensor/method reads).
        // This must run before anyWidget translations and before _translateIdGlobal.
        b = b.replace(/(?:auto|lv_\w+_t\s*\*)\s*(\w+)\s*=\s*id\s*\(\s*(\w+)\s*\)(?!\s*[.(]|->)\s*;?/g,
            (_, varname, widgetId) => `let ${varname} = '${widgetId}';`);

        // Generic variable-form translations (vars holding widget IDs, e.g. panels[0], child, etc.)
        // These run AFTER id(x) translations so they only catch what's left.
        // anyWidget matches: varname, arr[i], func(), chained like arr[i].foo
        const anyWidget = `([\\w]+(?:\\[[^\\]]+\\])?)`;

        // lv_obj_set_style_text_color with variable
        b = b.replace(new RegExp(`lv_obj_set_style_text_color\\s*\\(\\s*${anyWidget}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
            (_, varOrId, color) => `__lvgl__.setTextColor(${varOrId}, ${color})`);
        // lv_obj_set_style_bg_color with variable
        b = b.replace(new RegExp(`lv_obj_set_style_bg_color\\s*\\(\\s*${anyWidget}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
            (_, varOrId, color) => `__lvgl__.setBgColor(${varOrId}, ${color})`);

        // lv_obj_add_flag / lv_obj_clear_flag with variable
        b = b.replace(new RegExp(`lv_obj_add_flag\\s*\\(\\s*${anyWidget}\\s*,\\s*LV_OBJ_FLAG_HIDDEN\\s*\\)`, 'g'),
            (_, v) => `__lvgl__.hide(${v})`);
        b = b.replace(new RegExp(`lv_obj_clear_flag\\s*\\(\\s*${anyWidget}\\s*,\\s*LV_OBJ_FLAG_HIDDEN\\s*\\)`, 'g'),
            (_, v) => `__lvgl__.show(${v})`);

        // lv_obj_align with variable
        b = b.replace(new RegExp(`lv_obj_align\\s*\\(\\s*${anyWidget}\\s*,\\s*LV_ALIGN_(\\w+)\\s*,\\s*([^,]+),\\s*([^)]+)\\)`, 'g'),
            (_, widget, align, dx, dy) => `__lvgl__.align(${widget}, '${align}', ${dx.trim()}, ${dy.trim()})`);

        // lv_obj_set_size with variable
        b = b.replace(new RegExp(`lv_obj_set_size\\s*\\(\\s*${anyWidget}\\s*,\\s*([^,]+),\\s*([^)]+)\\)`, 'g'),
            (_, widget, w, h) => `__lvgl__.setSize(${widget}, ${w.trim()}, ${h.trim()})`);

        // lv_obj_set_width / lv_obj_set_height with variable
        b = b.replace(new RegExp(`lv_obj_set_width\\s*\\(\\s*${anyWidget}\\s*,\\s*([^)]+)\\)`, 'g'),
            (_, widget, w) => `__lvgl__.setWidth(${widget}, ${w.trim()})`);
        b = b.replace(new RegExp(`lv_obj_set_height\\s*\\(\\s*${anyWidget}\\s*,\\s*([^)]+)\\)`, 'g'),
            (_, widget, h) => `__lvgl__.setHeight(${widget}, ${h.trim()})`);

        // lv_label_set_text with variable
        b = b.replace(new RegExp(`lv_label_set_text\\s*\\(\\s*${anyWidget}\\s*,\\s*`, 'g'),
            (_, widget) => `__lvgl__.setText(${widget}, `);

        // RTTTL audio
        b = b.replace(/id\(\w*rtttl\w*\)\s*->\s*play\s*\(([^)]+)\)/g,
          (_, song) => `__lvgl__.playRTTTL(${song.trim()})`);
        b = b.replace(/id\(\w*rtttl\w*\)\s*->\s*stop\s*\(\s*\)/g,
          '__lvgl__.stopRTTTL()');

        // Strip remaining component method calls (prevent ReferenceError)
        b = b.replace(/id\(\w+\)\s*->\s*\w+\s*\([^)]*\)\s*;?/g, '/* component call */');

        // snprintf(buf, size, fmt, args...) → buf = _sprintf(fmt, args...)
        b = b.replace(/\bsnprintf\s*\(\s*(\w+)\s*,\s*[^,]+,\s*((?:[^()]+|\([^()]*\))*)\)/g,
          (_, buf, rest) => {
            // rest = fmt, args...
            return `${buf} = _sprintf(${rest.trim()})`;
          });

        // sizeof(x) → 0 (no-op, used only as snprintf size arg which we strip)
        b = b.replace(/\bsizeof\s*\([^)]+\)/g, '0');

        // lv_disp_get_inactive_time(NULL) → __lvgl__.getInactiveTime()
        b = b.replace(/lv_disp_get_inactive_time\s*\([^)]*\)/g, '__lvgl__.getInactiveTime()');

        // gpio_get_level(pin) → __lvgl__.getGPIO(pin)
        b = b.replace(/\bgpio_get_level\s*\(\s*([^)]+)\s*\)/g,
          (_, pin) => {
            const num = pin.replace(/GPIO_NUM_/g, '').trim();
            return `__lvgl__.getGPIO(${num})`;
          });

        // gpio_set_level(pin, val) → __lvgl__.setGPIO(pin, val)
        b = b.replace(/\bgpio_set_level\s*\(\s*([^,]+),\s*([^)]+)\)/g,
          (_, pin, val) => {
            const num = pin.replace(/GPIO_NUM_/g, '').trim();
            return `__lvgl__.setGPIO(${num}, ${val.trim()})`;
          });

        // GPIO constants: GPIO_NUM_11 → 11
        b = b.replace(/\bGPIO_NUM_(\d+)\b/g, (_, n) => n);

        // pinMode, digitalWrite, digitalRead — Arduino-style GPIO
        b = b.replace(/\bdigitalRead\s*\([^)]+\)/g, '0');
        b = b.replace(/\bdigitalWrite\s*\([^)]*\)\s*;?/g, '/* digitalWrite */');

        // esp_timer_get_time() → Date.now() * 1000 (microseconds)
        b = b.replace(/\besp_timer_get_time\s*\(\s*\)/g, '(Date.now() * 1000)');

        // hist_record_all(buffer_array, value, timestamp) → push value into all 4 resolution buffers
        b = b.replace(/\bhist_record_all\s*\(\s*(\w+)\s*,\s*([^,]+),\s*([^)]+)\)/g,
            (_, bufName, val, _ts) => {
                const v = val.trim();
                return `(()=>{ for(let _r=0;_r<4;_r++) { const _b = (typeof ${bufName}!=='undefined' ? ${bufName}[_r] : null); if(_b && _b.push) _b.push(isNaN(${v}) ? NaN : ${v}); } })()`;
            });

        // fridge_dmm.record(value, timestamp, epoch) → update DailyMinMax min/max
        b = b.replace(/\b(\w+_dmm)\s*\.\s*record\s*\(\s*([^,]+),\s*[^,]+,\s*[^)]+\)/g,
            (_, dmmName, val) => `(typeof ${dmmName}!=='undefined' && ${dmmName}.setMinMax ? ${dmmName}.setMinMax(${val.trim()}) : null)`);

        // Border style translations
        b = b.replace(new RegExp(`lv_obj_set_style_border_color\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
            (_, wid, color) => `__lvgl__.setBorderColor('${wid}', ${color.trim()})`);
        b = b.replace(new RegExp(`lv_obj_set_style_border_width\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
            (_, wid, width) => `__lvgl__.setBorderWidth('${wid}', ${width.trim()})`);
        b = b.replace(new RegExp(`lv_obj_set_style_border_opa\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
            (_, wid, opa) => `__lvgl__.setBorderOpacity('${wid}', ${opa.trim()})`);

        // lv_arc_set_range(id(arc), min, max)
        b = b.replace(new RegExp(`lv_arc_set_range\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*([^)]+)\\)`, 'g'),
            (_, wid, min, max) => `__lvgl__.setArcRange('${wid}', ${min.trim()}, ${max.trim()})`);

        // Padding style translations
        b = b.replace(new RegExp(`lv_obj_set_style_pad_all\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
          (_, wid, val) => `__lvgl__.setPadding('${wid}', ${val.trim()})`);
        b = b.replace(new RegExp(`lv_obj_set_style_pad_left\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
          (_, wid, val) => `__lvgl__.setPaddingLeft('${wid}', ${val.trim()})`);
        b = b.replace(new RegExp(`lv_obj_set_style_pad_right\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
          (_, wid, val) => `__lvgl__.setPaddingRight('${wid}', ${val.trim()})`);
        b = b.replace(new RegExp(`lv_obj_set_style_pad_top\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
          (_, wid, val) => `__lvgl__.setPaddingTop('${wid}', ${val.trim()})`);
        b = b.replace(new RegExp(`lv_obj_set_style_pad_bottom\\s*\\(\\s*${id}\\s*,\\s*([^,]+),\\s*\\d+\\s*\\)`, 'g'),
          (_, wid, val) => `__lvgl__.setPaddingBottom('${wid}', ${val.trim()})`);

        // Z-order / layer management — no-op in simulator (DOM order is sufficient)
        b = b.replace(/lv_obj_move_background\s*\([^)]*\)\s*;?/g, '/* lv_obj_move_background */');
        b = b.replace(/lv_obj_move_foreground\s*\([^)]*\)\s*;?/g, '/* lv_obj_move_foreground */');
        b = b.replace(/lv_obj_move_to_index\s*\([^)]*\)\s*;?/g, '/* lv_obj_move_to_index */');
        b = b.replace(/lv_obj_swap\s*\([^)]*\)\s*;?/g, '/* lv_obj_swap */');

        // SD card / filesystem stubs
        b = b.replace(/\bSPIFFS\.begin\s*\([^)]*\)\s*;?/g, '/* SPIFFS.begin */');
        b = b.replace(/\bSD_MMC\.begin\s*\([^)]*\)\s*;?/g, 'true /* SD_MMC.begin */');
        b = b.replace(/\bSDLogging\s*::\s*\w+\s*\([^)]*\)\s*;?/g, '/* SDLogging */');
        b = b.replace(/\bSDLogging\s*::\s*\w+\b/g, 'null');

        // Strip remaining unhandled lv_* function *calls* (standalone statements only)
        b = b.replace(/(^|\n)([ \t]*)(lv_\w+\s*\([^)]*\)\s*;)/g,
            (_, nl, indent, call) => `${nl}${indent}/* unhandled: ${call} */`);

        // id(*_time).now() → __lvgl__.getSNTPTime() (mock ESPTime from system clock)
        b = b.replace(/\bid\s*\(\s*\w*_time\w*\s*\)\s*\.\s*now\s*\(\s*\)/g, '__lvgl__.getSNTPTime()');

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
        b = b.replace(/\bid\s*\(\s*(\w+)\s*\)\s*=(?![=])\s*([^;\n]+)/g,
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
        // NOTE: bare id(x) in boolean context correctly treats 0 as falsy,
        // matching C++ boolean semantics. Use id(x).state for numeric sensor reads.
        return js.replace(/\bid\s*\(\s*(\w+)\s*\)(?!\s*[.(])/g, "__store__.get('$1')");
    }

    _translateStrings(js) {
        // NULL / nullptr → null
        js = js.replace(/\bNULL\b/g, 'null');
        js = js.replace(/\bnullptr\b/g, 'null');

        // C++ type casts: (uint32_t)expr, (int)x, (float)x etc → strip
        js = js.replace(/\((?:u?int(?:8|16|32|64)_t|size_t|int|long|short|unsigned|float|double|bool|char)\)\s*/g, '');

        // std:: math functions → Math.*
        js = js.replace(/\bstd::isnan\s*\(/g, 'isNaN(');
        js = js.replace(/\bstd::isinf\s*\(/g, '!isFinite(');
        js = js.replace(/\bstd::abs\s*\(/g, 'Math.abs(');
        js = js.replace(/\bstd::ceil\s*\(/g, 'Math.ceil(');
        js = js.replace(/\bstd::floor\s*\(/g, 'Math.floor(');
        js = js.replace(/\bstd::round\s*\(/g, 'Math.round(');
        js = js.replace(/\bstd::sqrt\s*\(/g, 'Math.sqrt(');
        js = js.replace(/\bstd::pow\s*\(/g, 'Math.pow(');
        js = js.replace(/\bstd::log\s*\(/g, 'Math.log(');
        // Bare C math functions (no std:: prefix) — also catches std:: names after the
        // generic namespace::name stripper in _translateLVGLCalls reduces std::round to round, etc.
        js = js.replace(/(?<!Math\.)\bround\s*\(/g, 'Math.round(');
        js = js.replace(/(?<!Math\.)\bceil\s*\(/g, 'Math.ceil(');
        js = js.replace(/(?<!Math\.)\bfloor\s*\(/g, 'Math.floor(');
        js = js.replace(/(?<!Math\.)\bpow\s*\(/g, 'Math.pow(');
        js = js.replace(/(?<!Math\.)\blog\s*\(/g, 'Math.log(');
        js = js.replace(/(?<!Math\.)\bsin\s*\(/g, 'Math.sin(');
        js = js.replace(/(?<!Math\.)\bcos\s*\(/g, 'Math.cos(');
        js = js.replace(/(?<!Math\.)\btan\s*\(/g, 'Math.tan(');
        js = js.replace(/(?<!Math\.)\babs\s*\(/g, 'Math.abs(');
        js = js.replace(/(?<!Math\.)\bsqrt\s*\(/g, 'Math.sqrt(');
        js = js.replace(/(?<!Math\.)\bfabs\s*\(/g, 'Math.abs(');
        js = js.replace(/(?<!Math\.)\bfmod\s*\(/g, '((a,b)=>a%b)(');

        // std::max/min (stripped to bare max/min by generic :: stripper)
        js = js.replace(/(?<!Math\.)\bmax\s*\(/g, 'Math.max(');
        js = js.replace(/(?<!Math\.)\bmin\s*\(/g, 'Math.min(');

        // std::isnan/isinf (stripped to isnan/isinf by generic :: stripper)
        js = js.replace(/\bisnan\s*\(/g, 'isNaN(');
        js = js.replace(/\bisinf\s*\(/g, '((v)=>!Number.isFinite(v))(');

        // std::string("lit") / std::string(expr) — bare form after :: stripping
        js = js.replace(/\bstring\s*\(\s*("[^"]*")\s*\)/g, '$1');
        js = js.replace(/\bstring\s*\(/g, 'String(');

        // lroundf / lround / llroundf → Math.round
        js = js.replace(/\bll?round(?:f|l)?\s*\(/g, 'Math.round(');

        // atof → parseFloat
        js = js.replace(/\batof\s*\(/g, 'parseFloat(');

        // clamp(v, lo, hi) → _constrain(v, lo, hi)
        js = js.replace(/\bclamp\s*\(/g, '_constrain(');

        // C float math functions (f-suffixed variants) → Math.*
        js = js.replace(/\bsinf\s*\(/g, 'Math.sin(');
        js = js.replace(/\bcosf\s*\(/g, 'Math.cos(');
        js = js.replace(/\btanf\s*\(/g, 'Math.tan(');
        js = js.replace(/\bfabsf\s*\(/g, 'Math.abs(');
        js = js.replace(/\bsqrtf\s*\(/g, 'Math.sqrt(');
        js = js.replace(/\bpowf\s*\(/g, 'Math.pow(');
        js = js.replace(/\blogf\s*\(/g, 'Math.log(');
        js = js.replace(/\bfmodf\s*\(/g, '((a,b)=>a%b)(');
        // Float literal suffixes: 3.14f → 3.14, 30.0f → 30.0
        js = js.replace(/(\b\d+\.\d*|\b\d*\.\d+)f\b/g, '$1');
        // Integer float literals: 1f → 1  (skip when preceded by '.' to avoid corrupting %.2f format specs)
        js = js.replace(/(?<!\.)\b(\d+)f\b/g, '$1');

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

        // std::string .length() / .size() → .length property; .empty() → length check
        js = js.replace(/\.length\s*\(\s*\)/g, '.length');
        js = js.replace(/\.size\s*\(\s*\)/g, '.length');
        js = js.replace(/\.empty\s*\(\s*\)/g, '.length === 0');

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

        // Strip constexpr — treated as const in simulator
        b = b.replace(/\bstatic\s+constexpr\s+/g, '');
        b = b.replace(/\bconstexpr\s+/g, '');

        // C++ static local variables → store-backed persistent state via __statics__ Map.
        // Pre-pass: split multi-variable static declarations into separate statements.
        // e.g. static uint32_t prev_idle = 0, tap_ms = 0  →  static uint32_t prev_idle = 0\nstatic uint32_t tap_ms = 0
        b = b.replace(
            /\bstatic\s+(?:const\s+)?(?:unsigned\s+)?(\w+)\s+((?:\w+\s*=\s*[^,;\n]+,\s*)+\w+\s*=\s*[^;,\n]+)/g,
            (_, type, vars) => vars.split(',').map(v => `static ${type} ${v.trim()}`).join(';\n')
        );

        // Main pass: static TYPE varname = initVal
        // → if (!__statics__.has('varname')) __statics__.set('varname', initVal); let varname = __statics__.get('varname')
        // Collect static variable names so we can add write-back lines below.
        const staticNames = new Set();
        b = b.replace(
            /\bstatic\s+(?:const\s+)?(?:unsigned\s+)?(?:\w+)\s+(\w+)\s*=\s*([^,;\n]+)/g,
            (_, name, init) => {
                staticNames.add(name);
                return `if (!__statics__.has('${name}')) __statics__.set('${name}', ${init.trim()}); let ${name} = __statics__.get('${name}')`;
            }
        );

        // Write-back pass: after any assignment to a static var, sync back to __statics__
        // so mutations persist across invocations.  We skip lines that already contain
        // __statics__ (the init lines produced above) to avoid double-appending.
        if (staticNames.size > 0) {
            const lines = b.split('\n');
            b = lines.map(line => {
                if (line.includes('__statics__')) return line;
                let l = line;
                for (const name of staticNames) {
                    // Compound assignments: name += / name -= / name *= / name /=
                    l = l.replace(
                        new RegExp(`\\b${name}\\b\\s*[+\\-*/]?=(?!=)\\s*[^;]+`, 'g'),
                        match => `${match}; __statics__.set('${name}', ${name})`
                    );
                    // Post-increment / post-decrement: name++ / name--
                    l = l.replace(new RegExp(`\\b${name}\\b\\s*\\+\\+`, 'g'),
                        `${name}++; __statics__.set('${name}', ${name})`);
                    l = l.replace(new RegExp(`\\b${name}\\b\\s*--`, 'g'),
                        `${name}--; __statics__.set('${name}', ${name})`);
                }
                return l;
            }).join('\n');
        }

        // Deduplicate consecutive __statics__.set calls for the same key on the same line
        // (can occur when a static var appears multiple times in a compound expression)
        b = b.replace(/(; __statics__\.set\('(\w+)', \w+\))\s*; __statics__\.set\('\2', \w+\)/g, '$1');

        // Typed variable declarations with optional initialiser
        const typeKeywords = '(?:const\\s+)?(?:unsigned\\s+)?(?:' + [
            'int','float','double','bool','char','auto','void',
            'uint8_t','uint16_t','uint32_t','uint64_t',
            'int8_t','int16_t','int32_t','int64_t',
            'size_t','lv_coord_t','lv_color_t','lv_opa_t',
            'ESPTime',
            'string'  // catches std::string after generic :: stripper reduces it
        ].join('|') + ')';

        // Simple declaration: type varname = ...  or  type varname;
        b = b.replace(new RegExp(`\\b${typeKeywords}\\s+(\\w+)\\s*(?==|;)`, 'g'),
            (_, varname) => `let ${varname}`);

        // Pointer declarations: lv_obj_t *varname  or  lv_chart_series_t *varname
        b = b.replace(/\blv_\w+_t\s*\*\s*(\w+)/g, 'let $1');

        // const char* / char* pointer variable (but not char buf[] which is handled below)
        // \b after (\w+) anchors to full word boundary, preventing prefix-match backtracking
        b = b.replace(/\b(?:static\s+)?const\s+char\s*\*\s*(\w+)\b(?!\s*\[)/g, 'let $1');
        b = b.replace(/\bchar\s*\*\s*(\w+)\b(?!\s*\[)/g, 'let $1');

        // const char* name[] = [...] array declaration
        b = b.replace(/\b(?:static\s+)?const\s+char\s*\*\s*(\w+)\s*\[\s*\]\s*=/g, 'let $1 =');

        // char buf[N] → let buf = '' (string, not array — used with snprintf)
        b = b.replace(/\bchar\s+(\w+)\s*\[\d*\]\s*(?==|;)/g, "let $1 = ''");

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
            const arrayNames = Object.keys(this._histArrays || {});
            const arrayVals = arrayNames.map(n => this._histArrays[n]);
            // eslint-disable-next-line no-new-func
            const fn = new Function(
                '__store__', '_sprintf', '_constrain', '_map', '__lvgl__', '__hist__', 'history_ready', 'millis',
                'NAN', 'INFINITY', 'M_PI',
                'fridge_dmm', 'van_dmm', 'outside_dmm', 'battery_dmm',
                '__statics__',
                ...arrayNames,
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
                typeof fridge_dmm !== 'undefined' ? fridge_dmm : null,
                typeof van_dmm !== 'undefined' ? van_dmm : null,
                typeof outside_dmm !== 'undefined' ? outside_dmm : null,
                typeof battery_dmm !== 'undefined' ? battery_dmm : null,
                this._statics,
                ...arrayVals,
                xValue, xValue
            );
        } catch (e) {
            console.warn('[lambda] on_value evaluation error:', e.message);
        }
    }

    _isUntranslatable(js) {
        // Genuinely untranslatable C++ constructs.
        // Note: nullptr/NULL, for/while/switch/case/break/else-if are now handled earlier.
        if (/\b(goto|typedef)\b/.test(js)) return true;
        if (/\b(class|namespace|template|virtual)\s+\w/.test(js)) return true;
        if (/#(?:include|define)\b/.test(js)) return true;
        // Remaining std:: after translation pass (e.g. std::vector, std::map)
        if (/\bstd::/.test(js)) return true;
        // new / delete operators
        if (/\bnew\s+\w|\bdelete\s+/.test(js)) return true;
        // Note: :: scope resolution is now stripped in _translateLVGLCalls, so no check here.
        return false;
    }
}
