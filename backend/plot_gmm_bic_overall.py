"""AIC/BIC vs. number of mixture components, as a single whole-algorithm figure —
the colour-feature data pooled across all 12 foods, not broken down per food (see
``plot_gmm_bic.py`` for that per-food view, and its module docstring / this
project's docs for what this is and is not evidence of).

Reads ``backend/metrics/gmm_bic_aic.json`` (written by ``plot_gmm_bic.py`` — run
that first if it does not exist yet); does not refit anything itself.

    python backend/plot_gmm_bic_overall.py

Writes ``backend/metrics/gmm_bic_aic_overall.png``.
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
BIC_JSON = ROOT / "backend" / "metrics" / "gmm_bic_aic.json"
OUT_PNG = ROOT / "backend" / "metrics" / "gmm_bic_aic_overall.png"
POOLED_KEY = "pooled (all foods)"

BLUE, ORANGE, GREEN = "#2a78d6", "#eb6834", "#2fa84f"
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=OUT_PNG)
    args = parser.parse_args()

    results = json.loads(BIC_JSON.read_text(encoding="utf-8"))
    r = results[POOLED_KEY]
    ks = r["k"]

    fig, ax = plt.subplots(figsize=(8, 5.5), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)

    ax.plot(ks, r["aic"], "o-", color=BLUE, label=f"AIC (min at k={r['minK']['aic']})", linewidth=2, markersize=5)
    ax.plot(ks, r["bic"], "o-", color=ORANGE, label=f"BIC (min at k={r['minK']['bic']})", linewidth=2, markersize=5)
    elbow = r["elbowK"]["bic"]
    ax.axvline(elbow, color=GREEN, linestyle="--", linewidth=1.8, label=f"elbow (practical choice) k={elbow}")

    ax.set_xlabel("number of components (k)", color=INK, fontsize=11)
    ax.set_ylabel("score (lower = better fit, penalised for size)", color=INK, fontsize=11)
    ax.set_xticks(ks)
    ax.tick_params(colors=INK_2)
    ax.grid(True, color=GRID, linewidth=0.6)
    for spine in ax.spines.values():
        spine.set_color(GRID)
    ax.legend(facecolor=SURFACE, edgecolor=GRID, fontsize=10)
    ax.set_title(
        f"GMM model selection — AIC/BIC vs. component count\n(all 12 foods pooled, {r['photos']:,} photos, unsupervised fit)",
        color=INK,
        fontsize=12,
    )

    note = (
        "Neither curve reaches an interior minimum within k=1..16 here — both keep\n"
        "decreasing, so the dashed elbow (sharpest diminishing return) is the practical\n"
        "read, not the strict minimum. This is a label-blind statistical check, separate\n"
        "from the 3 label-anchored tiers (Fresh/Sub-Fresh/Putrid) the shipped model uses."
    )
    fig.text(0.5, -0.02, note, ha="center", va="top", color=INK_2, fontsize=8.5)

    fig.tight_layout()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.out, dpi=180, facecolor=SURFACE, bbox_inches="tight")
    print(f"Saved {args.out}")
    print(f"pooled: min(AIC)=k{r['minK']['aic']}  min(BIC)=k{r['minK']['bic']}  elbow(BIC)=k{elbow}")


if __name__ == "__main__":
    main()
