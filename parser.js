/**
 * Parses regular expression patterns to ASTs.
 */

if (typeof uneval === 'undefined') {
    uneval = function(obj) {
        if (typeof obj === 'string') {
            return '"' + obj + '"'; // HACK;
        }
        throw new Error("NYI");
    };
}

LogLevel = {
    ALL: 100,
    DEBUG: 30,
    INFO: 20,
    WARN: 10,
    NONE: 0,
};

var LOG_LEVEL = LogLevel.NONE;
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
    var cc0 = '0'.charCodeAt(0);
    var cc9 = '9'.charCodeAt(0);
    var toDigit = function(c) {
        var ccc = c.charCodeAt(0);
        // TODO: test corner case with leading zeros.
        if (cc0 <= ccc && ccc <= cc9)
            return ccc - cc0;
        throw new Error("Non-digit character: " + c);
    };
    var self = {
        lookAhead: function(howMany) {
            if (howMany === undefined)
                howMany = 1;
            return pattern[index + howMany];
        },
        /**
         * Look ahead for all the character arguments -- on match, pop them.
         * Return whether popping occurred.
         */
        popLookAhead: function() {
            for (var i = 0; i < arguments.length; ++i) {
                var targetChar = arguments[i];
                if (targetChar.length !== 1)
                    throw new Error("Bad target character value: " + targetChar);
                if (targetChar !== pattern[index + i])
                    return false;
            }
            index += arguments.length;
            return true;
        },
        tryPop: function(c) {
            if (pattern[index] === c) {
                index += 1;
                return true;
            }
            return false;
        },
        popOrSyntaxError: function(c, msg) {
            if (pattern[index] === c) {
                index += 1;
                return;
            }
            throw new SyntaxError(msg);
        },
        popLeft: function() {
            if (index === pattern.length)
                throw new Error("Popping past end of input");
            Scanner.log.debug("popLeft: " + pattern[index]);
            return pattern[index++];
        },
        popLeftAndLookAhead: function(howMany) {
            if (howMany === undefined)
                howMany = 1;
            index += 1 + howMany;
        },
        /** Throw a SyntaxError when non-optional and a decimal digit is not found. */
        popDecimalDigit: function(optional) {
            try {
                var accum = toDigit(this.next);
            } catch (e) {
                if (e.toString().indexOf('Non-digit') !== -1) {
                    if (optional)
                        throw e;
                    throw new SyntaxError('Invalid decimal digit: ' + this.next);
                }
                throw e; // Unknown!
            }
            this.popLeft();
            return accum;
        },
        popDecimalDigits: function() {
            var accum = this.popDecimalDigit();
            while (true) {
                try {
                    var digit = this.popDecimalDigit(true);
                } catch (e) {
                    if (e.toString().indexOf('Non-digit') !== -1)
                        return accum;
                    throw e;
                }
                accum *= 10;
                accum += digit;
            }
            return accum;
        },
        toString: function() {
            return 'Scanner(pattern=' + uneval(pattern) + ', index=' + index + ')';
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

Scanner.log = {
    debug: function(msg) {
        if (LOG_LEVEL >= LogLevel.DEBUG)
            print("Scanner: DEBUG: " + msg);
    },
};

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
            return this.nodeType + "(sourceCharacter=" + uneval(this.sourceCharacter) + ")";
        },
    };
}

PatternCharacter.BAD = Set('^', '$', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}',
                           '|', BACKSLASH);

function QuantifierPrefix(kind, value) {
    if (!QuantifierPrefix.KINDS.has(kind))
        throw new Error("Invalid quantifier prefix kind: " + kind + "; value: " + value);

    return {
        nodeType: 'QuantifierPrefix',
        kind: kind,
        value: value,
        toString: function() {
            var result = this.nodeType + "(kind=" + uneval(this.kind);
            if (this.value)
                result += ", value=" + this.value
            result += ")";
            return result;
        }
    };
}

QuantifierPrefix.KINDS = Set('Star', 'Plus', 'Question', 'Fixed', 'LowerBound', 'Range');
QuantifierPrefix.STAR = QuantifierPrefix('Star');
QuantifierPrefix.QUESTION = QuantifierPrefix('Question');
QuantifierPrefix.PLUS = QuantifierPrefix('Plus');

function Quantifier(prefix, lazy) {
    return {
        nodeType: 'Quantifier',
        prefix: prefix,
        lazy: !!lazy,
        toString: function() {
            return this.nodeType + "(prefix=" + this.prefix + ", lazy=" + this.lazy + ")";
        }
    };
}

Quantifier.Star = function(lazy) { return Quantifier(QuantifierPrefix.STAR, lazy); };
Quantifier.Plus = function(lazy) { return Quantifier(QuantifierPrefix.PLUS, lazy); };
Quantifier.Question = function(lazy) { return Quantifier(QuantifierPrefix.QUESTION, lazy); };

Quantifier.Fixed = function(lazy, value) {
    if (typeof value !== 'number')
        throw new Error("Bad fixed value: " + value);
    return Quantifier(QuantifierPrefix('Fixed', value), lazy);
};

Quantifier.Range = function(lazy, value) {
    if (value.length !== 2)
        throw new Error("Bad range value: " + value);
    return Quantifier(QuantifierPrefix('Range', value), lazy);
};

Quantifier.LowerBound = function(lazy, value) {
    if (typeof value !== 'number')
        throw new Error("Bad lower bound value: " + value);
    return Quantifier(QuantifierPrefix('Range', value), lazy);
};

