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
2. **A CNN classifier** identifies the food from the full image, across 9 food types.
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
| Food identification | 99.33% | 99.41% | 99.24% | 99.32% |
| Freshness detection | 99.74% | 99.77% | 99.70% | 99.74% |
| Combined identity + freshness | 99.18% | 99.38% | 99.08% | 99.22% |

Measured over 2,698 images the models have not trained on; precision, recall and
F1 are macro-averaged. Regenerate with `python backend/evaluate.py`.

**These scores cover only apple, banana and orange.** The dataset's validation
folder shares most of its images with the training folder (and `Test/` is a copy of
`val/`), so 4,040 of its 6,738 images were excluded as duplicates of training
images. Every validation image of bitter gourd, capsicum, cucumber, okra, potato and
tomato was among them, so for those six foods there is currently **no independent
measurement**. Testing on photos taken outside the dataset is needed before
trusting the app on them.

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
