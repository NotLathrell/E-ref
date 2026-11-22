"""Crop the Roboflow papaya segmentation export into fresh/rotten photos.

The export (``Datasets/PAPAYA.v1i.yolov8/``, CC BY 4.0, downloaded from Roboflow
Universe by the project's own author) labels six ripeness/condition classes with
per-instance polygons, often several papayas per photo. This app only judges fresh
vs. rotten, not ripeness, so:

  Ripe papaya                -> fresh
  Overripe, Partially Rotten papaya, Rotten Papaya -> rotten (visually confirmed:
      "Overripe" shows the same dark surface spotting as "Rotten")
  PartiallyRipe papaya, UnRipe papaya -> excluded (a ripeness stage, not spoilage —
      an unripe papaya is not rotten, and mixing its green skin into the "fresh"
      average would blend two different colours under one label)

Each polygon is cropped to its bounding box (with a small margin) and saved as its
own photo, since the source images often hold several papayas at different
ripeness stages. ``build_dataset.py`` then pools these crops exactly like the
Mendeley papaya source it already uses.

    python backend/convert_papaya_roboflow.py
"""

from __future__ import annotations

from pathlib import Path

import yaml
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC = PROJECT_ROOT / "Datasets" / "PAPAYA.v1i.yolov8"
OUT = PROJECT_ROOT / "Datasets" / "ph_extra" / "papaya_v2"
MARGIN = 0.06
MIN_PX = 32

CLASS_TO_FRESHNESS = {
    "Ripe papaya": "fresh",
    "Overripe": "rotten",
    "Partially Rotten papaya": "rotten",
    "Rotten Papaya": "rotten",
    # Excluded (ripeness stage, not a freshness verdict): "PartiallyRipe papaya", "UnRipe papaya"
}


def polygon_bbox(tokens: list[str], width: int, height: int) -> tuple[int, int, int, int]:
    xs = [float(v) * width for v in tokens[0::2]]
    ys = [float(v) * height for v in tokens[1::2]]
    x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
    mx, my = (x2 - x1) * MARGIN, (y2 - y1) * MARGIN
    return (
        max(0, int(x1 - mx)), max(0, int(y1 - my)),
        min(width, int(x2 + mx)), min(height, int(y2 + my)),
    )


def main() -> None:
    names = yaml.safe_load((SRC / "data.yaml").read_text(encoding="utf-8"))["names"]

    for freshness in ("fresh", "rotten"):
        (OUT / freshness).mkdir(parents=True, exist_ok=True)

    counts: dict[str, int] = {"fresh": 0, "rotten": 0, "excluded": 0, "skipped": 0}
    for split in ("train", "valid", "test"):
        image_dir = SRC / split / "images"
        label_dir = SRC / split / "labels"
        if not image_dir.exists():
            continue
        for label_path in sorted(label_dir.glob("*.txt")):
            image_path = image_dir / f"{label_path.stem}.jpg"
            if not image_path.exists():
                continue
            lines = [ln.split() for ln in label_path.read_text().splitlines() if ln.strip()]
            if not lines:
                continue
            with Image.open(image_path) as image:
                image = image.convert("RGB")
                width, height = image.size
                for i, tokens in enumerate(lines):
                    class_name = names[int(tokens[0])]
                    freshness = CLASS_TO_FRESHNESS.get(class_name)
                    if freshness is None:
                        counts["excluded"] += 1
                        continue
                    box = polygon_bbox(tokens[1:], width, height)
                    if box[2] - box[0] < MIN_PX or box[3] - box[1] < MIN_PX:
                        counts["skipped"] += 1
                        continue
                    crop = image.crop(box)
                    crop.save(OUT / freshness / f"{label_path.stem}_{i}.jpg", quality=92)
                    counts[freshness] += 1

    print(f"fresh={counts['fresh']}  rotten={counts['rotten']}  "
          f"excluded(ripeness-only)={counts['excluded']}  skipped(too small)={counts['skipped']}")
    print(f"Saved crops under {OUT}")


if __name__ == "__main__":
    main()
