var cdlre = (function(cdlre) {
    var extend = cdlre.extend,
        assert = cdlre.assert;

    // Set(a, b, c, ...) makes a set keyed on |toString| values.
    function Set(items) {
        // Should be used like a constructor.
        assert(this instanceof Set);

        this._map = {};
        for (var i = 0; i < items.length; ++i)
            this._map[items[i]] = null;
        this._length = items.length;
    }

    Set.prototype.length = function Set__length() {
        return this._length;
    };

    Set.prototype.pop = function() {
        var self = this;
        if (self.length() === 0)
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
        var pieces = ['Set('];
        var saw = false;
        for (var key in this._map) {
            if (!this._map.hasOwnProperty(key))
                continue;
            saw = true;
            pieces.push(uneval(key), ', ');
        }
        if (saw)
            pieces.pop();
        pieces.push(')')
        return pieces.join('');
    };

    function SetUnion(set1, set2) {
        return {
            has: function(val) { return set1.has(val) || set2.has(val); },
            toString: function() { return 'SetUnion(' + set1 + ', ' + set2 + ')'; }
        };
    };

    function SetDifference(set1, set2) {
        return {
            has: function(val) { return set1.has(val) && !set2.has(val); },
            toString: function() { return 'SetDifference(' + set1 + ', ' + set2 + ')'; }
        };
    };

    return extend(cdlre, {
        Set: Set,
        SetUnion: SetUnion,
        SetDifference: SetDifference,
    });
})(cdlre);
