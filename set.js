/* Set(a, b, c, ...) makes a set keyed on |toString| values. */
function Set() {
    if (!(this instanceof Set))
        return new Set(arguments);
    var items = arguments[0];
    this._map = {};
    for (var i = 0; i < items.length; ++i)
        this._map[items[i]] = null;
}

Set.prototype.has = function(item) {
    return item in this._map;
};

Set.prototype.toString = function() {
    return 'Set(' + Object.keys(this._map).map(function(item) {
        return uneval(item);
    }).join(", ") + ')';
};

var SetUnion = function(set1, set2) {
    return {
        has: function(val) { return set1.has(val) || set2.has(val); },
        toString: function() { return 'SetUnion(' + set1 + ', ' + set2 + ')' }
    };
};
