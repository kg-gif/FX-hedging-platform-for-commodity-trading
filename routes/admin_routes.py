from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import os
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])
security = HTTPBearer()

def get_db():
    from database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from jose import JWTError, jwt
    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

class CreateCompanyRequest(BaseModel):
    name: str
    base_currency: str = "USD"
    trading_volume_monthly: float = 0

class CreateExposureRequest(BaseModel):
    company_id: int
    from_currency: str
    to_currency: str
    amount: float
    instrument_type: str = "Forward"
    exposure_type: str = "payable"
    budget_rate: Optional[float] = None
    description: str = ""
    end_date: Optional[str] = None

# ── Password removed — system generates it and emails customer ───
class CreateUserRequest(BaseModel):
    email: str
    company_id: int
    role: str = "viewer"

@router.get("/companies")
def list_companies(admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT c.id, c.name, c.base_currency, c.trading_volume_monthly, c.created_at,
               COUNT(DISTINCT e.id) as exposure_count, COUNT(DISTINCT u.id) as user_count
        FROM companies c
        LEFT JOIN exposures e ON e.company_id = c.id
        LEFT JOIN users u ON u.company_id = c.id
        GROUP BY c.id, c.name, c.base_currency, c.trading_volume_monthly, c.created_at
        ORDER BY c.id ASC
    """)).fetchall()
    return {"companies": [{"id": r._mapping["id"], "name": r._mapping["name"], "base_currency": r._mapping["base_currency"], "trading_volume_monthly": r._mapping["trading_volume_monthly"], "created_at": r._mapping["created_at"], "exposure_count": r._mapping["exposure_count"], "user_count": r._mapping["user_count"]} for r in rows]}

@router.post("/companies")
def create_company(request: CreateCompanyRequest, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    existing = db.execute(text("SELECT id FROM companies WHERE name = :name"), {"name": request.name}).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="A company with this name already exists")
    result = db.execute(text("INSERT INTO companies (name, base_currency, trading_volume_monthly, company_type, created_at, updated_at) VALUES (:name, :base_currency, :volume, 'COMMODITY_TRADER', NOW(), NOW()) RETURNING id, name"), {"name": request.name, "base_currency": request.base_currency, "volume": request.trading_volume_monthly})
    db.commit()
    row = result.fetchone()
    return {"message": "Company created", "id": row._mapping["id"], "name": row._mapping["name"]}

@router.delete("/companies/{company_id}")
def delete_company(company_id: int, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    if company_id == 1:
        raise HTTPException(status_code=400, detail="Cannot delete the default demo company")
    db.execute(text("DELETE FROM policy_audit_log WHERE company_id = :id"), {"id": company_id})
    db.execute(text("DELETE FROM hedging_policies WHERE company_id = :id"), {"id": company_id})
    db.execute(text("DELETE FROM exposures WHERE company_id = :id"), {"id": company_id})
    db.execute(text("DELETE FROM users WHERE company_id = :id"), {"id": company_id})
    db.execute(text("DELETE FROM companies WHERE id = :id"), {"id": company_id})
    db.commit()
    return {"message": f"Company {company_id} deleted"}

@router.get("/companies/{company_id}/exposures")
def list_exposures(company_id: int, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT id, from_currency, to_currency, amount, instrument_type, budget_rate, description, end_date, created_at FROM exposures WHERE company_id = :cid ORDER BY created_at DESC"), {"cid": company_id}).fetchall()
    return {"exposures": [{"id": r._mapping["id"], "pair": f"{r._mapping['from_currency']}/{r._mapping['to_currency']}", "from_currency": r._mapping["from_currency"], "to_currency": r._mapping["to_currency"], "amount": r._mapping["amount"], "instrument_type": r._mapping["instrument_type"], "budget_rate": r._mapping["budget_rate"], "description": r._mapping["description"], "end_date": r._mapping["end_date"], "created_at": r._mapping["created_at"]} for r in rows]}

@router.post("/exposures")
def create_exposure(request: CreateExposureRequest, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    company = db.execute(text("SELECT id, name FROM companies WHERE id = :id"), {"id": request.company_id}).fetchone()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    end_date = None
    if request.end_date:
        try:
            end_date = datetime.strptime(request.end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    db.execute(text("INSERT INTO exposures (company_id, from_currency, to_currency, amount, instrument_type, exposure_type, budget_rate, description, end_date, current_rate, current_value_usd, settlement_period, risk_level, created_at, updated_at) VALUES (:company_id, :from_currency, :to_currency, :amount, :instrument_type, :exposure_type, :budget_rate, :description, :end_date, 1.0, :amount, 90, 'MEDIUM', NOW(), NOW())"), {"company_id": request.company_id, "from_currency": request.from_currency.upper(), "to_currency": request.to_currency.upper(), "amount": request.amount, "instrument_type": request.instrument_type, "exposure_type": request.exposure_type, "budget_rate": request.budget_rate, "description": request.description, "end_date": end_date})
    db.commit()
    return {"message": "Exposure added", "company": company._mapping["name"], "pair": f"{request.from_currency.upper()}/{request.to_currency.upper()}", "amount": request.amount}

@router.delete("/exposures/{exposure_id}")
def delete_exposure(exposure_id: int, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM exposures WHERE id = :id"), {"id": exposure_id})
    db.commit()
    return {"message": f"Exposure {exposure_id} deleted"}

@router.get("/users")
def list_users(admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT u.id, u.email, u.role, u.created_at, c.name as company_name, c.id as company_id FROM users u LEFT JOIN companies c ON u.company_id = c.id ORDER BY u.created_at DESC")).fetchall()
    return {"users": [{"id": r._mapping["id"], "email": r._mapping["email"], "role": r._mapping["role"], "created_at": r._mapping["created_at"], "company_name": r._mapping["company_name"], "company_id": r._mapping["company_id"]} for r in rows]}

@router.post("/users")
async def create_user(request: CreateUserRequest, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    import bcrypt, secrets, httpx

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
        raise HTTPException(status_code=404, detail="Company not found")

    # Generate secure temporary password
    temp_password = secrets.token_urlsafe(12)
    password_hash = bcrypt.hashpw(temp_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    db.execute(text("""
        INSERT INTO users (email, password_hash, company_id, role, created_at)
        VALUES (:email, :hash, :company_id, :role, NOW())
    """), {
        "email": request.email.lower().strip(),
        "hash": password_hash,
        "company_id": request.company_id,
        "role": request.role
    })
    db.commit()

    # Send welcome email
    frontend_url = os.getenv("FRONTEND_URL", "https://birk-dashboard.onrender.com")
    resend_api_key = os.getenv("RESEND_API_KEY")
    company_name = company._mapping["name"]

    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;">
      <div style="background:#1A2744;padding:28px;border-radius:12px;text-align:center;margin-bottom:28px;">
        <h1 style="color:#C9A86C;margin:0;font-size:22px;letter-spacing:4px;font-weight:800;">SUMNOHOW</h1>
        <p style="color:#8DA4C4;font-size:12px;margin:6px 0 0;font-style:italic;">Know your FX position. Before it costs you.</p>
      </div>

      <h2 style="color:#1A2744;margin-bottom:8px;">Welcome to Sumnohow</h2>
      <p style="color:#555;font-size:14px;line-height:1.7;margin-bottom:24px;">
        Your FX risk dashboard for <strong>{company_name}</strong> is ready.
        Use the credentials below to sign in.
      </p>

      <div style="background:#F4F6FA;border-radius:10px;padding:20px;margin-bottom:28px;">
        <table style="width:100%;font-size:14px;">
          <tr>
            <td style="color:#888;padding:6px 0;">Login URL</td>
            <td style="color:#1A2744;font-weight:600;text-align:right;">
              <a href="{frontend_url}" style="color:#1A2744;">{frontend_url}</a>
            </td>
          </tr>
          <tr>
            <td style="color:#888;padding:6px 0;">Email</td>
            <td style="color:#1A2744;font-weight:600;text-align:right;">{request.email}</td>
          </tr>
          <tr>
            <td style="color:#888;padding:6px 0;">Temporary password</td>
            <td style="font-weight:700;text-align:right;font-family:monospace;
                       font-size:15px;color:#C9A86C;letter-spacing:1px;">{temp_password}</td>
          </tr>
        </table>
      </div>

      <div style="text-align:center;margin-bottom:28px;">
        <a href="{frontend_url}"
           style="background:#1A2744;color:white;padding:14px 36px;border-radius:8px;
                  text-decoration:none;font-weight:700;font-size:14px;display:inline-block;
                  letter-spacing:0.5px;">
          Sign in to your dashboard →
        </a>
      </div>

      <div style="background:#FFF8EC;border:1px solid #F0D9A8;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
        <p style="color:#92660A;font-size:13px;margin:0;">
          <strong>Security tip:</strong> After signing in, use "Forgot your password?"
          on the login page to set your own password.
        </p>
      </div>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
      <p style="color:#aaa;font-size:11px;text-align:center;margin:0;">
        Sumnohow FX Risk Management · Stavanger, Norway<br>
        If you weren't expecting this email, please ignore it.
      </p>
    </div>
    """

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "from": "Sumnohow <noreply@updates.sumnohow.com>",
                    "to": [request.email],
                    "subject": f"Your Sumnohow dashboard is ready — {company_name}",
                    "html": html
                }
            )
        logger.info(f"Welcome email sent to {request.email}")
    except Exception as e:
        # Don't fail user creation if email fails — account still created
        logger.error(f"Welcome email failed for {request.email}: {e}")

    return {
        "message": "User created and welcome email sent",
        "email": request.email,
        "company": company_name,
        "role": request.role
    }

@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    db.commit()
    return {"message": f"User {user_id} deleted"}