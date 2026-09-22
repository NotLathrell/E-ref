"""Food analysis pipeline used by the E-REF inference API.

Stage 1  YOLOv8 detection (``yolov8n.pt``) locates the food in the frame.
Stage 2  A CNN classifier (YOLOv8n-cls, 19 classes) reads the full frame and
         returns the food identity: nine foods x fresh/rotten, plus ``other`` for
         anything the app does not know, which the app reports as an unknown food.
Stage 3  A dedicated freshness CNN reads the full frame and returns fresh/rotten.
         The retrained YOLOv8n-cls freshness model is preferred; the older
         MobileNetV2 (TFLite) model is the fallback when it is not present.

The detector is COCO-pretrained and only knows apple, orange and banana among
the dataset's foods, so it labels a tomato as an apple, orange or donut. Feeding
its crop to the CNNs made them worse (rotten-tomato identification fell from
100% to 55% on the validation split), so both CNNs always read the full frame,
the same input the evaluation in ``evaluate.py`` measures. The detector supplies
the location and a cross-check, and never decides identity.

Every stage is optional at load time: whatever is present is used, and the
response reports which models actually ran.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

try:  # `uvicorn backend.server:app` from the project root
    from .indicators import analyze_visual_indicators
    from .labels import FOOD_ALIASES, OTHER_LABEL, food_name_from_label, freshness_from_label
except ImportError:  # `python evaluate.py` from inside backend/
    from indicators import analyze_visual_indicators
    from labels import FOOD_ALIASES, OTHER_LABEL, food_name_from_label, freshness_from_label

PROJECT_ROOT = Path(__file__).resolve().parent.parent

DETECTOR_PATH = PROJECT_ROOT / "yolov8n.pt"
RUNS_DIR = PROJECT_ROOT / "runs" / "classify" / "runs" / "classify"
IDENTITY_V2_PATH = RUNS_DIR / "eref_identity_v2" / "weights" / "best.pt"
IDENTITY_V1_PATH = RUNS_DIR / "food_multiclass" / "weights" / "best.pt"
FRESHNESS_V2_PATH = RUNS_DIR / "eref_freshness_v2" / "weights" / "best.pt"
FRESHNESS_TFLITE_PATH = PROJECT_ROOT / "Datasets" / "dataset" / "dist" / "model_v2" / "final.tflite"

# The retrained models are used when present; the originals keep the app working
# from a checkout that predates the retraining.
IDENTITY_PATH = IDENTITY_V2_PATH if IDENTITY_V2_PATH.exists() else IDENTITY_V1_PATH
FRESHNESS_YOLO_PATH = FRESHNESS_V2_PATH

# COCO classes treated as a food region. yolov8n is COCO-pretrained, so it only
# names a few of the dataset's foods; the rest come back as a nearby COCO class.
DETECTOR_FOOD_CLASSES = {
    "banana",
    "apple",
    "orange",
    "broccoli",
    "carrot",
    "sandwich",
    "hot dog",
    "pizza",
    "donut",
    "cake",
    "bowl",
}

# The only COCO classes that name a food this app identifies. Any other COCO
# label (donut, cake, bowl...) says nothing about the food's type.
DETECTOR_TO_FOOD = {"apple": "apple", "orange": "orange", "banana": "banana"}

IDENTITY_MODEL_NAME = "yolov8n-cls (identity)"

# Below this top-1 confidence the answer becomes "unknown food" rather than a guess.
# 0 disables it. Chosen on the validation split by ``benchmark.py --tune``.
MIN_IDENTITY_CONFIDENCE = 0.0

DETECTION_CONF = 0.35
TOP_K = 3


@dataclass
class StageResult:
    """One stage of the pipeline, surfaced to the client for transparency."""

    name: str
    model: str
    ran: bool
    detail: str

    def as_dict(self) -> dict[str, Any]:
        return {"name": self.name, "model": self.model, "ran": self.ran, "detail": self.detail}


class ModelUnavailable(RuntimeError):
    """Raised when no model capable of identifying the food could be loaded."""


class FoodPipeline:
    def __init__(
        self,
        detector_path: Path = DETECTOR_PATH,
        identity_path: Path = IDENTITY_PATH,
        freshness_tflite_path: Path = FRESHNESS_TFLITE_PATH,
        freshness_yolo_path: Path = FRESHNESS_YOLO_PATH,
    ) -> None:
        self.detector_path = Path(detector_path)
        self.identity_path = Path(identity_path)
        self.freshness_tflite_path = Path(freshness_tflite_path)
        self.freshness_yolo_path = Path(freshness_yolo_path)

        self._lock = threading.Lock()
        self._detector = None
        self._identity = None
        self._freshness_tflite = None
        self._freshness_yolo = None
        self._loaded = False
        self._load_errors: dict[str, str] = {}

    # ------------------------------------------------------------------ load

    def load(self) -> None:
        """Load every model that is present on disk. Safe to call repeatedly."""
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return

            if self.detector_path.exists():
                try:
                    from ultralytics import YOLO

                    self._detector = YOLO(str(self.detector_path))
                except Exception as error:  # pragma: no cover - environment dependent
                    self._load_errors["detector"] = str(error)

            if self.identity_path.exists():
                try:
                    from ultralytics import YOLO

                    self._identity = YOLO(str(self.identity_path))
                except Exception as error:  # pragma: no cover
                    self._load_errors["identity"] = str(error)
            else:
                self._load_errors["identity"] = f"Weights not found: {self.identity_path}"

            if self.freshness_yolo_path.exists():
                try:
                    from ultralytics import YOLO

                    self._freshness_yolo = YOLO(str(self.freshness_yolo_path))
                except Exception as error:  # pragma: no cover
                    self._load_errors["freshness_yolo"] = str(error)

            if self._freshness_yolo is None and self.freshness_tflite_path.exists():
                try:
                    self._freshness_tflite = _TFLiteFreshness(self.freshness_tflite_path)
                except Exception as error:
                    self._load_errors["freshness_tflite"] = str(error)

            self._loaded = True

    # ----------------------------------------------------------------- status

    @property
    def identity_names(self) -> dict[int, str]:
        self.load()
        if self._identity is None:
            return {}
        return dict(self._identity.names)

    def status(self) -> dict[str, Any]:
        self.load()
        freshness_model = None
        if self._freshness_yolo is not None:
            freshness_model = "yolov8n-cls-freshness"
        elif self._freshness_tflite is not None:
            freshness_model = "mobilenetv2-tflite"

        return {
            "ready": self._identity is not None,
            "models": {
                "detector": {
                    "name": "yolov8n",
                    "loaded": self._detector is not None,
                    "path": str(self.detector_path),
                },
                "identity": {
                    "name": IDENTITY_MODEL_NAME,
                    "loaded": self._identity is not None,
                    "path": str(self.identity_path),
                    "classes": len(self.identity_names),
                },
                "freshness": {
                    "name": freshness_model,
                    "loaded": freshness_model is not None,
                    "path": str(
                        self.freshness_yolo_path
                        if self._freshness_yolo is not None
                        else self.freshness_tflite_path
                    ),
                },
            },
            "loadErrors": self._load_errors,
        }

    # -------------------------------------------------------------- inference

    def analyze(self, image: Image.Image, *, run_detector: bool = True) -> dict[str, Any]:
        self.load()
        if self._identity is None:
            raise ModelUnavailable(
                self._load_errors.get("identity", "The food identification model is not available.")
            )

        started = time.perf_counter()
        stages: list[StageResult] = []

        detection, boxes = self._detect(image, run_detector=run_detector)
        identity = self._identify(image, stages)
        self._cross_check(detection, identity, stages)
        freshness = self._assess_freshness(image, identity, stages)
        indicators = analyze_visual_indicators(image, freshness["probRotten"])

        label = identity["label"]
        food_name = food_name_from_label(label)
        spoilage_score = round(freshness["probRotten"], 4)

        return {
            # Flat fields consumed directly by the mobile client.
            "foodName": food_name,
            "modelLabel": label,
            "foodIdentityAvailable": food_name is not None,
            "confidence": identity["confidence"],
            "freshness": freshness["freshness"],
            "freshnessConfidence": freshness["confidence"],
            "spoilageScore": spoilage_score,
            "detectedIndicators": indicators["detected"],
            "indicatorScores": indicators["scores"],
            "boxes": boxes,
            # Per-stage detail for the analysis screen.
            "detection": detection,
            "identity": identity,
            "freshnessDetail": freshness,
            "stages": [stage.as_dict() for stage in stages],
            "inferenceMs": round((time.perf_counter() - started) * 1000, 1),
        }

    # -------------------------------------------------------- stage 1: detect

    def _detect(
        self, image: Image.Image, *, run_detector: bool
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Locate the food. Returns the detection summary and every box found."""
        detection: dict[str, Any] = {
            "model": "yolov8n",
            "used": False,
            "label": None,
            "confidence": None,
            "box": None,
            "count": 0,
            "agreement": None,
            "reason": "detector disabled" if not run_detector else "detector unavailable",
        }
        boxes: list[dict[str, Any]] = []

        if not run_detector or self._detector is None:
            return detection, boxes

        try:
            result = self._detector.predict(image, verbose=False, conf=DETECTION_CONF)[0]
        except Exception as error:
            detection["reason"] = f"detection failed: {error}"
            return detection, boxes

        names = result.names
        if result.boxes is not None and len(result.boxes) > 0:
            for coords, conf, cls in zip(
                result.boxes.xyxy.cpu().tolist(),
                result.boxes.conf.cpu().tolist(),
                result.boxes.cls.cpu().tolist(),
            ):
                boxes.append(
                    {
                        "box": [round(float(v), 1) for v in coords],
                        "confidence": round(float(conf), 4),
                        "label": str(names[int(cls)]),
                    }
                )

        detection["count"] = len(boxes)
        food_boxes = [b for b in boxes if b["label"] in DETECTOR_FOOD_CLASSES]

        if not food_boxes:
            detection["reason"] = (
                "no food region found by the detector"
                if boxes
                else "no objects found by the detector"
            )
            return detection, boxes

        best = max(food_boxes, key=lambda b: b["confidence"] * _box_area(b["box"]))
        detection.update(
            {
                "used": True,
                "label": best["label"],
                "confidence": best["confidence"],
                "box": best["box"],
                "reason": f"food region located as '{best['label']}'",
            }
        )
        return detection, boxes

    def _cross_check(
        self, detection: dict[str, Any], identity: dict[str, Any], stages: list[StageResult]
    ) -> None:
        """Compare the detector's COCO label with the CNN's food and record the outcome.

        The CNN always wins. This only tells the client whether the two agree, so a
        tomato the detector calls an "orange" is explained instead of contradicting
        the identity shown next to it.
        """
        food = identity["foodName"]
        label = detection["label"]
        described = f"a {food}" if food else "not one of the supported foods"

        if not detection["used"]:
            detection["agreement"] = None
            detail = f"{detection['reason']}; the CNN read the full frame and found {described}"
        elif label in DETECTOR_TO_FOOD:
            if DETECTOR_TO_FOOD[label] == identity["foodName"]:
                detection["agreement"] = "agrees"
                detail = f"YOLOv8 labelled the region '{label}' and the CNN agrees it is a {food}"
            else:
                detection["agreement"] = "differs"
                detail = (
                    f"YOLOv8 labelled the region '{label}' but the CNN found {described}; "
                    "the CNN takes precedence"
                )
        else:
            detection["agreement"] = "outside_vocabulary"
            detail = (
                f"YOLOv8 found a food region but its label ('{label}') is not a food type "
                f"it can name; the CNN found {described}"
            )
        detection["reason"] = detail
        stages.insert(0, StageResult("detection", "yolov8n", detection["used"], detail))

    # ------------------------------------------------------ stage 2: identity

    def _identify(self, image: Image.Image, stages: list[StageResult]) -> dict[str, Any]:
        result = self._identity.predict(image, verbose=False)[0]
        probs = result.probs.data.cpu().numpy()
        names = result.names

        order = np.argsort(probs)[::-1][:TOP_K]
        top_k = [
            {
                "label": str(names[int(i)]),
                "foodName": food_name_from_label(str(names[int(i)])),
                "confidence": round(float(probs[int(i)]), 4),
            }
            for i in order
        ]
        label = top_k[0]["label"]
        low_confidence = (
            MIN_IDENTITY_CONFIDENCE > 0
            and top_k[0]["confidence"] < MIN_IDENTITY_CONFIDENCE
            and OTHER_LABEL in names.values()
        )
        if low_confidence:
            label = OTHER_LABEL
        rotten_mass = identity_rotten_mass(probs, [str(names[i]) for i in range(len(names))])
        food_name = food_name_from_label(label)

        if low_confidence:
            detail = (
                f"too uncertain to name the food (best guess {top_k[0]['label']} at "
                f"{top_k[0]['confidence'] * 100:.1f}%)"
            )
        elif food_name is None:
            detail = f"not one of the supported foods ({top_k[0]['confidence'] * 100:.1f}% confidence)"
        else:
            detail = f"{label} at {top_k[0]['confidence'] * 100:.1f}% confidence"
        stages.append(StageResult("identification", IDENTITY_MODEL_NAME, True, detail))
        return {
            "model": IDENTITY_MODEL_NAME,
            "label": label,
            "foodName": food_name,
            "confidence": top_k[0]["confidence"],
            "topK": top_k,
            "rottenProbabilityMass": round(rotten_mass, 4),
            "classes": len(names),
        }

    # ----------------------------------------------------- stage 3: freshness

    def _assess_freshness(
        self, image: Image.Image, identity: dict[str, Any], stages: list[StageResult]
    ) -> dict[str, Any]:
        # The identity model separates fresh_* from rotten_*, so its rotten share is
        # a food-aware second opinion. It says nothing when the item is not a
        # supported food, so it is left out then.
        identity_prob_rotten = identity["rottenProbabilityMass"] if identity["foodName"] else None
        classifier_label = freshness_from_label(identity["label"])

        cnn_prob_rotten: float | None = None
        cnn_model: str | None = None

        if self._freshness_yolo is not None:
            cnn_prob_rotten = yolo_prob_rotten(self._freshness_yolo.predict(image, verbose=False)[0])
            cnn_model = "yolov8n-cls-freshness"
        elif self._freshness_tflite is not None:
            cnn_prob_rotten = self._freshness_tflite.prob_rotten(image)
            cnn_model = "mobilenetv2-tflite"

        prob_rotten = fuse_freshness(cnn_prob_rotten, identity_prob_rotten)
        agreement = None
        if cnn_prob_rotten is None:
            model_name = identity["model"]
            detail = "derived from the identity model; no dedicated freshness CNN loaded"
        else:
            model_name = cnn_model
            if identity_prob_rotten is not None:
                agreement = (cnn_prob_rotten >= 0.5) == (identity_prob_rotten >= 0.5)
                model_used = f"{cnn_model} + {identity['model']}"
            else:
                model_used = cnn_model
            detail = (
                f"{'rotten' if prob_rotten >= 0.5 else 'fresh'} at "
                f"{max(prob_rotten, 1 - prob_rotten) * 100:.1f}% confidence"
            )
            model_name = model_used
        stages.append(StageResult("freshness", model_name, True, detail))

        is_rotten = prob_rotten >= 0.5
        return {
            "model": model_name,
            "freshness": "spoiled" if is_rotten else "fresh",
            "label": "rotten" if is_rotten else "fresh",
            "confidence": round(prob_rotten if is_rotten else 1 - prob_rotten, 4),
            "probRotten": round(prob_rotten, 4),
            "probFresh": round(1 - prob_rotten, 4),
            "sources": {
                "freshnessCnn": None if cnn_prob_rotten is None else round(cnn_prob_rotten, 4),
                "identityClassifier": None if identity_prob_rotten is None else round(identity_prob_rotten, 4),
                "identityLabel": classifier_label,
            },
            "agreement": agreement,
        }


