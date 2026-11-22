# E-REF requirements checklist

Every item of the project checklist, with where it lives in the code, how it is checked, and
where it falls short. Nothing here is marked done unless a test or a measurement backs it.

**Status key**

- **Done**: implemented and covered by an automated test or a measured result.
- **Done, with a limit**: implemented, and the limit is stated so nobody has to discover it.

Run everything with `python -m pytest backend/tests` and `cd mobile && npm test`.
Test-case IDs (`TC-F-…`) are in the test names, and the suites are described at the end.

---

## A. Core system modules

| Module | Status | Where | Checked by |
| --- | --- | --- | --- |
| User registration / login | Done | `backend/accounts.py`, `backend/auth.py`, `mobile/screens/AuthScreen.js` | `TC-F-AUTH-01…13`, `context-test.js` (session, restart, expired session) |
| User profile | Done | `mobile/screens/ProfileScreen.js` (name, email, alerts, appearance, change password, server) | `smoke-test.js` (profile shows the signed-in account) |
| Food inventory management | Done | Shelf screen, `context/InventoryContext.js`, `POST /inventory/sync` | `TC-F-INV-01…07`, `context-test.js` (add, edit, remove, offline queue) |
| Food item registration | Done | Scan a photo, or **Add food by hand** (`components/inventory.js`, `services/manual.js`) | `features-test.js` (manual entry), `smoke-test.js` |
| Food image capture / upload | Done | Camera screen: camera or gallery; label photo for OCR | `smoke-test.js` (review step), `TC-F-CNN-*`, `TC-F-OCR-*` |
| Food spoilage monitoring | Done | GMM freshness reading + time-temperature indicator + expiry + storage → weighted risk (`services/riskScore.js`) | `smoke-test.js` (risk), `features-test.js` |
| Expiration / shelf-life tracking | Done | `services/tti.js` (Q10 model), label OCR (`backend/ocr.py`, `services/ocr.js`), editable date | `smoke-test.js`, `TC-F-OCR-*`, `features-test.js` (date parsing, edit) |
| Food status monitoring | Done | Fresh/rotten verdict, freshness %, urgency label on every shelf card | `smoke-test.js`, `theme-test.js` |
| Food prioritization | Done | Greedy ranking, `services/prioritize.js`; **Use First** list on Home | `features-test.js` (section D) |
| Food recommendation | Done | Content-based recipes, `services/contentBased.js`; **Recipes** screen | `features-test.js` (section E) |
| Notifications / alerts | Done, with a limit | `services/notifications.js`, Alerts screen | `smoke-test.js`, `context-test.js`. **Not tried on a physical phone**, see limits |
| Inventory history | Done | **History** screen (every event, and what was used or thrown away); per-item tracking history | `context-test.js` (used, discarded, restored, date changed), `features-test.js` |
| Dashboard / summary | Done | Home: totals, soon-to-spoil, priority list, meal plan, categories | `features-test.js` (Home) |
| Search / filter | Done | Shelf: search by name, storage or category, plus category tabs | `smoke-test.js` (Shelf) |
| Admin / food database management | Done, with a limit | `backend/admin.py`, `mobile/screens/AdminScreen.js`, `mobile/data/foodCatalog.js` | `TC-F-ADM-01…12`, `context-test.js` (food database), `features-test.js` |
| Super Admin web console | Done | `WEBSITE/` (served at `/web`), `backend/superadmin.py`: user accounts (all tiers), food categories, system-wide activity logs, recipe dataset | `TC-F-SUP-01…15`, `features-test.js` (categories and recipes reach the app) |

**How the admin module works.** The app ships with a catalog of foods (shelf life at a reference
temperature, Q10, best storage, whether it freezes, tips). An administrator can correct any of
these, or add a food, from **Profile → Admin**. The server keeps those entries, every phone
merges them over its bundled catalog when it starts and whenever the database's `version`
changes, and the last copy is kept on the phone for offline use. Administrators can also see
every account (never password data) and make Employees Admins or back.

**Account tiers.** Every account is a **Super Admin**, an **Admin** or an **Employee**. The first
account on a fresh install is the Super Admin; on an older database the oldest administrator
(or oldest account) becomes the Super Admin, other administrators stay Admins and everyone else
becomes an Employee; `EREF_ADMIN_EMAILS` names more Admins. Super Admins use the web console
(`WEBSITE/README.md`) to manage accounts in every tier, the food categories, the recipe dataset
the recommender uses, and to read the system-wide activity log. The app downloads categories
and recipes from the server and keeps a copy for offline use.
*Limit:* changing a food's values changes how existing items of that food are estimated the next
time the phone refreshes; it does not re-scan anything.

