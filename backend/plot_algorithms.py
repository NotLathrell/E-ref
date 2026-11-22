"""Plot the training curves of the algorithms compared in the CNN notebook.

``Datasets/dataset/cnn-final-file.ipynb`` trains three freshness classifiers on
the Kaggle "Fresh and Stale" dataset (the app's MobileNetV2 fallback comes from
this work):

  Custom CNN   four conv blocks trained from scratch
  MobileNetV2  ImageNet transfer learning, then the last 40 layers fine-tuned
  ResNet50     ImageNet transfer learning, then the last 40 layers fine-tuned

The per-epoch numbers are parsed from the Keras logs saved in the notebook's
output, and the test-set scores from its comparison table, so nothing is retrained.
Two figures are written:

  algorithm_training_curves.png  train vs validation loss and accuracy per model
  algorithm_comparison.png       the three models overlaid, plus test accuracy
                                 and training time

Usage (from the project root):

    python backend/plot_algorithms.py
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import PercentFormatter  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
NOTEBOOK = ROOT / "Datasets" / "dataset" / "cnn-final-file.ipynb"
OUT_DIR = ROOT / "backend" / "metrics"

# Categorical slots 1-3, validated as a set; line style is the secondary encoding.
COLORS = {"Custom CNN": "#2a78d6", "MobileNetV2": "#eb6834", "ResNet50": "#1baf7a"}
STYLES = {"Custom CNN": "-", "MobileNetV2": "--", "ResNet50": ":"}
BLUE, ORANGE = "#2a78d6", "#eb6834"
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"

ANSI = re.compile(r"\x1b\[[0-9;]*m")
METRIC = re.compile(r"(val_accuracy|val_loss|accuracy|loss): ([0-9.e+-]+)")


def cell_text(cell) -> str:
    out = ""
    for o in cell.get("outputs", []):
        out += "".join(o["text"]) if "text" in o else "".join(o.get("data", {}).get("text/plain", []))
    return ANSI.sub("", out)


def parse_histories(nb) -> dict[str, dict]:
    """Return {model: {loss, accuracy, val_loss, val_accuracy, fine_tune_start}}."""
    log = next(cell_text(c) for c in nb["cells"] if "===== Training" in cell_text(c))
    runs: dict[str, dict] = {}
    current = None
    for line in re.split(r"[\r\n]+", log):
        if m := re.match(r"===== Training (.+) =====", line.strip()):
            current = runs.setdefault(m.group(1), {"loss": [], "accuracy": [], "val_loss": [],
                                                   "val_accuracy": [], "fine_tune_start": None})
        elif current is not None and line.startswith("Fine-tuning"):
            current["fine_tune_start"] = len(current["loss"]) + 1
        elif current is not None and "val_loss" in line:
            for key, value in METRIC.findall(line):
                current[key].append(float(value))
    return runs


def parse_test_scores(nb) -> dict[str, dict]:
    """Test accuracy, weighted F1 and training seconds from the comparison table."""
    for c in nb["cells"]:
        text = cell_text(c)
        if "training_time_seconds" in text and "overall_finding" in text:
            scores = {}
            for name in COLORS:
                if m := re.search(rf"\d+\s+{re.escape(name)}\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)", text):
                    scores[name] = {"accuracy": float(m[1]), "f1": float(m[2]), "seconds": float(m[3])}
            return scores
    return {}


def style(ax, title: str, ylabel: str, xlabel: str = "Epoch") -> None:
    ax.set_facecolor(SURFACE)
    ax.set_title(title, loc="left", fontsize=11, color=INK, fontweight="bold")
    ax.set_ylabel(ylabel, color=INK_2, fontsize=9)
    ax.set_xlabel(xlabel, color=INK_2, fontsize=9)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.tick_params(colors=INK_2, labelsize=8, length=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)


def legend(ax, loc="best") -> None:
    ax.legend(frameon=False, fontsize=8, labelcolor=INK, loc=loc)


def fine_tune_marker(ax, start, color=INK_2) -> None:
    if start:
        ax.axvline(start - 0.5, color=color, linewidth=1, linestyle=(0, (2, 2)), alpha=0.8)


def per_model_figure(runs: dict, out: Path) -> None:
    fig, axes = plt.subplots(len(runs), 2, figsize=(12, 4 * len(runs)), facecolor=SURFACE)
    for row, (name, h) in zip(axes, runs.items()):
        x = list(range(1, len(h["loss"]) + 1))
        loss_ax, acc_ax = row
        style(loss_ax, f"{name} — loss", "Cross-entropy loss")
        style(acc_ax, f"{name} — accuracy", "Accuracy")
        for ax, key in ((loss_ax, "loss"), (acc_ax, "accuracy")):
            ax.plot(x, h[key], color=BLUE, linewidth=2, marker="o", markersize=3.5,
                    label=f"Train (final {h[key][-1]:.4f})")
            ax.plot(x, h[f"val_{key}"], color=ORANGE, linewidth=2, linestyle="--", marker="o",
                    markersize=3.5, label=f"Validation (final {h[f'val_{key}'][-1]:.4f})")
            fine_tune_marker(ax, h["fine_tune_start"])
            ax.set_xlim(0.5, x[-1] + 0.5)
            ax.set_xticks(range(1, x[-1] + 1, 2))
        if h["fine_tune_start"]:
            acc_ax.text(h["fine_tune_start"] - 0.3, 0.5, "fine-tuning →", transform=acc_ax.get_xaxis_transform(),
                        fontsize=8, color=INK_2, va="center")
        loss_ax.set_ylim(bottom=0)
        acc_ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=1))
        legend(loss_ax, "upper right")
        legend(acc_ax, "lower right")

    fig.suptitle("Freshness classifiers (notebook) — training curves", x=0.01, ha="left",
                 fontsize=14, fontweight="bold", color=INK)
    fig.tight_layout(rect=(0, 0, 1, 0.98))
    fig.savefig(out, dpi=200, facecolor=SURFACE)
    plt.close(fig)


def comparison_figure(runs: dict, scores: dict, out: Path) -> None:
    fig, axes = plt.subplots(2, 2, figsize=(12, 9), facecolor=SURFACE)
    (acc_ax, loss_ax), (test_ax, time_ax) = axes

    style(acc_ax, "Validation accuracy", "Accuracy")
    style(loss_ax, "Validation loss", "Cross-entropy loss")
    longest = max(len(h["loss"]) for h in runs.values())
    for name, h in runs.items():
        x = list(range(1, len(h["loss"]) + 1))
        for ax, key in ((acc_ax, "val_accuracy"), (loss_ax, "val_loss")):
            ax.plot(x, h[key], color=COLORS[name], linestyle=STYLES[name], linewidth=2, marker="o",
                    markersize=3.5, label=f"{name} (final {h[key][-1]:.4f})")
            fine_tune_marker(ax, h["fine_tune_start"], COLORS[name])
    for ax in (acc_ax, loss_ax):
        ax.set_xlim(0.5, longest + 0.5)
        ax.set_xticks(range(1, longest + 1, 2))
    acc_ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    loss_ax.set_ylim(bottom=0)
    legend(acc_ax, "lower right")
    legend(loss_ax, "upper right")

    names = [n for n in runs if n in scores]
    y = list(range(len(names)))

    style(test_ax, "Test accuracy vs best validation accuracy", "", "Accuracy")
    test_ax.grid(axis="y", visible=False)
    test_ax.grid(axis="x", color=GRID, linewidth=0.8)
    h = 0.36
    best_val = [max(runs[n]["val_accuracy"]) for n in names]
    test_acc = [scores[n]["accuracy"] for n in names]
    for offset, values, label, alpha in ((-h / 2, best_val, "Best validation", 0.45),
                                         (h / 2, test_acc, "Test (held out)", 1.0)):
        bars = test_ax.barh([i + offset for i in y], values, height=h - 0.04,
                            color=[COLORS[n] for n in names], alpha=alpha, label=label)
        for bar, v in zip(bars, values):
            test_ax.text(v + 0.005, bar.get_y() + bar.get_height() / 2, f"{v:.1%}  {label.split()[0].lower()}",
                         va="center", fontsize=8, color=INK)
    test_ax.set_yticks(y, names)
    test_ax.invert_yaxis()
    test_ax.set_xlim(0, 1.18)
    test_ax.set_xticks([0, 0.25, 0.5, 0.75, 1.0])
    test_ax.xaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))

    style(time_ax, "Training time", "", "Minutes")
    time_ax.grid(axis="y", visible=False)
    time_ax.grid(axis="x", color=GRID, linewidth=0.8)
    minutes = [scores[n]["seconds"] / 60 for n in names]
    bars = time_ax.barh(y, minutes, height=0.5, color=[COLORS[n] for n in names])
    for bar, m, n in zip(bars, minutes, names):
        time_ax.text(m + 0.5, bar.get_y() + bar.get_height() / 2,
                     f"{m:.1f} min · {len(runs[n]['loss'])} epochs", va="center", fontsize=8, color=INK)
    time_ax.set_yticks(y, names)
    time_ax.invert_yaxis()
    time_ax.set_xlim(0, max(minutes) * 1.35)

    fig.suptitle("Freshness classifiers (notebook) — algorithm comparison", x=0.01, ha="left",
                 fontsize=14, fontweight="bold", color=INK)
    fig.text(0.01, 0.945, "Thin dashed vertical lines mark where each model's fine-tuning starts. "
             "Test images are held out from training and validation.", fontsize=9, color=INK_2)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(out, dpi=200, facecolor=SURFACE)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--notebook", type=Path, default=NOTEBOOK)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    nb = json.loads(args.notebook.read_text(encoding="utf-8"))
    runs = parse_histories(nb)
    scores = parse_test_scores(nb)
    if not runs:
        raise SystemExit(f"No Keras training logs found in {args.notebook}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    per_model_figure(runs, args.out_dir / "algorithm_training_curves.png")
    comparison_figure(runs, scores, args.out_dir / "algorithm_comparison.png")
    for name, h in runs.items():
        print(f"{name}: {len(h['loss'])} epochs, best val acc {max(h['val_accuracy']):.4f}, "
              f"test acc {scores.get(name, {}).get('accuracy', float('nan')):.4f}")
    print(f"Wrote {args.out_dir.relative_to(ROOT)}/algorithm_training_curves.png and algorithm_comparison.png")


if __name__ == "__main__":
    main()
