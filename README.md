# DEVELOPMENT OF E-REF: A MOBILE-BASED FOOD SPOILAGE MONITORING AND PRIORITIZATION SYSTEM USING CONVOLUTIONAL NEURAL NETWORK, GREEDY ALGORITHM, AND CONTENT BASED RECOMMENDATION ALGORITHM 

### Intelligent Real-Time Food Monitoring and Prioritization System

E-REF is a mobile-based food monitoring and inventory management system designed to help restaurants and food-service businesses monitor food freshness, identify potential spoilage risks, prioritize food items, and reduce unnecessary food waste.

The system combines food image analysis, OCR-based information extraction, time-temperature shelf-life estimation, risk prioritization, and content-based recommendations into a single mobile application.

---

## About the Project

Food spoilage and poor inventory management can lead to unnecessary food waste, financial losses, and inefficient food handling in restaurant operations.

E-REF was developed as a technology-assisted solution for monitoring food items throughout their storage period. Instead of relying entirely on manual inspection and inventory records, the system provides automated analysis and recommendations to help users determine which food items require immediate attention.

The application allows users to register or scan food items, record their storage conditions, analyze their condition, estimate remaining shelf life, calculate spoilage risk, and receive recommendations for proper storage and food utilization.

---

## Requirements checklist

[docs/REQUIREMENTS_CHECKLIST.md](docs/REQUIREMENTS_CHECKLIST.md) goes through every module and every
CNN, YOLOv8, greedy and content-based item: where it is implemented, which test or measurement
backs it, what falls short, and plain-language answers to the questions an adviser is likely to ask.

---

## Objectives

E-REF aims to:

- Monitor food inventory and storage information.
- Identify food items that are approaching spoilage.
- Analyze visible spoilage indicators from food images.
- Extract relevant information from food packaging.
- Estimate remaining shelf life based on storage conditions.
- Prioritize food items according to spoilage risk and urgency.
- Recommend appropriate storage conditions.
- Provide food usage and recipe recommendations.
- Help reduce food waste in restaurant operations.

---

## Key Features

### Food Inventory Management
- Add food items by scanning a photo, or by hand when there is no photo.
- Record food category and storage location; move food between locations, freeze it, correct its
  expiry date, mark it as used, or discard it.
- Monitor remaining shelf life.
- Search the shelf by name, storage or category, and filter it by category.
- Track food items that require immediate attention.

### History
**Profile → History** lists everything that has happened to the food you track (scanned, moved,
frozen, date changed, used up, discarded, put back) and, on a second tab, what was used versus
thrown away, with the share that was used rather than wasted. Food you use up or discard leaves
the shelf but stays in the history, and can be put back.

### Food Scanning
Users can capture a food package image using the device camera or select an image from the gallery.

The scanning workflow provides information that can be used for subsequent food analysis and inventory registration.

### OCR Information Extraction
Photograph a package label (or pick one from the gallery) and the server reads the
printed text with an on-device-class OCR model (RapidOCR, CPU only). The app then
pulls out the expiry and manufacturing dates, handling formats such as `EXP 15/09/2026`,
`BEST BEFORE 15 SEP 2026`, `15SEP26`, `09/2026` and misread digits (`15/O9/2O26`).
Both dates are shown in words ("Expires 15 Sep 2026") so a day/month mix-up is easy to
spot, and the text stays editable.

The app never invents a date. A photo with no label, or a scan with no label text,
reports no dates, and the shelf-life estimate then relies on storage conditions alone.

### Food Identification and Freshness Detection

A captured image runs through a three-stage pipeline on the backend:

1. **YOLOv8 detection** finds every food in the frame and boxes it. A YOLOv8n model fine-tuned on
   the 12 foods does this (`backend/train_detector.py`); the COCO model is the fallback.
2. **A CNN classifier** identifies the food from the full image: one of 12 food
   types — apple, banana, orange, tomato, potato, cucumber, capsicum, okra,
   bitter gourd, mango, papaya and eggplant, the last three added from separate
   public datasets to cover fruits and vegetables common in Philippine kitchens
   — or "not one of the supported foods" for anything else.
3. **A second CNN** decides whether that food is fresh or rotten.

**Detection and classification do different jobs.** The CNN says *what a photo is*: one answer per
image. The detector says *which foods are in the frame and where*. A photo with several foods is
handled by boxing each one and running the CNNs on each crop, so the result screen draws a box
around every food (green fresh, red rotten, amber unsure), lists them, and adds the ticked ones to
the shelf in one step. A single food keeps the detailed result screen.

Identity always comes from the CNN, and the result screen shows whether the detector and the CNN
agree. (The original COCO detector only knows apple, orange and banana and labelled a tomato as an
apple or a donut; feeding its crops to the CNNs cut rotten-tomato accuracy from 100% to 55%, which
is why the fine-tuned detector was needed before crops could be classified.)

**Low confidence is handled, not hidden.** Every result says how sure the models are. Above 90%
it is shown as confident; between 60% and 90% the app asks you to check it; below 60% (or for a
food outside the twelve) it cannot be saved until you pick the right food from the runner-up
guesses or the full list. Every correction is written into the item's history. The thresholds come
from a measurement on held-out photos (`backend/calibrate.py`), not a rule of thumb.

