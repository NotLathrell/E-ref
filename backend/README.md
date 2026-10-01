# E-REF API

Identifies a food item, decides whether it is fresh or rotten, reads the dates
printed on a package label, keeps each user's account and inventory, and reports the
accuracy, precision, recall and F1 of the models doing that work.

## Pipeline

Each `POST /predict` runs three stages:

| Stage | Model | Weights | Job |
| --- | --- | --- | --- |
| 1. Detection | YOLOv8n fine-tuned on the 12 foods (`eref-detector-v1`) | `runs/detect/eref_detector_v1/weights/best.pt` | Find and box every food in the frame |
| 1. Detection (fallback) | YOLOv8n (COCO) | `yolov8n.pt` | Used only when the fine-tuned weights are missing: locate one food region and cross-check the CNN |
| 2. Identification | YOLOv8n-cls (CNN) | `runs/classify/runs/classify/eref_identity_v2/weights/best.pt` | Classify the full frame into 25 classes: 12 foods x fresh/rotten, plus `other` |
| 3. Freshness | YOLOv8n-cls (CNN) | `runs/classify/runs/classify/eref_freshness_v2/weights/best.pt` | Binary fresh vs rotten on the full frame |

**Classification and detection answer different questions.** The CNNs (stages 2 and 3) take one
image and say *what it is* and *whether it is fresh*: one answer per photo. The detector (stage 1)
takes a frame and says *which foods are in it and where*: a box, a food name and a confidence for
each. A frame with several foods is therefore handled by boxing each food, cropping each box, and
running stages 2 and 3 on every crop. The response lists them in `objects` (one entry each, with
its own `box`, `foodName`, `freshness` and `review`) next to the whole-frame fields the
single-item flow uses. The app draws the boxes on the photo and adds the ticked foods to the shelf
in one step.

The detector is trained on frames composed from the classification photos with exact boxes
(`build_detection_dataset.py`, `train_detector.py`; see Training). Its confidence threshold is
`OBJECT_CONF = 0.30`, boxes overlapping more than `OBJECT_IOU = 0.5` are merged, and at most 8
foods are reported. A detection the CNN disagrees with is flagged (`agreement: "differs"`) and the
app asks the user to confirm it.

**Every result says how far to trust it.** `review` is `{level, needsConfirmation, reasons}`:
`high` at or above `CONFIDENT_IDENTITY` (0.90), `low` below `UNSURE_IDENTITY` (0.60) or when the
food is not one of the twelve, otherwise `medium`; a shaky fresh/rotten call (below 0.65) or a
detector that names a different food adds a reason. Anything with a reason is shown to the user as
"please check this", with the runner-up foods to choose from, and a `low` result cannot be saved
until the user picks the food. The thresholds come from `calibrate.py` (see Evaluation), not from
a rule of thumb.

The COCO model `yolov8n.pt` is pretrained on generic objects, so it recognises apples, bananas and oranges
but not tomato, okra, potato, cucumber, capsicum or bitter gourd; it labels a
tomato as an apple, orange or donut. When it is the detector in use, both CNNs therefore read the
**full frame**, never its crop. Cropping cut rotten-tomato identification from 100% to
55% and freshness accuracy from 99.7% to 95.3% on the validation split. Identity
always comes from the CNN, and `detection.agreement` reports whether the detector
agreed (`agrees`), named a different food (`differs`) or named something that is
not a food type it can identify (`outside_vocabulary`).

Stage 2's 25th class, `other`, is for anything that is not one of the app's twelve
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

### Training the food detector

Detection needs bounding boxes, and the collections above only label whole photos. Hand-drawing
boxes on thousands of images is not practical, so `build_detection_dataset.py` composes the
detection set from the classification photos themselves:

- 1 to 4 photos of different foods are placed on a plain counter-coloured canvas (416 px) at random
  positions and sizes, so one frame holds several foods;
- each photo's white or black studio margin is trimmed first, then its exact rectangle becomes the
  box, so the annotations are exact by construction;
- some frames also get a non-food (`other`) photo with no box, so the detector learns that not
  everything in a frame is one of the twelve foods;
- train, validation and test frames come from the matching split of the classification data only,
  so no photo appears in two splits.

