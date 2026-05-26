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
    let inLambdaBlock = false;
    let lambdaIndent = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Handle !secret
        line = line.replace(/!secret\s+(\S+)/g, '"__secret_$1__"');

        // Detect start of block lambda (!lambda |  or  !lambda |-)
        const blockLambdaMatch = line.match(/^(\s*\S.*?:\s*)!lambda\s+\|-?\s*$/);
        if (blockLambdaMatch) {
            result.push(blockLambdaMatch[1] + '"__lambda__"');
            inLambdaBlock = true;
            lambdaIndent = line.match(/^(\s*)/)[1].length;
            continue;
        }

        // If inside a block lambda, skip lines that are more indented
        if (inLambdaBlock) {
            const lineIndent = line.match(/^(\s*)/)[1].length;
            if (line.trim() === '' || lineIndent > lambdaIndent) {
                continue; // skip lambda body lines
            } else {
                inLambdaBlock = false; // end of block
            }
        }

        // Handle inline lambda (quoted or unquoted)
        // Quoted: !lambda "..." or !lambda '...'
        line = line.replace(/!lambda\s+"[^"]*"/g, '"__lambda__"');
        line = line.replace(/!lambda\s+'[^']*'/g, '"__lambda__"');
        // Unquoted: !lambda return ...;  (anything to end of line)
        line = line.replace(/!lambda\s+(.+)$/, '"__lambda__"');

        // Handle other ESPHome tags
        line = line.replace(/!extend\s+\w+/g, '');
        line = line.replace(/!remove\s+\w+/g, '"__remove__"');
        line = line.replace(/!include\s+\S+/g, '"__include__"');
        line = line.replace(/!ENV\s+\S+/g, '"__env__"');

        result.push(line);
    }
    return { text: result.join('\n'), substitutions };
}
