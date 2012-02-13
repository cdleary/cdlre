var pfmt = cdlre.pfmt,
    fmt = cdlre.fmt,
    makeAST = cdlre.makeAST,
    assert = cdlre.assert;

function makeTestCases() {
    with (cdlre.testConstructors) {
        try {
            return [
                // Flat pattern
                [/ab/, PatDis(PCAlt('ab'))],
                // Alternation
                [/a|b/, PatDis(PCAlt('a'), Dis(PCAlt('b')))],
                // Quantifiers
                [/a*/, PatDis(QPCAlt('a', 'Star'))],
                [/a+?/, PatDis(QPCAlt('a', 'Plus', true))],
                [/a??/, PatDis(QPCAlt('a', 'Question', true))],
                [/a+b/, PatDis(QPCAlt('a', 'Plus', false, undefined, PCAlt('b')))],
                [/a{3}/, PatDis(QPCAlt('a', 'Fixed', false, 3))],
                [/a{1,}/, PatDis(QPCAlt('a', 'LowerBound', false, 1))],
                // Capturing groups and alternation
                [/(a)/, PatDis(CGAlt(Dis(PCAlt('a'))))],
                [/((b))/, PatDis(CGAlt(Dis(CGAlt(Dis(PCAlt('b'))))))],
                [/(|abc)/, PatDis(CGAlt(Dis(Alt.EMPTY, Dis(PCAlt('abc')))))],
                // Simple assertions
                [/^abc/, PatDis(AssAlt.BOLConcat(PCAlt('abc')))],
                [/def$/, PatDis(PCAlt('def', AssAlt.EOL))],
                [/^abcdef$/, PatDis(AssAlt.BOLConcat(PCAlt('abcdef', AssAlt.EOL)))],
                // Grouping assertions
                [/ca(?!t)/, PatDis(PCAlt('ca', AssAlt.Zwn(Dis(PCAlt('t')))))],
                [/ca(?:t)s/, PatDis(PCAlt('ca', NCGAlt(Dis(PCAlt('t')), PCAlt('s'))))],
                // Builtin character classes
                [/\w/, PatDis(CCEAlt.WORD)],
                // Character classes
                [/[a-c]/, PatDis(CCRAlt('a', 'c'))],
                [/[^a-d]/, PatDis(CCRAlt('a', 'd', true))],
                [/[^ab]/, PatDis(CCAlt(['a', 'b'], true))],
                // Backreferences
                [/\1/, PatDis(BRAlt(1))],

                // Tricky
                [/[^]/, PatDis(CCAlt([], true))],
                [')', new SyntaxError()],
                ['(', new SyntaxError()],
                ['a{010}', PatDis(QPCAlt('a', 'Fixed', false, 10))],

                [/(a(.|[^d])c)/, PatDis(CGAlt(Dis(PCAlt('a',
                    CGAlt(
                        Dis(DOT_ALT, Dis(CCAlt(['d'], true))),
                        PCAlt('c')
                    )))))],
                [/(a*|b)/, PatDis(CGAlt(Dis(QPCAlt('a', 'Star'), Dis(PCAlt('b')))))],
                [/f(.)z/, PatDis(PCAlt('f', CGAlt(Dis(DOT_ALT), PCAlt('z'))))],
            ];
        } catch (e) {
            pfmt("CAUGHT: {}", e);
            print(e.stack);
            throw new Error("Failed to build test cases.");
        }
    }
}

function checkParseEquality(expected, actual) {
    var eIsObj = expected instanceof Object;
    var aIsObj = actual instanceof Object;
    if (eIsObj !== aIsObj) {
        print("Expected differs in objectness from actual");
        pfmt("Expected: {!r}", expected);
        pfmt("Actual:   {!r}", actual);
        throw "difference";
    }
    if (!eIsObj) {
        if (expected === actual)
            return true;
        print("Expected differs from actual in primitive value");
        pfmt("Expected: {!r}", expected);
        pfmt("Actual:   {!r}", actual);
        throw "difference";
    }
    for (var key in expected) {
        if (!(key in actual)) {
            print("Expected key missing from actual: key: " + key);
            throw "difference";
        }
        var aVal = actual[key];
        var eVal = expected[key];
        try {
            checkParseEquality(eVal, aVal);
        } catch (e) {
            print("... key:      " + key);
            print("    expected: " + expected);
            print("    actual:   " + actual);
            throw e;
        }
    }
}

function testParser() {
    print('START MAKING TEST CASES...');
    var cases = makeTestCases();
    print('DONE MAKING TEST CASES.');
    print('Beginning parser tests...');

    function testSuccess(pattern, expected) {
        var actual;
        try {
            actual = makeAST(pattern);
            checkParseEquality(expected, actual);
            pfmt("PASSED: {}", new RegExp(pattern));
        } catch (e) {
            pfmt("... exception: {}", e);
            pfmt("... pattern:   {}", uneval(pattern));
            if (!actual) {
                print(e.stack);
                return;
            }
            var colWidth = 50;
            print(juxtapose('Expected', 'Actual', colWidth));
            print(juxtapose('========', '======', colWidth));
            print(juxtapose(pformat(expected), pformat(actual), colWidth));
        }
    };

    function testFailure(pattern, expected) {
        var actual;
        try {
            actual = makeAST(pattern);
            pfmt("FAILED TO RAISE: {}", uneval(pattern));
        } catch (e) {
            if (e.constructor === expected.constructor)
                pfmt("PASSED: {!r}", pattern);
            else
                pfmt("FAILED: wrong error: {}", e);
        }
    }

    for (var i = 0; i < cases.length; ++i) {
        var case_ = cases[i];
        var pattern = typeof case_[0] === 'string' ? case_[0] : case_[0].source;
        var expected = case_[1];
        if (expected instanceof Error) {
            testFailure(pattern, expected);
        } else {
            testSuccess(pattern, expected);
        }
    }
    print('Finished parser tests.\n');
}
