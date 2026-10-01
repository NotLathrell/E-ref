"""Functional test cases: label OCR and the food identification / freshness pipeline."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from .conftest import label_png, png_bytes, sample_image, upload


def test_TC_F_OCR_01_reads_product_name_and_both_dates_from_a_label(client):
    data = label_png(["FRESH MILK 1L", "MFG: 03/09/2026", "EXP: 15/09/2026"])
    response = upload(client, "/ocr", data)
    assert response.status_code == 200
    text = response.json()["text"].upper().replace(" ", "")
    assert "MILK" in text
    assert "MFG:03/09/2026" in text
    assert "EXP:15/09/2026" in text


def test_TC_F_OCR_02_a_blank_image_yields_no_text_and_so_no_invented_dates(client):
    blank = png_bytes(Image.new("RGB", (400, 300), "white"))
    response = upload(client, "/ocr", blank)
    assert response.status_code == 200
    assert response.json()["text"].strip() == ""


def test_TC_F_OCR_03_bad_uploads_are_rejected_cleanly(client):
    assert upload(client, "/ocr", b"", mime="image/png").status_code == 400
    assert upload(client, "/ocr", b"not an image at all", mime="image/png").status_code == 415
    assert upload(client, "/ocr", b"hello", name="x.txt", mime="text/plain").status_code == 415


def test_TC_F_OCR_04_reports_line_confidence_and_timing(client):
    body = upload(client, "/ocr", label_png(["EXP: 15/09/2026"])).json()
    assert body["lines"] and 0 < body["lines"][0]["confidence"] <= 1
    assert body["ms"] > 0


CASES = [
    ("fresh_apples", "apple", "fresh"),
    ("rotten_banana", "banana", "spoiled"),
    ("rotten_tomato", "tomato", "spoiled"),
    ("fresh_oranges", "orange", "fresh"),
]


@pytest.mark.parametrize("folder,food,freshness", CASES)
def test_TC_F_CNN_01_identifies_the_food_and_judges_freshness(client, folder, food, freshness):
    path = sample_image(folder)
    response = upload(client, "/predict", path.read_bytes(), name=path.name, mime="image/jpeg")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["foodName"] == food
    assert body["freshness"] == freshness


@pytest.mark.parametrize("folder,food,freshness", CASES)
def test_TC_F_CNN_01b_freshness_percent_lands_in_its_own_tier(client, folder, food, freshness):
    """Fresh (70-100%), Sub Fresh (30-69%) and Rotten (0-29%) are consistent with each other."""
    path = sample_image(folder)
    body = upload(client, "/predict", path.read_bytes(), name=path.name, mime="image/jpeg").json()
    percent = body["freshnessPercent"]
    tier = body["freshnessTier"]
    assert 0 <= percent <= 100
    if tier == "fresh":
        assert percent >= 70
    elif tier == "subfresh":
        assert 30 <= percent < 70
    else:
        assert percent < 30
    assert body["freshnessTierLabel"] == {"fresh": "Fresh", "subfresh": "Sub Fresh", "rotten": "Rotten"}[tier]


def test_TC_F_CNN_02_response_carries_every_stage_and_indicator_field(client):
    path = sample_image("rotten_banana")
    body = upload(client, "/predict", path.read_bytes(), name=path.name, mime="image/jpeg").json()
    for key in ("foodName", "confidence", "freshness", "freshnessConfidence", "freshnessPercent",
                "freshnessTier", "freshnessTierLabel", "spoilageScore",
                "detectedIndicators", "detection", "stages", "inferenceMs"):
        assert key in body, key
    assert [stage["name"] for stage in body["stages"]] == ["detection", "identification", "freshness"]
    assert 0 <= body["spoilageScore"] <= 1


def test_TC_F_CNN_03_detector_can_be_skipped(client):
    path = sample_image("fresh_apples")
    response = client.post("/predict?detect=false", files={"image": (path.name, path.read_bytes(), "image/jpeg")})
    assert response.status_code == 200
    assert response.json()["detection"]["used"] is False


def test_TC_F_CNN_04_corrupt_and_non_image_uploads_are_rejected(client):
    assert upload(client, "/predict", b"garbage bytes").status_code == 415
    assert upload(client, "/predict", b"", mime="image/png").status_code == 400


def test_TC_F_CNN_05_a_tiny_or_extreme_image_does_not_crash_the_pipeline(client):
    for size in ((8, 8), (3000, 40)):
        photo = png_bytes(Image.new("RGB", size, (200, 30, 30)))
        assert upload(client, "/predict", photo).status_code in (200, 422)


def test_TC_F_CNN_06_health_and_metrics_are_served(client):
    health = client.get("/health").json()
    assert health["ready"] is True and health["models"]["identity"]["classes"] == 25
    tasks = client.get("/metrics").json()["tasks"]
    assert set(tasks) == {"food_identity", "freshness", "combined"}


def test_TC_F_CNN_07_jpeg_and_png_of_the_same_photo_agree(client):
    path = sample_image("fresh_oranges")
    as_png = png_bytes(Image.open(path).convert("RGB"))
    jpeg = io.BytesIO()
    Image.open(path).convert("RGB").save(jpeg, "JPEG", quality=95)
    a = upload(client, "/predict", as_png).json()
    b = upload(client, "/predict", jpeg.getvalue(), mime="image/jpeg").json()
    assert a["foodName"] == b["foodName"] and a["freshness"] == b["freshness"]
