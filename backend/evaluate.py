"""Evaluate the E-REF models and write the report the app displays.

Runs the trained classifiers over a held-out split and reports accuracy,
precision, recall and F1 for three tasks:

  food_identity  which food it is (9 types, or "unknown"), from the identity CNN
  freshness      fresh vs rotten (binary), from the dedicated freshness CNN
  combined       the raw identity head, food and freshness together

Images that also appear in the training set (byte-identical) are excluded, so
the scores describe images the model has never seen. The dataset's ``val`` folder
was found to share most of its images with ``train``, and ``Test`` is a copy of
``val``; scoring on those would overstate accuracy. Foods left with no independent
images are reported as such rather than scored. Pass --keep-train-duplicates to
disable the filter.

Usage (from the project root, with the venv active):

    python backend/evaluate.py                    # 80 images per class
    python backend/evaluate.py --limit-per-class 0  # the whole split
    python backend/evaluate.py --split Datasets/dataset/Test

The report is written to ``backend/metrics/model_metrics.json`` and served by
the API at ``GET /metrics``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from collections import Counter
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
    IDENTITY_MODEL_NAME,
    IDENTITY_PATH,
    PROJECT_ROOT,
    _TFLiteFreshness,
    fuse_freshness,
    identity_rotten_mass,
    yolo_prob_rotten,
)

DEFAULT_SPLIT = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "food_multiclass" / "val"
DEFAULT_TRAIN = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "food_multiclass" / "train"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "metrics" / "model_metrics.json"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
BATCH_SIZE = 32


def _file_hash(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def train_hashes(train_dir: Path) -> set[str]:
    """Content hashes of every training image, used to detect leakage."""
    return {_file_hash(f) for f in train_dir.rglob("*") if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES}


def collect_samples(
    split_dir: Path,
    limit_per_class: int,
    exclude_hashes: set[str] | None = None,
) -> tuple[list[tuple[Path, str]], Counter, Counter]:
    """Gather ``(image_path, folder_label)`` pairs from an ImageFolder split.

    Images whose content hash is in ``exclude_hashes`` are dropped before any
    per-class limit is applied. Returns the samples plus per-class counts of the
    images found and of those excluded as training duplicates.
    """
    samples: list[tuple[Path, str]] = []
    found: Counter = Counter()
    excluded: Counter = Counter()
    for class_dir in sorted(p for p in split_dir.iterdir() if p.is_dir()):
        files = sorted(f for f in class_dir.iterdir() if f.suffix.lower() in IMAGE_SUFFIXES)
        found[class_dir.name] = len(files)
        if exclude_hashes:
            kept = [f for f in files if _file_hash(f) not in exclude_hashes]
            excluded[class_dir.name] = len(files) - len(kept)
            files = kept
        if limit_per_class > 0:
            # Even stride rather than the first N, so the sample spans the folder.
            if len(files) > limit_per_class:
                step = len(files) / limit_per_class
                files = [files[int(i * step)] for i in range(limit_per_class)]
        samples.extend((f, class_dir.name) for f in files)
    return samples, found, excluded


def evaluate(
    split_dir: Path,
    limit_per_class: int,
    identity_path: Path,
    freshness_tflite_path: Path,
    freshness_yolo_path: Path,
    train_dir: Path | None = None,
) -> dict:
    from ultralytics import YOLO

    if not split_dir.exists():
        raise SystemExit(f"Evaluation split not found: {split_dir}")
    if not identity_path.exists():
        raise SystemExit(f"Identity model not found: {identity_path}")

    exclude_hashes: set[str] | None = None
    if train_dir is not None and train_dir.exists():
        print(f"Hashing training images in {train_dir} to exclude duplicates ...")
        exclude_hashes = train_hashes(train_dir)

    samples, found, excluded = collect_samples(split_dir, limit_per_class, exclude_hashes)
    if not samples:
        raise SystemExit(
            f"No images left to evaluate under {split_dir}"
            + (" after removing training duplicates." if exclude_hashes else ".")
        )

    removed = sum(excluded.values())
    print(
        f"Evaluating {len(samples)} images from {split_dir}"
        + (f" ({removed} of {sum(found.values())} excluded as duplicates of training images)" if exclude_hashes else "")
    )

    identity_model = YOLO(str(identity_path))
    identity_names = [str(identity_model.names[i]) for i in range(len(identity_model.names))]

    # Same order as the live pipeline: the retrained YOLO freshness model, else TFLite.
    freshness_cnn = None
    freshness_yolo = None
    freshness_model_name = None
    if freshness_yolo_path.exists():
        freshness_yolo = YOLO(str(freshness_yolo_path))
        freshness_model_name = "yolov8n-cls-freshness"
    elif freshness_tflite_path.exists():
        try:
            freshness_cnn = _TFLiteFreshness(freshness_tflite_path)
            freshness_model_name = "mobilenetv2-tflite"
        except Exception as error:
            print(f"  TFLite freshness CNN unavailable ({error})")

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

            # Freshness is only defined for the nine foods; "other" has no verdict.
            if freshness_from_label(folder_label) != "unknown":
                fresh_true.append(1 if freshness_from_label(folder_label) == "spoiled" else 0)
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

    evaluated_per_class = Counter(label for _, label in samples)
    foods_evaluated = sorted({food_name_from_label(name) or "unknown" for name in evaluated_per_class})
    foods_without = sorted(set(food_names) - set(foods_evaluated))

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "split": str(split_dir.relative_to(PROJECT_ROOT))
            if split_dir.is_relative_to(PROJECT_ROOT)
            else str(split_dir),
            "images": len(combined_true),
            "limitPerClass": limit_per_class or None,
            "durationSeconds": round(duration, 1),
            "trainDuplicatesExcluded": bool(exclude_hashes),
            "excludedTrainDuplicates": removed,
            "imagesFound": sum(found.values()),
            "imagesByClass": dict(sorted(evaluated_per_class.items())),
            "foodsEvaluated": foods_evaluated,
            "foodsWithoutIndependentImages": foods_without,
        },
        "tasks": {
            "food_identity": {
                "title": "Food Identification",
                "description": "Which food the CNN sees: one of 9 food types, or unknown.",
                "model": IDENTITY_MODEL_NAME,
                **classification_report(food_true, food_pred, food_names),
            },
            "freshness": {
                "title": "Freshness Detection",
                "description": "Fresh vs rotten. Recall on rotten is the safety-critical score.",
                "model": freshness_model_name or IDENTITY_MODEL_NAME,
                **binary_report(fresh_true, fresh_pred, freshness_names, positive_index=1),
            },
            "combined": {
                "title": "Combined Identity + Freshness",
                "description": "The raw identity head, food and freshness in one label.",
                "model": IDENTITY_MODEL_NAME,
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
    is_food = food_name_from_label(identity_names[int(identity_result.probs.top1)]) is not None
    classifier_rotten = identity_rotten_mass(probs, identity_names) if is_food else None

    cnn_rotten = None
    if freshness_cnn is not None:
        cnn_rotten = freshness_cnn.prob_rotten(Image.open(path))
    elif freshness_yolo is not None:
        cnn_rotten = yolo_prob_rotten(freshness_yolo.predict(path, verbose=False)[0])

    return 1 if fuse_freshness(cnn_rotten, classifier_rotten) >= 0.5 else 0


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

    dataset = report["dataset"]
    if dataset.get("trainDuplicatesExcluded"):
        print(
            f"Excluded {dataset['excludedTrainDuplicates']} of {dataset['imagesFound']} images "
            "that also appear in the training set."
        )
    if dataset.get("foodsWithoutIndependentImages"):
        print(
            "NOT MEASURED (no images the model has not trained on): "
            + ", ".join(dataset["foodsWithoutIndependentImages"])
        )

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
    parser.add_argument("--train-dir", type=Path, default=DEFAULT_TRAIN, help="Training images to exclude duplicates of")
    parser.add_argument(
        "--keep-train-duplicates",
        action="store_true",
        help="Score images that also appear in training (overstates accuracy)",
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
        None if args.keep_train_duplicates else args.train_dir,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print_summary(report)
    print(f"\nWrote {args.output}")


if __name__ == "__main__":
    main()
