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

### CNN-Based Food Analysis
E-REF incorporates a Convolutional Neural Network (CNN) component for image-based food analysis.

The system can analyze food identity and visible spoilage indicators such as:

- Discoloration
- Texture abnormalities
- Packaging damage
- Mold spots
- Excess moisture

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
    ▼
Food Information Extraction
    │
    ├── OCR
    │
    └── Food Image Analysis
            │
            ▼
       CNN Analysis
            │
            ▼
    Shelf-Life Estimation
            │
            ▼
       Risk Scoring
            │
            ▼
    Food Prioritization
            │
            ▼
 Recommendations
    ├── Storage
    ├── Usage
    └── Recipe Ideas
