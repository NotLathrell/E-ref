"""Shared fixtures for the E-REF test suite.

    python -m pytest backend/tests -v

Every test name starts with its test-case ID (TC-F-* functional, TC-NF-* non-functional).
Tests that need the trained models or the image datasets skip, rather than fail, when
those files are not on the machine.
"""

from __future__ import annotations

import io
import json
import time
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "Datasets" / "dataset" / ".training" / "food_multiclass" / "val"
NFR_REPORT = ROOT / "backend" / "metrics" / "nfr_report.json"

PASSWORD = "correct horse battery"


@pytest.fixture(scope="session")
def app():
    from backend.server import app as server_app

    return server_app


@pytest.fixture()
def client(app, tmp_path, monkeypatch):
    """A client backed by an empty database, so tests never see each other's accounts."""
    from backend import accounts, auth
    from backend.db import Database

    monkeypatch.setenv("EREF_DEV_RETURN_CODE", "1")
    monkeypatch.setattr(accounts, "throttle", auth.LoginThrottle())
    previous = app.state.db
    app.state.db = Database(tmp_path / "test.db")
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.state.db = previous


def register(client: TestClient, email: str = "ana@example.com", name: str = "Ana", password: str = PASSWORD) -> dict[str, Any]:
    """Create an account; returns its token, user and ready-to-use auth headers."""
    response = client.post("/auth/register", json={"name": name, "email": email, "password": password})
    assert response.status_code == 201, response.text
    body = response.json()
    return {"token": body["token"], "user": body["user"], "headers": {"Authorization": f"Bearer {body['token']}"}}


def item(item_id: str = "i1", food_id: str = "tomato", updated_at: str = "2026-09-24T00:00:00.000Z", **extra: Any) -> dict[str, Any]:
    return {"id": item_id, "foodId": food_id, "updatedAt": updated_at, **extra}


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def label_png(lines: list[str]) -> bytes:
    """A plain label image with the given lines of text."""
    image = Image.new("RGB", (760, 90 * len(lines) + 40), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("arial.ttf", 38)
    except OSError:
        font = ImageFont.load_default()
    for index, line in enumerate(lines):
        draw.text((30, 25 + index * 90), line, fill="black", font=font)
    return png_bytes(image)


def sample_image(folder: str, index: int = 5) -> Path:
    directory = DATASET / folder
    files = sorted(directory.glob("*")) if directory.exists() else []
    if not files:
        pytest.skip(f"dataset sample not available: {folder}")
    return files[index % len(files)]


def upload(client: TestClient, path: str, data: bytes, name: str = "photo.png", mime: str = "image/png"):
    return client.post(path, files={"image": (name, data, mime)})


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(fraction * (len(ordered) - 1))))]


@pytest.fixture(scope="session")
def nfr_report():
    """Collects non-functional measurements and writes them to backend/metrics/nfr_report.json."""
    report: dict[str, Any] = {}
    yield report
    if report:
        report["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        NFR_REPORT.parent.mkdir(parents=True, exist_ok=True)
        NFR_REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
