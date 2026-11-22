"""Group every photo in the identity dataset into Fresh / Sub-Fresh / Putrid, per food.

Answers "find all datasets of food clustered based on freshness": applies the trained
per-food Gaussian Mixture Models (``train_freshness_clusters.py``) to every photo in
train/val/test and counts how many land in each tier, per food. Unlike the
training/evaluation report (which only checks fresh vs. putrid against the known
label), this also shows where Sub-Fresh falls — the tier with no ground truth of its
own.

    python backend/cluster_dataset_breakdown.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_v2" / "identity"
MODEL_PATH = PROJECT_ROOT / "runs" / "cluster" / "freshness_gmm.joblib"
OUT_PATH = PROJECT_ROOT / "backend" / "metrics" / "freshness_cluster_breakdown.json"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.freshness_cluster import FreshnessClusterer  # noqa: E402
from backend.labels import OTHER_LABEL, food_name_from_label, freshness_from_label  # noqa: E402


def main() -> None:
    clusterer = FreshnessClusterer(MODEL_PATH)
    started = time.perf_counter()
    breakdown: dict[str, Any] = {}

    for split in ("train", "val", "test"):
        split_dir = DATA_DIR / split
        if not split_dir.exists():
            continue
        for folder in sorted(split_dir.iterdir()):
            if not folder.is_dir() or folder.name == OTHER_LABEL:
                continue
            food_name = food_name_from_label(folder.name)
            freshness = freshness_from_label(folder.name)
            if food_name is None or freshness not in ("fresh", "spoiled"):
                continue
            label = "rotten" if freshness == "spoiled" else "fresh"

            tiers = breakdown.setdefault(food_name, {}).setdefault(
                split, {"fresh": 0, "subfresh": 0, "putrid": 0, "labelledFresh": 0, "labelledRotten": 0}
            )
            for path in sorted(folder.iterdir()):
                try:
                    with Image.open(path) as image:
                        tier = clusterer.assess(image, food_name)["tier"]
                except (UnidentifiedImageError, OSError):
                    continue
                tiers[tier] += 1
                tiers["labelledFresh" if label == "fresh" else "labelledRotten"] += 1

    print(f"Clustered the dataset by freshness in {time.perf_counter() - started:.0f}s.")
    for food_name, splits in sorted(breakdown.items()):
        totals = {"fresh": 0, "subfresh": 0, "putrid": 0}
        for tiers in splits.values():
            for tier in totals:
                totals[tier] += tiers[tier]
        print(f"  {food_name:12s} fresh={totals['fresh']:5d}  subfresh={totals['subfresh']:5d}  putrid={totals['putrid']:5d}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(breakdown, indent=2), encoding="utf-8")
    print(f"\nSaved {OUT_PATH}")


if __name__ == "__main__":
    main()
