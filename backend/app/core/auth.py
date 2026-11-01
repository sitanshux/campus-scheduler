"""
Fail-closed JWT verification for Supabase Auth tokens.

Design (from v4 plan §3, updated for ES256):
- Algorithm is explicitly configured (RS256, ES256, or HS256). No runtime fallback.
- RS256/ES256 use JWKS endpoint with a bounded stale cache (24 h max).
  On unknown ``kid``, JWKS is re-fetched once (key rotation support).
- HS256 uses a symmetric secret from the environment.
- Token claims validated: ``kid``, ``alg``, ``iss``, ``aud``, ``exp``, ``sub``.
- ``get_current_user`` extracts the JWT and returns ``{user_id, email}``.
- ``get_verified_user`` enriches with authoritative DB profile fields.

At startup (``init_jwks()``), RS256/ES256 mode fetches JWKS. If unreachable,
the application refuses to start — it must not serve authenticated
requests if it cannot verify tokens.
"""

from __future__ import annotations

import logging
import time

import httpx
from fastapi import Depends, HTTPException, Request
from jose import jwt, jwk, JWTError
from jose.exceptions import JOSEError
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════
# Demo-Mode Token Support (hackathon judging)
# ═══════════════════════════════════════════════════════

_DEMO_USERS: dict[str, dict] = {
    "demo-token-admin": {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "email": "admin@test.cit.edu",
        "full_name": "System Administrator",
        "role": "admin",
        "department": None,
        "faculty_id": None,
    },
    "demo-token-department_coordinator": {
        "user_id": "00000000-0000-0000-0000-000000000002",
        "email": "department_coordinator@test.cit.edu",
        "full_name": "Dr. Ananya Mishra (CSE Coordinator)",
        "role": "department_coordinator",
        "department": "CSE",
        "faculty_id": None,
    },
    "demo-token-faculty": {
        "user_id": "00000000-0000-0000-0000-000000000003",
        "email": "faculty@test.cit.edu",
        "full_name": "Dr. Ananya Mishra",
        "role": "faculty",
        "department": "CSE",
        "faculty_id": "F01",
    },
    "demo-token-club": {
        "user_id": "00000000-0000-0000-0000-000000000004",
        "email": "club@test.cit.edu",
        "full_name": "Coding Club & IEEE Lead",
        "role": "club",
        "department": None,
        "faculty_id": None,
    },
}


def _resolve_demo_token(token: str) -> dict | None:
    """If DEMO_MODE is on and the token matches a demo fixture, return the user dict."""
    if not settings.demo_mode:
        return None
    # Exact match first
    if token in _DEMO_USERS:
        return dict(_DEMO_USERS[token])
    # Also accept tokens like "token-admin" from the generic login fallback
    for suffix, user in _DEMO_USERS.items():
        role = suffix.removeprefix("demo-token-")
        if token == f"token-{role}":
            return dict(user)
    return None

# ═══════════════════════════════════════════════════════
# JWKS Cache
# ═══════════════════════════════════════════════════════

_JWKS_REFRESH_SECONDS = 3600  # Normal refresh interval: 1 hour
_JWKS_MAX_STALE_SECONDS = 86400  # Hard limit: 24 hours

# Algorithms that use JWKS for public-key verification
_JWKS_ALGORITHMS = frozenset({"RS256", "ES256"})

_jwks_cache: dict = {
    "keys": {},  # kid -> key_data (JWK dict)
    "fetched_at": 0.0,
    "last_success_at": 0.0,
}


def _fetch_jwks() -> dict[str, dict]:
    """Fetch JWKS from the Supabase Auth well-known endpoint.

    Returns
    -------
    dict[str, dict]
        Mapping of ``kid`` to JWK dict.
    """
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10.0)
    resp.raise_for_status()
    keys = resp.json().get("keys", [])
    return {k["kid"]: k for k in keys if "kid" in k}


