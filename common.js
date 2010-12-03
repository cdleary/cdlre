if (typeof uneval === 'undefined') {
    /* 
     * FIXME:   Care about this more when it actually runs in more than
     *          one browser...
     */
    uneval = function(obj) {
        if (obj instanceof RegExp) {
            return obj.toString();
        }
        switch (typeof obj) {
          case 'string': return '"' + obj + '"';
          case 'number': return obj.toString();
          case 'boolean': return obj.toString();
          case 'undefined': return 'undefined';
          case 'function': return '<function>';
        }
        throw new Error("NYI: " + typeof obj);
    };
}

function assert(cond, msg) {
    if (cond)
        return;
    throw new Error("Assertion failure" + (msg !== undefined ? (": " + msg) : ''));
}
