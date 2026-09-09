import io
import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = PROJECT_ROOT / "runs" / "classify" / "runs" / "classify" / "freshness" / "weights" / "best.pt"
MODEL_PATH = Path(os.getenv("FOOD_MODEL_PATH", str(DEFAULT_MODEL_PATH)))
app = FastAPI(title="E-REF FoodFresh Inference API")
model = None


def get_model():
    global model
    if model is None:
        if not MODEL_PATH.exists():
            raise HTTPException(
                status_code=503,
                detail=f"Model not found: {MODEL_PATH}. Export the Kaggle model and place it there.",
            )
        model = YOLO(str(MODEL_PATH))
    return model


def class_name(names, index):
    if isinstance(names, dict):
        return str(names.get(index, index))
    return str(names[index])


def freshness_from_label(label):
    value = label.lower()
    if any(word in value for word in ("rotten", "spoiled", "stale", "bad")):
        return "spoiled"
    if any(word in value for word in ("fresh", "good", "ripe")):
        return "fresh"
    return "unknown"


@app.get("/health")
def health():
    return {"ready": MODEL_PATH.exists(), "modelPath": str(MODEL_PATH)}


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Upload an image file.")

    try:
        photo = Image.open(io.BytesIO(await image.read())).convert("RGB")
        prediction = get_model().predict(photo, verbose=False)[0]
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Model inference failed: {error}") from error

    boxes = []
    if prediction.boxes is not None and len(prediction.boxes) > 0:
        for coordinates, confidence, class_index in zip(
            prediction.boxes.xyxy.cpu().tolist(),
            prediction.boxes.conf.cpu().tolist(),
            prediction.boxes.cls.cpu().tolist(),
        ):
            boxes.append({
                "box": coordinates,
                "confidence": round(float(confidence), 4),
                "label": class_name(prediction.names, int(class_index)),
            })

    if prediction.probs is not None:
        index = int(prediction.probs.top1)
        label = class_name(prediction.names, index)
        confidence = float(prediction.probs.top1conf)
    elif boxes:
        best = max(boxes, key=lambda item: item["confidence"])
        label = best["label"]
        confidence = best["confidence"]
    else:
        raise HTTPException(status_code=422, detail="The model detected no food item.")

    freshness = freshness_from_label(label)
    spoilage_score = 0.85 if freshness == "spoiled" else 0.12 if freshness == "fresh" else 0.0
    return {
        "foodName": label,
        "confidence": round(confidence, 4),
        "freshness": freshness,
        "spoilageScore": spoilage_score,
        "detectedIndicators": [],
        "boxes": boxes,
    }
