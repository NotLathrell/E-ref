"""Super Admin endpoints, used by the web console in WEBSITE/.

    GET    /super/overview                 totals, activity per day and the latest activity
    GET    /super/users                    every account, all tiers
    POST   /super/users                    create an account with a tier
    PATCH  /super/users/{id}               change name, email, tier, or disable / enable
    POST   /super/users/{id}/password      set a new password for someone
    DELETE /super/users/{id}               delete an account and its inventory
    GET    /super/categories               food categories with the foods in each
    POST   /super/categories               add a category
    PUT    /super/categories/{name}        rename or describe a category
    DELETE /super/categories/{name}        remove an unused category
    GET    /super/foods                    every food id a recipe can use (bundled and added)
    GET    /super/recipes                  the recipe dataset used by content-based recommendation
    POST   /super/recipes                  add a recipe
    PUT    /super/recipes/{id}             edit a recipe
    DELETE /super/recipes/{id}             remove a recipe
    GET    /super/activity                 the system-wide activity log, filtered and paged

Every change made here is itself written to the activity log. A Super Admin cannot
change, disable or delete their own account from here, so the console can never be
left without someone who can sign in to it.
"""

from __future__ import annotations

import json
import re
import time
from collections import Counter
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

try:
    from . import auth
    from .accounts import check_password, clean_email, client_ip, get_db, require_super_admin, role_of
    from .db import ROLES, SEED_DIR, Database
except ImportError:  # `uvicorn server:app` from inside backend/
    import auth  # type: ignore[no-redef]
    from accounts import check_password, clean_email, client_ip, get_db, require_super_admin, role_of  # type: ignore[no-redef]
    from db import ROLES, SEED_DIR, Database  # type: ignore[no-redef]

router = APIRouter(prefix="/super")

CATEGORY_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9 &'-]{0,39}$")
COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")
RECIPE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,59}$")
TAG_PATTERN = re.compile(r"^[a-z][a-z0-9-]{0,23}$")
MAX_RECIPES = 1000
MAX_CATEGORIES = 40

# The foods that ship with the app (backend/seed/food_catalog.json, written by
# mobile/scripts/export-seed.js). Recipes may use these and any food an admin added.
_catalog_path = SEED_DIR / "food_catalog.json"
BUNDLED_FOODS: list[dict[str, str]] = (
    json.loads(_catalog_path.read_text(encoding="utf-8")) if _catalog_path.exists() else []
)


# ------------------------------------------------------------------ models
class UserCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    email: str = Field(max_length=254)
    password: str = Field(max_length=auth.MAX_PASSWORD_LENGTH)
    role: str = "employee"

    @field_validator("role")
    @classmethod
    def _role(cls, value: str) -> str:
        if value not in ROLES:
            raise ValueError(f"role must be one of {', '.join(ROLES)}")
        return value


class UserPatchIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    email: str | None = Field(default=None, max_length=254)
    role: str | None = None
    disabled: bool | None = None

    @field_validator("role")
    @classmethod
    def _role(cls, value: str | None) -> str | None:
        if value is not None and value not in ROLES:
            raise ValueError(f"role must be one of {', '.join(ROLES)}")
        return value


class PasswordIn(BaseModel):
    password: str = Field(max_length=auth.MAX_PASSWORD_LENGTH)


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    description: str = Field(default="", max_length=200)
    color: str = "#B86B4B"

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not CATEGORY_NAME_PATTERN.match(value):
            raise ValueError("start with a letter; use letters, digits, spaces, &, ' or -")
        if value.lower() == "all":
            raise ValueError("'All' is reserved for the app's show-everything tab")
        return value

    @field_validator("description")
    @classmethod
    def _description(cls, value: str) -> str:
        return value.strip()

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        if not COLOR_PATTERN.match(value):
            raise ValueError("color must be a hex colour such as #6F9B72")
        return value.upper()