The classes are the twelve foods. Fresh versus rotten is deliberately not a detector class: that is
the freshness CNN's job, applied to each detected crop.

```powershell
python backend\build_detection_dataset.py                   # 1500 train / 300 val / 300 test frames
python backend\train_detector.py --device cpu --epochs 15   # writes runs/detect/eref_detector_v1
python backend\train_detector.py --resume                   # continue an interrupted run
```

### Data sources

None of these datasets are committed to the repository (see `.gitignore`); download
them into `Datasets/` yourself before running `build_dataset.py`. Cite them by
their DOI if this project's results are reported elsewhere.

| Food(s) | Dataset | Source | Licence |
| --- | --- | --- | --- |
| Apple, banana, orange, tomato, potato, cucumber, capsicum, okra, bitter gourd | the project's original combined dataset | bundled with this repo's history | — |
| Banana, orange, apple, cucumber, capsicum, tomato, potato (supplementary) | Dataset-FV | course-provided | — |
| Beef | dataset2 (fresh/rotten beef) | course-provided | — |
| Mango | "FruitVision: A Benchmark Dataset for Fresh, Rotten, and Formalin-mixed Fruit Detection" | Mendeley Data, [doi:10.17632/xkbjx8959c.2](https://doi.org/10.17632/xkbjx8959c.2) | CC BY-NC-ND 4.0 |
| Papaya | "Papaya Freshness Classification Dataset" | Mendeley Data, [doi:10.17632/7mgj5bvp5h.1](https://doi.org/10.17632/7mgj5bvp5h.1) | CC BY 4.0 |
| Eggplant | "BrinjalFruitX: A Field-Collected Image Dataset for Machine Learning and Deep Learning-Based Disease Identification in Brinjal Fruits" | Mendeley Data, [doi:10.17632/ngc58fsxgd.1](https://doi.org/10.17632/ngc58fsxgd.1) | CC BY 4.0 |

The mango dataset's licence is non-commercial and no-derivatives: it is used here
only to train a model for this non-commercial academic project, the raw images are
never redistributed (they are gitignored), and the app does not ship or resell the
dataset itself — only model weights trained on it, which is standard academic
practice for research use of an NC-ND dataset. If this project is ever put to
commercial use, the mango model should be retrained on a permissively-licensed
substitute first.

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

- **food_identity** — which of the 12 food types it is, or `unknown`
- **freshness** — fresh vs rotten, with `rotten` as the positive class
- **combined** — the raw 25-class head, identity and freshness together

Each reports accuracy, macro and support-weighted precision / recall / F1,
per-class scores with support, and a confusion matrix. Definitions match
scikit-learn's `classification_report`; `metrics.py` computes them with numpy so
the backend stays light.

Headline results, over 2,996 held-out images spanning all 12 foods:

| Task | Accuracy | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| Food identification | 99.89% | 99.81% | 99.77% | 99.79% |
| Freshness detection | 99.20% | 99.14% | 99.22% | 99.18% |
| Combined (25-class) | 99.36% | 99.01% | 99.11% | 99.05% |

### Food detector

`python backend\evaluate_detector.py` writes `metrics/detector_metrics.json` (served at
`GET /metrics/detector`, shown in the app under **Model Performance**). Four measurements, from the
most to the least optimistic:

| Measurement | Result | What it is |
| --- | --- | --- |
| Composed test frames, mAP@0.5 | 97.4% (precision 96.2%, recall 94.4%) | 300 frames built from test-split photos only. The standard detection score, but the frames are synthetic, so it is the friendliest number. mAP@0.5:0.95 equals mAP@0.5 because the boxes are exact rectangles |
| Number of foods found per frame | 99.7% exactly right, 100% within one | The "multiple foods" requirement: how often the box count equals the number of foods placed in the frame |
| Real single-food photos (600, as photographed) | Food found 99.7%, best box the right food 95.3% | Missed-detection and wrong-label evidence. Weakest: apple 86%, tomato 88%, cucumber 90%, okra 90%, orange 92% |
| Non-food objects | 7.3% wrongly boxed (of 150) | False-detection evidence |
| **Foods never trained on** | **58.0% wrongly boxed (of 150)** | The detector's version of the CNN's weakness: it has only seen the twelve foods, so a persimmon or a pear looks like one of them |

What these do **not** show: on the real photos the box covers 99% of the frame, which is correct
for a single food photographed close up, but it says nothing about how tightly the detector
localises a food among clutter, because there is no annotated set of real multi-food photographs to
measure that. The detector's job in the app is to find each food and hand its crop to the CNNs;
anything it or the CNN is unsure of is put in front of the user to confirm.

### Confidence thresholds

`python backend\calibrate.py` measures how far the identity model's confidence can be trusted and
writes `metrics/confidence_calibration.json` (`GET /metrics/confidence`). Result, on held-out photos:

| Identity confidence at least | Same-collection photos accepted (accuracy) | Plain cut-outs of the app's foods accepted (accuracy) | Unseen foods wrongly given a food name |
| --- | --- | --- | --- |
| 0.30 (no real threshold) | 100% (99.9%) | 99.1% (45.2%) | 64.4% |
| 0.60 (`UNSURE_IDENTITY`) | 99.6% (99.9%) | 84.8% (50.6%) | 50.0% |
| 0.90 (`CONFIDENT_IDENTITY`) | 98.6% (99.9%) | 53.8% (59.3%) | 30.0% |
| 0.95 | 97.6% (99.9%) | 46.2% (58.8%) | 25.6% |

Reading it honestly: on photos like the training data the model is right about 99.9% of the time
whatever it reports, so a threshold costs little (1.4% asked to confirm at 0.90). On foods it never
saw, the threshold cuts the confident mistakes roughly in half (64% to 30%). But on plain-background
photos it is unsure about many answers that are right and still confident about many that are wrong
(accuracy of what is accepted only rises from 45% to 59%), so a threshold is a weak signal
there. That is why the app pairs it with a confirm-and-correct step instead of trusting it alone.

### What these numbers do not cover

The held-out split is the friendliest test: never-seen photos, but from the same
collections as training. Four tougher, independent sets tell a fuller story. The
table below tracks two retraining rounds: the 9-food model from the previous round
(apple, banana, orange, tomato, potato, cucumber, capsicum, okra, bitter gourd)
against the current 12-food model (adding mango, papaya and eggplant from separate
public datasets):

| Check | 9-food model (previous round) | 12-food model (this round) |
| --- | --- | --- |
| Held-out split (identity / freshness) | 99.8% / 99.5% | 99.9% / 99.2% |
| Original dataset's own unseen apple/banana/orange | 100% | 100% |
| Fresh vs rotten beef, separate collection | 99.4% | 99.6% |
| Foods never trained on, correctly called "unknown" | 30.7% | 34.9% |
| Cut-out photos on a plain white background | 56.6% | 44.3% |

The last two rows are real weaknesses. Sweeping a confidence threshold for
"unknown" (`benchmark.py --tune`, then a dedicated known-vs-unknown sweep) found
the model is frequently confident but wrong on food it has never seen — so no
threshold is applied; `MIN_IDENTITY_CONFIDENCE` in `pipeline.py` is 0 (disabled).
Adding mango, papaya and eggplant nudged the unknown-food score up (there are more
labelled classes now, so a misfire is more likely to land on a class that isn't
`unknown`, but also more training diversity to draw the line correctly some of the
time) but pulled the white-background score down: eggplant and mango occupy more
of the label space, so a plain-background photo of an existing food (apple,
capsicum, cucumber, potato, tomato) has more ways to be misclassified into a food
that wasn't there before. Both numbers reflect a real gap — more training photos in
exactly those conditions is what would close it, not a setting.

## Endpoints

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| `GET` | `/health` | no | Which models loaded, their paths, whether the OCR engine is installed |
| `POST` | `/predict` | no | Identity, freshness, detection, indicators, per-stage trace |
| `POST` | `/ocr` | no | The text printed on a label (`text`, per-line `lines` with confidence, `ms`) |
| `GET` | `/metrics` | no | The evaluation report (add `?include_confusion=true` for matrices) |
| `GET` | `/metrics/detector` | no | The food detector's evaluation (mAP, object counts, real-photo and false-detection rates) |
| `GET` | `/metrics/confidence` | no | How trustworthy the models' confidence is, and the review thresholds chosen from it |
| `GET` | `/metrics/{task}` | no | One task: `food_identity`, `freshness` or `combined`, with its confusion matrix |
| `GET` | `/foods` | no | The food database an administrator maintains, with a `version` that changes when it does |
| `PUT` | `/admin/foods/{id}` | admin | Add a food, or correct a bundled food's shelf life, storage and tips |
| `DELETE` | `/admin/foods/{id}` | admin | Remove the server's entry (a bundled food reverts to its built-in values) |
| `GET` | `/admin/users` | admin | Every account with its role and how many items it holds (never password data) |
| `POST` | `/admin/users/{id}/role` | admin | Make a user an administrator, or a regular user again (you cannot demote yourself) |
| `GET` | `/admin/stats` | admin | Totals for the admin screen: users, items, edited foods, most-tracked foods |
| `POST` | `/auth/register` | no | Create an account; returns a session token and the user |
| `POST` | `/auth/login` | no | Sign in; locked for 15 minutes after 5 failures (`429` + `Retry-After`) |
| `GET` | `/auth/me` | yes | The signed-in user |
| `POST` | `/auth/forgot` | no | Emails a 6-digit code; the reply is identical for unknown emails |
| `POST` | `/auth/verify-code` | no | Exchanges a valid code (15 minutes, 5 tries, single use) for a 10-minute reset token |
| `POST` | `/auth/reset-password` | reset token | Sets a new password |
| `POST` | `/auth/change-password` | yes | Changes password, given the current one |
| `GET` | `/inventory` | yes | Every item the user has saved |
| `PUT` | `/inventory/{id}` | yes | Create or update one item (an older edit never overwrites a newer one) |
| `DELETE` | `/inventory/{id}` | yes | Remove one item (deleting a missing item is not an error) |
| `POST` | `/inventory/sync` | yes | Upload up to 500 items; returns the merged list and any rejected ids |

The first account created on a fresh install is the administrator; on an install that already has
accounts, the oldest one becomes the administrator when the database is upgraded, and
`EREF_ADMIN_EMAILS` (below) names more. The app merges the food database over its bundled catalog at
start-up and whenever `version` changes, keeping the last copy on the device for offline use.

The inference endpoints are stateless and open on the local network. Everything that
touches a user's data requires `Authorization: Bearer <token>`, and every inventory
query is filtered by the token's user, so one account can never read or change
another's items.

`POST /predict` and `POST /ocr` take a multipart `image` field and accepts `?detect=false` to
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
  "review": { "level": "high", "needsConfirmation": false, "reasons": [] },
  "imageSize": [768, 1024],
  "objectCount": 1,
  "objects": [{
    "id": 0, "source": "detector", "box": [112.4, 208.0, 660.1, 812.5],
    "detectorLabel": "banana", "detectorConfidence": 0.93,
    "foodName": "banana", "confidence": 0.9998, "freshness": "spoiled", "freshnessConfidence": 0.9999,
    "agreement": "agrees", "review": { "level": "high", "needsConfirmation": false, "reasons": [] }
  }],
  "detection": { "model": "eref-detector-v1", "used": true, "label": "banana", "confidence": 0.93, "count": 1 },
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
| `EREF_DETECTOR_PATH` | `yolov8n.pt` (the COCO fallback detector) |
| `EREF_FOOD_DETECTOR_PATH` | `runs/detect/eref_detector_v1/weights/best.pt` (the fine-tuned food detector) |
| `EREF_ADMIN_EMAILS` | unset; comma-separated emails that are administrators regardless of their stored role |
| `EREF_FRESHNESS_TFLITE_PATH` | the MobileNetV2 TFLite model |
| `EREF_FRESHNESS_YOLO_PATH` | the YOLO freshness weights |
| `EREF_METRICS_PATH` | `backend/metrics/model_metrics.json` |
| `EREF_DATA_DIR` | `backend/data/` (holds the database and the signing key) |
| `EREF_DB_PATH` | `<EREF_DATA_DIR>/eref.db` |
| `EREF_SECRET` | a random key generated on first run into `<EREF_DATA_DIR>/secret.key` |
| `EREF_DEV_RETURN_CODE` | unset; set to `1` to include the reset code in the `/auth/forgot` reply (demos and tests only) |
| `EREF_SMTP_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `_FROM` | unset; when a host is set, reset codes are emailed (port 465 uses SSL, otherwise STARTTLS) |

Without SMTP settings the reset code is written to the server log.

## Security notes

- Passwords are hashed with scrypt (N=16384, r=8, p=1) and a per-user salt; only the
  hash is stored. Login checks a dummy hash for unknown emails so timing does not reveal
  which emails are registered, and failures for any email return one identical message.
- Session and reset tokens are HMAC-SHA256 signed and carry an expiry and a kind, so a
  reset token cannot be used as a session token or the reverse. Everything is built on the
  standard library, so it needs no compiled crypto wheel.
- Reset codes are stored only as an HMAC, expire after 15 minutes, allow 5 attempts and
  are consumed on use.
- The app talks to the server over plain HTTP on the local network, so passwords and tokens
  are not encrypted in transit. That is acceptable on a trusted home or lab network; anything
  beyond that needs HTTPS in front of the API.
- The failed-login lockout is per email address, so someone could deliberately lock another
  person's account for 15 minutes. It is kept in memory, so a server restart clears it.
- `EREF_DEV_RETURN_CODE=1` lets anyone who can reach the server read a reset code and take
  over any account. Use it only for local demos and never leave it set.
- The inference endpoints are deliberately unauthenticated (they hold no user data), which
  is appropriate for a private network but not for the open internet.

## Testing

```powershell
python -m pytest backend\tests -v
```

Test names begin with their case ID and are grouped by the requirement they check:

| Group | Cases | Covers |
| --- | --- | --- |
| `TC-F-AUTH-01…13` | 13 | Sign-up, duplicate/weak/malformed input, sign-in, non-revealing errors, lockout, token forgery and expiry, hashed storage, the full reset flow, code lockout, token-kind separation, password change |
| `TC-F-INV-01…07` | 7 | Save/list/delete, sign-in required, isolation between users, last-write-wins, batch sync, validation, persistence across sign-in |
| `TC-F-OCR-01…04` | 4 | Reading name and both dates from a label, no invented text from a blank image, bad uploads, confidence and timing |
| `TC-F-ADM-01…11` | 11 | First account is admin, admin-only routes refuse everyone else, food database add/change/remove with validation and version, user list without password data, role changes (never your own), stats, `EREF_ADMIN_EMAILS`, upgrade of a database that predates roles |
| `TC-F-DET-01…16` | 16 | Review levels and reasons, thresholds match the calibration, crops and boxes, several foods found and boxed separately and classified on their own crops, detector skipped or missing, EXIF-rotated phone photos |
| `TC-F-CNN-01…07` | 10 | Identity and freshness on real samples, response fields and stages, skipping the detector, bad and extreme images, health and metrics, JPEG/PNG agreement |
| `TC-NF-PERF-01…03` | 3 | Response time of a scan, a label read, sign-in and inventory calls against p95 targets |
| `TC-NF-REL-01…02` | 2 | 50 mixed requests without a failure; 6 concurrent users without corrupting each other's data |
| `TC-NF-SEC-01…02` | 2 | No password material in responses; hostile and oversized input never causes a server error |
| `TC-NF-USA-01` | 1 | Error messages are plain language |

Latency targets are p95 limits for a CPU-only laptop and can be changed with
`EREF_PREDICT_P95_MS`, `EREF_OCR_P95_MS`, `EREF_LOGIN_P95_MS` and `EREF_API_P95_MS`. The
last run measured (written to `metrics/nfr_report.json`):

| Operation | Runs | Mean | p95 | Target p95 |
| --- | --- | --- | --- | --- |
| Food scan (`/predict`) | 20 | 70.1 ms | 73.1 ms | 3000 ms |
| Label read (`/ocr`) | 10 | 433.3 ms | 529.3 ms | 4000 ms |
| Sign in (`/auth/login`) | 8 | 80.0 ms | 86.7 ms | 1000 ms |
| List inventory | 30 | 7.0 ms | 8.1 ms | 250 ms |
| Save an item | 30 | 12.1 ms | 14.3 ms | 250 ms |

The scan timing repeats one image, so it reflects the warm path; the app's own
`inferenceMs` field reports the cost of each real request.

The app has its own suites under `mobile/` (`npm test`): a smoke test of every screen and
algorithm plus live-server checks, and an integration test that mounts the real inventory
provider (session restore, sync, offline queue, expired session, notifications).
