.PHONY: test
test:
	jsv -m -f common.js -f unicat.js -f unicode.js -f log.js -f set.js -f parser.js -f matcher.js -f cdlre.js -f cdlre_test.js -e 'testParser(); testCDLRE();'

.PHONY: test_cdlre
test_cdlre:
	jsv -m -f common.js -f unicat.js -f unicode.js -f log.js -f set.js -f parser.js -f matcher.js -f cdlre.js -f cdlre_test.js -e 'testCDLRE();'

.PHONY: hosted
hosted:
	mkdir -p hosted/cdlre
	ln -s ${PWD}/cdlre.html     hosted/cdlre.html
	ln -s ${PWD}/cdlre_test.js  hosted/cdlre/cdlre_test.js
	ln -s ${PWD}/cdlre.js       hosted/cdlre/cdlre.js
	ln -s ${PWD}/common.js      hosted/cdlre/common.js
	ln -s ${PWD}/set.js         hosted/cdlre/set.js
	ln -s ${PWD}/unicode.js     hosted/cdlre/unicode.js
	ln -s ${PWD}/parser.js      hosted/cdlre/parser.js
	ln -s ${PWD}/log.js         hosted/cdlre/log.js
	ln -s ${PWD}/matcher.js     hosted/cdlre/matcher.js
	ln -s ${PWD}/unicat.js      hosted/cdlre/unicat.js

.PHONY: lzw
lzw:
	echo "var encIdentityEscape = " > unicat.js
	./unicat.py >> unicat.js
	jsv -f lzw.js -f unicat.js -e 'print("var encLZWIdentityEscape = ", uneval(LZW.encode(LZW.compress(encIdentityEscape))), ";")' > unicat_lzw.js
	du -sh unicat.js
	du -sh unicat_lzw.js
