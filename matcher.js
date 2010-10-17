/**
 * Defines the internal [[Match]] procedure for |RegExp| objects.
 */

// Matcher(State, Continuation) -> MatchResult
// type MatchResult = State | FAILURE

var MatchResult = {FAILURE: "failure"};

function IdentityContinuation(state) { return state; }
function identity(x) { return x; }

function State(endIndex, captures) {
    return {
        endIndex: endIndex,
        captures: captures
    };
}

function ProcedureBuilder(ast, multiline, ignoreCase, input, index) {
    this.ast = ast;
    this.multiline = multiline;
    this.ignoreCase = ignoreCase;
    this.input = input;
    this.inputLength = input.length;
    this.index = index;
    this.nCapturingParens = ast.nCapturingParens;
    this.clog = new Logger('ProcedureBuilder@CompileTime');
    this.rlog = new Logger('ProcedureBuilder@RunTime');
}

ProcedureBuilder.prototype.evalPattern = function() {
    this.clog.debug("evaluating pattern");
    var m = this.evalDisjunction(this.ast.disjunction);
    var c = IdentityContinuation;
    var cap = new Array(this.nCapturingParens);
    var x = State(this.index, cap);
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

ProcedureBuilder.prototype.repeatMatcher = function(m, min, max, greedy, x, c,
                                                    parenIndex, parenCount) {
    var self = this;
    if (max === 0)
        return c(x);
    var d = function(y) {
        if (min === 0 && y.endIndex === x.endIndex)
            return MatchResult.FAILURE;
        var min2 = min === 0 ? 0 : min - 1;
        var max2 = max === Infinity ? Infinity : max - 1;
        return self.repeatMatcher(m, min2, max2, greedy, y, c, parenIndex, parenCount);
    };
    var cap = x.captures.map(identity);
    for (var k = parenIndex; parenIndex <= parenIndex + parenCount; ++k)
        cap[k] = undefined;
    var e = x.endIndex;
    var xr = State(e, cap);
    if (min !== 0)
        return m(xr, d);
    if (!greedy) {
        var z = c(x);
        if (z !== MatchResult.FAILURE)
            return z;
        return m(xr, d);
    }
    var z = m(xr, d);
    if (z !== MatchResult.FAILURE)
        return z;
    return c(x);
}

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
        var parenCount = term.atom.parenCount;
        return function matcher(x, c) {
            return self.repeatMatcher(m, min, max, greedy, x, c, parenIndex, parenCount);
        };
    }
    throw new Error("NYI");
};

ProcedureBuilder.prototype.evalClassEscape = function(ce) {
    throw new Error("NYI: " + ce);
};

ProcedureBuilder.prototype.evalClassAtomNoDash = function(cand) {
    switch (cand.kind) {
      case 'SourceCharacter': return Set(cand.value);
      case 'ClassEscape': return this.evalClassEscape(cand.value);
      default: throw new Error("Unreachable: " + cand.kind);
    }
};

ProcedureBuilder.prototype.evalClassAtom = function(ca) {
    switch (ca.kind) {
      case 'Dash': return Set('-');
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
        return SetUnion(A, B);
      case 'Dashed':
        var A = this.evalClassAtomNoDash(necrnd.classAtom);
        var B = this.evalClassAtom(necrnd.value[0]);
        var C = this.evalClassRanges(necrnd.value[1]);
        var D = this.CharacterRange(A, B);
        return SetUnion(D, C);
      default: throw new Error("Unreachable: " + necrnd.kind);
    }

};

ProcedureBuilder.prototype.evalNonemptyClassRanges = function(necr) {
    if (necr.kind === 'NoDash' && !necr.value)
        return this.evalClassAtom(necr.classAtom);
    var A = this.evalClassAtom(necr.classAtom);
    if (necr.kind === 'NoDash') {
        var B = this.evalNonemptyClassRangesNoDash(necr.value);
        // TODO: factor out this union helper.
        return SetUnion(A, B);
    }
    var otherClassAtom = necr.value[0];
    var classRanges = necr.value[1];
    var B = this.evalClassAtom(otherClassAtom);
    var C = this.evalClassRanges(classRanges);
    var D = this.CharacterRange(A, B);
    return SetUnion(D, C);
};

ProcedureBuilder.prototype.evalClassRanges = function(cr) {
    if (cr === ClassRanges.EMPTY)
        return Set();
    return this.evalNonemptyClassRanges(cr.value);
};

ProcedureBuilder.prototype.evalCharacterClass = function(cc) {
    var charSet = this.evalClassRanges(cc.ranges);
    return {charSet: charSet, inverted: cc.inverted};
};

ProcedureBuilder.prototype.evalAtom = function(atom) {
    var self = this;
    self.clog.debug("evaluating atom");
    if (atom.kind === 'PatternCharacter') {
        var ch = atom.value.sourceCharacter;
        return self.CharacterSetMatcher(Set(ch), false);
    }
    if (atom.kind === 'Dot') {
        return self.CharacterSetMatcher({
            has: function(ch) { return ch !== '\n'; },
        }, false);
    }
    if (atom.kind === 'CapturingGroup') {
        var m = self.evalDisjunction(atom.value);
        var parenIndex = atom.capturingNumber;
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
                var z = State(ye, cap);
                self.rlog.info("executing capture group's subsequent continuation: " + c);
                return c(z);
            };
            return m(x, d);
        };
    }
    if (atom.kind === 'CharacterClass') {
        var result = this.evalCharacterClass(atom.value);
        return this.CharacterSetMatcher(result.charSet, result.inverted);
    }
    throw new Error("NYI: " + atom);
};

ProcedureBuilder.prototype.CharacterSetMatcher = function(charSet, invert) {
    if (!charSet)
        throw new Error("Bad value for charSet: " + charSet);
    var self = this;
    self.clog.debug("creating char set matcher");
    return function matcher(x, c) {
        var e = x.endIndex;
        // Note: clog because char set matchers are all executed at compile time.
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
        self.clog.debug("char set: " + charSet);
        if (charSet.has(chc) === invert)
            return MatchResult.FAILURE;
        var cap = x.captures;
        var y = State(e + 1, cap);
        return c(y);
    };
};

ProcedureBuilder.prototype.canonicalize = function(ch) {
    if (!this.ignoreCase)
        return ch;
    throw new Error("NYI");
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

/* 
 * TODO: could create a set of match tests with pre-cooked parse trees, but the 
 * integration tests seem to be doing just fine for now, since the parse results
 * are well unit-tested.
 */
