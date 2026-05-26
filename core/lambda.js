const _SPRINTF_HELPER = `
const _sprintf = (fmt, ...args) => {
  if (typeof fmt !== 'string') return String(fmt ?? '');
  let i = 0;
  return fmt.replace(/%(-?0?\\d*\\.?\\d*)?([difsoxX%])/g, (_, spec, type) => {
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
};
`;

export class LambdaEvaluator {
    constructor(store) {
        this.store = store;
        this._cache = new Map();
    }

    evaluate(value, fallback = null) {
        if (typeof value !== 'string') return value ?? fallback;
        if (value === '__lambda__') return fallback;
        if (!value.startsWith('__lambda__:')) return value;
        const body = decodeURIComponent(escape(atob(value.slice(11))));
        return this._evaluateBody(body, fallback);
    }

    _evaluateBody(body, fallback) {
        const translated = this._translate(body);
        if (translated === null) return fallback;
        try {
            if (!this._cache.has(body)) {
                // eslint-disable-next-line no-new-func
                this._cache.set(body, new Function('__store__', _SPRINTF_HELPER + translated));
            }
            const result = this._cache.get(body)(this.store);
            return result ?? fallback;
        } catch (e) {
            return fallback;
        }
    }

    _translate(body) {
        let js = body.trim();
        js = js.replace(/^return\s+/, '').replace(/;+$/, '').trim();

        // Global writes (id(x) = val) are read-only in the simulator — untranslatable
        if (/\bid\s*\(\s*\w+\s*\)\s*=[^=]/.test(js)) return null;

        js = this._translateIdHasState(js);
        js = this._translateIdState(js);
        js = this._translateIdGlobal(js);
        js = this._translateStrings(js);

        if (this._isUntranslatable(js)) return null;
        return `return (${js});`;
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

    _isUntranslatable(js) {
        return /\b(auto\s|const\s|std::|new\s|delete\s|nullptr|->(?!>)|::)\b/.test(js);
    }
}
