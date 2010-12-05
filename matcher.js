/**
 * Defines the internal [[Match]] procedure for |RegExp| objects.
 *
 * Note: could create a set of match tests with pre-cooked parse trees, but the 
 * integration tests seem to be doing just fine for now.
 */

// Matcher(State, Continuation) -> MatchResult
// type MatchResult = State | FAILURE

var MatchResult = {FAILURE: "failure"};
var LINE_TERMINATOR = Set('\n', '\r', '\u2028', '\u2029');

function IdentityContinuation(state) { return state; }

function ProcedureBuilder(ast, multiline, ignoreCase, input, index) {
    assert(ast !== undefined);
    this.ast = ast;
    this.multiline = multiline;
    this.ignoreCase = ignoreCase;
    this.input = input;
    this.inputLength = input.length;
    this.index = index;
    this.nCapturingParens = ast.nCapturingParens;
    assert(this.nCapturingParens !== undefined);
    this.clog = new Logger('ProcedureBuilder@CompileTime');
    this.rlog = new Logger('ProcedureBuilder@RunTime');
    this.spec = new Logger('ProcedureBuilder@Spec');
}

/**********************************
 * AST-to-continuation transforms *
 **********************************/

ProcedureBuilder.prototype.evalPattern = function() {
    this.clog.debug("evaluating pattern");
    var m = this.evalDisjunction(this.ast.disjunction);
    var c = IdentityContinuation;

    /* State captures use 1-based indexing. */
    var cap = [];
    for (var i = 0; i <= this.nCapturingParens; ++i)
        cap[i] = undefined;
    this.checkCaptures(cap);
    var x = this.State(this.index, cap);

    return m(x, c);
};

ProcedureBuilder.prototype.evalDisjunction = function(dis) {
    this.clog.debug("evaluating disjunction");
    if (!dis.disjunction)
        return this.evalAlternative(dis.alternative);
    var m1 = this.evalAlternative(dis.alternative);
    var m2 = this.evalDisjunction(dis.disjunction);
    return function matcher(x, c) {
        var r = m1(x, c);
        if (r !== MatchResult.FAILURE)
            return r;
        return m2(x, c);
    };
};

ProcedureBuilder.prototype.evalAlternative = function(alt) {
    this.clog.debug("evaluating alternative");
    if (alt.empty)
        return function matcher(x, c) { return c(x); };
    /*
     * Note, right recursive, unlike the ECMA grammar,
     * so the alternative matcher is the continuation
     * for the term matcher. */
    var m1 = this.evalTerm(alt.term);
    var m2 = this.evalAlternative(alt.alternative);
    return function matcher(x, c) {
        var d = function(y) { return m2(y, c); };
        return m1(x, d);
    };
};

ProcedureBuilder.prototype.evalQuantifier = function(quant) {
    /* Now I see why JS needs a lambda syntax... */
    var prefix = quant.prefix;
    var quantFun = {
        Star: function() { return {min: 0, max: Infinity}; },
        Plus: function() { return {min: 1, max: Infinity}; },
        Question: function() { return {min: 0, max: 1}; },
        Fixed: function() { return {min: prefix.value, max: prefix.value}; },
        LowerBound: function() { return {min: prefix.value, max: Infinity}; },
        Range: function() {
            if (prefix.value.length !== 2)
                throw new Error("Bad range prefix value: " + prefix.value);
            return {min: prefix.value[0], max: prefix.value[1]};
        },
    }[prefix.kind];
    if (!quantFun)
        throw new Error("Bad value for quant prefix kind: " + prefix.kind);
    var result = quantFun();
    result.greedy = !quant.lazy;
    result.toString = function() {
        var accum = ['{'];
        for (var key in result) {
            if (!result.hasOwnProperty(key) || key === 'toString')
                continue;
            accum.push(key, ': ', uneval(result[key]), ', ');
        }
        accum.pop();
        accum.push('}');
        return accum.join('');
    }
    this.clog.debug("Quantifier " + uneval(prefix.kind) + "; result: " + result);
    return result;
};

ProcedureBuilder.prototype.evalAssertion = function(assertion) {
    var self = this;
    if (assertion === Assertion.BOL) {
        return function assertionTester(x) {
            var e = x.endIndex;
            if (e === 0)
                return true;
            if (!self.multiline)
                return false;
            return LINE_TERMINATOR.has(self.input[e - 1]);
        };
    } else if (assertion === Assertion.EOL) {
        return function assertionTester(x) {
            var e = x.endIndex;
            if (e === self.inputLength)
                return true;
            if (!self.multiline)
                return false;
            return LINE_TERMINATOR.has(self.input[e]);
        };
    } else {
        throw new Error("NYI");
    }
};

