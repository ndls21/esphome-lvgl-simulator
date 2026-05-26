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
        line = line.replace(/!extend\s+\w+/g, '');
        line = line.replace(/!remove\s+\w+/g, '"__remove__"');
        line = line.replace(/!include\s+\S+/g, '"__include__"');
        line = line.replace(/!ENV\s+\S+/g, '"__env__"');

        result.push(line);
    }
    return { text: result.join('\n'), substitutions };
}
