/**
 * Parses regular expression patterns to ASTs.
 *
 * @note    Some of the identifiers in this code are heinous.
 *          I'm trying to follow the spec as closely as possible
 *          without being totally ridiculous, so you might want to read along
 *          with that.
 */

if (typeof uneval === 'undefined') {
    /* 
     * FIXME:   Care about this more when it actually runs in more than
     *          one browser...
     */
    uneval = function(obj) {
        if (typeof obj === 'string') {
            return '"' + obj + '"';
        }
        throw new Error("NYI");
    };
}

var BACKSLASH = '\\';
var parserLog = new Logger('Parser');

function ord(c) { return c.charCodeAt(0); }

function Scanner(pattern) {
    var index = 0;
    var cc0 = ord('0');
    var cc9 = ord('9');
    var toDigit = function(c) {
        var ccc = ord(c);
        // TODO: test corner case with leading zeros.
        if (cc0 <= ccc && ccc <= cc9)
            return ccc - cc0;
        throw new Error("Non-digit character: " + c);
    };
    var log = new Logger("Scanner");
    var self = {
        tryPop: function() {
            var indexBefore = index;
            for (var i = 0; i < arguments.length; ++i) {
                var targetChar = arguments[i];
                if (targetChar.length !== 1)
                    throw new Error('Bad target character value: ' + targetChar);
                var c = pattern[index + i];
                if (c !== targetChar) {
                    index = indexBefore;
                    return false;
                }
            }
            index += arguments.length;
            return true;
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
            log.debug("popLeft: " + pattern[index]);
            return pattern[index++];
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
    Object.defineProperty(self, 'rest', {
        get: function() { return pattern.substr(index); }
    });
    return self;
}

var Assertion = {
    KINDS: Set('BeginningOfLine', 'EndOfLine', 'WordBoundary', 'NotWordBoundary',
               'ZeroWidthPositive', 'ZeroWidthNegative'),
};

function _Assertion(kind, disjunction) {
    if (!Assertion.KINDS.has(kind))
        throw new Error("Bad assertion kind: " + uneval(kind));

    return {
        nodeType: 'Assertion',
        kind: kind,
        disjunction: disjunction,
        toString: function() {
            return this.nodeType + '(kind=' + uneval(this.kind)
                    + ', disjunction=' + this.disjunction + ')';
        },
    };
}

Assertion.BOL = _Assertion('BeginningOfLine');
Assertion.EOL = _Assertion('EndOfLine');
Assertion.WB = _Assertion('WordBoundary');
Assertion.NWB = _Assertion('NotWordBoundary');
Assertion.ZeroWidthPositive = _Assertion.bind('ZeroWidthPositive');
Assertion.ZeroWidthNegative = _Assertion.bind('ZeroWidthNegative');

/**
 * @return  An assertion on success, null on failure.
 * @post    The scanner will be advanced iff the parse is successful.
 */
function parseAssertion(scanner) {
    if (scanner.tryPop('^'))
        return Assertion.BOL;
    if (scanner.tryPop('$'))
        return Assertion.EOL;

    if (scanner.next === BACKSLASH) {
        if (scanner.tryPop(BACKSLASH, 'b'))
            return Assertion.WB;
        if (scanner.tryPop(BACKSLASH, 'B'))
            return Assertion.NWB;
        return; /* Character class or escaped source character. */
    }

    /* Assertion groups. */
    if (!scanner.tryPop('(', '?'))
        return;

    if (scanner.tryPop('='))
        return Assertion.ZeroWidthPositive(parseDisjunction(scanner));
    if (scanner.tryPop('!'))
        return Assertion.ZerWidthNegative(parseDisjunction(scanner));
    throw new SyntaxError('Invalid assertion start: ' + scanner.next);
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
    return Quantifier(QuantifierPrefix('LowerBound', value), lazy);
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
    if (scanner.tryPop('?'))
        result.lazy = true;
    return result;
}

function CharacterClassEscape(kind) {
    if (!CharacterClassEscape.KINDS.has(kind))
        throw new Error("Bad character class escape kind: " + kind);

    return {
        nodeType: 'CharacterClassEscape',
        kind: kind,
        toString: function() {
            return this.nodeType + '(kind=' + uneval(this.kind) + ')';
        },
    };
}

CharacterClassEscape.KINDS = Set('Word', 'NotWord', 'Digit', 'NotDigit',
                                 'Space', 'NotSpace');
CharacterClassEscape.WORD = CharacterClassEscape('Word');

function _AtomEscape(decimalEscape, characterEscape, characterClassEscape) {
    return {
        nodeType: "AtomEscape",
        decimalEscape: decimalEscape,
        characterEscape: characterEscape,
        characterClassEscape: characterClassEscape,
        toString: function() {
            return this.nodeType + "(decimalEscape=" + this.decimalEscape
                    + ", characterEscape=" + this.characterEscape
                    + ", characterClassEscape=" + this.characterClassEscape
                    + ")";
        },
    };
}

var AtomEscape = {
    CharacterClassEscape: {
        DIGIT: _AtomEscape(undefined, undefined, CharacterClassEscape('Digit')),
        NOT_DIGIT: _AtomEscape(undefined, undefined, CharacterClassEscape('NotDigit')),
        SPACE: _AtomEscape(undefined, undefined, CharacterClassEscape('Space')),
        NOT_SPACE: _AtomEscape(undefined, undefined, CharacterClassEscape('NotSpace')),
        WORD: _AtomEscape(undefined, undefined, CharacterClassEscape('Word')),
        NOT_WORD: _AtomEscape(undefined, undefined, CharacterClassEscape('NotWord')),
    },
};

/**
 * AtomEscape ::= DecimalEscape
 *              | CharacterEscape
 *              | CharacterClassEscape
 *
 * @note Backslash character has already been popped of the scanner.
 */
function parseAtomEscape(scanner) {
    if (scanner.tryPop('d'))
        return AtomEscape.CharacterClassEscape.DIGIT;
    if (scanner.tryPop('D'))
        return AtomEscape.CharacterClassEscape.NOT_DIGIT;
    if (scanner.tryPop('s'))
        return AtomEscape.CharacterClassEscape.SPACE;
    if (scanner.tryPop('S'))
        return AtomEscape.CharacterClassEscape.NOT_SPACE;
    if (scanner.tryPop('w'))
        return AtomEscape.CharacterClassEscape.WORD;
    if (scanner.tryPop('W'))
        return AtomEscape.CharacterClassEscape.NOT_WORD;

    throw new Error("NYI: other kinds of escapes");
}

function parseClassEscape(scanner) {
    if (scanner.tryPop('b')) // Interesting: backspace character!
        return ClassEscape.BACKSPACE;
    throw new Error("NYI: class escapes");
}

function _ClassAtomNoDash(kind, value) {
    if (!ClassAtomNoDash.KINDS.has(kind))
        throw new Error("Bad kind for ClassAtomNoDash: " + kind);

    return {
        nodeType: 'ClassAtomNoDash',
        kind: kind,
        value: value,
        toString: function() {
            return this.nodeType + '.' + this.kind + '(' + this.value + ')';
        }
    };
}

var ClassAtomNoDash = {KINDS: Set('ClassEscape', 'SourceCharacter')};

ClassAtomNoDash.ClassEscape = function(ce) { return _ClassAtomNoDash('ClassEscape', ce); };
ClassAtomNoDash.SourceCharacter = function(c) { return _ClassAtomNoDash('SourceCharacter', c); };

/**
 * ClassAtomNoDash ::= SourceCharacter but not one of \ or ] or -
 *                   | \ ClassEscape
 */
function parseClassAtomNoDash(scanner) {
    parserLog.info('parsing ClassAtomNoDash');
    if (scanner.tryPop(BACKSLASH))
        return ClassAtomNoDash.ClassEscape(parseClassEscape(scanner));
    if (Set(BACKSLASH, ']', '-').has(scanner.next))
        throw new SyntaxError('Invalid ClassAtomNoDash source character');

    return ClassAtomNoDash.SourceCharacter(scanner.popLeft());
}

function _ClassAtom(kind, value) {
    if (!ClassAtom.KINDS.has(kind))
        throw new Error("Bad kind for class atom: " + kind);

    return {
        nodeType: 'ClassAtom',
        kind: kind,
        value: value,
        toString: function() {
            if (this.kind === 'Dash') {
                if (this.value)
                    throw new Error("Should not have a value for the dash kind.");
                return this.nodeType + '.DASH';
            }
            return this.nodeType + '(' + this.value + ')';
        }
    };
}

var ClassAtom = {KINDS: Set('Dash', 'NoDash')};

ClassAtom.DASH = _ClassAtom('Dash');
ClassAtom.NoDash = function(value) { return _ClassAtom('NoDash', value); }


function parseClassAtom(scanner) {
    if (scanner.tryPop('-'))
        return ClassAtom.DASH;

    return ClassAtom.NoDash(parseClassAtomNoDash(scanner));
}

function _NonEmptyClassRanges(kind, classAtom, value) {
    if (!NonEmptyClassRanges.KINDS.has(kind))
        throw new Error("Bad non-empty class ranges kind: " + kind);

    return {
        nodeType: 'NonEmptyClassRanges',
        kind: kind,
        classAtom: classAtom,
        value: value,
        toString: function() {
            var result = this.nodeType + '.' + this.kind + '(classAtom='
                         + this.classAtom + ", ...)";
            return result;
        }
    };
}

function _NonEmptyClassRangesNoDash(kind, classAtom, value) {
    if (!NonemptyClassRangesNoDash.has(kind))
        throw new Error("Bad NonemptyClassRangesNoDash kind: " + kind);

    return {
        nodeType: 'NonEmptyClassRangesNoDash',
        kind: kind,
        classAtom: classAtom,
        value: value,
    };
}

var NonEmptyClassRangesNoDash = {
    KINDS: Set('ClassAtom', 'Dashed', 'NotDashed'),
};

NonEmptyClassRangesNoDash.ClassAtom = function(classAtom) {
    return _NonEmptyClassRangesNoDash('ClassAtom', classAtom);
}

NonEmptyClassRangesNoDash.Dashed = function(classAtom, otherClassAtom, classRanges) {
    return _NonEmptyClassRangesNoDash('Dashed', classAtom, [otherClassAtom, classRanges]);
}

NonEmptyClassRangesNoDash.NotDashed = function(classAtom, nonEmptyClassRangesNoDash) {
    return _NonEmptyClassRangesNoDash('NotDashed', classAtom, nonEmptyClassRangesNoDash);
}

/*
 * NonEmptyClassRangesNoDash ::= ClassAtom
 *                             | ClassAtomNoDash NonemptyClassRangesNoDash
 *                             | ClassAtomNoDash - ClassAtom ClassRanges
 */
function parseNonEmptyClassRangesNoDash(scanner) {
    var classAtomMaybeDash = parseClassAtom(scanner);
    if (classAtomMaybeDash.kind === 'ClassAtom')
        return NonEmptyClassRangesNoDash.ClassAtom(classAtomMaybeDash);
    if (scanner.tryPop('-')) {
        return NonEmptyClassRangesNoDash.Dashed(classAtomMaybeDash,
                                                parseClassAtom(scanner),
                                                parseClassRanges(scanner));
    }
    return NonEmptyClassRangesNoDash.NotDashed(classAtomMaybeDash,
                                               parseNonEmptyClassRangesNoDash(scanner));
}

var NonEmptyClassRanges = {
    KINDS: Set('Dash', 'NoDash'),
    Dashed: function(classAtom, otherClassAtom, classRanges) {
        return _NonEmptyClassRanges('Dash', classAtom, [otherClassAtom, classRanges]);
    },
    NotDashed: function(classAtom, nonEmptyClassRangesNoDash) {
        return _NonEmptyClassRanges('NoDash', classAtom, nonEmptyClassRangesNoDash);
    }
};

/*
 * NonEmptyClassRanges ::= ClassAtom
 *                       | ClassAtom NonemptyClassRangesNoDash
 *                       | ClassAtom - ClassAtom ClassRanges
 */
function parseNonEmptyClassRanges(scanner) {
    var classAtom = parseClassAtom(scanner);
    if (scanner.tryPop('-')) {
        return NonEmptyClassRanges.Dashed(classAtom,
                                          parseClassAtom(scanner),
                                          parseClassRanges(scanner));
    }
    return NonEmptyClassRanges.NotDashed(classAtom, parseNonEmptyClassRangesNoDash(scanner));
}

function ClassRanges(value) {
    return {
        nodeType: 'ClassRanges',
        value: value,
        toString: function() {
            if (!this.value)
                return 'ClassRanges.EMPTY';
            return 'ClassRanges(' + this.value + ')';
        },
    };
}

ClassRanges.EMPTY = ClassRanges();

/**
 * ClassRanges ::= [empty]
 *               | NonemptyClassRanges
 */
function parseClassRanges(scanner) {
    if (scanner.next === ']')
        return ClassRanges.EMPTY;
    return ClassRanges(parseNonEmptyClassRanges(scanner));
}

function CharacterClass(ranges, inverted) {
    return {
        nodeType: 'CharacterClass',
        ranges: ranges,
        inverted: inverted,
        toString: function() {
            return this.nodeType + '(ranges=' + this.ranges + ', inverted=' + this.inverted + ')';
        }
    };
}

/**
 * CharacterClass ::= [ [lookahead ∉ {^}] ClassRanges ]
 *                  | [ ^ ClassRanges ]
 */
function parseCharacterClass(scanner) {
    var inverted = scanner.tryPop('^');
    // Interesting: [^] is a negation of the empty class range (grammatically permitted).
    var classRanges = parseClassRanges(scanner);
    var result = CharacterClass(classRanges, inverted);
    scanner.popOrSyntaxError(']', 'Missing closing bracket on character class');
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
            if (Set('CapturingGroup', 'PatternCharacter').has(this.kind))
                return this.nodeType + '.' + this.kind + '(' + this.value + ')';
            if (this.kind === 'Dot')
                return this.nodeType + '.DOT';
            return this.nodeType + "(kind=" + uneval(this.kind)
                   + ", value=" + this.value + ")";
        }
    };
}

