/**
 * Defines the internal [[Match]] procedure for |RegExp| objects.
 */

// Matcher(State, Continuation) -> MatchResult
// type MatchResult = State | FAILURE

var MatchResult = {FAILURE: "failure"};

function IdentityContinuation(state) { return state; }

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
    this.log = new Logger('ProcedureBuilder');
}

ProcedureBuilder.prototype.evalPattern = function() {
    this.log.debug("evaluating pattern");
    var m = this.evalDisjunction(this.ast.disjunction);
    var c = IdentityContinuation;
    var cap = new Array(this.nCapturingParens);
    var x = State(this.index, cap);
    return m(x, c);
};

ProcedureBuilder.prototype.evalDisjunction = function(dis) {
    this.log.debug("evaluating disjunction");
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
    this.log.debug("evaluating alternative");
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

ProcedureBuilder.prototype.evalTerm = function(term) {
    this.log.debug("evaluating term");
    if (term.atom && !term.quantifier && !term.assertion)
        return this.evalAtom(term.atom);
    throw new Error("NYI: " + term);
};

ProcedureBuilder.prototype.evalAtom = function(atom) {
    var self = this;
    self.log.debug("evaluating atom");
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
        var parenIndex = 1; // FIXME: just wrong.
        return function matcher(x, c) {
            var d = function(y) {
                self.log.info('executing capture group continuation');
                var cap = y.captures.map(function(x) { return x; });
                var xe = x.endIndex;
                var ye = y.endIndex;
                self.log.debug('start state endIndex: ' + xe);
                self.log.debug('end state endIndex:   ' + ye);
                var s = self.input.substr(xe, ye - xe);
                cap[parenIndex] = s;
                var z = State(ye, cap);
                self.log.info("executing capture group's subsequent continuation: " + c);
                return c(z);
            };
            return m(x, d);
        };
    }
    throw new Error("NYI: " + atom);
};

ProcedureBuilder.prototype.CharacterSetMatcher = function(charSet, invert) {
    var self = this;
    self.log.debug("creating char set matcher");
    return function matcher(x, c) {
        var e = x.endIndex;
        self.log.debug("char matcher at end index: " + e);
        if (e === self.inputLength)
            return MatchResult.FAILURE;
        /* 
         * FIXME: c is both a continuation and character identifier here
         * in the spec.
         */
        var ch = self.input[e];
        var chc = self.canonicalize(ch);
        self.log.debug("canonicalized input char: " + uneval(chc));
        self.log.debug("char set: " + charSet);
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

function testMatcher() {
    var CP = CompiledProcedure;
    with (TestConstructors) {
        print(CP(PatDis(PCAlt('a')))('blah'));
    }
};
