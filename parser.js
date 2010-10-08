/**
 * Parses regular expression patterns to ASTs.
 */

var BACKSLASH = '\\';

/* Set(a, b, c, ...) makes a set keyed on |toString| values. */
function Set() {
    if (!(this instanceof Set))
        return new Set(arguments);
    var items = arguments[0];
    this._map = {};
    for (var i = 0; i < items.length; ++i)
        this._map[items[i]] = null;
}

Set.prototype.has = function(item) { return item in this._map; };


function Scanner(pattern) {
    var index = 0;
    var self = {
        lookAhead: function(howMany) {
            if (howMany === undefined)
                howMany = 1;
            return pattern[index + howMany];
        },
        popLeft: function() {
            if (index === pattern.length)
                throw new Error("Popping past end of input");
            return pattern[index++];
        },
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

function PatternCharacter(sourceCharacter) {
    if (PatternCharacter.BAD.has(sourceCharacter) ||
        !(typeof sourceCharacter === 'string') ||
        sourceCharacter.length !== 1) {
        throw new Error("Bad pattern character: " + sourceCharacter);
    }

    return {
        nodeType: "PatternCharacter",
        sourceCharacter: sourceCharacter,
        toString: function() {
            return this.nodeType + "(sourceCharacter=" + this.sourceCharacter + ")";
        },
    };
}

PatternCharacter.BAD = Set('^$.*+?()[]{}|'.split().concat([BACKSLASH]));

function parseQuantifier(scanner) {
    var result;
    switch (scanner.next) {
      case '*': result = Quantifier.Star(); break;
      case '+': result = Quantifier.Plus(); break;
      case '?': result = Quantifier.Question(); break;
      case '{': throw new Error("Handle bounded quantifiers");
    }
    scanner.popLeft();
    if (scanner.next === '?') {
        scanner.popLeft();
        result.lazy = true;
    }
    return result;
}

function Atom(kind) {
    if (!Atom.KINDS.has(kind))
        throw new Error("Invalid Atom kind: " + kind);
    return {
        nodeType: 'Atom',
        kind: kind,
        toString: function() {
            return this.nodeType + "(kind=" + this.kind + ")";
        }
    };
}

Atom.KINDS = Set('PatternCharacter', 'Dot', 'AtomEscape', 'CharacterClass',
                 'CapturingGroup', 'NonCapturingGroup');
Atom.DOT = Atom('Dot');
Atom.PatternCharacter = function() {
    return Atom('PatternCharacter', PatternCharacter.apply(null, arguments));
}

function parseAtom(scanner) {
    switch (scanner.next) {
      case '.': return Atom.DOT;
      case BACKSLASH:
        scanner.popLeft();
        return parseAtomEscape(scanner);
      case '(':
        scanner.popLeft();
        if (scanner.matchlookAhead('?:'))
            return Atom.NonCapturingGroup(parseDisjunction(scanner));
        return Atom.CapturingGroup(parseDisjunction(scanner));
      default:
        return Atom.PatternCharacter(scanner.popLeft());
    };
}

function Term(assertion, atom, quantifier) {
    if (assertion && assertion.nodeType !== 'Assertion')
        throw new Error('Bad assertion value: ' + assertion);
    if (atom && atom.nodeType !== 'Atom')
        throw new Error('Bad atom value: ' + atom);
    if (quantifier && quantifier.nodeType !== 'Quantifier')
        throw new Error('Bad quantifier value: ' + quantifier);

    return {
        nodeType: "Term",
        assertion: assertion,
        atom: atom,
        quantifier: quantifier,
        toString: function() {
            return (this.nodeType + "(assertion=" + this.assertion + ", atom=" +
                    this.atom + ", quantifier=" + this.quantifier + ")");
        },
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
    if (term && term.nodeType !== 'Term')
        throw new Error('Bad term value: ' + term);
    if (alternative && alternative.nodeType !== 'Alternative')
        throw new Error('Bad alternative value: ' + alternative);

    return {
        nodeType: "Alternative",
        term: term,
        alternative: alternative,
        empty: !term && !alternative,
        toString: function() {
            if (this.empty)
                return "Alternative.EMPTY";
            return (this.nodeType + "(term=" + this.term + ", alternative=" +
                    this.alternative + ")");
        },
    };
}

Alternative.EMPTY = Alternative();

/**
 * Alternative ::= Term Alternative
 *               | ε
 */
function parseAlternative(scanner) {
    if (scanner.length === 0)
        return Alternative.EMPTY;
    return Alternative(parseTerm(scanner), parseAlternative(scanner));
}

/**
 * @param disjunction   Optional.
 */
function Disjunction(alternative, disjunction) {
    return {
        nodeType: "Disjunction",
        alternative: alternative,
        disjunction: disjunction,
        toString: function() {
            return (this.nodeType + "(alternative=" + this.alternative +
                    ", disjunction=" + this.disjunction + ")");
        },
    };
}

/**
 * Disjunction ::= Alternative
 *               | Alternative "|" Disjunction
 */
function parseDisjunction(scanner) {
    var lhs = parseAlternative(scanner);
    if (scanner.next === '|')
        return Disjunction(lhs, parseDisjunction(scanner.popLeft()));
    return Disjunction(lhs);
}

function Pattern(disjunction) {
    return {
        nodeType: 'Pattern',
        disjunction: disjunction,
        toString: function() {
            return this.nodeType + "(disjunction=" + this.disjunction + ")";
        },
    };
}

function parse(scanner) {
    return Pattern(parseDisjunction(scanner));
}

/* Tests */

function makeTestCases() {
    var Dis = Disjunction;
    var Alt = Alternative;
    var PatDis = function() { return Pattern(Disjunction.apply(null, arguments)); };
    var PCAlt = function(str) {
        var TAPC = function(c) { return Term.wrapAtom(Atom.PatternCharacter(c)); }
        var result = null;
        for (var i = 0; i < str.length; ++i) {
            if (result)
                result = Alternative(TAPC(str[i]), result);
            else
                result = Alternative(TAPC(str[i]), Alternative.Empty);
        }
        return result;
    };
    return {
        'ab': PatDis(PCAlt('ab')),
        /*'a|b': PatDis(
            PCAlt('a'),
            Dis(PCAlt('b'))
        ),*/
    };
}

function checkParseEquality(expected, actual) {
    var eIsObj = expected instanceof Object;
    var aIsObj = actual instanceof Object;
    if (eIsObj !== aIsObj) {
        print("Expected differs in objectness from actual");
        print("Expected: " + expected);
        print("Actual:   " + actual);
        throw "difference";
    }
    if (!eIsObj) {
        if (expected === actual)
            return true;
        print("Expected differs from actual in primitive value");
        print("Expected: " + expected);
        print("Actual:   " + actual);
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
            print("... key   " + key);
            print("Expected: " + expected);
            print("Actual:   " + actual);
            throw e;
        }
    }
}

function test() {
    print('Making test cases...');
    var cases = makeTestCases();
    print('Beginning tests...');
    for (var pattern in cases) {
        var expected = cases[pattern];
        var actual = parse(Scanner(pattern));
        try {
            checkParseEquality(expected, actual);
        } catch (e) {
            print("... pattern: " + uneval(pattern));
        }
    }
}
