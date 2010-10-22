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
        switch (typeof obj) {
          case 'string': return '"' + obj + '"';
          case 'number': return obj.toString();
          case 'boolean': return obj.toString();
          case 'undefined': return 'undefined';
        }
        throw new Error("NYI: " + typeof obj);
    };
}

var BACKSLASH = '\\';
var parserLog = new Logger('Parser');

function ord(c) { return c.charCodeAt(0); }
function chr(n) { return String.fromCharCode(n); }

function Scanner(pattern) {
    var log = new Logger("Scanner");
    var index = 0;
    var cc0 = ord('0');
    var cc9 = ord('9');
    var nCapturingParens = 0;

    var isDigit = function(c) {
        var ccc = ord(c);
        return cc0 <= ccc && ccc <= cc9;
    };

    /** Convert a digit character to its numerical form. */
    var toDigit = function(c) {
        var ccc = ord(c);
        if (cc0 <= ccc && ccc <= cc9)
            return ccc - cc0;
        throw new Error("Non-digit character: " + c);
    };

    var self = {
        nextCapturingNumber: function() { return ++nCapturingParens; },
        capturingParenCount: function() { return nCapturingParens; },
        tryPop: function() {
            if (this.hasLookAhead.apply(this, arguments)) {
                index += arguments.length;
                return true;
            }
            return false;
        },
        hasLookAhead: function() {
            for (var i = 0; i < arguments.length; ++i) {
                var targetChar = arguments[i];
                if (targetChar.length !== 1)
                    throw new Error('Bad target character value: ' + targetChar);
                if (pattern[index + i] !== targetChar) {
                    log.debug("Failed lookahead; length: " + arguments.length
                              + "; target char: " + uneval(targetChar));
                    return false;
                }
            }
            return true;
        },
        popOrSyntaxError: function(c, msg) {
            if (pattern[index] === c) {
                index += 1;
                return;
            }
            throw new SyntaxError(msg + ': ' + uneval(self.rest));
        },
        pop: function() {
            if (index === pattern.length)
                throw new Error("Popping past end of input");
            log.debug("pop: " + uneval(pattern[index]));
            return pattern[index++];
        },
        /** Note: assumes that a digit may not be the lookahead. */
        popDecimalIntegerLiteral: function() {
            if (!isDigit(pattern[index]))
                return;
            if (pattern[index] === '0' && isDigit(pattern[index + 1]))
                return;
            var accum = 0;
            while (isDigit(pattern[index]))
                accum = accum * 10 + toDigit(pattern[index++]);
            return accum;
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
            this.pop();
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
        SyntaxError: function(msg) {
            return new SyntaxError(msg + "; rest: " + uneval(self.rest));
        },
        assert: function(cond, msg) {
            if (cond)
                return;
            if (msg)
                log.error(msg);
            throw new Error("Assertion failure" + (msg ? ": " + msg : ''));
        },
    };

    Object.defineProperty(self, 'next', {get: function() { return pattern[index]; }});
    Object.defineProperty(self, 'length', {get: function() { return pattern.length - index; }});
    Object.defineProperty(self, 'rest', {get: function() { return pattern.substr(index); }});
    return self;
}

var Assertion = (function() {
    var kinds = Set('BeginningOfLine', 'EndOfLine', 'WordBoundary', 'NotWordBoundary',
                    'ZeroWidthPositive', 'ZeroWidthNegative');

    function Assertion(kind, disjunction) {
        if (!kinds.has(kind))
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

    return {
        BOL: Assertion('BeginningOfLine'),
        EOL: Assertion('EndOfLine'),
        WB: Assertion('WordBoundary'),
        NWB: Assertion('NotWordBoundary'),
        ZeroWidthPositive: Assertion.bind(null, 'ZeroWidthPositive'),
        ZeroWidthNegative: Assertion.bind(null, 'ZeroWidthNegative'),
    };
})();

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

var Quantifier = (function() {
    function QuantifierPrefix(kind, value) {
        var kinds = Set('Star', 'Plus', 'Question', 'Fixed', 'LowerBound', 'Range');
        if (!kinds.has(kind))
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

    return {
        Star: function(lazy) { return Quantifier(QuantifierPrefix.STAR, lazy); },
        Plus: function(lazy) { return Quantifier(QuantifierPrefix.PLUS, lazy); },
        Question: function(lazy) { return Quantifier(QuantifierPrefix.QUESTION, lazy); },
        Fixed: function(lazy, value) {
            if (typeof value !== 'number')
                throw new Error("Bad fixed value: " + value);
            return Quantifier(QuantifierPrefix('Fixed', value), lazy);
        },
        Range: function(lazy, value) {
            if (value.length !== 2)
                throw new Error("Bad range value: " + value);
            return Quantifier(QuantifierPrefix('Range', value), lazy);
        },
        LowerBound: function(lazy, value) {
            if (typeof value !== 'number')
                throw new Error("Bad lower bound value: " + value);
            return Quantifier(QuantifierPrefix('LowerBound', value), lazy);
        }
    };
})();

var AtomEscape = (function() {
    function CharacterClassEscape(kind) {
        var kinds = Set('Word', 'NotWord', 'Digit', 'NotDigit', 'Space', 'NotSpace');
        if (!kinds.has(kind))
            throw new Error("Bad character class escape kind: " + kind);

        return {
            nodeType: 'CharacterClassEscape',
            kind: kind,
            toString: function() {
                return this.nodeType + '(kind=' + uneval(this.kind) + ')';
            },
        };
    }

    CharacterClassEscape.WORD = CharacterClassEscape('Word');

    function AtomEscape(decimalEscape, characterEscape, characterClassEscape) {
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

    return {
        CharacterClassEscape: {
            DIGIT: AtomEscape(undefined, undefined, CharacterClassEscape('Digit')),
            NOT_DIGIT: AtomEscape(undefined, undefined, CharacterClassEscape('NotDigit')),
            SPACE: AtomEscape(undefined, undefined, CharacterClassEscape('Space')),
            NOT_SPACE: AtomEscape(undefined, undefined, CharacterClassEscape('NotSpace')),
            WORD: AtomEscape(undefined, undefined, CharacterClassEscape('Word')),
            NOT_WORD: AtomEscape(undefined, undefined, CharacterClassEscape('NotWord')),
        },
    };
})();

var ClassAtomNoDash = (function() {
    var kinds = Set('ClassEscape', 'SourceCharacter');

    function ClassAtomNoDash(kind, value) {
        if (!kinds.has(kind))
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

    return {
        ClassEscape: function(ce) { return ClassAtomNoDash('ClassEscape', ce); },
        SourceCharacter: function(c) { return ClassAtomNoDash('SourceCharacter', c); }
    };
})();

var ClassAtom = (function() {
    var kinds = Set('Dash', 'NoDash');

    function ClassAtom(kind, value) {
        if (!kinds.has(kind))
            throw new Error("Bad kind for class atom: " + kind);
        if (kind === 'NoDash' && value.nodeType !== 'ClassAtomNoDash')
            throw new Error("Unexpected value for non-dash ClassAtom: " + value);

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

    return {
        DASH: ClassAtom('Dash'),
        NoDash: function(value) { return ClassAtom('NoDash', value); },
    };
})();

var NonemptyClassRangesNoDash = (function() {
    var kinds = Set('ClassAtom', 'Dashed', 'NotDashed');

    function NonemptyClassRangesNoDash(kind, classAtom, value) {
        if (!kinds.has(kind))
            throw new Error("Bad NonemptyClassRangesNoDash kind: " + kind);

        if (classAtom.nodeType !== (kind === 'ClassAtom' ? 'ClassAtom' : 'ClassAtomNoDash'))
            throw new Error('Bad class atom value for NonemptyClassRangesNoDash: kind: '
                            + uneval(kind) + '; class atom: ' + classAtom);

        return {
            nodeType: 'NonemptyClassRangesNoDash',
            kind: kind,
            classAtom: classAtom,
            value: value,
        };
    }

    return {
        ClassAtom: function(classAtom) {
            return NonemptyClassRangesNoDash('ClassAtom', classAtom);
        },
        Dashed: function(classAtom, otherClassAtom, classRanges) {
            return NonemptyClassRangesNoDash('Dashed', classAtom, [otherClassAtom, classRanges]);
        },
        NotDashed: function(classAtom, nonEmptyClassRangesNoDash) {
            return NonemptyClassRangesNoDash('NotDashed', classAtom, nonEmptyClassRangesNoDash);
        }
    };
})();

var NonemptyClassRanges = (function() {
    var kinds = Set('Dash', 'NoDash');

    function NonemptyClassRanges(kind, classAtom, value) {
        if (!kinds.has(kind))
            throw new Error("Bad non-empty class ranges kind: " + kind);

        return {
            nodeType: 'NonemptyClassRanges',
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

    return {
        Dashed: function(classAtom, otherClassAtom, classRanges) {
            return NonemptyClassRanges('Dash', classAtom, [otherClassAtom, classRanges]);
        },
        NotDashed: function(classAtom, nonEmptyClassRangesNoDash) {
            return NonemptyClassRanges('NoDash', classAtom, nonEmptyClassRangesNoDash);
        }
    };
})();

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

CharacterClass.Empty = function(inverted) {
    return CharacterClass(ClassRanges.EMPTY, inverted);
};

var Atom = (function() {
    var kinds = Set('PatternCharacter', 'Dot', 'AtomEscape', 'CharacterClass',
                    'CapturingGroup', 'NonCapturingGroup');

    function Atom(kind, value) {
        if (!kinds.has(kind))
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

    return {
        DOT: Atom('Dot', null),
        CapturingGroup: function(dis) { return Atom('CapturingGroup', dis); },
        NonCapturingGroup: function(dis) { return Atom('NonCapturingGroup', dis); },
        CharacterClass: function(cc) { return Atom('CharacterClass', cc); },
        PatternCharacter: function() {
            return Atom('PatternCharacter', PatternCharacter.apply(null, arguments));
        },
        CharacterClassEscape: {
            WORD: Atom('AtomEscape', AtomEscape.CharacterClassEscape.WORD),
        },
        AtomEscape: function(ae) { return Atom('AtomEscape', ae); },
    };
})();

var Term = (function() {
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
                if (this.assertion)
                    return "Term.wrapAssertion(" + this.assertion + ")";
                return (this.nodeType + "(assertion=" + this.assertion + ", atom=" +
                        this.atom + ", quantifier=" + this.quantifier + ")");
            },
        };
    }

    return {
        wrapAtom: function(atom, quantifier) { return Term(null, atom, quantifier); },
        wrapAssertion: function(assertion) { return Term(assertion, null, null); }
    };
})();

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

function Pattern(disjunction) {
    return {
        nodeType: 'Pattern',
        disjunction: disjunction,
        toString: function() {
            return this.nodeType + "(disjunction=" + this.disjunction + ")";
        },
    };
}

/********************
 * Parsing routines *
 ********************/

/*
 * Note that some of the recursive descent parsing routines are "fallible",
 * meaning that they return |undefined| if they do not see a lookahead
 * character that would trigger their production. This is stylistic:
 * in some cases, it's just nicer than the alternative approach.
 *
 * The alternative approach is to define the valid lookahead set for each production
 * external to the production body itself and having the parent production
 * check before invoking.
 */

/**
 * Assertion ::= "^"
 *             | "$"
 *             | "\" "b"
 *             | "\" "B"
 *             | "(" "?" "=" Disjunction ")"
 *             | "(" "?" "!" Disjunction ")"
 * Fallible.
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
    if (scanner.tryPop('(', '?', '=')) {
        var dis = parseDisjunction(scanner);
        scanner.assert(dis);
        scanner.popOrSyntaxError(')', 'Expected closing paren at end of assertion group');
        return Assertion.ZeroWidthPositive(dis);
    }

    if (scanner.tryPop('(', '?', '!')) {
        var dis = parseDisjunction(scanner);
        scanner.assert(dis);
        scanner.popOrSyntaxError(')', 'Expected closing paren at end of assertion group');
        return Assertion.ZeroWidthNegative(dis);
    }
}

/**
 * Quantifier ::= QuantifierPrefix
 *              | QuantifierPrefix "?"
 * QuantifierPrefix ::= "*"
 *                    | "+"
 *                    | "?"
 *                    | "{" DecimalDigits "}"
 *                    | "{" DecimalDigits "," "}"
 *                    | "{" DecimalDigits "," DecimalDigits "}"
 * Fallible.
 */
function parseQuantifier(scanner) {
    var result;
    switch (scanner.next) {
      case '*': result = Quantifier.Star(); break;
      case '+': result = Quantifier.Plus(); break;
      case '?': result = Quantifier.Question(); break;
      case '{':
        scanner.pop();
        var firstDigits = scanner.popDecimalDigits();
        if (firstDigits === undefined)
            throw scanner.SyntaxError('Digits required within numerical quantifier');

        if (!scanner.tryPop(',')) {
            scanner.popOrSyntaxError('}', 'Expected closing brace on quantifier prefix');
            return Quantifier.Fixed(scanner.tryPop('?'), firstDigits);
        }

        /* If we get here, we popped a comma! */
        if (scanner.tryPop('}'))
            return Quantifier.LowerBound(scanner.tryPop('?'), firstDigits);

        var secondDigits = scanner.popDecimalDigits();
        scanner.assert(secondDigits !== undefined);
        scanner.popOrSyntaxError('}', 'Missing closing brace on ranged quantifier');
        var result = Quantifier.Range(scanner.tryPop('?'), [firstDigits, secondDigits]);
        return result;

      default:
        return;
    }
    scanner.pop();
    if (scanner.tryPop('?'))
        result.lazy = true;
    return result;
}

/**
 * AtomEscape ::= DecimalEscape
 *              | CharacterClassEscape
 *              | CharacterEscape
 *
 * @note Backslash character has already been popped of the scanner.
 */
function parseAtomEscape(scanner) {
    var dec = scanner.popDecimalIntegerLiteral();
    if (dec !== undefined)
        return AtomEscape.DecimalEscape(dec);

    /* CharacterClassEscape */
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

    /* CharacterEscape */
}

/**
 * ClassEscape ::= DecimalEscape
 *               | "b"
 *               | CharacterEscape
 *               | CharacterClassEscape
 */
function parseClassEscape(scanner) {
    if (scanner.tryPop('b')) // Interesting: backspace character!
        return ClassEscape.BACKSPACE;
    throw new Error("NYI: class escapes");
}

/**
 * ClassAtomNoDash ::= SourceCharacter but not one of "\" or "]" or "-"
 *                   | "\" ClassEscape
 */
function parseClassAtomNoDash(scanner) {
    parserLog.debug('parsing ClassAtomNoDash; rest: ' + uneval(scanner.rest));
    if (scanner.tryPop(BACKSLASH))
        return ClassAtomNoDash.ClassEscape(parseClassEscape(scanner));
    if (Set(BACKSLASH, ']', '-').has(scanner.next))
        throw scanner.SyntaxError('Invalid ClassAtomNoDash source character');

    parserLog.debug("Popping class-atom source-character: " + uneval(scanner.next));
    return ClassAtomNoDash.SourceCharacter(scanner.pop());
}

/**
 * ClassAtom ::= ClassAtomNoDash
 *             | "-"
 */
function parseClassAtom(scanner) {
    parserLog.debug('parsing ClassAtom; rest: ' + uneval(scanner.rest));

    if (scanner.tryPop('-'))
        return ClassAtom.DASH;

    return ClassAtom.NoDash(parseClassAtomNoDash(scanner));
}

/*
 * NonemptyClassRangesNoDash ::= ClassAtom
 *                             | ClassAtomNoDash NonemptyClassRangesNoDash
 *                             | ClassAtomNoDash "-" ClassAtom ClassRanges
 */
function parseNonemptyClassRangesNoDash(scanner) {
    parserLog.debug('parsing NonemptyClassRangesNoDash; rest: ' + uneval(scanner.rest));

    /* When lookahead is a dash, we're forced to use the ClassAtom expansion. */
    if (scanner.next === '-') {
        var classAtom = parseClassAtom(scanner);
        parserLog.debug('parsing NonemptyClassRangesNoDash; got ClassAtom; rest: '
                        + uneval(scanner.rest));
        return NonemptyClassRangesNoDash.ClassAtom(classAtom);
    }

    var cand = parseClassAtomNoDash(scanner);

    /* When follow is not a valid character, we're forced to use the ClassAtom expansion. */
    if (scanner.next === ']')
        return NonemptyClassRangesNoDash.ClassAtom(ClassAtom.NoDash(cand));

    parserLog.debug('parsing NonemptyClassRangesNoDash; got ClassAtomNoDash; rest: '
                    + uneval(scanner.rest));

    if (scanner.tryPop('-')) {
        return NonemptyClassRangesNoDash.Dashed(cand,
                                                parseClassAtom(scanner),
                                                parseClassRanges(scanner));
    }

    return NonemptyClassRangesNoDash.NotDashed(cand,
                                               parseNonemptyClassRangesNoDash(scanner));
}

/*
 * NonemptyClassRanges ::= ClassAtom
 *                       | ClassAtom NonemptyClassRangesNoDash
 *                       | ClassAtom - ClassAtom ClassRanges
 * @note    The ClassAtom production gets left-factored, so the closing bracket
 *          is part of the FOLLOW set to check for this production to end.
 */
function parseNonemptyClassRanges(scanner) {
    parserLog.debug('parsing NonemptyClassRanges; rest: ' + uneval(scanner.rest));
    var classAtom = parseClassAtom(scanner);
    parserLog.debug('parsing NonemptyClassRanges; got ClassAtom; rest: ' + uneval(scanner.rest));
    if (scanner.next === ']')
        return NonemptyClassRanges.NotDashed(classAtom);
    if (scanner.tryPop('-')) {
        return NonemptyClassRanges.Dashed(classAtom,
                                          parseClassAtom(scanner),
                                          parseClassRanges(scanner));
    }
    return NonemptyClassRanges.NotDashed(classAtom, parseNonemptyClassRangesNoDash(scanner));
}

/**
 * ClassRanges ::= NonemptyClassRanges
 *               | ε
 */
function parseClassRanges(scanner) {
    parserLog.debug('parsing ClassRanges; rest: ' + uneval(scanner.rest));
    if (scanner.next === ']')
        return ClassRanges.EMPTY;
    return ClassRanges(parseNonemptyClassRanges(scanner));
}

/**
 * CharacterClass ::= [ [lookahead ∉ {"^"}] ClassRanges ]
 *                  | [ "^" ClassRanges ]
 */
function parseCharacterClass(scanner) {
    parserLog.debug('parsing CharacterClass; rest: ' + uneval(scanner.rest));
    var inverted = scanner.tryPop('^');
    // Interesting: [^] is a negation of the empty class range (grammatically permitted).
    var classRanges = parseClassRanges(scanner);
    parserLog.debug('parsing CharacterClass; got ClassRanges; rest: ' + uneval(scanner.rest));
    var result = CharacterClass(classRanges, inverted);
    scanner.popOrSyntaxError(']', 'Missing closing bracket on character class');
    return result;
}

/**
 * Atom ::= PatternCharacter
 *        | "."
 *        | "\" AtomEscape
 *        | CharacterClass
 *        | "(" Disjunction ")"
 *        | "(" "?" ":" Disjunction ")"
 */
function parseAtom(scanner) {
    parserLog.debug('parsing Atom; rest: ' + uneval(scanner.rest));

    if (scanner.tryPop('['))
        return Atom.CharacterClass(parseCharacterClass(scanner));

    if (scanner.tryPop('.'))
        return Atom.DOT;

    if (scanner.tryPop(BACKSLASH))
        return Atom.AtomEscape(parseAtomEscape(scanner));

    if (scanner.tryPop('(')) {
        var result;
        if (scanner.tryPop('?', ':')) {
            parserLog.debug('Atom :: "(" "?" ":" Disjunction ")"');
            result = Atom.NonCapturingGroup(parseDisjunction(scanner));
        } else {
            parserLog.debug('Atom :: "(" Disjunction ")"');
            var number = scanner.nextCapturingNumber();
            result = Atom.CapturingGroup(parseDisjunction(scanner));
            result.capturingNumber = number;
        }
        if (!result)
            throw scanner.SyntaxError("Capturing group required");
        scanner.popOrSyntaxError(')', 'Missing closing parenthesis on group');
        return result;
    }

    if (PatternCharacter.BAD.has(scanner.next))
        throw scanner.SyntaxError('Bad pattern character');

    parserLog.debug('Atom :: PatternCharacter');
    return Atom.PatternCharacter(scanner.pop());
}

/**
 * Term ::= Assertion
 *        | Atom
 *        | Atom Quantifier
 */
function parseTerm(scanner) {
    parserLog.debug('parsing Term; rest: ' + uneval(scanner.rest));
    if (!(scanner instanceof Object))
        throw new Error('Bad scanner value: ' + scanner);
    var assertion = parseAssertion(scanner);
    if (assertion)
        return Term.wrapAssertion(assertion);
    var atom = parseAtom(scanner);
    scanner.assert(atom);
    var quantifier = parseQuantifier(scanner);
    return Term.wrapAtom(atom, quantifier);
}

/**
 * Alternative ::= Term Alternative
 *               | ε
 */
function parseAlternative(scanner) {
    parserLog.debug('parsing Alternative; rest: ' + uneval(scanner.rest));
    if (!(scanner instanceof Object))
        throw new Error('Bad scanner value: ' + scanner);
    if (scanner.length === 0 || parseAlternative.BAD_START.has(scanner.next)) {
        parserLog.debug('Alternative :: ε');
        return Alternative.EMPTY;
    }
    parserLog.debug('Alternative :: Term Alternative');
    var term = parseTerm(scanner);
    scanner.assert(term);
    var alternative = parseAlternative(scanner) || Alternative.EMPTY;
    return Alternative(term, alternative);
}

/**
 * Because the Alternative production can resolve to the empty string,
 * we detect whether the lookahead character is a member of
 * FIRST(Alternative) eagerly.
 *
 * This set represents the inverse of FIRST(Alternative), which tells us
 * whether Alternative should resolve to the empty production expansion.
 * This set is derived from the FIRST sets of sub-productions of Alternative.
 */
parseAlternative.BAD_START = SetDifference(
    PatternCharacter.BAD,
    Set('.', BACKSLASH, '(', '[', '^', '$')
);

/**
 * Disjunction ::= Alternative
 *               | Alternative "|" Disjunction
 */
function parseDisjunction(scanner) {
    parserLog.debug('parsing Disjunction; rest: ' + uneval(scanner.rest));
    var lhs = parseAlternative(scanner);
    if (scanner.tryPop('|')) {
        parserLog.debug('Disjunction :: Alternative "|" Disjunction');
        return Disjunction(lhs, parseDisjunction(scanner));
    }
    parserLog.debug('Disjunction :: Alternative');
    return Disjunction(lhs);
}

function parse(scanner) {
    if (!(scanner instanceof Object))
        throw new Error('Bad scanner value: ' + scanner);
    var dis = parseDisjunction(scanner);
    if (scanner.length !== 0)
        throw new scanner.SyntaxError("Cruft at end of pattern");
    return Pattern(dis);
}

function makeAST(pattern) { return parse(Scanner(pattern)); }

/*********
 * Tests *
 *********/

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
        Zwn: function (dis, nextAlt) {
            return Alternative(Term.wrapAssertion(Assertion.ZeroWidthNegative(dis)), nextAlt);
        }
    },
    /** Character class range alternative. */
    CCRAlt: function(low, high, inverted) {
        return Alternative(Term.wrapAtom(Atom.CharacterClass(
            CharacterClass(
                ClassRanges(
                    NonemptyClassRanges.Dashed(
                        ClassAtom.NoDash(ClassAtomNoDash.SourceCharacter(low)),
                        ClassAtom.NoDash(ClassAtomNoDash.SourceCharacter(high)),
                        ClassRanges.EMPTY
                    )
                ),
                !!inverted
            )
        )));
    },
    NCGAlt: function(dis, nextAlt) {
        return Alternative(Term.wrapAtom(Atom.NonCapturingGroup(dis)), nextAlt);
    },
    CCAlt: function(chars, inverted) {
        var CASC = function(c) { return ClassAtom.NoDash(ClassAtomNoDash.SourceCharacter(c)); };
        if (chars.length === 0)
            return Alternative(Term.wrapAtom(Atom.CharacterClass(CharacterClass.Empty(inverted))));
        var necr = NonemptyClassRanges.NotDashed(CASC(chars[0]));
        var iterNECR = necr;
        for (var i = 1; i < chars.length; ++i) {
            /* The last NonemptyClassRangesNoDash has to be a class atom. */
            iterNECR.value = (i === chars.length - 1)
                ? NonemptyClassRangesNoDash.ClassAtom(CASC(chars[i]))
                : NonemptyClassRangesNoDash.NotDashed(CASC(chars[i]))
            iterNECR = iterNECR.value;
        }
        return Alternative(Term.wrapAtom(Atom.CharacterClass(
            CharacterClass(ClassRanges(necr), inverted)
        )));
    },
    CCEAlt: {
        WORD: Alternative(Term.wrapAtom(Atom.CharacterClassEscape.WORD)),
    },
    DOT_ALT: Alternative(Term.wrapAtom(Atom.DOT)),
};

function makeTestCases() {
    with (TestConstructors) {
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
            print("CAUGHT: " + e);
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
    print('START MAKING TEST CASES...');
    var cases = makeTestCases();
    print('DONE MAKING TEST CASES.');
    print('Beginning tests...');

    var testSuccess = function(pattern, expected) {
        var actual;
        try {
            actual = parse(Scanner(pattern));
            checkParseEquality(expected, actual);
            print("PASSED: " + new RegExp(pattern));
        } catch (e) {
            print("... exception: " + e);
            print("... pattern:   " + uneval(pattern));
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

    var testFailure = function(pattern, expected) {
        var actual;
        try {
            actual = parse(Scanner(pattern));
            print("FAILED TO RAISE: " + uneval(pattern));
        } catch (e) {
            if (e.constructor === expected.constructor)
                print("PASSED: " + uneval(pattern));
            else
                print("FAILED: wrong error");
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
    print('Finished tests.');
}
