"""Functional test cases: the Super Admin web console (accounts, categories, recipes, activity log)."""

from __future__ import annotations

import json

from .conftest import PASSWORD, ROOT, register
from .test_admin import BEETROOT

SEED_RECIPES = json.loads((ROOT / "backend" / "seed" / "recipes.json").read_text(encoding="utf-8"))

TAHO = {
    "name": "Banana Taho",
    "ingredients": ["banana", "milk"],
    "optional": ["mango"],
    "tags": ["filipino", "dessert"],
    "minutes": 15,
    "summary": "Warm milk pudding with banana and syrup.",
}


def three_tiers(client):
    """A Super Admin (the first account), an Admin and an Employee."""
    boss = register(client, "boss@example.com", "Boss")
    admin = register(client, "ada@example.com", "Ada")
    worker = register(client, "eli@example.com", "Eli")
    client.patch(f"/super/users/{admin['user']['id']}", json={"role": "admin"}, headers=boss["headers"])
    return boss, admin, worker


def actions(client, headers, **params):
    return [e["action"] for e in client.get("/super/activity", params=params, headers=headers).json()["entries"]]


# -------------------------------------------------------------------- access
def test_TC_F_SUP_01_only_super_admins_can_use_the_console(client):
    boss, admin, worker = three_tiers(client)
    paths = ["/super/overview", "/super/users", "/super/categories", "/super/recipes", "/super/activity", "/super/foods"]
    for path in paths:
        assert client.get(path).status_code == 401
        assert client.get(path, headers=admin["headers"]).status_code == 403
        assert client.get(path, headers=worker["headers"]).status_code == 403
        assert client.get(path, headers=boss["headers"]).status_code == 200


def test_TC_F_SUP_02_overview_counts_every_tier(client):
    boss, _, worker = three_tiers(client)
    client.put("/inventory/i1", json={"id": "i1", "foodId": "tomato"}, headers=worker["headers"])
    body = client.get("/super/overview", headers=boss["headers"]).json()
    assert body["users"]["byRole"] == {"super_admin": 1, "admin": 1, "employee": 1}
    assert body["items"] == 1
    assert body["recipes"] == len(SEED_RECIPES)
    assert body["categories"] == 4
    assert len(body["activityByDay"]) == 14 and body["activityByDay"][-1]["count"] > 0
    assert body["topFoods"][0] == {"foodId": "tomato", "name": "Tomato", "count": 1}


# ------------------------------------------------------------------ accounts
def test_TC_F_SUP_03_a_super_admin_creates_accounts_in_any_tier(client):
    boss = register(client, "boss@example.com", "Boss")
    h = boss["headers"]
    for email, role in [("s2@example.com", "super_admin"), ("a@example.com", "admin"), ("e@example.com", "employee")]:
        created = client.post("/super/users", json={"name": "N", "email": email, "password": PASSWORD, "role": role}, headers=h)
        assert created.status_code == 201 and created.json()["user"]["role"] == role
        login = client.post("/auth/login", json={"email": email, "password": PASSWORD})
        assert login.status_code == 200 and login.json()["user"]["role"] == role

    assert client.post("/super/users", json={"name": "N", "email": "a@example.com", "password": PASSWORD}, headers=h).status_code == 409
    assert client.post("/super/users", json={"name": "N", "email": "x@example.com", "password": "short"}, headers=h).status_code == 422
    assert client.post("/super/users", json={"name": "N", "email": "not-an-email", "password": PASSWORD}, headers=h).status_code == 422
    assert client.post("/super/users", json={"name": "N", "email": "y@example.com", "password": PASSWORD, "role": "root"}, headers=h).status_code == 422
    users = client.get("/super/users", headers=h).json()["users"]
    assert all("password" not in key for u in users for key in u)


