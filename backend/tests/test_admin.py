"""Functional test cases: administrator role and the food database (module A15)."""

from __future__ import annotations

import sqlite3

from .conftest import PASSWORD, register

BEETROOT = {
    "name": "Beetroot",
    "category": "Produce",
    "keywords": ["beetroot", "beet"],
    "refTempC": 4,
    "nominalShelfDays": 10,
    "q10": 2.4,
    "freezeable": False,
    "bestStorageId": "fridge_top",
    "usageIdeas": ["Roast", "Pickle"],
    "storageTips": ["Trim the leaves before storing"],
}


def two_users(client):
    admin = register(client, "boss@example.com", "Boss")
    user = register(client, "ana@example.com", "Ana")
    return admin, user


def test_TC_F_ADM_01_the_first_account_is_the_super_admin_and_later_ones_are_employees(client):
    admin, user = two_users(client)
    assert admin["user"]["role"] == "super_admin"
    assert user["user"]["role"] == "employee"
    assert client.get("/auth/me", headers=admin["headers"]).json()["user"]["role"] == "super_admin"


def test_TC_F_ADM_02_admin_endpoints_refuse_regular_users_and_anonymous_callers(client):
    _, user = two_users(client)
    for method, path in [("get", "/admin/users"), ("get", "/admin/stats"), ("get", "/admin/foods")]:
        assert getattr(client, method)(path).status_code == 401
        assert getattr(client, method)(path, headers=user["headers"]).status_code == 403
    assert client.put("/admin/foods/beetroot", json=BEETROOT, headers=user["headers"]).status_code == 403
    assert client.delete("/admin/foods/beetroot", headers=user["headers"]).status_code == 403


def test_TC_F_ADM_03_an_administrator_can_add_read_update_and_remove_a_food(client):
    admin, user = two_users(client)

    created = client.put("/admin/foods/beetroot", json=BEETROOT, headers=admin["headers"])
    assert created.status_code == 200
    assert created.json()["food"]["id"] == "beetroot"

    # Regular users and signed-out apps read the database through the open /foods route.
    listed = client.get("/foods").json()
    assert [f["id"] for f in listed["foods"]] == ["beetroot"]
    assert listed["version"] > 0

    changed = {**BEETROOT, "nominalShelfDays": 14}
    assert client.put("/admin/foods/beetroot", json=changed, headers=admin["headers"]).status_code == 200
    assert client.get("/foods").json()["foods"][0]["nominalShelfDays"] == 14

    assert client.delete("/admin/foods/beetroot", headers=admin["headers"]).status_code == 200
    assert client.get("/foods").json()["foods"] == []
    assert client.delete("/admin/foods/beetroot", headers=admin["headers"]).status_code == 404


def test_TC_F_ADM_04_the_food_database_version_changes_when_it_does(client):
    admin, _ = two_users(client)
    empty = client.get("/foods").json()["version"]
    client.put("/admin/foods/beetroot", json=BEETROOT, headers=admin["headers"])
    added = client.get("/foods").json()["version"]
    client.delete("/admin/foods/beetroot", headers=admin["headers"])
    assert added != empty
    assert client.get("/foods").json()["version"] != added


def test_TC_F_ADM_05_bad_food_records_are_rejected(client):
    admin, _ = two_users(client)
    h = admin["headers"]
    assert client.put("/admin/foods/beetroot", json={**BEETROOT, "category": "Candy"}, headers=h).status_code == 422
    assert client.put("/admin/foods/beetroot", json={**BEETROOT, "bestStorageId": "attic"}, headers=h).status_code == 422
    assert client.put("/admin/foods/beetroot", json={**BEETROOT, "nominalShelfDays": 0}, headers=h).status_code == 422
    assert client.put("/admin/foods/beetroot", json={**BEETROOT, "nominalShelfDays": -3}, headers=h).status_code == 422
    assert client.put("/admin/foods/beetroot", json={**BEETROOT, "name": ""}, headers=h).status_code == 422
    assert client.put("/admin/foods/Bad Id!", json=BEETROOT, headers=h).status_code == 422
    # The catalog's fallback entry cannot be replaced.
    assert client.put("/admin/foods/unknown", json=BEETROOT, headers=h).status_code == 422
    assert client.get("/foods").json()["foods"] == []


def test_TC_F_ADM_06_an_administrator_sees_every_account_without_password_data(client):
    admin, user = two_users(client)
    client.put("/inventory/i1", json={"id": "i1", "foodId": "tomato"}, headers=user["headers"])

    body = client.get("/admin/users", headers=admin["headers"]).json()
    by_email = {u["email"]: u for u in body["users"]}
    assert by_email["ana@example.com"]["items"] == 1
    assert by_email["boss@example.com"]["role"] == "super_admin"
    assert by_email["ana@example.com"]["role"] == "employee"
    assert all("password" not in key for u in body["users"] for key in u)