def _refresh_jwks(*, force: bool = False) -> dict[str, dict]:
    """Refresh the JWKS cache.

    Returns the current keys (fresh or stale-but-within-limit).
    Raises ``RuntimeError`` if keys are unavailable and stale cache
    has expired.
    """
    now = time.time()

    # Skip refresh if cache is fresh enough (unless forced)
    if not force and (now - _jwks_cache["fetched_at"]) < _JWKS_REFRESH_SECONDS:
        return _jwks_cache["keys"]

    try:
        keys = _fetch_jwks()
        _jwks_cache["keys"] = keys
        _jwks_cache["fetched_at"] = now
        _jwks_cache["last_success_at"] = now
        return keys
    except Exception as exc:
        logger.warning("JWKS fetch failed: %s", exc)
        stale_age = now - _jwks_cache["last_success_at"]
        if _jwks_cache["keys"] and stale_age < _JWKS_MAX_STALE_SECONDS:
            logger.warning(
                "Using stale JWKS cache (%.0fs old)", stale_age
            )
            _jwks_cache["fetched_at"] = now  # back off before retrying
            return _jwks_cache["keys"]
        raise RuntimeError(
            f"JWKS unavailable and stale cache expired "
            f"({stale_age:.0f}s > {_JWKS_MAX_STALE_SECONDS}s)"
        ) from exc


def init_jwks() -> None:
    """Initialise JWKS at application startup.

    Called from the FastAPI lifespan handler. In RS256/ES256 mode,
    if JWKS is unreachable the application refuses to start.
    """
    if settings.jwt_algorithm in _JWKS_ALGORITHMS:
        _refresh_jwks(force=True)
        if not _jwks_cache["keys"]:
            raise RuntimeError("No keys found in JWKS endpoint")
        logger.info(
            "JWKS initialised with %d key(s) for %s",
            len(_jwks_cache["keys"]),
            settings.jwt_algorithm,
        )


# ═══════════════════════════════════════════════════════
# Token Decoding
# ═══════════════════════════════════════════════════════

_COMMON_DECODE_OPTIONS: dict = {
    "options": {
        "require_exp": True,
        "require_iat": True,
        "require_sub": True,
        "verify_exp": True,
        "verify_aud": True,
        "verify_iss": True,
    },
    "audience": "authenticated",
}


def _decode_token(token: str) -> dict:
    """Decode and verify a Supabase JWT.  Fail-closed: no algorithm fallback."""
    issuer = f"{settings.supabase_url}/auth/v1"

    if settings.jwt_algorithm == "RS256":
        return _decode_jwks(token, issuer, "RS256")
    elif settings.jwt_algorithm == "ES256":
        return _decode_jwks(token, issuer, "ES256")
    elif settings.jwt_algorithm == "HS256":
        return _decode_hs256(token, issuer)
    else:
        raise JWTError(
            f"Unsupported JWT algorithm: {settings.jwt_algorithm}"
        )


def _decode_jwks(token: str, issuer: str, expected_alg: str) -> dict:
    """Verify token with JWKS (RS256 or ES256).  Re-fetches on ``kid`` miss."""
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    alg = header.get("alg")

    if alg != expected_alg:
        raise JWTError(
            f"Token algorithm '{alg}' does not match configured {expected_alg}"
        )
    if not kid:
        raise JWTError("Token missing kid header")

    # Try cached key first
    keys = _refresh_jwks()
    if kid not in keys:
        # Key rotation: force immediate re-fetch
        keys = _refresh_jwks(force=True)
    if kid not in keys:
        raise JWTError(f"Unknown kid '{kid}' — not in JWKS")

    public_key = jwk.construct(keys[kid])
    return jwt.decode(
        token,
        public_key,
        algorithms=[expected_alg],
        issuer=issuer,
        **_COMMON_DECODE_OPTIONS,
    )


def _decode_hs256(token: str, issuer: str) -> dict:
    """Verify token with symmetric secret (HS256)."""
    if not settings.supabase_jwt_secret:
        raise JWTError("HS256 configured but SUPABASE_JWT_SECRET is empty")

    header = jwt.get_unverified_header(token)
    if header.get("alg") != "HS256":
        raise JWTError(
            f"Token algorithm '{header.get('alg')}' "
            f"does not match configured HS256"
        )

    return jwt.decode(
        token,
        settings.supabase_jwt_secret,
        algorithms=["HS256"],
        issuer=issuer,
        **_COMMON_DECODE_OPTIONS,
    )