def test_TC_F_SUP_04_accounts_can_be_edited_disabled_enabled_and_deleted(client):
    boss, _, worker = three_tiers(client)
    h, wid = boss["headers"], worker["user"]["id"]

    edited = client.patch(f"/super/users/{wid}", json={"name": "Eli Cruz", "email": "eli.cruz@example.com"}, headers=h)
    assert edited.status_code == 200 and edited.json()["user"]["email"] == "eli.cruz@example.com"
    assert client.patch(f"/super/users/{wid}", json={"email": "boss@example.com"}, headers=h).status_code == 409

    # A disabled account cannot sign in, and its existing session stops working.
    assert client.patch(f"/super/users/{wid}", json={"disabled": True}, headers=h).json()["user"]["disabled"] is True
    assert client.get("/inventory", headers=worker["headers"]).status_code == 401
    blocked = client.post("/auth/login", json={"email": "eli.cruz@example.com", "password": PASSWORD})
    assert blocked.status_code == 403 and "disabled" in blocked.json()["detail"]
    # A wrong password on a disabled account still says only "incorrect".
    assert client.post("/auth/login", json={"email": "eli.cruz@example.com", "password": "wrong password"}).status_code == 401

    client.patch(f"/super/users/{wid}", json={"disabled": False}, headers=h)
    assert client.post("/auth/login", json={"email": "eli.cruz@example.com", "password": PASSWORD}).status_code == 200

    client.put("/inventory/i1", json={"id": "i1", "foodId": "milk"}, headers=worker["headers"])
    assert client.delete(f"/super/users/{wid}", headers=h).status_code == 200
    assert all(u["id"] != wid for u in client.get("/super/users", headers=h).json()["users"])
    assert client.delete(f"/super/users/{wid}", headers=h).status_code == 404


def test_TC_F_SUP_05_a_super_admin_cannot_lock_themself_out(client):
    boss, _, _ = three_tiers(client)
    h, me = boss["headers"], boss["user"]["id"]
    assert client.patch(f"/super/users/{me}", json={"role": "employee"}, headers=h).status_code == 409
    assert client.patch(f"/super/users/{me}", json={"disabled": True}, headers=h).status_code == 409
    assert client.delete(f"/super/users/{me}", headers=h).status_code == 409
    assert client.post(f"/super/users/{me}/password", json={"password": "another password"}, headers=h).status_code == 409
    # Their own name is fine to fix.
    assert client.patch(f"/super/users/{me}", json={"name": "The Boss"}, headers=h).status_code == 200


def test_TC_F_SUP_06_a_super_admin_can_set_a_new_password_for_someone(client):
    boss, _, worker = three_tiers(client)
    wid = worker["user"]["id"]
    assert client.post(f"/super/users/{wid}/password", json={"password": "short"}, headers=boss["headers"]).status_code == 422
    assert client.post(f"/super/users/{wid}/password", json={"password": "brand new secret"}, headers=boss["headers"]).status_code == 200
    assert client.post("/auth/login", json={"email": "eli@example.com", "password": PASSWORD}).status_code == 401
    assert client.post("/auth/login", json={"email": "eli@example.com", "password": "brand new secret"}).status_code == 200


# ---------------------------------------------------------------- categories
def test_TC_F_SUP_07_categories_can_be_added_renamed_and_removed(client):
    boss = register(client, "boss@example.com", "Boss")
    h = boss["headers"]

    listed = client.get("/super/categories", headers=h).json()["categories"]
    assert [c["name"] for c in listed] == ["Produce", "Dairy", "Meat", "Pantry"]
    produce = listed[0]
    assert produce["builtin"] and any(f["id"] == "tomato" for f in produce["foods"])

    version = client.get("/foods").json()["version"]
    added = client.post("/super/categories", json={"name": "Grains", "description": "Rice and noodles", "color": "#d6a85f"}, headers=h)
    assert added.status_code == 201 and added.json()["category"]["color"] == "#D6A85F"
    # The app learns about new categories from /foods, and its version tells it to refresh.
    foods = client.get("/foods").json()
    assert "Grains" in [c["name"] for c in foods["categories"]] and foods["version"] != version

    assert client.post("/super/categories", json={"name": "grains"}, headers=h).status_code == 409
    assert client.post("/super/categories", json={"name": "All"}, headers=h).status_code == 422
    assert client.post("/super/categories", json={"name": "Bad!"}, headers=h).status_code == 422
    assert client.post("/super/categories", json={"name": "Snacks", "color": "red"}, headers=h).status_code == 422

    # A food added to the new category moves with it when it is renamed.
    rice = {**BEETROOT, "name": "Rice", "category": "grains"}
    saved = client.put("/admin/foods/rice", json=rice, headers=h)
    assert saved.status_code == 200 and saved.json()["food"]["category"] == "Grains"
    renamed = client.put("/super/categories/Grains", json={"name": "Grains & Rice", "color": "#D6A85F"}, headers=h)
    assert renamed.status_code == 200
    assert client.get("/foods").json()["foods"][0]["category"] == "Grains & Rice"

    # It cannot be removed while a food uses it.
    blocked = client.delete("/super/categories/Grains & Rice", headers=h)
    assert blocked.status_code == 409 and "Rice" in blocked.json()["detail"]
    client.delete("/admin/foods/rice", headers=h)
    assert client.delete("/super/categories/Grains & Rice", headers=h).status_code == 200
    assert client.delete("/super/categories/Grains & Rice", headers=h).status_code == 404


