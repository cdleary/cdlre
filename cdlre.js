function GuestBuiltins() {
    var LOG = new Logger("RegExp");

    function RegExp(pattern, flags) {
        if (flags !== undefined)
            throw new Error("NYI");
        this.pattern = pattern;
        var ast = makeAST(pattern);
        this.__match = CompiledProcedure(ast, false, false);
    }
    
    /**
     * Perform a regexp match of |string| and returns an
     * array containing the results of the match, or |null|
     * if the match was unsuccessful.
     */
    RegExp.prototype.exec = function(string) {
        var s = new String(string).toString();
        var length = s.length;
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
            var r = this.__match(s, i);
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
        LOG.debug("capture array length: " + n);
        var A = new Array();
        // FIXME: need matchIndex.

        LOG.debug("offset i: " + i);
        LOG.debug("offset e: " + e);
        var matchedSubstr = s.substr(i, e - i);
        Object.defineProperty(A, '0', {
            value: matchedSubstr,
            writable: true,
            enumerable: true,
            confiurable: true,
        });

        for (var i = 1; i < n; ++i) {
            var captureI = r.captures[i];
            LOG.debug("capture index: " + i + "; value: " + captureI);
            Object.defineProperty(A, i.toString(), {
                value: captureI,
                writable: true,
                enumerable: true,
                configurable: true,
            });
        }
        return A;
    };

    RegExp.prototype.test = function(string) {
        var match = this.exec(string);
        return match !== null;
    };

    RegExp.prototype.toString = function() {
        return '/' + this.source + '/'
            + this.global ? 'g' : ''
            + this.ignoreCase ? 'i' : ''
            + this.multiline ? 'm' : '';
    };

    RegExp.prototype.constructor = RegExp;

    return {
        RegExp: RegExp,
    };
}

function checkMatchResults(expected, actual) {
    var ok = true;
    var check = function(attr) {
        var expectedValue = expected[attr];
        var actualValue = actual[attr];
        if (expectedValue !== actualValue) {
            ok = false;
            print('MISMATCH: key: ' + attr + '; expected: ' + uneval(expectedValue)
                  + '; actual: ' + uneval(actualValue));
        }
    };
    'index input length'.split().forEach(check);
    for (var i = 0; i < expected.length; ++i)
        check(i);
    return ok;
}

function testCDLRE() {
    var guestBuiltins = GuestBuiltins();
    function check(pattern, input) {
        var guestRE = new guestBuiltins.RegExp(pattern);
        var guestResult = guestRE.exec(input);
        var hostRE = new RegExp(pattern);
        var hostResult = hostRE.exec(input);
        if (!checkMatchResults(hostResult, guestResult))
            print("FAIL: pattern: " + uneval(pattern) + "; input: " + uneval(input));
    }
    //check('a', 'blah');
    //check('la', 'blah');
    //check('a*h', 'blah');
    //check('..h', 'blah');
    check('foo(.)baz', 'foozbaz');
}
