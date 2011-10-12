/**
 * A *very* limited Unicode support library. :-)
 *
 * Note that this is not the best way to do this -- to optimize you would just
 * make a bitmap of code points that are members of the set and use index
 * into a string as a binary bitmap, which (I would assume) wouldn't compress well.
 * This just seemed like more fun.
 */

var Unicode = (function() {
    var singletonCategorySet;

    function CategorySet() {
        var expectedArgs = ['Mn', 'Mc', 'Nd', 'Pc', 'Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl'];
        for (var i = 0; i < expectedArgs.length; ++i) {
            if (expectedArgs[i] !== arguments[i])
                throw new Error("Unsupported category set");
        }
        if (arguments.length !== expectedArgs.length)
            throw new Error("Unexpected category set");

        if (singletonCategorySet)
            return singletonCategorySet;

        singletonCategorySet = {
            has: function(c) {
                if (c.length !== 1)
                    throw new Error("Bad character value: " + c);
                var cc = c.charCodeAt(0);
                var index = cc / 16;
                var bit = cc % 16;
                return !!(encIdentityEscape[index] & (1 << bit));
            }
        };
        return singletonCategorySet;
    }

    return {
        CategorySet: CategorySet,
    };
})();