def test_TC_F_SUP_08_built_in_categories_keep_their_names(client):
    boss = register(client, "boss@example.com", "Boss")
    h = boss["headers"]
    assert client.put("/super/categories/Dairy", json={"name": "Milk"}, headers=h).status_code == 409
    assert client.delete("/super/categories/Dairy", headers=h).status_code == 409
    described = client.put("/super/categories/Dairy", json={"name": "Dairy", "description": "Milk and friends", "color": "#6F9B72"}, headers=h)
    assert described.status_code == 200 and described.json()["category"]["description"] == "Milk and friends"


# ------------------------------------------------------------------- recipes
def test_TC_F_SUP_09_the_recipe_dataset_starts_as_the_apps_own(client):
    served = client.get("/recipes").json()["recipes"]
    assert served == sorted(SEED_RECIPES, key=lambda r: r["name"].lower())
    boss = register(client, "boss@example.com", "Boss")
    by_id = {r["id"]: r for r in client.get("/super/recipes", headers=boss["headers"]).json()["recipes"]}
    assert by_id["pinakbet"]["ingredients"] == ["eggplant", "bitter_gourd", "okra", "tomato"]


def test_TC_F_SUP_10_recipes_can_be_added_edited_and_removed(client):
    boss = register(client, "boss@example.com", "Boss")
    h = boss["headers"]
    version = client.get("/recipes").json()["version"]

    created = client.post("/super/recipes", json=TAHO, headers=h)
    assert created.status_code == 201 and created.json()["recipe"]["id"] == "banana-taho"
    after_add = client.get("/recipes").json()
    assert after_add["version"] != version and any(r["id"] == "banana-taho" for r in after_add["recipes"])
    assert client.post("/super/recipes", json=TAHO, headers=h).status_code == 409

    edited = client.put("/super/recipes/banana-taho", json={**TAHO, "minutes": 20, "tags": ["Dessert", "dessert"]}, headers=h)
    assert edited.status_code == 200 and edited.json()["recipe"]["tags"] == ["dessert"]
    assert client.put("/super/recipes/nope", json=TAHO, headers=h).status_code == 404

    assert client.delete("/super/recipes/banana-taho", headers=h).status_code == 200
    after_delete = client.get("/recipes").json()
    assert after_delete["version"] != after_add["version"]
    assert all(r["id"] != "banana-taho" for r in after_delete["recipes"])
    assert client.delete("/super/recipes/banana-taho", headers=h).status_code == 404


def test_TC_F_SUP_11_recipes_must_use_known_foods(client):
    boss = register(client, "boss@example.com", "Boss")
    h = boss["headers"]
    unknown = client.post("/super/recipes", json={**TAHO, "ingredients": ["banana", "durian"]}, headers=h)
    assert unknown.status_code == 422 and "durian" in unknown.json()["detail"]
    assert client.post("/super/recipes", json={**TAHO, "ingredients": []}, headers=h).status_code == 422
    assert client.post("/super/recipes", json={**TAHO, "optional": ["banana"]}, headers=h).status_code == 422
    assert client.post("/super/recipes", json={**TAHO, "minutes": 0}, headers=h).status_code == 422
    assert client.post("/super/recipes", json={**TAHO, "tags": ["two words"]}, headers=h).status_code == 422
    # A food an admin added to the database is usable straight away.
    client.put("/admin/foods/beetroot", json=BEETROOT, headers=h)
    assert client.post("/super/recipes", json={**TAHO, "name": "Beet Salad", "ingredients": ["beetroot"], "optional": []}, headers=h).status_code == 201
    assert any(f["id"] == "beetroot" and f["source"] == "added" for f in client.get("/super/foods", headers=h).json()["foods"])


