.PHONY: test
test:
	jsv -f lzw.js -f unicat_lzw.js -f unicode.js -f log.js -f set.js -f parser.js -f matcher.js -f cdlre.js -e 'testParser(); testCDLRE();'
