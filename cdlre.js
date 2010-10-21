function GuestBuiltins() {
    var LOG = new Logger("RegExp");

    var ToString = function(o) { return new String(o).toString(); }

    var countFlags = function(flags) {
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

    function RegExp(pattern, flags) {
        if (pattern.__proto__ == RegExp.prototype)
            throw new Error("NYI");
        var P = pattern === undefined ? '' : ToString(pattern);
        var F = flags === undefined ? '' : ToString(flags);
        var ast = makeAST(P); // throws SyntaxError, per spec.
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

function checkMatchResults(host, guest) {
    if ((host === null) !== (guest === null)) {
        print("MISMATCH: host: " + uneval(host) + "; guest: " + uneval(guest));
        return false;
    }
    var ok = true;
    if ((host === null) && (guest === null))
        return ok;
    var check = function(attr) {
        var hostValue = host[attr];
        var guestValue = guest[attr];
        if (hostValue !== guestValue) {
            ok = false;
            print('MISMATCH: key: ' + attr + '; host: ' + uneval(hostValue)
                  + '; guest: ' + uneval(guestValue));
        }
    };
    'index input length'.split().forEach(check);
    for (var i = 0; i < host.length; ++i)
        check(i);
    return ok;
}

function testCDLRE() {
    var guestBuiltins = GuestBuiltins();
    var failCount = 0;
    function check(pattern, input, flags) {
        function fail() {
            print("FAIL:     pattern: " + uneval(pattern) + "; input: " + uneval(input)
                  + "; flags: " + uneval(flags));
            failCount += 1;
        }
        try {
            var guestRE = new guestBuiltins.RegExp(pattern, flags);
            var guestResult = guestRE.exec(input);
        } catch (e) {
            print("CAUGHT: " + e);
            print("STACK:  " + e.stack);
            fail();
            return;
        }
        try {
            var hostRE = new RegExp(pattern, flags);
        } catch (e) {
            print("CAUGHT: " + e);
            print("Guest was ok, though; result: " + uneval(guestResult));
            fail();
            return;
        }
        var hostResult = hostRE.exec(input);
        if (!checkMatchResults(hostResult, guestResult))
            fail();
    }
    var disabledTests = [
        // Backreferences.
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "cccdaaabaxaabaayy"],
        [/(a*)b\1/, "cccdaaabqxaabaayy"],
    ];
    var tests = [
        [/(a|d|q|)x/i, "bcaDxqy"],
        [/x86_64/, "x86_64-gcc3"],
        ['^a{010}', "aaaaaaaaaa"],
        [/a*b/, "aaadaabaaa"],
        [/a*b/, "dddb"],
        [/a*b/, "xxx"],
        [/[^]/, "foo"],
        [/(a*)baa/, "ccdaaabaxaabaa"],
        [/(a*)baa/, "aabaa"],
        [/q(a|b)*q/, "xxqababqyy"],
        [/a+b+d/, "aabbeeaabbs"],
        [/(a+)(b+)?/g, "aaaccc"],
        [/(a|(e|q))(x|y)/, "bcaddxqy"],
        [/m(o{2,})cow/, 'mooooocow'],
        [/foo(.)baz/, 'foozbaz'],
        [/..h/, 'blah'],
        [/a/, 'blah'],
        [/la/, 'blah'],
        [/a*h/, 'blah'],
        [/(a(.|[^d])c)*/, "adcaxc"],
        //[')', "test(); woo"], FIXME should be syntax error
        //[/x\d\dy/, "abcx45ysss235"], FIXME digit atom escape
        [/[^abc]def[abc]+/, "abxdefbb"],
    ];
    var extractFlags = function(re) {
        var flags = [(re.ignoreCase ? 'i' : ''),
                     (re.multiline ? 'm' : ''),
                     (re.sticky ? 'y' : ''),
                     (re.global ? 'g' : '')].join('');
        return flags.length === 0 ? undefined : flags;
    }
    for (var i = 0; i < tests.length; ++i) {
        var test = tests[i];
        var pattern, flags;
        if (typeof test[0] === 'string') {
            pattern = test[0];
            flags = '';
        } else {
            pattern = test[0].source;
            flags = extractFlags(test[0]);
        }
        var input = test[1];
        check(pattern, input, flags);
    }
    if (failCount)
        print("FAILED " + failCount + "/" + tests.length);
    else
        print("PASSED " + tests.length + "/" + tests.length);
}
