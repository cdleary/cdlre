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

        var memberStr = LZW.decompress(LZW.decode(encLZWIdentityEscape));
        singletonCategorySet = {
            has: function(c) { return memberStr.indexOf(c) !== -1; }
        };
        return singletonCategorySet;
    }

    return {
        CategorySet: CategorySet,
    };
})();
