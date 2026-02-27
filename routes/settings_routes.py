"""
Settings Routes — Company, Bank, Policy, Notifications
Includes policy cascade with audit log
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from models import Company, Exposure, PolicyAuditLog
from database import SessionLocal

router = APIRouter(prefix="/api/settings", tags=["Settings"])

# ── Currency whitelist ──────────────────────────────────────────────────────
APPROVED_PAIRS = {
    # Majors
    "EUR/USD","GBP/USD","USD/JPY","USD/CHF","AUD/USD","USD/CAD","NZD/USD",
    # Minors
    "EUR/GBP","EUR/JPY","EUR/CHF","EUR/AUD","EUR/CAD",
    "GBP/JPY","GBP/CHF","AUD/JPY","CHF/JPY","AUD/NZD",
    # NOK/SEK crosses
    "EUR/NOK","EUR/SEK","GBP/NOK","GBP/SEK","NOK/SEK",
    # Liquid exotics
    "USD/MXN","USD/CNY","USD/BRL","USD/ZAR",
    "USD/INR","USD/TRY","USD/NOK","USD/SEK"
}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── Pydantic models ─────────────────────────────────────────────────────────

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

# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/{company_id}")
def get_settings(company_id: int, db: Session = Depends(get_db)):
    """Get all settings for a company"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Get active policy
    policy = db.execute(
        text("SELECT * FROM hedging_policies WHERE company_id = :cid AND is_active = true"),
        {"cid": company_id}
    ).fetchone()

    return {
        "company": {
            "id": company.id,
            "name": company.name,
            "base_currency": company.base_currency,
            "trading_volume_monthly": company.trading_volume_monthly,
        },
        "bank": {
            "bank_name": company.bank_name,
            "bank_contact_name": company.bank_contact_name,
            "bank_email": company.bank_email,
        },
        "notifications": {
            "alert_email": company.alert_email,
            "daily_digest": company.daily_digest,
        },
        "active_policy": dict(policy._mapping) if policy else None,
        "approved_pairs": sorted(list(APPROVED_PAIRS))
    }