def test_TC_F_ADM_07_roles_can_be_changed_but_not_by_removing_your_own_access(client):
    admin, user = two_users(client)

    assert client.post(f"/admin/users/{user['user']['id']}/role", json={"role": "admin"}, headers=admin["headers"]).status_code == 200
    assert client.get("/admin/users", headers=user["headers"]).status_code == 200

    own = client.post(f"/admin/users/{admin['user']['id']}/role", json={"role": "user"}, headers=admin["headers"])
    assert own.status_code == 409
    assert client.post("/admin/users/999/role", json={"role": "user"}, headers=admin["headers"]).status_code == 404
    assert client.post(f"/admin/users/{user['user']['id']}/role", json={"role": "root"}, headers=admin["headers"]).status_code == 422
    # Only the web console can make or unmake a Super Admin.
    assert client.post(f"/admin/users/{user['user']['id']}/role", json={"role": "super_admin"}, headers=admin["headers"]).status_code == 422
    demote_boss = client.post(f"/admin/users/{admin['user']['id']}/role", json={"role": "employee"}, headers=user["headers"])
    assert demote_boss.status_code == 403
    # 'user' is the older app's name for an Employee.
    back = client.post(f"/admin/users/{user['user']['id']}/role", json={"role": "user"}, headers=admin["headers"])
    assert back.status_code == 200 and back.json()["role"] == "employee"


def test_TC_F_ADM_08_stats_summarise_users_items_and_popular_foods(client):
    admin, user = two_users(client)
    for i, food in enumerate(["tomato", "tomato", "milk"]):
        client.put(f"/inventory/i{i}", json={"id": f"i{i}", "foodId": food}, headers=user["headers"])

    stats = client.get("/admin/stats", headers=admin["headers"]).json()
    assert stats["users"] == 2 and stats["admins"] == 1 and stats["items"] == 3
    assert stats["topFoods"][0] == {"foodId": "tomato", "count": 2}


def test_TC_F_ADM_09_admin_emails_from_the_environment_are_administrators(client, monkeypatch):
    monkeypatch.setenv("EREF_ADMIN_EMAILS", "ana@example.com, someone@else.org")
    _, user = two_users(client)
    assert client.get("/auth/me", headers=user["headers"]).json()["user"]["role"] == "admin"
    assert client.get("/admin/stats", headers=user["headers"]).status_code == 200


def test_TC_F_ADM_10_a_database_from_before_roles_existed_is_upgraded_and_its_oldest_account_becomes_super_admin(tmp_path):
    from backend.db import Database

    path = tmp_path / "old.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(
            "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE,"
            " name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at REAL NOT NULL);"
            "INSERT INTO users (email, name, password_hash, created_at) VALUES ('owner@example.com', 'Owner', 'x', 0);"
            "INSERT INTO users (email, name, password_hash, created_at) VALUES ('later@example.com', 'Later', 'x', 1);"
        )
    db = Database(path)
    assert db.get_user_by_email("owner@example.com")["role"] == "super_admin"
    assert db.get_user_by_email("later@example.com")["role"] == "employee"
    # Accounts created after the upgrade are Employees: a Super Admin already exists.
    new_id = db.create_user("new@example.com", "New", "y")
    assert db.get_user(new_id)["role"] == "employee"
    # Opening the database again must not promote anyone else.
    assert Database(path).count_role("super_admin") == 1


def test_TC_F_ADM_12_a_two_role_database_is_upgraded_to_three_tiers(tmp_path):
    from backend.db import Database

    path = tmp_path / "two-role.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(
            "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE,"
            " name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at REAL NOT NULL, role TEXT NOT NULL DEFAULT 'user');"
            "INSERT INTO users (email, name, password_hash, created_at, role) VALUES ('first@example.com', 'First', 'x', 0, 'user');"
            "INSERT INTO users (email, name, password_hash, created_at, role) VALUES ('admin@example.com', 'Admin', 'x', 1, 'admin');"
            "INSERT INTO users (email, name, password_hash, created_at, role) VALUES ('admin2@example.com', 'Admin 2', 'x', 2, 'admin');"
        )
    db = Database(path)
    # The oldest administrator runs the console; other administrators stay Admins.
    assert db.get_user_by_email("admin@example.com")["role"] == "super_admin"
    assert db.get_user_by_email("admin2@example.com")["role"] == "admin"
    assert db.get_user_by_email("first@example.com")["role"] == "employee"
    assert db.get_user_by_email("first@example.com")["disabled"] == 0


def test_TC_F_ADM_11_passwords_still_work_after_the_role_change(client):
    register(client, "boss@example.com", "Boss")
    login = client.post("/auth/login", json={"email": "boss@example.com", "password": PASSWORD})
    assert login.status_code == 200 and login.json()["user"]["role"] == "super_admin"
