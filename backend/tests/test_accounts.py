"""Functional test cases: sign-up, sign-in, sessions and password reset."""

from __future__ import annotations

import sqlite3

from backend import auth

from .conftest import PASSWORD, register


def test_TC_F_AUTH_01_register_creates_account_and_session(client):
    session = register(client, email="Ana@Example.com", name="  Ana  ")
    assert session["user"]["email"] == "ana@example.com"
    assert session["user"]["name"] == "Ana"
    assert client.get("/auth/me", headers=session["headers"]).json()["user"]["id"] == session["user"]["id"]


def test_TC_F_AUTH_02_duplicate_email_is_rejected_case_insensitively(client):
    register(client, email="ana@example.com")
    again = client.post("/auth/register", json={"name": "Other", "email": "ANA@example.com", "password": PASSWORD})
    assert again.status_code == 409


def test_TC_F_AUTH_03_weak_or_malformed_input_is_rejected(client):
    short = client.post("/auth/register", json={"name": "A", "email": "a@b.co", "password": "short"})
    assert short.status_code == 422 and "at least 8" in short.json()["detail"]
    bad_email = client.post("/auth/register", json={"name": "A", "email": "not-an-email", "password": PASSWORD})
    assert bad_email.status_code == 422
    no_name = client.post("/auth/register", json={"name": "   ", "email": "a@b.co", "password": PASSWORD})
    assert no_name.status_code == 422


def test_TC_F_AUTH_04_login_succeeds_with_correct_password(client):
    register(client)
    response = client.post("/auth/login", json={"email": "ANA@example.com", "password": PASSWORD})
    assert response.status_code == 200 and response.json()["token"]


def test_TC_F_AUTH_05_login_failure_does_not_reveal_which_part_was_wrong(client):
    register(client)
    wrong_password = client.post("/auth/login", json={"email": "ana@example.com", "password": "wrong password"})
    unknown_email = client.post("/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_TC_F_AUTH_06_repeated_failures_lock_the_account_temporarily(client):
    register(client)
    for _ in range(5):
        assert client.post("/auth/login", json={"email": "ana@example.com", "password": "nope nope"}).status_code == 401
    locked = client.post("/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert locked.status_code == 429 and int(locked.headers["Retry-After"]) > 0


def test_TC_F_AUTH_07_protected_routes_need_a_valid_unexpired_token(client):
    session = register(client)
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401

    body, signature = session["token"].rsplit(".", 1)
    forged = f"{body}.{'A' if signature[0] != 'A' else 'B'}{signature[1:]}"
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401

    expired = auth.create_token(session["user"]["id"], ttl=-5)
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_TC_F_AUTH_08_password_is_stored_hashed_never_in_plaintext(client, app):
    register(client)
    with sqlite3.connect(app.state.db.path) as conn:
        stored = conn.execute("SELECT password_hash FROM users").fetchone()[0]
    assert stored.startswith("scrypt$") and PASSWORD not in stored


def test_TC_F_AUTH_09_forgot_password_reply_is_identical_for_unknown_emails(client):
    register(client)
    known = client.post("/auth/forgot", json={"email": "ana@example.com"}).json()
    unknown = client.post("/auth/forgot", json={"email": "nobody@example.com"}).json()
    assert known["message"] == unknown["message"]
    assert "devCode" in known and "devCode" not in unknown


def test_TC_F_AUTH_10_full_password_reset_flow(client):
    register(client)
    code = client.post("/auth/forgot", json={"email": "ana@example.com"}).json()["devCode"]

    wrong = client.post("/auth/verify-code", json={"email": "ana@example.com", "code": "000000" if code != "000000" else "111111"})
    assert wrong.status_code == 400

    verified = client.post("/auth/verify-code", json={"email": "ana@example.com", "code": code})
    assert verified.status_code == 200
    reset_token = verified.json()["resetToken"]

    # A code works once: it is consumed on success.
    assert client.post("/auth/verify-code", json={"email": "ana@example.com", "code": code}).status_code == 400

    new_password = "a brand new password"
    assert client.post("/auth/reset-password", json={"resetToken": reset_token, "newPassword": new_password}).status_code == 200
    assert client.post("/auth/login", json={"email": "ana@example.com", "password": new_password}).status_code == 200
    assert client.post("/auth/login", json={"email": "ana@example.com", "password": PASSWORD}).status_code == 401


def test_TC_F_AUTH_11_reset_code_locks_after_too_many_wrong_guesses(client):
    register(client)
    code = client.post("/auth/forgot", json={"email": "ana@example.com"}).json()["devCode"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert client.post("/auth/verify-code", json={"email": "ana@example.com", "code": wrong}).status_code == 400
    locked = client.post("/auth/verify-code", json={"email": "ana@example.com", "code": code})
    assert locked.status_code == 429


def test_TC_F_AUTH_12_token_kinds_cannot_be_swapped(client):
    session = register(client)
    reset_token = auth.create_token(session["user"]["id"], kind="reset")
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {reset_token}"}).status_code == 401
    as_reset = client.post("/auth/reset-password", json={"resetToken": session["token"], "newPassword": "another password"})
    assert as_reset.status_code == 400


def test_TC_F_AUTH_13_change_password_requires_the_current_password(client):
    session = register(client)
    refused = client.post(
        "/auth/change-password",
        headers=session["headers"],
        json={"currentPassword": "not it", "newPassword": "a brand new password"},
    )
    assert refused.status_code == 403
    changed = client.post(
        "/auth/change-password",
        headers=session["headers"],
        json={"currentPassword": PASSWORD, "newPassword": "a brand new password"},
    )
    assert changed.status_code == 200
    assert client.post("/auth/login", json={"email": "ana@example.com", "password": "a brand new password"}).status_code == 200
