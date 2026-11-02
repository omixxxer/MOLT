import unittest

import numpy as np

from vesta_ml.segment import GRID, SEG_CLASSES, class_map, decode_rle, iou_by_class, patch_targets


def encode_rle(mask: np.ndarray) -> str:
    """COCO compressed RLE, written the way pycocotools does, to test the decoder against."""
    flat = mask.T.reshape(-1).astype(bool)
    runs, value, count = [], False, 0
    for pixel in flat:
        if pixel != value:
            runs.append(count)
            value, count = pixel, 0
        count += 1
    runs.append(count)
    text = []
    for index, run in enumerate(runs):
        delta = run - runs[index - 2] if index > 2 else run
        more = True
        while more:
            char = delta & 0x1F
            delta >>= 5
            more = not ((delta == 0 and not char & 0x10) or (delta == -1 and char & 0x10))
            if more:
                char |= 0x20
            text.append(chr(char + 48))
    return "".join(text)


class SegmentTest(unittest.TestCase):
    def test_rle_roundtrip(self):
        rng = np.random.default_rng(0)
        mask = np.zeros((40, 30), bool)
        mask[5:25, 8:20] = True
        mask[rng.integers(0, 40, 50), rng.integers(0, 30, 50)] = True
        self.assertTrue(np.array_equal(decode_rle(encode_rle(mask), 40, 30), mask))

    def test_masks_are_letterboxed_and_smaller_garments_drawn_over(self):
        # A 448 x 224 photo becomes 224 x 112 in the middle of the square: rows 56..167.
        dress = [[0, 0, 448, 0, 448, 224, 0, 224]]
        bag = [[0, 0, 100, 0, 100, 100, 0, 100]]
        pixels = class_map(448, 224, [(SEG_CLASSES.index("one-piece"), dress), (SEG_CLASSES.index("accessory"), bag)])
        self.assertEqual(pixels[10, 100], 0)  # padding is background
        self.assertEqual(pixels[150, 200], SEG_CLASSES.index("one-piece"))
        self.assertEqual(pixels[70, 10], SEG_CLASSES.index("accessory"))

    def test_patch_targets_are_class_fractions(self):
        pixels = np.zeros((224, 224), np.uint8)
        pixels[:14, :7] = 1  # half of the first patch is a top
        targets = patch_targets(pixels)
        self.assertEqual(targets.shape, (GRID * GRID, len(SEG_CLASSES)))
        self.assertAlmostEqual(float(targets[0, 1]), 0.5)
        self.assertTrue(np.allclose(targets.sum(axis=1), 1))

    def test_iou_ignores_classes_absent_from_both(self):
        ious = iou_by_class(np.array([0, 1, 1, 0]), np.array([0, 1, 0, 0]))
        self.assertAlmostEqual(ious["top"], 0.5)
        self.assertNotIn("footwear", ious)


if __name__ == "__main__":
    unittest.main()