function parseQuantifier(scanner) {
    var result;
    switch (scanner.next) {
      case '*': result = Quantifier.Star(); break;
      case '+': result = Quantifier.Plus(); break;
      case '?': result = Quantifier.Question(); break;
      case '{':
        scanner.popLeft();
        var firstDigits = scanner.popDecimalDigits();
        if (!firstDigits)
            return;
        if (!scanner.tryPop(',')) {
            scanner.popOrSyntaxError('}', 'Expected closing brace on quantifier prefix');
            return Quantifier.Fixed(scanner.tryPop('?'), firstDigits);
        }

        if (scanner.tryPop('}'))
            return Quantifier.LowerBound(scanner.tryPop('?'), firstDigits);

        throw new Error("Quantifier prefix range");

      default:
        return;
    }
    scanner.popLeft();
    if (scanner.next === '?') {
        scanner.popLeft();
        result.lazy = true;
    }
    return result;
}

function _Atom(kind, value) {
    if (!Atom.KINDS.has(kind))
        throw new Error("Invalid Atom kind: " + kind + "; value: " + value);
    return {
        nodeType: 'Atom',
        kind: kind,
        value: value,
        toString: function() {
            return this.nodeType + "(kind=" + uneval(this.kind)
                   + ", value=" + this.value + ")";
        }
    };
}

var Atom = {}; // Put a bag over the weird constructor's head.

Atom.KINDS = Set('PatternCharacter', 'Dot', 'AtomEscape', 'CharacterClass',
                 'CapturingGroup', 'NonCapturingGroup');

Atom.DOT = _Atom('Dot', null);

Atom.PatternCharacter = function() {
    return _Atom('PatternCharacter', PatternCharacter.apply(null, arguments));
};

Atom.CapturingGroup = function(dis) {
    return _Atom('CapturingGroup', dis);
};

function parseAtom(scanner) {
    if (!(scanner instanceof Object))
        throw new Error('Bad scanner value: ' + scanner);
    switch (scanner.next) {
      case '.': return Atom.DOT;
      case BACKSLASH:
        scanner.popLeft();
        return parseAtomEscape(scanner);
      case '(':
        scanner.popLeft();
        if (scanner.popLookAhead('?', ':'))
            return Atom.NonCapturingGroup(parseDisjunction(scanner));
        return Atom.CapturingGroup(parseDisjunction(scanner));
      default:
        if (PatternCharacter.BAD.has(scanner.next))
            return;
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
    if (!(scanner instanceof Object))
        throw new Error('Bad scanner value: ' + scanner);
    var assertion = parseAssertion(scanner);
    if (assertion)
        return Term.wrapAssertion(assertion);
    var atom = parseAtom(scanner);
    if (!atom)
        return;
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
        alternative: alternative || Alternative.EMPTY,
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
    if (!(scanner instanceof Object))
        throw new Error('Bad scanner value: ' + scanner);
    if (scanner.length === 0)
        return Alternative.EMPTY;
    var term = parseTerm(scanner);
    if (!term)
        return;
    var alternative = parseAlternative(scanner) || Alternative.EMPTY;
    return Alternative(term, alternative);
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
    if (scanner.next === '|') {
        scanner.popLeft();
        return Disjunction(lhs, parseDisjunction(scanner));
    }
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
    if (!(scanner instanceof Object))
        throw new Error('Bad scanner value: ' + scanner);
    return Pattern(parseDisjunction(scanner));
}

/* Tests */

function makeTestCases() {
    var Dis = Disjunction;
    var Alt = Alternative;
    var PatDis = function() { return Pattern(Disjunction.apply(null, arguments)); };

    /**
     * Create a capturing group alternative that wraps |dis|.
     */
    var CGAlt = function(dis) {
        return Alternative(Term.wrapAtom(Atom.CapturingGroup(dis)));
    }

    /**
     * Create an alternative tree from a bunch of pattern characters in |str|.
     */
    var PCAlt = function(str) {
        var TAPC = function(c) { return Term.wrapAtom(Atom.PatternCharacter(c)); }
        var result = null;
        for (var i = str.length - 1; i >=0; --i) {
            if (result)
                result = Alternative(TAPC(str[i]), result);
            else
                result = Alternative(TAPC(str[i]), Alternative.EMPTY);
        }
        return result;
    };

    /** Quantifier pattern character alternative. */
    var QPCAlt = function(c, kind, lazy, quantVal, nextAlt) {
        if (nextAlt && nextAlt.nodeType !== 'Alternative')
            throw new Error("Bad next alternative: " + nextAlt);
        var QK = Quantifier[kind];
        if (!QK)
            throw new Error("Invalid quantifier kind: " + uneval(kind));
        return Alt(Term.wrapAtom(
            Atom.PatternCharacter(c),
            QK(!!lazy, quantVal)),
        nextAlt);
    };

    return {
        'ab': PatDis(PCAlt('ab')),
        'a|b': PatDis(
            PCAlt('a'),
            Dis(PCAlt('b'))
        ),
        '(a)': PatDis(CGAlt(Dis(PCAlt('a')))),
        'a*': PatDis(QPCAlt('a', 'Star')),
        'a+?': PatDis(QPCAlt('a', 'Plus', true)),
        'a??': PatDis(QPCAlt('a', 'Question', true)),
        'a+b': PatDis(QPCAlt('a', 'Plus', false, undefined, PCAlt('b'))),
        '(a*|b)': PatDis(CGAlt(Dis(QPCAlt('a', 'Star'), Dis(PCAlt('b'))))),
        'a{3}': PatDis(QPCAlt('a', 'Fixed', false, 3)),
        'a{1,}': PatDis(QPCAlt('a', 'LowerBound', false, 1)),
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
            print("... key:      " + key);
            print("    expected: " + expected);
            print("    actual:   " + actual);
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
            print("PASSED: " + uneval(pattern));
        } catch (e) {
            print("... pattern: " + uneval(pattern));
        }
    }
    print('Finished tests.');
}
