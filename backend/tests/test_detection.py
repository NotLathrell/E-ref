"""Functional test cases: YOLOv8 detection of several foods, and the low-confidence review.

Tests that need the fine-tuned detector's weights skip, rather than fail, when they are not
on the machine (run ``backend/train_detector.py`` to create them).
"""

from __future__ import annotations

import pytest
from PIL import Image

from backend import pipeline
from backend.pipeline import FOOD_DETECTOR_PATH, FoodPipeline, assess_review

from .conftest import png_bytes, sample_image, upload

needs_detector = pytest.mark.skipif(not FOOD_DETECTOR_PATH.exists(), reason="fine-tuned food detector not trained")


def frame_of(*folders: str) -> Image.Image:
    """Real dataset photos placed side by side, one food each, on a plain backdrop."""
    tile = 416
    canvas = Image.new("RGB", (tile * len(folders), tile), (232, 226, 214))
    for index, folder in enumerate(folders):
        photo = Image.open(sample_image(folder, index + 2)).convert("RGB")
        photo.thumbnail((tile - 30, tile - 30))
        canvas.paste(photo, (index * tile + (tile - photo.width) // 2, (tile - photo.height) // 2))
    return canvas


# ------------------------------------------------------------ review (no models)
def test_TC_F_DET_01_a_confident_known_food_needs_no_confirmation():
    review = assess_review(0.97, "tomato", 0.99)
    assert review == {"level": "high", "needsConfirmation": False, "reasons": []}


def test_TC_F_DET_02_a_moderately_confident_food_is_medium_and_needs_checking():
    review = assess_review(pipeline.UNSURE_IDENTITY + 0.05, "tomato", 0.99)
    assert review["level"] == "medium" and review["needsConfirmation"] and review["reasons"]


def test_TC_F_DET_03_a_low_confidence_or_unrecognised_food_is_low():
    assert assess_review(pipeline.UNSURE_IDENTITY - 0.1, "tomato", 0.99)["level"] == "low"
    unknown = assess_review(0.99, None, 0.99)
    assert unknown["level"] == "low" and "supported" in unknown["reasons"][0]


def test_TC_F_DET_04_a_borderline_freshness_call_or_a_disagreeing_detector_adds_a_reason():
    borderline = assess_review(0.99, "tomato", 0.55)
    assert borderline["level"] == "high" and borderline["needsConfirmation"]
    assert "borderline" in borderline["reasons"][0]
    clash = assess_review(0.99, "tomato", 0.99, detector_agreement="differs")
    assert clash["needsConfirmation"] and "detector" in clash["reasons"][0]


def test_TC_F_DET_05_the_review_thresholds_are_ordered_and_come_from_the_calibration():
    assert 0 < pipeline.UNSURE_IDENTITY < pipeline.CONFIDENT_IDENTITY < 1
    import json

    from .conftest import ROOT

    calibration = ROOT / "backend" / "metrics" / "confidence_calibration.json"
    if not calibration.exists():
        pytest.skip("run backend/calibrate.py first")
    used = json.loads(calibration.read_text())["inUse"]
    assert used["confidentIdentity"] == pipeline.CONFIDENT_IDENTITY
    assert used["unsureIdentity"] == pipeline.UNSURE_IDENTITY


def test_TC_F_DET_06_crops_are_clamped_to_the_image_and_tiny_boxes_are_dropped():
    image = Image.new("RGB", (200, 100))
    crop = pipeline._crop(image, [-50, -20, 120, 300])
    assert crop is not None and crop.width <= 200 and crop.height <= 100
    assert pipeline._crop(image, [10, 10, 20, 20]) is None


def test_TC_F_DET_07_an_object_records_whether_the_detector_and_classifier_agree():
    identity = {"foodName": "tomato", "label": "fresh_tomato", "confidence": 0.95, "topK": []}
    freshness = {"freshness": "fresh", "confidence": 0.99, "probRotten": 0.01}
    agree = pipeline._object_entry(0, [0, 0, 50, 50], "tomato", 0.9, identity, freshness)
    assert agree["agreement"] == "agrees" and not agree["review"]["needsConfirmation"]
    clash = pipeline._object_entry(1, [0, 0, 50, 50], "mango", 0.9, identity, freshness)
    assert clash["agreement"] == "differs" and clash["review"]["needsConfirmation"]
    whole = pipeline._object_entry(2, [0, 0, 50, 50], None, None, identity, freshness, source="full-frame")
    assert whole["agreement"] is None


# ------------------------------------------------------------- API (models on disk)
def test_TC_F_DET_08_predict_reports_a_review_and_the_objects_in_the_frame(client):
    body = upload(client, "/predict", png_bytes(Image.open(sample_image("fresh_apples")).convert("RGB"))).json()
    assert body["review"]["level"] in ("high", "medium", "low")
    assert isinstance(body["review"]["reasons"], list)
    assert body["objectCount"] == len(body["objects"]) >= 1
    assert body["imageSize"][0] > 0 and body["imageSize"][1] > 0


def test_TC_F_DET_09_health_reports_the_food_detector(client):
    models = client.get("/health").json()["models"]
    assert "foodDetector" in models
    assert models["foodDetector"]["name"] == pipeline.FOOD_DETECTOR_NAME


@needs_detector
def test_TC_F_DET_10_several_foods_in_one_photo_are_found_and_boxed_separately(client):
    frame = frame_of("fresh_apples", "rotten_banana", "fresh_oranges")
    body = upload(client, "/predict", png_bytes(frame)).json()

    assert body["detection"]["model"] == pipeline.FOOD_DETECTOR_NAME
    assert body["objectCount"] >= 2
    width, height = body["imageSize"]
    for found in body["objects"]:
        x1, y1, x2, y2 = found["box"]
        assert 0 <= x1 < x2 <= width + 1 and 0 <= y1 < y2 <= height + 1
        assert found["source"] == "detector"
        assert found["freshness"] in ("fresh", "spoiled")
        assert 0 <= found["confidence"] <= 1
        assert {"level", "needsConfirmation", "reasons"} <= set(found["review"])


@needs_detector
def test_TC_F_DET_11_each_detected_food_is_classified_on_its_own_crop(client):
    frame = frame_of("fresh_apples", "rotten_banana")
    objects = upload(client, "/predict", png_bytes(frame)).json()["objects"]
    names = {o["foodName"] for o in objects}
    assert {"apple", "banana"} <= names, names
    banana = next(o for o in objects if o["foodName"] == "banana")
    assert banana["freshness"] == "spoiled"


@needs_detector
def test_TC_F_DET_12_boxes_line_up_left_to_right_with_where_each_food_was_placed(client):
    frame = frame_of("fresh_apples", "rotten_banana")
    objects = upload(client, "/predict", png_bytes(frame)).json()["objects"]
    by_name = {o["foodName"]: o for o in objects}
    assert by_name["apple"]["box"][0] < 416 <= by_name["banana"]["box"][2]
    assert by_name["apple"]["box"][2] <= 416 + 20
    assert by_name["banana"]["box"][0] >= 416 - 20


@needs_detector
def test_TC_F_DET_13_skipping_detection_falls_back_to_the_whole_frame_result(client):
    frame = frame_of("fresh_apples", "rotten_banana")
    response = client.post("/predict?detect=false", files={"image": ("f.png", png_bytes(frame), "image/png")})
    body = response.json()
    assert body["objectCount"] == 1 and body["objects"][0]["source"] == "full-frame"
    assert body["boxes"] == []


def test_TC_F_DET_14_without_the_fine_tuned_detector_the_pipeline_still_answers(tmp_path):
    fallback = FoodPipeline(food_detector_path=tmp_path / "missing.pt")
    result = fallback.analyze(Image.open(sample_image("fresh_apples")).convert("RGB"))
    assert result["objectCount"] == 1
    assert result["detection"]["model"] != pipeline.FOOD_DETECTOR_NAME
    assert result["review"]["level"] in ("high", "medium", "low")


def test_TC_F_DET_15_an_image_with_no_food_is_still_answered_with_a_review(client):
    blank = png_bytes(Image.new("RGB", (400, 300), (240, 240, 240)))
    body = upload(client, "/predict", blank).json()
    assert body["objectCount"] >= 1
    assert {"level", "needsConfirmation", "reasons"} <= set(body["review"])


def test_TC_F_DET_16_a_photo_with_an_exif_rotation_flag_is_turned_upright_before_analysis(client):
    # A landscape sensor image flagged "rotate 90 degrees", as a phone held upright stores it.
    landscape = Image.new("RGB", (300, 120), (200, 60, 50))
    exif = Image.Exif()
    exif[0x0112] = 6
    import io

    buffer = io.BytesIO()
    landscape.save(buffer, "JPEG", exif=exif)
    body = client.post("/predict", files={"image": ("p.jpg", buffer.getvalue(), "image/jpeg")}).json()
    assert body["imageSize"] == [120, 300]