class RecipeIn(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=80)
    ingredients: list[str] = Field(min_length=1, max_length=8)
    optional: list[str] = Field(default_factory=list, max_length=8)
    tags: list[str] = Field(default_factory=list, max_length=8)
    minutes: int = Field(ge=1, le=1440)
    summary: str = Field(default="", max_length=300)

    @field_validator("name", "summary")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("ingredients", "optional")
    @classmethod
    def _foods(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(v.strip() for v in values if v.strip()))

    @field_validator("tags")
    @classmethod
    def _tags(cls, values: list[str]) -> list[str]:
        tags = list(dict.fromkeys(v.strip().lower() for v in values if v.strip()))
        bad = [t for t in tags if not TAG_PATTERN.match(t)]
        if bad:
            raise ValueError(f"tags are single lowercase words (or hyphenated): {', '.join(bad)}")
        return tags


# ----------------------------------------------------------------- helpers
def _user_row(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": role_of(user),
        "storedRole": user["role"],
        "disabled": bool(user.get("disabled")),
        "items": user.get("items", 0),
        "createdAt": user["created_at"],
        "lastLoginAt": user.get("last_login_at"),
    }


def _target(db: Database, user_id: int, me: dict[str, Any], action: str) -> dict[str, Any]:
    target = db.get_user(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="No such account.")
    if target["id"] == me["id"]:
        raise HTTPException(status_code=409, detail=f"You cannot {action} your own account here.")
    return target


def _known_foods(db: Database) -> dict[str, dict[str, Any]]:
    """Every food a recipe may use: the bundled catalog with the server's entries laid over it."""
    foods = {f["id"]: {**f, "source": "bundled"} for f in BUNDLED_FOODS}
    for food in db.list_foods():
        source = "corrected" if food["id"] in foods else "added"
        foods[food["id"]] = {"id": food["id"], "name": food["name"], "category": food["category"], "source": source}
    return foods


def _check_recipe_foods(db: Database, body: RecipeIn) -> None:
    known = _known_foods(db)
    unknown = [f for f in body.ingredients + body.optional if f not in known]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown food id(s): {', '.join(unknown)}.")
    both = set(body.ingredients) & set(body.optional)
    if both:
        raise HTTPException(
            status_code=422, detail=f"A food cannot be both required and optional: {', '.join(sorted(both))}."
        )


def _recipe_record(recipe_id: str, body: RecipeIn) -> dict[str, Any]:
    return {
        "id": recipe_id,
        "name": body.name,
        "ingredients": body.ingredients,
        "optional": body.optional,
        "tags": body.tags,
        "minutes": body.minutes,
        "summary": body.summary,
    }


def _diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """What changed between two records, for the activity log."""
    return {key: {"from": before.get(key), "to": value} for key, value in after.items() if before.get(key) != value}


# ---------------------------------------------------------------- overview
@router.get("/overview")
def overview(_: dict[str, Any] = Depends(require_super_admin), db: Database = Depends(get_db)) -> dict[str, Any]:
    users = db.list_users()
    week_ago = time.time() - 7 * 86400
    by_role = Counter(role_of(u) for u in users)
    recent, _total = db.list_activity(limit=8)
    foods = Counter(f for f in db.all_item_foods() if f)
    names = {f["id"]: f["name"] for f in _known_foods(db).values()}
    return {
        "users": {
            "total": len(users),
            "byRole": {role: by_role.get(role, 0) for role in ROLES},
            "disabled": sum(1 for u in users if u["disabled"]),
            "activeThisWeek": sum(1 for u in users if (u["last_login_at"] or 0) >= week_ago),
        },
        "items": sum(u["items"] for u in users),
        "recipes": db.count_recipes(),
        "categories": len(db.list_categories()),
        "customFoods": len(db.list_foods()),
        "activityByDay": db.activity_by_day(14),
        "recentActivity": recent,
        "topFoods": [
            {"foodId": food, "name": names.get(food, food), "count": count} for food, count in foods.most_common(5)
        ],
    }


# ------------------------------------------------------------------- users
@router.get("/users")
def list_users(_: dict[str, Any] = Depends(require_super_admin), db: Database = Depends(get_db)) -> dict[str, Any]:
    return {"users": [_user_row(u) for u in db.list_users()]}