ProcedureBuilder.prototype.evalTerm = function(term) {
    var self = this;
    self.clog.debug("evaluating term");
    if (term.atom && !term.quantifier && !term.assertion)
        return self.evalAtom(term.atom);
    if (term.atom && term.quantifier) {
        var m = self.evalAtom(term.atom);
        var bounds = self.evalQuantifier(term.quantifier);
        var min = bounds.min, max = bounds.max, greedy = bounds.greedy;
        var parenIndex = term.parenIndex;
        var parenCount = term.parenCount;
        assert(parenIndex !== undefined, new String(parenIndex));
        assert(parenCount !== undefined, new String(parenCount));
        return function matcher(x, c) {
            return self.repeatMatcher(m, min, max, greedy, x, c, parenIndex, parenCount);
        };
    }

    if (term.atom)
        return this.evalAtom(term.atom);

    if (term.assertion) {
        return function matcher(x, c) {
            var t = self.evalAssertion(term.assertion);
            var r = t(x);
            return r ? c(x) : MatchResult.FAILURE;
        };
    }
    throw new Error("Unreachable: " + term);
};

ProcedureBuilder.prototype.evalClassEscape = function(ce) {
    throw new Error("NYI: " + ce);
};

ProcedureBuilder.prototype.evalClassAtomNoDash = function(cand) {
    switch (cand.kind) {
      case 'SourceCharacter': return this.CharSet(cand.value);
      case 'ClassEscape': return this.evalClassEscape(cand.value);
      default: throw new Error("Unreachable: " + cand.kind);
    }
};

ProcedureBuilder.prototype.evalClassAtom = function(ca) {
    switch (ca.kind) {
      case 'Dash': return this.CharSet('-');
      case 'NoDash': return this.evalClassAtomNoDash(ca.value);
      default: throw new Error("Unreachable: " + ca.kind);
    }
};

ProcedureBuilder.prototype.evalNonemptyClassRangesNoDash = function(necrnd) {
    switch (necrnd.kind) {
      case 'ClassAtom':
        return this.evalClassAtom(necrnd.classAtom);
      case 'NotDashed':
        var A = this.evalClassAtomNoDash(necrnd.classAtom);
        var B = this.evalNonemptyClassRangesNoDash(necrnd.value);
        return this.CharSetUnion(A, B);
      case 'Dashed':
        var A = this.evalClassAtomNoDash(necrnd.classAtom);
        var B = this.evalClassAtom(necrnd.value[0]);
        var C = this.evalClassRanges(necrnd.value[1]);
        var D = this.CharacterRange(A, B);
        return this.CharSetUnion(D, C);
      default:
        throw new Error("Unreachable: " + necrnd.kind);
    }

};

ProcedureBuilder.prototype.evalNonemptyClassRanges = function(necr) {
    var self = this;
    if (necr.kind === 'NoDash' && !necr.value)
        return self.evalClassAtom(necr.classAtom);
    var A = self.evalClassAtom(necr.classAtom);
    if (necr.kind === 'NoDash') {
        var B = self.evalNonemptyClassRangesNoDash(necr.value);
        return self.CharSetUnion(A, B);
    }
    var otherClassAtom = necr.value[0];
    var classRanges = necr.value[1];
    var B = self.evalClassAtom(otherClassAtom);
    var C = self.evalClassRanges(classRanges);
    var D = self.CharacterRange(A, B);
    return self.CharSetUnion(D, C);
};

ProcedureBuilder.prototype.evalClassRanges = function(cr) {
    if (cr === ClassRanges.EMPTY)
        return this.CharSet();
    return this.evalNonemptyClassRanges(cr.value);
};

ProcedureBuilder.prototype.evalCharacterClass = function(cc) {
    var charSet = this.evalClassRanges(cc.ranges);
    return {charSet: charSet, inverted: cc.inverted};
};

ProcedureBuilder.prototype.evalCharacterEscape = function(ce) {
    switch (ce.kind) {
      case 'IdentityEscape':
        return ce.value.value;
      default:
        throw new Error("NYI");
    }
};

ProcedureBuilder.prototype.evalDecimalEscape = function(de) {
    var i = parseInt(de.value);
    if (i === 0)
        return '\0';
    return i;
};

