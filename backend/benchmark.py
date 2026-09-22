"""Measure the E-REF models on every held-out image set and write the metrics report.

Each set answers a different question, and none of their images were used to train
the models being scored:

  heldout_split     images set aside from the training pool (same photographers and
                    scenes as training, so the friendliest test)
  original_val      the original dataset's ``val``/``Test`` images that are NOT also in
                    ``train`` (apples, bananas and oranges only)
  meat_external     ``dataset2/test``: fresh vs rotten beef from a separate collection
  unknown_foods     foods the model never trained on (persimmon, peach, mango, grape...);
                    the right answer is "unknown"
  white_background  Dataset-FV's unlabelled cut-out photos of the app's foods, a very
                    different look from the training photos

The first set feeds the headline numbers the app shows; the rest are listed beside
it. ``--baseline`` also scores the previous models on the same images.

    python backend/build_dataset.py
    python backend/train.py
    python backend/benchmark.py
    python backend/benchmark.py --tune      # sweep the fusion weight / unknown threshold on val
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pipeline  # noqa: E402
from labels import food_name_from_label, freshness_from_label  # noqa: E402
from metrics import binary_report, classification_report  # noqa: E402
from pipeline import (  # noqa: E402
    FRESHNESS_TFLITE_PATH,
    FRESHNESS_V2_PATH,
    IDENTITY_MODEL_NAME,
    IDENTITY_V1_PATH,
    IDENTITY_V2_PATH,
    PROJECT_ROOT,
    _TFLiteFreshness,
    identity_rotten_mass,
    yolo_prob_rotten,
)

DATA = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_v2"
ORIG = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "food_multiclass"
ORIG_TEST = PROJECT_ROOT / "Datasets" / "dataset" / "Test"
SEM = PROJECT_ROOT / "Datasets" / "Dataset-FV" / "sem_classificacao"
OUTPUT = Path(__file__).resolve().parent / "metrics" / "model_metrics.json"
EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
CHUNK = 32

SEM_FOODS = {
    "banana": "banana",
    "laranja": "orange",
    "maca": "apple",
    "pepino": "cucumber",
    "pimentao": "capsicum",
    "tomate": "tomato",
    "batata": "potato",
}
UNKNOWN = "unknown"


# ----------------------------------------------------------------------- sets


class Item:
    """One image and whatever is known about it. ``None`` means not labelled."""

    __slots__ = ("path", "label", "food", "rotten")

    def __init__(self, path: Path, label: str | None = None, food: str | None = None, rotten: int | None = None):
        self.path = path
        self.label = label  # dataset label, e.g. "rotten_tomato" or "other"
        self.food = food  # food name, or "unknown"
        self.rotten = rotten  # 1 rotten, 0 fresh


def _images(folder: Path) -> list[Path]:
    return sorted(f for f in folder.rglob("*") if f.is_file() and f.suffix.lower() in EXTS)


def _md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def _spread(files: list, cap: int) -> list:
    if cap <= 0 or len(files) <= cap:
        return files
    step = len(files) / cap
    return [files[int(i * step)] for i in range(cap)]


def _from_identity_folder(root: Path) -> dict[str, Item]:
    items: dict[str, Item] = {}
    if not root.exists():
        return items
    for class_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        for f in _images(class_dir):
            food = food_name_from_label(class_dir.name) or UNKNOWN
            items[f.name] = Item(f, label=class_dir.name, food=food)
    return items


def _attach_freshness(items: dict[str, Item], root: Path) -> list[Item]:
    """Merge freshness truth (same file names) into identity items; return the full list."""
    merged = dict(items)
    if root.exists():
        for class_dir in sorted(p for p in root.iterdir() if p.is_dir()):
            rotten = 1 if class_dir.name.startswith("rot") else 0
            for f in _images(class_dir):
                if f.name in merged:
                    merged[f.name].rotten = rotten
                else:
                    merged[f.name] = Item(f, rotten=rotten)
    return list(merged.values())


def gather_sets(sem_per_food: int) -> dict[str, dict]:
    sets: dict[str, dict] = {}

    test = _attach_freshness(_from_identity_folder(DATA / "identity" / "test"), DATA / "freshness" / "test")
    sets["heldout_split"] = {
        "title": "Held-out split",
        "description": (
            "Images set aside from the training collection. Same photographers and scenes as "
            "training, so this is the easiest of the tests."
        ),
        "items": test,
    }

    # original val/Test images the original training set never contained
    train_hashes = {_md5(f) for f in _images(ORIG / "train")}
    original: list[Item] = []
    seen: set[str] = set()
    for folder in (ORIG / "val", ORIG_TEST):
        if not folder.exists():
            continue
        for class_dir in sorted(p for p in folder.iterdir() if p.is_dir()):
            for f in _images(class_dir):
                digest = _md5(f)
                if digest in train_hashes or digest in seen:
                    continue
                seen.add(digest)
                original.append(
                    Item(
                        f,
                        label=class_dir.name,
                        food=food_name_from_label(class_dir.name) or UNKNOWN,
                        rotten=1 if freshness_from_label(class_dir.name) == "spoiled" else 0,
                    )
                )
    sets["original_val"] = {
        "title": "Original dataset, unseen images",
        "description": (
            "Images from the original dataset's val/Test folders that the training set does not "
            "contain. Only apple, banana and orange have any."
        ),
        "items": original,
    }

    meat = [
        Item(f, rotten=1 if cls.name == "rotten" else 0)
        for cls in sorted(p for p in (DATA / "freshness_ext").iterdir() if p.is_dir())
        for f in _images(cls)
    ] if (DATA / "freshness_ext").exists() else []
    sets["meat_external"] = {
        "title": "Fresh vs rotten beef, separate collection",
        "description": "dataset2/test: beef photos from a different collection than dataset2/train.",
        "items": meat,
    }

    unknown = [Item(f, label="other", food=UNKNOWN) for f in _images(DATA / "identity_unseen")]
    sets["unknown_foods"] = {
        "title": "Foods the model has never seen",
        "description": (
            "Persimmon, peach, mango, pear, grape, kiwi, corn, onion, carrot, aubergine and beef. "
            "The right answer is 'unknown'."
        ),
        "items": unknown,
    }

    trained = {p.stem for p in _images(DATA / "identity")} | train_hashes
    white: list[Item] = []
    for pt, food in SEM_FOODS.items():
        files = [f for f in _images(SEM / pt) if _md5(f) not in trained]
        white.extend(Item(f, food=food) for f in _spread(files, sem_per_food))
    sets["white_background"] = {
        "title": "Cut-out photos on white",
        "description": (
            "Dataset-FV's unlabelled photos of the app's foods, mostly single items on a plain "
            "background. Nothing like them was used for training the app's foods."
        ),
        "items": white,
    }
    return sets


def gather_validation() -> list[Item]:
    val = _attach_freshness(_from_identity_folder(DATA / "identity" / "val"), DATA / "freshness" / "val")
    return val


# ---------------------------------------------------------------- predictions


class Predictor:
    """Runs the identity and freshness models once per image and keeps the raw outputs."""

    def __init__(self, identity_path: Path, freshness_yolo: Path | None, freshness_tflite: Path | None, device: str):
        from ultralytics import YOLO

        self.device = device
        self.identity = YOLO(str(identity_path))
        self.names = [str(self.identity.names[i]) for i in range(len(self.identity.names))]
        self.freshness_yolo = YOLO(str(freshness_yolo)) if freshness_yolo and freshness_yolo.exists() else None
        self.freshness_tflite = None
        if freshness_tflite and freshness_tflite.exists():
            self.freshness_tflite = _TFLiteFreshness(freshness_tflite)

    def run(self, paths: list[Path]) -> dict[str, np.ndarray]:
        probs = np.zeros((len(paths), len(self.names)), dtype=np.float32)
        cnn = np.full(len(paths), np.nan, dtype=np.float32)
        started = time.perf_counter()
        for start in range(0, len(paths), CHUNK):
            chunk = [str(p) for p in paths[start : start + CHUNK]]
            for offset, result in enumerate(self.identity.predict(chunk, verbose=False, device=self.device)):
                probs[start + offset] = result.probs.data.cpu().numpy()
            if self.freshness_yolo is not None:
                for offset, result in enumerate(self.freshness_yolo.predict(chunk, verbose=False, device=self.device)):
                    value = yolo_prob_rotten(result)
                    cnn[start + offset] = np.nan if value is None else value
            elif self.freshness_tflite is not None:
                for offset, path in enumerate(chunk):
                    with Image.open(path) as im:
                        cnn[start + offset] = self.freshness_tflite.prob_rotten(im)
            done = min(start + CHUNK, len(paths))
            print(f"    {done}/{len(paths)} ({done / (time.perf_counter() - started):.0f} img/s)", end="\r", flush=True)
        print()
        return {"probs": probs, "cnn": cnn}


# -------------------------------------------------------------------- scoring


def _predicted(probs: np.ndarray, names: list[str], min_confidence: float) -> tuple[np.ndarray, list[str]]:
    """Top-1 class per row, with low-confidence rows sent to the ``other`` class."""
    other = names.index("other") if "other" in names else None
    top = probs.argmax(axis=1)
    if other is not None and min_confidence > 0:
        top = np.where(probs.max(axis=1) < min_confidence, other, top)
    return top, [names[i] for i in top]


def fused_rotten(probs: np.ndarray, cnn: np.ndarray, names: list[str], top: np.ndarray, cnn_weight: float) -> np.ndarray:
    """Vectorised twin of ``pipeline.fuse_freshness`` over every row."""
    out = np.zeros(len(probs))
    for i in range(len(probs)):
        is_food = food_name_from_label(names[top[i]]) is not None
        mass = identity_rotten_mass(probs[i], names) if is_food else None
        c = None if np.isnan(cnn[i]) else float(cnn[i])
        if c is None and mass is None:
            out[i] = 0.5
        elif c is None:
            out[i] = mass
        elif mass is None:
            out[i] = c
        else:
            out[i] = cnn_weight * c + (1 - cnn_weight) * mass
    return out


def score(items: list[Item], pred: dict[str, np.ndarray], names: list[str], model_names: dict, *, min_confidence: float, cnn_weight: float) -> dict:
    top, labels = _predicted(pred["probs"], names, min_confidence)
    foods = sorted({food_name_from_label(n) or UNKNOWN for n in names} | {UNKNOWN})
    food_index = {f: i for i, f in enumerate(foods)}
    tasks: dict = {}

    rows = [i for i, it in enumerate(items) if it.food is not None]
    if rows:
        truth = [food_index.get(items[i].food, food_index[UNKNOWN]) for i in rows]
        guess = [food_index[food_name_from_label(labels[i]) or UNKNOWN] for i in rows]
        tasks["food_identity"] = {
            "title": "Food Identification",
            "description": "Which food the CNN sees: one of 9 food types, or unknown.",
            "model": model_names["identity"],
            **classification_report(truth, guess, foods),
        }

    rows = [i for i, it in enumerate(items) if it.rotten is not None]
    if rows:
        rotten = fused_rotten(pred["probs"], pred["cnn"], names, top, cnn_weight)
        tasks["freshness"] = {
            "title": "Freshness Detection",
            "description": "Fresh vs rotten. Recall on rotten is the safety-critical score.",
            "model": model_names["freshness"],
            **binary_report([items[i].rotten for i in rows], [int(rotten[i] >= 0.5) for i in rows], ["fresh", "rotten"], positive_index=1),
        }

    rows = [i for i, it in enumerate(items) if it.label is not None and it.label in names]
    if rows and any(items[i].label != "other" for i in rows):
        index = {n: i for i, n in enumerate(names)}
        tasks["combined"] = {
            "title": "Combined Identity + Freshness",
            "description": "The raw identity head, food and freshness in one label.",
            "model": model_names["identity"],
            **classification_report([index[items[i].label] for i in rows], [index[labels[i]] for i in rows], names),
        }
    return tasks


def describe(items: list[Item]) -> dict:
    per_food: dict[str, int] = {}
    for it in items:
        if it.food:
            per_food[it.food] = per_food.get(it.food, 0) + 1
    return {"images": len(items), "imagesByFood": dict(sorted(per_food.items()))}


def summary_line(tasks: dict) -> str:
    bits = []
    for key, short in (("food_identity", "food"), ("freshness", "freshness"), ("combined", "combined")):
        if key in tasks:
            bits.append(f"{short} {tasks[key]['accuracy'] * 100:5.1f}%")
    binary = tasks.get("freshness", {}).get("binary")
    if binary:
        bits.append(f"rotten recall {binary['recall'] * 100:5.1f}%")
    return "  ".join(bits)


# ----------------------------------------------------------------------- main


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--identity", type=Path, default=IDENTITY_V2_PATH)
    parser.add_argument("--freshness-yolo", type=Path, default=FRESHNESS_V2_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--sem-per-food", type=int, default=100)
    parser.add_argument("--min-confidence", type=float, default=pipeline.MIN_IDENTITY_CONFIDENCE)
    parser.add_argument("--cnn-weight", type=float, default=pipeline.CNN_WEIGHT)
    parser.add_argument("--baseline", action="store_true", help="also score the previous models on the same images")
    parser.add_argument("--tune", action="store_true", help="sweep fusion weight and unknown threshold on the val split")
    args = parser.parse_args()

    if not args.identity.exists():
        raise SystemExit(f"Identity model not found: {args.identity}")

    new = Predictor(args.identity, args.freshness_yolo, None, args.device)
    model_names = {
        "identity": IDENTITY_MODEL_NAME,
        "freshness": "yolov8n-cls-freshness" if new.freshness_yolo is not None else "none",
    }

    if args.tune:
        tune(new, args)
        return

    print("Gathering held-out sets ...", flush=True)
    sets = gather_sets(args.sem_per_food)
    for key, entry in sets.items():
        print(f"  {key:<18}{len(entry['items']):>6} images", flush=True)

    unique: dict[Path, int] = {}
    for entry in sets.values():
        for it in entry["items"]:
            unique.setdefault(it.path, len(unique))
    paths = list(unique)

    print(f"Running the retrained models over {len(paths)} images ...", flush=True)
    new_pred = new.run(paths)

    baseline_pred = None
    baseline_names = None
    if args.baseline:
        print("Running the previous models over the same images ...", flush=True)
        old = Predictor(IDENTITY_V1_PATH, None, FRESHNESS_TFLITE_PATH, args.device)
        baseline_pred = old.run(paths)
        baseline_names = old.names

    def subset(pred: dict, items: list[Item]) -> dict:
        ids = [unique[it.path] for it in items]
        return {k: v[ids] for k, v in pred.items()}

    benchmarks = []
    print()
    for key, entry in sets.items():
        items = entry["items"]
        if not items:
            continue
        tasks = score(items, subset(new_pred, items), new.names, model_names, min_confidence=args.min_confidence, cnn_weight=args.cnn_weight)
        record = {"id": key, "title": entry["title"], "description": entry["description"], "dataset": describe(items), "tasks": tasks}
        line = f"{entry['title'][:40]:<42}{summary_line(tasks)}"
        if baseline_pred is not None:
            old_tasks = score(
                items,
                subset(baseline_pred, items),
                baseline_names,
                {"identity": "yolov8n-cls (food_multiclass)", "freshness": "mobilenetv2-tflite"},
                min_confidence=0,
                cnn_weight=0.65,
            )
            record["baseline"] = {"tasks": old_tasks}
            line += f"\n{'   previous models':<42}{summary_line(old_tasks)}"
        print(line)
        benchmarks.append(record)

    headline = next(b for b in benchmarks if b["id"] == "heldout_split")
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "split": "eref_v2 held-out split",
            "images": headline["dataset"]["images"],
            "imagesByClass": headline["dataset"]["imagesByFood"],
            "trainDuplicatesExcluded": True,
        },
        "tasks": headline["tasks"],
        "benchmarks": benchmarks,
        "settings": {"minIdentityConfidence": args.min_confidence, "cnnWeight": args.cnn_weight},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nWrote {args.output}")


def tune(model: Predictor, args) -> None:
    """Pick the two free settings on the validation split, never on a test set."""
    items = gather_validation()
    print(f"Validation split: {len(items)} images", flush=True)
    pred = model.run([it.path for it in items])
    names = model.names

    print("\nUnknown-food threshold (identity, macro-F1 over foods):")
    for t in (0.0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8):
        tasks = score(items, pred, names, {"identity": "", "freshness": ""}, min_confidence=t, cnn_weight=args.cnn_weight)
        ident = tasks["food_identity"]
        print(f"  {t:.2f}  accuracy {ident['accuracy'] * 100:5.2f}%  macro-F1 {ident['macro']['f1'] * 100:5.2f}%")

    print("\nFreshness fusion weight on the CNN (0 = identity head only, 1 = CNN only):")
    for w in (0.0, 0.3, 0.5, 0.65, 0.8, 1.0):
        tasks = score(items, pred, names, {"identity": "", "freshness": ""}, min_confidence=args.min_confidence, cnn_weight=w)
        fr = tasks["freshness"]
        print(f"  {w:.2f}  accuracy {fr['accuracy'] * 100:5.2f}%  rotten recall {fr['binary']['recall'] * 100:5.2f}%")


if __name__ == "__main__":
    main()
