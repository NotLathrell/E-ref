"""Colour-based freshness clustering: the project's replacement for a CNN freshness
classifier, per the adviser's direction to judge spoilage from colour rather than a
trained neural network, fit with a **Gaussian Mixture Model** to match the thesis.

A photo's colour is reduced to twelve numbers (``color_features``): how vivid, bright
and evenly-coloured it is overall, how much of it looks browned or darkened on average,
and — because rot usually starts as a spot, not an even tint shift — how browned or
darkened its *worst* small patch is and how unevenly that is spread across the frame.
The patch statistics were added after measuring that whole-frame averages dilute a
small spotted patch on an otherwise normal-looking food (tomato, eggplant); they lifted
overall test accuracy from 75.1% to 76.8%. Papaya separately improved from 61.5% to
67.9% by adding a second photo source (see ``convert_papaya_roboflow.py``).

A fully unsupervised fit (EM finding clusters from colour alone, no labels at all — the
Gaussian-Mixture equivalent of the plain K-Means tried earlier) was measured the same
way plain K-Means was: pooled across every food it came back barely better than a coin
flip, because a banana's yellow and a tomato's red differ far more than either food's
own fresh-vs-rotten colour shift — the clusters would split by food type, not freshness.

So each food gets a **label-initialised** three-component mixture: Fresh and Putrid
components set directly to the mean and variance of that food's labelled fresh/rotten
training photos, and a Sub-Fresh component at their midpoint (mean) with their averaged
variance and a modest prior weight — a reasonable placement for "the halfway colour of
decay", which has no labelled examples of its own. Each component keeps a **diagonal**
covariance — one variance per feature, no cross-feature correlations — because several
foods have as few as a few dozen labelled photos for twelve features, nowhere near
enough to fit a full 12x12 covariance matrix without it being singular or wildly
overfit.

Running Expectation-Maximisation past that point — refining the three components'
means, variances and weights over several iterations, the way scikit-learn's
``GaussianMixture`` would (hand-rolled here in plain numpy, since this machine's
Application Control policy blocks the scipy LAPACK binary scikit-learn needs; see
``GaussianMixture.fit``) — was tried and measured to make accuracy *worse*, the more
iterations it ran: 79.1% at zero iterations down to 77.1% at five and 75.0% at ten,
whether or not a fresh-labelled photo was masked off from ever counting toward Putrid
(and vice versa — see ``fit``'s ``mask`` argument). The cause: Sub-Fresh is the only
component allowed to draw responsibility from *both* labelled sides, so each iteration
it absorbs a growing, disproportionate share of the data and starves Fresh/Putrid of
the examples that anchored them — a textbook case of letting unsupervised EM run past a
good supervised initialisation. So the shipped mixture is fit directly from each
component's labelled statistics with **no EM iterations at all** — mathematically the
EM algorithm's M-step applied once, given the hard (label-based) assignments we already
have, rather than re-estimated from soft, EM-discovered ones. That alone measures 79.1%
overall test accuracy — better than the nearest-centroid version it replaced (77.0%),
because classifying by each tier's own Gaussian density accounts for its colour
variance, where plain nearest-centroid's unweighted Euclidean distance did not.

A new photo's continuous 0-100% reading is the three posteriors blended against each
tier's anchor (Fresh=100, Sub-Fresh=50, Putrid=0) — the GMM equivalent of the
nearest-centroid distance blend used before — and its tier is that same percent cut at
70% / 30%, the same thresholds ``pipeline.freshness_tier`` and the mobile app use.
Tier is deliberately *not* a separate argmax of the three posteriors: that measured a
real disagreement with the blended percent when the posteriors were diffuse (close to
a three-way tie), e.g. reporting "Fresh" for a photo whose own blended score was only
50.8%. Reading the tier off the same number shown to the user guarantees the two can
never contradict each other. ``train_freshness_clusters.py`` fits and evaluates this;
``FreshnessClusterer.assess`` applies it at inference, given the food identity the
identity model already produced for the same photo.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

FEATURE_NAMES = [
    "mean_hue", "mean_saturation", "mean_value",
    "std_hue", "std_saturation", "std_value",
    "brown_ratio", "dark_ratio",
    "patch_max_brown", "patch_max_dark", "patch_std_brown", "patch_std_dark",
]

# Orange/brown band of the hue wheel, as a 0-1 fraction of the full 360°: where
# enzymatic browning and surface oxidation on cut or ageing produce lands.
_BROWN_HUE_LOW, _BROWN_HUE_HIGH = 0.03, 0.15
_BROWN_MAX_SAT, _BROWN_MAX_VAL = 0.75, 0.75
_DARK_MAX_VAL = 0.25

# The 96x96 resize divides evenly into a 4x4 grid of 24x24 patches.
_PATCH_GRID = 4


def _patch_stats(mask: np.ndarray, grid: int) -> tuple[float, float]:
    """Max and std of a 0/1 mask's mean across a grid of square patches: how bad the
    worst small region is, and how unevenly spread the mask is, as opposed to the
    whole-frame average, which a small spotted patch barely moves.
    """
    size = mask.shape[0]
    patch = size // grid
    ratios = mask.reshape(grid, patch, grid, patch).mean(axis=(1, 3))
    return float(ratios.max()), float(ratios.std())

TIER_BY_RANK = ["fresh", "subfresh", "putrid"]
TIER_LABELS = {"fresh": "Fresh", "subfresh": "Sub-Fresh", "putrid": "Putrid"}
# The percentage each component anchors to, for turning the GMM's posterior blend back
# into the continuous 0-100% reading the rest of the app (risk scoring, the Shelf badge)
# already expects.
TIER_ANCHOR_PERCENT = {"fresh": 100.0, "subfresh": 50.0, "putrid": 0.0}

# Bundle key used for photos whose food has no dedicated mixture (unknown food, or too
# few labelled photos to trust a per-food fit).
DEFAULT_FOOD_KEY = "_default"

# Floors that keep EM numerically sane on small per-food splits: a component's variance
# collapsing to ~0 (every training point identical in some feature) would make its
# Gaussian density blow up to infinity, and a component's weight collapsing to exactly 0
# would make log(weight) undefined.
_VAR_FLOOR = 1e-3
_WEIGHT_FLOOR = 1e-3


def color_features(image: Image.Image) -> np.ndarray:
    """Twelve colour statistics for one photo, independent of its size: central
    tendency and spread of hue/saturation/value, how much of the frame looks browned
    or darkened on average, and how bad and how uneven its worst small patch is (a
    spotted food can look normal on average while one corner has clearly turned).
    """
    small = image.convert("RGB").resize((96, 96))
    hsv = np.asarray(small.convert("HSV"), dtype=np.float32) / 255.0
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    brown = (h >= _BROWN_HUE_LOW) & (h <= _BROWN_HUE_HIGH) & (s < _BROWN_MAX_SAT) & (v < _BROWN_MAX_VAL)
    dark = v < _DARK_MAX_VAL
    max_brown, std_brown = _patch_stats(brown.astype(np.float32), _PATCH_GRID)
    max_dark, std_dark = _patch_stats(dark.astype(np.float32), _PATCH_GRID)

    return np.array(
        [
            float(h.mean()), float(s.mean()), float(v.mean()),
            float(h.std()), float(s.std()), float(v.std()),
            float(brown.mean()), float(dark.mean()),
            max_brown, max_dark, std_brown, std_dark,
        ],
        dtype=np.float32,
    )


class ColorScaler:
    """Standardises each colour feature to zero mean / unit variance.

    A hand-rolled stand-in for ``sklearn.preprocessing.StandardScaler``: this project
    avoids scikit-learn because it pulls in scipy, and scipy's compiled LAPACK
    bindings are blocked by this machine's Application Control policy. Plain numpy
    has no such binary, so it works both for training and for the live server.
    """

    def __init__(self, mean: np.ndarray, scale: np.ndarray):
        self.mean = mean
        self.scale = scale

    @classmethod
    def fit(cls, x: np.ndarray) -> "ColorScaler":
        mean = x.mean(axis=0)
        scale = x.std(axis=0)
        scale[scale < 1e-8] = 1.0
        return cls(mean, scale)

    def transform(self, x: np.ndarray) -> np.ndarray:
        return (x - self.mean) / self.scale


class PCA:
    """Projects onto the top ``n_components`` directions of greatest variance.

    A hand-rolled stand-in for ``sklearn.decomposition.PCA`` (see ``ColorScaler``
    for why scikit-learn itself is off the table), used only to counter the curse
    of dimensionality before computing a silhouette score — see
    ``plot_gmm_k5_result.py``'s module docstring for why that matters here. Not
    used anywhere in the live, label-anchored freshness model.
    """

    def __init__(self, mean: np.ndarray, components: np.ndarray, explained_variance_ratio: np.ndarray):
        self.mean = mean
        self.components = components  # (n_components, d)
        self.explained_variance_ratio = explained_variance_ratio

    @classmethod
    def fit(cls, x: np.ndarray, n_components: int) -> "PCA":
        mean = x.mean(axis=0)
        centered = x - mean
        # Full SVD of the centered data is the standard, numerically stable way to
        # get principal components without forming the d x d covariance matrix.
        _, singular_values, components_t = np.linalg.svd(centered, full_matrices=False)
        variance = singular_values**2
        ratio = variance / variance.sum()
        return cls(mean, components_t[:n_components], ratio[:n_components])

    def transform(self, x: np.ndarray) -> np.ndarray:
        return (x - self.mean) @ self.components.T


def _log_gaussian_diag(x: np.ndarray, means: np.ndarray, variances: np.ndarray) -> np.ndarray:
    """Log density of a diagonal-covariance Gaussian, for every (sample, component)
    pair at once. ``x`` is (n, d), ``means``/``variances`` are (k, d); returns (n, k).
    """
    x = x[:, None, :]          # (n, 1, d)
    means = means[None, :, :]  # (1, k, d)
    variances = variances[None, :, :]
    log_det = np.log(variances).sum(axis=-1)              # (1, k)
    quad = ((x - means) ** 2 / variances).sum(axis=-1)     # (n, k)
    d = means.shape[-1]
    return -0.5 * (d * np.log(2 * np.pi) + log_det + quad)


def _logsumexp(a: np.ndarray, axis: int) -> np.ndarray:
    amax = np.max(a, axis=axis, keepdims=True)
    out = amax + np.log(np.sum(np.exp(a - amax), axis=axis, keepdims=True))
    return np.squeeze(out, axis=axis)


class GaussianMixture:
    """A diagonal-covariance Gaussian Mixture Model, fit by Expectation-Maximisation.

    A hand-rolled stand-in for ``sklearn.mixture.GaussianMixture`` (see ``ColorScaler``
    for why scikit-learn itself is off the table on this machine). Diagonal rather than
    full covariance: see this module's docstring for why, given how little labelled
    data some foods have.
    """

    def __init__(self, weights: np.ndarray, means: np.ndarray, variances: np.ndarray):
        self.weights = weights
        self.means = means
        self.variances = variances

    @classmethod
    def fit(
        cls,
        x: np.ndarray,
        init_means: np.ndarray,
        init_variances: np.ndarray,
        init_weights: np.ndarray,
        mask: np.ndarray | None = None,
        n_iter: int = 0,
        tol: float = 1e-4,
    ) -> "GaussianMixture":
        """``mask`` (n, k), if given, is which components each row is even allowed to
        belong to — e.g. a photo labelled fresh can count toward the Fresh or
        Sub-Fresh component but never Putrid.

        ``n_iter=0`` (the production default — see ``freshness_cluster.py``'s module
        docstring) skips the loop below entirely and just returns the label-derived
        initial parameters: every component this food's EM would run on already has
        either ground-truth labels (Fresh, Putrid) or a documented heuristic
        (Sub-Fresh), and iterating was measured to make held-out accuracy *worse* the
        more it ran, mask or no mask, because Sub-Fresh — reachable from both labelled
        sides — absorbs a growing share of the data each iteration and starves the
        other two. The loop is kept (not deleted) because it is still the correct
        general EM implementation, useful for a food with enough data that this
        project has not yet measured the same failure for, or for experimentation.
        """
        weights, means, variances = init_weights.copy(), init_means.copy(), init_variances.copy()
        prev_log_likelihood = -np.inf

        for _ in range(n_iter):
            # E-step: each point's posterior probability of belonging to each component.
            log_weighted = _log_gaussian_diag(x, means, variances) + np.log(weights)[None, :]
            if mask is not None:
                log_weighted = np.where(mask, log_weighted, -np.inf)
            log_norm = _logsumexp(log_weighted, axis=1)
            responsibilities = np.exp(log_weighted - log_norm[:, None])
            log_likelihood = float(log_norm.sum())

            # M-step: re-fit each component to its (soft) share of the data.
            n_k = responsibilities.sum(axis=0)
            n_k = np.maximum(n_k, 1e-8)
            weights = n_k / len(x)
            weights = np.maximum(weights, _WEIGHT_FLOOR)
            weights /= weights.sum()

            means = (responsibilities.T @ x) / n_k[:, None]
            diff_sq = (x[:, None, :] - means[None, :, :]) ** 2
            variances = np.einsum("nk,nkd->kd", responsibilities, diff_sq) / n_k[:, None]
            variances = np.maximum(variances, _VAR_FLOOR)

            if abs(log_likelihood - prev_log_likelihood) < tol * max(abs(log_likelihood), 1.0):
                break
            prev_log_likelihood = log_likelihood

        return cls(weights, means, variances)

    def posterior(self, x: np.ndarray) -> np.ndarray:
        """Posterior probability of each component for every row of ``x`` — (n, k)."""
        log_weighted = _log_gaussian_diag(x, self.means, self.variances) + np.log(self.weights)[None, :]
        log_norm = _logsumexp(log_weighted, axis=1)
        return np.exp(log_weighted - log_norm[:, None])

    def log_likelihood(self, x: np.ndarray) -> float:
        """Total log-likelihood of ``x`` under this mixture — the quantity AIC/BIC
        trade off against model size (see ``plot_gmm_bic.py``).
        """
        log_weighted = _log_gaussian_diag(x, self.means, self.variances) + np.log(self.weights)[None, :]
        return float(_logsumexp(log_weighted, axis=1).sum())

    @property
    def n_params(self) -> int:
        """Free parameters: a mean and a variance per feature per component, plus
        (k - 1) independent mixture weights.
        """
        k, d = self.means.shape
        return k * d * 2 + (k - 1)


def silhouette_samples(x: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """Per-point silhouette coefficient: how much closer each point is to its own
    cluster than to the nearest other one, on a -1..1 scale (higher is
    better-separated). A hand-rolled stand-in for
    ``sklearn.metrics.silhouette_samples`` (see ``ColorScaler`` for why scikit-learn
    itself is off the table on this machine), used only for the diagnostic BIC/AIC
    / silhouette model-selection scripts — not by the shipped, label-anchored model.

    Fully vectorised: the usual per-point python loop is replaced by one pairwise
    distance matrix and a cluster-membership one-hot matrix, since both k (up to a
    few dozen) and n (up to a few thousand photos here) make an O(n^2) distance
    matrix cheap but a python-level loop over n needlessly slow.
    """
    n = len(x)
    labels = np.asarray(labels)
    unique = np.unique(labels)
    k = len(unique)
    if k < 2 or k >= n:
        return np.full(n, np.nan)

    sq_norms = (x**2).sum(axis=1)
    dist = np.sqrt(np.maximum(sq_norms[:, None] + sq_norms[None, :] - 2 * x @ x.T, 0.0))

    onehot = (labels[:, None] == unique[None, :]).astype(np.float64)  # (n, k)
    counts = onehot.sum(axis=0)  # (k,)
    sum_dist = dist @ onehot  # (n, k): sum of distances from each point to each cluster

    own_idx = np.searchsorted(unique, labels)  # unique is sorted, so this is exact
    own_count = counts[own_idx]
    own_sum = sum_dist[np.arange(n), own_idx]
    # dist(i, i) = 0, so the sum already excludes i's own contribution; only the
    # denominator needs the "- 1" to not count i itself as a neighbour.
    a = np.where(own_count > 1, own_sum / np.maximum(own_count - 1, 1), 0.0)

    mean_dist = sum_dist / np.maximum(counts[None, :], 1)
    mean_dist[np.arange(n), own_idx] = np.inf  # exclude the point's own cluster from b(i)
    b = mean_dist.min(axis=1)

    denom = np.maximum(a, b)
    s = np.where(denom > 0, (b - a) / denom, 0.0)
    s = np.where(own_count > 1, s, 0.0)  # a singleton cluster's point scores 0, by convention
    return s


def silhouette_score(x: np.ndarray, labels: np.ndarray) -> float:
    """Mean silhouette coefficient over every point — see ``silhouette_samples``."""
    s = silhouette_samples(x, labels)
    return float(np.nanmean(s)) if s.size else float("nan")


class FreshnessClusterer:
    """Loads the trained per-food Gaussian Mixture Models (and the scaler saved
    alongside each one) and turns a photo into a Fresh / Sub-Fresh / Putrid reading
    by the component with the highest posterior probability.
    """

    def __init__(self, model_path: Path):
        import joblib

        bundle = joblib.load(model_path)
        # food name (as `labels.food_name_from_label` spells it) -> {"scaler": ColorScaler,
        # "gmm": GaussianMixture} whose components are ordered fresh/subfresh/putrid.
        # DEFAULT_FOOD_KEY covers foods with no dedicated mixture (unknown food, or too
        # little data).
        self.foods: dict[str, dict[str, Any]] = bundle["foods"]

    def assess(self, image: Image.Image, food_name: str | None = None) -> dict[str, Any]:
        entry = self.foods.get(food_name) if food_name else None
        used_default = entry is None
        if entry is None:
            entry = self.foods[DEFAULT_FOOD_KEY]

        features = color_features(image).reshape(1, -1)
        scaled = entry["scaler"].transform(features)
        posteriors = entry["gmm"].posterior(scaled)[0]  # (3,), ordered TIER_BY_RANK

        percent = float(sum(posteriors[i] * TIER_ANCHOR_PERCENT[TIER_BY_RANK[i]] for i in range(3)))
        percent = max(0.0, min(100.0, percent))
        # The tier is read off the same blended percent shown to the user, not a
        # separate argmax of the posteriors: those two can disagree (three diffuse,
        # near-tied posteriors can make "fresh" win narrowly while the blend still
        # lands in Sub-Fresh territory), which measured as a real tier/percent
        # mismatch — e.g. a photo reported "Fresh" at 50.8%. One source of truth
        # avoids that, and matches pipeline.freshness_tier's own 70%/30% cuts.
        if percent >= 70.0:
            tier = "fresh"
        elif percent >= 30.0:
            tier = "subfresh"
        else:
            tier = "putrid"

        return {
            "tier": tier,
            "tierLabel": TIER_LABELS[tier],
            "freshnessPercent": round(percent, 1),
            "componentPosteriors": {TIER_BY_RANK[i]: round(float(posteriors[i]), 4) for i in range(3)},
            "usedDefaultCentroids": used_default,
        }


def load_bundle_metadata(model_path: Path) -> dict[str, Any]:
    """The human-readable sidecar JSON saved next to the model (training summary)."""
    meta_path = model_path.with_suffix(".json")
    if not meta_path.exists():
        return {}
    return json.loads(meta_path.read_text(encoding="utf-8"))