# Weight of the dedicated freshness CNN when it is fused with the identity model's
# rotten share. Shared with evaluate.py so the reported metrics describe the verdict
# the app shows.
CNN_WEIGHT = 0.65


def identity_rotten_mass(probs, names: list[str]) -> float:
    """Share of the identity model's food probability that sits on ``rotten_*`` classes.

    The ``other`` class is left out of the ratio: it carries no freshness opinion.
    Returns 0.5 when the model puts no weight on any food class.
    """
    rotten = fresh = 0.0
    for prob, name in zip(probs, names):
        verdict = freshness_from_label(name)
        if verdict == "spoiled":
            rotten += float(prob)
        elif verdict == "fresh":
            fresh += float(prob)
    total = rotten + fresh
    return rotten / total if total > 1e-6 else 0.5


def yolo_prob_rotten(result) -> float | None:
    """Rotten probability from a YOLOv8-cls freshness result, or None if unlabelled."""
    probs = result.probs.data.cpu().numpy()
    index = next((i for i, name in result.names.items() if str(name).lower().startswith("rot")), None)
    return None if index is None else float(probs[int(index)])


def fuse_freshness(cnn_prob_rotten: float | None, identity_prob_rotten: float | None) -> float:
    """Combine the freshness CNN and the identity model into one rotten probability."""
    if cnn_prob_rotten is None and identity_prob_rotten is None:
        return 0.5
    if cnn_prob_rotten is None:
        value = identity_prob_rotten
    elif identity_prob_rotten is None:
        value = cnn_prob_rotten
    else:
        value = CNN_WEIGHT * cnn_prob_rotten + (1 - CNN_WEIGHT) * identity_prob_rotten
    return float(min(max(value, 0.0), 1.0))


