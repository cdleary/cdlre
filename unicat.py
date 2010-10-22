#!/usr/bin/env python3

"""Convert the union of several unicode categories to a single JS string."""

from subprocess import Popen

TARGET_CATEGORIES = ['Mn', 'Mc', 'Nd', 'Pc', 'Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl']

with open('unicode_categories.txt') as file:
    print('"', end='')
    for line in file:
        hexcode, category, *rest = line.split()
        if category in TARGET_CATEGORIES:
            print(r'\u{}'.format(hexcode.lower()), end='')
    print('"')
