"""
auth_utils.py — Shared authentication and authorization utilities.
Import this in any route file that needs JWT validation or company_id enforcement.
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import os

security = HTTPBearer(auto_error=False)


def get_token_payload(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    Extract and validate JWT from Authorization header.
    Returns the decoded payload dict.
    Raises 401 if missing or invalid.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")

    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def resolve_company_id(requested_id: int, payload: dict) -> int:
    """
    Core security function — enforces company data isolation.

    Admins  → can access any company_id they request.
    Viewers → always get their own company_id from the token,
              regardless of what company_id was passed in the request.

    Usage:
        company_id = resolve_company_id(requested_id, payload)
    """
    if payload.get("role") == "admin":
        return requested_id
    token_company_id = payload.get("company_id")
    if not token_company_id:
        raise HTTPException(status_code=403, detail="No company assigned to this account")
    return int(token_company_id)


def require_admin(payload: dict = Depends(get_token_payload)) -> dict:
    """
    Dependency — raises 403 if user is not admin.
    Use on endpoints that should be completely hidden from customers.

    Usage:
        @router.get("/admin-only")
        def admin_only(admin: dict = Depends(require_admin)):
            ...
    """
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload
