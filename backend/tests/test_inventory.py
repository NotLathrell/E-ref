"""Functional test cases: per-user inventory storage and sync."""

from __future__ import annotations

from .conftest import item, register


def test_TC_F_INV_01_items_can_be_saved_listed_and_deleted(client):
    session = register(client)
    saved = client.put("/inventory/i1", headers=session["headers"], json=item("i1", "tomato", title="Tomato"))
    assert saved.status_code == 200 and saved.json()["item"]["title"] == "Tomato"

    listed = client.get("/inventory", headers=session["headers"]).json()["items"]
    assert [entry["id"] for entry in listed] == ["i1"]

    assert client.delete("/inventory/i1", headers=session["headers"]).status_code == 200
    assert client.get("/inventory", headers=session["headers"]).json()["items"] == []
    # Deleting something already gone is not an error, so a retried request is safe.
    assert client.delete("/inventory/i1", headers=session["headers"]).status_code == 200


def test_TC_F_INV_02_inventory_requires_sign_in(client):
    assert client.get("/inventory").status_code == 401
    assert client.put("/inventory/i1", json=item()).status_code == 401
    assert client.post("/inventory/sync", json={"items": []}).status_code == 401


def test_TC_F_INV_03_users_cannot_see_or_change_each_others_items(client):
    ana = register(client, email="ana@example.com")
    ben = register(client, email="ben@example.com", name="Ben")

    client.put("/inventory/shared-id", headers=ana["headers"], json=item("shared-id", "tomato", title="Ana's"))
    assert client.get("/inventory", headers=ben["headers"]).json()["items"] == []

    client.delete("/inventory/shared-id", headers=ben["headers"])
    assert len(client.get("/inventory", headers=ana["headers"]).json()["items"]) == 1

    client.put("/inventory/shared-id", headers=ben["headers"], json=item("shared-id", "milk", title="Ben's"))
    assert client.get("/inventory", headers=ana["headers"]).json()["items"][0]["title"] == "Ana's"
    assert client.get("/inventory", headers=ben["headers"]).json()["items"][0]["title"] == "Ben's"


def test_TC_F_INV_04_an_older_edit_never_overwrites_a_newer_one(client):
    session = register(client)
    newer = item("i1", title="newer", updated_at="2026-09-24T10:00:00.000Z")
    older = item("i1", title="older", updated_at="2026-09-24T09:00:00.000Z")
    client.put("/inventory/i1", headers=session["headers"], json=newer)
    result = client.put("/inventory/i1", headers=session["headers"], json=older)
    assert result.json()["item"]["title"] == "newer"
    assert client.get("/inventory", headers=session["headers"]).json()["items"][0]["title"] == "newer"


def test_TC_F_INV_05_sync_merges_a_batch_and_reports_rejected_items(client):
    session = register(client)
    batch = [item("a"), item("b", "milk"), {"id": "no-food-id"}, item("bad id!", "milk")]
    result = client.post("/inventory/sync", headers=session["headers"], json={"items": batch}).json()
    assert sorted(entry["id"] for entry in result["items"]) == ["a", "b"]
    assert sorted(result["rejected"]) == ["bad id!", "no-food-id"]


def test_TC_F_INV_06_invalid_items_are_refused(client):
    session = register(client)
    h = session["headers"]
    assert client.put("/inventory/i1", headers=h, json={"id": "i1"}).status_code == 422
    assert client.put("/inventory/i1", headers=h, json=item("different")).status_code == 422
    assert client.put("/inventory/bad id", headers=h, json=item("bad id")).status_code in (404, 422)
    assert client.put("/inventory/i1", headers=h, json=item("i1", note="x" * 40_000)).status_code == 413


def test_TC_F_INV_07_inventory_survives_signing_out_and_back_in(client):
    session = register(client)
    client.put("/inventory/i1", headers=session["headers"], json=item("i1", title="Kept"))
    token = client.post("/auth/login", json={"email": "ana@example.com", "password": "correct horse battery"}).json()["token"]
    items = client.get("/inventory", headers={"Authorization": f"Bearer {token}"}).json()["items"]
    assert items[0]["title"] == "Kept"
