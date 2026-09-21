"""Visible spoilage indicator analysis.

The freshness CNN answers *whether* an item is spoiled but not *why*. The app's
result screen lists the specific indicators from the study design, so this
module measures each one directly from the cropped food region with classic
computer-vision statistics and reports them alongside the CNN verdict.

These are image statistics, not network outputs. Each raw measurement is scaled
by the CNN's rotten probability so a clean image never lights up the indicator
list on the strength of a highlight or a shadow alone.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from PIL import Image

# Keys must match FLAG_LABELS in mobile/screens/CameraScreen.js.
INDICATOR_KEYS = (
    "discoloration",
    "texture_abnormality",
    "packaging_damage",
    "mold_spots",
    "excess_moisture",
)

DETECTION_THRESHOLD = 0.5
ANALYSIS_SIZE = 256


def analyze_visual_indicators(image: Image.Image, prob_rotten: float) -> dict[str, Any]:
    """Score each visible spoilage indicator for a cropped food image.

    Returns the per-indicator scores in 0-1 plus the subset that crossed the
    detection threshold.
    """
    try:
        rgb = np.asarray(image.convert("RGB").resize((ANALYSIS_SIZE, ANALYSIS_SIZE)))
    except Exception:
        return {"scores": {key: 0.0 for key in INDICATOR_KEYS}, "detected": [], "method": "unavailable"}

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    hue, saturation, value = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    # Ignore a near-uniform background so the statistics describe the food.
    food_mask = _food_mask(saturation, value)
    food_pixels = max(int(food_mask.sum()), 1)

    raw = {
        "discoloration": _discoloration(hue, saturation, value, food_mask, food_pixels),
        "texture_abnormality": _texture_abnormality(gray, food_mask),
        "packaging_damage": 0.0,  # Not inferable from the food itself; user-flagged.
        "mold_spots": _mold_spots(saturation, value, food_mask),
        "excess_moisture": _excess_moisture(saturation, value, food_mask, food_pixels),
    }

    # The CNN verdict is the prior: weak evidence stays quiet on a fresh item.
    gate = 0.3 + 0.7 * float(min(max(prob_rotten, 0.0), 1.0))
    scores = {key: round(float(min(max(val * gate, 0.0), 1.0)), 2) for key, val in raw.items()}
    detected = [key for key, val in scores.items() if val >= DETECTION_THRESHOLD]

    return {"scores": scores, "detected": detected, "method": "opencv-visual-analysis"}


def _food_mask(saturation: np.ndarray, value: np.ndarray) -> np.ndarray:
    """Coarse foreground mask: drop blown-out white and near-black background."""
    mask = ((saturation > 25) | ((value > 35) & (value < 240))).astype(np.uint8)
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    if mask.sum() < mask.size * 0.1:
        return np.ones_like(mask)
    return mask


def _discoloration(
    hue: np.ndarray,
    saturation: np.ndarray,
    value: np.ndarray,
    mask: np.ndarray,
    food_pixels: int,
) -> float:
    """Brown and blackened patches — the dominant visual sign of rot."""
    brown = (hue <= 25) & (saturation > 50) & (value < 110)
    blackened = value < 55
    affected = int(((brown | blackened) & (mask > 0)).sum())
    fraction = affected / food_pixels
    return _ramp(fraction, 0.04, 0.35)


def _mold_spots(saturation: np.ndarray, value: np.ndarray, mask: np.ndarray) -> float:
    """Desaturated fuzzy patches sitting on coloured flesh."""
    candidate = ((saturation < 45) & (value > 110) & (value < 235) & (mask > 0)).astype(np.uint8)
    kernel = np.ones((3, 3), np.uint8)
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_OPEN, kernel)

    count, _, stats, _ = cv2.connectedComponentsWithStats(candidate, connectivity=8)
    total = float(mask.sum())
    blobs = 0
    area = 0.0
    for index in range(1, count):
        blob_area = float(stats[index, cv2.CC_STAT_AREA])
        # Speckles, not whole regions: mould reads as many small patches.
        if 20 <= blob_area <= total * 0.12:
            blobs += 1
            area += blob_area

    if blobs == 0:
        return 0.0
    density = area / max(total, 1.0)
    return _ramp(density, 0.01, 0.18) * _ramp(float(blobs), 2.0, 14.0)


def _texture_abnormality(gray: np.ndarray, mask: np.ndarray) -> float:
    """Wrinkling and surface break-up raise high-frequency energy."""
    laplacian = cv2.Laplacian(gray, cv2.CV_64F, ksize=3)
    selected = laplacian[mask > 0]
    if selected.size == 0:
        return 0.0
    roughness = float(np.var(selected))

    blurred = cv2.GaussianBlur(gray, (9, 9), 0).astype(np.float64)
    local_contrast = float(np.std((gray.astype(np.float64) - blurred)[mask > 0]))

    return max(_ramp(roughness, 250.0, 2600.0), _ramp(local_contrast, 6.0, 24.0))


def _excess_moisture(
    saturation: np.ndarray, value: np.ndarray, mask: np.ndarray, food_pixels: int
) -> float:
    """Wet sheen shows up as bright, low-saturation specular highlights."""
    sheen = ((value > 225) & (saturation < 45) & (mask > 0)).sum()
    return _ramp(float(sheen) / food_pixels, 0.015, 0.16)


def _ramp(value: float, low: float, high: float) -> float:
    """Linear 0-1 ramp between ``low`` and ``high``."""
    if high <= low:
        return 0.0
    return float(min(max((value - low) / (high - low), 0.0), 1.0))
