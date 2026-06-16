"""
services/shared_auth.py

Shared authentication dependency for all route files.

BF-002: Accepts HttpOnly cookie first, Bearer header as fallback.
Cookie path is XSS-safe; Bearer kept live during transition window.

Import in route files:
    from services.shared_auth import get_token_payload

Usage in route parameters (unchanged from before):
    payload: dict = Depends(get_token_payload)

DO NOT remove Bearer fallback until WS auth decision is resolved and
Cipher has signed off the removal.
"""

import os
from typing import Optional

from fastapi import Cookie, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_security = HTTPBearer(auto_error=False)

SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "change-this-in-production-use-a-long-random-string",
)


def get_token_payload(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
    access_token: Optional[str] = Cookie(default=None),
) -> dict:
    """
    Validate the caller via HttpOnly cookie (preferred) or Bearer header (fallback).

    Cookie is set by POST /api/auth/login and cleared by POST /api/auth/logout.
    Bearer header remains accepted during the BF-002 transition window — remove
    once WS auth is resolved and all clients confirmed on cookie model.
    """
    from jose import JWTError, jwt

    token = access_token or (credentials.credentials if credentials else None)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
