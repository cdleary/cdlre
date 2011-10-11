============================================================
 cdlre: JS-compatible regular expressions implemented in JS
============================================================


This library is intended to help check the `ECMAScript specification`__
conformity of regular expression evaluations.

It could also be used in a metacircular interpreter.

__ http://www.ecmascript.org/docs.php


Goals
-----

- Be capable of visualizing (or at least dumping out) the ECMAScript standard
  steps taken in matching a regular expression.
- Be capable of enabling/disabling the de-facto quirks from various browsers
  which are not yet part of the standard.
- Be capable of running a thorough regression suite against the host regular
  expression engine (presumably with a set of permitted quirk options).
- Keep the JS code a direct translation from the spec where possible and
  practical.


Requirements
------------

A JavaScript shell with the command-line-invocable name ``jsv``.


Make targets
------------

``make test``
    Runs the entire test suite. Right now this is parser and evaluation
    (matcher) tests.

``make hosted``
    Creates a directory structure that can be used for in-browser testing. If
    you subsequently run:

    ::

        $ make hosted
        ...
        $ cd hosted/
        $ python -m SimpleHTTPServer
        Serving HTTP on 0.0.0.0 port 8000 ...

    You can navigate to the `local testing site`__ in your browser.

    __ http://localhost:8000/cdlre.html
