var LZW = (function() {
    var LIMIT_CHARCODE = 1114112;

    function ord(c) { return c.charCodeAt(0); }
    function chr(n) { return String.fromCharCode(n); }

    function compress(input) {
        var table = {};
        var lookup = function(str) {
            return str.length === 1 ? ord(str) : table[str];
        };
        var code = LIMIT_CHARCODE;
        var output = [];
        var str = input[0];
        for (var i = 1; i < input.length; ++i) {
            var c = input[i];
            var newstr = str + c;
            if (table.hasOwnProperty(newstr)) {
                str = newstr;
            } else {
                output.push(lookup(str));
                table[newstr] = code++;
                str = c;
            }
        }
        output.push(lookup(str));
        return output;
    }

    /**
     * @param arr   Array of 32b integers.
     */
    function encode(arr) {
        /* 
         * Break into 16b unicode character encoding so we can encode it in
         * a JavaScript string.
         */
        var result = '';
        for (var i = 0; i < arr.length; ++i) {
            var hi = arr[i] >> 16;
            var lo = arr[i] & 0xffff;
            result += chr(hi) + chr(lo);
        }
        return result;
    }

    function decode(str) {
        var output = [];
        for (var i = 0; i < str.length; i += 2) {
            var hi = ord(str[i]);
            var lo = ord(str[i + 1]);
            output.push(hi << 16 | lo);
        }
        return output;
    }

    function decompress(input) {
        var table = {};
        var lookup = function(code) {
            return code < LIMIT_CHARCODE ? chr(code) : table[code];
        };
        var code = LIMIT_CHARCODE;
        var oldCode = input[0];
        var character = lookup(oldCode);
        var output = [lookup(oldCode)];
        for (var i = 1; i < input.length; ++i) {
            var newCode = input[i];
            var str = lookup(newCode);
            if (str === undefined)
                str = lookup(oldCode) + character;
            output.push(str);
            character = str[0];
            table[code++] = lookup(oldCode) + character;
            oldCode = newCode;
        }
        return output.join('');
    }

    return {
        compress: compress,
        decompress: decompress,
        encode: encode,
        decode: decode,
    };
})();