class _TFLiteFreshness:
    """MobileNetV2 binary freshness CNN exported to TFLite.

    Output is a single sigmoid unit where 1.0 means rotten (see the label map in
    ``Datasets/dataset/dist/model_v2/model_info.json``).
    """

    def __init__(self, model_path: Path) -> None:
        from ai_edge_litert.interpreter import Interpreter

        self._lock = threading.Lock()
        self._interpreter = Interpreter(model_path=str(model_path))
        self._interpreter.allocate_tensors()
        self._input = self._interpreter.get_input_details()[0]
        self._output = self._interpreter.get_output_details()[0]
        _, self.height, self.width, _ = self._input["shape"]

    def prob_rotten(self, image: Image.Image) -> float:
        array = self.preprocess(image)
        with self._lock:
            self._interpreter.set_tensor(self._input["index"], array)
            self._interpreter.invoke()
            raw = self._interpreter.get_tensor(self._output["index"])
        return float(np.asarray(raw).squeeze())

    def preprocess(self, image: Image.Image) -> np.ndarray:
        resized = image.convert("RGB").resize((int(self.width), int(self.height)))
        array = np.asarray(resized, dtype=np.float32) / 255.0
        array = array[None, ...]
        if self._input["dtype"] == np.uint8:
            array = (array * 255).astype(np.uint8)
        return array


def _box_area(box: list[float]) -> float:
    x1, y1, x2, y2 = box
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


__all__ = [
    "FOOD_ALIASES",
    "FoodPipeline",
    "ModelUnavailable",
    "fuse_freshness",
    "identity_rotten_mass",
    "yolo_prob_rotten",
    "food_name_from_label",
    "freshness_from_label",
]
