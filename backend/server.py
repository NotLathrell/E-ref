"""E-REF API: food inference, label OCR, accounts and per-user inventory.

    GET  /health          model load status
    POST /predict         YOLOv8 detection + CNN identity + CNN freshness
    POST /ocr             read the text printed on a package label
    GET  /metrics         accuracy / precision / recall / F1 for each task
    GET  /metrics/detector   the food detector's evaluation
    GET  /metrics/confidence how trustworthy the models' confidence is, and the thresholds used
    GET  /metrics/{task}  one task's report, including its confusion matrix

Accounts (/auth/*) and inventory (/inventory/*) are in accounts.py; the food database,
recipes and administrator endpoints (/foods, /recipes, /admin/*) are in admin.py; the
Super Admin console's endpoints (/super/*) are in superadmin.py, and the console itself
(WEBSITE/) is served at /web. The inference
endpoints are stateless and open on the local network; everything that touches a
user's data requires a signed-in session.
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError

try:  # `uvicorn backend.server:app` from the project root
    from . import ocr
    from .accounts import router as accounts_router
    from .admin import router as admin_router
    from .auth import DATA_DIR
    from .superadmin import router as super_router
    from .db import Database
    from .pipeline import (
        FRESHNESS_TFLITE_PATH,
        FRESHNESS_YOLO_PATH,
        IDENTITY_PATH,
        DETECTOR_PATH,
        FOOD_DETECTOR_PATH,
        FoodPipeline,
        ModelUnavailable,
    )
except ImportError:  # `uvicorn server:app` from inside backend/
    import ocr
    from accounts import router as accounts_router
    from admin import router as admin_router
    from auth import DATA_DIR
    from superadmin import router as super_router
    from db import Database
    from pipeline import (
        FRESHNESS_TFLITE_PATH,
        FRESHNESS_YOLO_PATH,
        IDENTITY_PATH,
        DETECTOR_PATH,
        FOOD_DETECTOR_PATH,
        FoodPipeline,
        ModelUnavailable,
    )

METRICS_PATH = Path(
    os.getenv("EREF_METRICS_PATH", str(Path(__file__).resolve().parent / "metrics" / "model_metrics.json"))
)

DETECTOR_METRICS_PATH = METRICS_PATH.parent / "detector_metrics.json"
CALIBRATION_PATH = METRICS_PATH.parent / "confidence_calibration.json"

app = FastAPI(title="E-REF API", version="3.1.0")

# The Expo client talks to this server over the LAN from a different origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)

app.state.db = Database(os.getenv("EREF_DB_PATH", str(DATA_DIR / "eref.db")))
app.include_router(accounts_router)
app.include_router(admin_router)
app.include_router(super_router)

# The Super Admin web console. It is plain HTML/JS, so the API can serve it directly.
WEBSITE_DIR = Path(os.getenv("EREF_WEBSITE_DIR", str(Path(__file__).resolve().parents[1] / "WEBSITE")))
if WEBSITE_DIR.is_dir():
    app.mount("/web", StaticFiles(directory=WEBSITE_DIR, html=True), name="web")

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse("/web/")

pipeline = FoodPipeline(
    detector_path=Path(os.getenv("EREF_DETECTOR_PATH", str(DETECTOR_PATH))),
    food_detector_path=Path(os.getenv("EREF_FOOD_DETECTOR_PATH", str(FOOD_DETECTOR_PATH))),
    # FOOD_MODEL_PATH is the name the original README documented.
    identity_path=Path(os.getenv("FOOD_MODEL_PATH", os.getenv("EREF_IDENTITY_PATH", str(IDENTITY_PATH)))),
    freshness_tflite_path=Path(os.getenv("EREF_FRESHNESS_TFLITE_PATH", str(FRESHNESS_TFLITE_PATH))),
    freshness_yolo_path=Path(os.getenv("EREF_FRESHNESS_YOLO_PATH", str(FRESHNESS_YOLO_PATH))),
)


@app.get("/health")
def health() -> dict[str, Any]:
    status = pipeline.status()
    status["metricsAvailable"] = METRICS_PATH.exists()
    status["ocr"] = {"name": "rapidocr", "installed": importlib.util.find_spec("rapidocr_onnxruntime") is not None}
    # Kept for older clients that only checked these two fields.
    status["modelPath"] = status["models"]["identity"]["path"]
    return status


async def _read_photo(image: UploadFile) -> Image.Image:
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Upload an image file.")

    payload = await image.read()
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded image was empty.")

    try:
        # Phones store a photo as the sensor saw it plus an orientation flag. Apply the
        # flag, or a portrait photo reaches the models (and the OCR) lying on its side.
        return ImageOps.exif_transpose(Image.open(io.BytesIO(payload))).convert("RGB")
    except UnidentifiedImageError as error:
        raise HTTPException(status_code=415, detail="That file is not a readable image.") from error


@app.post("/ocr")
async def read_label(image: UploadFile = File(...)) -> dict[str, Any]:
    photo = await _read_photo(image)
    try:
        return ocr.read_text(photo)
    except ocr.OcrUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001 - surface the cause to the client
        raise HTTPException(status_code=422, detail=f"Could not read the label: {error}") from error


@app.post("/predict")
async def predict(
    image: UploadFile = File(...),
    detect: bool = Query(True, description="Run the YOLOv8 detection stage before classifying"),
) -> dict[str, Any]:
    photo = await _read_photo(image)

    try:
        return pipeline.analyze(photo, run_detector=detect)
    except ModelUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001 - surface the cause to the client
        raise HTTPException(status_code=422, detail=f"Model inference failed: {error}") from error


@app.get("/metrics")
def metrics(include_confusion: bool = Query(False, description="Include the confusion matrices")) -> dict[str, Any]:
    report = _load_metrics()
    if include_confusion:
        return report

    trimmed = json.loads(json.dumps(report))
    groups = [trimmed.get("tasks", {})]
    for benchmark in trimmed.get("benchmarks", []):
        groups.append(benchmark.get("tasks", {}))
        groups.append(benchmark.get("baseline", {}).get("tasks", {}))
    for tasks in groups:
        for task in tasks.values():
            task.pop("confusionMatrix", None)
    return trimmed


@app.get("/metrics/detector")
def metrics_detector() -> dict[str, Any]:
    """The food detector's evaluation (backend/evaluate_detector.py)."""
    return _load_report(DETECTOR_METRICS_PATH, "python backend/evaluate_detector.py")


@app.get("/metrics/confidence")
def metrics_confidence() -> dict[str, Any]:
    """How trustworthy the models' confidence is, and the thresholds chosen (backend/calibrate.py)."""
    return _load_report(CALIBRATION_PATH, "python backend/calibrate.py")


@app.get("/metrics/{task}")
def metrics_task(task: str) -> dict[str, Any]:
    report = _load_metrics()
    tasks = report.get("tasks", {})
    if task not in tasks:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown task '{task}'. Available: {', '.join(sorted(tasks))}",
        )
    return {"generatedAt": report.get("generatedAt"), "dataset": report.get("dataset"), **tasks[task]}


def _load_report(path: Path, command: str) -> dict[str, Any]:
    if not path.exists():
        raise HTTPException(status_code=503, detail=f"Not measured yet. Run `{command}` from the project root.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=500, detail=f"{path.name} is not valid JSON: {error}") from error


def _load_metrics() -> dict[str, Any]:
    if not METRICS_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "No evaluation report yet. Run `python backend/benchmark.py` from the "
                "project root to generate one."
            ),
        )
    try:
        return json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=500, detail=f"Metrics file is not valid JSON: {error}") from error
