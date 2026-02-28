from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from datetime import datetime, timedelta
import os
import logging

import secrets
import httpx
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


@router.get("/users")
def list_users(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all users — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    result = db.execute(text("""
        SELECT u.id, u.email, u.role, u.created_at, c.name as company_name
        FROM users u
        LEFT JOIN companies c ON u.company_id = c.id
        ORDER BY u.created_at DESC
    """)).fetchall()

    return {
        "users": [
            {
                "id": r._mapping["id"],
                "email": r._mapping["email"],
                "role": r._mapping["role"],
                "created_at": r._mapping["created_at"],
                "company_name": r._mapping["company_name"]
            }
            for r in result
        ]
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a user — admin only. Cannot delete yourself."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if current_user["user_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    db.commit()
    return {"message": "User deleted"}


@router.post("/forgot-password")
async def forgot_password(email: str, db: Session = Depends(get_db)):
    """
    Customer requests password reset. Sends email with time-limited link.
    Always returns 200 — never reveal whether email exists (security best practice).
    """
    user = db.execute(
        text("SELECT id, email FROM users WHERE email = :email"),
        {"email": email.lower().strip()}
    ).fetchone()

    if user:
        reset_token = secrets.token_urlsafe(32)
        expires_at  = datetime.utcnow() + timedelta(hours=1)

        db.execute(text("""
            UPDATE users
            SET reset_token = :token, reset_token_expires = :expires
            WHERE id = :id
        """), {"token": reset_token, "expires": expires_at, "id": user._mapping["id"]})
        db.commit()

        frontend_url = os.getenv("FRONTEND_URL", "https://birk-dashboard.onrender.com")
        reset_link   = f"{frontend_url}/reset-password?token={reset_token}"

        resend_api_key = os.getenv("RESEND_API_KEY")
        html = f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <div style="background:#1A2744;padding:24px;border-radius:12px;text-align:center;margin-bottom:24px;">
            <h1 style="color:#C9A86C;margin:0;font-size:20px;letter-spacing:3px;">SUMNOHOW</h1>
            <p style="color:#8DA4C4;font-size:12px;margin:4px 0 0;">Know your FX position. Before it costs you.</p>
          </div>
          <h2 style="color:#1A2744;">Reset your password</h2>
          <p style="color:#555;font-size:14px;line-height:1.6;">
            We received a request to reset your password. Click the button below — this link expires in <strong>1 hour</strong>.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="{reset_link}"
               style="background:#1A2744;color:white;padding:14px 32px;border-radius:8px;
                      text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color:#999;font-size:12px;">
            If you didn't request this, you can safely ignore this email.
            Your password will not change.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
          <p style="color:#ccc;font-size:11px;text-align:center;">
            Sumnohow FX Risk Management · Stavanger, Norway
          </p>
        </div>
        """

        async with httpx.AsyncClient() as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "from": "Sumnohow <noreply@updates.sumnohow.com>",
                    "to": [user._mapping["email"]],
                    "subject": "Reset your Sumnohow password",
                    "html": html
                }
            )
        logger.info(f"Password reset email sent to {email}")

    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(token: str, new_password: str, db: Session = Depends(get_db)):
    """
    Customer submits new password using token from email link.
    Token expires after 1 hour.
    """
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = db.execute(
        text("SELECT id, reset_token_expires FROM users WHERE reset_token = :token"),
        {"token": token}
    ).fetchone()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    u = user._mapping
    if datetime.utcnow() > u["reset_token_expires"]:
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")

    db.execute(text("""
        UPDATE users
        SET password_hash = :hash,
            reset_token = NULL,
            reset_token_expires = NULL
        WHERE id = :id
    """), {"hash": hash_password(new_password), "id": u["id"]})
    db.commit()

    logger.info(f"Password reset successful for user {u['id']}")
    return {"message": "Password updated successfully. You can now log in."}
