if (typeof uneval === 'undefined') {
    /* 
     * FIXME:   Care about this more when it actually runs in more than
     *          one browser...
     */
    uneval = function(obj) {
        if (obj instanceof RegExp) {
            return obj.toString();
        }
        switch (typeof obj) {
          case 'string': return '"' + obj + '"';
          case 'number': return obj.toString();
          case 'boolean': return obj.toString();
          case 'undefined': return 'undefined';
          case 'function': return '<function>';
        }
        throw new Error("NYI: " + typeof obj);
    };
}

function assert(cond, msg) {
    if (cond)
        return;
    throw new Error("Assertion failure" + (msg !== undefined ? (": " + msg) : ''));
}

function pformat(v) {
    var s = v.toString();
    var indent = 0;
    var s = s.replace(/(\(|\)|,\s*)/g, function(tok) {
        tok = tok[0];
        if (tok === '(') {
            indent += 1;
        }
        if (tok === ')') {
            indent -= 1;
            return ')';
        }
        var accum = [];
        for (var i = 0; i < indent; ++i)
            accum.push('  ');
        return tok + '\n' + accum.join('');
    });
    return s;
}

function pprint(v) { print(pformat(v)); }

function juxtapose(block1, block2, columnWidth) {
    var accum = [];
    var lb1 = block1.split('\n');
    var lb2 = block2.split('\n');
    for (var i = 0; i < Math.max(lb1.length, lb2.length); ++i) {
        /* Is there no fast way to pad these things? */
        var line1 = lb1[i] || '';
        while (line1.length < columnWidth)
            line1 = line1 + ' ';
        var line2 = lb2[i] || '';
        accum.push(line1 + '    ' + line2);
    }
    return accum.join('\n')
}

function ord(c) { return c.charCodeAt(0); }

function chr(n) { return String.fromCharCode(n); }

function isAlpha(c) {
    var cc = ord(c);
    return ord('a') <= cc && cc <= ord('z') ||
           ord('A') <= cc && cc <= ord('Z');
}

function fmt(format) {
    var replaceCount = 0;
    var fmtArguments = arguments;
    return format.replace(/{(\d*)}/g, function makeReplacement(matchedStr, argNum, offset, wholeStr) {
        if (argNum)
            return fmtArguments[parseInt(argNum) + 1];

        if (offset > 0 && wholeStr.substr(offset - 1, fmt.ESCAPE_SEQUENCE.length) === fmt.ESCAPE_SEQUENCE)
            return fmt.ESCAPE_RESULT;

        return fmtArguments[++replaceCount];
    });
}

fmt.ESCAPE_SEQUENCE = '{{}}';
fmt.ESCAPE_RESULT = '{}';

function argsToArray(args) {
    var arr = [];
    for (var i = 0; i < args.length; ++i)
        arr.push(args[i]);
    return arr;
}

function pfmt(format) {
    print(fmt.apply(null, [format].concat(argsToArray(arguments).slice(1))));
}
