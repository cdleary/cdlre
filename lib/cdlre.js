/**
 * Facade for regular expression parsing and matching in a form that
 * approximates the builtin |RegExp| class, as it is prophesized in the
 * ECMAScripture.
 */

var cdlre = (function(cdlre) {
    var extend = cdlre.extend,
        CompiledProcedure = cdlre.CompiledProcedure,
        MatchResult = cdlre.MatchResult,
        makeAST = cdlre.makeAST,
        assert = cdlre.assert,
        fmt = cdlre.fmt;

    var log = new Logger("RegExp");

    /** Approximation of the ToString used in the spec. */
    function ToString(o) {
        if (typeof o === 'string')
            return o;
        return o.toString();
    }

    /** Return a {flag: count} mapping. */
    function countFlags(flags) {
        var flagToCount = {};
        for (var i = 0; i < flags.length; ++i) {
            var flag = flags[i];
            if (flag in flagToCount)
                flagToCount[flag] += 1;
            else
                flagToCount[flag] = 1;
        }
        return flagToCount;
    }

    function matchToString(match, sep) {
        sep = sep === undefined ? ' ' : sep;
        var pieces = ['{'];
        'index input length'.split(' ').forEach(function(attr) {
            pieces.push(fmt('{}: {!r},{}', attr, match[attr], sep));
        });
        pieces.push('[')
        for (var i = 0; i < match.length; ++i)
            pieces.push(uneval(match[i]), ', ');
        if (match.length)
            pieces.pop();
        pieces.push(']}');
        return pieces.join('');
    }

    function RegExp(pattern, flags) {
        if (pattern.__proto__ === cdlre.getGlobal().RegExp.prototype ||
            pattern.__proto__ === RegExp.prototype) {
            // TODO: write tests for this
            if (flags !== undefined)
                throw new TypeError("can't supply flags when constructing one RegExp from another");
            else {
                var P = this.source = pattern.source;
                var F = extractFlags(pattern);
            }
        } else {
            var P = pattern === undefined ? '' : ToString(pattern);
            var F = flags === undefined ? '' : ToString(flags);
            if (P === '')
                this.source = "(?:)";
            else if (P === '/')
                this.source = "\\/";
            else
                this.source = P;
            // TODO: what other invalid RegExp literals are there?
        }

        /* 
         * If F contains an unknown character or the same character
         * more than once, throw a syntax error.
         */
        var flagToCount = countFlags(F);
        this.global = flagToCount['g'] === 1;
        this.ignoreCase = flagToCount['i'] === 1;
        this.multiline = flagToCount['m'] === 1;
        var ast = makeAST(P); // throws SyntaxError, per spec.
        assert(ast !== undefined);
        this.__match = CompiledProcedure(ast, this.multiline, this.ignoreCase);
        this.lastIndex = 0;
    }
    
    /**
     * Perform a regexp match of |string| and returns an
     * array containing the results of the match, or |null|
     * if the match was unsuccessful.
     */
    RegExp.prototype.exec = function(string) {
        function spec() {} // FIXME
        var S = ToString(string);
        var length = S.length;
        var lastIndex = this.lastIndex;
        var i = lastIndex; // FIXME: toInteger semantics.
        var global = this.global;
        if (!global)
            i = 0;
        var matchSucceeded = false;
        while (!matchSucceeded) {
            if (i < 0 || i > length) {
                this.lastIndex = 0;
                return null;
            }
            var r = this.__match(S, i);
            log.debug('match result {!r}', r);
            if (r == MatchResult.FAILURE)
                i += 1;
            else
                matchSucceeded = true;
            // FIXME: spec seems wrong here. i += 1;
        }
        var e = r.endIndex;
        if (global)
            this.lastIndex = e;
        var n = r.captures.length;
        log.debug(fmt("capture array: {!r}", r.captures));
        spec('15.10.6.2 Regexp.prototype.exec(string) 13')
        var A = new Array();
        spec('15.10.6.2 Regexp.prototype.exec(string) 14')
        var matchIndex = i;
        spec('15.10.6.2 Regexp.prototype.exec(string) 15')
        A.index = matchIndex;
        spec('15.10.6.2 Regexp.prototype.exec(string) 16')
        A.input = S;

        var matchedSubstr = S.substr(i, e - i);
        log.debug('offset i:       {!r}', i);
        log.debug('offset e:       {!r}', e);
        log.debug('matched substr: {!r}', matchedSubstr);

        A[0] = matchedSubstr;
        log.debug('setting captures 1 to {}', n);
        for (var i = 1; i < n; ++i) {
            var captureI = r.captures[i];
            log.debug("capture index: {}; value: {!r}", i, captureI);
            A[i] = captureI;
        }
        return A;
    };

    RegExp.prototype.test = function(string) {
        var match = this.exec(string);
        return match !== null;
    };

    function flagsToString(obj) {
        return (obj.global ? 'g' : '')
            + (obj.ignoreCase ? 'i' : '')
            + (obj.multiline ? 'm' : '');
    }

    RegExp.prototype.toString = function() {
        return '/' + this.source + '/' + flagsToString(this);
    };

    RegExp.prototype.constructor = RegExp;

    function fromHostRE(hostRE) {
        var flags = flagsToString(hostRE);
        return new RegExp(hostRE.source, flagsToString(hostRE));
    }

    function runRegExp(hostRE, inputStr) {
        try {
            var guestRE = fromHostRE(hostRE);
            var guestResult = guestRE.exec(inputStr);
            print(cdlre.matchToString(guestResult));
        } catch (e) {
            cdlre.pfmt('{}\n{}', e, e.stack);
        }
    }

    function checkFlags(flags) {
        // TODO: arent' duplicate flags supposed to assert?
        assert(flags !== undefined ? flags.match(/^[igym]{0,4}$/) : true, flags);
    }

    function String(wrapped) {
        log.warn('String constructor not implemented for realsies!');
        this.wrapped = wrapped;
    }

    String.prototype.split = function String_split(separator, limit) {
        var self = this;
        log.warn('skipping some stuff in String.prototype.split');
        var S = ToString(self.wrapped);
        var A = new Array();
        var lengthA = 0;
        // Note the change to "lim" here...
        if (limit === undefined) {
            var lim = 1 << 31 + ((1 << 31) - 1);
        } else {
            throw new Error("NYI: ToUint32");
        }
        var s = S.length;
        var p = 0;
        if (!(separator instanceof RegExp))
            throw new Error("NYI: can only handle RegExp as [[Class]]");
        var R = separator;
        if (lim === 0)
            return A;
        if (separator === undefined || s === 0)
            throw new Error("NYI");
        var q = p;
        while (q !== s) {
            var z = SplitMatch(R, S, 0)
            if (z === MatchResult.FAILURE) {
                q += 1;
                continue;
            }
            var e = z.endIndex;
            var cap = z.captures;
            if (e === p) {
                q += 1;
                continue;
            }
            var T = S.substr(p, q - p);
            A[ToString(lengthA)] = T;
            lengthA += 1;
            if (lengthA === lim)
                return A;
            p = e;
            var i = 0;
            while (i !== cap.length) {
                i += 1;
                A[ToString(lengthA)] = cap[i];
                lengthA += 1;
                if (A.length === lim)
                    return A;
            }
            q = p;
        }
        var T = S.substr(p, s - p);
        A[ToString(lengthA)] = T;
        return A;
    };

    // Note: seems like the spec param order is wrong here.
    function SplitMatch(R, S, q) {
        if (!(R instanceof RegExp))
            throw new Error("NYI");
        return R.__match(S, q);
    }

    /**
     * Produce a flags string or undefined, corresponding to the flags set on
     * |re|.
     */
    function extractFlags(re) {
        var flags = [(re.ignoreCase ? 'i' : ''),
                     (re.multiline ? 'm' : ''),
                     (re.sticky ? 'y' : ''),
                     (re.global ? 'g' : '')].join('');
        return flags.length === 0 ? undefined : flags;
    }

    return extend(cdlre, {
        String: String,
        RegExp: RegExp,
        matchToString: matchToString,
        fromHostRE: fromHostRE,
        runRegExp: runRegExp,
        flagsToString: flagsToString,
        checkFlags: checkFlags,
        extractFlags: extractFlags,
    });
})(cdlre);
