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
| Food spoilage monitoring | Done | CNN reading + time-temperature indicator + expiry + storage → weighted risk (`services/riskScore.js`) | `smoke-test.js` (risk), `features-test.js` |
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

## B. CNN: food spoilage classification

| Item | Status | Where / evidence |
| --- | --- | --- |
| Food image dataset prepared | Done | `backend/build_dataset.py` assembles 12 foods from several collections; sources and licences in `backend/README.md` |
| Images categorised by food / spoilage class | Done | Folders `fresh_<food>`, `rotten_<food>` for 12 foods, plus `other` (25 classes) |
| Image preprocessing | Done | Photos are downscaled to at most 384 px for training. The model resizes every image to 224 × 224 and scales pixel values to 0–1. Uploads are also turned upright from their EXIF flag before analysis (`TC-F-DET-16`), and training uses flips, colour jitter, scaling and random erasing |
| Resizing / normalisation | Done | As above (`train.py`, Ultralytics classification transforms) |
| Training and validation set defined | Done | `train` / `val` / `test` splits, plus five collections held out entirely (`backend/README.md`, Training) |
| CNN architecture implemented | Done | YOLOv8n-cls (convolutional backbone with a classification head); MobileNetV2 as a fallback freshness model |
| Model training implemented | Done | `backend/train.py` (resumable) |
| Classification / prediction implemented | Done | `backend/pipeline.py`, `POST /predict` |
| Spoilage classes defined | Done | Fresh / rotten, per food, plus `other`; visible indicators (discoloration, mould, texture, moisture, packaging) |
| Prediction confidence displayed | Done | Scan result: "95% sure of the food", a 0-100% freshness reading split into **Fresh (70-100%)**, **Sub Fresh (30-69%)** and **Rotten (0-29%)** (`freshness_tier`, `backend/pipeline.py`), runner-up guesses when unsure, and the **Model Performance** screen (`features-test.js`) |
| Model integrated into the mobile app | Done, with a limit | The app calls the model server on your network; the models do not run on the phone. Scanning needs the server reachable |
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
them; see "Known limits" for the numbers.

### Adviser check: "How does your CNN determine whether a food item is spoiled?"

A convolutional network looks at the photo through many small filters. The first layers respond
to simple patterns (edges, colour patches); deeper layers combine them into things like the
mottled dark spots of a rotting banana, the fuzzy texture of mould or the wrinkled skin of an old
tomato. It was trained on about 26,000 labelled photos (fresh or rotten, for 12 foods), adjusting
its filters until its answers matched the labels, and it ends in a layer that turns the evidence
into a probability for each class.

To decide, the app takes two opinions and blends them: a dedicated fresh-versus-rotten network
(weight 0.65) and the rotten share of the food-identity network's probabilities (weight 0.35).
If the blended probability of "rotten" is 0.5 or more, the item is called rotten, and the
confidence shown is the probability of the side that won.

What it does **not** know: how old the food is, how it smelled, or what is inside a package. It
judges appearance only. That is why the app never lets the CNN decide alone: its reading is one of
four inputs to the risk score, next to the expiry date, the time-temperature estimate and whether
the food is stored correctly. The visible-indicator bars (mould, moisture, texture, discoloration)
are computed from image statistics and scaled by the CNN's rotten probability; they are a
supporting display, not separate network outputs.

---

## C. YOLOv8: food / object detection

| Item | Status | Where / evidence |
| --- | --- | --- |
| YOLOv8 model configured | Done | `yolov8n.pt` base weights; `backend/pipeline.py` |
| Detection dataset / annotations prepared | Done, with a limit | `backend/build_detection_dataset.py`: frames composed from real food photos with **exact** boxes. Not hand-drawn on real multi-food photographs, see limits |
| Food classes defined | Done | 12 foods (`Datasets/.../eref_detect_v1/data.yaml`); freshness stays with the CNN |
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

E-REF uses both because they do different jobs: YOLOv8 finds and boxes each food, then the CNNs
classify each box (what it is, and whether it is fresh). The detector's own label is compared with
the CNN's; when they disagree, the item is flagged for the user to confirm.

---

## D. Greedy algorithm: food prioritisation

| Item | Status | Where / evidence |
| --- | --- | --- |
| Prioritisation criteria defined | Done | Weighted risk: expiry urgency 0.30, time-temperature indicator 0.30, CNN spoilage 0.25, storage mismatch 0.15 (`services/riskScore.js`); a spoilage reading of 0.8 or more overrides the rest |
| Food items represented as input | Done | Enriched inventory items with `riskScore`, `estimatedDaysLeft` |
| Expiration / shelf life considered | Done | Printed date and the TTI estimate both feed the risk |
| Spoilage level considered | Done | The CNN's rotten probability |
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