After the models run, the system measures the visible spoilage indicators from
the study design:

- Discoloration
- Texture abnormalities
- Packaging damage
- Mold spots
- Excess moisture

### Model Performance

The app reports the measured accuracy, precision, recall and F1 of each model
under **Profile → Model Performance**, including per-class scores and the
fresh/rotten outcome breakdown.

| Task | Accuracy | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| Food identification | 99.89% | 99.81% | 99.77% | 99.79% |
| Freshness detection | 99.20% | 99.14% | 99.22% | 99.18% |
| Combined identity + freshness | 99.36% | 99.01% | 99.11% | 99.05% |

Measured over 2,996 images the models have not trained on, spanning all 12 foods;
precision, recall and F1 are macro-averaged. Regenerate with
`python backend/benchmark.py`.

**These numbers are the friendliest of the tests the app runs**, because the
held-out images come from the same collections as training, just never-seen
photos within them. The Model Performance screen also shows four tougher,
independent checks — images from entirely separate collections:

| Check | Food identification | Freshness |
| --- | --- | --- |
| Original dataset's own unseen apple/banana/orange photos | 100% | 100% |
| Fresh vs rotten beef, a separate photo collection | — | 99.6% |
| Foods never trained on (persimmon, pear, grape, corn…), correctly called "unknown" | 34.9% | — |
| Cut-out product photos on a plain white background | 44.3% | — |

The last two are real weaknesses, not polish items. The model is frequently
**confident but wrong** on food it has never seen — an unfamiliar fruit at high
confidence reads as one of the 12 known foods rather than "unknown" — and a plain
white background is a different-enough look that several foods are misidentified
there. Adding mango, papaya and eggplant gave the model more label space to fall
back on, which nudged the unknown-food score up but pulled the white-background
score down, since a plain-background photo of an existing food now has more ways
to land on a food that wasn't in the vocabulary before. Both would need more
training data in those specific conditions to fix. A confidence threshold helps only partly
(measured in `backend/calibrate.py`): on foods never seen it cuts the confident mistakes
from 64% to 30% at a 0.90 threshold, but on plain-background photos it flags many correct
answers and still lets many wrong ones through, so the app never trusts confidence alone:
below 90% it asks the user to confirm, and it shows the runner-up foods to correct a wrong answer.

### Shelf-Life and TTI Estimation
The system estimates the remaining usable life of a food item based on factors such as:

- Food type
- Storage location
- Storage temperature
- Nominal shelf life
- Temperature sensitivity

### Risk Prioritization (Greedy)
Each item's risk combines its expiry date (30%), the time-temperature estimate (30%), the CNN's
spoilage reading (25%) and whether it is stored correctly (15%); visible spoilage of 80% or more
overrides the rest. A greedy algorithm then ranks the shelf: it takes the item with the highest risk,
commits to it, and repeats on what is left. Ties go to the item with fewer days left, then to the name,
so the order is always the same. The **Use First** list on the Home screen shows the ranking with the
reason for each place (days left, "looks spoiled", "not in its best storage"), and used-up or discarded
food is never ranked.

### Content-Based Recommendations
Recipes are recommended with content-based filtering. Every recipe (36 dishes, 15 of them
Filipino) and every inventory item is described by the same features: the food, its
category, and how it is cooked or eaten. Features are weighted by TF-IDF, the user's
profile is the sum of their items weighted by spoilage risk, and recipes are ranked by

    score = 0.5 * cosine(profile, recipe) + 0.3 * coverage + 0.2 * availability

where coverage is how much of the at-risk food the recipe uses up and availability is
how much of it can be cooked without shopping. The top matches appear under "Usage
Ideas" on a scanned item, alongside rule-based actions (discard, inspect, consume,
freeze, refrigerate) and storage and preservation tips.

**It learns what you like.** The profile also carries the foods you say you like and the recipes you
open, save or cook (cooking counts most, and older actions fade with a 21-day half-life), so recipes
similar to what you cook rise. Foods you avoid, a vegetarian diet, and recipes you mark "Not for me"
remove recipes outright. The **Recipes** screen (Profile → Recipes & Taste, or tap a meal on Home)
shows the ranking with a match score and the reasons for each recipe ("Uses your Tomato (1 day
left)", "Similar to Adobo, which you cooked"), and "I cooked this" marks the ingredients as used up.
When nothing matches it says why (empty shelf, no recipe for that food, or your preferences rule
everything out) and offers ideas from your taste.

### Use It Up (Greedy Meal Plan)
The Home screen turns the food closest to spoiling into a short meal plan using a
greedy weighted set cover: each round it picks the recipe that rescues the most
remaining risk per ingredient still to buy, removes what that recipe uses, and repeats.
It reports how much of the at-risk food the plan uses up.

