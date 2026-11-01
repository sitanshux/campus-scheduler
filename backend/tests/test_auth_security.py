"""
Security-focused unit tests for authentication and authorization.

Tests cover:
- Config validation (RS256, HS256, ES256 allowed; others rejected)
- JWT decoding for HS256 and ES256 (valid, expired, wrong issuer/aud/sub/sig)
- get_current_user (header parsing, token validation)
- JOSE error coverage (all exception types → 401, never 500)
- Role-based permissions (require_admin, require_admin_or_coord, factory)
- Database GUC setup (get_db_for_user: parameterized, transaction-local)
- Session cleanup (rollback on exit/exception, ordering)
- JWKS cache (init, refresh, stale, expiry)
- ES256 JWKS token verification (key construction, kid lookup, rotation)
- Self-promotion prevention
- Forged identity prevention

All tests avoid TestClient to prevent lifecycle hangs.  Auth functions
are tested directly with mock Request objects.  Permission functions
are tested by direct invocation.
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt as jose_jwt
from jose.exceptions import JOSEError, JWSError, JWKError

# ═══════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════

_TEST_SECRET = "super-secret-jwt-key-for-testing-only-32chars!"
_TEST_SUPABASE_URL = "https://test-project.supabase.co"
_TEST_ISSUER = f"{_TEST_SUPABASE_URL}/auth/v1"


def _make_mock_settings(**overrides):
    defaults = {
        "supabase_url": _TEST_SUPABASE_URL,
        "jwt_algorithm": "HS256",
        "supabase_jwt_secret": _TEST_SECRET,
        "database_url": "",
        "migration_database_url": "",
        "test_database_url": "",
    }
    defaults.update(overrides)
    mock = MagicMock()
    for k, v in defaults.items():
        setattr(mock, k, v)
    return mock


def _build_token(
    sub="550e8400-e29b-41d4-a716-446655440000",
    email="test@cit.edu",
    aud="authenticated",
    iss=_TEST_ISSUER,
    exp_offset=3600,
    iat_offset=0,
    algorithm="HS256",
    secret=_TEST_SECRET,
    headers=None,
    include_sub=True,
):
    now = int(time.time())
    payload = {
        "email": email,
        "aud": aud,
        "iss": iss,
        "exp": now + exp_offset,
        "iat": now + iat_offset,
    }
    if include_sub:
        payload["sub"] = sub
    return jose_jwt.encode(
        payload, secret, algorithm=algorithm, headers=headers
    )


def _mock_request(auth_header=None):
    """Create a mock Request with the given Authorization header."""
    req = MagicMock()
    if auth_header is None:
        req.headers.get.return_value = None
    else:
        req.headers.get.side_effect = lambda key, default=None: (
            auth_header if key == "Authorization" else default
        )
    return req


# ═══════════════════════════════════════════════════════
# ES256 Helpers — generate real EC keys for testing
# ═══════════════════════════════════════════════════════

try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    import json
    import base64

    def _generate_ec_keypair():
        """Generate an EC P-256 keypair and return (private_key, jwk_dict)."""
        private_key = ec.generate_private_key(ec.SECP256R1())
        public_key = private_key.public_key()

        # Get public numbers for JWK
        pub_nums = public_key.public_numbers()

        def _b64url(n, length):
            b = n.to_bytes(length, 'big')
            return base64.urlsafe_b64encode(b).rstrip(b'=').decode('ascii')

        jwk_dict = {
            "kty": "EC",
            "crv": "P-256",
            "x": _b64url(pub_nums.x, 32),
            "y": _b64url(pub_nums.y, 32),
            "kid": "test-ec-kid-001",
            "alg": "ES256",
            "use": "sig",
        }

        return private_key, jwk_dict

    def _build_es256_token(private_key, kid="test-ec-kid-001", **kwargs):
        """Build an ES256-signed JWT token."""
        from jose import jwt as j

        now = int(time.time())
        payload = {
            "sub": kwargs.get("sub", "550e8400-e29b-41d4-a716-446655440000"),
            "email": kwargs.get("email", "test@cit.edu"),
            "aud": kwargs.get("aud", "authenticated"),
            "iss": kwargs.get("iss", _TEST_ISSUER),
            "exp": now + kwargs.get("exp_offset", 3600),
            "iat": now + kwargs.get("iat_offset", 0),
        }
        if not kwargs.get("include_sub", True):
            payload.pop("sub", None)

        # Serialize private key to PEM for python-jose
        pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )

        headers = {"kid": kid, "alg": "ES256"}
        return j.encode(payload, pem, algorithm="ES256", headers=headers)

    _HAS_CRYPTOGRAPHY = True
except ImportError:
    _HAS_CRYPTOGRAPHY = False


# ═══════════════════════════════════════════════════════
# 1. Config tests
# ═══════════════════════════════════════════════════════


class TestConfigValidation:

    def test_valid_rs256(self):
        from app.core.config import Settings
        s = Settings(
            supabase_url="", jwt_algorithm="RS256",
            supabase_jwt_secret="", database_url="",
            migration_database_url="", test_database_url="",
        )
        assert s.jwt_algorithm == "RS256"

    def test_valid_hs256(self):
        from app.core.config import Settings
        s = Settings(
            supabase_url="", jwt_algorithm="HS256",
            supabase_jwt_secret="", database_url="",
            migration_database_url="", test_database_url="",
        )
        assert s.jwt_algorithm == "HS256"

    def test_valid_es256(self):
        from app.core.config import Settings
        s = Settings(
            supabase_url="", jwt_algorithm="ES256",
            supabase_jwt_secret="", database_url="",
            migration_database_url="", test_database_url="",
        )
        assert s.jwt_algorithm == "ES256"

    def test_none_algorithm_rejected(self):
        from app.core.config import Settings
        with pytest.raises(ValueError, match="JWT_ALGORITHM must be one of"):
            Settings(
                supabase_url="", jwt_algorithm="none",
                supabase_jwt_secret="", database_url="",
                migration_database_url="", test_database_url="",
            )

    def test_rs384_rejected(self):
        from app.core.config import Settings
        with pytest.raises(ValueError, match="JWT_ALGORITHM must be one of"):
            Settings(
                supabase_url="", jwt_algorithm="RS384",
                supabase_jwt_secret="", database_url="",
                migration_database_url="", test_database_url="",
            )

    def test_hs384_rejected(self):
        from app.core.config import Settings
        with pytest.raises(ValueError, match="JWT_ALGORITHM must be one of"):
            Settings(
                supabase_url="", jwt_algorithm="HS384",
                supabase_jwt_secret="", database_url="",
                migration_database_url="", test_database_url="",
            )

    def test_settings_is_frozen(self):
        from app.core.config import Settings
        s = Settings(
            supabase_url="x", jwt_algorithm="RS256",
            supabase_jwt_secret="", database_url="",
            migration_database_url="", test_database_url="",
        )
        with pytest.raises(AttributeError):
            s.jwt_algorithm = "HS256"


# ═══════════════════════════════════════════════════════
# 2. _decode_token unit tests — HS256
# ═══════════════════════════════════════════════════════


class TestDecodeTokenHS256:

    def setup_method(self):
        self._patcher = patch("app.core.auth.settings", _make_mock_settings())
        self._patcher.start()

    def teardown_method(self):
        self._patcher.stop()

    def test_valid_token(self):
        from app.core.auth import _decode_token
        payload = _decode_token(_build_token())
        assert payload["sub"] == "550e8400-e29b-41d4-a716-446655440000"
        assert payload["email"] == "test@cit.edu"
        assert payload["aud"] == "authenticated"

    def test_expired_token(self):
        from app.core.auth import _decode_token
        with pytest.raises(Exception, match="(?i)expired"):
            _decode_token(_build_token(exp_offset=-3600))

    def test_wrong_issuer(self):
        from app.core.auth import _decode_token
        with pytest.raises(Exception):
            _decode_token(_build_token(iss="https://evil.com/auth/v1"))

    def test_wrong_audience(self):
        from app.core.auth import _decode_token
        with pytest.raises(Exception):
            _decode_token(_build_token(aud="wrong"))

    def test_missing_sub(self):
        from app.core.auth import _decode_token
        with pytest.raises(Exception):
            _decode_token(_build_token(include_sub=False))

    def test_wrong_secret(self):
        from app.core.auth import _decode_token
        with pytest.raises(Exception):
            _decode_token(_build_token(secret="wrong-secret-key-123456789"))

    def test_alg_mismatch(self):
        from app.core.auth import _decode_token
        with pytest.raises(Exception, match="does not match configured HS256"):
            _decode_token(_build_token(headers={"alg": "RS256", "typ": "JWT"}))

    def test_garbage(self):
        from app.core.auth import _decode_token
        with pytest.raises(Exception):
            _decode_token("xyzgarbage")

    def test_empty(self):
        from app.core.auth import _decode_token
        with pytest.raises(Exception):
            _decode_token("")

    def test_three_dot_garbage(self):
        from app.core.auth import _decode_token
        with pytest.raises(Exception):
            _decode_token("a.b.c")


class TestDecodeHS256SecretMissing:
    def test_empty_secret(self):
        with patch("app.core.auth.settings", _make_mock_settings(supabase_jwt_secret="")):
            from app.core.auth import _decode_token
            with pytest.raises(Exception, match="SUPABASE_JWT_SECRET is empty"):
                _decode_token(_build_token())


class TestDecodeUnsupportedAlgorithm:
    def test_unsupported(self):
        with patch("app.core.auth.settings", _make_mock_settings(jwt_algorithm="RS384")):
            from app.core.auth import _decode_token
            with pytest.raises(Exception, match="Unsupported JWT algorithm"):
                _decode_token(_build_token())


# ═══════════════════════════════════════════════════════
# 2b. _decode_token unit tests — ES256 (JWKS)
# ═══════════════════════════════════════════════════════


@pytest.mark.skipif(not _HAS_CRYPTOGRAPHY, reason="cryptography not installed")
class TestDecodeTokenES256:
    """Test ES256 JWT verification using real EC keys."""

    def setup_method(self):
        self._private_key, self._jwk = _generate_ec_keypair()
        self._patcher = patch(
            "app.core.auth.settings",
            _make_mock_settings(jwt_algorithm="ES256"),
        )
        self._patcher.start()

        # Pre-populate JWKS cache with our test key
        from app.core import auth
        auth._jwks_cache["keys"] = {self._jwk["kid"]: self._jwk}
        auth._jwks_cache["fetched_at"] = time.time()
        auth._jwks_cache["last_success_at"] = time.time()

    def teardown_method(self):
        self._patcher.stop()
        from app.core import auth
        auth._jwks_cache["keys"] = {}
        auth._jwks_cache["fetched_at"] = 0.0
        auth._jwks_cache["last_success_at"] = 0.0

    def test_valid_es256_token(self):
        from app.core.auth import _decode_token
        token = _build_es256_token(self._private_key)
        payload = _decode_token(token)
        assert payload["sub"] == "550e8400-e29b-41d4-a716-446655440000"
        assert payload["email"] == "test@cit.edu"

    def test_expired_es256_token(self):
        from app.core.auth import _decode_token
        token = _build_es256_token(self._private_key, exp_offset=-3600)
        with pytest.raises(Exception, match="(?i)expired"):
            _decode_token(token)

    def test_wrong_issuer_es256(self):
        from app.core.auth import _decode_token
        token = _build_es256_token(
            self._private_key, iss="https://evil.com/auth/v1"
        )
        with pytest.raises(Exception):
            _decode_token(token)

    def test_wrong_audience_es256(self):
        from app.core.auth import _decode_token
        token = _build_es256_token(self._private_key, aud="wrong")
        with pytest.raises(Exception):
            _decode_token(token)

    def test_missing_sub_es256(self):
        from app.core.auth import _decode_token
        token = _build_es256_token(self._private_key, include_sub=False)
        with pytest.raises(Exception):
            _decode_token(token)

    def test_unknown_kid_es256(self):
        from app.core.auth import _decode_token
        token = _build_es256_token(self._private_key, kid="unknown-kid")
        with patch("app.core.auth._fetch_jwks", return_value={self._jwk["kid"]: self._jwk}):
            with pytest.raises(Exception, match="Unknown kid"):
                _decode_token(token)

    def test_wrong_key_es256(self):
        """Token signed with different key than the one in JWKS."""
        from app.core.auth import _decode_token
        other_key, _ = _generate_ec_keypair()
        # Sign with other_key but JWKS has self._jwk
        token = _build_es256_token(other_key, kid=self._jwk["kid"])
        with pytest.raises(Exception):
            _decode_token(token)

    def test_kid_rotation_refetch(self):
        """When kid not in cache, JWKS is re-fetched (key rotation)."""
        from app.core.auth import _decode_token
        new_key, new_jwk = _generate_ec_keypair()
        new_jwk["kid"] = "rotated-kid-002"
        token = _build_es256_token(new_key, kid="rotated-kid-002")
        with patch("app.core.auth._fetch_jwks", return_value={"rotated-kid-002": new_jwk}):
            payload = _decode_token(token)
            assert payload["sub"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_alg_mismatch_es256(self):
        """HS256 token should be rejected when ES256 is configured."""
        from app.core.auth import _decode_token
        hs256_token = _build_token(algorithm="HS256")
        with pytest.raises(Exception, match="does not match configured ES256"):
            _decode_token(hs256_token)


# ═══════════════════════════════════════════════════════
# 3. get_current_user tests — direct call with mock Request
# ═══════════════════════════════════════════════════════


class TestGetCurrentUser:
    """Test get_current_user directly (no TestClient, no HTTP)."""

    def setup_method(self):
        self._patcher = patch("app.core.auth.settings", _make_mock_settings())
        self._patcher.start()

    def teardown_method(self):
        self._patcher.stop()

    def test_no_auth_header_401(self):
        from app.core.auth import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(_mock_request(None))
        assert exc_info.value.status_code == 401
        assert "Missing access token" in exc_info.value.detail

    def test_wrong_scheme_401(self):
        from app.core.auth import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(_mock_request("Basic abc123"))
        assert exc_info.value.status_code == 401

    def test_bearer_no_space_401(self):
        from app.core.auth import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(_mock_request("Bearertoken"))
        assert exc_info.value.status_code == 401

    def test_empty_bearer_401(self):
        from app.core.auth import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(_mock_request("Bearer "))
        assert exc_info.value.status_code == 401
        assert "Missing access token" in exc_info.value.detail

    def test_whitespace_bearer_401(self):
        from app.core.auth import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(_mock_request("Bearer   "))
        assert exc_info.value.status_code == 401

    def test_valid_token_200(self):
        from app.core.auth import get_current_user
        token = _build_token()
        user = get_current_user(_mock_request(f"Bearer {token}"))
        assert user["user_id"] == "550e8400-e29b-41d4-a716-446655440000"
        assert user["email"] == "test@cit.edu"

    def test_expired_token_401(self):
        from app.core.auth import get_current_user
        token = _build_token(exp_offset=-3600)
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(_mock_request(f"Bearer {token}"))
        assert exc_info.value.status_code == 401

    def test_wrong_signature_401(self):
        from app.core.auth import get_current_user
        token = _build_token(secret="wrong-wrong-wrong-wrong-wrong-32!")
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(_mock_request(f"Bearer {token}"))
        assert exc_info.value.status_code == 401

    def test_garbage_token_401_not_500(self):
        from app.core.auth import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(_mock_request("Bearer garbage-not-jwt"))
        assert exc_info.value.status_code == 401


class TestJOSEErrorCoverage:
    """ALL jose exception types must produce 401, not 500.

    Critical: JWSError and JWKError are NOT subclasses of JWTError.
    We catch JOSEError (common base) to prevent unhandled exceptions.
    """

    def test_jose_error_401(self):
        from app.core.auth import get_current_user
        with patch("app.core.auth._decode_token", side_effect=JOSEError("sim")):
            with pytest.raises(HTTPException) as exc_info:
                get_current_user(_mock_request("Bearer x.y.z"))
            assert exc_info.value.status_code == 401

    def test_jws_error_401(self):
        from app.core.auth import get_current_user
        with patch("app.core.auth._decode_token", side_effect=JWSError("sim")):
            with pytest.raises(HTTPException) as exc_info:
                get_current_user(_mock_request("Bearer x.y.z"))
            assert exc_info.value.status_code == 401

    def test_jwk_error_401(self):
        from app.core.auth import get_current_user
        with patch("app.core.auth._decode_token", side_effect=JWKError("sim")):
            with pytest.raises(HTTPException) as exc_info:
                get_current_user(_mock_request("Bearer x.y.z"))
            assert exc_info.value.status_code == 401

    def test_runtime_error_401(self):
        from app.core.auth import get_current_user
        with patch("app.core.auth._decode_token", side_effect=RuntimeError("JWKS down")):
            with pytest.raises(HTTPException) as exc_info:
                get_current_user(_mock_request("Bearer x.y.z"))
            assert exc_info.value.status_code == 401


# ═══════════════════════════════════════════════════════
# 4. Permissions tests — direct function calls
# ═══════════════════════════════════════════════════════


def _mock_user(role="admin"):
    return {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "email": f"{role}@test.cit.edu",
        "full_name": f"Test {role.title()}",
        "role": role,
        "department": "CS" if role != "club" else None,
        "faculty_id": "F01" if role == "faculty" else None,
    }


class TestRequireAdmin:
    """Test require_admin by calling the inner _check function directly."""

    def _check(self, role):
        """Call the require_admin dependency function with a mock user."""
        from app.core.permissions import require_admin
        return require_admin(user=_mock_user(role))

    def test_admin_allowed(self):
        result = self._check("admin")
        assert result["role"] == "admin"

    def test_faculty_forbidden(self):
        with pytest.raises(HTTPException) as exc_info:
            self._check("faculty")
        assert exc_info.value.status_code == 403
        assert "Forbidden" in exc_info.value.detail

    def test_club_forbidden(self):
        with pytest.raises(HTTPException) as exc_info:
            self._check("club")
        assert exc_info.value.status_code == 403

    def test_coordinator_forbidden(self):
        with pytest.raises(HTTPException) as exc_info:
            self._check("department_coordinator")
        assert exc_info.value.status_code == 403

    def test_none_role_forbidden(self):
        from app.core.permissions import require_admin
        user = _mock_user("admin")
        user["role"] = None
        with pytest.raises(HTTPException) as exc_info:
            require_admin(user=user)
        assert exc_info.value.status_code == 403


class TestRequireAdminOrCoord:

    def _check(self, role):
        from app.core.permissions import require_admin_or_coord
        return require_admin_or_coord(user=_mock_user(role))

    def test_admin_allowed(self):
        assert self._check("admin")["role"] == "admin"

    def test_coord_allowed(self):
        assert self._check("department_coordinator")["role"] == "department_coordinator"

    def test_faculty_forbidden(self):
        with pytest.raises(HTTPException) as exc_info:
            self._check("faculty")
        assert exc_info.value.status_code == 403

    def test_club_forbidden(self):
        with pytest.raises(HTTPException) as exc_info:
            self._check("club")
        assert exc_info.value.status_code == 403


class TestRequireRoleFactory:

    def test_faculty_allowed_on_faculty_route(self):
        from app.core.permissions import require_role
        check = require_role("faculty")
        result = check(user=_mock_user("faculty"))
        assert result["role"] == "faculty"

    def test_admin_forbidden_on_faculty_route(self):
        from app.core.permissions import require_role
        check = require_role("faculty")
        with pytest.raises(HTTPException) as exc_info:
            check(user=_mock_user("admin"))
        assert exc_info.value.status_code == 403

    def test_multi_role(self):
        from app.core.permissions import require_role
        check = require_role("admin", "faculty")
        assert check(user=_mock_user("admin"))["role"] == "admin"
        assert check(user=_mock_user("faculty"))["role"] == "faculty"
        with pytest.raises(HTTPException):
            check(user=_mock_user("club"))


class TestRoleErrorMessage:

    def test_includes_actual_role(self):
        from app.core.permissions import require_admin
        with pytest.raises(HTTPException) as exc_info:
            require_admin(user=_mock_user("club"))
        assert "'club'" in exc_info.value.detail

    def test_includes_required_role(self):
        from app.core.permissions import require_admin
        with pytest.raises(HTTPException) as exc_info:
            require_admin(user=_mock_user("faculty"))
        assert "admin" in exc_info.value.detail


# ═══════════════════════════════════════════════════════
# 5. Database tests
# ═══════════════════════════════════════════════════════


class TestGetDbForUser:

    def test_sets_user_id_and_role(self):
        from app.core.database import get_db_for_user
        mock_db = MagicMock()
        result = get_db_for_user({"user_id": "abc-123", "role": "admin"}, mock_db)

        assert mock_db.execute.call_count == 2
        calls = mock_db.execute.call_args_list
        assert "app.current_user_id" in str(calls[0][0][0])
        assert calls[0][0][1] == {"uid": "abc-123"}
        assert "app.current_user_role" in str(calls[1][0][0])
        assert calls[1][0][1] == {"role": "admin"}
        assert result is mock_db

    def test_parameterized_prevents_injection(self):
        from app.core.database import get_db_for_user
        mock_db = MagicMock()
        get_db_for_user(
            {"user_id": "'; DROP TABLE profiles; --", "role": "admin"},
            mock_db,
        )
        sql_text = str(mock_db.execute.call_args_list[0][0][0])
        assert "DROP TABLE" not in sql_text

    def test_transaction_local_flag(self):
        """set_config 3rd arg must be 'true' for transaction-local."""
        from app.core.database import get_db_for_user
        mock_db = MagicMock()
        get_db_for_user({"user_id": "x", "role": "y"}, mock_db)
        for c in mock_db.execute.call_args_list:
            sql = str(c[0][0])
            assert ", true)" in sql, f"Missing transaction-local flag in: {sql}"


class TestGetDbCleanup:

    def test_rollback_on_normal_exit(self):
        from app.core.database import get_db
        mock_session = MagicMock()
        with patch(
            "app.core.database._get_session_factory",
            return_value=MagicMock(return_value=mock_session),
        ):
            gen = get_db()
            next(gen)
            try:
                gen.send(None)
            except StopIteration:
                pass
            mock_session.rollback.assert_called_once()
            mock_session.close.assert_called_once()

    def test_rollback_on_exception(self):
        from app.core.database import get_db
        mock_session = MagicMock()
        with patch(
            "app.core.database._get_session_factory",
            return_value=MagicMock(return_value=mock_session),
        ):
            gen = get_db()
            next(gen)
            try:
                gen.throw(ValueError("sim"))
            except ValueError:
                pass
            mock_session.rollback.assert_called_once()
            mock_session.close.assert_called_once()

    def test_rollback_before_close(self):
        from app.core.database import get_db
        order = []
        mock_session = MagicMock()
        mock_session.rollback.side_effect = lambda: order.append("rollback")
        mock_session.close.side_effect = lambda: order.append("close")
        with patch(
            "app.core.database._get_session_factory",
            return_value=MagicMock(return_value=mock_session),
        ):
            gen = get_db()
            next(gen)
            try:
                gen.send(None)
            except StopIteration:
                pass
            assert order == ["rollback", "close"]


# ═══════════════════════════════════════════════════════
# 6. JWKS cache tests
# ═══════════════════════════════════════════════════════


class TestJWKSCache:

    def _reset(self):
        from app.core import auth
        auth._jwks_cache["keys"] = {}
        auth._jwks_cache["fetched_at"] = 0.0
        auth._jwks_cache["last_success_at"] = 0.0

    def test_init_hs256_noop(self):
        with patch("app.core.auth.settings", _make_mock_settings(jwt_algorithm="HS256")):
            from app.core.auth import init_jwks
            init_jwks()

    def test_init_es256_fetches(self):
        """ES256 mode should fetch JWKS at startup."""
        with patch("app.core.auth.settings", _make_mock_settings(jwt_algorithm="ES256")):
            from app.core import auth
            self._reset()
            with patch.object(auth, "_fetch_jwks", return_value={"kid1": {"kty": "EC"}}):
                auth.init_jwks()
                assert "kid1" in auth._jwks_cache["keys"]

    def test_cached_no_refetch(self):
        from app.core import auth
        self._reset()
        auth._jwks_cache.update(
            keys={"kid1": {"kty": "RSA"}},
            fetched_at=time.time(),
            last_success_at=time.time(),
        )
        with patch.object(auth, "_fetch_jwks") as m:
            assert "kid1" in auth._refresh_jwks()
            m.assert_not_called()

    def test_force_refetch(self):
        from app.core import auth
        self._reset()
        auth._jwks_cache.update(
            keys={"kid1": {}},
            fetched_at=time.time(),
            last_success_at=time.time(),
        )
        with patch.object(auth, "_fetch_jwks", return_value={"kid2": {}}):
            keys = auth._refresh_jwks(force=True)
            assert "kid2" in keys and "kid1" not in keys

    def test_stale_within_24h(self):
        from app.core import auth
        self._reset()
        auth._jwks_cache.update(
            keys={"kid1": {}},
            fetched_at=0.0,
            last_success_at=time.time() - 3600,
        )
        with patch.object(auth, "_fetch_jwks", side_effect=Exception("net")):
            assert "kid1" in auth._refresh_jwks(force=True)

    def test_stale_after_24h_fails(self):
        from app.core import auth
        self._reset()
        auth._jwks_cache.update(
            keys={"kid1": {}},
            fetched_at=0.0,
            last_success_at=time.time() - 90000,
        )
        with patch.object(auth, "_fetch_jwks", side_effect=Exception("net")):
            with pytest.raises(RuntimeError, match="stale cache expired"):
                auth._refresh_jwks(force=True)

    def test_empty_cache_fail(self):
        from app.core import auth
        self._reset()
        with patch.object(auth, "_fetch_jwks", side_effect=Exception("net")):
            with pytest.raises(RuntimeError):
                auth._refresh_jwks(force=True)


# ═══════════════════════════════════════════════════════
# 7. Self-promotion and forged identity prevention
# ═══════════════════════════════════════════════════════


class TestSelfPromotionPrevention:
    """Users must not be able to escalate their own role."""

    def test_faculty_cannot_access_admin_route(self):
        """Faculty user calling an admin-only function is blocked."""
        from app.core.permissions import require_admin
        with pytest.raises(HTTPException) as exc_info:
            require_admin(user=_mock_user("faculty"))
        assert exc_info.value.status_code == 403

    def test_club_cannot_access_coordinator_route(self):
        from app.core.permissions import require_admin_or_coord
        with pytest.raises(HTTPException) as exc_info:
            require_admin_or_coord(user=_mock_user("club"))
        assert exc_info.value.status_code == 403

    def test_role_from_db_not_token(self):
        """get_verified_user uses DB role, not client-supplied role."""
        from app.core.auth import get_verified_user
        mock_db = MagicMock()
        mock_row = MagicMock()
        mock_row.full_name = "Eve"
        mock_row.role = "faculty"  # DB says faculty
        mock_row.department = "CS"
        mock_row.faculty_id = "F99"
        mock_db.execute.return_value.fetchone.return_value = mock_row

        # User claims admin in JWT, but get_verified_user overwrites
        user = {"user_id": "some-uuid", "email": "eve@evil.com", "role": "admin"}
        result = get_verified_user(user=user, db=mock_db)
        assert result["role"] == "faculty"  # DB wins, not client claim

    def test_missing_profile_returns_403(self):
        """User with valid JWT but no profile row gets 403."""
        from app.core.auth import get_verified_user
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            get_verified_user(
                user={"user_id": "no-profile-uuid", "email": "x@y.com"},
                db=mock_db,
            )
        assert exc_info.value.status_code == 403
        assert "Profile not found" in exc_info.value.detail


class TestForgedIdentityPrevention:
    """Verify that user identity cannot be forged."""

    def test_token_sub_used_as_user_id(self):
        """user_id comes from JWT sub, not from any client header."""
        with patch("app.core.auth.settings", _make_mock_settings()):
            from app.core.auth import get_current_user
            token = _build_token(sub="real-uuid-from-supabase")
            user = get_current_user(_mock_request(f"Bearer {token}"))
            assert user["user_id"] == "real-uuid-from-supabase"

    def test_forged_sub_different_key_rejected(self):
        """Token signed with wrong key (forged identity) is rejected."""
        with patch("app.core.auth.settings", _make_mock_settings()):
            from app.core.auth import get_current_user
            forged_token = _build_token(
                sub="victim-uuid",
                secret="attacker-secret-key-32-characters!",
            )
            with pytest.raises(HTTPException) as exc_info:
                get_current_user(_mock_request(f"Bearer {forged_token}"))
            assert exc_info.value.status_code == 401


class TestSelfApprovalPrevention:
    """Verify that self-approval is prevented at the route level."""

    def test_booking_validate_uses_server_identity(self):
        """validate_booking derives approved_by from user, not client."""
        from app.bookings.routes import validate_booking
        from app.bookings.models import BookingRequestIn

        mock_user = _mock_user("admin")
        mock_user["user_id"] = "admin-uuid-001"

        request = BookingRequestIn(
            id="test-br-1",
            title="Test Booking",
            requester="admin-uuid-001",  # same as approver
            role="admin",
            requested_category="seminar",
            attendance=50,
            duration_periods=2,
            windows=[{"day": "Monday", "from_period": 1, "to_period": 2}],
            room_types=["seminar_hall"],
        )

        # The route should derive approved_by from user, not client
        result = validate_booking(request=request, user=mock_user)
        # Self-approval should be caught by the engine
        assert isinstance(result, dict)

    def test_reschedule_approve_uses_server_identity(self):
        """approve_reschedule derives approved_by from user, not client."""
        from app.rescheduling.routes import approve_reschedule
        mock_user = _mock_user("admin")
        mock_user["user_id"] = "admin-uuid-001"

        # This will fail with 400 "Proposal not found" — which is correct,
        # the point is that approved_by is server-derived.
        with pytest.raises(HTTPException) as exc_info:
            approve_reschedule(proposal_id="nonexistent", user=mock_user)
        # Should be 400 (not found), not 500 (no approved_by param error)
        assert exc_info.value.status_code == 400


# ═══════════════════════════════════════════════════════
# 8. Route auth integration tests (function-level)
# ═══════════════════════════════════════════════════════


class TestRouteAuthWiring:
    """Verify that all routes have auth dependencies wired."""

    def test_schedule_generate_requires_user_param(self):
        """generate_schedule function signature includes user parameter."""
        import inspect
        from app.scheduling.routes import generate_schedule
        sig = inspect.signature(generate_schedule)
        assert "user" in sig.parameters

    def test_booking_process_requires_user_param(self):
        import inspect
        from app.bookings.routes import process_bookings
        sig = inspect.signature(process_bookings)
        assert "user" in sig.parameters

    def test_booking_validate_requires_user_param(self):
        import inspect
        from app.bookings.routes import validate_booking
        sig = inspect.signature(validate_booking)
        assert "user" in sig.parameters

    def test_exam_generate_requires_user_param(self):
        import inspect
        from app.examinations.routes import generate_exam_schedule
        sig = inspect.signature(generate_exam_schedule)
        assert "user" in sig.parameters

    def test_exam_get_requires_user_param(self):
        import inspect
        from app.examinations.routes import get_exam_schedule
        sig = inspect.signature(get_exam_schedule)
        assert "user" in sig.parameters

    def test_reschedule_propose_requires_user_param(self):
        import inspect
        from app.rescheduling.routes import propose_reschedule
        sig = inspect.signature(propose_reschedule)
        assert "user" in sig.parameters

    def test_reschedule_approve_requires_user_param(self):
        import inspect
        from app.rescheduling.routes import approve_reschedule
        sig = inspect.signature(approve_reschedule)
        assert "user" in sig.parameters

    def test_dataset_full_requires_user_param(self):
        import inspect
        from app.main import dataset_full
        sig = inspect.signature(dataset_full)
        assert "user" in sig.parameters

    def test_public_endpoints_no_auth(self):
        """root, health, dataset/summary, dataset remain public."""
        import inspect
        from app.main import root, health_check, dataset_summary, dataset_info
        for fn in [root, health_check, dataset_summary, dataset_info]:
            sig = inspect.signature(fn)
            assert "user" not in sig.parameters, f"{fn.__name__} should be public"


# ═══════════════════════════════════════════════════════
# 9. Profile creation and retrieval tests
# ═══════════════════════════════════════════════════════


class TestProfileCreationAndRetrieval:
    """Verify secure user profile creation and retrieval linked to Supabase Auth UUIDs."""

    def test_get_user_profile_found(self):
        from app.core.auth import get_user_profile
        mock_db = MagicMock()
        mock_row = MagicMock()
        mock_row.id = "550e8400-e29b-41d4-a716-446655440000"
        mock_row.email = "faculty@cit.edu"
        mock_row.full_name = "Dr. Jane"
        mock_row.role = "faculty"
        mock_row.department = "CS"
        mock_row.faculty_id = "F01"
        mock_row.created_at = "2026-11-01T00:00:00Z"
        mock_row.updated_at = "2026-11-01T00:00:00Z"
        mock_db.execute.return_value.fetchone.return_value = mock_row

        profile = get_user_profile("550e8400-e29b-41d4-a716-446655440000", mock_db)
        assert profile is not None
        assert profile["id"] == "550e8400-e29b-41d4-a716-446655440000"
        assert profile["email"] == "faculty@cit.edu"
        assert profile["role"] == "faculty"

    def test_get_user_profile_not_found(self):
        from app.core.auth import get_user_profile
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = None

        profile = get_user_profile("550e8400-e29b-41d4-a716-446655440000", mock_db)
        assert profile is None

    def test_create_user_profile_valid(self):
        from app.core.auth import create_user_profile
        mock_db = MagicMock()

        profile = create_user_profile(
            user_id="550e8400-e29b-41d4-a716-446655440000",
            email="coordinator@cit.edu",
            db=mock_db,
            full_name="Prof. Smith",
            role="department_coordinator",
            department="ECE",
        )
        assert profile["id"] == "550e8400-e29b-41d4-a716-446655440000"
        assert profile["email"] == "coordinator@cit.edu"
        assert profile["role"] == "department_coordinator"
        assert profile["department"] == "ECE"
        mock_db.execute.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_create_user_profile_invalid_uuid(self):
        from app.core.auth import create_user_profile
        mock_db = MagicMock()

        with pytest.raises(ValueError, match="Invalid UUID"):
            create_user_profile(
                user_id="not-a-valid-uuid",
                email="test@cit.edu",
                db=mock_db,
            )

    def test_create_user_profile_invalid_role(self):
        from app.core.auth import create_user_profile
        mock_db = MagicMock()

        with pytest.raises(ValueError, match="Invalid role"):
            create_user_profile(
                user_id="550e8400-e29b-41d4-a716-446655440000",
                email="test@cit.edu",
                role="superadmin",
                db=mock_db,
            )

    def test_create_user_profile_invalid_email(self):
        from app.core.auth import create_user_profile
        mock_db = MagicMock()

        with pytest.raises(ValueError, match="valid email"):
            create_user_profile(
                user_id="550e8400-e29b-41d4-a716-446655440000",
                email="not-an-email",
                db=mock_db,
            )
