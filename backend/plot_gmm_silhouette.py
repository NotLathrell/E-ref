"""Silhouette score vs. number of mixture components, per food — a second,
independent model-selection check alongside ``plot_gmm_bic.py``'s AIC/BIC, for the
same unsupervised, label-blind question: how many clusters does the colour-feature
data itself support? (Not a measure of the shipped model's classification
accuracy — see ``plot_gmm_overall.py`` / ``plot_gmm_metrics.py`` for that.)

For each k, points are hard-assigned to whichever Gaussian component gives them
the highest posterior probability (``GaussianMixture.posterior``), then scored by
the mean silhouette coefficient (``freshness_cluster.silhouette_score``): how much
closer each point is to its own cluster than to the next-nearest one, from -1 (badly
placed) to +1 (well separated). Unlike BIC/AIC, **higher is better** and there is no
free-parameter penalty to fight against, so the usual read is the k that
*maximises* silhouette, not an elbow.

    python backend/plot_gmm_silhouette.py
    python backend/plot_gmm_silhouette.py --max-k 10 --restarts 8
    python backend/plot_gmm_silhouette.py --sample 500

Writes ``backend/metrics/gmm_silhouette.png`` and ``.json``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_PNG = ROOT / "backend" / "metrics" / "gmm_silhouette.png"
OUT_JSON = ROOT / "backend" / "metrics" / "gmm_silhouette.json"

sys.path.insert(0, str(ROOT))
from backend.freshness_cluster import ColorScaler, silhouette_score  # noqa: E402
from backend.plot_gmm_bic import fit_best_of  # noqa: E402
from backend.train_freshness_clusters import collect_split  # noqa: E402

BLUE = "#2a78d6"
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"


def silhouette_curve(x: np.ndarray, ks: list[int], restarts: int, n_iter: int, seed: int) -> dict[str, Any]:
    scores = []
    for k in ks:
        gmm = fit_best_of(x, k, restarts, n_iter, seed)
        labels = gmm.posterior(x).argmax(axis=1)
        scores.append(silhouette_score(x, labels))
    best_k = ks[int(np.nanargmax(scores))] if not all(np.isnan(scores)) else None
    return {"k": ks, "silhouette": scores, "bestK": best_k, "photos": len(x)}


def plot_grid(results: dict[str, dict[str, Any]], out_path: Path) -> None:
    names = list(results.keys())
    cols = 4
    rows = (len(names) + cols - 1) // cols
    fig, axes = plt.subplots(rows, cols, figsize=(4.2 * cols, 3.4 * rows), facecolor=SURFACE)
    axes = np.atleast_1d(axes).flatten()

    for ax, name in zip(axes, names):
        ax.set_facecolor(SURFACE)
        r = results[name]
        ks = r["k"]
        ax.plot(ks, r["silhouette"], "o-", color=BLUE, linewidth=1.6, markersize=4)
        if r["bestK"] is not None:
            ax.axvline(r["bestK"], color="#2fa84f", linestyle="--", linewidth=1.2, alpha=0.8)
        ax.set_title(f"{name} (best k={r['bestK']})", color=INK, fontsize=10)
        ax.set_xlabel("components (k)", color=INK_2, fontsize=8)
        ax.tick_params(colors=INK_2, labelsize=7)
        ax.grid(True, color=GRID, linewidth=0.6)
        for spine in ax.spines.values():
            spine.set_color(GRID)

    for ax in axes[len(names):]:
        ax.axis("off")

    fig.suptitle("GMM model selection: silhouette score vs. component count, per food (unsupervised, label-blind)", color=INK, fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=150, facecolor=SURFACE)
    print(f"Saved {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max-k", type=int, default=16, help="largest component count to try (default 16)")
    parser.add_argument("--restarts", type=int, default=3, help="random EM restarts per k (default 3)")
    parser.add_argument("--n-iter", type=int, default=80, help="EM iterations per restart (default 80)")
    parser.add_argument("--sample", type=int, default=800, help="cap photos per food, for speed (default 800)")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    ks = list(range(2, args.max_k + 1))  # silhouette is undefined for k=1
    by_food = collect_split("train", None)
    rng = np.random.default_rng(args.seed)

    results: dict[str, dict[str, Any]] = {}
    pooled_parts = []

    started = time.perf_counter()
    for food_name in sorted(by_food):
        fresh, rotten = by_food[food_name].get("fresh"), by_food[food_name].get("rotten")
        if fresh is None or rotten is None:
            continue
        x = np.concatenate([fresh, rotten])
        scaler = ColorScaler.fit(x)
        x = scaler.transform(x)
        if len(x) > args.sample:
            x = x[rng.choice(len(x), size=args.sample, replace=False)]
        pooled_parts.append(x)

        print(f"Fitting {food_name} ({len(x)} photos, k=2..{args.max_k}) ...")
        results[food_name] = silhouette_curve(x, ks, args.restarts, args.n_iter, args.seed)

    pooled = np.concatenate(pooled_parts)
    if len(pooled) > args.sample * 3:
        pooled = pooled[rng.choice(len(pooled), size=args.sample * 3, replace=False)]
    print(f"Fitting pooled, all foods ({len(pooled)} photos, k=2..{args.max_k}) ...")
    results["pooled (all foods)"] = silhouette_curve(pooled, ks, args.restarts, args.n_iter, args.seed)

    print(f"\nDone in {time.perf_counter() - started:.0f}s. Best k by silhouette:")
    for name, r in results.items():
        best = r["silhouette"][r["k"].index(r["bestK"])] if r["bestK"] is not None else float("nan")
        print(f"  {name:20s} k={r['bestK']!s:<4s} silhouette={best:.3f}")

    plot_grid(results, OUT_PNG)
    OUT_JSON.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Saved {OUT_JSON}")


if __name__ == "__main__":
    main()
