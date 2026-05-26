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
                const store = this.store;
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
        // Strip leading 'return' keyword — we'll add it back
        js = js.replace(/^return\s+/, '').replace(/;+$/, '').trim();
        // Stub translators — real patterns added in follow-on issues
        js = this._translateIdState(js);
        // Check for untranslatable C++ syntax
        if (this._isUntranslatable(js)) return null;
        return `return (${js});`;
    }

    _translateIdState(js) {
        // id(sensor_id).state  →  __store__.get('sensor_id')
        return js.replace(/\bid\s*\(\s*(\w+)\s*\)\.state\b/g, "__store__.get('$1')");
    }

    _isUntranslatable(js) {
        return /\b(auto\s|const\s|std::|new\s|delete\s|nullptr|->(?!>)|::)\b/.test(js);
    }
}
