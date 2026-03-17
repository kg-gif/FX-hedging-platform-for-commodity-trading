"""
Settings Routes — Company, Bank, Policy, Notifications
Auth functions inlined — no external auth_utils dependency.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import os

from models import Company, Exposure, PolicyAuditLog
from database import SessionLocal

router = APIRouter(prefix="/api/settings", tags=["Settings"])
security = HTTPBearer(auto_error=False)

APPROVED_PAIRS = {
    "EUR/USD","GBP/USD","USD/JPY","USD/CHF","AUD/USD","USD/CAD","NZD/USD",
    "EUR/GBP","EUR/JPY","EUR/CHF","EUR/AUD","EUR/CAD",
    "GBP/JPY","GBP/CHF","AUD/JPY","CHF/JPY","AUD/NZD",
    "EUR/NOK","EUR/SEK","GBP/NOK","GBP/SEK","NOK/SEK",
    "USD/MXN","USD/CNY","USD/BRL","USD/ZAR",
    "USD/INR","USD/TRY","USD/NOK","USD/SEK"
}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── Inline auth ──────────────────────────────────────────────────
def get_token_payload(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    from jose import JWTError, jwt
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def resolve_company_id(requested_id: int, payload: dict) -> int:
    """superadmin / admin (legacy) bypass; all other roles are restricted to own company."""
    role = payload.get("role", "")
    if role in ("superadmin", "admin"):
        return requested_id
    token_company_id = payload.get("company_id")
    if not token_company_id:
        raise HTTPException(status_code=403, detail="No company assigned to this account")
    return int(token_company_id)

# ── Pydantic models ──────────────────────────────────────────────
class CompanySettingsRequest(BaseModel):
    name: Optional[str] = None
    base_currency: Optional[str] = None
    trading_volume_monthly: Optional[float] = None

class BankSettingsRequest(BaseModel):
    bank_name: Optional[str] = None
    bank_contact_name: Optional[str] = None
    bank_email: Optional[str] = None

class NotificationSettingsRequest(BaseModel):
    alert_email: Optional[str] = None
    daily_digest: Optional[bool] = None

class PolicyCascadeRequest(BaseModel):
    policy_id: int
    company_id: int
    changed_by: Optional[str] = "admin"

class HedgeOverrideRequest(BaseModel):
    exposure_id: int
    hedge_ratio: float
    changed_by: Optional[str] = "admin"

class ZoneConfigRequest(BaseModel):
    defensive_ratio:        Optional[float] = None   # e.g. 0.75
    opportunistic_ratio:    Optional[float] = None   # e.g. 0.25
    adverse_trigger_pct:    Optional[float] = None   # e.g. 3.0
    favourable_trigger_pct: Optional[float] = None   # e.g. 3.0
    zone_auto_apply:        Optional[bool]  = None
    zone_notify_email:      Optional[bool]  = None
    zone_notify_inapp:      Optional[bool]  = None


# ── Policy seed helper ───────────────────────────────────────────────────────

def _seed_default_policies(db, company_id: int) -> None:
    """
    Insert Conservative / Balanced (active) / Opportunistic defaults for a
    company that has no hedging policies yet.  Called on-demand so newly
    onboarded companies never hit a 404 when saving zone config.
    """
    defaults = [
        {"company_id": company_id, "policy_name": "Conservative",  "policy_type": "CONSERVATIVE",
         "hedge_ratio_over_5m": 0.85, "hedge_ratio_1m_to_5m": 0.70, "hedge_ratio_under_1m": 0.50,
         "material_exposure_threshold": 1000000, "de_minimis_threshold": 500000,
         "budget_breach_threshold_pct": 0.05, "opportunistic_trigger_threshold": 0.05,
         "trailing_stop_trigger": 0.03, "is_active": False},
        {"company_id": company_id, "policy_name": "Balanced",       "policy_type": "BALANCED",
         "hedge_ratio_over_5m": 0.65, "hedge_ratio_1m_to_5m": 0.50, "hedge_ratio_under_1m": 0.30,
         "material_exposure_threshold": 1000000, "de_minimis_threshold": 500000,
         "budget_breach_threshold_pct": 0.08, "opportunistic_trigger_threshold": 0.08,
         "trailing_stop_trigger": 0.05, "is_active": True},
        {"company_id": company_id, "policy_name": "Opportunistic",  "policy_type": "OPPORTUNISTIC",
         "hedge_ratio_over_5m": 0.40, "hedge_ratio_1m_to_5m": 0.25, "hedge_ratio_under_1m": 0.10,
         "material_exposure_threshold": 1000000, "de_minimis_threshold": 500000,
         "budget_breach_threshold_pct": 0.12, "opportunistic_trigger_threshold": 0.12,
         "trailing_stop_trigger": 0.08, "is_active": False},
    ]
    for p in defaults:
        db.execute(text("""
            INSERT INTO hedging_policies
            (company_id, policy_name, policy_type, hedge_ratio_over_5m, hedge_ratio_1m_to_5m,
             hedge_ratio_under_1m, material_exposure_threshold, de_minimis_threshold,
             budget_breach_threshold_pct, opportunistic_trigger_threshold, trailing_stop_trigger, is_active)
            VALUES
            (:company_id, :policy_name, :policy_type, :hedge_ratio_over_5m, :hedge_ratio_1m_to_5m,
             :hedge_ratio_under_1m, :material_exposure_threshold, :de_minimis_threshold,
             :budget_breach_threshold_pct, :opportunistic_trigger_threshold, :trailing_stop_trigger, :is_active)
        """), p)
    db.commit()
    print(f"[settings] Auto-seeded default policies for company_id={company_id}")

# ── Endpoints ────────────────────────────────────────────────────

@router.get("/{company_id}")
def get_settings(company_id: int, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(company_id, payload)
    company = db.query(Company).filter(Company.id == safe_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    policy = db.execute(text("SELECT * FROM hedging_policies WHERE company_id = :cid AND is_active = true"), {"cid": safe_id}).fetchone()
    p = dict(policy._mapping) if policy else {}
    return {
        "company": {"id": company.id, "name": company.name, "base_currency": company.base_currency, "trading_volume_monthly": company.trading_volume_monthly},
        "bank": {"bank_name": company.bank_name, "bank_contact_name": company.bank_contact_name, "bank_email": company.bank_email},
        "notifications": {"alert_email": company.alert_email, "daily_digest": company.daily_digest},
        "active_policy": p if p else None,
        "zone_config": {
            "defensive_ratio":       p.get("defensive_ratio", 0.75),
            "opportunistic_ratio":   p.get("opportunistic_ratio", 0.25),
            "adverse_trigger_pct":   p.get("adverse_trigger_pct", 3.0),
            "favourable_trigger_pct": p.get("favourable_trigger_pct", 3.0),
            "zone_auto_apply":       p.get("zone_auto_apply", False),
            "zone_notify_email":     p.get("zone_notify_email", True),
            "zone_notify_inapp":     p.get("zone_notify_inapp", True),
        } if p else None,
        "approved_pairs": sorted(list(APPROVED_PAIRS))
    }

@router.put("/{company_id}/company")
def update_company_settings(company_id: int, request: CompanySettingsRequest, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(company_id, payload)
    company = db.query(Company).filter(Company.id == safe_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if request.name: company.name = request.name
    if request.base_currency: company.base_currency = request.base_currency.upper()
    if request.trading_volume_monthly: company.trading_volume_monthly = request.trading_volume_monthly
    company.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "message": "Company settings updated"}

@router.put("/{company_id}/bank")
def update_bank_settings(company_id: int, request: BankSettingsRequest, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(company_id, payload)
    company = db.query(Company).filter(Company.id == safe_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if request.bank_name is not None: company.bank_name = request.bank_name
    if request.bank_contact_name is not None: company.bank_contact_name = request.bank_contact_name
    if request.bank_email is not None: company.bank_email = request.bank_email
    company.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "message": "Bank settings updated"}

@router.put("/{company_id}/notifications")
def update_notification_settings(company_id: int, request: NotificationSettingsRequest, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(company_id, payload)
    company = db.query(Company).filter(Company.id == safe_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if request.alert_email is not None: company.alert_email = request.alert_email
    if request.daily_digest is not None: company.daily_digest = request.daily_digest
    company.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "message": "Notification settings updated"}

@router.put("/{company_id}/zones")
def update_zone_config(
    company_id: int,
    request: ZoneConfigRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Update zone configuration fields on the active hedging policy.
    Only fields explicitly provided in the request are updated.
    """
    safe_id = resolve_company_id(company_id, payload)
    policy = db.execute(
        text("SELECT id FROM hedging_policies WHERE company_id = :cid AND is_active = true"),
        {"cid": safe_id}
    ).fetchone()
    if not policy:
        # No policies exist yet — auto-seed defaults (Balanced active) then re-query.
        # Avoids the 404 "No active policy found" error for newly onboarded companies.
        _seed_default_policies(db, safe_id)
        policy = db.execute(
            text("SELECT id FROM hedging_policies WHERE company_id = :cid AND is_active = true"),
            {"cid": safe_id}
        ).fetchone()
    if not policy:
        raise HTTPException(status_code=500, detail="Could not create default policies")

    policy_id = policy._mapping["id"]

    # Build SET clause dynamically — only update fields that were provided
    updates = {}
    if request.defensive_ratio        is not None: updates["defensive_ratio"]        = request.defensive_ratio
    if request.opportunistic_ratio    is not None: updates["opportunistic_ratio"]    = request.opportunistic_ratio
    if request.adverse_trigger_pct    is not None: updates["adverse_trigger_pct"]    = request.adverse_trigger_pct
    if request.favourable_trigger_pct is not None: updates["favourable_trigger_pct"] = request.favourable_trigger_pct
    if request.zone_auto_apply        is not None: updates["zone_auto_apply"]        = request.zone_auto_apply
    if request.zone_notify_email      is not None: updates["zone_notify_email"]      = request.zone_notify_email
    if request.zone_notify_inapp      is not None: updates["zone_notify_inapp"]      = request.zone_notify_inapp

    if not updates:
        return {"success": True, "message": "No changes"}

    set_clause = ", ".join(f"{col} = :{col}" for col in updates)
    updates["id"] = policy_id
    db.execute(text(f"UPDATE hedging_policies SET {set_clause} WHERE id = :id"), updates)
    db.commit()
    return {"success": True, "message": "Zone configuration updated", "policy_id": policy_id}


