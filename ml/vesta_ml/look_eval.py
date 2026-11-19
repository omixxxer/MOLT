"""Full-body photos with their garment masks, to measure «Desde un look» in the browser (bench/look.html).

    python -m vesta_ml.look_eval [--count 50] [--out ../public/test-photos/eval-looks]

Only Fashionpedia val2020 photos that neither model saw: with a commercial licence, those in the segmentation
head's validation set (segmentation/val-images.json); with a share-alike licence (never used to train, only to
evaluate here, locally), any; and in both cases none of their crops in the classifier's train or val split. A photo is a look when it has at least two garment classes other than accessories (top, bottom, one-piece,
outerwear, footwear) and its garments cover at least 10 % of it. Each photo gets a PNG mask with the class index of
each pixel (0 background, then segment.SEG_CLASSES). The same arguments always pick the same photos.
"""
from __future__ import annotations

import argparse
import io
import json
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from .common import data_dir
from .segment import SEG_CLASSES, SPLITS, decode_rle, images_with_masks, seg_dir
from .sources.fashionpedia import allowed_license_ids
from .taxonomy import load_source_mappings

REPOSITORY = Path(__file__).resolve().parents[2]


def full_class_map(width: int, height: int, garments: list[tuple[int, object]]) -> np.ndarray:
    """Per-pixel class index at the photo's own size; larger garments first, smaller drawn over."""
    canvas = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(canvas)
    for klass, segmentation in garments:
        if isinstance(segmentation, list):
            for polygon in segmentation:
                points = list(zip(polygon[0::2], polygon[1::2]))
                if len(points) >= 3:
                    draw.polygon(points, fill=klass)
        elif isinstance(segmentation, dict) and isinstance(segmentation.get("counts"), str):
            mask = Image.fromarray(decode_rle(segmentation["counts"], height, width).astype(np.uint8) * 255)
            canvas.paste(klass, (0, 0), mask)
    return np.asarray(canvas)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--out", type=Path, default=REPOSITORY / "public" / "test-photos" / "eval-looks")
    args = parser.parse_args()

    root = data_dir()
    downloads = root / "downloads" / "fashionpedia"
    annotations_file, images_zip = SPLITS["val"]
    annotations = json.loads((downloads / annotations_file).read_text(encoding="utf-8"))
    mapping = load_source_mappings()["fashionpedia"]["categories"]
    category_classes = {name: SEG_CLASSES.index(entry["category"]) for name, entry in mapping.items()}
    unseen_by_segmentation = set(json.loads((seg_dir(root) / "val-images.json").read_text(encoding="utf-8")))
    seen_by_classifier = set()
    with (root / "manifest.jsonl").open(encoding="utf-8") as manifest:
        for line in manifest:
            record = json.loads(line)
            if record["source"] == "fashionpedia" and record["split"] in ("train", "val"):
                seen_by_classifier.add(record["group"])
    licenses = {entry["id"]: entry for entry in annotations["licenses"]}

    accessory = SEG_CLASSES.index("accessory")
    picked = []
    commercial = allowed_license_ids(False)
    for image in sorted(images_with_masks(annotations, allowed_license_ids(True), category_classes), key=lambda entry: entry["file_name"]):
        trained_on = image["license"] in commercial and image["file_name"] not in unseen_by_segmentation
        if trained_on or f"fashionpedia:{image['id']}" in seen_by_classifier:
            continue
        pixels = full_class_map(image["width"], image["height"], image["garments"])
        shares = {SEG_CLASSES[klass]: float((pixels == klass).mean()) for klass in range(1, len(SEG_CLASSES)) if (pixels == klass).any()}
        main_classes = [name for name in shares if name != SEG_CLASSES[accessory]]
        if len(main_classes) < 2 or sum(shares.values()) < 0.10:
            continue
        picked.append((image, pixels, shares))
        if len(picked) == args.count:
            break

    # Emptied rather than removed: a synced folder (OneDrive) may not let the folder itself go at once.
    args.out.mkdir(parents=True, exist_ok=True)
    for old in args.out.iterdir():
        old.unlink()
    photos = []
    with zipfile.ZipFile(downloads / images_zip) as bundle:
        members = {Path(name).name: name for name in bundle.namelist() if not name.endswith("/")}
        for image, pixels, shares in picked:
            stem = Path(image["file_name"]).stem
            (args.out / image["file_name"]).write_bytes(bundle.read(members[image["file_name"]]))
            Image.fromarray(pixels).save(args.out / f"{stem}-mask.png")
            license_entry = licenses.get(image["license"], {})
            photos.append({
                "id": f"fashionpedia:{image['id']}",
                "file": image["file_name"],
                "mask": f"{stem}-mask.png",
                "width": image["width"],
                "height": image["height"],
                "classes": {name: round(share, 4) for name, share in shares.items()},
                "license": license_entry.get("name"),
                "attribution": image.get("original_url") or image.get("flickr_url") or image.get("coco_url"),
            })
    (args.out / "list.json").write_text(json.dumps({"source": "fashionpedia-val2020", "classes": SEG_CLASSES, "photos": photos}, indent=1), encoding="utf-8")
    print(f"{len(photos)} looks en {args.out}")


if __name__ == "__main__":
    main()
