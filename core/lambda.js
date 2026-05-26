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
                this._cache.set(body, new Function('__store__', translated));
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

    _isUntranslatable(js) {
        return /\b(auto\s|const\s|std::|new\s|delete\s|nullptr|->(?!>)|::)\b/.test(js);
    }
}
