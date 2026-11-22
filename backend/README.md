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
| 3. Freshness | Gaussian Mixture Model, per food | `runs/cluster/freshness_gmm.joblib` | Fresh / Sub-Fresh / Putrid, judged by the photo's colour against that food's fitted Gaussian components |
| 4. Variety (optional) | YOLOv8n-cls (CNN), per food | `runs/classify/runs/classify/eref_apple_variety_v1/weights/best.pt` | Which cultivar, for foods that have one trained (today: apple only). Never feeds the freshness verdict |

**Classification and detection answer different questions.** Stages 2 and 3 take one
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
tomato as an apple, orange or donut. When it is the detector in use, stages 2 and 3 therefore read the
**full frame**, never its crop. Identity always comes from the CNN (stage 2), and
`detection.agreement` reports whether the detector agreed (`agrees`), named a different
food (`differs`) or named something that is not a food type it can identify
(`outside_vocabulary`).

Stage 2's 25th class, `other`, is for anything that is not one of the app's twelve
foods — the response then reports `foodName: null` and the app tells the user
their item is not one of the supported foods, instead of forcing a guess. `other`
has no freshness meaning of its own, so it is left out of stage 3's lookup (no
dedicated mixture to use) and out of the food-identification metric.

**Stage 3 was originally a dedicated freshness CNN** (fused with stage 2's own
fresh/rotten class split). The project's adviser asked for spoilage to be judged
by colour instead, so it was replaced with `backend/freshness_cluster.py`: a
**Gaussian Mixture Model**, fit per food, over twelve colour statistics
(hue/saturation/value, their spread, how much of the frame looks browned or
darkened on average, and how bad and how uneven its worst small patch is — added
after measuring that a whole-frame average dilutes a small rotten spot). Each food
gets three diagonal-covariance Gaussian components — Fresh and Putrid set directly
to the mean/variance of that food's labelled fresh/rotten training photos, and
Sub-Fresh at their midpoint — and a new photo's tier is whichever component gives
it the highest posterior probability.

Two things were tried and measured worse before arriving at that design. A fully
unsupervised fit (no labels at all, letting the mixture discover clusters from
colour alone) came back 44% / 49% / 58% rotten across its three components, pooled
over every food — barely different from the 50/50 baseline, because a banana's
yellow and a tomato's red differ far more than either food's own fresh-vs-rotten
colour shift, so the components split by food type rather than freshness. Running
Expectation-Maximisation past the label-derived starting point — refining all three
components' means, variances and weights over several iterations, the way
scikit-learn's `GaussianMixture` would — was also tried, and measured to make held-
out accuracy *worse* the more it ran (79.1% at zero iterations down to 75.0% at ten
iterations): the Sub-Fresh component, reachable from both labelled sides, absorbs a
growing share of the data each iteration and starves the other two of the examples
that anchored them. So the shipped model runs zero EM iterations — each component
is fit directly from its labelled statistics, the EM algorithm's single M-step
applied once, given hard assignments already known from the labels. That alone
measures **79.1% test accuracy** overall, better than the plain nearest-centroid
version it replaced (77.0%), because classifying by each tier's own Gaussian
density accounts for its colour variance, where unweighted Euclidean distance did
not. `runs/cluster/freshness_gmm.json` has the current per-food breakdown — banana
is 96.0%, capsicum and mango are over 85%; eggplant and tomato are closer to
65-70%, which is reported rather than hidden.

Precision, recall and F1 are measured too (`backend/metrics.py: binary_report`,
positive class `rotten` — a missed rotten item is the costly error for food safety),
not just accuracy: **83.9% precision, 79.6% recall, 81.7% F1** overall on the test
split (80.8% / 79.8% / 80.3% on val). Recall is the one to watch per food: most are
70-98%, but okra's is 36.7% (69% accuracy, 69% precision — it mislabels more rotten
okra as fresh than it catches), the weakest result among the twelve. `backend/
plot_gmm_metrics.py` charts all four measures per food
(`backend/metrics/gmm_classification_metrics.png`). Papaya's own accuracy came from
supplementing its original ~820 training photos with a second, cropped-and-
relabelled source (see Training) — small per-food photo counts are a real lever on
accuracy here, not just the features or the model. `backend/train_freshness_clusters.py`
fits and evaluates it; `backend/cluster_dataset_breakdown.py` groups every photo in
the dataset by the tier the trained model assigns it, per food.

