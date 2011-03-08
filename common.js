if (typeof uneval === 'undefined') {
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
          case 'object':
            var pieces = ['{'];
            var sawKey = false;
            for (var key in obj) {
                if (!obj.hasOwnProperty(key))
                    continue;
                var value = obj[key];
                sawKey = true;
                pieces.push(uneval(key), ': ', uneval(value), ', ');
            }
            if (sawKey)
                pieces.pop(); /* Pop trailing comma. */
            pieces.push('}');
            return pieces.join('');
        }
        throw new Error("NYI: " + typeof obj);
    };
}

/* Taken from http://mzl.la/aG52lJ */
if (typeof Function.prototype.bind === 'undefined')
    Function.prototype.bind = function(context /*, arg1, arg2... */) {  
        'use strict';  
        if (typeof this !== 'function') throw new TypeError();  
        var _slice = Array.prototype.slice,  
            _concat = Array.prototype.concat,  
            _arguments = _slice.call(arguments, 1),  
            _this = this,  
            _function = function() {  
                return _this.apply(this instanceof _dummy ? this : context,  
                    _concat.call(_arguments, _slice.call(arguments, 0)));  
            },  
            _dummy = function() {};  
        _dummy.prototype = _this.prototype;  
        _function.prototype = new _dummy();  
        return _function;  
};

var cdlre = (function(cdlre) {
    cdlre = cdlre || {};

    function inBrowser() {
        if (typeof CDLRE_IN_BROWSER !== 'undefined')
            return Boolean(CDLRE_IN_BROWSER);
        return typeof window === 'object' && window.window === window;
    }

    function assert(cond, msg) {
        if (cond)
            return;
        throw new Error("Assertion failure" + (msg !== undefined ? (": " + msg) : ''));
    }

    function identity(x) { return x; }

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

    /** Return the ordinal number corresponding to character c. */
    function ord(c) {
        return c.charCodeAt(0);
    }

    /** Return the character corresponding to the ordinal number n. */
    function chr(n) {
        return String.fromCharCode(n);
    }

    function isAlpha(c) {
        var cc = ord(c);
        return ord('a') <= cc && cc <= ord('z') ||
               ord('A') <= cc && cc <= ord('Z');
    }

    function fmt(format) {
        var replaceCount = 0;
        var fmtArguments = arguments;
        return format.replace(/{(\d*)(!r)?}/g, function repl(matchedStr, argNum, shouldRepr, offset,
                                                             wholeStr) {
            var transform = identity;

            if (shouldRepr || argNum) {
                /* No possibility of an escape sequence. */
                if (shouldRepr)
                    transform = uneval;

                if (argNum) {
                    /* Explicit argument numbers don't bump the replace count. */
                    return transform(fmtArguments[parseInt(argNum) + 1]);
                }
            } else {
                if (offset > 0 &&
                    wholeStr.substr(offset - 1, fmt.ESCAPE_SEQUENCE.length) === fmt.ESCAPE_SEQUENCE) {
                    return fmt.ESCAPE_RESULT;
                }
            }

            return transform(fmtArguments[++replaceCount]);
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

    /** Print with formatting of variadic arguments. */
    function pfmt(format) {
        print(fmt.apply(null, [format].concat(argsToArray(arguments).slice(1))));
    }

    /**
     * Extend the own-properties of the base object with the own-properties of
     * the extension object. Asserts that the extension properties DNE on the
     * base object.
     */
    function extend(baseObj, extObj) {
        for (var k in extObj) {
            if (!extObj.hasOwnProperty(k))
                continue;
            assert(!baseObj.hasOwnProperty(k));
            baseObj[k] = extObj[k];
        }
        return baseObj;
    }

    return extend(cdlre, {
        assert: assert,
        isAlpha: isAlpha,
        ord: ord,
        chr: chr,
        extend: extend,
        fmt: fmt,
        pfmt: pfmt,
        argsToArray: argsToArray,
        juxtapose: juxtapose,
        pprint: pprint,
        identity: identity,
        inBrowser: inBrowser,
    });
})(cdlre);
