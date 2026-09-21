# E-REF inference API

Identifies a food item, decides whether it is fresh or rotten, and reports the
accuracy, precision, recall and F1 of the models doing that work.

## Pipeline

Each `POST /predict` runs three stages:

| Stage | Model | Weights | Job |
| --- | --- | --- | --- |
| 1. Detection | YOLOv8n (COCO) | `yolov8n.pt` | Locate the food and cross-check the CNN |
| 2. Identification | YOLOv8n-cls (CNN) | `runs/classify/runs/classify/food_multiclass/weights/best.pt` | Classify the full frame into 18 `fresh_*` / `rotten_*` classes |
| 3. Freshness | MobileNetV2 (CNN, TFLite) | `Datasets/dataset/dist/model_v2/final.tflite` | Binary fresh vs rotten on the full frame |

`yolov8n.pt` is COCO-pretrained, so it recognises apples, bananas and oranges
but not tomato, okra, potato, cucumber, capsicum or bitter gourd; it labels a
tomato as an apple, orange or donut. Both CNNs therefore read the **full frame**,
never the detector's crop. Cropping cut rotten-tomato identification from 100% to
55% and freshness accuracy from 99.7% to 95.3% on the validation split. Identity
always comes from the CNN, and `detection.agreement` reports whether the detector
agreed (`agrees`), named a different food (`differs`) or named something that is
not a food type it can identify (`outside_vocabulary`).

This is also the input `evaluate.py` measures, so the reported metrics describe
what the app actually runs.

Stage 3 fuses two opinions into the final verdict: the dedicated binary CNN
(weight 0.65) and the rotten-class probability mass from the stage 2 head
(weight 0.35). When they disagree the response sets `freshnessDetail.agreement`
to `false` and the app tells the user to inspect the item by hand.

If the TFLite runtime is unavailable, stage 3 falls back to the YOLOv8n-cls
freshness classifier at `runs/classify/runs/classify/freshness/weights/best.pt`.
If that is missing too, the stage 2 head supplies the verdict on its own.

After the models run, `indicators.py` measures the visible spoilage indicators
from the study design — discoloration, mould spots, texture abnormality, excess
moisture — using OpenCV statistics on the image, scaled by the CNN's rotten
probability so a clean image does not raise flags on a highlight or a shadow.

## Setup

```powershell
cd C:\Users\Lathrell\Downloads\EREF
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

Check `http://<PC_LAN_IP>:8000/health`; every model should report `"loaded": true`.

## Evaluation

Model metrics are measured, not hard-coded. Generate the report before the app
can show it:

```powershell
python backend\evaluate.py --limit-per-class 0 # every held-out image, ~2 min
python backend\evaluate.py                     # 80 images per class, faster
```

This runs the models over `Datasets/dataset/.training/food_multiclass/val` and
writes `backend/metrics/model_metrics.json`, which `GET /metrics` serves.

**Training duplicates are excluded.** Most of the `val` folder is byte-identical to
images in `train`, and `Test/` is a copy of `val/`, so scoring on them would
measure memory rather than accuracy. The evaluator hashes every training image and
skips any validation image that matches. Pass `--keep-train-duplicates` to turn
that off. The report records how many images were excluded and which foods are
left with no independent images.

Three tasks are scored:

- **food_identity** — which of the 9 food types it is
- **freshness** — fresh vs rotten, with `rotten` as the positive class
- **combined** — the raw 18-class head, identity and freshness together

Each reports accuracy, macro and support-weighted precision / recall / F1,
per-class scores with support, and a confusion matrix. Definitions match
scikit-learn's `classification_report`; `metrics.py` computes them with numpy so
the backend stays light.

Results over the 2,698 validation images the models have not trained on:

| Task | Accuracy | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| Food identification | 99.33% | 99.41% | 99.24% | 99.32% |
| Freshness detection | 99.74% | 99.77% | 99.70% | 99.74% |
| Combined (18-class) | 99.18% | 99.38% | 99.08% | 99.22% |

Precision, recall and F1 are macro-averaged. No rotten item was missed (100%
recall on the rotten class), which is the number that matters for food safety.

### What these numbers do not cover

Only **apple, banana and orange** have images the models have not trained on.
4,040 of the 6,738 validation images are duplicates of training images, and they
include every validation image of bitter gourd, capsicum, cucumber, okra, potato and
tomato. Those six foods are reported as not measured (zero support, shown as `—`
in the app) rather than scored on images the model has already seen.

Testing outside the dataset points to weaker performance than the table suggests.
On simulated phone photos (random zoom, brightness, colour shift and blur applied
to dataset images) food identification dropped for potato (70-92%), okra and
orange, and the freshness verdict became unreliable for potato and tomato. That
test used dataset images, not real photos, so treat it as a warning rather than a
measurement. Photos of the six unmeasured foods taken outside the dataset are the
way to find out.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/health` | Which models loaded, their paths, any load errors |
| `POST` | `/predict` | Identity, freshness, detection, indicators, per-stage trace |
| `GET` | `/metrics` | The evaluation report (add `?include_confusion=true` for matrices) |
| `GET` | `/metrics/{task}` | One task: `food_identity`, `freshness` or `combined`, with its confusion matrix |

`POST /predict` takes a multipart `image` field and accepts `?detect=false` to
skip the detection stage and classify the full frame.

### Example response

```json
{
  "foodName": "banana",
  "modelLabel": "rotten_banana",
  "confidence": 0.9998,
  "freshness": "spoiled",
  "freshnessConfidence": 0.9999,
  "spoilageScore": 0.9999,
  "detectedIndicators": ["texture_abnormality"],
  "detection": { "used": true, "label": "banana", "confidence": 0.86 },
  "identity": { "topK": [{ "label": "rotten_banana", "confidence": 0.9998 }] },
  "freshnessDetail": { "model": "mobilenetv2-tflite", "probRotten": 0.9999, "agreement": true },
  "stages": [{ "name": "detection", "ran": true, "detail": "YOLOv8 labelled the region 'banana' and the CNN agrees it is a banana" }],
  "inferenceMs": 105.5
}
```

## Overrides

| Variable | Default |
| --- | --- |
| `FOOD_MODEL_PATH` | the `food_multiclass` weights |
| `EREF_DETECTOR_PATH` | `yolov8n.pt` |
| `EREF_FRESHNESS_TFLITE_PATH` | the MobileNetV2 TFLite model |
| `EREF_FRESHNESS_YOLO_PATH` | the YOLO freshness weights |
| `EREF_METRICS_PATH` | `backend/metrics/model_metrics.json` |
