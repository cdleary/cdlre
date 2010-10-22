/**
 * Facade for regular expression parsing and matching in a form that
 * approximates the builtin |RegExp| class, as it is prophesized in the
 * ECMAScripture.
 */

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
        // TODO: use digits in quantifier range that overflow the 32/64b space.
        // Backreferences.
        [/(a*)b\1/, "abaaaxaabaayy"],
        [/(a*)b\1/, "cccdaaabaxaabaayy"],
        [/(a*)b\1/, "cccdaaabqxaabaayy"],
        // FIXME: interesting spec discrepancy about valididty of RegExp(']') versus /]/
    ];
    var tests = [
        [/.+/, "...."],
        [/[^]/, "/"],
        [/[^]/, ""],
        [/[^]/, "[ ]"],
        [/[^]/, "["],
        [/[^]/, "[]"],
        [/[^]/, "]"],
        [/[^]/, "]["],
        [/[]/, "/"],
        [/[]/, ""],
        [/[]/, "[ ]"],
        [/[]/, "["],
        [/[]/, "["],
        [/[]/, "[]"],
        [/[]/, "]"],
        [/[]/, "]["],
        [/^([^,]{0,3},){0,3}d/, "aaa,b,c,d"],
        [/^([^,]{0,3},){3,}d/, "aaa,b,c,d"],
        [/^([^,]{0,3},){3}d/i, "aaa,b,c,d"],
        [/^([^,]*,){0,3}d/, "aaa,b,c,d"],
        //[/(?:\052)c/, "ab****c"],
        [/(.{2,3}){0,2}?t/, "abt"],
        //[/\240/, "abc"],
        [/^(?:[^,]*,){2}c/, "a,b,c"],
        [/^([^,]*,){2}c/, "a,b,c"],
        [/^(?:.,){2}c/i, "a,b,c"],
        [/^(.,){2}c/i, "a,b,c"],
        [/[*&$]{3}/, "123*&$abc"],
        [/3.{4}8/, "23 2 34 678 9 09"],
        [/3.{4}8/, "23 2 34 678 9 09"],
        [/3.{4}8/, "23 2 34 678 9 09"],
        [/.{3,4}/, "abbbbc"],
        [/(.{3})(.{4})/, "abcdefg"],
        [/^(){3,5}/, "abc"],
        [/[0-9]{3}/, "23 2 34 678 9 09"],
        [/[0-9]{3}/, "23 2 34 678 9 09"],
        [/[0-9]{3}/, "23 2 34 678 9 09"],
        [/[0-9]{3}/, "23 2 34 678 9 09"],
        [/[0-9]{3}/, "23 2 34 678 9 09"],
        [/[0-9]{3}/, "23 2 34 78 9 09"],
        [/[0-9]{3}/, "23 2 34 78 9 09"],
        [/.{0,93}/, "weirwerdf"],
        [/(a|d|q|)x/i, "bcaDxqy"],
        [/x86_64/, "x86_64-gcc3"],
        ['^a{010}', "aaaaaaaaaa"],
        ['^a{0000010}', "aaaaaaaaaa"],
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

        // Logged.
        [/.+/, "abcdefghijklmnopqrstuvwxyz"],
        [/.+/, "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
        [/(a)b(c)d(e)f(g)h(i)j(k)l(m)n(o)p(q)r(s)t(u)v(w)x(y)z/, "abcdefghijklmnopqrstuvwxyz"],
        [/abcd*efg/i, "ABCDEFG"],
        [/(a|b|c|d|e)f/i, "EF"],
        [/(a(b(c)))(d(e(f)))/, "xabcdefg"],
        [/^(ab|cd)e/i, "ABCDE"],
        [/(ab|cd)e/i, "ABCDE"],
        [/a|b|c|d|e/i, "E"],
        [/([abc])*d/i, "ABBBCD"],
        [/a[bc]d/i, "ABC"],
        [/ab|cd/i, "ABC"],
        [/((a)(b)c)(d)/i, "ABCD"],
        [/(a|b)c*d/i, "ABCD"],
        [/a(bc)d/i, "ABCD"],
        [/ab|cd/i, "ABCD"],
        [/abcd/i, "ABCD"],
        [/a[^bc]d/i, "ABD"],
        [/a[bc]d/i, "ABD"],
        [/a[^bc]d/i, "AED"],
        [/ab?c?d?x?y?z/, "123az789"],
        [/a(?:b|(c|e){1,2}?|d)+?(.)/, "ace"],
        [/(abc|)ef/, "abcdef"],
        [/(abc|)ef/i, "ABCDEF"],
        [/abc/, "hi"],
        [/a+b+c/i, "AABBABC"],
        [/^abc$/i, "AABC"],
        [/abc$/i, "AABC"],
        [/abc/i, "ABABC"],
        [/^abc$/i, "ABC"],
        [/(a)b(c)/i, "ABC"],
        [/ab??c/i, "ABC"],
        [/ab*c/i, "ABC"],
        [/abc/i, "ABC"],
        [/abc/i, "AbcaBcabC"],
        [/^abc/i, "ABCC"],
        [/^abc$/i, "ABCC"],
        [/abc/i, "ABX"],
        [/a[^-b]c/i, "A-C"],
        //[/a[^]b]c/i, "A]C"], TODO spec bug
        [/a[^-b]c/i, "ADC"],
        [/abc/i, "AXC"],
        [/(?:(?:(?:(?:(?:(?:(?:(?:(?:(a|b|c))))))))))/i, "C"],
        [/abc/ig, "AbcaBcabC"],
        [/abc/i, "XABCY"],
        [/abc/i, "XBC"],
        [/abc/, "xabcy"],
        [/abc/, "xbc"],
        [/a+b+d/, "aabbeeaabbs"],
        [/a[b-d]/, "aac"],
        [/a*b/, "dddb"],
        [/ab.de/, "abcde"],
        [/a[b-d]e/, "abd"],
        [/a[b-d]e/, "ace"],
        [/a[b-d]e/i, "ABD"],
        [/a[b-d]e/i, "ACE"],
        [/a[b-d]/i, "AAC"],
        [/ab[ercst]de/, "abcde"],
        [/ab[erst]de/, "abcde"],
        [/[abhgefdc]ij/, "hij"],
        [/[abhgefdc]ij/i, "HIJ"],
        [/a[-b]/i, "A-"],
        [/a[b-]/i, "A-"],
        [/(a+|b)?/i, "AB"],
        [/(a+|b)*/i, "AB"],
        [/(a+|b)+/i, "AB"],
        [/a\(*b/i, "A((B"],
        [/a\(*b/i, "AB"],
        [/a\(b/i, "A(B"],
        [/a\\b/i, "A\B"],
        [/[^ab]*/i, "CDE"],
        [/ab*/i, "XABYABBBZ"],
        [/ab*/i, "XAYABBBZ"],
        [/ab*/, "xabyabbbz"],
        [/ab*/, "xayabbbz"],
        [/a*b/, "xxx"],

        //[')', "test(); woo"], FIXME should be syntax error
        //[/x\d\dy/, "abcx45ysss235"], FIXME digit atom escape
        [/[^abc]def[abc]+/, "abxdefbb"],
    ];
    var tests = [
        [/a[b-]/i, "A-"],
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
