


if (!Function.prototype.construct) {
    Function.prototype.construct = function() {
        var bound = this.bind(this, [null].concat(arguments));
        return new bound();
    };
}


function parseAlternative(pattern) {
    if (pattern.length === 0)
        return Alternative.Empty;
    throw new Error();
}


function parseDisjunction(pattern) {
    var lhs = parseAlternative();
    if (pattern[0] === '|')
        return new Disjunction(lhs, parseDisjunction(pattern.substr(1)));
    return new Disjunction(lhs);
}

function parse(pattern) {
    return new Pattern(parseDisjunction(pattern));
}


function makeTestCases() {
    var Dis = Disjunction.construct;
    var Alt = Alternate.construct;
    var PatDis = function() { return new Pattern(Disjunction.construct.apply(arguments)); };
    var PCAlt = function(str) {
        var TAPC = function(c) { return new Term(new Atom(new PatternCharacter(c))); }
        var result = null;
        for (var i = 0; i < str.length; ++i) {
            if (result)
                result = new Alternative(result, TAPC(str[i]));
            else
                result = new Alternative(Alternative.Empty, TAPC(str[i]));
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
