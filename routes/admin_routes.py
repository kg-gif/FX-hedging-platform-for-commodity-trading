from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Optional
import json
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
    """
    Allow superadmin (platform-level), company_admin (company-level),
    and legacy "admin" role.  Rejects company_user / viewer / unknown.
    """
    from jose import JWTError, jwt
    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        if payload.get("role") not in ("superadmin", "admin", "company_admin"):
            raise HTTPException(status_code=403, detail="Admin access required")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def _require_superadmin(admin: dict):
    """
    Enforce superadmin-only access for destructive company operations.
    company_admin can manage users/settings within their own company but
    must never be able to delete or rename OTHER companies.
    """
    if admin.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Superadmin access required")


class CreateCompanyRequest(BaseModel):
    name: str
    base_currency: str = "USD"
    trading_volume_monthly: float = 0


class RenameCompanyRequest(BaseModel):
    name: str

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
    # superadmin / legacy admin → all companies; company_admin → own company only
    base_sql = """
        SELECT c.id, c.name, c.base_currency, c.trading_volume_monthly, c.created_at,
               COALESCE(c.is_demo, false) as is_demo,
               COUNT(DISTINCT e.id) as exposure_count, COUNT(DISTINCT u.id) as user_count
        FROM companies c
        LEFT JOIN exposures e ON e.company_id = c.id AND (e.is_active IS NULL OR e.is_active = true)
        LEFT JOIN users u ON u.company_id = c.id AND (u.is_active IS NULL OR u.is_active = true)
        {where}
        GROUP BY c.id, c.name, c.base_currency, c.trading_volume_monthly, c.created_at, c.is_demo
        ORDER BY c.id ASC
    """
    if admin.get("role") in ("superadmin", "admin"):
        rows = db.execute(text(base_sql.format(
            where="WHERE (c.is_active IS NULL OR c.is_active = true)"
        ))).fetchall()
    else:
        cid = int(admin.get("company_id", 0))
        rows = db.execute(
            text(base_sql.format(where="WHERE c.id = :cid AND (c.is_active IS NULL OR c.is_active = true)")),
            {"cid": cid}
        ).fetchall()
    return {"companies": [{"id": r._mapping["id"], "name": r._mapping["name"], "base_currency": r._mapping["base_currency"], "trading_volume_monthly": r._mapping["trading_volume_monthly"], "created_at": r._mapping["created_at"], "is_demo": r._mapping["is_demo"], "exposure_count": r._mapping["exposure_count"], "user_count": r._mapping["user_count"]} for r in rows]}

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
def delete_company(
    company_id: int,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Soft-delete a company. Superadmin only.
    Sets is_active = false on the company, all its users, and all its exposures.
    Financial records are never hard-deleted — they remain for audit purposes.
    """
    _require_superadmin(admin)

    company = db.execute(
        text("SELECT name FROM companies WHERE id = :id AND (is_active IS NULL OR is_active = true)"),
        {"id": company_id},
    ).fetchone()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    company_name = company._mapping["name"]

    # Soft-delete: deactivate company, all its users, all its active exposures
    db.execute(
        text("UPDATE companies SET is_active = false, updated_at = NOW() WHERE id = :id"),
        {"id": company_id},
    )
    db.execute(
        text("UPDATE users SET is_active = false WHERE company_id = :id"),
        {"id": company_id},
    )
    db.execute(
        text("UPDATE exposures SET is_active = false WHERE company_id = :id"),
        {"id": company_id},
    )

    # Audit log — write to order_audit_log (reuse existing table for platform events)
    db.execute(text("""
        INSERT INTO order_audit_log
            (company_id, exposure_id, currency_pair, action, sent_by, sent_at)
        VALUES
            (:cid, NULL, NULL, 'company_deleted', :user, NOW())
    """), {"cid": company_id, "user": admin.get("email", "superadmin")})

    db.commit()
    logger.info(f"Company soft-deleted: id={company_id} name='{company_name}' by {admin.get('email')}")
    return {"success": True, "message": f"'{company_name}' deactivated"}


@router.put("/companies/{company_id}/rename")
def rename_company(
    company_id: int,
    body: RenameCompanyRequest,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Rename a company. Superadmin only.
    Validates uniqueness so two companies can't share a name.
    """
    _require_superadmin(admin)

    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Company name cannot be empty")

    # Check target company exists
    existing = db.execute(
        text("SELECT id, name FROM companies WHERE id = :id AND (is_active IS NULL OR is_active = true)"),
        {"id": company_id},
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check name uniqueness (ignore case for robustness)
    clash = db.execute(
        text("SELECT id FROM companies WHERE LOWER(name) = LOWER(:name) AND id != :id"),
        {"name": new_name, "id": company_id},
    ).fetchone()
    if clash:
        raise HTTPException(status_code=400, detail="A company with that name already exists")

    db.execute(
        text("UPDATE companies SET name = :name, updated_at = NOW() WHERE id = :id"),
        {"name": new_name, "id": company_id},
    )
    db.commit()
    logger.info(f"Company renamed: id={company_id} '{existing._mapping['name']}' → '{new_name}' by {admin.get('email')}")
    return {"success": True, "name": new_name}

@router.post("/companies/{company_id}/demo-reset")
def demo_reset(
    company_id: int,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    One-click reset of a demo company back to the curated seed dataset.
    Superadmin only. Only works on companies flagged is_demo = true.

    Reset sequence:
      1. Verify superadmin + is_demo guard
      2. Audit log: demo_reset_initiated
      3. Archive all existing hedge tranches (status → 'archived')
      4. Soft-delete all existing exposures (is_active → false)
      5. Clear zone_change_log for this company
      6. Insert seed exposures from seed/demo_birk.json
      7. Insert seed tranches, mapping facility_slot to real trading_facility IDs
      8. Audit log: demo_reset_completed
    """
    _require_superadmin(admin)

    # ── Guard: must be a demo company ────────────────────────────────────────
    company = db.execute(
        text("SELECT name, is_demo FROM companies WHERE id = :id AND (is_active IS NULL OR is_active = true)"),
        {"id": company_id},
    ).fetchone()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not company._mapping["is_demo"]:
        raise HTTPException(status_code=400, detail="This company is not flagged as a demo company. Set is_demo = true first.")

    company_name = company._mapping["name"]

    # ── Load seed data with dynamic date substitution ─────────────────────────
    # Dates in the seed file use "TODAY+N" placeholders so resets always produce
    # future-dated exposures regardless of when the reset runs.
    seed_path = Path(__file__).parent.parent / "seed" / "demo_birk.json"
    if not seed_path.exists():
        raise HTTPException(status_code=500, detail=f"Seed file not found: {seed_path}")
    seed_text = seed_path.read_text(encoding="utf-8")

    # Replace every TODAY+N placeholder with the real calendar date
    today_d = date.today()
    for days in (30, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 270):
        placeholder = f"TODAY+{days}"
        real_date   = (today_d + timedelta(days=days)).isoformat()
        seed_text   = seed_text.replace(placeholder, real_date)

    seed = json.loads(seed_text)
    seed_exposures = seed.get("exposures", [])

    # ── Audit log: reset initiated ────────────────────────────────────────────
    db.execute(text("""
        INSERT INTO order_audit_log
            (company_id, exposure_id, currency_pair, action, sent_by, sent_at)
        VALUES
            (:cid, NULL, NULL, 'demo_reset_initiated', :user, NOW())
    """), {"cid": company_id, "user": admin.get("email", "superadmin")})

    # ── Archive all existing tranches for this company ────────────────────────
    # 'archived' status keeps records for audit trail but excludes them from
    # all live calculations (only 'executed'/'confirmed' count toward coverage)
    db.execute(text("""
        UPDATE hedge_tranches
           SET status = 'archived'
         WHERE exposure_id IN (
               SELECT id FROM exposures WHERE company_id = :cid
         )
    """), {"cid": company_id})

    # ── Soft-delete all existing exposures ───────────────────────────────────
    db.execute(
        text("UPDATE exposures SET is_active = false, updated_at = NOW() WHERE company_id = :cid"),
        {"cid": company_id},
    )

    # ── Clear all log tables for this company ────────────────────────────────
    # Wipe zone, MTM, margin call, and audit logs so the demo starts clean
    # with no ghost data from previous test runs bleeding through.
    for clear_sql in [
        "DELETE FROM zone_change_log        WHERE company_id = :cid",
        "DELETE FROM margin_call_alert_log  WHERE company_id = :cid",
        "DELETE FROM mtm_snapshot_log       WHERE company_id = :cid",
        # Keep order_audit_log entries except test cruft — keep only the
        # demo_reset_initiated row we just inserted (written before this loop)
        "DELETE FROM order_audit_log WHERE company_id = :cid AND action != 'demo_reset_initiated'",
    ]:
        db.execute(text(clear_sql), {"cid": company_id})

    # ── Map facility slots to real facility IDs ───────────────────────────────
    # The seed uses facility_slot: 0 → first active facility, 1 → second, etc.
    # If fewer facilities exist than slots used, extras fall back to NULL.
    facility_rows = db.execute(
        text("SELECT id FROM trading_facilities WHERE company_id = :cid AND is_active = true ORDER BY id ASC"),
        {"cid": company_id},
    ).fetchall()
    facility_slot_map = {
        i: row._mapping["id"] for i, row in enumerate(facility_rows)
    }

    # ── Apply facility limits from seed (so demo shows realistic utilisation) ──
    # seed.facility_limits is optional: [{"slot": 0, "limit_eur": 10000000}, ...]
    for fl in seed.get("facility_limits", []):
        fid = facility_slot_map.get(fl.get("slot"))
        if fid and fl.get("limit_eur"):
            db.execute(
                text("UPDATE trading_facilities SET facility_limit_eur = :lim, updated_at = NOW() WHERE id = :fid"),
                {"lim": fl["limit_eur"], "fid": fid},
            )

    # ── Insert seed exposures + their tranches ────────────────────────────────
    inserted = 0
    for exp in seed_exposures:
        # Insert exposure — RETURNING id so we can attach tranches
        result = db.execute(text("""
            INSERT INTO exposures (
                company_id, from_currency, to_currency, amount,
                instrument_type, exposure_type, budget_rate,
                description, end_date, settlement_period,
                risk_level, status, current_rate, current_value_usd,
                is_active, is_settled, created_at, updated_at
            ) VALUES (
                :company_id, :from_ccy, :to_ccy, :amount,
                :instrument_type, :exposure_type, :budget_rate,
                :description, :end_date, 90,
                'MEDIUM', 'active', 1.0, :amount,
                true, false, NOW(), NOW()
            ) RETURNING id
        """), {
            "company_id": company_id,
            "from_ccy": exp["from_currency"],
            "to_ccy": exp["to_currency"],
            "amount": exp["amount"],
            "instrument_type": exp.get("instrument_type", "Forward"),
            "exposure_type": exp.get("exposure_type", "payable"),
            "budget_rate": exp.get("budget_rate"),
            "description": exp.get("description", ""),
            "end_date": datetime.strptime(exp["end_date"], "%Y-%m-%d").date() if exp.get("end_date") else None,
        })
        exposure_id = result.fetchone()._mapping["id"]
        inserted += 1

        # Insert tranches for this exposure
        for tranche in exp.get("tranches", []):
            slot = tranche.get("facility_slot")
            facility_id = facility_slot_map.get(slot) if slot is not None else None
            age_days = tranche.get("age_days", 14)
            executed_at = datetime.utcnow() - timedelta(days=age_days)

            db.execute(text("""
                INSERT INTO hedge_tranches (
                    exposure_id, company_id, amount, rate,
                    instrument, value_date, status,
                    notes, facility_id, is_settled,
                    executed_at, executed_by, created_at
                ) VALUES (
                    :exposure_id, :company_id, :amount, :rate,
                    :instrument, :value_date, :status,
                    :notes, :facility_id, false,
                    :executed_at, :executed_by, NOW()
                )
            """), {
                "exposure_id": exposure_id,
                "company_id": company_id,
                "amount": tranche["amount"],
                "rate": tranche["rate"],
                "instrument": tranche.get("instrument", "Forward"),
                "value_date": datetime.strptime(tranche["value_date"], "%Y-%m-%d").date() if tranche.get("value_date") else None,
                "status": tranche.get("status", "executed"),
                "notes": tranche.get("notes", ""),
                "facility_id": facility_id,
                "executed_at": executed_at,
                "executed_by": "demo-seed",
            })

    # ── Audit log: reset completed ────────────────────────────────────────────
    db.execute(text("""
        INSERT INTO order_audit_log
            (company_id, exposure_id, currency_pair, action, sent_by, sent_at)
        VALUES
            (:cid, NULL, NULL, 'demo_reset_completed', :user, NOW())
    """), {"cid": company_id, "user": admin.get("email", "superadmin")})

    db.commit()
    logger.info(
        f"Demo reset: company_id={company_id} name='{company_name}' "
        f"exposures_inserted={inserted} by {admin.get('email')}"
    )
    return {
        "success": True,
        "message": f"Demo reset complete — {inserted} exposures loaded",
        "company": company_name,
        "exposures_inserted": inserted,
    }


@router.get("/companies/{company_id}/exposures")
def list_exposures(company_id: int, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT id, from_currency, to_currency, amount, instrument_type, COALESCE(exposure_type, 'payable') AS exposure_type, budget_rate, description, end_date, created_at FROM exposures WHERE company_id = :cid AND (is_active IS NULL OR is_active = true) ORDER BY created_at DESC"), {"cid": company_id}).fetchall()
    return {"exposures": [{"id": r._mapping["id"], "pair": f"{r._mapping['from_currency']}/{r._mapping['to_currency']}", "from_currency": r._mapping["from_currency"], "to_currency": r._mapping["to_currency"], "amount": r._mapping["amount"], "instrument_type": r._mapping["instrument_type"], "exposure_type": r._mapping["exposure_type"], "budget_rate": r._mapping["budget_rate"], "description": r._mapping["description"], "end_date": r._mapping["end_date"], "created_at": r._mapping["created_at"]} for r in rows]}

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
    # superadmin / legacy admin → all users; company_admin → own company's users only
    if admin.get("role") in ("superadmin", "admin"):
        rows = db.execute(text(
            "SELECT u.id, u.email, u.role, u.created_at, c.name as company_name, c.id as company_id "
            "FROM users u LEFT JOIN companies c ON u.company_id = c.id ORDER BY u.created_at DESC"
        )).fetchall()
    else:
        cid = int(admin.get("company_id", 0))
        rows = db.execute(text(
            "SELECT u.id, u.email, u.role, u.created_at, c.name as company_name, c.id as company_id "
            "FROM users u LEFT JOIN companies c ON u.company_id = c.id "
            "WHERE u.company_id = :cid ORDER BY u.created_at DESC"
        ), {"cid": cid}).fetchall()
    return {"users": [{"id": r._mapping["id"], "email": r._mapping["email"], "role": r._mapping["role"], "created_at": r._mapping["created_at"], "company_name": r._mapping["company_name"], "company_id": r._mapping["company_id"]} for r in rows]}

@router.post("/users")
async def create_user(request: CreateUserRequest, admin: dict = Depends(require_admin), db: Session = Depends(get_db)):
    import bcrypt, secrets, httpx

    # Block superadmin role from being assigned via API — only set directly in DB
    if request.role == "superadmin":
        raise HTTPException(status_code=400, detail="superadmin role cannot be assigned via the API")

    # company_admin: force company_id to their own company, regardless of what was sent
    if admin.get("role") not in ("superadmin", "admin"):
        request.company_id = int(admin.get("company_id", 0))

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
    # company_admin: verify the target user belongs to their company
    if admin.get("role") not in ("superadmin", "admin"):
        target = db.execute(
            text("SELECT company_id FROM users WHERE id = :id"), {"id": user_id}
        ).fetchone()
        if not target or int(target._mapping["company_id"]) != int(admin.get("company_id", 0)):
            raise HTTPException(status_code=403, detail="Cannot delete users outside your company")
    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    db.commit()
    return {"message": f"User {user_id} deleted"}