### Admin and the Food Database
The app ships with a catalog of foods (shelf life, Q10, best storage, freezing, tips). An
administrator (**Profile → Admin**) can correct any of them or add a food; every phone merges the
server's entries over its bundled catalog when it starts and whenever they change, and keeps the last
copy for offline use. Administrators also see every account and can grant or remove administrator
access. The first account on a fresh install is the administrator; on an existing install the oldest
account is promoted when the database is upgraded; `EREF_ADMIN_EMAILS` names more.

### Accounts and Sync
- Sign up, sign in, sign out and an email-code password reset, all against the server.
  Passwords are hashed with scrypt, sessions are signed tokens kept in the phone's
  keychain, repeated failed logins lock the account for 15 minutes, and the reset reply
  never reveals whether an email is registered.
- Each user's inventory is stored on the server and cached on the phone. The app opens
  straight into the cached shelf, works offline, and queues changes to send when the
  connection returns. Signing in on another phone brings the shelf back.

### Notifications
The app schedules real device notifications: a warning a chosen time before an item
runs out (12, 24, 48 or 72 hours), one at the moment it expires, and an immediate alert
for anything already expired or critical (at most once a day per item). Alerts are held
back overnight (10 pm to 7 am), capped at the iOS limit of 64, cancelled when an item is
frozen, discarded or the user signs out, and can be tested from **Profile**.

### Appearance
The whole app, including sign-in and password reset, shares one design (cream and brown,
card-coloured fields, rounded corners), in a light and a dark theme. **Profile → Appearance**
offers System, Light and Dark; System follows the phone and the choice is remembered.

Dark colours are derived from the light design rather than kept as a second copy: a few core
colours (page, card, text, brand) have designed dark values, and every other colour has its
perceptual lightness inverted with its hue kept, while saturated accents (amber, green, red)
stay vivid. Screens draw with themed versions of the React Native components
(`mobile/components/themed.js`), so text with no colour of its own is never black on a dark
background. The dark logo sits on a light badge, and photo overlays keep their own colours.

### Dashboard and Monitoring
The application provides an overview of:

- Food inventory
- Categories
- Items approaching spoilage
- Risk levels
- Storage information
- Food recommendations

---

## System Workflow

```text
Food Item
    │
    ▼
Scan / Register Food
    │
    ├── OCR ─────────────► Expiry & manufacturing dates
    │
    └── Food Image
            │
            ▼
    YOLOv8 Detection ────► Food location + cross-check
            │
            ▼
    CNN Identification ──► Food type
            │
            ▼
    CNN Freshness ───────► Fresh or rotten
            │
            ▼
    Shelf-Life Estimation (TTI)
            │
            ▼
       Risk Scoring
            │
            ▼
    Food Prioritization (Greedy)
            │
            ▼
 Recommendations
    ├── Storage
    ├── Usage
    └── Recipe Ideas
```

---

## Running the System

The models run on a backend the phone reaches over the LAN.

**1. Start the API**

```powershell
cd C:\Users\Lathrell\Downloads\EREF
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\evaluate.py                 # generates the metrics report
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

Accounts and inventory are stored in `backend/data/eref.db` (created on first run, not
committed). Password-reset codes are written to the server log unless SMTP is configured
(see [backend/README.md](backend/README.md)); for a demo on a phone, start the server with
`$env:EREF_DEV_RETURN_CODE = "1"` before the command above to also see the code in the
API reply during testing.

**2. Start the app**

```powershell
cd mobile
npm install
npm start
```

`npm start` detects the PC's LAN address and points the app at
`http://<LAN_IP>:8000`. If the phone is on a different subnet, override the
address under **Profile → Model Server**.

**3. Verify everything works**

```powershell
python -m pytest backend\tests -v           # server: functional + non-functional test cases
cd mobile
npm test                                    # app: screens, algorithms, sync, notifications
```

`npm test` renders every screen and checks the shelf-life, risk, prioritisation, OCR
parsing, recommender, notification and sync logic. A features test covers the checklist items
directly: greedy ranking (ties, empty shelf), the recommender with taste and history, the food
database, low-confidence review, several foods in one photo, adding food by hand, and the
History, Recipes, Admin and Home screens. A theme test then renders every screen
in light and in dark and audits the result (94 checks): no light surface may survive in
dark mode, and dark mode may never make text or an icon harder to read than it already was
in light. It then runs real images through the
live API, and mounts the real inventory provider to test sign-up, sync, offline use, an
expired session and notification scheduling against the running server.

The backend suite maps to the study's testing objective: each test's name carries its
case ID (`TC-F-*` functional, `TC-NF-*` performance, reliability, security, usability),
and measured response times are written to `backend/metrics/nfr_report.json`.

### What this does not cover

- Notifications are scheduled on the device. There is no remote push from the server,
  and Expo Go's notification support differs from a development build, so confirm on your
  own phone with **Profile → Send a test alert**.
- Scanned photos stay on the phone that took them; other devices see the item's details
  but not its picture.
- Real email needs SMTP settings; without them the reset code appears in the server log.
- Usability (for example a SUS questionnaire) needs real participants and is not
  automated.

See [backend/README.md](backend/README.md) for the model, endpoint and
evaluation details.
