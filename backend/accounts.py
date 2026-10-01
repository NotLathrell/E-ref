"""Account and inventory endpoints.

    POST   /auth/register          create an account
    POST   /auth/login             sign in
    GET    /auth/me                the signed-in user
    POST   /auth/forgot            email a 6-digit reset code
    POST   /auth/verify-code       exchange a valid code for a short-lived reset token
    POST   /auth/reset-password    set a new password with a reset token
    POST   /auth/change-password   change password while signed in

Administrator and food-database endpoints are in admin.py, and the Super Admin web
console's endpoints in superadmin.py. Accounts have one of three tiers: ``super_admin``
(the web console), ``admin`` (edits the food database from the app) and ``employee``.
The first account created on a fresh install is the Super Admin; ``EREF_ADMIN_EMAILS``
makes more accounts admins. Sign-ins, password changes and inventory changes are
written to the activity log.

    GET    /inventory              every item the user has saved
    PUT    /inventory/{id}         create or update one item
    DELETE /inventory/{id}         remove one item
    POST   /inventory/sync         upload many items at once and get the merged list back
"""

from __future__ import annotations

import hmac
import json
import os
import re
import time
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

try:
    from . import auth, mailer
    from .db import Database
except ImportError:  # `uvicorn server:app` from inside backend/
    import auth  # type: ignore[no-redef]
    import mailer  # type: ignore[no-redef]
    from db import Database  # type: ignore[no-redef]

router = APIRouter()
throttle = auth.LoginThrottle()

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ITEM_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
MAX_ITEM_BYTES = 32 * 1024
MAX_ITEMS_PER_USER = 2000
MAX_SYNC_BATCH = 500
GENERIC_FORGOT_MESSAGE = "If that email is registered, a verification code has been sent."


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    email: str = Field(max_length=254)
    password: str = Field(max_length=auth.MAX_PASSWORD_LENGTH)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=auth.MAX_PASSWORD_LENGTH)


class ForgotIn(BaseModel):
    email: str = Field(max_length=254)


class VerifyIn(BaseModel):
    email: str = Field(max_length=254)
    code: str = Field(max_length=12)


class ResetIn(BaseModel):
    resetToken: str
    newPassword: str = Field(max_length=auth.MAX_PASSWORD_LENGTH)


class ChangeIn(BaseModel):
    currentPassword: str = Field(max_length=auth.MAX_PASSWORD_LENGTH)
    newPassword: str = Field(max_length=auth.MAX_PASSWORD_LENGTH)


class SyncIn(BaseModel):
    items: list[dict[str, Any]]


def get_db(request: Request) -> Database:
    return request.app.state.db


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


DISABLED_MESSAGE = "This account has been disabled. Contact your administrator."


def current_user(db: Database = Depends(get_db), authorization: str | None = Header(default=None)) -> dict[str, Any]:
    scheme, _, token = (authorization or "").partition(" ")
    claims = auth.decode_token(token) if scheme.lower() == "bearer" and token else None
    user = db.get_user(int(claims["sub"])) if claims else None
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in again.", headers={"WWW-Authenticate": "Bearer"})
    # 401, not 403, so the app signs a disabled account out instead of retrying.
    if user.get("disabled"):
        raise HTTPException(status_code=401, detail=DISABLED_MESSAGE, headers={"WWW-Authenticate": "Bearer"})
    user["role"] = role_of(user)
    return user


def admin_emails() -> set[str]:
    """Emails made administrators through ``EREF_ADMIN_EMAILS`` (comma separated)."""
    return {e.strip().lower() for e in os.getenv("EREF_ADMIN_EMAILS", "").split(",") if e.strip()}


def role_of(user: dict[str, Any]) -> str:
    """The account's effective tier: its stored role, raised to admin by ``EREF_ADMIN_EMAILS``."""
    role = user.get("role")
    if role == "super_admin":
        return role
    if role == "admin" or user["email"].lower() in admin_emails():
        return "admin"
    return "employee"


def is_admin(user: dict[str, Any]) -> bool:
    """Admins and Super Admins may edit the food database."""
    return role_of(user) in ("super_admin", "admin")


def is_super_admin(user: dict[str, Any]) -> bool:
    return role_of(user) == "super_admin"


