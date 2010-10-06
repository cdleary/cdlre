/**
 * Parses regular expression patterns to ASTs.
 */

function Scanner(pattern) {
    var index = 0;
    var self = {
        lookAhead: function(howMany) {
            if (howMany === undefined)
                howMany = 1;
            return pattern[index + howMany];
        },
        popLeft: function() { index++; },
        popLeftAndLookAhead: function(howMany) {
            if (howMany === undefined)
                howMany = 1;
            index += 1 + howMany;
        },
    };
    Object.defineProperty(self, 'next', {
        get: function() { return pattern[index]; }
    });
    Object.defineProperty(self, 'length', {
        get: function() { return pattern.length - index; }
    });
    return self;
}

/**
 * Try a bunch of productions with the scanner and return the first successful
 * result in a wrapper.
 */
function tryProductions(scanner, makeWrapper) {
    return function() {
        for (var i = 0; i < arguments.length; ++i) {
            var production = arguments[i];
            var result = production(scanner);
            if (result !== null)
                return makeWrapper(result);
        }
        return null;
    }
}

/**
 * @return  An assertion on success, null on failure.
 * @post    The scanner will be advanced iff the parse is successful.
 */
function parseAssertion(scanner) {
    switch (scanner.next) {
      case '^': return Assertion.BEGINNING_OF_LINE;
      case '$': return Assertion.END_OF_LINE;
      case BACKSLASH:
        switch (scanner.lookAhead()) {
          case 'b':
            scanner.popLeftAndLookAhead();
            return Assertion.WORD_BOUNDARY;
          case 'B':
            scanner.popLeftAndLookAhead();
            return Assertion.NOT_WORD_BOUNDARY;
        }
        return null;
      case '(':
        if (scanner.lookAhead() !== '?')
            return null;
        switch (scanner.lookAhead(2)) {
        case '=':
            scanner.popLeftAndLookAhead(2);
            return PositiveAssertion(parseDisjunction(scanner));
        case '!':
            scanner.popLeftAndLookAhead(2);
            return NegativeAssertion(parseDisjunction(scanner));
        }
    }
}

function Term(assertion, atom, quantifier) {
    return {
        assertion: assertion,
        atom: atom,
        quantifier: quantifier,
    };
}

Term.wrapAtom = function(atom, quantifier) { return Term(null, atom, quantifier); };
Term.wrapAssertion = function(assertion) { return Term(assertion, null, null); }

function parseTerm(scanner) {
    var assertion = parseAssertion(scanner);
    if (assertion)
        return Term.wrapAssertion(assertion);
    var atom = parseAtom(scanner);
    if (!atom)
        return null;
    var quantifier = parseQuantifier(scanner);
    return Term.wrapAtom(atom, quantifier);
}

function Alternative(term, alternative) {
    return {
        term: term,
        alternative: alternative,
        empty: !term && !alternative,
    };
}

/**
 * Alternative ::= Term Alternative
 *               | ε
 */
function parseAlternative(scanner) {
    if (scanner.length === 0)
        return Alternative();
    return Alternative(parseTerm(scanner), parseAlternative(scanner));
}

/**
 * @param disjunction   Optional.
 */
function Disjunction(alternative, disjunction) {
    return {
        alternative: alternative,
        disjunction: disjunction,
    };
}

/**
 * Disjunction ::= Alternative
 *               | Alternative "|" Disjunction
 */
function parseDisjunction(scanner) {
    var lhs = parseAlternative();
    if (scanner.next === '|')
        return Disjunction(lhs, parseDisjunction(scanner.popLeft()));
    return Disjunction(lhs);
}

function parse(scanner) {
    return Pattern(parseDisjunction(scanner));
}

/* Tests */

function makeTestCases() {
    var Dis = Disjunction;
    var Alt = Alternative;
    var PatDis = function() { return Pattern(Disjunction.apply(arguments)); };
    var PCAlt = function(str) {
        var TAPC = function(c) { return Term(Atom(PatternCharacter(c))); }
        var result = null;
        for (var i = 0; i < str.length; ++i) {
            if (result)
                result = Alternative(result, TAPC(str[i]));
            else
                result = Alternative(Alternative.Empty, TAPC(str[i]));
        }
        return result;
    };
    return {
        'ab': PatDis(PCAlt('ab')),
        'a|b': PatDis(
            PCAlt('a'),
            Dis(PCAlt('b'))
        ),
    };
}
