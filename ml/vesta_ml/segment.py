"""Cabeza de segmentación por parches: qué hay en cada trozo de 14 px de la imagen (fondo o tipo de prenda).

  python -m vesta_ml.segment embed [--limit N]   # máscaras de Fashionpedia → objetivos 16×16 + rasgos de DINOv2
  python -m vesta_ml.segment train seg-v1        # entrena y evalúa (IoU por clase en val)

Solo usa las fotos de Fashionpedia con licencia comercial (como el clasificador). Comparte el backbone y el
preprocesado (letterbox 224) del clasificador, así que en la app sale de la misma pasada: el mapa grueso
dice dónde está cada prenda y SlimSAM afina el borde a partir de su recuadro.
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
from .features import INPUT_SIZE, preprocess
from .taxonomy import load_source_mappings

SEG_CLASSES = ["background", "top", "bottom", "one-piece", "outerwear", "footwear", "accessory"]
GRID = INPUT_SIZE // 14  # 16 × 16 patches
PATCH_DIM = 384
SPLITS = {
    "train": ("instances_attributes_train2020.json", "train2020.zip"),
    "val": ("instances_attributes_val2020.json", "val_test2020.zip"),
}


def decode_rle(counts: str, height: int, width: int) -> np.ndarray:
    """COCO compressed RLE (column-major run lengths, LEB128-like characters) to a boolean mask."""
    runs, index = [], 0
    while index < len(counts):
        value, shift, more = 0, 0, True
        while more:
            char = ord(counts[index]) - 48
            value |= (char & 0x1F) << (5 * shift)
            more = bool(char & 0x20)
            index += 1
            shift += 1
            if not more and char & 0x10:
                value |= -1 << (5 * shift)
        if len(runs) > 2:
            value += runs[-2]
        runs.append(value)
    flat = np.zeros(height * width, dtype=bool)
    position, filled = 0, False
    for run in runs:
        if filled:
            flat[position:position + run] = True
        position += run
        filled = not filled
    return flat.reshape(width, height).T


def class_map(width: int, height: int, garments: list[tuple[int, object]]) -> np.ndarray:
    """Per-pixel class index on the letterboxed 224 × 224 canvas; larger garments first, smaller drawn over."""
    scale = INPUT_SIZE / max(width, height)
    offset_x = (INPUT_SIZE - round(width * scale)) // 2
    offset_y = (INPUT_SIZE - round(height * scale)) // 2
    canvas = Image.new("L", (INPUT_SIZE, INPUT_SIZE), 0)
    draw = ImageDraw.Draw(canvas)
    for klass, segmentation in garments:
        if isinstance(segmentation, list):
            for polygon in segmentation:
                points = [(offset_x + x * scale, offset_y + y * scale) for x, y in zip(polygon[0::2], polygon[1::2])]
                if len(points) >= 3:
                    draw.polygon(points, fill=klass)
        elif isinstance(segmentation, dict) and isinstance(segmentation.get("counts"), str):
            mask = Image.fromarray(decode_rle(segmentation["counts"], height, width).astype(np.uint8) * 255)
            mask = mask.resize((round(width * scale), round(height * scale)), Image.NEAREST)
            canvas.paste(klass, (offset_x, offset_y), mask)
    return np.asarray(canvas)


def patch_targets(pixels: np.ndarray) -> np.ndarray:
    """Fraction of each class in each 14 × 14 patch: (GRID * GRID, classes)."""
    one_hot = np.eye(len(SEG_CLASSES), dtype=np.float32)[pixels]
    blocks = one_hot.reshape(GRID, 14, GRID, 14, len(SEG_CLASSES)).mean(axis=(1, 3))
    return blocks.reshape(GRID * GRID, len(SEG_CLASSES))


def images_with_masks(annotations: dict, allowed: set[int], category_classes: dict[str, int]) -> list[dict]:
    """Commercial-licence images with their whole-garment masks (parts such as sleeves or pockets are left out)."""
    names = {category["id"]: category["name"] for category in annotations["categories"]}
    images = {image["id"]: {**image, "garments": []} for image in annotations["images"] if image["license"] in allowed}
    for annotation in annotations["annotations"]:
        image = images.get(annotation["image_id"])
        klass = category_classes.get(names[annotation["category_id"]])
        if image is not None and klass:
            image["garments"].append((annotation["area"], klass, annotation["segmentation"]))
    for image in images.values():
        image["garments"] = [(klass, segmentation) for _, klass, segmentation in sorted(image["garments"], key=lambda item: -item[0])]
    return [image for image in images.values() if image["garments"]]


def seg_head(hidden: int):
    """Per patch: its own token and the image's CLS token → class logits (torch module)."""
    import torch
    from torch import nn

    class SegHead(nn.Module):
        def __init__(self):
            super().__init__()
            self.net = nn.Sequential(nn.LayerNorm(2 * PATCH_DIM), nn.Linear(2 * PATCH_DIM, hidden), nn.GELU(),
                                     nn.Dropout(0.1), nn.Linear(hidden, len(SEG_CLASSES)))

        def forward(self, patches: torch.Tensor, cls: torch.Tensor) -> torch.Tensor:
            context = cls[:, None, :].expand(-1, patches.shape[1], -1)
            return self.net(torch.cat([patches, context], dim=-1))

    return SegHead()