---

## B. Food spoilage classification: Gaussian Mixture Model

Spoilage used to be decided by a dedicated freshness CNN fused with the identity model's own
fresh/rotten split. On the adviser's direction, that decision was replaced with a colour-based
**Gaussian Mixture Model**: each food gets three diagonal-covariance Gaussian components — Fresh
and Putrid fit directly to the mean/variance of its labelled training photos, Sub-Fresh placed at
their midpoint — and a new photo is classified by whichever component gives it the highest
posterior probability, within its own food's mixture. Food identity (which of the 12 foods it is)
is still decided by the CNN in section C — only the fresh/sub-fresh/putrid call changed.

| Item | Status | Where / evidence |
| --- | --- | --- |
| Food image dataset prepared | Done | `backend/build_dataset.py` assembles 12 foods from several collections; sources and licences in `backend/README.md` |
| Images categorised by food / spoilage class | Done | Folders `fresh_<food>`, `rotten_<food>` for 12 foods, plus `other` (25 classes); the same folders the Gaussian components are fitted from |
| Image preprocessing | Done | Each photo is resized to 96 × 96 and converted to HSV; twelve colour statistics are taken from that (hue/saturation/value, their spread, how much of the frame looks browned or darkened on average, and how bad/uneven its worst small patch is) — `backend/freshness_cluster.py: color_features` |
| Resizing / normalisation | Done | As above, plus per-food standardisation (zero mean, unit variance) before fitting the Gaussian components (`ColorScaler`) |
| Training and validation set defined | Done | The mixture is fitted on `train` only and measured on `val`/`test`, the same split the identity CNN uses |
| Clustering algorithm implemented | Done | A per-food Gaussian Mixture Model, three components (Fresh/Sub-Fresh/Putrid), diagonal covariance (`backend/freshness_cluster.py`, `GaussianMixture`, `FreshnessClusterer`); fitting is `backend/train_freshness_clusters.py`. A blind, unsupervised fit (no food-specific anchoring, no labels) was tried first and measured close to random; label-initialised EM refinement was also tried and measured *worse* than fitting the components directly from the labels (see the adviser check below) |
| Model training implemented | Done | `backend/train_freshness_clusters.py` (reproducible, deterministic — no randomness to resume) |
| Classification / prediction implemented | Done | `backend/pipeline.py: FoodPipeline._assess_freshness`, `POST /predict` |
| Spoilage classes defined | Done | Fresh / Sub-Fresh / Putrid, per food, each its own fitted Gaussian component; visible indicators (discoloration, mould, texture, moisture, packaging) layered on top |
| Prediction confidence displayed | Done | Scan result: "95% sure of the food", a 0-100% freshness reading split into **Fresh (70-100%)**, **Sub-Fresh (30-69%)** and **Putrid (0-29%)** (`freshness_tier`/`FreshnessClusterer.assess`, `backend/pipeline.py`), runner-up guesses when unsure, and the **Model Performance** screen (`features-test.js`) |
| Model integrated into the mobile app | Done, with a limit | The app calls the model server on your network; the GMM runs there, not on the phone. Scanning needs the server reachable |
| A real captured or uploaded image gives a classification | Done | `TC-F-CNN-01…07` run real dataset photos through the live API; `smoke-test.js` does the same through the app's own code |
| Incorrect / low-confidence prediction handled | Done, with a limit | See below |

**Low-confidence handling.** Every result carries a `review` (`backend/pipeline.py`,
`assess_review`): `high` (identity confidence of at least 0.90), `medium`, or `low` (below 0.60
or not one of the twelve foods). A borderline fresh/rotten call or a detector that names a
different food adds a reason. The scan screen shows a warning with the reasons and the
runner-up foods; a `low` result **cannot be saved** until the user picks or confirms the food, a
`medium` one asks for a one-tap confirmation, and every correction is written into the item's
history. The thresholds were chosen from a measurement (`backend/calibrate.py`,
`backend/metrics/confidence_calibration.json`, shown under **Model Performance**), not guessed.
Tests: `TC-F-DET-01…07`, `features-test.js` (scan-result states).
*Limit:* a threshold reduces confident mistakes on foods the model never saw but cannot remove
them; see "Known limits" for the numbers. *Limit:* GMM accuracy varies a lot by food
(96.0% banana down to 68.0% eggplant on the held-out test split) — see the adviser check below.

