"""Accuracy / precision / recall / F1 of the shipped freshness GMM, per food and
overall — the classification results table a thesis adviser asks for, as a chart.

Not to be confused with ``plot_gmm_bic.py``: that is an unsupervised model-selection
check (how many Gaussian components the colour data statistically supports); this
reads the *supervised* fresh/rotten classification performance of the model this
project actually ships (``train_freshness_clusters.py``'s ``evaluate``, positive
class = rotten), already saved in ``runs/cluster/freshness_gmm.json``.

    python backend/plot_gmm_metrics.py

Writes ``backend/metrics/gmm_classification_metrics.png``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MODEL_JSON = ROOT / "runs" / "cluster" / "freshness_gmm.json"
OUT_PNG = ROOT / "backend" / "metrics" / "gmm_classification_metrics.png"

BLUE, ORANGE, GREEN, PURPLE = "#2a78d6", "#eb6834", "#2fa84f", "#8457d6"
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
METRICS = [("accuracy", "Accuracy", BLUE), ("precision", "Precision", ORANGE), ("recall", "Recall", GREEN), ("f1", "F1", PURPLE)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--split", choices=["val", "test"], default="test")
    parser.add_argument("--out", type=Path, default=OUT_PNG)
    args = parser.parse_args()

    metadata = json.loads(MODEL_JSON.read_text(encoding="utf-8"))
    report = metadata["testAccuracy" if args.split == "test" else "valAccuracy"]

    rows = sorted(report["perFood"].items(), key=lambda kv: kv[1]["accuracy"])
    labels = [name for name, _ in rows] + ["macro avg", "overall"]
    values = {m: [stats[m] for _, stats in rows] for m, _, _ in METRICS}
    values["accuracy"] += [report["macroAcrossFoods"]["accuracy"], report["overallAccuracy"]]
    values["precision"] += [report["macroAcrossFoods"]["precision"], report["overallPrecision"]]
    values["recall"] += [report["macroAcrossFoods"]["recall"], report["overallRecall"]]
    values["f1"] += [report["macroAcrossFoods"]["f1"], report["overallF1"]]

    n = len(labels)
    x = np.arange(n)
    width = 0.2

    fig, ax = plt.subplots(figsize=(13, 6), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)
    for i, (key, title, color) in enumerate(METRICS):
        offset = (i - 1.5) * width
        bars = ax.bar(x + offset, [v * 100 for v in values[key]], width, label=title, color=color)
        ax.bar_label(bars, fmt="%.0f", fontsize=6.5, color=INK_2, padding=1)

    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=35, ha="right", color=INK, fontsize=9)
    for label in ax.get_xticklabels()[-2:]:
        label.set_fontweight("bold")
    ax.axvline(n - 2.5, color=INK_2, linestyle=":", linewidth=1, alpha=0.6)
    ax.set_ylabel("%", color=INK)
    ax.set_ylim(0, 108)
    ax.tick_params(colors=INK_2)
    ax.grid(True, axis="y", color=GRID, linewidth=0.6)
    for spine in ax.spines.values():
        spine.set_color(GRID)
    ax.legend(facecolor=SURFACE, edgecolor=GRID, ncol=4, loc="lower center", bbox_to_anchor=(0.5, -0.32))
    ax.set_title(
        f"Freshness GMM: classification results per food ({args.split} split, positive class = rotten)",
        color=INK,
        fontsize=12,
    )
    fig.tight_layout()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.out, dpi=180, facecolor=SURFACE, bbox_inches="tight")
    print(f"Saved {args.out}")


if __name__ == "__main__":
    main()
