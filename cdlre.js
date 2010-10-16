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
    function check(pattern, input) {
        function fail() {
            print("FAIL:     pattern: " + uneval(pattern) + "; input: " + uneval(input));
            failCount += 1;
        }
        try {
            var guestRE = new guestBuiltins.RegExp(pattern);
            var guestResult = guestRE.exec(input);
        } catch (e) {
            print("CAUGHT: " + e);
            print("STACK:  " + e.stack);
            fail();
            return;
        }
        var hostRE = new RegExp(pattern);
        var hostResult = hostRE.exec(input);
        if (!checkMatchResults(hostResult, guestResult))
            fail();
    }
    var disabledTests = [
    ];
    var tests = [
        [/..h/, 'blah'],
        [/foo(.)baz/, 'foozbaz'],
        [/a/, 'blah'],
        [/la/, 'blah'],
        [/a*h/, 'blah'],
        [/m(o{2,})cow/, 'mooooocow'],
        [/x86_64/, "x86_64-gcc3"],
        [/x86_64/, "x86_64-gcc3"],
        [/x86_64/, "x86_64-gcc3"],
        /*
        [/(a|d|q|)x/i, "bcaDxqy"],
        [/(a|d|q|)x/i, "bcaDxqy"],
        [/(a|d|q|)x/i, "bcaDxqy"],
        [/(a|d|q|)x/i, "bcaDxqy"],
        [/(a|d|q|)x/i, "bcaDxqy"],
        */
        /*
        [/(a|(e|q))(x|y)/, "bcaddxqy"],
        [/(a|(e|q))(x|y)/, "bcaddxqy"],
        [/(a|(e|q))(x|y)/, "bcaddxqy"],
        [/(a|(e|q))(x|y)/, "bcaddxqy"],
        [/(a|(e|q))(x|y)/, "bcaddxqy"],
        [/a+b+d/, "aabbeeaabbs"],
        [/a+b+d/, "aabbeeaabbs"],
        [/a*b/, "aaadaabaaa"],
        [/a*b/, "aaadaabaaa"],
        [/a*b/, "aaadaabaaa"],
        [/a*b/, "aaadaabaaa"],
        [/a*b/, "aaadaabaaa"],
        [/a*b/, "dddb"],
        [/a*b/, "dddb"],
        [/a*b/, "dddb"],
        [/a*b/, "dddb"],
        [/a*b/, "dddb"],
        [/a*b/, "xxx"],
        [/a*b/, "xxx"],
        [/x\d\dy/, "abcx45ysss235"],
        [/x\d\dy/, "abcx45ysss235"],
        [/x\d\dy/, "abcx45ysss235"],
        [/x\d\dy/, "abcx45ysss235"],
        [/x\d\dy/, "abcx45ysss235"],
        */
        [/[^abc]def[abc]+/, "abxdefbb"],
        [/[^abc]def[abc]+/, "abxdefbb"],
        [/[^abc]def[abc]+/, "abxdefbb"],
        [/[^abc]def[abc]+/, "abxdefbb"],
        [/[^abc]def[abc]+/, "abxdefbb"],
        [/(a*)baa/, "ccdaaabaxaabaa"],
        [/(a*)baa/, "ccdaaabaxaabaa"],
        [/(a*)baa/, "ccdaaabaxaabaa"],
        [/(a*)baa/, "ccdaaabaxaabaa"],
        [/(a*)baa/, "ccdaaabaxaabaa"],
        [/(a*)baa/, "aabaa"],
        [/(a*)baa/, "aabaa"],
        [/(a*)baa/, "aabaa"],
        [/(a*)baa/, "aabaa"],
        [/(a*)baa/, "aabaa"],
        [/q(a|b)*q/, "xxqababqyy"],
        [/q(a|b)*q/, "xxqababqyy"],
        [/q(a|b)*q/, "xxqababqyy"],
        [/q(a|b)*q/, "xxqababqyy"],
        [/q(a|b)*q/, "xxqababqyy"],
        //[/(a(.|[^d])c)*/, "adcaxc"],
        //[/(a(.|[^d])c)*/, "adcaxc"],
        //[/(a(.|[^d])c)*/, "adcaxc"],
        //[/(a(.|[^d])c)*/, "adcaxc"],
        //[/(a(.|[^d])c)*/, "adcaxc"],
        /*
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "cccdaaabaxaabaayy"],
        [/(a*)b\1/, "cccdaaabaxaabaayy"],
        [/(a*)b\1/, "cccdaaabaxaabaayy"],
        [/(a*)b\1/, "cccdaaabaxaabaayy"],
        [/(a*)b\1/, "cccdaaabaxaabaayy"],
        [/(a*)b\1/, "cccdaaabqxaabaayy"],
        [/(a*)b\1/, "cccdaaabqxaabaayy"],
        [/(a*)b\1/, "cccdaaabqxaabaayy"],
        [/(a*)b\1/, "cccdaaabqxaabaayy"],
        [/(a*)b\1/, "cccdaaabqxaabaayy"],
        */
    ];
    for (var i = 0; i < tests.length; ++i) {
        var test = tests[i];
        var pattern = test[0].source;
        var input = test[1];
        check(pattern, input);
    }
    if (failCount)
        print("FAILED " + failCount + "/" + tests.length);
    else
        print("PASSED " + tests.length + "/" + tests.length);
}
