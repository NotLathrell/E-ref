# E-REF inference API

Identifies a food item, decides whether it is fresh or rotten, and reports the
accuracy, precision, recall and F1 of the models doing that work.

## Pipeline

Each `POST /predict` runs three stages:

| Stage | Model | Weights | Job |
| --- | --- | --- | --- |
| 1. Detection | YOLOv8n (COCO) | `yolov8n.pt` | Locate the food and cross-check the CNN |
| 2. Identification | YOLOv8n-cls (CNN) | `runs/classify/runs/classify/eref_identity_v2/weights/best.pt` | Classify the full frame into 19 classes: 9 foods x fresh/rotten, plus `other` |
| 3. Freshness | YOLOv8n-cls (CNN) | `runs/classify/runs/classify/eref_freshness_v2/weights/best.pt` | Binary fresh vs rotten on the full frame |

`yolov8n.pt` is COCO-pretrained, so it recognises apples, bananas and oranges
but not tomato, okra, potato, cucumber, capsicum or bitter gourd; it labels a
tomato as an apple, orange or donut. Both CNNs therefore read the **full frame**,
never the detector's crop. Cropping cut rotten-tomato identification from 100% to
55% and freshness accuracy from 99.7% to 95.3% on the validation split. Identity
always comes from the CNN, and `detection.agreement` reports whether the detector
agreed (`agrees`), named a different food (`differs`) or named something that is
not a food type it can identify (`outside_vocabulary`).

Stage 2's 19th class, `other`, is for anything that is not one of the app's nine
foods — the response then reports `foodName: null` and the app tells the user
their item is not one of the supported foods, instead of forcing a guess. `other`
has no freshness meaning of its own, so it is left out of stage 3's identity-side
signal (see below) and out of the food-identification metric.

This is also the input `benchmark.py` measures, so the reported metrics describe
what the app actually runs.

Stage 3 fuses two opinions into the final verdict: the dedicated binary CNN
(weight 0.65) and the rotten-class probability mass from the stage 2 head
(weight 0.35), the latter renormalised over just the fresh/rotten classes so
`other` does not dilute it. When the item is not a supported food, stage 3 uses
the CNN alone. When the two disagree the response sets `freshnessDetail.agreement`
to `false` and the app tells the user to inspect the item by hand.

If the retrained YOLOv8n-cls freshness weights are not present, stage 3 falls back
to the older MobileNetV2 TFLite model at `Datasets/dataset/dist/model_v2/final.tflite`.
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

## Training

`build_dataset.py` assembles the training data from every image collection under
`Datasets/` (the original dataset, `Dataset-FV`'s labelled good/bad photos, and
`dataset2`'s fresh/rotten beef), writes it to `Datasets/dataset/.training/eref_v2/`,
and keeps five sets out of training on purpose: a held-out split of the training
pool, the original dataset's own unseen val/Test images, `dataset2/test`, foods the
model never trains on (to test "unknown"), and — as of this round — the app's own
foods photographed as plain cut-outs, kept out entirely after an earlier attempt
to also use them as `other` examples taught the model that a plain background
means "unknown" (see below). `train.py` then trains the identity and freshness
YOLOv8n-cls models on it (`--resume` continues an interrupted run from its last
checkpoint).

```powershell
python backend\build_dataset.py
python backend\train.py            # both models, GPU if available
```

## Evaluation

Model metrics are measured, not hard-coded. Generate the report before the app
can show it:

```powershell
python backend\benchmark.py                    # writes backend/metrics/model_metrics.json
python backend\benchmark.py --baseline          # also scores the previous models, for comparison
python backend\benchmark.py --tune              # sweeps the fusion weight on the validation split
```

This scores the current models on every held-out set `build_dataset.py` set
aside — none of which the models trained on — and writes
`backend/metrics/model_metrics.json`, which `GET /metrics` serves. The app's
headline numbers come from the held-out split; the rest appear underneath as
"Tougher, independent checks".

Three tasks are scored per set:

- **food_identity** — which of the 9 food types it is, or `unknown`
- **freshness** — fresh vs rotten, with `rotten` as the positive class
- **combined** — the raw 19-class head, identity and freshness together

Each reports accuracy, macro and support-weighted precision / recall / F1,
per-class scores with support, and a confusion matrix. Definitions match
scikit-learn's `classification_report`; `metrics.py` computes them with numpy so
the backend stays light.

Headline results, over 2,652 held-out images spanning all 9 foods:

| Task | Accuracy | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| Food identification | 99.84% | 99.74% | 99.75% | 99.74% |
| Freshness detection | 99.51% | 99.48% | 99.52% | 99.50% |
| Combined (19-class) | 99.39% | 98.95% | 99.06% | 98.99% |

### What these numbers do not cover

The held-out split is the friendliest test: never-seen photos, but from the same
collections as training. `--baseline` compares the new and previous models on four
tougher, independent sets:

| Check | Previous models | New models |
| --- | --- | --- |
| Held-out split (identity / freshness) | 84.0% / 88.6% | 99.8% / 99.5% |
| Original dataset's own unseen apple/banana/orange | 99.3% | 100% |
| Fresh vs rotten beef, separate collection | 50.0% | 99.4% |
| Foods never trained on, correctly called "unknown" | 0% | 30.7% |
| Cut-out photos on a plain white background | 60.0% | 56.6% |

The last two rows are real weaknesses. Sweeping a confidence threshold for
"unknown" (`benchmark.py --tune`, then a dedicated known-vs-unknown sweep) found
the model is frequently confident but wrong on food it has never seen — at a 0.9
threshold it still only rejects 22% of unseen foods while wrongly rejecting 11%
of known ones — so no threshold is applied; `MIN_IDENTITY_CONFIDENCE` in
`pipeline.py` is 0 (disabled). An earlier retraining round used Dataset-FV's
unlabelled cut-out photos as `other` training examples and that pushed the
white-background number down to 13%: the model had learned "plain background
means unknown" instead of learning the foods themselves. Removing those images
from training fixed that (56.6%) at the cost of some of the unknown-food score,
which had been inflated by the same shortcut. Both numbers reflect a real gap —
more training photos in exactly those conditions is what would close it, not a
setting.

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
  "freshnessDetail": { "model": "yolov8n-cls-freshness", "probRotten": 0.9999, "agreement": true },
  "stages": [{ "name": "detection", "ran": true, "detail": "YOLOv8 labelled the region 'banana' and the CNN agrees it is a banana" }],
  "inferenceMs": 105.5
}
```

## Overrides

| Variable | Default |
| --- | --- |
| `FOOD_MODEL_PATH` | the `eref_identity_v2` weights |
| `EREF_DETECTOR_PATH` | `yolov8n.pt` |
| `EREF_FRESHNESS_TFLITE_PATH` | the MobileNetV2 TFLite model |
| `EREF_FRESHNESS_YOLO_PATH` | the YOLO freshness weights |
| `EREF_METRICS_PATH` | `backend/metrics/model_metrics.json` |
