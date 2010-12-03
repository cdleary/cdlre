.PHONY: test
test:
	jsv -f common.js -f lzw.js -f unicat.js -f unicode.js -f log.js -f set.js -f parser.js -f matcher.js -f cdlre.js -e 'testParser(); testCDLRE();'

.PHONY: lzw
lzw:
	echo -n 'var encIdentityEscape = ' > unicat.js
	./unicat.py >> unicat.js
	jsv -f lzw.js -f unicat.js -e 'print("var encLZWIdentityEscape = ", uneval(LZW.encode(LZW.compress(encIdentityEscape))), ";")' >> unicat_lzw.js
	du -sh unicat.js
	du -sh unicat_lzw.js
