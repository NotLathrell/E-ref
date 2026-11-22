"""BIC/AIC vs. number of mixture components: how many clusters the colour-feature
data actually supports, per food — an unsupervised model-selection check, separate
from (and not a justification for) the Fresh/Sub-Fresh/Putrid design this project
ships with.

The shipped model's three components are *label-anchored*: Fresh and Putrid are
fit directly to known fresh/rotten photos, Sub-Fresh to their midpoint, because no
one-size-fits-all cluster count was ever assumed. This script asks a different,
purely statistical question — "if you fit an ordinary, label-blind Gaussian Mixture
Model to a food's colour features with k = 1, 2, 3, ... components, which k
minimises AIC / BIC?" — fitting with full EM to convergence (unlike the production
model, which this project measured did not benefit from EM at all for the
label-anchored 3-component case; see ``freshness_cluster.py``).

    AIC = 2p - 2 * log-likelihood
    BIC = p * ln(n) - 2 * log-likelihood

where ``p`` is the mixture's free parameter count (``GaussianMixture.n_params``) and
``n`` is the number of photos fitted. Both penalise extra components; BIC penalises
them harder as the dataset grows. Each k is fit from several random restarts (EM
only finds a local optimum) and the best log-likelihood is kept.

Measured finding, worth stating plainly: on this data, neither AIC nor BIC settles
on an interior minimum within a practical k range — both kept decreasing out to
k=16 for nearly every food (real photographic colour statistics are not actually
drawn from a small number of Gaussian blobs, so more components almost always fit
the data a little better). The strict minimum is therefore not a useful number by itself; this script also
reports the curve's **elbow** (``elbow_k``) — the point of sharpest diminishing
returns — which is the standard fallback when BIC/AIC has no interior minimum.
Measured: the elbow lands at k=4-6 for most foods (k=10 for bitter gourd, the
food with the fewest labelled photos). That is *more* than the 3 label-anchored
tiers this project ships with, not confirmation of them — a label-blind statistical
fit is answering "how many Gaussian blobs does this colour data support" in
general, not "how many *freshness stages* matter", and those are different
questions (see this project's existing finding that a fully unsupervised fit does
not recover the fresh/rotten split at all — ``freshness_cluster.py``). Reported
here honestly rather than cropped to look like agreement.

    python backend/plot_gmm_bic.py
    python backend/plot_gmm_bic.py --max-k 10 --restarts 8   # slower, more thorough
    python backend/plot_gmm_bic.py --sample 800              # cap photos per food, for speed

Writes ``backend/metrics/gmm_bic_aic.png`` and ``.json``.
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
OUT_PNG = ROOT / "backend" / "metrics" / "gmm_bic_aic.png"
OUT_JSON = ROOT / "backend" / "metrics" / "gmm_bic_aic.json"

sys.path.insert(0, str(ROOT))
from backend.freshness_cluster import ColorScaler, GaussianMixture  # noqa: E402
from backend.train_freshness_clusters import collect_split  # noqa: E402

BLUE, ORANGE = "#2a78d6", "#eb6834"
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"


def fit_best_of(x: np.ndarray, k: int, restarts: int, n_iter: int, seed: int) -> GaussianMixture:
    """``k``-component GMM, unsupervised, keeping the best of several random-start
    EM fits — a single run can land in a poor local optimum, especially as k grows.
    """
    rng = np.random.default_rng(seed)
    overall_var = np.maximum(x.var(axis=0), 1e-3)
    best: tuple[float, GaussianMixture] | None = None
    for _ in range(restarts):
        init_idx = rng.choice(len(x), size=k, replace=False)
        init_means = x[init_idx].copy()
        init_vars = np.tile(overall_var, (k, 1))
        init_weights = np.full(k, 1.0 / k)
        gmm = GaussianMixture.fit(x, init_means, init_vars, init_weights, n_iter=n_iter, tol=1e-4)
        ll = gmm.log_likelihood(x)
        if best is None or ll > best[0]:
            best = (ll, gmm)
    return best[1]


def elbow_k(ks: list[int], scores: list[float]) -> int:
    """The "knee" of a decreasing curve: the point farthest from the straight line
    joining its first and last point (the standard elbow heuristic — the same idea
    as the k-means elbow method). Useful here because BIC/AIC never stopped
    decreasing within the range tested (see this module's docstring), so the
    strict minimum is just whichever k was largest and tells us nothing; the elbow
    is where adding components stops paying for itself much.
    """
    k = np.asarray(ks, dtype=float)
    y = np.asarray(scores, dtype=float)
    k_n = (k - k.min()) / (k.max() - k.min())
    y_n = (y - y.min()) / (y.max() - y.min() + 1e-12)
    # Perpendicular distance from each point to the line through the endpoints.
    x1, y1, x2, y2 = k_n[0], y_n[0], k_n[-1], y_n[-1]
    num = np.abs((y2 - y1) * k_n - (x2 - x1) * y_n + x2 * y1 - y2 * x1)
    den = np.hypot(y2 - y1, x2 - x1) + 1e-12
    distances = num / den
    return int(ks[int(np.argmax(distances))])


def bic_aic_curve(x: np.ndarray, ks: list[int], restarts: int, n_iter: int, seed: int) -> dict[str, Any]:
    n = len(x)
    log_likelihoods, aics, bics = [], [], []
    for k in ks:
        gmm = fit_best_of(x, k, restarts, n_iter, seed)
        ll = gmm.log_likelihood(x)
        p = gmm.n_params
        log_likelihoods.append(ll)
        aics.append(2 * p - 2 * ll)
        bics.append(p * np.log(n) - 2 * ll)
    return {
        "k": ks,
        "logLikelihood": log_likelihoods,
        "aic": aics,
        "bic": bics,
        "photos": n,
        "minK": {"aic": ks[int(np.argmin(aics))], "bic": ks[int(np.argmin(bics))]},
        "elbowK": {"aic": elbow_k(ks, aics), "bic": elbow_k(ks, bics)},
    }


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
        elbow = r["elbowK"]["bic"]

        ax.plot(ks, r["aic"], "o-", color=BLUE, label=f"AIC (min k={r['minK']['aic']})", linewidth=1.6, markersize=4)
        ax.plot(ks, r["bic"], "o-", color=ORANGE, label=f"BIC (min k={r['minK']['bic']})", linewidth=1.6, markersize=4)
        ax.axvline(elbow, color="#2fa84f", linestyle="--", linewidth=1.3, alpha=0.8, label=f"BIC elbow k={elbow}")
        ax.set_title(name, color=INK, fontsize=10)
        ax.set_xlabel("components (k)", color=INK_2, fontsize=8)
        ax.tick_params(colors=INK_2, labelsize=7)
        ax.grid(True, color=GRID, linewidth=0.6)
        for spine in ax.spines.values():
            spine.set_color(GRID)
        ax.legend(fontsize=6.5, facecolor=SURFACE, edgecolor=GRID)

    for ax in axes[len(names):]:
        ax.axis("off")

    fig.suptitle("GMM model selection: AIC / BIC vs. component count, per food (unsupervised, label-blind)", color=INK, fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=150, facecolor=SURFACE)
    print(f"Saved {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max-k", type=int, default=8, help="largest component count to try (default 8)")
    parser.add_argument("--restarts", type=int, default=5, help="random EM restarts per k (default 5)")
    parser.add_argument("--n-iter", type=int, default=100, help="EM iterations per restart (default 100)")
    parser.add_argument("--sample", type=int, default=1000, help="cap photos per food, for speed (default 1000)")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    ks = list(range(1, args.max_k + 1))
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

        print(f"Fitting {food_name} ({len(x)} photos, k=1..{args.max_k}) ...")
        results[food_name] = bic_aic_curve(x, ks, args.restarts, args.n_iter, args.seed)

    pooled = np.concatenate(pooled_parts)
    if len(pooled) > args.sample * 3:
        pooled = pooled[rng.choice(len(pooled), size=args.sample * 3, replace=False)]
    print(f"Fitting pooled, all foods ({len(pooled)} photos, k=1..{args.max_k}) ...")
    results["pooled (all foods)"] = bic_aic_curve(pooled, ks, args.restarts, args.n_iter, args.seed)

    print(f"\nDone in {time.perf_counter() - started:.0f}s.")
    print(f"  {'food':20s} {'min(BIC)':>10s} {'min(AIC)':>10s} {'elbow(BIC)':>12s} {'elbow(AIC)':>12s}")
    for name, r in results.items():
        print(
            f"  {name:20s} {r['minK']['bic']:>10d} {r['minK']['aic']:>10d} "
            f"{r['elbowK']['bic']:>12d} {r['elbowK']['aic']:>12d}"
        )

    plot_grid(results, OUT_PNG)
    OUT_JSON.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Saved {OUT_JSON}")


if __name__ == "__main__":
    main()
