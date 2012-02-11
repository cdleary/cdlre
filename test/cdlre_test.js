/**
 * The testing space is as follows:
 *
 * - Guest: The CDLRE regexp engine.
 * - Host: The hosting VM regexp engine.
 * - Spec: The definitively correct results, as given by the specification.
 *
 * Ideally, all of these categories should produce the same results.
 */

var cdlre = (function(cdlre) {
    var extend = cdlre.extend,
        checkFlags = cdlre.checkFlags,
        extractFlags = cdlre.extractFlags,
        assert = cdlre.assert,
        pfmt = cdlre.pfmt;

    /**
     * Compare two regexp match results.
     */
    function compareMatchResults(a, b, diffCallback) {
        function cbk(data) {
            if (diffCallback === undefined)
                return;
            if (!data.hasOwnProperty('reason'))
                throw new Error('must have a reason');
            diffCallback(extend(data, {a: a, b: b}));
        }

        if ((a === null) !== (b === null)) {
            cbk({reason: 'nullness'});
            return false;
        }

        if ((a === null) && (b === null))
            return true;

        function chk(attr) {
            var aval = a[attr];
            var bval = b[attr];
            if (aval === bval)
                return true;
            
            cbk({reason: 'attr', attr: attr, aval: aval, bval: bval});
            return false;
        }

        var attrs = ['length', 'index', 'input'];
        for (var i = 0; i < attrs.length; ++i) {
            var attr = attrs[i];
            if (!chk(attr))
                return false;
        }

        /* Lengths known to be same at this point. */
        for (var i = 0; i < b.length; ++i) {
            if (!chk(i))
                return false;
        }

        cbk({reason: 'success'});
        return true;
    }

    function makeCLIDiffCallback(aname, bname) {
        return function cliDiffCallback(data) {
            var reason = data['reason'];
            var a = data['a'];
            var b = data['b'];
            if (reason === 'nullness') {
                pfmt("MISMATCH: {}: {}; {}: {}", aname, uneval(a), bname, uneval(b));
            } else if (reason === 'attr') {
                var attr = data['attr'];
                var aval = data['aval'];
                var bval = data['bval'];
                pfmt('MISMATCH: {} != {}', aname, bname);
                pfmt('\tkey: {}', attr);
                pfmt('\t\t{}: {!r}', aname, aval);
                pfmt('\t\t{}: {!r}', bname, bval);
                pfmt('\tmatch:');
                pfmt('\t\t{}: {}', aname, cdlre.matchToString(a, '\n\t\t\t'));
                pfmt('\t\t{}: {}', bname, cdlre.matchToString(b, '\n\t\t\t'));
            } else {
                throw new Error('unhandled reason: ' + reason);
            }
        };
    }

    /*************
     * Test Case *
     *************/

    function TestCase(pattern, flags, input, op, result) {
        checkFlags(flags);
        this.pattern = pattern;
        this.flags = flags;
        this.input = input;
        this.op = op;
        this.result = result;
        this.hostExecTime = undefined;
        this.guestExecTime = undefined;
    }

    TestCase.prototype.literal = function() {
        return uneval(new RegExp(this.pattern, this.flags));
    };

    TestCase.prototype.pprint = function(prefix) {
        if (prefix === undefined)
            prefix = '';

        pfmt('{}literal: {}', prefix, this.literal());
        pfmt('{}pattern: {!r}', prefix, this.pattern);
        pfmt('{}flags:   {!r}', prefix, this.flags);
        pfmt('{}input:   {!r}', prefix, this.input);
        pfmt('{}op:      {!r}', prefix, this.op);
        pfmt('{}result:  {}', prefix, this.result);
    };

    /**
     * Warning: may throw.
     */
    TestCase.prototype.runGuest = function() {
        var guestRE = new cdlre.RegExp(this.pattern, this.flags);
        if (this.op !== 'exec')
            throw new Error('NYI');
        var start = new Date();
        var guestResult = guestRE.exec(this.input);
        var end = new Date();
        this.guestExecTime = end - start;
        return guestResult;
    };

    /**
     * Warning: may throw.
     */
    TestCase.prototype.runHost = function() {
        var hostRE = new RegExp(this.pattern, this.flags);
        if (this.op !== 'exec')
            throw new Error('NYI');
        var start = new Date();
        var hostResult = hostRE.exec(this.input);
        var end = new Date();
        this.hostExecTime = end - start;
        return hostResult;
    };

    TestCase.prototype.run = function(resultCallback) {
        var self = this;
        var guestResult = this.runGuest();
        var hostResult = this.runHost();

        /* 
         * The problem here is that there are two things to test: guest versus
         * host and host versus spec. Ideally, the guest is always to spec, so
         * we should be comparing the host to the spec.
         */
        if (this.result !== undefined) {
            var result = extend(this.result, {input: self.input});
            if (!compareMatchResults(guestResult, result))
                throw new Error("internal error; guest must match spec");
        }

        if (resultCallback !== undefined) {
            var wrappedResultCallback = resultCallback;
            resultCallback = function(data) {
                data.guest = data.a;
                data.host = data.b;
                delete data.a;
                delete data.b;
                data = extend(data, {
                    pattern: self.pattern,
                    flags: self.flags,
                    input: self.input,
                    op: self.op,
                    result: self.result,
                });
                return wrappedResultCallback(data);
            };
        }

        return compareMatchResults(guestResult, hostResult, resultCallback);
    };

    TestCase.fromDescriptor = function(desc) {
        if (typeof desc === 'object' && typeof desc.re !== 'undefined') {
            var re = desc.re;
            var pattern = re.source;
            var flags = extractFlags(re);
            var input = desc.str;
            var op = desc.op;
            var result = desc.result;
            return new TestCase(pattern, flags, input, op, result);
        } else if (typeof desc[0].source !== 'undefined') {
            /* Two-tuple of regexp, input. The op is implicitly exec. */
            var re = desc[0];
            var pattern = re.source;
            var flags = extractFlags(re);
            var input = desc[1];
            var op = 'exec';
            return new TestCase(pattern, flags, input, op);
        } else if (typeof desc[0] == 'string') {
            var pattern = desc[0];
            var flags = '';
            var input = desc[1];
            var op = 'exec';
            return new TestCase(pattern, flags, input, op);
        } else {
            throw new Error("unhandled descriptor: " + uneval(desc));
        }
    };

    /**************
     * Test Suite *
     **************/

    function TestSuite(cases) {
        this.cases = cases;
        this.successes = 0;
        this.failures = 0;
        this.hostExecTime = 0;
        this.guestExecTime = 0;
    }

    TestSuite.fromDescriptors = function(descs) {
        var cases = [];
        for (var i = 0; i < descs.length; ++i)
            cases.push(TestCase.fromDescriptor(descs[i]));
        return new TestSuite(cases);
    };

    TestSuite.prototype.run = function(resultCallback) {
        for (var i = 0; i < this.cases.length; ++i) {
            var tc = this.cases[i];
            var success = tc.run(resultCallback);
            if (success) {
                this.hostExecTime += tc.hostExecTime;
                this.guestExecTime += tc.guestExecTime;
                this.successes += 1;
            } else {
                this.failures += 1;
            }
        }
    };

    return extend(cdlre, {
        test: {
            TestSuite: TestSuite,
            makeCLIDiffCallback: makeCLIDiffCallback,
        },
    });
})(cdlre);

function testCDLRE(resultCallback) {
    var assert = cdlre.assert,
        fmt = cdlre.fmt,
        pfmt = cdlre.pfmt,
        checkFlags = cdlre.checkFlags,
        TestSuite = cdlre.test.TestSuite;
    var failCount = 0;

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
        [/\b/, 'abc'],
        [/\t\n\v\f\r/, '\t\n\v\f\r'],

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

        [/(?:first (\d) |second (\d) |third (\d) ){3}/, "first 1 second 2 third 3 "], /* Mozilla bug 692441 */

        /* FIXME: also permit an object literal that has an expected value. */
    ];

    var suite = TestSuite.fromDescriptors(tests);
    suite.run(resultCallback);
    return {
        successes: suite.successes,
        failures: suite.failures,
        hostExecTime: suite.hostExecTime,
        guestExecTime: suite.guestExecTime,
    };
}

function cliTestCDLRE() {
    var madeDot = false;
    function onResult(data) {
        if (data.reason === 'success') {
            putstr('.');
            madeDot = true;
            return;
        }
        if (madeDot) {
            print();
            madeDot = false;
        }
        print((uneval(data)));
    }
    testCDLRE(onResult);
    if (madeDot)
        print();
}