ProcedureBuilder.prototype.evalAtomEscape = function(ae) {
    var self = this;
    if (ae.characterEscape) {
        var ch = self.evalCharacterEscape(ae.characterEscape);
        var A = self.CharSet(ch);
        return self.CharacterSetMatcher(A, false);
    }

    if (ae.decimalEscape) {
        var E = self.evalDecimalEscape(ae.decimalEscape);
        if (E instanceof String) {
            throw new Error("NYI");
        }
        assert(typeof E === 'number');
        var n = E;
        if (n == 0 || n > self.ast.nCapturingParens)
            throw new Error("SyntaxError: bad decimal escape value");
        return function matcher(x, c) {
            var cap = x.captures;
            var s = cap[n];
            if (s === undefined)
                return c(x);
            var e = x.endIndex;
            var len = s.length;
            var f = e + len;
            if (f > self.inputLength)
                return MatchResult.FAILURE;
            spec('15.10.2.9 AtomEscape::DecimalEscape 5.8');
            for (var i = 0; i < len; ++i) {
                if (self.Canonicalize(s[i]) !== self.Canonicalize(self.input[e + i]))
                    return MatchResult.FAILURE;
            }
            var y = self.State(f, cap);
            return c(y);
        };
    }

    throw new Error("NYI");
};

ProcedureBuilder.prototype.evalAtom = function(atom) {
    var self = this;
    self.clog.debug("evaluating atom");
    switch (atom.kind) {
      case 'PatternCharacter':
        var ch = atom.value.sourceCharacter;
        return self.CharacterSetMatcher(self.CharSet(ch), false);
      case 'Dot':
        return self.CharacterSetMatcher({
            has: function(ch) { return ch !== '\n'; },
            hasCanonicalized: function(cch) {
                return cch !== self.canonicalize('\n');
            }
        }, false);
      case 'CapturingGroup':
        var m = self.evalDisjunction(atom.value);
        var parenIndex = atom.capturingNumber;
        self.checkParenIndex(parenIndex);
        return function matcher(x, c) {
            var d = function(y) {
                self.rlog.info('executing capture group continuation');
                var cap = y.captures.map(identity);
                var xe = x.endIndex;
                var ye = y.endIndex;
                self.rlog.debug('start state endIndex: ' + xe);
                self.rlog.debug('end state endIndex:   ' + ye);
                var s = self.input.substr(xe, ye - xe);
                cap[parenIndex] = s;
                var z = self.State(ye, cap);
                //self.rlog.info("executing capture group's subsequent continuation: " + c);
                return c(z);
            };
            return m(x, d);
        };
      case 'CharacterClass':
        var result = self.evalCharacterClass(atom.value);
        return self.CharacterSetMatcher(result.charSet, result.inverted);
      case 'NonCapturingGroup':
        return self.evalDisjunction(atom.value);
      case 'AtomEscape':
        return self.evalAtomEscape(atom.value);
      default:
        throw new Error("NYI: " + atom);
    }
};

/*********************
 * Transform helpers *
 *********************/

ProcedureBuilder.prototype.CharacterSetMatcher = function(charSet, invert) {
    if (!charSet)
        throw new Error("Bad value for charSet: " + charSet);
    var self = this;
    self.clog.debug("creating char set matcher");
    return function matcher(x, c) {
        var e = x.endIndex;
        // Note: use clog because char set matchers are all executed at compile time.
        self.clog.debug("char matcher at end index: " + e);
        if (e === self.inputLength)
            return MatchResult.FAILURE;
        /* 
         * FIXME: c is both a continuation and character identifier here
         * in the spec.
         */
        var ch = self.input[e];
        var chc = self.canonicalize(ch);
        self.clog.debug("canonicalized input char: " + uneval(chc));
        self.clog.debug("(to be canonicalized) char set: " + charSet);
        if (charSet.hasCanonicalized(chc) === invert)
            return MatchResult.FAILURE;
        var cap = x.captures;
        var y = self.State(e + 1, cap);
        return c(y);
    };
};

