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
- Add food items to the inventory.
- Record food category and storage location.
- Monitor remaining shelf life.
- View inventory by category.
- Track food items that require immediate attention.

### Food Scanning
Users can capture a food package image using the device camera or select an image from the gallery.

The scanning workflow provides information that can be used for subsequent food analysis and inventory registration.

### OCR Information Extraction
The system can process food-label information to identify relevant dates and text from packaging.

Extracted information can be used as part of the food item's shelf-life and risk assessment.

### Food Identification and Freshness Detection

A captured image runs through a three-stage pipeline on the backend:

1. **YOLOv8 detection** locates the food in the frame.
2. **A CNN classifier** identifies the food from the full image: one of 12 food
   types — apple, banana, orange, tomato, potato, cucumber, capsicum, okra,
   bitter gourd, mango, papaya and eggplant, the last three added from separate
   public datasets to cover fruits and vegetables common in Philippine kitchens
   — or "not one of the supported foods" for anything else.
3. **A second CNN** decides whether that food is fresh or rotten.

Identity always comes from the CNN. The detector is COCO-pretrained and only
knows apple, orange and banana, so it labels a tomato as an apple, orange or
donut. Both CNNs therefore read the full image rather than the detector's crop
(cropping cut rotten-tomato accuracy from 100% to 55%), and the result screen
shows whether the detector and the CNN agree.

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
training data in those specific conditions to fix; raising a confidence threshold
does not help — it was tested and rejects almost as many correct answers as wrong
ones.

### Shelf-Life and TTI Estimation
The system estimates the remaining usable life of a food item based on factors such as:

- Food type
- Storage location
- Storage temperature
- Nominal shelf life
- Temperature sensitivity

### Risk Prioritization
Food items are ranked according to their estimated spoilage risk and urgency.

This allows users to identify which items should be used, moved, or inspected first.

### Content-Based Recommendations
E-REF provides recommendations based on the characteristics of the food item.

Examples include:

- Suggested food usage
- Recipe or meal ideas
- Storage recommendations
- Actions for items approaching spoilage

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

**1. Start the inference API**

```powershell
cd C:\Users\Lathrell\Downloads\EREF
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\evaluate.py                 # generates the metrics report
uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

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
cd mobile
npm test
```

This renders every screen, checks the shelf-life, risk, prioritisation and OCR
logic, and runs real images through the live API end to end.

See [backend/README.md](backend/README.md) for the model, endpoint and
evaluation details.