def require_admin(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    return user


def require_super_admin(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if not is_super_admin(user):
        raise HTTPException(status_code=403, detail="Super Admin access is required.")
    return user


def _public(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": role_of(user),
    }


def clean_email(raw: str) -> str:
    email = raw.strip().lower()
    if not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return email


def check_password(password: str) -> None:
    if len(password) < auth.MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=422, detail=f"Password must be at least {auth.MIN_PASSWORD_LENGTH} characters."
        )


def _session(user: dict[str, Any]) -> dict[str, Any]:
    return {"token": auth.create_token(user["id"]), "user": _public(user)}


# ------------------------------------------------------------------- auth
@router.post("/auth/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Database = Depends(get_db)) -> dict[str, Any]:
    email = clean_email(body.email)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Enter your name.")
    check_password(body.password)

    user_id = db.create_user(email, name, auth.hash_password(body.password))
    if user_id is None:
        raise HTTPException(status_code=409, detail="An account with that email already exists.")
    user = db.get_user(user_id)
    db.log("auth.register", actor={**user, "role": role_of(user)}, target=email, ip=client_ip(request))
    return _session(user)


@router.post("/auth/login")
def login(body: LoginIn, request: Request, db: Database = Depends(get_db)) -> dict[str, Any]:
    email = body.email.strip().lower()
    ip = client_ip(request)

    wait = throttle.retry_after(email)
    if wait:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {max(1, wait // 60)} minute(s).",
            headers={"Retry-After": str(wait)},
        )

    user = db.get_user_by_email(email)
    valid = auth.verify_password(body.password, user["password_hash"] if user else auth.DUMMY_HASH)
    if not user or not valid:
        throttle.record_failure(email)
        db.log("auth.login_failed", actor_email=email[:254], target=email[:254], ip=ip)
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    throttle.reset(email)
    # Checked only after the password, so a wrong guess cannot tell that an account exists.
    if user.get("disabled"):
        db.log("auth.login_blocked", actor={**user, "role": role_of(user)}, target=email, ip=ip)
        raise HTTPException(status_code=403, detail=DISABLED_MESSAGE)
    db.mark_login(user["id"])
    db.log("auth.login", actor={**user, "role": role_of(user)}, target=email, ip=ip)
    return _session(user)


@router.get("/auth/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"user": _public(user)}


@router.post("/auth/forgot")
def forgot(body: ForgotIn, request: Request, db: Database = Depends(get_db)) -> dict[str, Any]:
    email = body.email.strip().lower()
    response: dict[str, Any] = {"ok": True, "message": GENERIC_FORGOT_MESSAGE}

    # The reply is identical whether or not the email exists, so it cannot be used
    # to find out who has an account.
    user = db.get_user_by_email(email) if EMAIL_PATTERN.match(email) else None
    if user:
        code = auth.new_reset_code()
        db.save_reset_code(email, auth.hash_code(email, code), time.time() + auth.CODE_TTL_SECONDS)
        mailer.send_reset_code(email, code)
        db.log("auth.reset_requested", actor={**user, "role": role_of(user)}, target=email, ip=client_ip(request))
        if os.getenv("EREF_DEV_RETURN_CODE") == "1":
            response["devCode"] = code
    return response


@router.post("/auth/verify-code")
def verify_code(body: VerifyIn, db: Database = Depends(get_db)) -> dict[str, Any]:
    email = body.email.strip().lower()
    bad = HTTPException(status_code=400, detail="That code is invalid or has expired.")

    record = db.get_reset_code(email)
    user = db.get_user_by_email(email)
    if not record or not user or record["expires_at"] < time.time():
        raise bad
    if record["attempts"] >= auth.MAX_CODE_ATTEMPTS:
        db.delete_reset_code(email)
        raise HTTPException(status_code=429, detail="Too many wrong codes. Request a new one.")

    if not hmac.compare_digest(record["code_hash"], auth.hash_code(email, body.code.strip())):
        db.bump_reset_attempts(email)
        raise bad

    db.delete_reset_code(email)
    return {"resetToken": auth.create_token(user["id"], kind="reset")}


@router.post("/auth/reset-password")
def reset_password(body: ResetIn, request: Request, db: Database = Depends(get_db)) -> dict[str, Any]:
    claims = auth.decode_token(body.resetToken, kind="reset")
    user = db.get_user(int(claims["sub"])) if claims else None
    if not user:
        raise HTTPException(status_code=400, detail="This reset link has expired. Start again.")
    check_password(body.newPassword)

    db.set_password(user["id"], auth.hash_password(body.newPassword))
    throttle.reset(user["email"])
    db.log("auth.password_reset", actor={**user, "role": role_of(user)}, target=user["email"], ip=client_ip(request))
    return {"ok": True}


@router.post("/auth/change-password")
def change_password(
    body: ChangeIn,
    request: Request,
    user: dict[str, Any] = Depends(current_user),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    if not auth.verify_password(body.currentPassword, user["password_hash"]):
        raise HTTPException(status_code=403, detail="Your current password is incorrect.")
    check_password(body.newPassword)

    db.set_password(user["id"], auth.hash_password(body.newPassword))
    db.log("auth.password_changed", actor=user, target=user["email"], ip=client_ip(request))
    return {"ok": True}


# -------------------------------------------------------------- inventory
def _validated_item(item: dict[str, Any], expected_id: str | None = None) -> tuple[str, str]:
    """The item's id and updatedAt, or an HTTP error if the item is not acceptable."""
    item_id = item.get("id")
    if not isinstance(item_id, str) or not ITEM_ID_PATTERN.match(item_id):
        raise HTTPException(status_code=422, detail="Every item needs a valid id.")
    if expected_id is not None and item_id != expected_id:
        raise HTTPException(status_code=422, detail="The item id does not match the URL.")
    if not isinstance(item.get("foodId"), str):
        raise HTTPException(status_code=422, detail="Every item needs a foodId.")
    if len(json.dumps(item)) > MAX_ITEM_BYTES:
        raise HTTPException(status_code=413, detail="That item is too large.")
    updated_at = item.get("updatedAt")
    if not isinstance(updated_at, str) or not updated_at:
        updated_at = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        item["updatedAt"] = updated_at
    return item_id, updated_at


def _room_for_new_item(db: Database, user_id: int, item_id: str) -> None:
    if not db.item_exists(user_id, item_id) and db.count_items(user_id) >= MAX_ITEMS_PER_USER:
        raise HTTPException(status_code=409, detail="Inventory limit reached.")


@router.get("/inventory")
def list_inventory(user: dict[str, Any] = Depends(current_user), db: Database = Depends(get_db)) -> dict[str, Any]:
    return {"items": db.list_items(user["id"])}


@router.put("/inventory/{item_id}")
def put_item(
    item_id: str,
    item: dict[str, Any],
    request: Request,
    user: dict[str, Any] = Depends(current_user),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    _, updated_at = _validated_item(item, expected_id=item_id)
    _room_for_new_item(db, user["id"], item_id)
    saved = db.upsert_item(user["id"], item_id, item, updated_at)
    db.log("inventory.item_saved", actor=user, target=item_id, detail={"foodId": item["foodId"]}, ip=client_ip(request))
    return {"item": saved}


@router.delete("/inventory/{item_id}")
def delete_item(
    item_id: str,
    request: Request,
    user: dict[str, Any] = Depends(current_user),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    if db.item_exists(user["id"], item_id):
        db.delete_item(user["id"], item_id)
        db.log("inventory.item_deleted", actor=user, target=item_id, ip=client_ip(request))
    return {"deleted": True}


@router.post("/inventory/sync")
def sync_inventory(
    body: SyncIn,
    request: Request,
    user: dict[str, Any] = Depends(current_user),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    if len(body.items) > MAX_SYNC_BATCH:
        raise HTTPException(status_code=413, detail=f"Send at most {MAX_SYNC_BATCH} items at a time.")

    rejected: list[str] = []
    for item in body.items:
        try:
            item_id, updated_at = _validated_item(item)
            _room_for_new_item(db, user["id"], item_id)
        except HTTPException:
            rejected.append(str(item.get("id", "?")))
            continue
        db.upsert_item(user["id"], item_id, item, updated_at)
    # A sync with nothing to upload is only a refresh, which the app does on every start.
    if body.items:
        db.log(
            "inventory.synced",
            actor=user,
            detail={"uploaded": len(body.items) - len(rejected), "rejected": len(rejected)},
            ip=client_ip(request),
        )
    return {"items": db.list_items(user["id"]), "rejected": rejected}
