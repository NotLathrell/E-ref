"""Build the YOLOv8 detection dataset (images plus bounding-box annotations).

The classification photos in ``Datasets/`` show one food each, so they carry no boxes.
A detector needs boxes, and hand-drawing thousands is not practical, so the detection
set is composed from the classification photos themselves:

  1. 1 to 4 photos of different foods are placed on a plain counter-coloured canvas,
     at random positions and sizes, so a frame holds several foods at once;
  2. the box of each food is the exact rectangle it was pasted into, so the
     annotations are exact by construction rather than estimated;
  3. some frames also get an ``other`` photo (a non-supported object) with no box, so
     the detector learns that not everything in the frame is one of the 12 foods.

Classes are the 12 foods. Fresh versus rotten is deliberately not a detector class:
that is the freshness CNN's job, and it runs on each detected crop.

Train, validation and test frames are composed only from the matching split of the
classification data, so no photo appears in two splits.

    python backend/build_detection_dataset.py
    python backend/build_detection_dataset.py --train 1500 --val 300 --test 300
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.labels import OTHER_LABEL, food_name_from_label  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_v2" / "identity"
OUTPUT = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_detect_v1"

CANVAS = 416
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# Counter, table and cloth tones a phone photo of a shelf or worktop might show.
BACKGROUNDS = [
    (235, 229, 218), (214, 200, 180), (176, 150, 120), (120, 96, 76), (245, 245, 242),
    (196, 202, 196), (84, 90, 88), (222, 208, 190), (150, 158, 150), (60, 56, 52),
]


def index_source(split: str) -> tuple[dict[str, list[Path]], list[Path]]:
    """Photos per food (fresh and rotten together) and the non-food photos of one split."""
    foods: dict[str, list[Path]] = {}
    others: list[Path] = []
    root = SOURCE / split
    for folder in sorted(root.iterdir()):
        if not folder.is_dir():
            continue
        files = [p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS]
        if folder.name == OTHER_LABEL:
            others.extend(files)
            continue
        food = food_name_from_label(folder.name)
        if food:
            foods.setdefault(food, []).extend(files)
    return foods, others


def split_regions(count: int, rng: random.Random) -> list[tuple[int, int, int, int]]:
    """Cut the canvas into ``count`` rectangles (x, y, w, h) by repeated random splits."""
    margin = 10
    regions = [(margin, margin, CANVAS - 2 * margin, CANVAS - 2 * margin)]
    while len(regions) < count:
        regions.sort(key=lambda r: r[2] * r[3], reverse=True)
        x, y, w, h = regions.pop(0)
        ratio = rng.uniform(0.38, 0.62)
        if w >= h:
            cut = int(w * ratio)
            regions += [(x, y, cut, h), (x + cut, y, w - cut, h)]
        else:
            cut = int(h * ratio)
            regions += [(x, y, w, cut), (x, y + cut, w, h - cut)]
    return regions


def background(rng: random.Random) -> Image.Image:
    base = rng.choice(BACKGROUNDS)
    canvas = Image.new("RGB", (CANVAS, CANVAS), base)
    # A gentle vertical gradient and blur so the backdrop is not a perfectly flat colour.
    shade = Image.linear_gradient("L").resize((CANVAS, CANVAS))
    dark = Image.new("RGB", (CANVAS, CANVAS), tuple(int(c * 0.82) for c in base))
    canvas = Image.composite(dark, canvas, shade.point(lambda v: int(v * rng.uniform(0.0, 0.5))))
    return canvas.filter(ImageFilter.GaussianBlur(1))


def tighten(photo: Image.Image) -> Image.Image:
    """Crop the plain white or black margin off a studio photo, so a box hugs the food.

    Many source photos show one item on white with rotation-fill black corners. Boxing
    the whole photo would teach the detector loose boxes, so the margin is trimmed. If
    little is left (the photo has a real background), the photo is kept whole.
    """
    pixels = np.asarray(photo)
    white = (pixels >= 236).all(axis=2)
    black = (pixels <= 20).all(axis=2)
    # A flat grey or coloured studio backdrop: close to the colour along the photo's edge.
    edge = np.concatenate([pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]]).astype(int)
    backdrop = (np.abs(pixels.astype(int) - np.median(edge, axis=0)).max(axis=2) <= 26)
    content = ~(white | black | backdrop)
    if content.mean() < 0.12:
        return photo
    rows, cols = np.where(content)
    # Ignore a few stray pixels at the edge by trimming to the 0.5-99.5 percentile span.
    top, bottom = np.percentile(rows, [0.5, 99.5]).astype(int)
    left, right = np.percentile(cols, [0.5, 99.5]).astype(int)
    if right - left < 24 or bottom - top < 24:
        return photo
    return photo.crop((left, top, right + 1, bottom + 1))


def place(canvas: Image.Image, photo_path: Path, region, rng: random.Random):
    """Paste a photo into a region. Returns its exact box as (x0, y0, x1, y1), or None."""
    x, y, w, h = region
    gap = rng.randint(3, 12)
    x, y, w, h = x + gap, y + gap, w - 2 * gap, h - 2 * gap
    if w < 40 or h < 40:
        return None
    try:
        photo = Image.open(photo_path).convert("RGB")
    except OSError:
        return None

    photo = tighten(photo)
    if rng.random() < 0.5:
        photo = photo.transpose(Image.FLIP_LEFT_RIGHT)
    photo = ImageEnhance.Brightness(photo).enhance(rng.uniform(0.85, 1.15))

    fit = min(w / photo.width, h / photo.height) * rng.uniform(0.8, 1.0)
    size = (max(24, int(photo.width * fit)), max(24, int(photo.height * fit)))
    photo = photo.resize(size)
    left = x + rng.randint(0, max(0, w - size[0]))
    top = y + rng.randint(0, max(0, h - size[1]))
    canvas.paste(photo, (left, top))
    return left, top, left + size[0], top + size[1]


def compose(foods, others, names: list[str], rng: random.Random):
    count = rng.choices([1, 2, 3, 4], weights=[0.25, 0.3, 0.25, 0.2])[0]
    regions = split_regions(count, rng)
    rng.shuffle(regions)
    canvas = background(rng)
    labels: list[tuple[int, tuple[int, int, int, int]]] = []

    chosen = rng.sample(names, k=min(count, len(names)))
    for region, food in zip(regions, chosen):
        # A non-food tile now and then, with no box.
        if others and rng.random() < 0.18:
            place(canvas, rng.choice(others), region, rng)
            continue
        box = place(canvas, rng.choice(foods[food]), region, rng)
        if box:
            labels.append((names.index(food), box))
    return canvas, labels


def write_split(split: str, total: int, names: list[str], seed: int) -> int:
    foods, others = index_source(split)
    missing = [n for n in names if n not in foods]
    if missing:
        raise SystemExit(f"{split}: no photos for {', '.join(missing)}")

    rng = random.Random(seed)
    images = OUTPUT / "images" / split
    labels_dir = OUTPUT / "labels" / split
    images.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    while written < total:
        canvas, labels = compose(foods, others, names, rng)
        if not labels:
            continue
        stem = f"{split}_{written:05d}"
        canvas.save(images / f"{stem}.jpg", quality=90)
        lines = []
        for class_id, (x0, y0, x1, y1) in labels:
            cx, cy = (x0 + x1) / 2 / CANVAS, (y0 + y1) / 2 / CANVAS
            bw, bh = (x1 - x0) / CANVAS, (y1 - y0) / CANVAS
            lines.append(f"{class_id} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
        (labels_dir / f"{stem}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        written += 1
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--train", type=int, default=1500)
    parser.add_argument("--val", type=int, default=300)
    parser.add_argument("--test", type=int, default=300)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    foods, _ = index_source("train")
    names = sorted(foods)
    print(f"{len(names)} food classes: {', '.join(names)}")

    for split, total, offset in (("train", args.train, 0), ("val", args.val, 1), ("test", args.test, 2)):
        done = write_split(split, total, names, args.seed + offset)
        print(f"{split}: {done} frames")

    yaml = [f"path: {OUTPUT.as_posix()}", "train: images/train", "val: images/val", "test: images/test", "names:"]
    yaml += [f"  {i}: {name}" for i, name in enumerate(names)]
    (OUTPUT / "data.yaml").write_text("\n".join(yaml) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT / 'data.yaml'}")


if __name__ == "__main__":
    main()