### Adviser check: "How does your app determine whether a food item is spoiled?"

By colour, with a Gaussian Mixture Model, not a trained neural network. Every photo is reduced to
twelve colour numbers — the average and spread of its hue, saturation and brightness; how much of
the frame looks browned or darkened on average; and how bad and how uneven its single worst small
patch is, since rot usually starts as a spot rather than an even tint shift
(`color_features` in `backend/freshness_cluster.py`). Each of the 12 foods gets its own
three-component mixture: a Fresh and a Putrid Gaussian, each fit to the mean and variance of that
food's labelled fresh/rotten photos, and a Sub-Fresh Gaussian at their midpoint (mean) with their
averaged variance — the halfway colour of decay, which has no labelled examples of its own. A new
photo is scored against its own food's three components and assigned to whichever gives it the
highest posterior probability; how much more likely one component is than the others also gives a
continuous 0-100% freshness reading, not just a hard tier.

Two simpler readings of "Gaussian Mixture Model" were tried first and measured, not assumed, to be
worse. A fully unsupervised fit — letting EM discover three groups per food with no labels at all
— came back 44% / 49% / 58% rotten pooled across every food, barely different from a 50/50 coin
flip, because a banana's yellow and a tomato's red differ far more than either food's own
fresh-to-rotten colour shift, so the components split by food type, not freshness. Starting EM
from the labelled means instead (fresh/putrid components seeded from their labelled photos, then
refined by Expectation-Maximisation like a textbook `GaussianMixture` fit) did better, but
*iterating* EM past that starting point was measured to make held-out accuracy progressively
**worse**: 79.1% at zero iterations, 77.1% at five, 75.0% at ten. The reason is specific to this
data: the Sub-Fresh component is the only one allowed to draw from both labelled sides, so each EM
iteration it absorbs a growing, disproportionate share of the responsibility and starves Fresh and
Putrid of the examples that anchored them — a textbook case of unsupervised refinement overriding
a good supervised start. So the shipped model runs **zero EM iterations**: each component is fit
directly from its labelled statistics, which is mathematically the EM algorithm's single M-step
applied once, given hard assignments already known from the labels, rather than re-estimated from
soft, EM-discovered ones.

That direct fit measures **79.1% accuracy** on the held-out test split overall, *better* than the
plain nearest-centroid version tried in an earlier iteration of this project (77.0%) — because
scoring by each component's own Gaussian density accounts for its colour variance, where
nearest-centroid's unweighted Euclidean distance did not. Accuracy is still uneven by food —
96.0% banana, 87.7% mango and 85.0% capsicum, down to 68.0% eggplant and 68.3% tomato
(`runs/cluster/freshness_gmm.json` has every food; `python backend/train_freshness_clusters.py`
reproduces it). That spread is reported here rather than hidden: some foods show spoilage as an
obvious colour shift (a banana browning and blackening); others show it more as texture or
localised spotting, which the worst-patch features help with but do not fully solve. Papaya
specifically improved (61.5% → 67.9% under the earlier nearest-centroid method) from adding a
second, independently-sourced photo set (`backend/convert_papaya_roboflow.py`) on top of its
original ~820 training photos, the smallest of any food here — evidence that per-food photo count
is itself a lever on accuracy, separate from the feature set or the model.

### Adviser check: "What is the clustering result, with k=5 components?"

**The adviser's direction**: a clustering algorithm is reported on clustering-quality terms
(silhouette score, BIC/AIC), not accuracy/precision/recall/F1 — those are classification
metrics, and belong to the earlier framing where each food's mixture was evaluated against a
fresh/rotten label. The adviser also set the component count directly: **k=5**, one Gaussian
Mixture Model fit unsupervised (label-blind) over every food's colour features pooled together —
not per food, and not label-anchored. `python backend/plot_gmm_k5_result.py` fits it (15 random
EM restarts, kept the best of them, 200 iterations each, 3,000 pooled photos) and reports:

| Metric | Value |
| --- | --- |
| Silhouette score | **0.102** |
| Log-likelihood | −31,590.2 |
| AIC | 63,428.4 |
| BIC | 64,173.2 |
| Free parameters | 124 |

