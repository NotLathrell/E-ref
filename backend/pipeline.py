"""Food analysis pipeline used by the E-REF inference API.

Stage 1  YOLOv8 detection finds every food in the frame and draws a box around it.
         The fine-tuned ``eref-detector-v1`` (12 foods, ``train_detector.py``) is used
         when its weights are present; otherwise the COCO ``yolov8n.pt`` is used as a
         single-region locator.
Stage 2  A CNN classifier (YOLOv8n-cls, 25 classes) reads the image and returns the
         food identity: twelve foods x fresh/rotten, plus ``other`` for anything the
         app does not know, which the app reports as an unknown food.
Stage 3  A dedicated freshness CNN reads the image and returns fresh/rotten. The
         retrained YOLOv8n-cls freshness model is preferred; the older MobileNetV2
         (TFLite) model is the fallback when it is not present.

Classification (stages 2-3) answers "what is this photo, and is it fresh?" for one
image. Detection (stage 1) answers "which foods are in the frame, and where?". So a
frame with several foods is handled by cropping each detected box and running stages
2-3 on the crop: the response lists one entry per food in ``objects``, next to the
whole-frame result the single-item flow uses.

The COCO detector only knows apple, orange and banana among the dataset's foods, so it
labels a tomato as an apple, orange or donut, and feeding its crop to the CNNs made
them worse (rotten-tomato identification fell from 100% to 55%). It is therefore only
a locator and a cross-check, and never decides identity. The fine-tuned detector's
crops are food-specific, so they are classified.

Every result carries a ``review`` block: how sure the models are (high / medium / low)
and why, so the app asks the user to confirm a shaky answer instead of presenting it as
a measurement.

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
FOOD_DETECTOR_PATH = PROJECT_ROOT / "runs" / "detect" / "eref_detector_v1" / "weights" / "best.pt"
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

# Fine-tuned food detector.
FOOD_DETECTOR_NAME = "eref-detector-v1"
DETECTOR_IMGSZ = 416
OBJECT_CONF = 0.30  # a box must reach this confidence to be reported as a food
OBJECT_IOU = 0.5  # boxes overlapping more than this are merged (NMS)
MAX_OBJECTS = 8
CROP_MARGIN = 0.06  # extra frame around a box when it is cropped for the CNNs
MIN_CROP_PX = 32

# How sure the models must be for a result to be shown without asking the user to
# confirm it. Chosen from ``metrics/confidence_calibration.json`` (backend/calibrate.py),
# measured on photos held out from training:
#   - on foods the model knows it is ~99.9% right at every confidence, so the cost of a
#     threshold is small: 0.90 sends 1.4% of known-food photos to "confirm";
#   - on foods it was never trained on it still names a food 65% of the time with no
#     threshold, 29% at 0.90 and 22% at 0.95. A threshold shrinks that mistake (the
#     mango-read-as-tomato case) but cannot remove it, which is why the app also shows
#     the runner-up foods and lets the user correct the answer.
CONFIDENT_IDENTITY = 0.90  # identity confidence at or above this is "high"
UNSURE_IDENTITY = 0.60  # below this it is "low"
UNSURE_FRESHNESS = 0.65  # a fresh/rotten call below this confidence is borderline

# Freshness is reported on a 0-100% scale (100% = certainly fresh, 0% = certainly
# rotten) and split into three tiers so the app can be more specific than a plain
# fresh/rotten call.
FRESH_TIER_MIN = 0.70  # freshness at or above this is "Fresh"
SUBFRESH_TIER_MIN = 0.30  # freshness from here up to FRESH_TIER_MIN is "Sub Fresh"; below is "Rotten"

TIER_LABELS = {"fresh": "Fresh", "subfresh": "Sub Fresh", "rotten": "Rotten"}


def freshness_tier(prob_fresh: float) -> str:
    """Which of the three freshness tiers a 0-1 "probably fresh" score falls into."""
    if prob_fresh >= FRESH_TIER_MIN:
        return "fresh"
    if prob_fresh >= SUBFRESH_TIER_MIN:
        return "subfresh"
    return "rotten"


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
        food_detector_path: Path = FOOD_DETECTOR_PATH,
    ) -> None:
        self.food_detector_path = Path(food_detector_path)
        self.detector_path = Path(detector_path)
        self.identity_path = Path(identity_path)
        self.freshness_tflite_path = Path(freshness_tflite_path)
        self.freshness_yolo_path = Path(freshness_yolo_path)

        self._lock = threading.Lock()
        self._detector = None
        self._food_detector = None
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

            if self.food_detector_path.exists():
                try:
                    from ultralytics import YOLO

                    self._food_detector = YOLO(str(self.food_detector_path))
                except Exception as error:  # pragma: no cover
                    self._load_errors["foodDetector"] = str(error)

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
                "foodDetector": {
                    "name": FOOD_DETECTOR_NAME,
                    "loaded": self._food_detector is not None,
                    "path": str(self.food_detector_path),
                    "classes": len(self._food_detector.names) if self._food_detector is not None else 0,
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
        objects = self._objects(image, boxes, detection, identity, freshness)

        return {
            # Flat fields consumed directly by the mobile client.
            "foodName": food_name,
            "modelLabel": label,
            "foodIdentityAvailable": food_name is not None,
            "confidence": identity["confidence"],
            "freshness": freshness["freshness"],
            "freshnessConfidence": freshness["confidence"],
            "freshnessPercent": freshness["freshnessPercent"],
            "freshnessTier": freshness["tier"],
            "freshnessTierLabel": freshness["tierLabel"],
            "spoilageScore": spoilage_score,
            "detectedIndicators": indicators["detected"],
            "indicatorScores": indicators["scores"],
            "boxes": boxes,
            # How much to trust this result, and why (see assess_review).
            "review": assess_review(
                identity["confidence"], food_name, freshness["confidence"], detection["agreement"]
            ),
            # Every food found in the frame, each classified on its own crop.
            "imageSize": [image.width, image.height],
            "objects": objects,
            "objectCount": len(objects),
            # Per-stage detail for the analysis screen.
            "detection": detection,
            "identity": identity,
            "freshnessDetail": freshness,
            "stages": [stage.as_dict() for stage in stages],
            "inferenceMs": round((time.perf_counter() - started) * 1000, 1),
        }

    # ------------------------------------------------ per-object classification

    def _objects(
        self,
        image: Image.Image,
        boxes: list[dict[str, Any]],
        detection: dict[str, Any],
        identity: dict[str, Any],
        freshness: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """One entry per food in the frame.

        With the fine-tuned detector each box is cropped and classified on its own. With
        no detector (or nothing found) the whole-frame result is the single entry.
        """
        objects: list[dict[str, Any]] = []
        if detection.get("model") == FOOD_DETECTOR_NAME:
            for found in boxes[:MAX_OBJECTS]:
                crop = _crop(image, found["box"])
                if crop is None:
                    continue
                sink: list[StageResult] = []
                crop_identity = self._identify(crop, sink)
                crop_freshness = self._assess_freshness(crop, crop_identity, sink)
                objects.append(
                    _object_entry(len(objects), found["box"], found["label"], found["confidence"], crop_identity, crop_freshness)
                )

        if not objects:
            box = detection["box"] or [0.0, 0.0, float(image.width), float(image.height)]
            objects.append(
                _object_entry(0, box, detection["label"], detection["confidence"], identity, freshness, source="full-frame")
            )
        return objects

    # -------------------------------------------------------- stage 1: detect

    def _detect(
        self, image: Image.Image, *, run_detector: bool
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Locate the food. Returns the detection summary and every box found."""
        if run_detector and self._food_detector is not None:
            return self._detect_foods(image)
        return self._detect_coco(image, run_detector=run_detector)

    def _detect_foods(self, image: Image.Image) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Box every food with the fine-tuned detector (its classes are the 12 foods)."""
        detection: dict[str, Any] = {
            "model": FOOD_DETECTOR_NAME,
            "used": False,
            "label": None,
            "confidence": None,
            "box": None,
            "count": 0,
            "agreement": None,
            "reason": "no food found by the detector",
        }
        try:
            result = self._food_detector.predict(
                image,
                verbose=False,
                conf=OBJECT_CONF,
                iou=OBJECT_IOU,
                max_det=MAX_OBJECTS,
                imgsz=DETECTOR_IMGSZ,
                agnostic_nms=True,
            )[0]
        except Exception as error:
            detection["reason"] = f"detection failed: {error}"
            return detection, []

        boxes: list[dict[str, Any]] = []
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
                        "label": str(result.names[int(cls)]),
                    }
                )
        boxes.sort(key=lambda b: b["confidence"], reverse=True)

        detection["count"] = len(boxes)
        if boxes:
            best = max(boxes, key=lambda b: b["confidence"] * _box_area(b["box"]))
            detection.update(
                {
                    "used": True,
                    "label": best["label"],
                    "confidence": best["confidence"],
                    "box": best["box"],
                    "reason": f"found {len(boxes)} food{'s' if len(boxes) != 1 else ''}",
                }
            )
        return detection, boxes

    def _detect_coco(
        self, image: Image.Image, *, run_detector: bool
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Fallback: the COCO detector as a single-region locator."""
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
        elif detection["model"] == FOOD_DETECTOR_NAME:
            # Its labels are the app's own foods, so they can be compared with the CNN's.
            if label == food:
                detection["agreement"] = "agrees"
                detail = f"{detection['reason']}; the best box is a {label} and the CNN agrees"
            else:
                detection["agreement"] = "differs"
                detail = (
                    f"{detection['reason']}; the best box is a {label} but the CNN read the "
                    f"whole frame as {described}. The frame may hold several foods."
                )
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
        stages.insert(0, StageResult("detection", detection["model"], detection["used"], detail))

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
        prob_fresh = 1 - prob_rotten
        tier = freshness_tier(prob_fresh)
        return {
            "model": model_name,
            "freshness": "spoiled" if is_rotten else "fresh",
            "label": "rotten" if is_rotten else "fresh",
            "confidence": round(prob_rotten if is_rotten else prob_fresh, 4),
            "probRotten": round(prob_rotten, 4),
            "probFresh": round(prob_fresh, 4),
            # A more specific read than the plain fresh/rotten call above: a 0-100%
            # freshness score split into Fresh (70-100%), Sub Fresh (30-69%) and
            # Rotten (0-29%).
            "freshnessPercent": round(prob_fresh * 100, 1),
            "tier": tier,
            "tierLabel": TIER_LABELS[tier],
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


def assess_review(
    identity_confidence: float,
    food_name: str | None,
    freshness_confidence: float,
    detector_agreement: str | None = None,
) -> dict[str, Any]:
    """How far to trust one result, and why.

    ``level`` is about the food identity: ``high`` at or above CONFIDENT_IDENTITY,
    ``low`` below UNSURE_IDENTITY or when the food is not recognised, else ``medium``.
    A shaky fresh/rotten call or a detector that names a different food adds a reason
    without changing the level. Any reason means the app asks the user to confirm.
    """
    reasons: list[str] = []
    if food_name is None:
        level = "low"
        reasons.append("not one of the supported foods")
    elif identity_confidence < UNSURE_IDENTITY:
        level = "low"
        reasons.append(f"the food identity is uncertain ({identity_confidence * 100:.0f}% confident)")
    elif identity_confidence < CONFIDENT_IDENTITY:
        level = "medium"
        reasons.append(f"only {identity_confidence * 100:.0f}% confident of the food")
    else:
        level = "high"

    if freshness_confidence < UNSURE_FRESHNESS:
        reasons.append(f"fresh or rotten is borderline ({freshness_confidence * 100:.0f}% confident)")
    if detector_agreement == "differs":
        reasons.append("the detector and the classifier name different foods")

    return {"level": level, "needsConfirmation": bool(reasons), "reasons": reasons}


def _crop(image: Image.Image, box: list[float]) -> Image.Image | None:
    """The part of the frame inside a box, with a little margin, or None if it is tiny."""
    x1, y1, x2, y2 = box
    margin_x, margin_y = (x2 - x1) * CROP_MARGIN, (y2 - y1) * CROP_MARGIN
    left, top = max(0, int(x1 - margin_x)), max(0, int(y1 - margin_y))
    right, bottom = min(image.width, int(x2 + margin_x)), min(image.height, int(y2 + margin_y))
    if right - left < MIN_CROP_PX or bottom - top < MIN_CROP_PX:
        return None
    return image.crop((left, top, right, bottom))


def _object_entry(
    index: int,
    box: list[float],
    detector_label: str | None,
    detector_confidence: float | None,
    identity: dict[str, Any],
    freshness: dict[str, Any],
    source: str = "detector",
) -> dict[str, Any]:
    """One food in the frame: where it is, what it is, and whether it is fresh."""
    food = identity["foodName"]
    agreement = None
    if source == "detector" and detector_label:
        agreement = "agrees" if detector_label == food else "differs"
    return {
        "id": index,
        "source": source,
        "box": box,
        "detectorLabel": detector_label,
        "detectorConfidence": detector_confidence,
        "foodName": food,
        "modelLabel": identity["label"],
        "foodIdentityAvailable": food is not None,
        "confidence": identity["confidence"],
        "topK": identity["topK"],
        "freshness": freshness["freshness"],
        "freshnessConfidence": freshness["confidence"],
        "freshnessPercent": freshness.get("freshnessPercent", round((1 - freshness["probRotten"]) * 100, 1)),
        "freshnessTier": freshness.get("tier", freshness_tier(1 - freshness["probRotten"])),
        "freshnessTierLabel": freshness.get("tierLabel", TIER_LABELS[freshness_tier(1 - freshness["probRotten"])]),
        "spoilageScore": freshness["probRotten"],
        "agreement": agreement,
        "review": assess_review(identity["confidence"], food, freshness["confidence"], agreement),
    }


def _box_area(box: list[float]) -> float:
    x1, y1, x2, y2 = box
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


__all__ = [
    "FOOD_ALIASES",
    "FoodPipeline",
    "ModelUnavailable",
    "assess_review",
    "fuse_freshness",
    "freshness_tier",
    "identity_rotten_mass",
    "yolo_prob_rotten",
    "food_name_from_label",
    "freshness_from_label",
]