var Atom = { // Put a bag over the weird constructor's head.
    // Note, can't put anything in here that calls into |_Atom|.
    KINDS: Set('PatternCharacter', 'Dot', 'AtomEscape', 'CharacterClass',
               'CapturingGroup', 'NonCapturingGroup'),
};

Atom.DOT = _Atom('Dot', null);
Atom.CapturingGroup = function(dis) { return _Atom('CapturingGroup', dis); };
Atom.CharacterClass = function(cc) { return _Atom('CharacterClass', cc); }

Atom.PatternCharacter = function() {
    return _Atom('PatternCharacter', PatternCharacter.apply(null, arguments));
};

Atom.CharacterClassEscape = {
    WORD: _Atom('AtomEscape', AtomEscape.CharacterClassEscape.WORD),
};

function parseAtom(scanner) {
    if (scanner.tryPop('['))
        return Atom.CharacterClass(parseCharacterClass(scanner));

    if (scanner.tryPop('.'))
        return Atom.DOT;

    if (scanner.tryPop(BACKSLASH))
        return _Atom('AtomEscape', parseAtomEscape(scanner));

    if (scanner.tryPop('(')) {
        var result;
        if (scanner.tryPop('?', ':'))
            result = Atom.NonCapturingGroup(parseDisjunction(scanner));
        else
            result = Atom.CapturingGroup(parseDisjunction(scanner));
        if (!result)
            throw new SyntaxError("Capturing group required");
        scanner.popOrSyntaxError(')', 'Missing closing parenthesis on group');
        return result;
    }

    if (PatternCharacter.BAD.has(scanner.next))
        return;
    return Atom.PatternCharacter(scanner.popLeft());
}