Cluster sizes and their own mean silhouette (how well-separated each one is individually) —
cluster 4: 394 photos, 0.453; cluster 2: 556 photos, 0.222; cluster 1: 412 photos, 0.081; cluster
3: 521 photos, −0.011; cluster 0: 1,117 photos, −0.021. Chart (the classic silhouette diagram —
horizontal bars per photo, grouped by cluster, with the overall mean marked) and full numbers:
`backend/metrics/gmm_k5_silhouette.png`/`.json`.

Reported honestly: 0.102 is a **weak** silhouette score (0 means clusters overlap with no clear
separation; anything above roughly 0.5 is considered strong). Two of the five clusters (0 and 3)
score slightly *negative* on average, meaning a meaningful share of their photos sit closer to a
different cluster than their own. This is consistent, not contradictory, with everything already
measured about this colour-feature space: a fully unsupervised, pooled fit was shown earlier to
split by food type more than by anything else (see the section above and `freshness_cluster.py`'s
module docstring), so weak separation at k=5 pooled is the expected result, not a bug — it is why
the app's actual fresh/rotten decision uses the separate, label-anchored, per-food design
described above instead of this pooled unsupervised one.

**Is there a k that scores better?** Checked directly rather than assumed:
`python backend/plot_gmm_silhouette.py` sweeps k = 2…16, pooled and per food, each k
fit the same way (several random EM restarts, best kept). Pooled, the score
*declines* as k grows — k=2 scores highest (0.234), k=5 scores 0.139 in this run (the
0.102 reported above used a larger, final-quality fit; both land in the same weak
band — small differences between runs are expected noise, not a contradiction), and
it keeps falling toward k=16 (0.041). The same declining shape holds for most
individual foods too (apple, cucumber, eggplant, mango, okra, orange and papaya all
peak at k=2 and decline from there); a few — bitter gourd, capsicum, potato — show a
noisier, zig-zagging curve that happens to peak at a higher k (15, 15 and 9
respectively), but those peaks sit inside visibly erratic swings rather than a clean
trend, which is a sign of an unstable fit on a small sample rather than real
structure. **No food, and no k in the range tested, reaches the conventional ~0.5
"reasonable structure" threshold, let alone 1** — cucumber's k=2 (0.487) comes
closest of anything measured. Chart: `python backend/plot_gmm_silhouette_overall.py`
→ `backend/metrics/gmm_silhouette_overall.png` (pooled); full per-food grid:
`backend/metrics/gmm_silhouette.png`/`.json`.

**Is there a legitimate way to raise the score, keeping k=5?** Yes — and it was measured,
not assumed: the twelve raw colour features suppress silhouette by themselves, independent
of clustering quality, because Euclidean distance loses contrast as dimensions grow (the
"curse of dimensionality"). Projecting onto the top principal components first (standard
practice before clustering — `freshness_cluster.PCA`, fit with SVD) removes that noise:

| Dimensions kept | Variance explained | k=5 silhouette |
| --- | --- | --- |
| 12 (raw) | 100% | 0.102 |
| 6 | ~65% | 0.122 |
| 4 | ~55% | 0.169 |
| 3 | ~45% | 0.302 |
| **2** | **59.2%** | **0.360** |

(The 6/4/3-dimension figures are from an earlier, smaller exploratory run and are included to
show the trend; the 12-dimension and 2-dimension rows are the final, full-quality numbers —
`python backend/plot_gmm_k5_result.py` / `--pca 2`, 15 restarts, 3,000 pooled photos.)

**Checked, not assumed, that this is a real improvement and not just food identity in
disguise**: if the clusters at 2 PCA dimensions were simply rediscovering *which food it is*,
each cluster's share of rotten photos would mirror whichever foods landed in it, with no
particular pattern. Instead, the five clusters' rotten-photo shares are 73%, 70%, 63%, 35%
and 32%, against this sample's 56% baseline — a real, if imperfect, split along freshness,
not food identity. The two "fresher-leaning" clusters (32%, 35% rotten) are also the two best
*individually* separated (mean silhouette 0.72 and 0.62); the three "rottener-leaning"
clusters are messier (0.09–0.52) — rot looks more visually varied across different foods than
a healthy colour does, which is a plausible, reportable reason for that asymmetry. Chart (the
same silhouette diagram, this time with real structure instead of mostly-overlapping blobs)
and full numbers: `backend/metrics/gmm_k5_silhouette_pca2.png`/`.json`; the raw-feature
version for comparison is `gmm_k5_silhouette.png`/`.json` (no PCA).

