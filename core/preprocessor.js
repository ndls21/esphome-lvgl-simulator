export function preprocessYAML(text) {
    const substitutions = {};
    const subsMatch = text.match(/^substitutions\s*:\s*\n((?:[ \t]+.+\n?)*)/m);
    if (subsMatch) {
        try {
            const subsYaml = 'substitutions:\n' + subsMatch[1];
            const parsed = jsyaml.load(subsYaml);
            Object.assign(substitutions, parsed.substitutions || {});
        } catch (e) {}
    }
    Object.keys(substitutions).forEach(key => {
        text = text.split('${' + key + '}').join(String(substitutions[key]));
    });

    const lines = text.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Handle !secret
        line = line.replace(/!secret\s+(\S+)/g, '"__secret_$1__"');

        // Detect start of block lambda (!lambda |  or  !lambda |-)
        const blockLambdaMatch = line.match(/^(\s*\S.*?:\s*)!lambda\s+\|-?\s*$/);
        if (blockLambdaMatch) {
            const bodyLines = [];
            const baseIndent = line.match(/^(\s*)/)[1].length;
            let j = i + 1;
            while (j < lines.length) {
                const bl = lines[j];
                const blIndent = bl.match(/^(\s*)/)[1].length;
                if (bl.trim() === '' || blIndent > baseIndent) {
                    if (bl.trim()) bodyLines.push(bl.trim());
                    j++;
                } else {
                    break;
                }
            }
            i = j - 1; // skip consumed lines (the for loop will do i++ so we end at j)
            const body = bodyLines.join(' ');
            const encoded = body ? btoa(unescape(encodeURIComponent(body))) : '';
            result.push(blockLambdaMatch[1] + (encoded ? `"__lambda__:${encoded}"` : '"__lambda__"'));
            continue;
        }

        // Handle inline lambda (quoted or unquoted)
        // Quoted: !lambda "..." or !lambda '...'
        line = line.replace(/!lambda\s+"([^"]*)"/g, (_, body) => `"__lambda__:${btoa(unescape(encodeURIComponent(body)))}"`);
        line = line.replace(/!lambda\s+'([^']*)'/g, (_, body) => `"__lambda__:${btoa(unescape(encodeURIComponent(body)))}"`);
        // Unquoted: !lambda return ...;  (anything to end of line)
        line = line.replace(/!lambda\s+(.+)$/, (_, body) => `"__lambda__:${btoa(unescape(encodeURIComponent(body.trim())))}"`)

        // Handle other ESPHome tags
        line = line.replace(/!extend\s+(\w+)/g, (_, id) => `"__extend__:${id}"`);
        line = line.replace(/!remove\s+\w+/g, '"__remove__"');
        // Capture !include path for later resolution
        line = line.replace(/!include\s+(\S+)/g, (_, path) => `"__include__:${path}"`);
        line = line.replace(/!ENV\s+\S+/g, '"__env__"');

        result.push(line);
    }
    return { text: result.join('\n'), substitutions };
}

/**
 * Async version: resolves !include and packages: directives via fetch.
 * @param {string} yamlText  Raw YAML text
 * @param {string|null} baseUrl  Base URL for resolving relative paths (directory, trailing slash)
 * @returns {Promise<object>} Parsed and merged config object
 */
export async function preprocessAndResolve(yamlText, baseUrl = null, fileMap = {}) {
    // Step 1: text-level preprocessing (substitutions, lambda encoding, tag rewriting)
    const { text: preprocessed, substitutions } = preprocessYAML(yamlText);

    // Step 2: resolve __include__ placeholders in text
    const textWithIncludes = await _resolveTextIncludes(preprocessed, baseUrl, new Set(), fileMap);

    // Step 3: parse YAML
    let config;
    try {
        config = jsyaml.load(textWithIncludes);
    } catch (e) {
        throw e;
    }
    if (!config || typeof config !== 'object') return config;

    // Step 4: resolve packages:
    const warnings = [];
    if (config.packages) {
        config = await _resolvePackages(config, baseUrl, warnings, new Set(), fileMap);
    }

    // Step 5: apply !extend and !remove
    _applyExtendRemove(config);

    config.__packageWarnings = warnings;
    return config;
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function _fetchYaml(url, fileMap = {}) {
    // Check fileMap first (ZIP/folder-loaded files)
    if (fileMap && url) {
        const keys = Object.keys(fileMap);
        const urlPath = url.replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '');
        const match = keys.find(k => k === urlPath || k === url || url.endsWith('/' + k) || url.endsWith(k));
        if (match) return fileMap[match];
    }
    // Fall back to network fetch
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            console.warn('Could not fetch package: ' + url + ' (status ' + resp.status + ')');
            return null;
        }
        return await resp.text();
    } catch (e) {
        console.warn('Could not fetch package: ' + url + ' (' + e.message + ')');
        return null;
    }
}

