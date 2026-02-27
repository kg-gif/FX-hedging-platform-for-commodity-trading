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

class CreateUserRequest(BaseModel):
    email: str
    password: str
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
    result = db.execute(text("INSERT INTO companies (name, base_currency, trading_volume_monthly, company_type, created_at, updated_at) VALUES (:name, :base_currency, :volume, 'IMPORTER_EXPORTER', NOW(), NOW()) RETURNING id, name"), {"name": request.name, "base_currency": request.base_currency, "volume": request.trading_volume_monthly})
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
def create_user(request: CreateUserRequest, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    import bcrypt
    existing = db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": request.email.lower().strip()}).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    company = db.execute(text("SELECT id, name FROM companies WHERE id = :id"), {"id": request.company_id}).fetchone()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    password_hash = bcrypt.hashpw(request.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    db.execute(text("INSERT INTO users (email, password_hash, company_id, role, created_at) VALUES (:email, :hash, :company_id, :role, NOW())"), {"email": request.email.lower().strip(), "hash": password_hash, "company_id": request.company_id, "role": request.role})
    db.commit()
    return {"message": "User created", "email": request.email, "company": company._mapping["name"], "role": request.role}

@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    db.commit()
    return {"message": f"User {user_id} deleted"}
