(function main(regexp_str, input_str) {
    print(uneval(regexp_str), uneval(input_str));
    var re = eval(regexp_str);

    var hostedRe = cdlre.fromHostRE(re);
    print(uneval(hostedRe.exec(input_str)));
})(arguments[0], arguments[1]);
