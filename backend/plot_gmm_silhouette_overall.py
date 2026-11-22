"""Silhouette score vs. number of components, as a single whole-algorithm figure —
pooled across all 12 foods, not broken down per food (see ``plot_gmm_silhouette.py``
for that per-food view). The companion chart to ``plot_gmm_bic_overall.py``: same
question (how many clusters does the colour data support), a different metric.

Reads ``backend/metrics/gmm_silhouette.json`` (written by ``plot_gmm_silhouette.py``
— run that first if it does not exist yet); does not refit anything itself.

    python backend/plot_gmm_silhouette_overall.py

Writes ``backend/metrics/gmm_silhouette_overall.png``.
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
SIL_JSON = ROOT / "backend" / "metrics" / "gmm_silhouette.json"
OUT_PNG = ROOT / "backend" / "metrics" / "gmm_silhouette_overall.png"
POOLED_KEY = "pooled (all foods)"

BLUE, GREEN = "#2a78d6", "#2fa84f"
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=OUT_PNG)
    args = parser.parse_args()

    results = json.loads(SIL_JSON.read_text(encoding="utf-8"))
    r = results[POOLED_KEY]
    ks = r["k"]
    scores = r["silhouette"]
    best_k = r["bestK"]

    fig, ax = plt.subplots(figsize=(8, 5.5), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)

    ax.plot(ks, scores, "o-", color=BLUE, linewidth=2, markersize=5)
    ax.axvline(5, color="#c0392b", linestyle=":", linewidth=1.6, label="k=5 (adviser-set)")
    if best_k is not None:
        ax.axvline(best_k, color=GREEN, linestyle="--", linewidth=1.8, label=f"best silhouette, k={best_k}")
    ax.axhline(0.5, color=INK_2, linestyle=":", linewidth=1, alpha=0.5)
    ax.text(ks[-1], 0.51, "0.5 = conventional \"reasonable structure\" threshold", ha="right", color=INK_2, fontsize=8)

    ax.set_xlabel("number of components (k)", color=INK, fontsize=11)
    ax.set_ylabel("silhouette score (higher = better separated)", color=INK, fontsize=11)
    ax.set_xticks(ks)
    ax.set_ylim(min(0, min(s for s in scores if s == s)) - 0.05, 1.0)
    ax.tick_params(colors=INK_2)
    ax.grid(True, color=GRID, linewidth=0.6)
    for spine in ax.spines.values():
        spine.set_color(GRID)
    ax.legend(facecolor=SURFACE, edgecolor=GRID, fontsize=10)
    ax.set_title(
        f"Silhouette score vs. component count\n(all 12 foods pooled, {r['photos']:,} photos, unsupervised fit)",
        color=INK,
        fontsize=12,
    )

    k5_score = scores[ks.index(5)] if 5 in ks else None
    note_lines = [
        f"At k=5 (the component count set for this analysis): silhouette = {k5_score:.3f}." if k5_score is not None else "",
        f"Best silhouette in this sweep is k={best_k} ({scores[ks.index(best_k)]:.3f}), still far below the",
        "~0.5+ range considered \"reasonable structure\" and nowhere near 1 — 12 real foods' colour",
        "statistics genuinely overlap, pooled or not. More components did not help: this curve",
        "trends down, not up, as k grows past the low single digits.",
    ]
    fig.text(0.5, -0.04, "\n".join(line for line in note_lines if line), ha="center", va="top", color=INK_2, fontsize=8.5)

    fig.tight_layout()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.out, dpi=180, facecolor=SURFACE, bbox_inches="tight")
    print(f"Saved {args.out}")
    print(f"k=5 silhouette={k5_score}  best k={best_k} ({scores[ks.index(best_k)] if best_k else None})")


if __name__ == "__main__":
    main()
