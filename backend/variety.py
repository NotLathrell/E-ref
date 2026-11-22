"""Food variety identification: a second, optional question answered after the main
identity model has already said what the food is ("this is an apple"). Kept separate
from the fresh/rotten verdict (``freshness_cluster.py``) because no public dataset
pairs a cultivar label with a freshness label on the same photo — see
``build_apple_varieties.py`` for the data and why a blended "fresh Fuji" class isn't
possible without it.

Only apple has a trained variety classifier today (Fuji, Gala, Granny Smith, Red
Delicious, Golden Delicious — the imported varieties sold in Philippine groceries).
The design is per-food so another food's varieties can be added later the same way:
train a classifier, add its weights path and label map here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = PROJECT_ROOT / "runs" / "classify" / "runs" / "classify"

# Below this confidence the photo could be a variety the model wasn't trained on
# (or a poor view of a known one), so it is reported as unidentified rather than
# forcing a guess — the same philosophy as MIN_IDENTITY_CONFIDENCE in pipeline.py,
# just defaulting on since variety is a nice-to-have, never the main verdict.
MIN_VARIETY_CONFIDENCE = 0.5

VARIETY_MODEL_NAME = "yolov8n-cls (apple variety)"

# food name -> (weights path, class label -> display label)
FOOD_VARIETY_MODELS: dict[str, tuple[Path, dict[str, str]]] = {
    "apple": (
        RUNS_DIR / "eref_apple_variety_v1" / "weights" / "best.pt",
        {
            "fuji": "Fuji",
            "gala": "Gala",
            "grannysmith": "Granny Smith",
            "reddelicious": "Red Delicious",
            "goldendelicious": "Golden Delicious",
        },
    ),
}


class VarietyClassifier:
    """One food's variety model, e.g. apple -> Fuji/Gala/Granny Smith/..."""

    def __init__(self, model_path: Path, labels: dict[str, str]):
        from ultralytics import YOLO

        self.model = YOLO(str(model_path))
        self.labels = labels

    def classify(self, image) -> dict[str, Any]:
        result = self.model.predict(image, verbose=False)[0]
        probs = result.probs.data.cpu().numpy()
        names = result.names

        order = probs.argsort()[::-1][:3]
        top_k = [
            {"variety": str(names[int(i)]), "label": self.labels.get(str(names[int(i)]), str(names[int(i)]).title()),
             "confidence": round(float(probs[int(i)]), 4)}
            for i in order
        ]
        best = top_k[0]
        confident = best["confidence"] >= MIN_VARIETY_CONFIDENCE
        return {
            "variety": best["variety"] if confident else None,
            "varietyLabel": best["label"] if confident else None,
            "varietyConfidence": best["confidence"],
            "topK": top_k,
        }


def load_variety_classifiers() -> dict[str, VarietyClassifier]:
    """One classifier per food that has trained weights on disk; foods without one
    (everything except apple, today) simply have no entry.
    """
    classifiers: dict[str, VarietyClassifier] = {}
    for food_name, (model_path, labels) in FOOD_VARIETY_MODELS.items():
        if model_path.exists():
            classifiers[food_name] = VarietyClassifier(model_path, labels)
    return classifiers
