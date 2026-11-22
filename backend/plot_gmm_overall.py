"""The freshness GMM's result as a single, whole-algorithm figure: one confusion
matrix and one accuracy/precision/recall/F1 bar chart, pooled over every food —
not broken down per food (see ``plot_gmm_metrics.py`` for that view).

Reads ``runs/cluster/freshness_gmm.json`` (written by ``train_freshness_clusters.py``);
positive class is "rotten" throughout, matching this project's convention elsewhere
(``backend/metrics.py: binary_report``) — a missed rotten item is the costly error.

    python backend/plot_gmm_overall.py

Writes ``backend/metrics/gmm_overall_results.png``.
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
OUT_PNG = ROOT / "backend" / "metrics" / "gmm_overall_results.png"

BLUE, ORANGE, GREEN, PURPLE = "#2a78d6", "#eb6834", "#2fa84f", "#8457d6"
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--split", choices=["val", "test"], default="test")
    parser.add_argument("--out", type=Path, default=OUT_PNG)
    args = parser.parse_args()

    metadata = json.loads(MODEL_JSON.read_text(encoding="utf-8"))
    report = metadata["testAccuracy" if args.split == "test" else "valAccuracy"]
    confusion = report["overallConfusion"]

    fig, (ax_cm, ax_bar) = plt.subplots(1, 2, figsize=(11, 5), facecolor=SURFACE, gridspec_kw={"width_ratios": [1, 1.3]})

    # --- confusion matrix: rows = actual, columns = predicted, fresh then rotten ---
    ax_cm.set_facecolor(SURFACE)
    matrix = np.array(
        [
            [confusion["trueNegative"], confusion["falsePositive"]],  # actual fresh
            [confusion["falseNegative"], confusion["truePositive"]],  # actual rotten
        ]
    )
    im = ax_cm.imshow(matrix, cmap="Blues", vmin=0)
    for i in range(2):
        for j in range(2):
            value = matrix[i, j]
            color = "white" if value > matrix.max() * 0.5 else INK
            ax_cm.text(j, i, f"{value:,}", ha="center", va="center", color=color, fontsize=15, fontweight="bold")
    ax_cm.set_xticks([0, 1])
    ax_cm.set_yticks([0, 1])
    ax_cm.set_xticklabels(["fresh", "rotten"], color=INK)
    ax_cm.set_yticklabels(["fresh", "rotten"], color=INK)
    ax_cm.set_xlabel("predicted", color=INK_2)
    ax_cm.set_ylabel("actual", color=INK_2)
    ax_cm.set_title("Confusion matrix (pooled, every food)", color=INK, fontsize=11)
    for spine in ax_cm.spines.values():
        spine.set_visible(False)

    # --- the four headline numbers ---
    ax_bar.set_facecolor(SURFACE)
    names = ["Accuracy", "Precision", "Recall", "F1"]
    keys = ["overallAccuracy", "overallPrecision", "overallRecall", "overallF1"]
    values = [report[k] * 100 for k in keys]
    colors = [BLUE, ORANGE, GREEN, PURPLE]
    bars = ax_bar.bar(names, values, color=colors, width=0.55)
    ax_bar.bar_label(bars, fmt="%.1f%%", color=INK, fontsize=12, padding=4)
    ax_bar.set_ylim(0, 108)
    ax_bar.set_ylabel("%", color=INK)
    ax_bar.tick_params(colors=INK_2, labelsize=11)
    ax_bar.grid(True, axis="y", color=GRID, linewidth=0.6)
    for spine in ax_bar.spines.values():
        spine.set_color(GRID)
    n = confusion["truePositive"] + confusion["falsePositive"] + confusion["falseNegative"] + confusion["trueNegative"]
    ax_bar.set_title(f"Overall result ({args.split} split, n={n:,} photos, positive class = rotten)", color=INK, fontsize=11)

    fig.suptitle("Freshness GMM — whole-algorithm result (all 12 foods pooled)", color=INK, fontsize=13)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.out, dpi=180, facecolor=SURFACE)
    print(f"Saved {args.out}")
    print(f"accuracy={report['overallAccuracy']*100:.1f}%  precision={report['overallPrecision']*100:.1f}%  "
          f"recall={report['overallRecall']*100:.1f}%  f1={report['overallF1']*100:.1f}%")


if __name__ == "__main__":
    main()