**0.360 is still a weak-to-moderate score, not a strong one, and nowhere near 1.** It is a
genuine, explainable improvement over 0.102 — about 3.5x — achieved by addressing a real
statistical issue (high dimensionality) rather than by changing what counts as a cluster or
discarding inconvenient data. Presented this way, it is the honest, legitimate answer to "can
this be improved": yes, substantially, but a photographic colour-feature dataset of twelve
different real foods is never going to silhouette like a textbook synthetic example.

**On comparing this to the CNN to argue clustering is the better choice**: silhouette
score and classification accuracy are not the same kind of measurement and cannot be
used to show one algorithm "beats" the other — silhouette judges how well an
*unsupervised* grouping separates on its own terms; accuracy judges whether a
*labelled* prediction was correct. By this project's own numbers, the retired
freshness CNN measured ~99% accuracy, well above the GMM's 79.1% (label-anchored,
per food) or its weak silhouette score pooled — so a performance comparison does
not favour clustering. The reasons to use a GMM here instead of a CNN are the ones
already on record for this project: the adviser's own direction to judge spoilage by
colour rather than a trained neural network, no public dataset exists that pairs
*degree* of spoilage with enough labelled stages for a CNN to learn from, and a
colour-statistic decision is directly inspectable (which twelve numbers, which
centroid) in a way a CNN's learned weights are not — not a claim that it scores
higher.

### Adviser check: "How many clusters does a BIC/AIC analysis say your data has?"

Run separately as a model-selection check, not as how the shipped model is actually fit:
`backend/plot_gmm_bic.py` fits an ordinary, **label-blind** Gaussian Mixture Model to each
food's colour features for k = 1…16 components, with several random EM restarts per k (EM
only finds a local optimum), and plots AIC = 2p − 2·log-likelihood and BIC = p·ln(n) −
2·log-likelihood against k.

**Whole algorithm, all 12 foods pooled** — the headline result: neither AIC nor BIC settled
on an interior minimum anywhere in k = 1…16 — both kept decreasing out to k=16 over 2,400
pooled photos, because real photographic colour statistics are not actually drawn from a
small number of Gaussian blobs, so an unpenalised fit almost always improves a little more
with each added component. The strict minimum is therefore not a useful number on its own;
the practical read is the curve's **elbow** (point of sharpest diminishing returns), which
lands at **k=5** pooled. Chart: `python backend/plot_gmm_bic_overall.py` →
`backend/metrics/gmm_bic_aic_overall.png`.

**Per food**, for where that headline number comes from: the elbow lands at k=4 (orange,
mango, okra), k=5-6 (tomato, eggplant, papaya, potato, apple, cucumber, capsicum), k=7
(banana) and k=10 (bitter gourd, the food with the fewest labelled photos). Chart:
`python backend/plot_gmm_bic.py` → `backend/metrics/gmm_bic_aic.png`/`.json`.

Either way, that is *more* components than the 3 label-anchored tiers this project ships
with — reported honestly rather than cropped to look like confirmation. It is not a
contradiction: a label-blind statistical fit is answering "how many Gaussian blobs does
this colour data support in general" (lighting, ripeness shades, patch variation and all),
not "how many *freshness stages* matter to a user" — a narrower, practical question this
project answers with labelled data instead (see the section above), consistent with the
earlier finding that a fully unsupervised fit does not recover the fresh/rotten split at
all.

What it does **not** know: how old the food is, how it smelled, or what is inside a package, and
for foods where the colour shift is subtle it is a genuinely weaker signal than the CNN it
replaced (which was 99.2% on the same held-out split — see `backend/README.md`'s Evaluation
section for that retired comparison). That is why the app never lets this decide alone: its
reading is one of four inputs to the risk score, next to the expiry date, the time-temperature
estimate and whether the food is stored correctly. The visible-indicator bars (mould, moisture,
texture, discoloration) are computed from image statistics and scaled by its rotten probability;
they are a supporting display, not a separate model.

### Variety (e.g. Fuji vs. Gala apple): a separate question from freshness