function Term(assertion, atom, quantifier) {
    if (assertion && assertion.nodeType !== 'Assertion')
        throw new Error('Bad assertion value: ' + assertion);
    if (atom && atom.nodeType !== 'Atom')
        throw new Error('Bad atom value: ' + atom);
    if (quantifier && quantifier.nodeType !== 'Quantifier')
        throw new Error('Bad quantifier value: ' + quantifier);
    if (!assertion && !atom && !quantifier)
        throw new Error("Bad empty term");

    return {
        nodeType: "Term",
        assertion: assertion,
        atom: atom,
        quantifier: quantifier,
        toString: function() {
            if (this.atom && !this.quantifier)
                return "Term.wrapAtom(" + this.atom + ")";
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
    if (alternative && alternative.nodeType !== 'Alternative')
        throw new Error('Bad alternative value: ' + alternative);
    if (disjunction && disjunction.nodeType !== 'Disjunction')
        throw new Error('Bad disjunction value: ' + disjunction);

    return {
        nodeType: "Disjunction",
        alternative: alternative || Alternative.EMPTY,
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

function makeAST(pattern) { return parse(Scanner(pattern)); }

/* Tests */

var TestConstructors = {
    Dis: Disjunction,
    Alt: Alternative,
    PatDis: function() {
        return Pattern(Disjunction.apply(null, arguments));
    },
    /**
     * Create a capturing group alternative that wraps |dis|.
     */
    CGAlt: function(dis, nextAlt) {
        return Alternative(Term.wrapAtom(Atom.CapturingGroup(dis)), nextAlt);
    },
    /**
     * Create an alternative tree from a bunch of pattern characters in |str|.
     */
    PCAlt: function(str, nextAlt) {
        var TAPC = function(c) { return Term.wrapAtom(Atom.PatternCharacter(c)); }
        var result = null;
        for (var i = str.length - 1; i >=0; --i) {
            if (result)
                result = Alternative(TAPC(str[i]), result);
            else
                result = Alternative(TAPC(str[i]), nextAlt || Alternative.EMPTY);
        }
        return result;
    },
    /** Quantifier pattern character alternative. */
    QPCAlt: function(c, kind, lazy, quantVal, nextAlt) {
        if (nextAlt && nextAlt.nodeType !== 'Alternative')
            throw new Error("Bad next alternative: " + nextAlt);
        var QK = Quantifier[kind];
        if (!QK)
            throw new Error("Invalid quantifier kind: " + uneval(kind));
        return Alternative(
            Term.wrapAtom(Atom.PatternCharacter(c), QK(!!lazy, quantVal)),
            nextAlt
        );
    },
    AssAlt: {
        BOL: Alternative(Term.wrapAssertion(Assertion.BOL)),
        BOLConcat: function(nextAlt) {
            var result = Alternative(Term.wrapAssertion(Assertion.BOL));
            result.alternative = nextAlt;
            return result;
        },
        EOL: Alternative(Term.wrapAssertion(Assertion.EOL)),
    },
    /** Character class alternative. */
    CCAlt: function(low, high) {
        return Alternative(Term.wrapAtom(Atom.CharacterClass(
            CharacterClass(
                ClassRanges(
                    NonEmptyClassRanges.Dashed(
                        ClassAtom.NoDash(ClassAtomNoDash.SourceCharacter(low)),
                        ClassAtom.NoDash(ClassAtomNoDash.SourceCharacter(high)),
                        ClassRanges.EMPTY
                    )
                ),
                false
            )
        )));
    },
    CCEAlt: {
        WORD: Alternative(Term.wrapAtom(Atom.CharacterClassEscape.WORD)),
    },
    DOT_ALT: Alternative(Term.wrapAtom(Atom.DOT)),
};

function makeTestCases() {
    with (TestConstructors) {
        var disabled = {
        };
        return {
            /* Flat pattern. */
            'ab': PatDis(PCAlt('ab')),
            /* Alternation */
            'a|b': PatDis(
                PCAlt('a'),
                Dis(PCAlt('b'))
            ),
            /* Quantifiers. */
            'a*': PatDis(QPCAlt('a', 'Star')),
            'a+?': PatDis(QPCAlt('a', 'Plus', true)),
            'a??': PatDis(QPCAlt('a', 'Question', true)),
            'a+b': PatDis(QPCAlt('a', 'Plus', false, undefined, PCAlt('b'))),
            'a{3}': PatDis(QPCAlt('a', 'Fixed', false, 3)),
            'a{1,}': PatDis(QPCAlt('a', 'LowerBound', false, 1)),
            /* Capturing groups and alternation. */
            '(a)': PatDis(CGAlt(Dis(PCAlt('a')))),
            '((b))': PatDis(CGAlt(Dis(CGAlt(Dis(PCAlt('b')))))),
            '(|abc)': PatDis(CGAlt(Dis(Alt.EMPTY, Dis(PCAlt('abc'))))),
            /* Simple assertions. */
            '^abc': PatDis(AssAlt.BOLConcat(PCAlt('abc'))),
            'def$': PatDis(PCAlt('def', AssAlt.EOL)),
            '^abcdef$': PatDis(AssAlt.BOLConcat(PCAlt('abcdef', AssAlt.EOL))),
            /* Builtin character classes. */
            '\\w': PatDis(CCEAlt.WORD),
            '[a-c]': PatDis(CCAlt('a', 'c')),
            /* Grouping assertions. */
            //'ca(?!t)\\w': PatDis(PCAlt

            '(a*|b)': PatDis(CGAlt(Dis(QPCAlt('a', 'Star'), Dis(PCAlt('b'))))),
            'f(.)z': PatDis(PCAlt('f', CGAlt(Dis(DOT_ALT), PCAlt('z')))),
        };
    }
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

function pformat(v) {
    var s = v.toString();
    var indent = 0;
    var s = s.replace(/(\(|\)|,\s*)/g, function(tok) {
        tok = tok[0];
        if (tok === '(') {
            indent += 1;
        }
        if (tok === ')') {
            indent -= 1;
            return ')';
        }
        var accum = [];
        for (var i = 0; i < indent; ++i)
            accum.push('  ');
        return tok + '\n' + accum.join('');
    });
    return s;
}

function juxtapose(block1, block2, columnWidth) {
    var accum = [];
    var lb1 = block1.split('\n');
    var lb2 = block2.split('\n');
    for (var i = 0; i < Math.max(lb1.length, lb2.length); ++i) {
        /* Is there no fast way to pad these things? */
        var line1 = lb1[i] || '';
        while (line1.length < columnWidth)
            line1 = line1 + ' ';
        var line2 = lb2[i] || '';
        accum.push(line1 + '    ' + line2);
    }
    return accum.join('\n')
}

function pprint(v) { print(pformat(v)); }

function testParser() {
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
            var colWidth = 50;
            print(juxtapose('Expected', 'Actual', colWidth));
            print(juxtapose('========', '======', colWidth));
            print(juxtapose(pformat(expected), pformat(actual), colWidth));
        }
    }
    print('Finished tests.');
}
