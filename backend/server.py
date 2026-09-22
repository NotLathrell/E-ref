"""E-REF inference API.

    GET  /health          model load status
    POST /predict         YOLOv8 detection + CNN identity + CNN freshness
    GET  /metrics         accuracy / precision / recall / F1 for each task
    GET  /metrics/{task}  one task's report, including its confusion matrix
"""

from __future__ import annotations

import io
import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

try:  # `uvicorn backend.server:app` from the project root
    from .pipeline import (
        FRESHNESS_TFLITE_PATH,
        FRESHNESS_YOLO_PATH,
        IDENTITY_PATH,
        DETECTOR_PATH,
        FoodPipeline,
        ModelUnavailable,
    )
except ImportError:  # `uvicorn server:app` from inside backend/
    from pipeline import (
        FRESHNESS_TFLITE_PATH,
        FRESHNESS_YOLO_PATH,
        IDENTITY_PATH,
        DETECTOR_PATH,
        FoodPipeline,
        ModelUnavailable,
    )

METRICS_PATH = Path(
    os.getenv("EREF_METRICS_PATH", str(Path(__file__).resolve().parent / "metrics" / "model_metrics.json"))
)

app = FastAPI(title="E-REF Food Identification & Freshness API", version="2.0.0")

# The Expo client talks to this server over the LAN from a different origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

pipeline = FoodPipeline(
    detector_path=Path(os.getenv("EREF_DETECTOR_PATH", str(DETECTOR_PATH))),
    # FOOD_MODEL_PATH is the name the original README documented.
    identity_path=Path(os.getenv("FOOD_MODEL_PATH", os.getenv("EREF_IDENTITY_PATH", str(IDENTITY_PATH)))),
    freshness_tflite_path=Path(os.getenv("EREF_FRESHNESS_TFLITE_PATH", str(FRESHNESS_TFLITE_PATH))),
    freshness_yolo_path=Path(os.getenv("EREF_FRESHNESS_YOLO_PATH", str(FRESHNESS_YOLO_PATH))),
)


@app.get("/health")
def health() -> dict[str, Any]:
    status = pipeline.status()
    status["metricsAvailable"] = METRICS_PATH.exists()
    # Kept for older clients that only checked these two fields.
    status["modelPath"] = status["models"]["identity"]["path"]
    return status


@app.post("/predict")
async def predict(
    image: UploadFile = File(...),
    detect: bool = Query(True, description="Run the YOLOv8 detection stage before classifying"),
) -> dict[str, Any]:
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Upload an image file.")

    payload = await image.read()
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded image was empty.")

    try:
        photo = Image.open(io.BytesIO(payload)).convert("RGB")
    except UnidentifiedImageError as error:
        raise HTTPException(status_code=415, detail="That file is not a readable image.") from error

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