When the item is not a supported food (stage 2 returned `other`), stage 3 has no
per-food mixture to use and falls back to the stage 2 head's own fresh/rotten
class split instead. When neither is available at all, the response says so in
`freshnessDetail` rather than guessing.

**Stage 4 answers a different question — not "is it fresh" but "which kind".**
Asked to add varieties like Fuji and "Washington" apples, the obvious reading
("a Gaussian component per cultivar, like freshness") runs into the same wall
freshness did: no public dataset labels a photo with both a cultivar and a
fresh/rotten state, so there is nothing to fit a `fresh_fuji` / `rotten_fuji`
component to. Variety is
instead a second, independent CNN classifier (same tool as stage 2, different
question), trained on AFVC — a dataset that has varieties but no freshness labels —
and it never touches the freshness verdict. Today only apple has one (Fuji, Gala,
Granny Smith, Red Delicious, Golden Delicious — the imported varieties sold in
Philippine groceries; "Washington Apple" isn't itself a cultivar, it's a US
regional label historically associated with Red Delicious, so it maps there rather
than becoming a sixth class). See `variety.py`, `build_apple_varieties.py` and
`train_apple_variety.py`. Every other food simply has no variety classifier yet,
so the response reports `variety: null` for them, the same as a food with no
freshness model would. Measures 93.1% top-1 accuracy on AFVC's own 175-photo held-out
test split — distinguishing five cultivars is a much easier visual task than judging
spoilage, so this is a higher number than freshness clustering gets, but on the same
kind of clean, studio-style photos the rest of this project's accuracy figures come
from, not real-world phone photos.

