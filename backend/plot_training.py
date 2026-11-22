"""Plot the training curves of the three E-REF models.

Reads the per-epoch ``results.csv`` that Ultralytics writes for each run and
draws one row per model: train vs validation loss on the left, validation
accuracy (top-1 for the classifiers, mAP for the detector) on the right.

Note that the classifiers' validation split overlaps the training set (see
evaluate.py), so their validation accuracy here is optimistic; the held-out
scores are in ``backend/metrics/model_metrics.json``.

Usage (from the project root):

    python backend/plot_training.py
    python backend/plot_training.py --out docs/training.png

Writes ``backend/metrics/training_curves.png`` by default.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CLASSIFY = ROOT / "runs" / "classify" / "runs" / "classify"

RUNS = [
    ("Food identity (YOLOv8n-cls)", CLASSIFY / "eref_identity_v2" / "results.csv", "classify"),
    ("Freshness (YOLOv8n-cls)", CLASSIFY / "eref_freshness_v2" / "results.csv", "classify"),
    ("Food detector (YOLOv8n)", ROOT / "runs" / "detect" / "eref_detector_v1" / "results.csv", "detect"),
]

BLUE, ORANGE = "#2a78d6", "#eb6834"
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"


def read_csv(path: Path) -> dict[str, list[float]]:
    with path.open(newline="") as f:
        rows = list(csv.DictReader(f))
    return {k.strip(): [float(r[k]) for r in rows] for k in rows[0]}


def style(ax, title: str, ylabel: str) -> None:
    ax.set_facecolor(SURFACE)
    ax.set_title(title, loc="left", fontsize=11, color=INK, fontweight="bold")
    ax.set_ylabel(ylabel, color=INK_2, fontsize=9)
    ax.set_xlabel("Epoch", color=INK_2, fontsize=9)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.tick_params(colors=INK_2, labelsize=8, length=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)


def line(ax, x, y, color, label, dashed=False) -> None:
    ax.plot(x, y, color=color, linewidth=2, linestyle="--" if dashed else "-",
            marker="o", markersize=3.5, label=f"{label} (final {y[-1]:.4f})")


def mark_best(ax, x, y, higher_is_better=True) -> None:
    i = max(range(len(y)), key=lambda k: y[k] if higher_is_better else -y[k])
    ax.scatter([x[i]], [y[i]], s=70, facecolor="none", edgecolor=INK, linewidth=1.2, zorder=5,
               label=f"Best {y[i]:.4f} at epoch {int(x[i])}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=ROOT / "backend" / "metrics" / "training_curves.png")
    args = parser.parse_args()

    fig, axes = plt.subplots(len(RUNS), 2, figsize=(12, 4 * len(RUNS)), facecolor=SURFACE)
    for row, (name, path, kind) in zip(axes, RUNS):
        d = read_csv(path)
        x = d["epoch"]
        loss_ax, acc_ax = row

        if kind == "classify":
            train_loss, val_loss = d["train/loss"], d["val/loss"]
            loss_label = "Cross-entropy loss"
        else:
            parts = ("box_loss", "cls_loss", "dfl_loss")
            train_loss = [sum(v) for v in zip(*(d[f"train/{p}"] for p in parts))]
            val_loss = [sum(v) for v in zip(*(d[f"val/{p}"] for p in parts))]
            loss_label = "Loss (box + cls + dfl)"

        style(loss_ax, f"{name} — loss", loss_label)
        line(loss_ax, x, train_loss, BLUE, "Train")
        line(loss_ax, x, val_loss, ORANGE, "Validation", dashed=True)
        loss_ax.set_ylim(bottom=0)
        loss_ax.legend(frameon=False, fontsize=8, labelcolor=INK)

        if kind == "classify":
            style(acc_ax, f"{name} — validation accuracy", "Top-1 accuracy")
            line(acc_ax, x, d["metrics/accuracy_top1"], BLUE, "Top-1 accuracy")
            mark_best(acc_ax, x, d["metrics/accuracy_top1"])
            acc_ax.legend(frameon=False, fontsize=8, labelcolor=INK, loc="lower right")
        else:
            style(acc_ax, f"{name} — validation mAP", "mAP")
            line(acc_ax, x, d["metrics/mAP50(B)"], BLUE, "mAP@0.5")
            line(acc_ax, x, d["metrics/mAP50-95(B)"], ORANGE, "mAP@0.5:0.95", dashed=True)
            mark_best(acc_ax, x, d["metrics/mAP50-95(B)"])
            acc_ax.legend(frameon=False, fontsize=8, labelcolor=INK, loc="lower right")
        acc_ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=1))

        for ax in row:
            ax.set_xlim(0.5, x[-1] + 0.5)
            ax.set_xticks(range(1, int(x[-1]) + 1, 2 if x[-1] > 10 else 1))

    fig.suptitle("E-REF model training curves", x=0.01, ha="left", fontsize=14,
                 fontweight="bold", color=INK)
    fig.tight_layout(rect=(0, 0, 1, 0.98))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.out, dpi=200, facecolor=SURFACE)
    print(f"Wrote {args.out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