@router.put("/{company_id}/company")
def update_company_settings(
    company_id: int,
    request: CompanySettingsRequest,
    db: Session = Depends(get_db)
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if request.name: company.name = request.name
    if request.base_currency: company.base_currency = request.base_currency.upper()
    if request.trading_volume_monthly: company.trading_volume_monthly = request.trading_volume_monthly
    company.updated_at = datetime.utcnow()

    db.commit()
    return {"success": True, "message": "Company settings updated"}


@router.put("/{company_id}/bank")
def update_bank_settings(
    company_id: int,
    request: BankSettingsRequest,
    db: Session = Depends(get_db)
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if request.bank_name is not None: company.bank_name = request.bank_name
    if request.bank_contact_name is not None: company.bank_contact_name = request.bank_contact_name
    if request.bank_email is not None: company.bank_email = request.bank_email
    company.updated_at = datetime.utcnow()

    db.commit()
    return {"success": True, "message": "Bank settings updated"}


@router.put("/{company_id}/notifications")
def update_notification_settings(
    company_id: int,
    request: NotificationSettingsRequest,
    db: Session = Depends(get_db)
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if request.alert_email is not None: company.alert_email = request.alert_email
    if request.daily_digest is not None: company.daily_digest = request.daily_digest
    company.updated_at = datetime.utcnow()

    db.commit()
    return {"success": True, "message": "Notification settings updated"}


@router.post("/policy/cascade")
def cascade_policy(request: PolicyCascadeRequest, db: Session = Depends(get_db)):
    """
    Activate a policy and cascade hedge ratios to all non-overridden exposures.
    """
    # Get new policy
    policy = db.execute(
        text("SELECT * FROM hedging_policies WHERE id = :id AND company_id = :cid"),
        {"id": request.policy_id, "cid": request.company_id}
    ).fetchone()

    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    p = policy._mapping

    # Get all exposures for company
    exposures = db.query(Exposure).filter(
        Exposure.company_id == request.company_id
    ).all()

    updated = 0
    skipped = 0

    for exp in exposures:
        if getattr(exp, 'hedge_override', False):
            skipped += 1
            continue

        # Apply correct ratio based on exposure size
        amount_usd = exp.amount * (exp.current_rate or 1)
        if amount_usd >= 5_000_000:
            new_ratio = float(p["hedge_ratio_over_5m"])
        elif amount_usd >= 1_000_000:
            new_ratio = float(p["hedge_ratio_1m_to_5m"])
        else:
            new_ratio = float(p["hedge_ratio_under_1m"])

        exp.hedge_ratio_policy = new_ratio
        exp.updated_at = datetime.utcnow()
        updated += 1

    # Deactivate all policies, activate selected
    db.execute(
        text("UPDATE hedging_policies SET is_active = false WHERE company_id = :cid"),
        {"cid": request.company_id}
    )
    db.execute(
        text("UPDATE hedging_policies SET is_active = true WHERE id = :id"),
        {"id": request.policy_id}
    )

    # Write audit log
    audit = PolicyAuditLog(
        company_id=request.company_id,
        policy_id=request.policy_id,
        policy_name=p["policy_name"],
        changed_by=request.changed_by,
        exposures_updated=updated,
        exposures_skipped=skipped,
        notes=f"Cascaded to {updated} exposures. {skipped} manual overrides preserved."
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "policy_name": p["policy_name"],
        "exposures_updated": updated,
        "exposures_skipped": skipped,
        "message": f"Policy activated. {updated} exposures updated, {skipped} manual overrides preserved."
    }


@router.post("/policy/cascade/preview")
def preview_cascade(request: PolicyCascadeRequest, db: Session = Depends(get_db)):
    """Dry run — returns counts without making any changes"""
    policy = db.execute(
        text("SELECT * FROM hedging_policies WHERE id = :id AND company_id = :cid"),
        {"id": request.policy_id, "cid": request.company_id}
    ).fetchone()

    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    exposures = db.query(Exposure).filter(
        Exposure.company_id == request.company_id
    ).all()

    will_update = sum(1 for e in exposures if not getattr(e, 'hedge_override', False))
    will_skip   = sum(1 for e in exposures if getattr(e, 'hedge_override', False))

    p = policy._mapping
    return {
        "policy_name": p["policy_name"],
        "will_update": will_update,
        "will_skip": will_skip,
        "message": f"This will update {will_update} exposures. {will_skip} have manual overrides and will not change."
    }


@router.post("/exposure/override")
def set_hedge_override(request: HedgeOverrideRequest, db: Session = Depends(get_db)):
    """Set a manual hedge override on a specific exposure"""
    if not 0 <= request.hedge_ratio <= 1:
        raise HTTPException(status_code=400, detail="Hedge ratio must be between 0 and 1")

    exp = db.query(Exposure).filter(Exposure.id == request.exposure_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Exposure not found")

    exp.hedge_ratio_policy = request.hedge_ratio
    exp.hedge_override = True
    exp.updated_at = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "exposure_id": request.exposure_id,
        "hedge_ratio": request.hedge_ratio,
        "message": "Manual override set. This exposure will not be affected by policy changes."
    }


@router.delete("/exposure/{exposure_id}/override")
def clear_hedge_override(exposure_id: int, db: Session = Depends(get_db)):
    """Remove manual override — exposure returns to policy control"""
    exp = db.query(Exposure).filter(Exposure.id == exposure_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Exposure not found")

    exp.hedge_override = False
    exp.updated_at = datetime.utcnow()
    db.commit()

    return {"success": True, "message": "Override removed. Exposure now follows active policy."}


@router.get("/{company_id}/audit")
def get_audit_log(company_id: int, db: Session = Depends(get_db)):
    """Get policy change audit trail for compliance"""
    logs = db.query(PolicyAuditLog)\
        .filter(PolicyAuditLog.company_id == company_id)\
        .order_by(PolicyAuditLog.timestamp.desc())\
        .limit(50)\
        .all()

    return {
        "audit_log": [{
            "id": l.id,
            "policy_name": l.policy_name,
            "changed_by": l.changed_by,
            "exposures_updated": l.exposures_updated,
            "exposures_skipped": l.exposures_skipped,
            "timestamp": l.timestamp.isoformat(),
            "notes": l.notes
        } for l in logs]
    }


@router.get("/pairs/approved")
def get_approved_pairs():
    """Return full list of approved currency pairs"""
    majors  = sorted([p for p in APPROVED_PAIRS if "USD" in p and "/" in p and len(p) == 7
                      and p not in {"USD/MXN","USD/CNY","USD/BRL","USD/ZAR","USD/INR","USD/TRY","USD/NOK","USD/SEK"}])
    nok_sek = sorted([p for p in APPROVED_PAIRS if "NOK" in p or "SEK" in p])
    exotics = sorted(["USD/MXN","USD/CNY","USD/BRL","USD/ZAR","USD/INR","USD/TRY","USD/NOK","USD/SEK"])
    minors  = sorted([p for p in APPROVED_PAIRS if p not in majors and p not in nok_sek and p not in exotics])

    return {
        "majors": majors,
        "minors": minors,
        "nok_sek_crosses": nok_sek,
        "liquid_exotics": exotics,
        "total": len(APPROVED_PAIRS)
    }
