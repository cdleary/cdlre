function assert(cond, msg) {
    if (cond)
        return;
    throw new Error("Assertion failure" + (msg ? (": " + msg) : ''));
}
