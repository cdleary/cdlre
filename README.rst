============================================================
 cdlre: JS-compatible regular expressions implemented in JS
============================================================


This library is intended to help check the `ECMAScript specification`__
conformity of regular expression evaluations.

There are a bunch of potential applications:

- Regression testing the specification against host implementations.
- Use in understanding why regular expressions succeed/fail to match.
- Use in a metacircular interpreter.
- Use as a staging ground for regular expression optimizations and/or a regular
  expression compiler. (Such a compiler could target ``eval`` as a backend or a
  JIT code execution foreign function.)

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


Usage
------------

Simple usage is as follows:

.. code-block::

    $ JS_SHELL=d8 make


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


Directory structure
-------------------

lib/
    The regular expression library

test/
    The regular expression library test suites

tools/
    For automatically generating unicode bitmaps from the specification

generated/
    Latest version of the generated unicode bitmaps

web/
    The page that gets installed via the ``make hosted`` target
