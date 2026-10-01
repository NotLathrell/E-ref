"""Password hashing, signed session tokens and reset codes.

Everything here uses the standard library (scrypt + HMAC-SHA256), so accounts keep
working on machines where compiled crypto wheels are blocked or unavailable.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from typing import Any

DATA_DIR = Path(os.getenv("EREF_DATA_DIR", str(Path(__file__).resolve().parent / "data")))

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1

ACCESS_TTL_SECONDS = 30 * 24 * 3600
RESET_TTL_SECONDS = 10 * 60
CODE_TTL_SECONDS = 15 * 60
MAX_CODE_ATTEMPTS = 5

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"), salt=_unb64(salt), n=int(n), r=int(r), p=int(p), dklen=32
        )
        return hmac.compare_digest(digest, _unb64(expected))
    except (ValueError, TypeError):
        return False


# Verifying against this when an email is unknown keeps login timing the same for
# existing and non-existing accounts, so the response time does not reveal which
# emails are registered.
DUMMY_HASH = hash_password("timing-equalizer")


def _secret() -> bytes:
    env = os.getenv("EREF_SECRET")
    if env:
        return env.encode("utf-8")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "secret.key"
    if not path.exists():
        path.write_bytes(secrets.token_bytes(32))
        try:
            path.chmod(0o600)
        except OSError:
            pass
    return path.read_bytes()


def _sign(body: str) -> str:
    return _b64(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())


def create_token(subject: int, kind: str = "access", ttl: int | None = None, **extra: Any) -> str:
    if ttl is None:
        ttl = ACCESS_TTL_SECONDS if kind == "access" else RESET_TTL_SECONDS
    payload = {"sub": subject, "typ": kind, "exp": int(time.time()) + ttl, **extra}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"v1.{body}.{_sign(body)}"


def decode_token(token: str, kind: str = "access") -> dict[str, Any] | None:
    """The token's claims, or None if it is malformed, forged, expired or the wrong kind."""
    try:
        version, body, signature = token.split(".")
        if version != "v1" or not hmac.compare_digest(signature, _sign(body)):
            return None
        claims = json.loads(_unb64(body))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    if claims.get("typ") != kind or int(claims.get("exp", 0)) < time.time():
        return None
    return claims


def new_reset_code() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def hash_code(email: str, code: str) -> str:
    return _b64(hmac.new(_secret(), f"{email}:{code}".encode("utf-8"), hashlib.sha256).digest())


class LoginThrottle:
    """Blocks an account after repeated failed logins, so passwords cannot be guessed at speed."""

    def __init__(self, limit: int = 5, window_seconds: int = 15 * 60) -> None:
        self.limit = limit
        self.window = window_seconds
        self._failures: dict[str, list[float]] = {}

    def _recent(self, key: str) -> list[float]:
        cutoff = time.time() - self.window
        recent = [t for t in self._failures.get(key, []) if t > cutoff]
        self._failures[key] = recent
        return recent

    def retry_after(self, key: str) -> int:
        """Seconds until another attempt is allowed; 0 if the account is not locked."""
        recent = self._recent(key)
        if len(recent) < self.limit:
            return 0
        return max(1, int(recent[0] + self.window - time.time()))

    def record_failure(self, key: str) -> None:
        self._recent(key).append(time.time())

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)