def load_seg_head(root: Path, name: str):
    """A trained head from models/<name> in eval mode, with its seg.json."""
    import torch

    directory = root / "models" / name
    metadata = json.loads((directory / "seg.json").read_text(encoding="utf-8"))
    model = seg_head(metadata["hidden"])
    model.load_state_dict(torch.load(directory / "seg_head.pt", weights_only=True))
    model.eval()
    return model, metadata


def seg_dir(root: Path) -> Path:
    return root / "segmentation"


def embed(limit: int | None, batch_size: int) -> None:
    import torch

    from .embed import load_backbone
    from .sources.fashionpedia import allowed_license_ids

    root = data_dir()
    downloads = root / "downloads" / "fashionpedia"
    mapping = load_source_mappings()["fashionpedia"]["categories"]
    category_classes = {name: SEG_CLASSES.index(entry["category"]) for name, entry in mapping.items()}
    backbone = load_backbone()
    output = seg_dir(root)
    output.mkdir(parents=True, exist_ok=True)
    for split, (annotations_file, images_zip) in SPLITS.items():
        annotations = json.loads((downloads / annotations_file).read_text(encoding="utf-8"))
        images = images_with_masks(annotations, allowed_license_ids(False), category_classes)[:limit]
        count = len(images)
        patches = np.lib.format.open_memmap(output / f"{split}-patches.npy", "w+", np.float16, (count, GRID * GRID, PATCH_DIM))
        cls = np.zeros((count, PATCH_DIM), np.float16)
        targets = np.zeros((count, GRID * GRID, len(SEG_CLASSES)), np.float16)
        with zipfile.ZipFile(downloads / images_zip) as bundle:
            members = {Path(name).name: name for name in bundle.namelist() if not name.endswith("/")}
            for start in range(0, count, batch_size):
                batch = images[start:start + batch_size]
                pixels = []
                for offset, image in enumerate(batch):
                    with Image.open(io.BytesIO(bundle.read(members[image["file_name"]]))) as photo:
                        photo.load()
                        pixels.append(preprocess(photo))
                    targets[start + offset] = patch_targets(class_map(image["width"], image["height"], image["garments"]))
                with torch.inference_mode():
                    hidden = backbone(pixel_values=torch.from_numpy(np.stack(pixels))).last_hidden_state.numpy()
                cls[start:start + len(batch)] = hidden[:, 0]
                patches[start:start + len(batch)] = hidden[:, 1:]
                print(f"\r{split}: {min(start + batch_size, count)}/{count}", end="", flush=True)
        print()
        patches.flush()
        np.save(output / f"{split}-cls.npy", cls)
        np.save(output / f"{split}-targets.npy", targets)
        (output / f"{split}-images.json").write_text(json.dumps([image["file_name"] for image in images]), encoding="utf-8")


