JS_SHELL ?= js
CDLRE_UNICODE := generated/unicode.js
CDLRE_UNICODE_LZW := generated/unicode_lzw.js
CDLRE_LIB := \
	lib/common.js \
	lib/unicode.js \
	lib/log.js \
	lib/set.js \
	lib/parser.js \
	lib/matcher.js \
	lib/cdlre.js
CDLRE_LIB_ARGS := $(addprefix -f ,$(CDLRE_LIB)) -f $(CDLRE_UNICODE)
CDLRE_TEST := \
	test/parser_test.js \
	test/cdlre_test.js
CDLRE_TEST_ARGS := $(addprefix -f ,$(CDLRE_TEST))

.PHONY: test
test:
	$(JS_SHELL) $(CDLRE_LIB_ARGS) $(CDLRE_TEST_ARGS) -e 'testParser(); cliTestCDLRE();'

.PHONY: test_cdlre
test_cdlre:
	$(JS_SHELL) $(CDLRE_LIB_ARGS) $(CDLRE_TEST_ARGS) -e 'cliTestCDLRE();'

.PHONY: hosted
hosted:
	$(shell mkdir -p hosted/lib hosted/generated hosted/test)
	$(shell ln -s $(realpath web/cdlre.html) hosted)
	$(foreach lib_item,$(CDLRE_LIB),$(shell ln -s $(realpath $(lib_item)) hosted/lib))
	$(foreach test_item,$(CDLRE_TEST),$(shell ln -s $(realpath $(test_item)) hosted/test))
	$(shell ln -s $(realpath $(CDLRE_UNICODE)) hosted/generated)
	echo Done

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