After the models run, `indicators.py` measures the visible spoilage indicators
from the study design — discoloration, mould spots, texture abnormality, excess
moisture — using OpenCV statistics on the image, scaled by stage 3's rotten
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
python backend\train_freshness_clusters.py   # the per-food GMM (stage 3) -- this is what /predict uses
python backend\plot_gmm_overall.py           # ^ accuracy/precision/recall/F1, whole algorithm
python backend\plot_gmm_metrics.py           # ^ the same, broken down per food
python backend\plot_gmm_bic_overall.py       # clustering analysis (separate from /predict): AIC/BIC vs k, pooled
python backend\plot_gmm_bic.py               # ^ the same, broken down per food
python backend\plot_gmm_k5_result.py         # ^ the k=5 clustering result: silhouette score + diagram
python backend\plot_gmm_k5_result.py --pca 2 # ^ the same, PCA-reduced (the better, still-honest number)
python backend\plot_gmm_silhouette_overall.py   # ^ silhouette vs k, pooled (is some other k better?)
python backend\plot_gmm_silhouette.py        # ^ the same, broken down per food
python backend\build_apple_varieties.py      # the optional variety dataset (stage 4)
python backend\train_apple_variety.py
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
| Papaya (2nd source) | "PAPAYA" — Ripe/Overripe/Partially Rotten/Rotten/PartiallyRipe/UnRipe, instance-segmented; only Ripe (fresh) and Overripe/Partially Rotten/Rotten (rotten) are used, see `convert_papaya_roboflow.py` | Roboflow Universe, `lathrell-delos-santos/papaya-87aps-uiito` | CC BY 4.0 |
| Eggplant | "BrinjalFruitX: A Field-Collected Image Dataset for Machine Learning and Deep Learning-Based Disease Identification in Brinjal Fruits" | Mendeley Data, [doi:10.17632/ngc58fsxgd.1](https://doi.org/10.17632/ngc58fsxgd.1) | CC BY 4.0 |
| Apple varieties | AFVC (Apple Fruit Varieties Collection), 85 cultivars; this project uses 5 (Fuji, Gala, Granny Smith, Red Delicious, Golden Delicious) — see `build_apple_varieties.py` | GitHub, [mustafa20999/AFVC](https://github.com/mustafa20999/AFVC) | Academic use only, cite the source paper |

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

Headline results, over 3,022 held-out images spanning all 12 foods:

| Task | Accuracy | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| Food identification | 99.82% | 99.68% | 99.60% | 99.64% |
| Freshness detection | 99.07% | 99.03% | 99.07% | 99.05% |
| Combined (25-class) | 99.16% | 98.59% | 98.60% | 98.58% |

**The freshness row above is retired, kept only for historical comparison.** It
scores the dedicated freshness CNN fused with stage 2 (`benchmark.py`'s original
design), which `/predict` no longer runs — stage 3 is now the Gaussian Mixture
Model approach described under Pipeline.

That approach's own accuracy/precision/recall/F1 were measured the same way
(`backend/metrics.py: binary_report`, positive class `rotten`) and are still
reproducible — `python backend\train_freshness_clusters.py`,
`python backend\plot_gmm_overall.py` / `plot_gmm_metrics.py`,
`runs/cluster/freshness_gmm.json` — but per the adviser's direction, classification
metrics are not how the clustering algorithm itself is reported: a clustering
result is reported on clustering-quality terms (silhouette score, BIC/AIC), and the
component count is set directly, at **k=5**, one unsupervised (label-blind) mixture
fit over every food pooled together rather than per food. `python
backend\plot_gmm_k5_result.py` fits it and reports:

| Metric | Value |
| --- | --- |
| Silhouette score | 0.102 |
| Log-likelihood | −31,590.2 |
| AIC | 63,428.4 |
| BIC | 64,173.2 |

0.102 is a weak score (0 = overlapping clusters, ~0.5+ = strong separation); two of
the five clusters score slightly negative on their own. That is consistent with
this project's earlier finding that an unsupervised, pooled fit tends to separate
by food type rather than by anything else — reported honestly rather than hidden,
and it is exactly why the app's live freshness verdict uses the separate,
label-anchored, per-food design above instead of this pooled unsupervised one.
Chart (the classic silhouette diagram): `backend/metrics/gmm_k5_silhouette.png`;
full numbers: `backend/metrics/gmm_k5_silhouette.json`.

**Checked directly whether some other k scores better, rather than assumed**:
`python backend\plot_gmm_silhouette.py` sweeps k = 2…16 the same way, pooled and
per food. Pooled, the score is *highest* at k=2 (0.234) and declines as k grows —
k=5 scores 0.139 in that sweep, falling to 0.041 by k=16 (small differences from
the 0.102 above come from different run settings; both land in the same weak
band). Most individual foods show the same declining shape from k=2; a few
(bitter gourd, capsicum, potato) peak at a higher k, but inside a visibly noisy,
zig-zagging curve rather than a clean trend — a sign of an unstable fit on a small
sample, not real structure. **No food and no k in the range tested reaches the
conventional ~0.5 "reasonable structure" threshold, let alone 1**; cucumber at
k=2 (0.487) comes closest. Charts: `backend/metrics/gmm_silhouette_overall.png`
(pooled), `backend/metrics/gmm_silhouette.png` (per food, with `.json` for the
full numbers).

**Is there a legitimate way to raise the score, keeping k=5?** Yes, measured rather
than assumed: the twelve raw features suppress silhouette on their own, separately
from clustering quality, because Euclidean distance loses contrast as dimensions
grow (the curse of dimensionality). Projecting onto the top principal components
first (`freshness_cluster.PCA`, fit via SVD — standard practice before clustering)
removes that noise:

| Dimensions kept | Variance explained | k=5 silhouette |
| --- | --- | --- |
| 12 (raw) | 100% | 0.102 |
| 3 | ~45% | 0.302 |
| **2** | **59.2%** | **0.360** |

(`python backend\plot_gmm_k5_result.py --pca 2`.) Checked, not assumed, that this
is a real improvement and not food identity rediscovered in disguise: the five
clusters' rotten-photo shares are 73%, 70%, 63%, 35% and 32% against this sample's
56% baseline — a real split along freshness. The two fresher-leaning clusters are
also the two best individually separated (mean silhouette 0.72 and 0.62); the
rottener-leaning ones are messier (0.09-0.52), plausibly because rot looks more
visually varied across different foods than a healthy colour does. 0.360 is still
weak-to-moderate, not strong, and nowhere near 1 — a genuine ~3.5x improvement from
addressing a real statistical issue, not from changing what counts as a cluster or
discarding data. Chart: `backend/metrics/gmm_k5_silhouette_pca2.png`/`.json`.

**On using this to argue clustering beats the CNN**: silhouette score and
classification accuracy are not the same kind of measurement and cannot show one
algorithm "beats" the other — silhouette judges how well an *unsupervised*
grouping separates; accuracy judges whether a *labelled* prediction was correct.
By this project's own numbers the retired freshness CNN measured ~99% accuracy,
well above the GMM's 79.1% (label-anchored, per food) or its weak pooled
silhouette score — a performance comparison does not favour clustering. The actual
reasons to use a GMM here are the ones already on record: the adviser's own
direction to judge spoilage by colour rather than a trained neural network, no
public dataset pairing *degree* of spoilage with enough labelled stages for a CNN
to learn from, and a colour-statistic decision that is directly inspectable in a
way a CNN's learned weights are not — not a claim that it scores higher.

`backend/pipeline.py`, `calibrate.py`, `evaluate.py` and `benchmark.py` still
carry the retired CNN-fusion code so the classification comparison stays
reproducible; they are not wired into the live `/predict` response.

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
| 0.30 (no real threshold) | 100% (99.6%) | 100% (56.8%) | 52.1% |
| 0.60 (`UNSURE_IDENTITY`) | 99.8% (99.6%) | 86.4% (58.3%) | 37.9% |
| 0.90 (`CONFIDENT_IDENTITY`) | 98.3% (99.9%) | 58.9% (62.4%) | 23.8% |
| 0.95 | 97.7% (99.9%) | 50.4% (64.5%) | 20.8% |

Reading it honestly: on photos like the training data the model is right about 99.6-99.9% of the
time whatever it reports, so a threshold costs little (1.7% asked to confirm at 0.90). On foods it
never saw, the threshold cuts the confident mistakes by more than half (52% to 24%). But on
plain-background photos it is unsure about many answers that are right and still confident about
many that are wrong (accuracy of what is accepted only rises from 57% to 62%), so a threshold is a
weak signal there. That is why the app pairs it with a confirm-and-correct step instead of trusting
it alone.

### What these numbers do not cover

The held-out split is the friendliest test: never-seen photos, but from the same
collections as training. Four tougher, independent sets tell a fuller story. The
table below tracks three retraining rounds: the 9-food model from two rounds back
(apple, banana, orange, tomato, potato, cucumber, capsicum, okra, bitter gourd),
the 12-food model that followed it (adding mango, papaya and eggplant from
separate public datasets), and the current retrain, which keeps the same 12 foods
but expands papaya's own photo count (its thinnest class) with a second source —
see `convert_papaya_roboflow.py`:

| Check | 9-food model | 12-food model | 12-food, papaya expanded |
| --- | --- | --- | --- |
| Held-out split (identity / freshness) | 99.8% / 99.5% | 99.9% / 99.2% | 99.8% / 99.1% |
| Original dataset's own unseen apple/banana/orange | 100% | 100% | 100% |
| Fresh vs rotten beef, separate collection | 99.4% | 99.6% | 99.6% |
| Foods never trained on, correctly called "unknown" | 30.7% | 34.9% | 46.1% |
| Cut-out photos on a plain white background | 56.6% | 44.3% | 50.4% |

The last two rows are real weaknesses, though both moved in the right direction
this round: more training photos overall (not just papaya's) plausibly firmed up
where the model draws the line against unfamiliar foods and plain backgrounds,
though a few points of this swing is ordinary run-to-run variance from retraining
rather than a change attributable to papaya specifically. Sweeping a confidence
threshold for "unknown" (`benchmark.py --tune`, then a dedicated known-vs-unknown
sweep) found the model is frequently confident but wrong on food it has never
seen — so no threshold is applied; `MIN_IDENTITY_CONFIDENCE` in `pipeline.py` is 0
(disabled). Adding mango, papaya and eggplant nudged the unknown-food score up
two rounds ago (there are more labelled classes now, so a misfire is more likely
to land on a class that isn't `unknown`, but also more training diversity to draw
the line correctly some of the time) but pulled the white-background score down:
eggplant and mango occupy more of the label space, so a plain-background photo of
an existing food (apple,
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
  "freshnessDetail": { "model": "color-gmm-freshness", "probRotten": 0.9999, "agreement": true },
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
| `EREF_FRESHNESS_CLUSTER_PATH` | `runs/cluster/freshness_gmm.joblib` (the per-food Gaussian Mixture Model) |
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