Asked to add apple varieties, the natural-sounding approach — a Gaussian component per
variety, the way freshness is modelled — doesn't work for the same reason a pooled,
all-foods freshness mixture didn't: no public dataset labels a photo with both a
cultivar *and* a fresh/rotten state, so there is no combined ground truth to fit a
"fresh Fuji" component to. Variety is instead answered by a second, independent CNN
classifier (same YOLOv8n-cls tool as food identity, a different question), trained on
AFVC (Apple Fruit Varieties Collection, academic use — see `backend/README.md`) for
the five varieties actually sold as imported apples in Philippine groceries: Fuji,
Gala, Granny Smith, Red Delicious and Golden Delicious. ("Washington Apple" is not
itself a cultivar — a US regional/marketing label historically tied to Red Delicious
— so it is covered by that mapping rather than treated as a sixth class.) It never
feeds the freshness verdict, and every other food simply has no variety classifier
yet, so the response reports no variety for them — the same way a food with no
dedicated freshness mixture falls back gracefully rather than erroring. See
`backend/variety.py`, `build_apple_varieties.py`, `train_apple_variety.py`. Measures
93.1% top-1 accuracy on AFVC's own 175-photo held-out test split — a much easier
visual task than judging spoilage, so a higher number than the freshness GMM gets,
though on clean studio photos rather than real-world phone photos.

---

## C. YOLOv8: food / object detection

| Item | Status | Where / evidence |
| --- | --- | --- |
| YOLOv8 model configured | Done | `yolov8n.pt` base weights; `backend/pipeline.py` |
| Detection dataset / annotations prepared | Done, with a limit | `backend/build_detection_dataset.py`: frames composed from real food photos with **exact** boxes. Not hand-drawn on real multi-food photographs, see limits |
| Food classes defined | Done | 12 foods (`Datasets/.../eref_detect_v1/data.yaml`); freshness stays with the Gaussian Mixture Model stage |
| Model training / fine-tuning implemented | Done | `backend/train_detector.py`; weights `runs/detect/eref_detector_v1/weights/best.pt` |
| Bounding-box detection implemented | Done | `FoodPipeline._detect_foods`, `boxes` in the response |
| Confidence threshold defined | Done | Detection `OBJECT_CONF = 0.30`; boxes overlapping more than `OBJECT_IOU = 0.5` are merged; identity review thresholds 0.90 / 0.60 |
| Multiple food objects can be detected | Done | Up to 8 per frame; each classified on its own crop (`TC-F-DET-10…12`) |
| Detected objects displayed in the app | Done | Boxes drawn on the photo, coloured by result (green fresh, red rotten, amber unsure), and a list of every food found |
| Detection results connected to the inventory | Done | Tick the foods to keep and **Add N to Shelf** creates one shelf item per food, each with its history note |
| Real camera / image input gives detections | Done | `TC-F-DET-10…12` send frames built from real photos to the live API |
| False and missed detections considered | Done, with a limit | Measured in `backend/metrics/detector_metrics.json` (see "Measured results"); a box the CNN disagrees with is flagged; if the detector finds nothing the whole-frame CNN result is used |

### Explaining the difference: CNN classification vs YOLOv8 detection

- **Classification** answers "what is in this picture?" with one label for the whole image. It
  cannot say where the food is, and it has to pick one answer even when the frame holds three foods.
- **Detection** answers "which objects are in this picture, and where?" It returns a box, a label
  and a confidence for every object, so it can find a tomato, a banana and an eggplant in the same
  photo.

E-REF uses both because they do different jobs: YOLOv8 finds and boxes each food, then each box
is classified (what it is, by the identity CNN, and whether it is fresh, by a Gaussian Mixture Model).
The detector's own label is compared with the identity CNN's; when they disagree, the item is
flagged for the user to confirm.

---

## D. Greedy algorithm: food prioritisation

