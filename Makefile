JS_SHELL := jsv -m -n
CDLRE_UNICODE := generated/unicode.js
CDLRE_UNICODE_LZW := generated/unicode_lzw.js
CDLRE_LIB_ARGS := \
	-f lib/common.js \
	-f $(CDLRE_UNICODE) \
	-f lib/unicode.js \
	-f lib/log.js \
	-f lib/set.js \
	-f lib/parser.js \
	-f lib/matcher.js \
	-f lib/cdlre.js
CDLRE_TEST_ARGS := -f test/parser_test.js -f test/cdlre_test.js

.PHONY: test
test:
	$(JS_SHELL) $(CDLRE_LIB_ARGS) $(CDLRE_TEST_ARGS) -e 'testParser(); testCDLRE();'

.PHONY: test_cdlre
test_cdlre:
	$(JS_SHELL) $(CDLRE_LIB_ARGS) $(CDLRE_TEST_ARGS) -e 'testCDLRE();'

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

.PHONY: unicode
unicode:
	echo "var encIdentityEscape = " > $(CDLRE_UNICODE)
	./tools/unicat.py >> $(CDLRE_UNICODE)
	du -sh $(CDLRE_UNICODE)


.PHONY: lzw
lzw: unicode
	$(JS_SHELL) -f lib/lzw.js -f $(CDLRE_UNICODE) -e 'print("var encLZWIdentityEscape = ", uneval(LZW.encode(LZW.compress(encIdentityEscape))), ";")' > $(CDLRE_UNICODE_LZW)
	du -sh $(CDLRE_UNICODE)
	du -sh $(CDLRE_UNICODE_LZW)
