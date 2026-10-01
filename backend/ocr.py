"""Read the printed text on a package label (expiry and manufacturing dates).

Uses RapidOCR (PP-OCR models on ONNX Runtime, bundled in the wheel, CPU only). The
model loads on the first request rather than at server start, so the API still boots
quickly when nobody scans a label. Dates are parsed on the phone from the text this
returns, which keeps a single parser for typed and scanned labels.
"""

from __future__ import annotations

import threading
import time
from typing import Any

import numpy as np
from PIL import Image

MAX_SIDE = 1600
MIN_CONFIDENCE = 0.35


class OcrUnavailable(RuntimeError):
    """The OCR engine is not installed or failed to start."""


_engine: Any = None
_lock = threading.Lock()


def _get_engine() -> Any:
    global _engine
    if _engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
        except ImportError as error:
            raise OcrUnavailable(
                "Label scanning needs the OCR engine. Run: pip install rapidocr-onnxruntime"
            ) from error
        _engine = RapidOCR()
    return _engine


def is_available() -> bool:
    try:
        _get_engine()
        return True
    except OcrUnavailable:
        return False


def _prepare(image: Image.Image) -> np.ndarray:
    photo = image.convert("RGB")
    longest = max(photo.size)
    if longest > MAX_SIDE:
        scale = MAX_SIDE / longest
        photo = photo.resize((round(photo.width * scale), round(photo.height * scale)), Image.LANCZOS)
    return np.asarray(photo)


def _rows(detections: list[Any]) -> list[dict[str, Any]]:
    """Merge detected boxes into reading-order rows, so "EXP:" and its date share one line."""
    boxes = []
    for box, text, confidence in detections:
        confidence = float(confidence)
        if confidence < MIN_CONFIDENCE or not str(text).strip():
            continue
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]
        boxes.append(
            {
                "text": str(text).strip(),
                "confidence": confidence,
                "left": min(xs),
                "top": min(ys),
                "middle": (min(ys) + max(ys)) / 2,
                "height": max(ys) - min(ys),
            }
        )
    if not boxes:
        return []

    boxes.sort(key=lambda b: b["middle"])
    typical_height = float(np.median([b["height"] for b in boxes])) or 1.0

    rows: list[list[dict[str, Any]]] = []
    for box in boxes:
        if rows and abs(box["middle"] - np.mean([b["middle"] for b in rows[-1]])) <= 0.6 * typical_height:
            rows[-1].append(box)
        else:
            rows.append([box])

    merged = []
    for row in rows:
        row.sort(key=lambda b: b["left"])
        merged.append(
            {
                "text": " ".join(b["text"] for b in row),
                "confidence": round(sum(b["confidence"] for b in row) / len(row), 3),
            }
        )
    return merged


def read_text(image: Image.Image) -> dict[str, Any]:
    started = time.perf_counter()
    engine = _get_engine()
    array = _prepare(image)
    with _lock:
        detections, _ = engine(array)
    lines = _rows(detections or [])
    return {
        "text": "\n".join(line["text"] for line in lines),
        "lines": lines,
        "ms": round((time.perf_counter() - started) * 1000, 1),
    }