# -------------------------------------------------------------- activity log
def test_TC_F_SUP_12_the_activity_log_records_actions_across_the_system(client):
    boss, admin, worker = three_tiers(client)
    h = boss["headers"]
    client.post("/auth/login", json={"email": "eli@example.com", "password": "wrong password"})
    client.post("/auth/login", json={"email": "eli@example.com", "password": PASSWORD})
    client.put("/inventory/i1", json={"id": "i1", "foodId": "tomato"}, headers=worker["headers"])
    client.put("/admin/foods/beetroot", json=BEETROOT, headers=admin["headers"])
    client.post("/super/recipes", json=TAHO, headers=h)
    client.post("/super/categories", json={"name": "Grains"}, headers=h)

    logged = actions(client, h)
    for expected in [
        "auth.register", "user.role_changed", "auth.login_failed", "auth.login", "inventory.item_saved",
        "food.added", "recipe.added", "category.added",
    ]:
        assert expected in logged, expected
    # Newest first.
    assert logged[0] == "category.added"

    entries = client.get("/super/activity", headers=h).json()["entries"]
    failed = next(e for e in entries if e["action"] == "auth.login_failed")
    assert failed["actor_email"] == "eli@example.com" and failed["actor_id"] is None
    food = next(e for e in entries if e["action"] == "food.added")
    assert food["actor_email"] == "ada@example.com" and food["actor_role"] == "admin"
    assert food["detail"] == {"name": "Beetroot", "category": "Produce"}
    # Passwords never reach the log.
    assert PASSWORD not in json.dumps(entries)


def test_TC_F_SUP_13_the_activity_log_can_be_filtered_and_paged(client):
    boss, _, worker = three_tiers(client)
    h = boss["headers"]
    for i in range(5):
        client.put(f"/inventory/i{i}", json={"id": f"i{i}", "foodId": "milk"}, headers=worker["headers"])

    assert set(actions(client, h, action="inventory")) == {"inventory.item_saved"}
    assert set(actions(client, h, action="auth.register")) == {"auth.register"}
    by_eli = client.get("/super/activity", params={"actor": "eli@"}, headers=h).json()["entries"]
    assert len(by_eli) == 6 and {e["actor_email"] for e in by_eli} == {"eli@example.com"}
    assert actions(client, h, q="nothing-matches-this") == []

    page = client.get("/super/activity", params={"action": "inventory", "limit": 2, "offset": 2}, headers=h).json()
    assert page["total"] == 5 and [e["target"] for e in page["entries"]] == ["i2", "i1"]
    assert "inventory.item_saved" in page["actions"]
    assert client.get("/super/activity", params={"since": 4102444800}, headers=h).json()["total"] == 0


def test_TC_F_SUP_14_console_changes_are_themselves_logged(client):
    boss, _, worker = three_tiers(client)
    h, wid = boss["headers"], worker["user"]["id"]
    client.patch(f"/super/users/{wid}", json={"disabled": True}, headers=h)
    client.patch(f"/super/users/{wid}", json={"disabled": False}, headers=h)
    client.post(f"/super/users/{wid}/password", json={"password": "brand new secret"}, headers=h)
    client.delete(f"/super/users/{wid}", headers=h)
    logged = actions(client, h, action="user")
    assert logged[:4] == ["user.deleted", "user.password_set", "user.enabled", "user.disabled"]
    assert "brand new secret" not in json.dumps(client.get("/super/activity", headers=h).json())


def test_TC_F_SUP_15_the_console_is_served_by_the_api(client):
    page = client.get("/web/")
    assert page.status_code == 200 and "E-REF" in page.text
    assert client.get("/", follow_redirects=False).headers["location"] == "/web/"
