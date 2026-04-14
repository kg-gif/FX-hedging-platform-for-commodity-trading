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
import asyncio
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
    default_exposure_direction: Optional[str] = None  # 'payable' | 'receivable' | 'mixed'

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

class AlertPrefsRequest(BaseModel):
    mc_alert_threshold_pct: Optional[float] = None   # e.g. 2.0 = 2% of notional
    mc_alert_recipients:    Optional[str]   = None   # "all" | "admins_only"


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
    # Alert prefs — stored directly on companies row
    mc_row = db.execute(
        text("SELECT mc_alert_threshold_pct, mc_alert_recipients FROM companies WHERE id = :cid"),
        {"cid": safe_id},
    ).fetchone()
    mc = mc_row._mapping if mc_row else {}
    return {
        "company": {"id": company.id, "name": company.name, "base_currency": company.base_currency,
                    "trading_volume_monthly": company.trading_volume_monthly,
                    "default_exposure_direction": getattr(company, 'default_exposure_direction', None) or 'payable'},
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
        "alert_prefs": {
            "mc_alert_threshold_pct": float(mc.get("mc_alert_threshold_pct") or 2.0),
            "mc_alert_recipients":    mc.get("mc_alert_recipients") or "all",
        },
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
    if request.default_exposure_direction is not None:
        allowed = ('payable', 'receivable', 'mixed')
        val = request.default_exposure_direction.strip().lower()
        if val not in allowed:
            raise HTTPException(status_code=400, detail="default_exposure_direction must be 'payable', 'receivable', or 'mixed'")
        company.default_exposure_direction = val
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

@router.put("/{company_id}/alerts")
def update_alert_prefs(company_id: int, request: AlertPrefsRequest, db: Session = Depends(get_db), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(company_id, payload)
    updates = {}
    if request.mc_alert_threshold_pct is not None:
        updates["mc_alert_threshold_pct"] = max(0.1, min(50.0, request.mc_alert_threshold_pct))
    if request.mc_alert_recipients is not None:
        if request.mc_alert_recipients not in ("all", "admins_only"):
            raise HTTPException(status_code=400, detail="mc_alert_recipients must be 'all' or 'admins_only'")
        updates["mc_alert_recipients"] = request.mc_alert_recipients
    if not updates:
        return {"success": True, "message": "No changes"}
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["cid"] = safe_id
    db.execute(text(f"UPDATE companies SET {set_clause} WHERE id = :cid"), updates)
    db.commit()
    return {"success": True, "message": "Alert preferences updated"}

async def _background_zone_scan(company_id: int):
    """
    Background task: re-evaluate zone status for all exposures after a threshold change.

    Creates its own DB session so it can safely run after the HTTP response has been
    returned.  Any zone transitions found are logged to zone_change_log and (if
    zone_notify_email is enabled) sent via email — same logic as the enriched endpoint.

    Only triggered when adverse_trigger_pct or favourable_trigger_pct is saved,
    because those are the fields that change which zone an exposure falls into.
    """
    # Late imports to avoid circular dependencies at module load time
    from birk_api import get_current_rates, calculate_zone
    from routes.margin_call_routes import should_send_alert_today as _weekday_check
    import httpx as _httpx

    db = SessionLocal()
    print(f"[zone-policy-scan] starting background scan for company_id={company_id}")
    try:
        policy_row = db.execute(
            text("SELECT * FROM hedging_policies WHERE company_id = :cid AND is_active = true"),
            {"cid": company_id}
        ).fetchone()
        if not policy_row:
            print(f"[zone-policy-scan] no active policy for company_id={company_id} — skipping")
            return

        policy = dict(policy_row._mapping)
        if not policy.get("zone_notify_email"):
            print(f"[zone-policy-scan] zone_notify_email=false for company_id={company_id} — skipping")
            return

        adv_trig = float(policy.get("adverse_trigger_pct")    or 3.0)
        fav_trig = float(policy.get("favourable_trigger_pct") or 3.0)
        print(f"[zone-policy-scan] thresholds: adverse={adv_trig}%, favourable={fav_trig}%")

        company_row = db.execute(
            text("SELECT alert_email FROM companies WHERE id = :cid"), {"cid": company_id}
        ).fetchone()
        alert_email = company_row._mapping["alert_email"] if company_row else None

        exposures = db.execute(text("""
            SELECT id, from_currency, to_currency, budget_rate,
                   exposure_type, direction
            FROM exposures
            WHERE company_id = :cid
              AND (is_active IS NULL OR is_active = true)
              AND budget_rate IS NOT NULL
        """), {"cid": company_id}).fetchall()

        if not exposures:
            print(f"[zone-policy-scan] no exposures for company_id={company_id} — skipping")
            return

        pairs = list(dict.fromkeys([
            f"{e._mapping['from_currency']}/{e._mapping['to_currency']}"
            for e in exposures
        ]))
        live_rates = await get_current_rates(pairs)

        resend_key   = os.getenv("RESEND_API_KEY")
        frontend_url = os.getenv("FRONTEND_URL", "https://app.sumnohow.com")

        # Pre-aggregate total notional per pair so the alert email shows the full picture
        pair_aggregates: dict = {}
        for _exp in exposures:
            _e = _exp._mapping
            _pair = f"{_e['from_currency']}/{_e['to_currency']}"
            if _pair not in pair_aggregates:
                pair_aggregates[_pair] = {"total_amount": 0.0, "count": 0, "from_currency": _e["from_currency"]}
            pair_aggregates[_pair]["total_amount"] += float(_e.get("amount") or 0)
            pair_aggregates[_pair]["count"] += 1

        checked_pairs: set = set()

        for exp_row in exposures:
            exp  = exp_row._mapping
            pair = f"{exp['from_currency']}/{exp['to_currency']}"
            if pair in checked_pairs:
                continue

            rate_info    = live_rates.get(pair)
            current_spot = float(rate_info["rate"]) if rate_info and rate_info.get("rate") else None
            budget_rate  = float(exp["budget_rate"])
            if not current_spot:
                checked_pairs.add(pair)
                continue

            direction    = (exp.get("exposure_type") or exp.get("direction") or "payable").strip().lower()
            pct_move     = (current_spot - budget_rate) / budget_rate * 100
            current_zone = calculate_zone(current_spot, budget_rate, adv_trig, fav_trig, direction)

            last_log = db.execute(text("""
                SELECT new_zone FROM zone_change_log
                WHERE company_id = :cid AND currency_pair = :pair
                ORDER BY created_at DESC LIMIT 1
            """), {"cid": company_id, "pair": pair}).fetchone()

            if last_log is None:
                # Write baseline — the correct current zone, not just 'base'
                db.execute(text("""
                    INSERT INTO zone_change_log
                        (company_id, currency_pair, previous_zone, new_zone,
                         trigger_type, spot_rate, budget_rate, pct_move, created_at)
                    VALUES (:cid, :pair, 'base', :new, 'policy_save', :spot, :budget, :pct, NOW())
                """), {
                    "cid": company_id, "pair": pair, "new": current_zone,
                    "spot": round(current_spot, 6), "budget": budget_rate, "pct": round(pct_move, 2)
                })
                db.commit()
                print(f"[zone-policy-scan] {pair}: baseline written ({current_zone})")
                checked_pairs.add(pair)
                continue

            last_zone = last_log._mapping["new_zone"]
            if current_zone == last_zone:
                print(f"[zone-policy-scan] {pair}: unchanged ({current_zone})")
                checked_pairs.add(pair)
                continue

            # 24h cooldown check — query BEFORE inserting (same as enriched endpoint)
            cooldown_row = db.execute(text("""
                SELECT id FROM zone_change_log
                WHERE company_id = :cid AND currency_pair = :pair
                  AND trigger_type IN ('auto', 'policy_save', 'manual_scan')
                  AND created_at > NOW() - INTERVAL '24 hours'
                ORDER BY created_at DESC LIMIT 1
            """), {"cid": company_id, "pair": pair}).fetchone()
            in_cooldown = bool(cooldown_row)

            # Always log the zone change for the audit trail
            db.execute(text("""
                INSERT INTO zone_change_log
                    (company_id, currency_pair, previous_zone, new_zone,
                     trigger_type, spot_rate, budget_rate, pct_move, created_at)
                VALUES (:cid, :pair, :prev, :new, 'policy_save', :spot, :budget, :pct, NOW())
            """), {
                "cid": company_id, "pair": pair, "prev": last_zone, "new": current_zone,
                "spot": round(current_spot, 6), "budget": budget_rate, "pct": round(pct_move, 2)
            })
            db.commit()
            print(f"[zone-policy-scan] {pair}: zone changed {last_zone} → {current_zone}")

            if in_cooldown:
                print(f"[zone-policy-scan] {pair}: in 24h cooldown — logged, email suppressed")
                checked_pairs.add(pair)
                continue

            # Send email — weekday check applies (threshold saves happen in business hours)
            if not resend_key or not alert_email:
                print(f"[zone-policy-scan] {pair}: no resend key or alert email — skipping email")
                checked_pairs.add(pair)
                continue

            if not _weekday_check():
                print(f"[zone-policy-scan] {pair}: weekend — suppressing email")
                checked_pairs.add(pair)
                continue

            zone_label  = current_zone.upper()
            action_text = (
                "Increase hedge coverage to the Defensive target."
                if current_zone == "defensive"
                else "Consider reducing hedge coverage to the Opportunistic target."
                if current_zone == "opportunistic"
                else "Zone has returned to Base — review current hedge levels."
            )
            agg = pair_aggregates.get(pair, {})
            exposure_line = (
                f"{agg.get('count', 1)} exposure{'s' if agg.get('count', 1) != 1 else ''} "
                f"totalling {agg.get('from_currency', '')} {int(agg.get('total_amount', 0)):,}"
            )
            try:
                async with _httpx.AsyncClient(timeout=10) as client:
                    resp = await client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                        json={
                            "from":    "Sumnohow <alerts@updates.sumnohow.com>",
                            "to":      ["alerts@updates.sumnohow.com"],
                            "bcc":     [alert_email],
                            "subject": f"{pair} Zone Alert — {zone_label}",
                            "html": (
                                f"<p><strong>{pair}</strong> has moved into the <strong>{zone_label}</strong> "
                                f"zone following a policy threshold change.</p>"
                                f"<ul>"
                                f"<li>Affected: {exposure_line}</li>"
                                f"<li>Current spot: {round(current_spot, 4)}</li>"
                                f"<li>Budget rate: {round(budget_rate, 4)}</li>"
                                f"<li>Move vs budget: {round(pct_move, 2)}%</li>"
                                f"<li>New thresholds: Defensive {adv_trig}% / Opportunistic {fav_trig}%</li>"
                                f"</ul>"
                                f"<p><strong>Recommended action:</strong> {action_text}</p>"
                                f"<p><a href='{frontend_url}'>Review in Sumnohow →</a></p>"
                            ),
                        },
                    )
                print(f"[zone-policy-scan] email sent to {alert_email} for {pair} → {current_zone} | HTTP {resp.status_code}")
            except Exception as _e:
                print(f"[zone-policy-scan] email FAILED for {pair}: {_e}")

            checked_pairs.add(pair)

    except Exception as e:
        print(f"[zone-policy-scan] ERROR for company_id={company_id}: {e}")
    finally:
        db.close()


@router.put("/{company_id}/zones")
async def update_zone_config(
    company_id: int,
    request: ZoneConfigRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Update zone configuration fields on the active hedging policy.
    Only fields explicitly provided in the request are updated.
    When threshold fields change, triggers a background zone re-evaluation
    so alerts fire immediately without waiting for the next page load.
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

    # If thresholds changed, immediately re-evaluate zones for all exposures.
    # Fire as a background task so the HTTP response returns instantly.
    threshold_fields = {"adverse_trigger_pct", "favourable_trigger_pct"}
    if threshold_fields & set(updates.keys()):
        asyncio.create_task(_background_zone_scan(safe_id))
        print(f"[zone-policy-scan] background scan queued for company_id={safe_id}")

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
