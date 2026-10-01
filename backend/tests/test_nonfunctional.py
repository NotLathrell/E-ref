"""Non-functional test cases: response time, reliability, concurrency and security.

Thresholds are for a CPU-only development laptop and can be overridden with the
environment variables named beside each one. Measurements are written to
backend/metrics/nfr_report.json for the thesis.
"""

from __future__ import annotations

import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor

from .conftest import item, label_png, percentile, register, sample_image, upload

PREDICT_P95_MS = float(os.getenv("EREF_PREDICT_P95_MS", "3000"))
OCR_P95_MS = float(os.getenv("EREF_OCR_P95_MS", "4000"))
LOGIN_P95_MS = float(os.getenv("EREF_LOGIN_P95_MS", "1000"))
API_P95_MS = float(os.getenv("EREF_API_P95_MS", "250"))


def _timed(call, runs):
    durations = []
    for _ in range(runs):
        started = time.perf_counter()
        response = call()
        durations.append((time.perf_counter() - started) * 1000)
        assert response.status_code == 200, response.text
    return durations


def _summary(durations):
    return {
        "runs": len(durations),
        "meanMs": round(statistics.mean(durations), 1),
        "p50Ms": round(percentile(durations, 0.5), 1),
        "p95Ms": round(percentile(durations, 0.95), 1),
        "maxMs": round(max(durations), 1),
    }


def test_TC_NF_PERF_01_food_scan_response_time(client, nfr_report):
    path = sample_image("fresh_tomato")
    data = path.read_bytes()
    upload(client, "/predict", data, name=path.name, mime="image/jpeg")  # warm-up: loads weights
    durations = _timed(lambda: upload(client, "/predict", data, name=path.name, mime="image/jpeg"), 20)
    summary = _summary(durations)
    nfr_report["predict"] = {**summary, "targetP95Ms": PREDICT_P95_MS}
    assert summary["p95Ms"] <= PREDICT_P95_MS, summary


def test_TC_NF_PERF_02_label_ocr_response_time(client, nfr_report):
    data = label_png(["FRESH MILK 1L", "MFG: 03/09/2026", "EXP: 15/09/2026"])
    upload(client, "/ocr", data)  # warm-up: loads the OCR model
    summary = _summary(_timed(lambda: upload(client, "/ocr", data), 10))
    nfr_report["ocr"] = {**summary, "targetP95Ms": OCR_P95_MS}
    assert summary["p95Ms"] <= OCR_P95_MS, summary


def test_TC_NF_PERF_03_sign_in_and_inventory_calls_are_fast(client, nfr_report):
    session = register(client)
    login = _summary(_timed(lambda: client.post(
        "/auth/login", json={"email": "ana@example.com", "password": "correct horse battery"}), 8))
    listing = _summary(_timed(lambda: client.get("/inventory", headers=session["headers"]), 30))
    saving = _summary(_timed(lambda: client.put("/inventory/i1", headers=session["headers"], json=item()), 30))
    nfr_report["login"] = {**login, "targetP95Ms": LOGIN_P95_MS}
    nfr_report["inventoryList"] = {**listing, "targetP95Ms": API_P95_MS}
    nfr_report["inventorySave"] = {**saving, "targetP95Ms": API_P95_MS}
    assert login["p95Ms"] <= LOGIN_P95_MS and listing["p95Ms"] <= API_P95_MS and saving["p95Ms"] <= API_P95_MS


def test_TC_NF_REL_01_fifty_mixed_requests_all_succeed(client, nfr_report):
    session = register(client)
    path = sample_image("rotten_banana")
    photo = path.read_bytes()
    failures = 0
    for index in range(50):
        if index % 5 == 0:
            response = upload(client, "/predict", photo, name=path.name, mime="image/jpeg")
        elif index % 5 == 1:
            response = client.put(f"/inventory/r{index}", headers=session["headers"], json=item(f"r{index}"))
        elif index % 5 == 2:
            response = client.get("/inventory", headers=session["headers"])
        elif index % 5 == 3:
            response = client.get("/metrics")
        else:
            response = client.get("/health")
        failures += response.status_code != 200
    nfr_report["reliability"] = {"requests": 50, "failures": failures}
    assert failures == 0


def test_TC_NF_REL_02_concurrent_users_do_not_corrupt_each_others_data(client, nfr_report):
    sessions = [register(client, email=f"user{n}@example.com", name=f"User {n}") for n in range(6)]

    def work(index):
        headers = sessions[index]["headers"]
        statuses = []
        for n in range(8):
            statuses.append(client.put(f"/inventory/u{index}-{n}", headers=headers,
                                       json=item(f"u{index}-{n}", title=f"user {index}")).status_code)
            statuses.append(client.get("/inventory", headers=headers).status_code)
        return statuses

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(work, range(6)))

    assert all(status == 200 for statuses in results for status in statuses)
    for index, session in enumerate(sessions):
        items = client.get("/inventory", headers=session["headers"]).json()["items"]
        assert len(items) == 8
        assert {entry["title"] for entry in items} == {f"user {index}"}
    nfr_report["concurrency"] = {"users": 6, "requestsPerUser": 16, "errors": 0}


def test_TC_NF_SEC_01_responses_never_contain_password_material(client):
    session = register(client)
    bodies = [
        client.get("/auth/me", headers=session["headers"]).text,
        client.post("/auth/login", json={"email": "ana@example.com", "password": "correct horse battery"}).text,
    ]
    for body in bodies:
        assert "scrypt" not in body and "password" not in body.lower() and "correct horse" not in body


def test_TC_NF_SEC_02_malformed_and_oversized_input_never_causes_a_server_error(client):
    session = register(client)
    hostile = [
        client.post("/auth/login", json={"email": "a" * 5000, "password": "x"}),
        client.post("/auth/register", json={"name": "x" * 500, "email": "a@b.co", "password": "long enough pw"}),
        client.post("/auth/login", content=b"{not json", headers={"Content-Type": "application/json"}),
        client.put("/inventory/i1", headers=session["headers"], content=b"[]"),
        client.get("/inventory/../../etc/passwd", headers=session["headers"]),
        client.post("/auth/verify-code", json={"email": "a@b.co", "code": "1" * 50}),
    ]
    assert all(response.status_code < 500 for response in hostile)


def test_TC_NF_USA_01_error_messages_are_plain_language(client):
    short = client.post("/auth/register", json={"name": "A", "email": "a@b.co", "password": "short"}).json()["detail"]
    wrong = client.post("/auth/login", json={"email": "a@b.co", "password": "whatever"}).json()["detail"]
    assert short == "Password must be at least 8 characters."
    assert wrong == "Incorrect email or password."
