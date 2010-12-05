import math
from operator import itemgetter

from PIL import Image

TARGET_CATEGORIES = ['Mn', 'Mc', 'Nd', 'Pc', 'Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl']

# Create a string where each set bit indicates the presence of the corresponding unicode ordinal.
ordinals = []
seen_count = 0
with open('unicode_categories.txt') as file:
    for line in file:
        hexcode, category = itemgetter(0, 1)(line.split())
        seen_count += 1
        if category not in TARGET_CATEGORIES:
            continue
        num = int(hexcode, 16)
        ordinals.append(num)

print 'Found', len(ordinals), '/', seen_count, 'matching ordinals', '(%.2f%%)' % (len(ordinals) / float(seen_count))

ordinals.sort()
pixels = [0] * int(math.ceil(ordinals[-1] / 32.0)) # 32b values.

for num in ordinals:
    index, bit = divmod(num, 32)
    pixels[index] |= 1 << bit


width, height = len(pixels), 1
while width % 2 == 0 and width > height:
    width /= 2
    height *= 2

size = width, height
print 'Using size', size

image = Image.new('RGBA', size)
image.putdata(pixels)
image.save('uni.png')

def tuplify(num):
    num, r = divmod(num, 2**8)
    num, g = divmod(num, 2**8)
    num, b = divmod(num, 2**8)
    num, a = divmod(num, 2**8)
    assert num == 0, num
    return (r, g, b, a)

test = Image.open('uni.png')
for i, pixel in enumerate(list(image.getdata())):
    target = tuplify(pixels[i])
    if pixel != target:
        print 'Difference in pixel', i, pixel, '!=', target
        break
print('Checked out ok!')
