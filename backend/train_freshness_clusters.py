"""Fit the per-food Gaussian Mixture Models that replace the freshness CNN.

A fully unsupervised fit (no labels at all) was tried first and measured: pooled
across every food it separated clusters by food type, not freshness (see
``freshness_cluster.py`` for the numbers). This instead reads the *identity* dataset,
which has a fresh/rotten split for each individual food, and for every food fits
three Gaussian components — fresh, sub-fresh, putrid — directly from the labelled
data: fresh and putrid take the mean/variance of that food's labelled fresh/rotten
training photos, sub-fresh takes their midpoint (mean) with their averaged variance
and a modest prior weight. ``GaussianMixture.fit`` can also refine these with
Expectation-Maximisation, the same way scikit-learn's ``GaussianMixture`` would, but
that was measured to make held-out accuracy worse here (79.1% at zero iterations down
to 75.0% at ten) — sub-fresh, reachable from both labelled sides, absorbs a growing
share of the data each iteration and starves the other two — so this project ships
with zero EM iterations, the default.

A new photo is then classified by whichever component has the highest posterior
probability *within its own food's mixture*. A pooled "default" mixture (fit the same
way from every food's photos) covers foods with too little data or an unrecognised
food.

Accuracy is measured on held-out val/test photos against their real fresh/rotten
label (comparing only the fresh/putrid posteriors, since there is no ground truth for
"sub-fresh") and written to the metadata sidecar, per food and overall.

    python backend/train_freshness_clusters.py
    python backend/train_freshness_clusters.py --limit 200   # quick run while testing
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, UnidentifiedImageError

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_v2" / "identity"
MODEL_PATH = PROJECT_ROOT / "runs" / "cluster" / "freshness_gmm.joblib"
MIN_PHOTOS_PER_FOOD = 20  # below this a food falls back to the pooled default mixture
SUBFRESH_PRIOR_WEIGHT = 0.2  # initial weight guess for the label-less middle component

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.freshness_cluster import (  # noqa: E402
    DEFAULT_FOOD_KEY,
    FEATURE_NAMES,
    TIER_BY_RANK,
    ColorScaler,
    GaussianMixture,
    color_features,
)
from backend.labels import OTHER_LABEL, food_name_from_label, freshness_from_label  # noqa: E402
from backend.metrics import binary_report  # noqa: E402

CLASS_NAMES = ["fresh", "rotten"]


def iter_class_folders(split: str):
    """Yield (food_name, freshness, folder) for every labelled class folder, skipping
    ``other`` (it carries no freshness opinion) and anything the label rules can't read.
    """
    split_dir = DATA_DIR / split
    if not split_dir.exists():
        return
    for folder in sorted(split_dir.iterdir()):
        if not folder.is_dir() or folder.name == OTHER_LABEL:
            continue
        food_name = food_name_from_label(folder.name)
        freshness = freshness_from_label(folder.name)
        if food_name is None or freshness not in ("fresh", "spoiled"):
            continue
        yield food_name, ("rotten" if freshness == "spoiled" else "fresh"), folder


def extract_folder(folder: Path, limit: int | None) -> np.ndarray:
    paths = sorted(folder.iterdir())
    if limit:
        paths = paths[:limit]
    features = []
    for path in paths:
        try:
            with Image.open(path) as image:
                features.append(color_features(image))
        except (UnidentifiedImageError, OSError):
            continue
    return np.stack(features) if features else np.empty((0, len(FEATURE_NAMES)), dtype=np.float32)


def collect_split(split: str, limit: int | None) -> dict[str, dict[str, np.ndarray]]:
    """food_name -> {"fresh": features, "rotten": features} for one dataset split."""
    by_food: dict[str, dict[str, np.ndarray]] = {}
    for food_name, label, folder in iter_class_folders(split):
        features = extract_folder(folder, limit)
        by_food.setdefault(food_name, {})[label] = features
    return by_food


def fit_gmm(fresh: np.ndarray, rotten: np.ndarray) -> tuple[ColorScaler, GaussianMixture]:
    """Fit a 3-component mixture (fresh/subfresh/putrid) for one food directly from
    its labelled statistics — no EM iterations (see freshness_cluster.py's module
    docstring and ``GaussianMixture.fit`` for why iterating was measured to make
    held-out accuracy worse, not better, here).
    """
    scaler = ColorScaler.fit(np.concatenate([fresh, rotten]))
    fresh_s, rotten_s = scaler.transform(fresh), scaler.transform(rotten)

    fresh_mean, fresh_var = fresh_s.mean(axis=0), fresh_s.var(axis=0)
    putrid_mean, putrid_var = rotten_s.mean(axis=0), rotten_s.var(axis=0)
    subfresh_mean = (fresh_mean + putrid_mean) / 2
    subfresh_var = (fresh_var + putrid_var) / 2

    init_means = np.stack([fresh_mean, subfresh_mean, putrid_mean])
    init_vars = np.maximum(np.stack([fresh_var, subfresh_var, putrid_var]), 1e-3)

    n_fresh, n_rotten = len(fresh), len(rotten)
    remaining = 1.0 - SUBFRESH_PRIOR_WEIGHT
    init_weights = np.array(
        [
            remaining * n_fresh / (n_fresh + n_rotten),
            SUBFRESH_PRIOR_WEIGHT,
            remaining * n_rotten / (n_fresh + n_rotten),
        ]
    )

    # n_iter=0 (the default): no EM loop runs, so this is exactly the label-derived
    # parameters above, with Fresh=index 0, Sub-Fresh=index 1, Putrid=index 2 already
    # in the right order — nothing to reorder. ``GaussianMixture.fit`` is still called
    # (rather than constructing directly) so a future change to the default, or a
    # deliberate experiment with n_iter > 0, goes through the one code path.
    pooled = np.concatenate([fresh_s, rotten_s])
    gmm = GaussianMixture.fit(pooled, init_means, init_vars, init_weights)
    return scaler, gmm


def evaluate(foods: dict[str, dict[str, Any]], split: str, limit: int | None) -> dict[str, Any]:
    """Accuracy, precision, recall and F1 of the fitted mixtures (fresh vs. putrid
    posterior) against the real label, per food and overall, on a held-out split.

    Positive class is "rotten" (``binary_report``'s convention elsewhere in this
    project too — see ``backend/metrics.py``): recall on rotten is the number that
    matters for food safety, since a missed rotten item is the costly error.
    """
    fresh_rank, putrid_rank = TIER_BY_RANK.index("fresh"), TIER_BY_RANK.index("putrid")
    y_true_by_food: dict[str, list[int]] = {}
    y_pred_by_food: dict[str, list[int]] = {}

    for food_name, label, folder in iter_class_folders(split):
        entry = foods.get(food_name, foods[DEFAULT_FOOD_KEY])
        scaler, gmm = entry["scaler"], entry["gmm"]
        features = extract_folder(folder, limit)
        if len(features) == 0:
            continue
        scaled = scaler.transform(features)
        posteriors = gmm.posterior(scaled)
        predicted = np.where(posteriors[:, fresh_rank] >= posteriors[:, putrid_rank], 0, 1)
        truth = 1 if label == "rotten" else 0

        y_true_by_food.setdefault(food_name, []).extend([truth] * len(features))
        y_pred_by_food.setdefault(food_name, []).extend(predicted.tolist())

    per_food: dict[str, Any] = {}
    all_true: list[int] = []
    all_pred: list[int] = []
    for food_name in sorted(y_true_by_food):
        y_true, y_pred = y_true_by_food[food_name], y_pred_by_food[food_name]
        report = binary_report(y_true, y_pred, CLASS_NAMES, positive_index=1)
        per_food[food_name] = {
            "accuracy": report["accuracy"],
            "precision": report["binary"]["precision"],
            "recall": report["binary"]["recall"],
            "f1": report["binary"]["f1"],
            "support": report["samples"],
            "confusion": {
                "truePositive": report["binary"]["truePositive"],
                "falsePositive": report["binary"]["falsePositive"],
                "falseNegative": report["binary"]["falseNegative"],
                "trueNegative": report["binary"]["trueNegative"],
            },
        }
        all_true.extend(y_true)
        all_pred.extend(y_pred)

    overall_report = binary_report(all_true, all_pred, CLASS_NAMES, positive_index=1) if all_true else None
    macro_across_foods = {
        metric: round(float(np.mean([per_food[f][metric] for f in per_food])), 4) if per_food else 0.0
        for metric in ("accuracy", "precision", "recall", "f1")
    }

    return {
        "perFood": per_food,
        # Pooled over every photo regardless of food (foods with more photos count
        # for more) — the number a confusion matrix over the whole split would give.
        "overallAccuracy": overall_report["accuracy"] if overall_report else 0.0,
        "overallPrecision": overall_report["binary"]["precision"] if overall_report else 0.0,
        "overallRecall": overall_report["binary"]["recall"] if overall_report else 0.0,
        "overallF1": overall_report["binary"]["f1"] if overall_report else 0.0,
        "overallConfusion": {
            "truePositive": overall_report["binary"]["truePositive"],
            "falsePositive": overall_report["binary"]["falsePositive"],
            "falseNegative": overall_report["binary"]["falseNegative"],
            "trueNegative": overall_report["binary"]["trueNegative"],
        }
        if overall_report
        else None,
        # Macro across foods (every food weighted equally, regardless of photo count)
        # — the fairer number when, as here, photo counts per food vary a lot.
        "macroAcrossFoods": macro_across_foods,
        "photos": len(all_true),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="cap images per class folder, for a quick test run")
    args = parser.parse_args()

    import joblib

    started = time.perf_counter()
    print(f"Reading training images from {DATA_DIR / 'train'} ...")
    by_food = collect_split("train", args.limit)

    all_fresh, all_rotten = [], []
    foods: dict[str, dict[str, Any]] = {}
    skipped: list[str] = []

    for food_name, labels in sorted(by_food.items()):
        fresh, rotten = labels.get("fresh"), labels.get("rotten")
        if fresh is None or rotten is None or len(fresh) < MIN_PHOTOS_PER_FOOD or len(rotten) < MIN_PHOTOS_PER_FOOD:
            skipped.append(food_name)
            continue
        all_fresh.append(fresh)
        all_rotten.append(rotten)
        scaler, gmm = fit_gmm(fresh, rotten)
        foods[food_name] = {"scaler": scaler, "gmm": gmm}
        print(f"  {food_name:12s} fresh={len(fresh):5d}  rotten={len(rotten):5d}")

    if skipped:
        print(f"  (too little data for a dedicated mixture, using the pooled default: {', '.join(skipped)})")

    default_scaler, default_gmm = fit_gmm(np.concatenate(all_fresh), np.concatenate(all_rotten))
    foods[DEFAULT_FOOD_KEY] = {"scaler": default_scaler, "gmm": default_gmm}

    print(f"\n{len(foods) - 1} foods got a dedicated mixture ({time.perf_counter() - started:.0f}s). Evaluating ...")
    val_report = evaluate(foods, "val", args.limit)
    test_report = evaluate(foods, "test", args.limit)
    print(
        f"  val:  accuracy={val_report['overallAccuracy'] * 100:.1f}%  "
        f"precision={val_report['overallPrecision'] * 100:.1f}%  "
        f"recall={val_report['overallRecall'] * 100:.1f}%  "
        f"f1={val_report['overallF1'] * 100:.1f}%  over {val_report['photos']} photos"
    )
    print(
        f"  test: accuracy={test_report['overallAccuracy'] * 100:.1f}%  "
        f"precision={test_report['overallPrecision'] * 100:.1f}%  "
        f"recall={test_report['overallRecall'] * 100:.1f}%  "
        f"f1={test_report['overallF1'] * 100:.1f}%  over {test_report['photos']} photos"
    )
    print(f"  (positive class = rotten; macro-across-foods: {test_report['macroAcrossFoods']})")
    for food_name, stats in sorted(test_report["perFood"].items(), key=lambda kv: kv[1]["accuracy"]):
        print(
            f"    {food_name:12s} acc={stats['accuracy'] * 100:5.1f}%  "
            f"prec={stats['precision'] * 100:5.1f}%  rec={stats['recall'] * 100:5.1f}%  "
            f"f1={stats['f1'] * 100:5.1f}%  ({stats['support']} photos)"
        )

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"foods": foods}, MODEL_PATH)

    metadata: dict[str, Any] = {
        "trainedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "method": "Gaussian Mixture Model (diagonal covariance), fit directly from labelled "
        "per-food statistics; zero EM iterations (measured to reduce accuracy, see module docstring)",
        "featureNames": FEATURE_NAMES,
        "foodsWithDedicatedMixtures": sorted(f for f in foods if f != DEFAULT_FOOD_KEY),
        "foodsUsingDefaultMixture": skipped,
        "valAccuracy": val_report,
        "testAccuracy": test_report,
    }
    MODEL_PATH.with_suffix(".json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"\nSaved {MODEL_PATH} and {MODEL_PATH.with_suffix('.json').name}")


if __name__ == "__main__":
    main()
