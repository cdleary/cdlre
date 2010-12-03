function Logger(name, level) {
    this.name = name;
    this.logLevel = level === undefined ? Logger.defaultLevel : level;
}

Logger.levels = {
    ALL: 100,
    TRACE: 40,
    DEBUG: 30,
    INFO: 20,
    WARN: 10,
    NONE: -1,
};

Logger.defaultLevel = Logger.levels.NONE;
 
function Arrayify(args) {
    var accum = [];
    for (var i = 0; i < args.length; ++i)
        accum.push(args[i]);
    return accum;
};

(function createLogFunctions() {
    for (var level in Logger.levels) {
        if (!Logger.levels.hasOwnProperty(level) || level == 'ALL')
            continue;

        /* 
         * This function is necessary for block-like scoping.
         * (Because ECMA doesn't have a way to create a binding
         * scoped within a loop body.
         */
        (function createLogFunction(level) {
            Logger.prototype[level.toLowerCase()] = function() {
                if (this.logLevel >= Logger.levels[level])
                    print(this.name + ": " + level.toUpperCase() + ": "
                          + Arrayify(arguments).join(' '));
            };
        })(level);
    }
})();
