/* Set(a, b, c, ...) makes a set keyed on |toString| values. */
function Set() {
    var self = this;
    if (!(self instanceof Set))
        return new Set(arguments);
    var items = arguments[0];
    self._map = {};
    for (var i = 0; i < items.length; ++i)
        self._map[items[i]] = null;
    self._length = items.length;
    Object.defineProperty(self, 'length', {get: function() { return self._length; }});
}

Set.prototype.pop = function() {
    var self = this;
    if (!self._length)
        throw new Error("Empty set");
    var result;
    for (var key in self._map) {
        if (!self._map.hasOwnProperty(key))
            continue;
        result = key;
        delete self._map[key];
        break;
    }
    self._length -= 1;
    return result;
};

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