| Item | Status | Where / evidence |
| --- | --- | --- |
| Prioritisation criteria defined | Done | Weighted risk: expiry urgency 0.30, time-temperature indicator 0.30, GMM spoilage 0.25, storage mismatch 0.15 (`services/riskScore.js`); a spoilage reading of 0.8 or more overrides the rest |
| Food items represented as input | Done | Enriched inventory items with `riskScore`, `estimatedDaysLeft` |
| Expiration / shelf life considered | Done | Printed date and the TTI estimate both feed the risk |
| Spoilage level considered | Done | The GMM's rotten probability |
| Other priority factors defined | Done | Storage mismatch; frozen food is discounted (its spoilage floor still applies) |
| Priority score implemented | Done | `computeWeightedRisk` |
| Greedy selection implemented | Done | `prioritizeByGreedy`: repeatedly take the highest-risk item left |
| Highest-priority item identified | Done | Rank 1 in the **Use First** list; "Soon to spoil" card |
| List sorted / selected by the algorithm | Done | `priorityRank` 1…n, with the reasons each item is where it is (`explainPriority`) |
| Ties handled | Done | Equal risk → fewer days left → name, so the order is always the same (`features-test.js`) |
| Empty inventory / no eligible item | Done | Empty list, and the Home screen says why |
| Result displayed to the user | Done | Home → **Use First**, Alerts, and the greedy meal plan under **Use It Up** |
| Real inventory data used | Done | Runs on the live, synced inventory; used-up and discarded items are excluded |

### Critical question: "What makes your algorithm greedy, and what decision does it make at each step?"

At each step it looks at the items still unranked, takes the one with the **highest risk right
now**, puts it next in the list and never revisits that choice; then it repeats on what remains.
It makes the locally best choice each time without planning ahead, which is what "greedy"
means. For a plain ranking this gives the same result as sorting by risk, and the property is
tested directly: at every step the pick is the riskiest item still left.

The second greedy step in the app is less trivial: **Use It Up** is a greedy weighted set cover.
The universe is the at-risk food (each item weighted by its risk). At each step it picks the
recipe with the best ratio of newly rescued risk to ingredients still to buy, removes what that
recipe uses, and repeats, so a few meals cover most of what is about to spoil. Greedy is the
standard approximation for set cover, and it is fast enough to run on every screen refresh.

---

## E. Content-based recommendation: food recommendation

| Item | Status | Where / evidence |
| --- | --- | --- |
| Food / item feature dataset defined | Done | 36 recipes (`mobile/data/recipes.js`, 15 Filipino) over the food catalog |
| Food attributes identified | Done | The food itself, its category, and how it is cooked or eaten (bake, fry, raw, blend, stew, pickle) |
| User preference / profile represented | Done | `taste` (liked foods, avoided foods, diet, cooking history) stored per account (`services/storage.js`), edited on the Recipes screen |
| Feature extraction implemented | Done | `recipeFeatures`, `itemFeatures` in `services/contentBased.js` |
| Feature vector implemented | Done | TF-IDF-weighted sparse vectors |
| Similarity computation implemented | Done | Cosine similarity |
| Recommendation ranking implemented | Done | `0.5 × similarity + 0.3 × coverage of at-risk food + 0.2 × availability` |
| Top recommendations displayed | Done | Recipes screen (with match %, reasons and ingredients), Home → Use It Up, item-level suggestions |
| Based on item and user features | Done | The profile mixes the shelf (weighted by urgency), liked foods and cooking history |
| Previously viewed / selected food influences it | Done | Opening, saving or cooking a recipe pulls similar recipes up (cooking counts most, older actions fade with a 21-day half-life); "Not for me" removes a recipe |
| No-match case handled | Done | Empty shelf, no recipe for the food, or preferences ruling out every match each get their own message, plus ideas from the user's taste |
| Integrated with inventory / prioritisation | Done | Ranking uses each item's risk; "I cooked this" marks the used items as used up, which feeds the history |

*Limit:* the weights 0.5 / 0.3 / 0.2 were set by design, not tuned on user data, since there is
no usage data yet.

---

## G. Mobile application functionality

| Item | Status | Evidence |
| --- | --- | --- |
| Camera works | Done | `expo-image-picker`; permission handling and error alerts (`smoke-test.js` renders the flow). Photographing was not tried on a physical phone in this test environment |
| Image upload works | Done | Multipart upload to `/predict` and `/ocr` (`TC-F-CNN-*`, `TC-F-OCR-*`) |
| Food detection works | Done | `TC-F-DET-10…13` |
| Spoilage classification works | Done | `TC-F-CNN-01…07` |
| Food inventory can be updated | Done | Add (scan or by hand), move storage, freeze, edit the date, mark used, discard, put back |
| Priority list is displayed | Done | Home → Use First (`features-test.js`) |
| Recommendations are displayed | Done | Recipes screen, Home, scan result |
| Notifications / alerts work | Done, with a limit | Planned and scheduled correctly against a mocked device (`context-test.js`); delivery on a real phone still has to be confirmed with **Profile → Send a test alert**. Expo Go's notification support differs from a real build |
| User can view food history | Done | Profile → History |
| Dashboard reflects current inventory | Done | Home totals, priority list and categories all read the live inventory |
| Basic error handling | Done | Server unreachable (names the address it tried), expired session (signs out), offline (queues changes), bad photos (rejected cleanly), low-confidence results, invalid form input |

