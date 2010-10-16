var LogLevel = {
    ALL: 100,
    TRACE: 40,
    DEBUG: 30,
    INFO: 20,
    WARN: 10,
    NONE: 0,
};

var LOG_LEVEL = LogLevel.NONE;

function Logger(name) {
    this.name = name;
}

function Arrayify(args) {
    var accum = [];
    for (var i = 0; i < args.length; ++i)
        accum.push(args[i]);
    return accum;
};

(function createLogFunctions() {
    for (var level in LogLevel) {
        if (!LogLevel.hasOwnProperty(level) || level == 'ALL')
            continue;
        /* 
         * This function is necessary for block-like scoping.
         * (Because ECMA doesn't have a way to create a binding
         * scoped within a loop body.
         */
        (function createLogFunction(level) {
            Logger.prototype[level.toLowerCase()] = function() {
                if (LOG_LEVEL >= LogLevel[level])
                    print(this.name + ": " + level.toUpperCase() + ": "
                          + Arrayify(arguments).join(' '));
            };
        })(level);
    }
})();
