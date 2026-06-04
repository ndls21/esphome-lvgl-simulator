export async function resolveIncludes(text, fileMap, baseDir = '') {
    if (!fileMap || Object.keys(fileMap).length === 0) return text;

    const lines = text.split('\n');
    const output = [];
    let inPackagesSection = false;

    for (const line of lines) {
        // Track packages: section — its !include entries are handled by _resolvePackages, not here
        if (/^packages\s*:/.test(line)) {
            inPackagesSection = true;
        } else if (/^\S/.test(line) && line.trim() && !line.trim().startsWith('#')) {
            inPackagesSection = false;
        }

        // Match: [indent][optional key: ]!include <arg>
        const m = line.match(/^(\s*)((?:[^!].*?:\s*)?)!include\s+(.+?)\s*$/);
        if (!m || inPackagesSection) { output.push(line); continue; }

        const [, indent, keyPart, inclArg] = m;

        let filePath, vars = {};
        if (inclArg.startsWith('{')) {
            // !include { file: x.yaml, vars: { key: val } }
            try {
                const parsed = jsyaml.load(inclArg);
                filePath = parsed.file;
                vars = parsed.vars || {};
            } catch (e) { output.push(line); continue; }
        } else {
            filePath = inclArg;
        }

        const resolvedPath = joinPath(baseDir, filePath);
        const raw = lookupFile(fileMap, resolvedPath) ?? lookupFile(fileMap, filePath);
        if (raw === undefined) { output.push(line); continue; }

        // Apply vars substitution
        let fileText = raw;
        Object.keys(vars).forEach(k => {
            fileText = fileText.split('${' + k + '}').join(String(vars[k]));
        });

        // Recurse
        const nextBase = filePath.includes('/')
            ? joinPath(baseDir, filePath.split('/').slice(0, -1).join('/'))
            : baseDir;
        const resolved = await resolveIncludes(fileText, fileMap, nextBase);

        // Re-indent: strip min indent from included content, re-add call-site indent
        const innerLines = resolved.split('\n');
        const nonEmpty = innerLines.filter(l => l.trim().length > 0);
        const minInd = nonEmpty.length > 0
            ? Math.min(...nonEmpty.map(l => l.match(/^( *)/)[1].length))
            : 0;

        if (keyPart.trim()) {
            // key: !include file  →  key:\n  <content indented one extra level>
            output.push(indent + keyPart.trimEnd());
            const extra = indent + '  ';
            innerLines.forEach(l => output.push(l.trim() ? extra + l.slice(minInd) : ''));
        } else {
            // standalone !include  →  content at same indent level
            innerLines.forEach(l => output.push(l.trim() ? indent + l.slice(minInd) : ''));
        }
    }

    return output.join('\n');
}

function joinPath(base, rel) {
    if (!base) return rel;
    const parts = (base + '/' + rel).split('/');
    const out = [];
    for (const p of parts) {
        if (p === '..') out.pop();
        else if (p !== '.') out.push(p);
    }
    return out.join('/');
}

function lookupFile(fileMap, path) {
    if (fileMap[path] !== undefined) return fileMap[path];
    const stripped = path.replace(/^\.\//, '');
    if (fileMap[stripped] !== undefined) return fileMap[stripped];
    // case-insensitive fallback
    const lower = stripped.toLowerCase();
    for (const k of Object.keys(fileMap)) {
        if (k.toLowerCase() === lower) return fileMap[k];
    }
    return undefined;
}