---

## Measured results

**Food detector** (`backend/evaluate_detector.py` → `backend/metrics/detector_metrics.json`,
shown in the app under Model Performance). Fine-tuned YOLOv8n, 15 epochs, 12 foods.

| Measurement | Result |
| --- | --- |
| mAP@0.5 on 300 composed test frames (synthetic, so the friendliest) | 97.4% (precision 96.2%, recall 94.4%) |
| Frames where the number of boxes equals the number of foods | 99.7% (100% within one) |
| Real single-food photos: food found / best box is the right food | 99.7% / 95.3% |
| Missed detections on those real photos | 0.3% |
| False boxes on non-food objects | 7.3% |
| False boxes on foods never trained on | 58.0% |

**Confidence** (`backend/calibrate.py` → `backend/metrics/confidence_calibration.json`, also in
the app). The thresholds 0.90 and 0.60 come from this table:

| Identity confidence at least | Same-collection photos accepted | Plain cut-outs accepted (accuracy) | Unseen foods wrongly named |
| --- | --- | --- | --- |
| 0.60 | 99.6% | 84.8% (50.6%) | 50.0% |
| 0.90 | 98.6% | 53.8% (59.3%) | 30.0% |

On foods the model knows, it is right about 99.9% of the time at any confidence, so thresholds cost
little there. They cut confident mistakes on unseen foods from 64% to 30%, but they are a weak
signal on plain-background photos, which is why the app adds a confirm-and-correct step.

---

## Known limits

These are the honest gaps. None of them is hidden in the app; several are shown on screen.

1. **The detector is trained on composed frames, and it does not know what a non-food fruit is.**
   58% of photos of foods it was never trained on still get a box.  Boxes are exact, but the frames are built from
   single-food photos on plain backdrops. Its scores on those frames are the most optimistic
   numbers in this project; the real-photo and false-detection rates in the detector report are
   the ones to quote. A hand-annotated set of real multi-food photographs would be the next
   improvement.
2. **Foods the models never saw are still sometimes named.** On foods outside the twelve, the
   identity model names one of them with high confidence a meaningful share of the time (see the
   Model Performance screen). Thresholds reduce it, and the confirm-and-correct step catches the
   rest, but neither removes it. Training on more foods is what fixes it.
3. **Plain-background product photos are a weak spot**, as `backend/README.md` explains.
4. **Scanning needs the server.** The models run on your PC and the phone reaches them over the
   local network; there is no offline scanning. Everything else (shelf, alerts, recipes,
   history) works offline and syncs later.
5. **Notifications have not been observed on hardware here.** The scheduling logic is tested;
   delivery depends on the phone's permissions and, in Expo Go, on Expo's limits.
6. **Plain HTTP on a local network.** Fine for a lab or home network; anything wider needs HTTPS.
7. **Admin changes are last-writer-wins** and are not versioned per food.
8. **Recipes and the weights** are hand-authored; there is no usage data to tune them yet.
9. **Dataset licences.** The mango dataset is non-commercial (see `backend/README.md`).

---

## Test suites

| Suite | Command | What it covers |
| --- | --- | --- |
| Backend | `python -m pytest backend/tests -v` | Accounts, inventory, OCR, CNN, detection, admin and food database, and non-functional cases (speed, reliability, security, usability) |
| App logic and screens | `cd mobile && node scripts/smoke-test.js` | Every screen renders; TTI, risk, OCR parsing, notifications and sync logic; live-server checks |
| Checklist features | `node scripts/features-test.js` | Greedy prioritisation, recommender and taste, food database overlay, scan-result review, several foods in one photo, manual entry, and the History / Recipes / Admin / Home screens |
| Dark mode and design | `node scripts/theme-test.js` | Every screen (including the new ones and each scan-result state) in light and dark |
| Real provider | `node scripts/context-test.js` | Session, sync, offline, used-up food and history, taste, the food database, notifications, against the live server |
