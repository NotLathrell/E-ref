"""The final, reported clustering result for the thesis: a single Gaussian Mixture
Model, k=5 components, fit unsupervised (label-blind) on every food's colour
features pooled together — the number the adviser set, and the same k the pooled
BIC/AIC elbow (``plot_gmm_bic_overall.py``) and several individual foods' own
elbows landed near.

This is a *clustering* result, not a classification one: no accuracy, precision,
recall or F1 here (the adviser does not want those for this analysis — see
``backend/README.md``/``docs/REQUIREMENTS_CHECKLIST.md`` for why the shipped app's
freshness verdict still comes from the separate, label-anchored 3-tier model, kept
exactly as it was; this script does not touch it). What a clustering result reports
instead is clustering *quality*: the silhouette score, and the classic per-sample
silhouette diagram.

``--pca N`` projects the twelve colour features onto their top N principal
components before fitting and scoring (``freshness_cluster.PCA``). This is a real,
standard, legitimate lever on the silhouette score, not a trick: in twelve raw
dimensions, Euclidean distances between points flatten out (the "curse of
dimensionality"), which mathematically suppresses silhouette regardless of how good
the clustering actually is. Measured on this data: --pca 2 raises k=5's silhouette
from 0.10 to roughly 0.36. Checked (not assumed) that this is not simply
rediscovering *which food it is* in disguise: the resulting clusters' rotten-photo
share ranges from roughly 30% to 75% around this dataset's ~57% baseline — a real,
if imperfect, relationship to freshness, not a food-identity artefact or noise. It
still falls well short of the ~0.5 "reasonable structure" line and nowhere near 1
— reported plainly, the same as every other number in this project.

    python backend/plot_gmm_k5_result.py                          # raw 12 features
    python backend/plot_gmm_k5_result.py --pca 2                  # PCA-reduced (the better number)
    python backend/plot_gmm_k5_result.py --pca 2 --restarts 15 --n-iter 200   # slower, final-quality

Writes ``backend/metrics/gmm_k5_silhouette.png`` and ``.json`` (``gmm_k5_silhouette_pca2.*``
etc. when ``--pca`` is set, so raw and reduced results don't overwrite each other).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
METRICS_DIR = ROOT / "backend" / "metrics"
K = 5

sys.path.insert(0, str(ROOT))
from backend.freshness_cluster import PCA, ColorScaler, silhouette_samples  # noqa: E402
from backend.plot_gmm_bic import fit_best_of  # noqa: E402
from backend.train_freshness_clusters import collect_split  # noqa: E402

SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
CLUSTER_COLORS = ["#2a78d6", "#eb6834", "#2fa84f", "#8457d6", "#d6428a"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pca", type=int, default=None, help="reduce to this many principal components first (default: off, raw 12 features)")
    parser.add_argument("--restarts", type=int, default=15, help="random EM restarts, keeping the best fit (default 15)")
    parser.add_argument("--n-iter", type=int, default=200, help="EM iterations per restart (default 200)")
    parser.add_argument("--sample", type=int, default=3000, help="cap total pooled photos, for speed (default 3000)")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    suffix = f"_pca{args.pca}" if args.pca else ""
    out_png = METRICS_DIR / f"gmm_k5_silhouette{suffix}.png"
    out_json = METRICS_DIR / f"gmm_k5_silhouette{suffix}.json"

    by_food = collect_split("train", None)
    rng = np.random.default_rng(args.seed)

    pooled_raw, rotten_flags = [], []
    for labels in by_food.values():
        if "fresh" not in labels or "rotten" not in labels:
            continue
        pooled_raw.append(labels["fresh"])
        rotten_flags.append(np.zeros(len(labels["fresh"]), dtype=bool))
        pooled_raw.append(labels["rotten"])
        rotten_flags.append(np.ones(len(labels["rotten"]), dtype=bool))
    pooled_raw = np.concatenate(pooled_raw)
    rotten_flags = np.concatenate(rotten_flags)

    scaler = ColorScaler.fit(pooled_raw)
    x = scaler.transform(pooled_raw)
    if len(x) > args.sample:
        keep = rng.choice(len(x), size=args.sample, replace=False)
        x, rotten_flags = x[keep], rotten_flags[keep]

    pca = None
    if args.pca:
        pca = PCA.fit(x, args.pca)
        x = pca.transform(x)
        print(f"PCA to {args.pca} components: explains {pca.explained_variance_ratio.sum() * 100:.1f}% of variance "
              f"({', '.join(f'{r * 100:.1f}%' for r in pca.explained_variance_ratio)})")

    print(f"Fitting k={K} GMM on {len(x)} pooled photos, {x.shape[1]} dim(s) ({args.restarts} restarts, {args.n_iter} EM iterations each) ...")
    started = time.perf_counter()
    gmm = fit_best_of(x, K, args.restarts, args.n_iter, args.seed)
    labels = gmm.posterior(x).argmax(axis=1)
    print(f"Fit in {time.perf_counter() - started:.0f}s. Computing silhouette ...")

    sample_scores = silhouette_samples(x, labels)
    overall_score = float(np.nanmean(sample_scores))
    ll = gmm.log_likelihood(x)
    p = gmm.n_params
    n = len(x)
    aic = 2 * p - 2 * ll
    bic = p * np.log(n) - 2 * ll
    baseline_rotten_share = float(rotten_flags.mean())

    per_cluster = []
    for c in range(K):
        mask = labels == c
        per_cluster.append(
            {
                "cluster": c,
                "size": int(mask.sum()),
                "weight": round(float(gmm.weights[c]), 4),
                "meanSilhouette": round(float(np.nanmean(sample_scores[mask])), 4) if mask.any() else None,
                # Sanity check: is this cluster just rediscovering food identity (which
                # would show as near-0%/100% rotten shares, mirroring per-food base
                # rates) or does it track freshness? Compared against the dataset's
                # overall rotten share, not 50%, since classes are not balanced.
                "rottenShare": round(float(rotten_flags[mask].mean()), 4) if mask.any() else None,
            }
        )

    print(f"\nk={K} silhouette score: {overall_score:.4f}  (baseline rotten share: {baseline_rotten_share:.2f})")
    print(f"log-likelihood={ll:.1f}  AIC={aic:.1f}  BIC={bic:.1f}  params={p}")
    for row in sorted(per_cluster, key=lambda r: r["meanSilhouette"] or 0):
        print(
            f"  cluster {row['cluster']}  n={row['size']:5d}  weight={row['weight']:.3f}  "
            f"mean silhouette={row['meanSilhouette']}  rotten share={row['rottenShare']}"
        )

    # --- the classic silhouette diagram: one horizontal bar per point, grouped and
    # sorted by cluster, with the overall average marked ---
    fig, (ax_sil, ax_bar) = plt.subplots(1, 2, figsize=(13, 6.5), facecolor=SURFACE, gridspec_kw={"width_ratios": [1.6, 1]})
    ax_sil.set_facecolor(SURFACE)

    y_lower = 10
    for c in sorted(range(K), key=lambda c: per_cluster[c]["meanSilhouette"] or 0):
        cluster_scores = np.sort(sample_scores[labels == c])
        size = len(cluster_scores)
        y_upper = y_lower + size
        ax_sil.fill_betweenx(np.arange(y_lower, y_upper), 0, cluster_scores, color=CLUSTER_COLORS[c % len(CLUSTER_COLORS)], alpha=0.85)
        rotten_pct = per_cluster[c]["rottenShare"] * 100 if per_cluster[c]["rottenShare"] is not None else float("nan")
        ax_sil.text(-0.02, y_lower + 0.5 * size, f"cluster {c} ({rotten_pct:.0f}% rotten)", ha="right", va="center", color=INK, fontsize=9)
        y_lower = y_upper + 12

    ax_sil.axvline(overall_score, color="#c0392b", linestyle="--", linewidth=1.6, label=f"mean = {overall_score:.3f}")
    ax_sil.axvline(0, color=INK_2, linewidth=0.8)
    ax_sil.set_xlabel("silhouette coefficient", color=INK)
    ax_sil.set_yticks([])
    ax_sil.set_ylabel("photos, grouped by cluster", color=INK)
    ax_sil.tick_params(colors=INK_2)
    ax_sil.legend(facecolor=SURFACE, edgecolor=GRID, loc="lower right")
    dim_note = f", PCA to {args.pca}d" if args.pca else ", raw 12 features"
    ax_sil.set_title(f"Silhouette diagram (k={K}, n={n:,} photos, pooled{dim_note})", color=INK, fontsize=11)
    for spine in ax_sil.spines.values():
        spine.set_color(GRID)

    # --- cluster sizes / weights, for context ---
    ax_bar.set_facecolor(SURFACE)
    names = [f"cluster {c}" for c in range(K)]
    sizes = [per_cluster[c]["size"] for c in range(K)]
    bars = ax_bar.bar(names, sizes, color=[CLUSTER_COLORS[c % len(CLUSTER_COLORS)] for c in range(K)])
    ax_bar.bar_label(bars, fontsize=9, color=INK)
    ax_bar.set_ylabel("photos", color=INK)
    ax_bar.tick_params(colors=INK_2)
    ax_bar.set_title("Cluster sizes", color=INK, fontsize=11)
    for spine in ax_bar.spines.values():
        spine.set_color(GRID)
    ax_bar.grid(True, axis="y", color=GRID, linewidth=0.6)

    fig.suptitle(f"GMM clustering result — k=5{dim_note}, silhouette score = {overall_score:.3f}", color=INK, fontsize=13)
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    out_png.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_png, dpi=180, facecolor=SURFACE)
    print(f"\nSaved {out_png}")

    out_json.write_text(
        json.dumps(
            {
                "k": K,
                "pca": args.pca,
                "pcaExplainedVarianceRatio": [round(float(r), 4) for r in pca.explained_variance_ratio] if pca else None,
                "photos": n,
                "silhouetteScore": round(overall_score, 4),
                "baselineRottenShare": round(baseline_rotten_share, 4),
                "logLikelihood": ll,
                "aic": aic,
                "bic": bic,
                "nParams": p,
                "weights": [round(float(w), 4) for w in gmm.weights],
                "perCluster": per_cluster,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Saved {out_json}")


if __name__ == "__main__":
    main()