ProcedureBuilder.prototype.repeatMatcher = function(m, min, max, greedy, x, c,
                                                    parenIndex, parenCount) {
    var self = this;
    var spec = self.spec.debug.bind(self.spec);
    spec('15.10.2.5 RepeatMatcher 1');
    if (max === 0)
        return c(x);
    var d = function(y) {
        spec('15.10.2.5 RepeatMatcher 2.1');
        if (min === 0 && y.endIndex === x.endIndex)
            return MatchResult.FAILURE;
        spec('15.10.2.5 RepeatMatcher 2.2');
        var min2 = min === 0 ? 0 : min - 1;
        spec('15.10.2.5 RepeatMatcher 2.3');
        var max2 = max === Infinity ? Infinity : max - 1;
        spec('15.10.2.5 RepeatMatcher 2.4');
        return self.repeatMatcher(m, min2, max2, greedy, y, c, parenIndex, parenCount);
    };
    spec('15.10.2.5 RepeatMatcher 3');
    var cap = x.captures.map(identity);
    spec('15.10.2.5 RepeatMatcher 4');
    self.rlog.debug('clearing parens [' + parenIndex + ', ' + (parenIndex + parenCount) + ')');
    if (parenCount)
        self.checkParenIndex(parenIndex);
    for (var k = parenIndex; k < parenIndex + parenCount; ++k)
        cap[k] = undefined;
    self.checkCaptures(cap);

    spec('15.10.2.5 RepeatMatcher 5');
    var e = x.endIndex;

    spec('15.10.2.5 RepeatMatcher 6');
    var xr = self.State(e, cap);

    spec('15.10.2.5 RepeatMatcher 7');
    if (min !== 0)
        return m(xr, d);

    spec('15.10.2.5 RepeatMatcher 8');
    if (!greedy) {
        var z = c(x);
        if (z !== MatchResult.FAILURE)
            return z;
        return m(xr, d);
    }

    spec('15.10.2.5 RepeatMatcher 9');
    var z = m(xr, d);

    spec('15.10.2.5 RepeatMatcher 10');
    if (z !== MatchResult.FAILURE)
        return z;

    spec('15.10.2.5 RepeatMatcher 11');
    return c(x);
}

ProcedureBuilder.prototype.canonicalize = function(ch) {
    if (!this.ignoreCase)
        return ch;
    var u = ch.toUpperCase();
    if (u.length !== 1) // TODO: is this the correct check?
        return u;
    var cu = u[0];
    return (ch.charCodeAt(0) >= 128 && cu.charCodeAt(0) < 128)
        ? ch
        : cu;
};

ProcedureBuilder.prototype.CharacterRange = function(A, B) {
    var self = this;
    if (A.length !== 1 || B.length !== 1)
        throw new SyntaxError("Can't use a set as an endpoint in a character range: "
                              + A + ' to ' + B);
    var a = A.pop();
    var b = B.pop();
    var i = ord(a);
    var j = ord(b);
    if (i > j)
        throw new SyntaxError('Invalid character range: ' + A + ' to ' + B);
    var chars = [];
    while (i <= j)
        chars.push(chr(i++));
    return self.CharSet.apply(self, chars);
};

/* The parenIndex is 1-based. */
ProcedureBuilder.prototype.checkParenIndex = function(parenIndex) {
    assert(parenIndex !== undefined);
    assert(1 <= parenIndex && parenIndex <= this.nCapturingParens, parenIndex);
};

ProcedureBuilder.prototype.checkCaptures = function(captures) {
    /* Array length assumes 0-indexing. */
    assert(captures.length === this.nCapturingParens + 1,
           captures.length + ' !== ' + (this.nCapturingParens + 1));
    assert(typeof captures[0] === 'undefined');
};

ProcedureBuilder.prototype.State = function(endIndex, captures) {
    this.checkCaptures(captures);
    return {
        endIndex: endIndex,
        captures: captures
    };
};

ProcedureBuilder.prototype.CharSet = function() {
    var self = this;
    var set = new Set(arguments);
    set.hasCanonicalized = function(tcc) {
        var found = false;
        set.each(function(c) {
            var cc = self.canonicalize(c);
            if (cc === tcc) {
                found = true;
                return true;
            }
        });
        return found;
    };
    return set;
};

ProcedureBuilder.prototype.CharSetUnion = function(cs1, cs2) {
    var su = SetUnion(cs1, cs2);
    su.hasCanonicalized = function(tcc) {
        return cs1.hasCanonicalized(tcc) || cs2.hasCanonicalized(tcc);
    };
    return su;
};

/**
 * Return a function that accepts an input string and an index, and matches
 * that input string from the index using the pattern represented by |ast|.
 */
function CompiledProcedure(ast, multiline, ignoreCase) {
    return function(str, index) {
        if (index === undefined)
            index = 0;
        return new ProcedureBuilder(ast, multiline, ignoreCase, str, index).evalPattern();
    };
}