@router.post("/policy/cascade")
def cascade_policy(request: PolicyCascadeRequest, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(request.company_id, payload)
    policy = db.execute(text("SELECT * FROM hedging_policies WHERE id = :id AND company_id = :cid"), {"id": request.policy_id, "cid": safe_id}).fetchone()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    p = policy._mapping
    exposures = db.query(Exposure).filter(Exposure.company_id == safe_id).all()
    updated = skipped = 0
    for exp in exposures:
        if getattr(exp, 'hedge_override', False):
            skipped += 1
            continue
        amount_usd = exp.amount * (exp.current_rate or 1)
        if amount_usd >= 5_000_000: new_ratio = float(p["hedge_ratio_over_5m"])
        elif amount_usd >= 1_000_000: new_ratio = float(p["hedge_ratio_1m_to_5m"])
        else: new_ratio = float(p["hedge_ratio_under_1m"])
        exp.hedge_ratio_policy = new_ratio
        exp.updated_at = datetime.utcnow()
        updated += 1
    db.execute(text("UPDATE hedging_policies SET is_active = false WHERE company_id = :cid"), {"cid": safe_id})
    db.execute(text("UPDATE hedging_policies SET is_active = true WHERE id = :id"), {"id": request.policy_id})
    audit = PolicyAuditLog(company_id=safe_id, policy_id=request.policy_id, policy_name=p["policy_name"], changed_by=request.changed_by, exposures_updated=updated, exposures_skipped=skipped, notes=f"Cascaded to {updated} exposures. {skipped} manual overrides preserved.")
    db.add(audit)
    db.commit()
    return {"success": True, "policy_name": p["policy_name"], "exposures_updated": updated, "exposures_skipped": skipped, "message": f"Policy activated. {updated} exposures updated, {skipped} manual overrides preserved."}

@router.post("/policy/cascade/preview")
def preview_cascade(request: PolicyCascadeRequest, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(request.company_id, payload)
    policy = db.execute(text("SELECT * FROM hedging_policies WHERE id = :id AND company_id = :cid"), {"id": request.policy_id, "cid": safe_id}).fetchone()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    exposures = db.query(Exposure).filter(Exposure.company_id == safe_id).all()
    will_update = sum(1 for e in exposures if not getattr(e, 'hedge_override', False))
    will_skip = sum(1 for e in exposures if getattr(e, 'hedge_override', False))
    p = policy._mapping
    return {"policy_name": p["policy_name"], "will_update": will_update, "will_skip": will_skip, "message": f"This will update {will_update} exposures. {will_skip} have manual overrides and will not change."}

@router.post("/exposure/override")
def set_hedge_override(request: HedgeOverrideRequest, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    if not 0 <= request.hedge_ratio <= 1:
        raise HTTPException(status_code=400, detail="Hedge ratio must be between 0 and 1")
    exp = db.query(Exposure).filter(Exposure.id == request.exposure_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Exposure not found")
    safe_id = resolve_company_id(exp.company_id, payload)
    if exp.company_id != safe_id:
        raise HTTPException(status_code=403, detail="Access denied")
    exp.hedge_ratio_policy = request.hedge_ratio
    exp.hedge_override = True
    exp.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "exposure_id": request.exposure_id, "hedge_ratio": request.hedge_ratio, "message": "Manual override set."}

@router.delete("/exposure/{exposure_id}/override")
def clear_hedge_override(exposure_id: int, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    exp = db.query(Exposure).filter(Exposure.id == exposure_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Exposure not found")
    safe_id = resolve_company_id(exp.company_id, payload)
    if exp.company_id != safe_id:
        raise HTTPException(status_code=403, detail="Access denied")
    exp.hedge_override = False
    exp.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "message": "Override removed. Exposure now follows active policy."}

@router.get("/{company_id}/audit")
def get_audit_log(company_id: int, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(company_id, payload)
    logs = db.query(PolicyAuditLog).filter(PolicyAuditLog.company_id == safe_id).order_by(PolicyAuditLog.timestamp.desc()).limit(50).all()
    return {"audit_log": [{"id": l.id, "policy_name": l.policy_name, "changed_by": l.changed_by, "exposures_updated": l.exposures_updated, "exposures_skipped": l.exposures_skipped, "timestamp": l.timestamp.isoformat(), "notes": l.notes} for l in logs]}

@router.get("/pairs/approved")
def get_approved_pairs():
    majors = sorted([p for p in APPROVED_PAIRS if "USD" in p and "/" in p and len(p) == 7 and p not in {"USD/MXN","USD/CNY","USD/BRL","USD/ZAR","USD/INR","USD/TRY","USD/NOK","USD/SEK"}])
    nok_sek = sorted([p for p in APPROVED_PAIRS if "NOK" in p or "SEK" in p])
    exotics = sorted(["USD/MXN","USD/CNY","USD/BRL","USD/ZAR","USD/INR","USD/TRY","USD/NOK","USD/SEK"])
    minors = sorted([p for p in APPROVED_PAIRS if p not in majors and p not in nok_sek and p not in exotics])
    return {"majors": majors, "minors": minors, "nok_sek_crosses": nok_sek, "liquid_exotics": exotics, "total": len(APPROVED_PAIRS)}
