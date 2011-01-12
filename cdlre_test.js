function checkMatchResults(name1, result1, name2, result2) {
    var pfmt = cdlre.pfmt;

    if ((result1 === null) !== (result2 === null)) {
        pfmt("MISMATCH: {}: {}; {}: {}", name1, uneval(result1), name2, uneval(result2));
        return false;
    }

    if ((result1 === null) && (result2 === null))
        return true;

    function check(attr) {
        var value1 = result1[attr];
        var value2 = result2[attr];
        if (value1 === value2)
            return true;

        pfmt('MISMATCH: {} != {}', name1, name2);
        pfmt('\tkey: {}', attr);
        pfmt('\t\t{}: {!r}', name1, value1);
        pfmt('\t\t{}: {!r}', name2, value2);
        pfmt('\tmatch:');
        pfmt('\t\t{}: {}', name1, cdlre.matchToString(result1));
        pfmt('\t\t{}: {}', name2, cdlre.matchToString(result2));
        return false;
    };
    var attrs = ['length', 'index', /* FIXME 'input' */];
    for (var i = 0; i < attrs.length; ++i) {
        var attr = attrs[i];
        if (!check(attr))
            return false;
    }
    for (var i = 0; i < result2.length; ++i) {
        if (!check(i))
            return false;
    }
    return true;
}

function testCDLRE() {
    var assert = cdlre.assert,
        fmt = cdlre.fmt,
        pfmt = cdlre.pfmt;
    var failCount = 0;

    function checkFlags(flags) {
        assert(flags !== undefined ? flags.match(/^[igym]{0,4}$/) : true, flags);
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

    function fail(pattern, flags, input) {
        checkFlags(flags);
        var literal = uneval(new RegExp(pattern, flags));
        var input = uneval(input);
        print("FAIL:"
              + "\n\tliteral: " + literal
              + "\n\tpattern: " + uneval(pattern)
              + "\n\tflags:   " + uneval(flags)
              + "\n\tinput:   " + input
              + "\n\tcode:    " + literal + '.exec(' + input + ')'
              + "\n");
        failCount += 1;
    }

    function compileAndExecGuest(pattern, flags, input) {
        checkFlags(flags);
        try {
            var guestRE = new cdlre.RegExp(pattern, flags);
            var guestResult = guestRE.exec(input);
        } catch (e) {
            pfmt("CAUGHT: {}", e);
            pfmt("STACK:  {}", e.stack);
            fail(pattern, flags, input);
            return;
        }
        assert(guestResult !== undefined);
        return guestResult;
    }

    function compileAndExecHost(pattern, flags, input) {
        checkFlags(flags);
        try {
            var hostRE = new RegExp(pattern, flags);
        } catch (e) {
            pfmt("CAUGHT: {}", e);
            pfmt("STACK:  {}", e.stack);
            fail(pattern, flags, input);
            return;
        }
        var hostResult = hostRE.exec(input);
        return hostResult;
    }

    /**
     * Check that the regexp given by pattern/flags execs, given input, to the
     * same thing as the host platform.
     */
    function checkAgainstHost(pattern, flags, input) {
        checkFlags(flags);
        var guestResult = compileAndExecGuest(pattern, flags, input);
        if (guestResult === undefined) /* Failure. */
            return;
        var hostResult = compileAndExecHost(pattern, flags, input);

        /* Compare guest and host. */
        if (!checkMatchResults('host', hostResult, 'guest', guestResult))
            fail(pattern, flags, input);
    }

    function checkAgainstSpec(pattern, flags, input, specResult) {
        checkFlags(flags);
        var guestResult = compileAndExecGuest(pattern, flags, input);
        if (guestResult === undefined) /* Failure. */
            return;

        if (!checkMatchResults('spec', specResult, 'guest', guestResult))
            fail(pattern, flags, input);
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
        /* 15.10.2.5 Term Note 2 */
        {re: /a[a-z]{2,4}/, op: 'exec', str: 'abcdefghi',
         result: {0: 'abcde', index: 0, length: 1}},
        {re: /a[a-z]{2,4}?/, op: 'exec', str: 'abcdefghi',
         result: {0: 'abc', index: 0, length: 1}},
        {re: /(aa|aabaac|ba|b|c)*/, op: 'exec', str: 'aabaac',
         result: {0: 'aaba', 1: 'ba', index: 0, length: 2}},
        //"aaaaaaaaaa,aaaaaaaaaaaaaaa".replace(/^(a+)\1*,\1+$/,"$1")

        /* 15.10.2.5 Term Note 3 */
        {re: /(z)((a+)?(b+)?(c))*/, op: 'exec', str: 'zaacbbbcac',
         result: {0: "zaacbbbcac", 1: "z", 2: "ac", 3: "a", 4: undefined, 5: "c",
                  index: 0, length: 6}},

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
        [/(())?/, ''],

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
        [/(?:(f)(o)(o)|(b)(a)(r))*/, "foobar"],
        [/((a)?(b)?c)*/, "bcac"],

        //[')', "test(); woo"], FIXME should be syntax error
        //[/x\d\dy/, "abcx45ysss235"], FIXME digit atom escape
        [/[^abc]def[abc]+/, "abxdefbb"],

        [/^(\"(.)*?\"|[:{}true])+?$/, "{\"guidePro\":{\"ok\":true}}"],

        [/(z)((a+)?(b+)?(c))*/, "zaacbbbcac"], /* ECMA 15.10.2.5 Note 3 */

        [/(?:^(a)|\1(a)|(ab)){2}/, "aab"], /* Mozilla bug 613820 */

        [/(?:a*?){2,}/, "a"], /* Mozilla bug 576822 */

        [/(\2(a)){2}/, "aaa"], /* Mozilla bug 613820 */

        /* FIXME: also permit a object literal that has an expected value. */
    ];

    var start = new Date();
    for (var i = 0; i < tests.length; ++i) {
        assert(tests[i] !== undefined, fmt('test {} is undefined, after {!r}', i, tests[i - 1]));
        var test = tests[i];
        var pattern, flags, input, result, checker;
        if (typeof test === 'object' && test.re !== undefined) {
            input = test.str;
            pattern = test.re.source;
            flags = extractFlags(test.re);
            result = test.result;
            checker = checkAgainstSpec;
        } else if (typeof test[0] === 'string') {
            input = test[1];
            pattern = test[0];
            flags = '';
            checker = checkAgainstHost;
        } else {
            input = test[1];
            pattern = test[0].source;
            flags = extractFlags(test[0]);
            checker = checkAgainstHost;
        }

        try {
            checker(pattern, flags, input, result);
        } catch (e) {
            print(e.stack);
            throw e;
        }
    }
    var end = new Date();

    if (failCount)
        pfmt("FAILED {}/{}", failCount, tests.length);
    else
        pfmt("PASSED {0}/{0}", tests.length);

    pfmt("Test time: {}s", (end - start) / 1000);
}
