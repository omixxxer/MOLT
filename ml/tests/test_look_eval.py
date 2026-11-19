import unittest

import numpy as np

from vesta_ml.look_eval import full_class_map
from vesta_ml.segment import SEG_CLASSES

from .test_segment import encode_rle


class FullClassMapTest(unittest.TestCase):
    def test_draws_polygons_and_masks_at_the_photo_size_smaller_over_larger(self):
        top, footwear = SEG_CLASSES.index("top"), SEG_CLASSES.index("footwear")
        shoe = np.zeros((40, 30), dtype=bool)
        shoe[30:36, 4:10] = True
        pixels = full_class_map(30, 40, [
            (top, [[2, 2, 28, 2, 28, 34, 2, 34]]),
            (footwear, {"counts": encode_rle(shoe), "size": [40, 30]}),
        ])
        self.assertEqual(pixels.shape, (40, 30))
        self.assertEqual(pixels[10, 15], top)
        self.assertEqual(pixels[32, 6], footwear)
        self.assertEqual(pixels[38, 28], 0)


if __name__ == "__main__":
    unittest.main()
