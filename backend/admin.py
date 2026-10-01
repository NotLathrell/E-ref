"""Food database and administrator endpoints.

    GET    /foods                    the server's food database and categories (open; the app refreshes from it)
    GET    /recipes                  the recipe dataset the recommender uses (open; the app refreshes from it)
    PUT    /admin/foods/{id}         add a food, or change how the app treats an existing one
    DELETE /admin/foods/{id}         remove the server's entry (a bundled food reverts to its default)
    GET    /admin/foods              same list as /foods, for the admin screen
    GET    /admin/users              every account with its role and item count
    POST   /admin/users/{id}/role    make a user an Admin, or an Employee again
    GET    /admin/stats              totals for the admin dashboard

These are the endpoints the app's Admin screen uses; Admins and Super Admins may call
them. Managing accounts, categories, recipes and the activity log is for Super Admins,
in superadmin.py.

The app ships with a catalog of foods (shelf life, best storage, freezing advice). The
food database lets an administrator correct those values or add a food without shipping
a new app: every phone merges the server's entries over its bundled catalog when it
starts and whenever the database's ``version`` changes.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

try:
    from .accounts import client_ip, get_db, is_admin, require_admin, role_of
    from .db import Database
except ImportError:  # `uvicorn server:app` from inside backend/
    from accounts import client_ip, get_db, is_admin, require_admin, role_of  # type: ignore[no-redef]
    from db import Database  # type: ignore[no-redef]

router = APIRouter()

FOOD_ID_PATTERN = re.compile(r"^[a-z0-9_]{2,40}$")
STORAGE_IDS = ("fridge_top", "fridge_bottom", "freezer", "pantry", "counter")
MAX_FOODS = 500


class FoodIn(BaseModel):
    """One entry of the food database, in the same shape as the app's bundled catalog."""

    name: str = Field(min_length=1, max_length=60)
    category: str = Field(min_length=1, max_length=40)
    keywords: list[str] = Field(default_factory=list, max_length=12)
    refTempC: float = Field(ge=-30, le=40)
    nominalShelfDays: float = Field(gt=0, le=3650)
    q10: float = Field(default=2.2, ge=1.0, le=5.0)
    freezeable: bool = True
    bestStorageId: str
    usageIdeas: list[str] = Field(default_factory=list, max_length=10)
    storageTips: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("bestStorageId")
    @classmethod
    def _storage(cls, value: str) -> str:
        if value not in STORAGE_IDS:
            raise ValueError(f"bestStorageId must be one of {', '.join(STORAGE_IDS)}")
        return value

    @field_validator("keywords", "usageIdeas", "storageTips")
    @classmethod
    def _short_text(cls, values: list[str]) -> list[str]:
        cleaned = [v.strip() for v in values if isinstance(v, str) and v.strip()]
        if any(len(v) > 120 for v in cleaned):
            raise ValueError("each entry must be 120 characters or fewer")
        return cleaned


class RoleIn(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def _role(cls, value: str) -> str:
        # 'user' is what the app called an Employee before there were three tiers.
        value = "employee" if value == "user" else value
        if value not in ("admin", "employee"):
            raise ValueError("role must be 'admin' or 'employee'")
        return value


def _food_payload(db: Database) -> dict[str, Any]:
    return {
        "version": db.foods_version(),
        "foods": db.list_foods(),
        "categories": [
            {"name": c["name"], "description": c["description"], "color": c["color"], "builtin": c["builtin"]}
            for c in db.list_categories()
        ],
    }


@router.get("/foods")
def list_foods(db: Database = Depends(get_db)) -> dict[str, Any]:
    return _food_payload(db)


@router.get("/recipes")
def list_recipes(db: Database = Depends(get_db)) -> dict[str, Any]:
    recipes = [{k: v for k, v in r.items() if k != "updatedAt"} for r in db.list_recipes()]
    return {"version": db.recipes_version(), "recipes": recipes}


@router.get("/admin/foods")
def admin_list_foods(_: dict[str, Any] = Depends(require_admin), db: Database = Depends(get_db)) -> dict[str, Any]:
    return _food_payload(db)


@router.put("/admin/foods/{food_id}")
def put_food(
    food_id: str,
    body: FoodIn,
    request: Request,
    admin: dict[str, Any] = Depends(require_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    if not FOOD_ID_PATTERN.match(food_id) or food_id == "unknown":
        raise HTTPException(status_code=422, detail="Use 2-40 lowercase letters, digits or underscores for the id.")
    category = db.get_category(body.category.strip())
    if not category:
        names = ", ".join(c["name"] for c in db.list_categories())
        raise HTTPException(status_code=422, detail=f"category must be one of {names}")
    existing = any(f["id"] == food_id for f in db.list_foods())
    if len(db.list_foods()) >= MAX_FOODS and not existing:
        raise HTTPException(status_code=409, detail="The food database is full.")

    food = {"id": food_id, **body.model_dump(), "category": category["name"]}
    db.upsert_food(food_id, food, admin["id"])
    db.log(
        "food.updated" if existing else "food.added",
        actor=admin,
        target=food_id,
        detail={"name": food["name"], "category": food["category"]},
        ip=client_ip(request),
    )
    return {"food": food, "version": db.foods_version()}


@router.delete("/admin/foods/{food_id}")
def delete_food(
    food_id: str,
    request: Request,
    admin: dict[str, Any] = Depends(require_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    if not db.delete_food(food_id):
        raise HTTPException(status_code=404, detail="That food is not in the server's database.")
    db.log("food.removed", actor=admin, target=food_id, ip=client_ip(request))
    return {"deleted": True, "version": db.foods_version()}


@router.get("/admin/users")
def list_users(_: dict[str, Any] = Depends(require_admin), db: Database = Depends(get_db)) -> dict[str, Any]:
    users = [
        {
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "role": role_of(u),
            "disabled": bool(u["disabled"]),
            "items": u["items"],
            "createdAt": u["created_at"],
            "lastLoginAt": u["last_login_at"],
        }
        for u in db.list_users()
    ]
    return {"users": users}


@router.post("/admin/users/{user_id}/role")
def set_role(
    user_id: int,
    body: RoleIn,
    request: Request,
    admin: dict[str, Any] = Depends(require_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    target = db.get_user(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="No such user.")
    # Without this an administrator could lock everyone out of the admin screen.
    if target["id"] == admin["id"]:
        raise HTTPException(status_code=409, detail="You cannot remove your own administrator access.")
    if role_of(target) == "super_admin":
        raise HTTPException(status_code=403, detail="A Super Admin's role can only be changed from the web console.")
    previous = role_of(target)
    db.set_role(user_id, body.role)
    db.log(
        "user.role_changed",
        actor=admin,
        target=target["email"],
        detail={"from": previous, "to": body.role},
        ip=client_ip(request),
    )
    return {"ok": True, "role": body.role}


@router.get("/admin/stats")
def stats(_: dict[str, Any] = Depends(require_admin), db: Database = Depends(get_db)) -> dict[str, Any]:
    users = db.list_users()
    foods = Counter(f for f in db.all_item_foods() if f)
    return {
        "users": len(users),
        "admins": sum(1 for u in users if is_admin(u)),
        "items": sum(u["items"] for u in users),
        "customFoods": len(db.list_foods()),
        "topFoods": [{"foodId": food, "count": count} for food, count in foods.most_common(5)],
    }
