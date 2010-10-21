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

Set.prototype.each = function(callback) {
    for (var key in this._map) {
        if (!this._map.hasOwnProperty(key))
            continue;
        var result = callback(key);
        if (result) // Truthy value indicates early return, like "break".
            return;
    }
};

Set.prototype.toString = function() {
    return 'Set(' + Object.keys(this._map).map(function(item) {
        return uneval(item);
    }).join(", ") + ')';
};

var SetUnion = function(set1, set2) {
    return {
        has: function(val) { return set1.has(val) || set2.has(val); },
        toString: function() { return 'SetUnion(' + set1 + ', ' + set2 + ')'; }
    };
};

var SetDifference = function(set1, set2) {
    return {
        has: function(val) { return set1.has(val) && !set2.has(val); },
        toString: function() { return 'SetDifference(' + set1 + ', ' + set2 + ')'; }
    };
};