# ═══════════════════════════════════════════════════════
# FastAPI Dependencies
# ═══════════════════════════════════════════════════════


def get_current_user(request: Request) -> dict:
    """Extract and verify the Supabase JWT from the Authorization header.

    Returns
    -------
    dict
        ``{"user_id": str, "email": str | None}``

    Raises
    ------
    HTTPException (401)
        If the token is missing, malformed, or fails verification.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing access token")

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing access token")

    # Demo-mode shortcut: recognise fixture tokens without JWT verification
    demo_user = _resolve_demo_token(token)
    if demo_user is not None:
        return demo_user

    try:
        payload = _decode_token(token)
    except (JOSEError, RuntimeError) as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=401, detail="Token missing sub claim"
        )

    return {"user_id": sub, "email": payload.get("email")}


def get_verified_user(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Fetch the authoritative profile from the database.

    This is the single source of truth for ``full_name``, ``role``,
    ``department``, and ``faculty_id``.  Client-supplied values for
    these fields are **never** trusted.

    In demo mode, the profile fields are already populated by
    ``_resolve_demo_token`` and no DB lookup is needed.

    Returns
    -------
    dict
        The ``user`` dict enriched with ``full_name``, ``role``,
        ``department``, ``faculty_id``.

    Raises
    ------
    HTTPException (403)
        If no profile row exists for this user.
    """
    # Demo-mode users already carry all profile fields
    if "role" in user and "full_name" in user:
        return user

    row = db.execute(
        text(
            "SELECT full_name, role, department, faculty_id "
            "FROM profiles WHERE id = :uid"
        ),
        {"uid": user["user_id"]},
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=403, detail="Profile not found")

    user["full_name"] = row.full_name
    user["role"] = row.role
    user["department"] = row.department
    user["faculty_id"] = row.faculty_id
    return user


_VALID_ROLES = frozenset({"admin", "department_coordinator", "faculty", "club"})


def get_user_profile(user_id: str, db: Session) -> dict | None:
    """Retrieve authoritative user profile by user UUID.

    Returns profile dict or None if not found.
    """
    row = db.execute(
        text(
            "SELECT id, email, full_name, role, department, faculty_id, created_at, updated_at "
            "FROM profiles WHERE id = :uid"
        ),
        {"uid": user_id},
    ).fetchone()
    if row is None:
        return None
    return {
        "id": str(row.id),
        "email": row.email,
        "full_name": row.full_name,
        "role": row.role,
        "department": row.department,
        "faculty_id": row.faculty_id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def create_user_profile(
    user_id: str,
    email: str,
    db: Session,
    full_name: str = "",
    role: str = "faculty",
    department: str | None = None,
    faculty_id: str | None = None,
) -> dict:
    """Securely create a user profile linked to a Supabase Auth user UUID.

    Validates UUID format and role constraints.
    """
    import uuid

    try:
        parsed_uuid = uuid.UUID(str(user_id))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError(f"Invalid UUID for user profile: {user_id}") from exc

    if role not in _VALID_ROLES:
        raise ValueError(f"Invalid role '{role}'. Must be one of {sorted(_VALID_ROLES)}")

    if not email or "@" not in email:
        raise ValueError("A valid email address is required for user profile")

    db.execute(
        text(
            """
            INSERT INTO profiles (id, email, full_name, role, department, faculty_id, created_at, updated_at)
            VALUES (:id, :email, :full_name, :role, :department, :faculty_id, now(), now())
            """
        ),
        {
            "id": str(parsed_uuid),
            "email": email.strip(),
            "full_name": full_name.strip(),
            "role": role,
            "department": department.strip() if department else None,
            "faculty_id": faculty_id.strip() if faculty_id else None,
        },
    )
    db.commit()
    return {
        "id": str(parsed_uuid),
        "email": email.strip(),
        "full_name": full_name.strip(),
        "role": role,
        "department": department.strip() if department else None,
        "faculty_id": faculty_id.strip() if faculty_id else None,
    }
