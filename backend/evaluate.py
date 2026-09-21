"""Evaluate the E-REF models and write the report the app displays.

Runs the trained classifiers over a held-out split and reports accuracy,
precision, recall and F1 for three tasks:

  food_identity  which food it is (9 types), from the multiclass CNN
  freshness      fresh vs rotten (binary), from the dedicated freshness CNN
  combined       the raw 18-class head, identity and freshness together

Usage (from the project root, with the venv active):

    python backend/evaluate.py                    # 80 images per class
    python backend/evaluate.py --limit-per-class 0  # the whole split
    python backend/evaluate.py --split Datasets/dataset/Test

The report is written to ``backend/metrics/model_metrics.json`` and served by
the API at ``GET /metrics``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from labels import food_name_from_label, freshness_from_label  # noqa: E402
from metrics import binary_report, classification_report  # noqa: E402
from pipeline import (  # noqa: E402
    FRESHNESS_TFLITE_PATH,
    FRESHNESS_YOLO_PATH,
    IDENTITY_PATH,
    PROJECT_ROOT,
    _TFLiteFreshness,
)

DEFAULT_SPLIT = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "food_multiclass" / "val"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "metrics" / "model_metrics.json"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
BATCH_SIZE = 32


def collect_samples(split_dir: Path, limit_per_class: int) -> list[tuple[Path, str]]:
    """Gather ``(image_path, folder_label)`` pairs from an ImageFolder split."""
    samples: list[tuple[Path, str]] = []
    for class_dir in sorted(p for p in split_dir.iterdir() if p.is_dir()):
        files = sorted(f for f in class_dir.iterdir() if f.suffix.lower() in IMAGE_SUFFIXES)
        if limit_per_class > 0:
            # Even stride rather than the first N, so the sample spans the folder.
            if len(files) > limit_per_class:
                step = len(files) / limit_per_class
                files = [files[int(i * step)] for i in range(limit_per_class)]
        samples.extend((f, class_dir.name) for f in files)
    return samples


def evaluate(
    split_dir: Path,
    limit_per_class: int,
    identity_path: Path,
    freshness_tflite_path: Path,
    freshness_yolo_path: Path,
) -> dict:
    from ultralytics import YOLO

    if not split_dir.exists():
        raise SystemExit(f"Evaluation split not found: {split_dir}")
    if not identity_path.exists():
        raise SystemExit(f"Identity model not found: {identity_path}")

    samples = collect_samples(split_dir, limit_per_class)
    if not samples:
        raise SystemExit(f"No images found under {split_dir}")

    print(f"Evaluating {len(samples)} images from {split_dir}")

    identity_model = YOLO(str(identity_path))
    identity_names = [str(identity_model.names[i]) for i in range(len(identity_model.names))]

    freshness_cnn = None
    freshness_model_name = None
    if freshness_tflite_path.exists():
        try:
            freshness_cnn = _TFLiteFreshness(freshness_tflite_path)
            freshness_model_name = "mobilenetv2-tflite"
        except Exception as error:
            print(f"  TFLite freshness CNN unavailable ({error}); falling back to YOLO")

    freshness_yolo = None
    if freshness_cnn is None and freshness_yolo_path.exists():
        freshness_yolo = YOLO(str(freshness_yolo_path))
        freshness_model_name = "yolov8n-cls-freshness"

    # Label spaces -------------------------------------------------------
    food_names = sorted({food_name_from_label(name) or "unknown" for name in identity_names})
    freshness_names = ["fresh", "rotten"]

    identity_index = {name: i for i, name in enumerate(identity_names)}
    food_index = {name: i for i, name in enumerate(food_names)}

    combined_true: list[int] = []
    combined_pred: list[int] = []
    food_true: list[int] = []
    food_pred: list[int] = []
    fresh_true: list[int] = []
    fresh_pred: list[int] = []
    skipped: list[str] = []

    started = time.perf_counter()
    done = 0

    for batch in _batched(samples, BATCH_SIZE):
        paths = [str(path) for path, _ in batch]
        results = identity_model.predict(paths, verbose=False)

        for (path, folder_label), result in zip(batch, results):
            if folder_label not in identity_index:
                skipped.append(folder_label)
                continue

            predicted_label = identity_names[int(result.probs.top1)]

            combined_true.append(identity_index[folder_label])
            combined_pred.append(identity_index[predicted_label])

            food_true.append(food_index[food_name_from_label(folder_label) or "unknown"])
            food_pred.append(food_index[food_name_from_label(predicted_label) or "unknown"])

            actual_fresh = 1 if freshness_from_label(folder_label) == "spoiled" else 0
            fresh_true.append(actual_fresh)
            fresh_pred.append(
                _predict_freshness(
                    path,
                    result,
                    identity_names,
                    freshness_cnn,
                    freshness_yolo,
                )
            )

        done += len(batch)
        elapsed = time.perf_counter() - started
        rate = done / elapsed if elapsed else 0
        print(f"  {done}/{len(samples)} images  ({rate:.1f} img/s)", end="\r", flush=True)

    print()
    duration = time.perf_counter() - started

    if skipped:
        unique = sorted(set(skipped))
        print(f"  Skipped {len(skipped)} images from folders not in the model: {unique}")

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "split": str(split_dir.relative_to(PROJECT_ROOT))
            if split_dir.is_relative_to(PROJECT_ROOT)
            else str(split_dir),
            "images": len(combined_true),
            "limitPerClass": limit_per_class or None,
            "durationSeconds": round(duration, 1),
        },
        "tasks": {
            "food_identity": {
                "title": "Food Identification",
                "description": "Which food the CNN sees, across 9 food types.",
                "model": "yolov8n-cls (food_multiclass)",
                **classification_report(food_true, food_pred, food_names),
            },
            "freshness": {
                "title": "Freshness Detection",
                "description": "Fresh vs rotten. Recall on rotten is the safety-critical score.",
                "model": freshness_model_name or "yolov8n-cls (food_multiclass)",
                **binary_report(fresh_true, fresh_pred, freshness_names, positive_index=1),
            },
            "combined": {
                "title": "Combined Identity + Freshness",
                "description": "The raw 18-class head, food and freshness in one label.",
                "model": "yolov8n-cls (food_multiclass)",
                **classification_report(combined_true, combined_pred, identity_names),
            },
        },
    }
    return report


def _predict_freshness(
    path: str,
    identity_result,
    identity_names: list[str],
    freshness_cnn,
    freshness_yolo,
) -> int:
    """Return 1 for rotten, 0 for fresh, fusing the CNN with the identity head.

    Mirrors the weighting used by the live pipeline so the reported metrics
    describe the verdict the app actually shows.
    """
    probs = identity_result.probs.data.cpu().numpy()
    classifier_rotten = float(
        sum(p for i, p in enumerate(probs) if freshness_from_label(identity_names[i]) == "spoiled")
    )

    cnn_rotten = None
    if freshness_cnn is not None:
        cnn_rotten = freshness_cnn.prob_rotten(Image.open(path))
    elif freshness_yolo is not None:
        result = freshness_yolo.predict(path, verbose=False)[0]
        fresh_probs = result.probs.data.cpu().numpy()
        rotten_index = next(
            (i for i, name in result.names.items() if str(name).lower().startswith("rot")),
            None,
        )
        if rotten_index is not None:
            cnn_rotten = float(fresh_probs[int(rotten_index)])

    if cnn_rotten is None:
        fused = classifier_rotten
    else:
        fused = 0.65 * cnn_rotten + 0.35 * classifier_rotten
    return 1 if fused >= 0.5 else 0


def _batched(items: list, size: int):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def print_summary(report: dict) -> None:
    print()
    print(f"{'Task':<32}{'Accuracy':>10}{'Precision':>11}{'Recall':>9}{'F1':>8}")
    print("-" * 70)
    for task in report["tasks"].values():
        macro = task["macro"]
        print(
            f"{task['title']:<32}"
            f"{task['accuracy'] * 100:>9.2f}%"
            f"{macro['precision'] * 100:>10.2f}%"
            f"{macro['recall'] * 100:>8.2f}%"
            f"{macro['f1'] * 100:>7.2f}%"
        )
    print("-" * 70)
    print("Precision / recall / F1 are macro-averaged across classes.")

    binary = report["tasks"]["freshness"].get("binary")
    if binary:
        print(
            f"Rotten-class recall: {binary['recall'] * 100:.2f}% "
            f"({binary['falseNegative']} rotten items missed)"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--split", type=Path, default=DEFAULT_SPLIT, help="ImageFolder directory to evaluate")
    parser.add_argument(
        "--limit-per-class",
        type=int,
        default=80,
        help="Images sampled per class (0 evaluates every image; slower)",
    )
    parser.add_argument("--identity", type=Path, default=IDENTITY_PATH)
    parser.add_argument("--freshness-tflite", type=Path, default=FRESHNESS_TFLITE_PATH)
    parser.add_argument("--freshness-yolo", type=Path, default=FRESHNESS_YOLO_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    report = evaluate(
        args.split,
        args.limit_per_class,
        args.identity,
        args.freshness_tflite,
        args.freshness_yolo,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print_summary(report)
    print(f"\nWrote {args.output}")


if __name__ == "__main__":
    main()