function _resolveUrl(baseUrl, relativePath) {
    if (!baseUrl) return null;
    // If already absolute
    if (/^https?:\/\//i.test(relativePath)) return relativePath;
    try {
        return new URL(relativePath, baseUrl).href;
    } catch (e) {
        return null;
    }
}

async function _resolveTextIncludes(text, baseUrl, visited = new Set(), fileMap = {}) {
    // Replace "__include__:path" strings inline
    // We do a line-by-line pass so we can handle indentation
    const lines = text.split('\n');
    const output = [];
    for (const line of lines) {
        const m = line.match(/^(\s*)((?:[^"]*:\s*)?)\"__include__:(.+?)\"\s*$/);
        if (!m) { output.push(line); continue; }
        const [, indent, keyPart, inclPath] = m;

        if (!baseUrl) {
            output.push(indent + (keyPart || '') + `# [include: ${inclPath} - no base URL to resolve]`);
            continue;
        }

        const url = _resolveUrl(baseUrl, inclPath);
        if (!url) { output.push(line); continue; }

        // Guard against circular includes
        if (visited.has(url)) { output.push(line); continue; }
        visited.add(url);

        const fetched = await _fetchYaml(url, fileMap);
        if (!fetched) { output.push(line); continue; }

        // Recurse into fetched content
        const newBase = new URL('.', url).href;
        const { text: preprocessedFetched } = preprocessYAML(fetched);
        const resolvedFetched = await _resolveTextIncludes(preprocessedFetched, newBase, visited, fileMap);

        const innerLines = resolvedFetched.split('\n');
        const nonEmpty = innerLines.filter(l => l.trim().length > 0);
        const minInd = nonEmpty.length > 0
            ? Math.min(...nonEmpty.map(l => l.match(/^( *)/)[1].length))
            : 0;

        if (keyPart.trim()) {
            output.push(indent + keyPart.trimEnd());
            const extra = indent + '  ';
            innerLines.forEach(l => output.push(l.trim() ? extra + l.slice(minInd) : ''));
        } else {
            innerLines.forEach(l => output.push(l.trim() ? indent + l.slice(minInd) : ''));
        }
    }
    return output.join('\n');
}

async function _resolvePackages(config, baseUrl, warnings, visited = new Set(), fileMap = {}) {
    const packages = config.packages;
    const merged = Object.assign({}, config);
    delete merged.packages;

    for (const [name, entry] of Object.entries(packages)) {
        let url = null;

        if (typeof entry === 'string') {
            // e.g.  globals: __include__:packages/globals.yaml  (already rewritten by preprocessYAML)
            const m = entry.match(/^__include__:(.+)$/);
            if (m) {
                url = _resolveUrl(baseUrl, m[1]);
                if (!url && baseUrl === null) {
                    warnings.push(`Package "${name}" (${m[1]}) could not be loaded — no base URL.`);
                }
            } else if (/^https?:\/\//i.test(entry)) {
                url = entry;
            }
        } else if (entry && typeof entry === 'object') {
            if (entry.url) {
                url = entry.url;
            } else if (entry.file) {
                url = _resolveUrl(baseUrl, entry.file);
            }
        }

        if (!url) continue;

        // Guard against circular package includes
        if (visited.has(url)) {
            warnings.push(`Package "${name}" skipped — circular include detected for ${url}.`);
            continue;
        }
        visited.add(url);

        const text = await _fetchYaml(url, fileMap);
        if (!text) {
            warnings.push(`Package "${name}" could not be fetched from ${url}.`);
            continue;
        }

        const newBase = new URL('.', url).href;
        let pkgConfig;
        try {
            const { text: pre } = preprocessYAML(text);
            const withInc = await _resolveTextIncludes(pre, newBase, new Set(visited), fileMap);
            pkgConfig = jsyaml.load(withInc);
        } catch (e) {
            warnings.push(`Package "${name}" failed to parse: ${e.message}`);
            continue;
        }

        if (pkgConfig && typeof pkgConfig === 'object') {
            _deepMergeInto(merged, pkgConfig);
        }
    }

    return merged;
}

function _deepMergeInto(target, source) {
    for (const [key, val] of Object.entries(source)) {
        if (Array.isArray(val) && Array.isArray(target[key])) {
            const merged = target[key].concat(val);
            // Deduplicate items that have an 'id' field
            const seen = new Set();
            target[key] = merged.filter(item => {
                if (item && typeof item === 'object' && item.id !== undefined) {
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                }
                return true;
            });
        } else if (val && typeof val === 'object' && !Array.isArray(val)
                   && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
            _deepMergeInto(target[key], val);
        } else {
            target[key] = val;
        }
    }
}

function _applyExtendRemove(config) {
    // Walk all arrays in config, apply __extend__ and __remove__ markers
    _walkExtendRemove(config);
}

function _walkExtendRemove(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (Array.isArray(val)) {
            // Remove items marked __remove__
            const filtered = val.filter(item => {
                if (item === '__remove__' || (item && item.__remove__)) return false;
                return true;
            });
            // Apply __extend__: find target item and merge
            const out = [];
            for (const item of filtered) {
                if (item && typeof item === 'object') {
                    const extendKey = Object.keys(item).find(k =>
                        typeof item[k] === 'string' && item[k].startsWith('__extend__:')
                    );
                    if (extendKey) {
                        const targetId = item[extendKey].replace('__extend__:', '');
                        const target = out.find(o => o && o.id === targetId);
                        if (target) {
                            const patch = Object.assign({}, item);
                            delete patch[extendKey];
                            Object.assign(target, patch);
                            console.warn(`[preprocessor] Applied !extend to id="${targetId}"`);
                        } else {
                            console.warn(`[preprocessor] !extend target id="${targetId}" not found — skipping`);
                        }
                        continue;
                    }
                    _walkExtendRemove(item);
                }
                out.push(item);
            }
            obj[key] = out;
        } else if (val && typeof val === 'object') {
            _walkExtendRemove(val);
        }
    }
}