@router.post("/users", status_code=201)
def create_user(
    body: UserCreateIn,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    email = clean_email(body.email)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Enter a name.")
    check_password(body.password)
    user_id = db.create_user(email, name, auth.hash_password(body.password), role=body.role)
    if user_id is None:
        raise HTTPException(status_code=409, detail="An account with that email already exists.")
    db.log("user.created", actor=me, target=email, detail={"name": name, "role": body.role}, ip=client_ip(request))
    return {"user": _user_row({**db.get_user(user_id), "items": 0})}


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    body: UserPatchIn,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    target = db.get_user(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="No such account.")
    changes: dict[str, Any] = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Enter a name.")
        changes["name"] = name
    if body.email is not None:
        changes["email"] = clean_email(body.email)
    if body.role is not None:
        changes["role"] = body.role
    if body.disabled is not None:
        changes["disabled"] = int(body.disabled)
    changes = {k: v for k, v in changes.items() if target.get(k) != v}

    # Your own name and email are yours to fix; your own tier and access are not.
    if target["id"] == me["id"] and ({"role", "disabled"} & changes.keys()):
        raise HTTPException(status_code=409, detail="You cannot change your own tier or disable your own account.")
    if changes and not db.update_user(user_id, **changes):
        raise HTTPException(status_code=409, detail="Another account already uses that email.")

    if changes:
        before = {"name": target["name"], "email": target["email"], "role": target["role"], "disabled": target["disabled"]}
        detail = _diff(before, changes)
        action = "user.updated"
        if changes.keys() == {"disabled"}:
            action = "user.disabled" if changes["disabled"] else "user.enabled"
        elif changes.keys() == {"role"}:
            action = "user.role_changed"
            detail = {"from": role_of(target), "to": changes["role"]}
        db.log(action, actor=me, target=changes.get("email", target["email"]), detail=detail, ip=client_ip(request))

    updated = next(u for u in db.list_users() if u["id"] == user_id)
    return {"user": _user_row(updated)}


@router.post("/users/{user_id}/password")
def set_password(
    user_id: int,
    body: PasswordIn,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    target = _target(db, user_id, me, "reset the password of")
    check_password(body.password)
    db.set_password(user_id, auth.hash_password(body.password))
    db.log("user.password_set", actor=me, target=target["email"], ip=client_ip(request))
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    target = _target(db, user_id, me, "delete")
    items = db.count_items(user_id)
    db.delete_user(user_id)
    db.log(
        "user.deleted",
        actor=me,
        target=target["email"],
        detail={"name": target["name"], "role": role_of(target), "items": items},
        ip=client_ip(request),
    )
    return {"deleted": True}


# -------------------------------------------------------------- categories
@router.get("/categories")
def list_categories(_: dict[str, Any] = Depends(require_super_admin), db: Database = Depends(get_db)) -> dict[str, Any]:
    foods = sorted(_known_foods(db).values(), key=lambda f: f["name"].lower())
    categories = []
    for category in db.list_categories():
        members = [f for f in foods if f["category"].lower() == category["name"].lower()]
        categories.append({**category, "foods": members})
    return {"categories": categories}


@router.post("/categories", status_code=201)
def create_category(
    body: CategoryIn,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    if len(db.list_categories()) >= MAX_CATEGORIES:
        raise HTTPException(status_code=409, detail=f"There can be at most {MAX_CATEGORIES} categories.")
    if not db.create_category(body.name, body.description, body.color):
        raise HTTPException(status_code=409, detail="A category with that name already exists.")
    db.log("category.added", actor=me, target=body.name, detail={"color": body.color}, ip=client_ip(request))
    return {"category": db.get_category(body.name)}


@router.put("/categories/{name}")
def update_category(
    name: str,
    body: CategoryIn,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    current = db.get_category(name)
    if not current:
        raise HTTPException(status_code=404, detail="No such category.")
    if current["builtin"] and body.name != current["name"]:
        raise HTTPException(
            status_code=409, detail="Built-in categories cannot be renamed; the app's own foods use these names."
        )
    if not db.update_category(current["name"], body.name, body.description, body.color):
        raise HTTPException(status_code=409, detail="A category with that name already exists.")
    detail = _diff(current, {"name": body.name, "description": body.description, "color": body.color})
    db.log("category.updated", actor=me, target=body.name, detail=detail, ip=client_ip(request))
    return {"category": db.get_category(body.name)}


@router.delete("/categories/{name}")
def delete_category(
    name: str,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    current = db.get_category(name)
    if not current:
        raise HTTPException(status_code=404, detail="No such category.")
    if current["builtin"]:
        raise HTTPException(status_code=409, detail="Built-in categories cannot be removed.")
    used = [f["name"] for f in _known_foods(db).values() if f["category"].lower() == current["name"].lower()]
    if used:
        raise HTTPException(
            status_code=409,
            detail=f"Move these foods to another category first: {', '.join(sorted(used))}.",
        )
    db.delete_category(current["name"])
    db.log("category.removed", actor=me, target=current["name"], ip=client_ip(request))
    return {"deleted": True}


# ----------------------------------------------------------------- recipes
@router.get("/foods")
def known_foods(_: dict[str, Any] = Depends(require_super_admin), db: Database = Depends(get_db)) -> dict[str, Any]:
    return {"foods": sorted(_known_foods(db).values(), key=lambda f: f["name"].lower())}


@router.get("/recipes")
def list_recipes(_: dict[str, Any] = Depends(require_super_admin), db: Database = Depends(get_db)) -> dict[str, Any]:
    return {"version": db.recipes_version(), "recipes": db.list_recipes()}


@router.post("/recipes", status_code=201)
def create_recipe(
    body: RecipeIn,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    recipe_id = (body.id or "").strip() or re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")[:60]
    if not RECIPE_ID_PATTERN.match(recipe_id):
        raise HTTPException(status_code=422, detail="Use 2-60 lowercase letters, digits or hyphens for the id.")
    if db.recipe_exists(recipe_id):
        raise HTTPException(status_code=409, detail=f"A recipe with the id '{recipe_id}' already exists.")
    if db.count_recipes() >= MAX_RECIPES:
        raise HTTPException(status_code=409, detail="The recipe dataset is full.")
    _check_recipe_foods(db, body)
    recipe = _recipe_record(recipe_id, body)
    db.upsert_recipe(recipe_id, recipe, me["id"])
    db.log("recipe.added", actor=me, target=recipe_id, detail={"name": recipe["name"]}, ip=client_ip(request))
    return {"recipe": recipe, "version": db.recipes_version()}


@router.put("/recipes/{recipe_id}")
def update_recipe(
    recipe_id: str,
    body: RecipeIn,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    before = next((r for r in db.list_recipes() if r["id"] == recipe_id), None)
    if not before:
        raise HTTPException(status_code=404, detail="No such recipe.")
    _check_recipe_foods(db, body)
    recipe = _recipe_record(recipe_id, body)
    db.upsert_recipe(recipe_id, recipe, me["id"])
    db.log("recipe.updated", actor=me, target=recipe_id, detail=_diff(before, recipe), ip=client_ip(request))
    return {"recipe": recipe, "version": db.recipes_version()}


@router.delete("/recipes/{recipe_id}")
def delete_recipe(
    recipe_id: str,
    request: Request,
    me: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    before = next((r for r in db.list_recipes() if r["id"] == recipe_id), None)
    if not before or not db.delete_recipe(recipe_id):
        raise HTTPException(status_code=404, detail="No such recipe.")
    db.log("recipe.removed", actor=me, target=recipe_id, detail={"name": before["name"]}, ip=client_ip(request))
    return {"deleted": True, "version": db.recipes_version()}


# ---------------------------------------------------------------- activity
@router.get("/activity")
def activity(
    action: str | None = Query(None, max_length=60, description="An action, or its group such as 'auth'"),
    actor: str | None = Query(None, max_length=254, description="Part of the actor's name or email"),
    q: str | None = Query(None, max_length=120, description="Free text across action, target, actor and details"),
    since: float | None = Query(None, description="Unix time, inclusive"),
    until: float | None = Query(None, description="Unix time, exclusive"),
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    _: dict[str, Any] = Depends(require_super_admin),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    entries, total = db.list_activity(action, actor, q, since, until, limit, offset)
    return {"entries": entries, "total": total, "actions": db.activity_actions()}
