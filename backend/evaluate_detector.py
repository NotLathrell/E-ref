"""Measure the fine-tuned food detector on images it was not trained on.

Four measurements, each answering a different question, written to
``backend/metrics/detector_metrics.json``:

  composed frames   mAP on the test split of the composed detection dataset (frames made
                    from test-split photos only). This is the standard detection score, but
                    the frames are synthetic, so it is the most optimistic of the four.
  object counts     how often the number of boxes equals the number of foods in the frame:
                    the "multiple food objects" requirement.
  real photos       held-out single-food photos as photographed: does the detector find the
                    food, is the best box the right food, and does the box cover the food?
                    (These are missed-detection and wrong-label evidence.)
  false detections  photos with no supported food (the ``other`` class and foods the models
                    were never trained on): how often does the detector still box something?
                    (This is false-detection evidence.)

    python backend/evaluate_detector.py
    python backend/evaluate_detector.py --per-class 30
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.labels import OTHER_LABEL, food_name_from_label  # noqa: E402
from backend.pipeline import DETECTOR_IMGSZ, FOOD_DETECTOR_PATH, OBJECT_CONF, OBJECT_IOU  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DETECT_DATA = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_detect_v1"
CLASSIFY_DATA = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_v2"
OUTPUT = Path(__file__).resolve().parent / "metrics" / "detector_metrics.json"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def sample(folder: Path, count: int, rng: random.Random) -> list[Path]:
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTENSIONS)
    rng.shuffle(files)
    return files[:count]


def predict(model, path: Path):
    return model.predict(
        str(path), verbose=False, conf=OBJECT_CONF, iou=OBJECT_IOU, imgsz=DETECTOR_IMGSZ, agnostic_nms=True, device="cpu"
    )[0]


def composed_frames(model) -> dict:
    metrics = model.val(
        data=str(DETECT_DATA / "data.yaml"), split="test", imgsz=DETECTOR_IMGSZ, device="cpu", plots=False, verbose=False
    )
    box = metrics.box
    names = model.names
    per_class = {
        str(names[int(index)]): round(float(ap), 4) for index, ap in zip(box.ap_class_index, box.ap50)
    }
    return {
        "frames": int(len(list((DETECT_DATA / "images" / "test").iterdir()))),
        "precision": round(float(box.mp), 4),
        "recall": round(float(box.mr), 4),
        "map50": round(float(box.map50), 4),
        "map50_95": round(float(box.map), 4),
        "ap50PerClass": per_class,
    }


def object_counts(model) -> dict:
    labels = DETECT_DATA / "labels" / "test"
    exact = within_one = total = 0
    missed = extra = 0
    for label_file in sorted(labels.glob("*.txt")):
        truth = len([line for line in label_file.read_text().splitlines() if line.strip()])
        image = DETECT_DATA / "images" / "test" / f"{label_file.stem}.jpg"
        found = len(predict(model, image).boxes)
        total += 1
        exact += found == truth
        within_one += abs(found - truth) <= 1
        missed += max(0, truth - found)
        extra += max(0, found - truth)
    return {
        "frames": total,
        "exactCount": round(exact / total, 4),
        "withinOne": round(within_one / total, 4),
        "missedBoxes": missed,
        "extraBoxes": extra,
    }


def real_photos(model, per_class: int, rng: random.Random) -> dict:
    found = right = covered = total = 0
    coverage_sum = 0.0
    per_food: dict[str, dict[str, float]] = {}
    for folder in sorted((CLASSIFY_DATA / "identity" / "test").iterdir()):
        if not folder.is_dir() or folder.name == OTHER_LABEL:
            continue
        food = food_name_from_label(folder.name)
        stats = per_food.setdefault(food, {"photos": 0, "found": 0, "rightLabel": 0})
        for path in sample(folder, per_class, rng):
            result = predict(model, path)
            stats["photos"] += 1
            total += 1
            if len(result.boxes) == 0:
                continue
            best = max(range(len(result.boxes)), key=lambda i: float(result.boxes.conf[i]))
            label = str(result.names[int(result.boxes.cls[best])])
            x1, y1, x2, y2 = [float(v) for v in result.boxes.xyxy[best]]
            height, width = result.orig_shape
            coverage = max(0.0, (x2 - x1) * (y2 - y1)) / (width * height)
            found += 1
            stats["found"] += 1
            coverage_sum += coverage
            covered += coverage >= 0.25
            if label == food:
                right += 1
                stats["rightLabel"] += 1
    return {
        "photos": total,
        "foodFound": round(found / total, 4),
        "missed": round(1 - found / total, 4),
        "bestBoxIsRightFood": round(right / total, 4),
        "meanBoxCoverage": round(coverage_sum / found, 4) if found else None,
        "boxCoversAtLeastQuarter": round(covered / total, 4),
        "perFood": {
            food: {
                "photos": int(s["photos"]),
                "found": round(s["found"] / s["photos"], 4),
                "rightLabel": round(s["rightLabel"] / s["photos"], 4),
            }
            for food, s in per_food.items()
            if s["photos"]
        },
    }


def false_detections(model, per_class: int, rng: random.Random) -> dict:
    groups = {
        "otherObjects": CLASSIFY_DATA / "identity" / "test" / OTHER_LABEL,
        "unseenFoods": CLASSIFY_DATA / "identity_unseen" / OTHER_LABEL,
    }
    report: dict[str, dict] = {}
    for name, folder in groups.items():
        if not folder.exists():
            continue
        photos = sample(folder, per_class * 6, rng)
        boxed = sum(1 for path in photos if len(predict(model, path).boxes) > 0)
        report[name] = {"photos": len(photos), "wronglyBoxed": round(boxed / len(photos), 4)}
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--per-class", type=int, default=25, help="real photos sampled per food")
    parser.add_argument("--seed", type=int, default=5)
    args = parser.parse_args()

    if not FOOD_DETECTOR_PATH.exists():
        raise SystemExit(f"{FOOD_DETECTOR_PATH} not found. Run backend/train_detector.py first.")

    from ultralytics import YOLO

    model = YOLO(str(FOOD_DETECTOR_PATH))
    rng = random.Random(args.seed)
    started = time.time()

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": "eref-detector-v1 (YOLOv8n fine-tuned, 12 foods)",
        "settings": {"imgsz": DETECTOR_IMGSZ, "confidence": OBJECT_CONF, "nmsIou": OBJECT_IOU},
        "composedFrames": composed_frames(model),
        "objectCounts": object_counts(model),
        "realPhotos": real_photos(model, args.per_class, rng),
        "falseDetections": false_detections(model, args.per_class, rng),
        "note": (
            "Training frames are composed from single-food photos with exact boxes, so the "
            "composed-frame scores are optimistic. 'realPhotos' and 'falseDetections' use "
            "photos as they were taken, from splits the detector never saw."
        ),
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    frames, counts, real, false = report["composedFrames"], report["objectCounts"], report["realPhotos"], report["falseDetections"]
    print(f"composed frames   mAP@0.5 {frames['map50']:.3f}  mAP@0.5:0.95 {frames['map50_95']:.3f}  "
          f"precision {frames['precision']:.3f}  recall {frames['recall']:.3f}")
    print(f"object counts     exact {counts['exactCount']:.1%}  within one {counts['withinOne']:.1%}")
    print(f"real photos       food found {real['foodFound']:.1%}  right label {real['bestBoxIsRightFood']:.1%}  "
          f"mean box coverage {real['meanBoxCoverage']:.0%}")
    for name, row in false.items():
        print(f"false detections  {name}: {row['wronglyBoxed']:.1%} of {row['photos']} photos boxed")
    print(f"wrote {OUTPUT} in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
