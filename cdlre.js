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
    function ToString(o) { return new String(o).toString(); }

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

    function matchToString(match) {
        var pieces = ['{'];
        'index input length'.split(' ').forEach(function(attr) {
            pieces.push(fmt('{}: {!r}, ', attr, match[attr]));
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
        if (pattern.__proto__ == RegExp.prototype)
            throw new Error("NYI");
        var P = pattern === undefined ? '' : ToString(pattern);
        var F = flags === undefined ? '' : ToString(flags);
        var ast = makeAST(P); // throws SyntaxError, per spec.
        assert(ast !== undefined);

        /* 
         * If F contains an unknown character or the same character
         * more than once, throw a syntax error.
         */
        var flagToCount = countFlags(F);
        //this.source = S; TODO
        this.global = flagToCount['g'] === 1;
        this.ignoreCase = flagToCount['i'] === 1;
        this.multiline = flagToCount['m'] === 1;
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

    function flagsToStr(obj) {
        return obj.global ? 'g' : ''
            + obj.ignoreCase ? 'i' : ''
            + obj.multiline ? 'm' : '';
    }

    RegExp.prototype.toString = function() {
        return '/' + this.source + '/' + flagsToStr(this);
    };

    RegExp.prototype.constructor = RegExp;

    function fromHostRE(hostRE) {
        var flags = flagsToStr(hostRE);
        return new RegExp(hostRE.source, flagsToStr(hostRE));
    }

    return extend(cdlre, {
        RegExp: RegExp,
        matchToString: matchToString,
        fromHostRE: fromHostRE,
    });
})(cdlre);
