.PHONY: test
test:
	jsv -f log.js -f set.js -f parser.js -f matcher.js -f cdlre.js -e 'testParser(); testMatcher(); testCDLRE();'
