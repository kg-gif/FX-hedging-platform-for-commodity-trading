from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from datetime import datetime, timedelta
import os
import logging

import bcrypt
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Security config ──────────────────────────────────────────────
# Secret key — must be set as environment variable in production
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

security = HTTPBearer()


# ── Pydantic models ──────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class CreateUserRequest(BaseModel):
    email: str
    password: str
    company_id: int
    role: str = "viewer"          # "admin" or "viewer"
    admin_secret: str             # Simple secret to prevent abuse

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    company_id: int
    role: str


# ── Helper functions ─────────────────────────────────────────────
def get_db():
    from database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency — use this on any endpoint you want to protect."""
    return decode_token(credentials.credentials)


# ── Routes ───────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """CFO login — returns JWT token valid for 7 days."""
    # Look up user by email
    result = db.execute(
        text("SELECT * FROM users WHERE email = :email"),
        {"email": request.email.lower().strip()}
    ).fetchone()

    if not result:
        # Generic error — don't reveal whether email exists
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = result._mapping

    if not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Build token
    token = create_access_token({
        "user_id": user["id"],
        "email": user["email"],
        "company_id": user["company_id"],
        "role": user["role"]
    })

    logger.info(f"Login: {user['email']} (company_id={user['company_id']})")

    return TokenResponse(
        access_token=token,
        user_id=user["id"],
        email=user["email"],
        company_id=user["company_id"],
        role=user["role"]
    )


@router.post("/create-user")
def create_user(request: CreateUserRequest, db: Session = Depends(get_db)):
    """
    Kevin uses this to create accounts for pilot customers.
    Protected by admin_secret environment variable.
    """
    # Check admin secret
    expected_secret = os.getenv("ADMIN_SECRET", "sumnohow-admin-2024")
    if request.admin_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid admin secret")

    # Check email not already taken
    existing = db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": request.email.lower().strip()}
    ).fetchone()

    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check company exists
    company = db.execute(
        text("SELECT id, name FROM companies WHERE id = :id"),
        {"id": request.company_id}
    ).fetchone()

    if not company:
        raise HTTPException(status_code=404, detail=f"Company {request.company_id} not found")

    # Create user
    db.execute(text("""
        INSERT INTO users (email, password_hash, company_id, role, created_at)
        VALUES (:email, :password_hash, :company_id, :role, NOW())
    """), {
        "email": request.email.lower().strip(),
        "password_hash": hash_password(request.password),
        "company_id": request.company_id,
        "role": request.role
    })
    db.commit()

    return {
        "message": f"User created successfully",
        "email": request.email,
        "company": company._mapping["name"],
        "company_id": request.company_id,
        "role": request.role
    }


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Verify token is valid — returns user info. Used by frontend on page load."""
    return {
        "user_id": current_user["user_id"],
        "email": current_user["email"],
        "company_id": current_user["company_id"],
        "role": current_user["role"]
    }


@router.post("/change-password")
def change_password(
    new_password: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allow user to change their own password."""
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    db.execute(text("""
        UPDATE users SET password_hash = :hash WHERE id = :id
    """), {
        "hash": hash_password(new_password),
        "id": current_user["user_id"]
    })
    db.commit()
    return {"message": "Password updated successfully"}