def iou_by_class(predicted: np.ndarray, truth: np.ndarray) -> dict[str, float]:
    result = {}
    for index, name in enumerate(SEG_CLASSES):
        union = np.sum((predicted == index) | (truth == index))
        if union:
            result[name] = float(np.sum((predicted == index) & (truth == index)) / union)
    return result


def train(name: str, epochs: int, hidden: int) -> None:
    import torch
    from torch import nn

    root = data_dir()
    source = seg_dir(root)

    def load(split: str):
        patches = np.load(source / f"{split}-patches.npy", mmap_mode="r")
        cls = np.load(source / f"{split}-cls.npy")
        targets = np.load(source / f"{split}-targets.npy")
        return patches, cls, targets

    train_patches, train_cls, train_targets = load("train")
    val_patches, val_cls, val_targets = load("val")
    torch.manual_seed(0)

    model = seg_head(hidden)
    frequency = train_targets.reshape(-1, len(SEG_CLASSES)).astype(np.float64).mean(axis=0)
    weights = torch.tensor((frequency.max() / np.maximum(frequency, 1e-6)) ** 0.5, dtype=torch.float32)
    weights /= weights.mean()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    count = len(train_cls)
    batch = 64

    def evaluate() -> tuple[float, dict[str, float]]:
        model.eval()
        predicted, truth = [], []
        with torch.inference_mode():
            for start in range(0, len(val_cls), 128):
                logits = model(torch.from_numpy(np.asarray(val_patches[start:start + 128], np.float32)),
                               torch.from_numpy(val_cls[start:start + 128].astype(np.float32)))
                predicted.append(logits.argmax(-1).numpy())
                truth.append(val_targets[start:start + 128].argmax(-1))
        ious = iou_by_class(np.concatenate(predicted), np.concatenate(truth))
        return float(np.mean(list(ious.values()))), ious

    best, best_state = -1.0, None
    for epoch in range(epochs):
        model.train()
        order = np.random.default_rng(epoch).permutation(count)
        total = 0.0
        for start in range(0, count, batch):
            index = np.sort(order[start:start + batch])
            patches = torch.from_numpy(np.asarray(train_patches[index], np.float32))
            cls = torch.from_numpy(train_cls[index].astype(np.float32))
            target = torch.from_numpy(train_targets[index].astype(np.float32))
            log_probs = torch.log_softmax(model(patches, cls), dim=-1)
            loss = -(target * log_probs * weights).sum(-1).mean()
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total += float(loss) * len(index)
        miou, ious = evaluate()
        print(f"época {epoch + 1}: pérdida {total / count:.4f}  mIoU val {miou:.3f}  " + "  ".join(f"{k} {v:.2f}" for k, v in ious.items()))
        if miou > best:
            best, best_state = miou, {key: value.clone() for key, value in model.state_dict().items()}

    model.load_state_dict(best_state)
    miou, ious = evaluate()
    directory = root / "models" / name
    directory.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), directory / "seg_head.pt")
    (directory / "seg.json").write_text(json.dumps({
        "classes": SEG_CLASSES, "grid": GRID, "hidden": hidden, "input": "patch-token+cls",
        "source": "Fashionpedia (fotos con licencia comercial)", "trainImages": count,
        "val": {"mIoU": miou, "iou": ious}
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Mejor mIoU val {miou:.3f}; guardado en {directory}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    embed_parser = commands.add_parser("embed")
    embed_parser.add_argument("--limit", type=int)
    embed_parser.add_argument("--batch-size", type=int, default=32)
    train_parser = commands.add_parser("train")
    train_parser.add_argument("name")
    train_parser.add_argument("--epochs", type=int, default=12)
    train_parser.add_argument("--hidden", type=int, default=256)
    arguments = parser.parse_args()
    if arguments.command == "embed":
        embed(arguments.limit, arguments.batch_size)
    else:
        train(arguments.name, arguments.epochs, arguments.hidden)


if __name__ == "__main__":
    main()
