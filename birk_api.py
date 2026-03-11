from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional, Dict
import os
import asyncio
import httpx
from functools import lru_cache

from routes.pdf_routes import router as pdf_router
from routes.settings_routes import router as settings_router
from routes.admin_routes import router as admin_router
from routes.auth_routes import router as auth_router

from models import Base, Company, Exposure, CompanyType, RiskLevel, FXRate
from database import SessionLocal, get_live_fx_rate, calculate_risk_level, engine
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_security = HTTPBearer(auto_error=False)

def get_token_payload(credentials: HTTPAuthorizationCredentials = Depends(_security)) -> dict:
    from jose import JWTError, jwt
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def resolve_company_id(requested_id: int, payload: dict) -> int:
    if payload.get("role") == "admin":
        return requested_id
    token_company_id = payload.get("company_id")
    if not token_company_id:
        raise HTTPException(status_code=403, detail="No company assigned to this account")
    return int(token_company_id)

from routes.hedging_routes_fastapi import router as hedging_router
from routes.hedge_tranche_routes import router as tranche_router
from routes.data_import_routes_fastapi import router as data_import_router
from routes.monte_carlo_routes_fastapi import router as monte_carlo_router

Base.metadata.create_all(bind=engine)
print("✅ Database ready")

app = FastAPI(title="BIRK FX Risk Management API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://birk-dashboard.onrender.com",
        "https://birk-fx-api.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(hedging_router)
app.include_router(tranche_router)
app.include_router(data_import_router)
app.include_router(monte_carlo_router)
app.include_router(pdf_router)
app.include_router(settings_router)
app.include_router(admin_router)
app.include_router(auth_router)

# ── Logging ──────────────────────────────────────────────────────────────────
import logging
logger = logging.getLogger(__name__)

# ── Helpers ──────────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_mock_current_rate(from_currency, to_currency):
    mock_rates = {
        "EUR/USD": 1.0722, "USD/EUR": 0.9327,
        "GBP/USD": 1.2654, "USD/GBP": 0.7903,
        "CNY/USD": 0.1434, "USD/CNY": 6.9735,
        "MXN/USD": 0.0587, "USD/MXN": 17.0358,
        "JPY/USD": 0.0067, "USD/JPY": 149.25,
    }
    return mock_rates.get(f"{from_currency}/{to_currency}", 1.0)


def calculate_pnl_and_status(exposure, current_rate):
    if not exposure.budget_rate or not current_rate:
        return {"current_pnl": None, "hedged_amount": None, "unhedged_amount": None, "pnl_status": "NO_DATA"}

    pnl = (current_rate - exposure.budget_rate) * exposure.amount
    hedge_ratio = exposure.hedge_ratio_policy if exposure.hedge_ratio_policy else 1.0
    hedged_amt = exposure.amount * hedge_ratio
    unhedged_amt = exposure.amount * (1 - hedge_ratio)

    status = "OK"
    if exposure.max_loss_limit is not None and pnl < exposure.max_loss_limit:
        status = "BREACH"
    elif exposure.max_loss_limit is not None and pnl < (exposure.max_loss_limit * 1.1):
        status = "WARNING"
    elif exposure.target_profit is not None and pnl >= exposure.target_profit:
        status = "TARGET_MET"

    return {
        "current_pnl": round(pnl, 2),
        "hedged_amount": round(hedged_amt, 2),
        "unhedged_amount": round(unhedged_amt, 2),
        "pnl_status": status
    }


@lru_cache(maxsize=100)
def get_cached_fx_rate(from_currency: str, to_currency: str, cache_key: str):
    return get_live_fx_rate(from_currency, to_currency)


async def fetch_fx_rate(base_currency: str, target_currency: str) -> Optional[float]:
    api_key = os.getenv("EXCHANGERATE_API_KEY")
    if not api_key:
        logger.error("EXCHANGERATE_API_KEY not set")
        return None
    try:
        url = f"https://v6.exchangerate-api.com/v6/{api_key}/latest/{base_currency}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            if response.status_code != 200:
                return None
            data = response.json()
            if data.get("result") != "success":
                return None
            return data["conversion_rates"].get(target_currency)
    except Exception as e:
        logger.error(f"Error fetching FX rate: {str(e)}")
        return None


async def get_current_rates(currency_pairs: List[str]) -> Dict[str, Dict]:
    db = SessionLocal()
    out = {}
    pairs_needing_refresh = []

    try:
        for pair in currency_pairs:
            if len(pair.split("/")) != 2:
                continue
            cached = db.query(FXRate)\
                .filter(FXRate.currency_pair == pair)\
                .order_by(FXRate.timestamp.desc())\
                .first()

            if cached and cached.timestamp:
                age = datetime.utcnow() - cached.timestamp.replace(tzinfo=None)
                if age < timedelta(hours=4):
                    out[pair] = {"rate": cached.rate, "timestamp": cached.timestamp.isoformat(), "source": "cache"}
                    continue
            pairs_needing_refresh.append(pair)

        if pairs_needing_refresh:
            tasks = [fetch_fx_rate(*p.split("/")) for p in pairs_needing_refresh]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for i, pair in enumerate(pairs_needing_refresh):
                res = results[i]
                if isinstance(res, Exception) or res is None:
                    cached = db.query(FXRate).filter(FXRate.currency_pair == pair).order_by(FXRate.timestamp.desc()).first()
                    if cached:
                        out[pair] = {"rate": cached.rate, "timestamp": cached.timestamp.isoformat(), "source": "cache_fallback"}
                    else:
                        out[pair] = None
                else:
                    fx = FXRate(currency_pair=pair, rate=res, timestamp=datetime.utcnow(), source="exchangerate-api.com")
                    db.add(fx)
                    out[pair] = {"rate": res, "timestamp": datetime.utcnow().isoformat(), "source": "live"}
            db.commit()

    except Exception as e:
        logger.error(f"Error in get_current_rates: {e}")
        db.rollback()
    finally:
        db.close()

    return out


def calculate_rate_change(initial_rate, current_rate):
    if initial_rate is None or initial_rate == 0:
        return None, "neutral"
    change_pct = ((current_rate - initial_rate) / initial_rate) * 100
    if abs(change_pct) < 0.01:
        direction = "neutral"
    elif change_pct > 0:
        direction = "up"
    else:
        direction = "down"
    return round(change_pct, 2), direction


# ── Pydantic models ──────────────────────────────────────────────────────────

class CompanyResponse(BaseModel):
    id: int
    name: str
    base_currency: str
    company_type: str
    trading_volume_monthly: float
    class Config:
        from_attributes = True

class ExposureResponse(BaseModel):
    id: int
    company_id: int
    from_currency: str
    to_currency: str
    amount: float
    initial_rate: Optional[float]
    current_rate: float
    rate_change_pct: Optional[float]
    rate_change_direction: Optional[str]
    current_value_usd: float
    settlement_period: int
    risk_level: str
    description: str
    updated_at: datetime
    class Config:
        from_attributes = True


# ── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {
        "service": "BIRK FX Risk Management API",
        "version": "2.0.0",
        "status": "running"
    }


@app.get("/companies", response_model=List[CompanyResponse])
def get_companies(
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Admins see all companies.
    Viewers see only their own company.
    """
    if payload.get("role") == "admin":
        return db.query(Company).all()
    else:
        company_id = payload.get("company_id")
        if not company_id:
            raise HTTPException(status_code=403, detail="No company assigned")
        return db.query(Company).filter(Company.id == company_id).all()


@app.get("/companies/{company_id}/exposures", response_model=List[ExposureResponse])
def get_company_exposures(
    company_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    safe_id = resolve_company_id(company_id, payload)
    exposures = db.query(Exposure).filter(Exposure.company_id == safe_id).all()
    if not exposures:
        raise HTTPException(status_code=404, detail="No exposures found for this company")

    result = []
    for exp in exposures:
        rate_change_pct, direction = calculate_rate_change(exp.initial_rate, exp.current_rate)
        result.append({
            "id": exp.id,
            "company_id": exp.company_id,
            "from_currency": exp.from_currency,
            "to_currency": exp.to_currency,
            "amount": exp.amount,
            "initial_rate": exp.initial_rate,
            "current_rate": exp.current_rate,
            "rate_change_pct": rate_change_pct,
            "rate_change_direction": direction,
            "current_value_usd": exp.current_value_usd,
            "settlement_period": exp.settlement_period,
            "risk_level": exp.risk_level.value if exp.risk_level else "Unknown",
            "description": exp.description,
            "updated_at": exp.updated_at
        })
    return result


@app.get("/api/fx-rates")
async def api_get_fx_rates(
    pairs: str,
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    pair_list = [p.strip() for p in pairs.split(",") if p.strip()]
    rates_map = await get_current_rates(pair_list)
    response = []
    for pair in pair_list:
        info = rates_map.get(pair)
        response.append({
            "currency_pair": pair,
            "rate": info["rate"] if info else None,
            "timestamp": info["timestamp"] if info else None,
            "source": info["source"] if info else None
        })
    return {"rates": response, "timestamp": datetime.utcnow()}


@app.get("/api/fx-rates/history")
def api_get_fx_history(
    currency_pair: str,
    days: int = 30,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    since = datetime.utcnow() - timedelta(days=days)
    rows = db.query(FXRate).filter(
        FXRate.currency_pair == currency_pair,
        FXRate.timestamp >= since
    ).order_by(FXRate.timestamp.desc()).all()

    return {
        "currency_pair": currency_pair,
        "history": [{"currency_pair": r.currency_pair, "rate": r.rate, "timestamp": r.timestamp, "source": r.source} for r in rows]
    }


@app.get("/exposures")
async def get_exposures(
    company_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """Main dashboard exposures endpoint. Viewers restricted to own company."""
    from sqlalchemy import text as _text
    safe_id = resolve_company_id(company_id, payload)
    exposures = db.query(Exposure).filter(Exposure.company_id == safe_id).filter(
        _text("(is_active IS NULL OR is_active = true)")
    ).all()

    pairs = list(dict.fromkeys([f"{e.from_currency}/{e.to_currency}" for e in exposures]))
    rates_map = await get_current_rates(pairs)

    enriched = []
    for exp in exposures:
        pair = f"{exp.from_currency}/{exp.to_currency}"
        rate_info = rates_map.get(pair)
        current_rate = rate_info["rate"] if rate_info and rate_info.get("rate") else get_mock_current_rate(exp.from_currency, exp.to_currency)
        pnl_data = calculate_pnl_and_status(exp, current_rate)

        enriched.append({
            "id": exp.id,
            "company_id": exp.company_id,
            "from_currency": exp.from_currency,
            "to_currency": exp.to_currency,
            "amount": exp.amount,
            "instrument_type": getattr(exp, 'instrument_type', 'Spot'),
            "exposure_type": exp.exposure_type if hasattr(exp, 'exposure_type') else "payable",
            "start_date": exp.start_date.isoformat() if hasattr(exp, 'start_date') and exp.start_date else None,
            "end_date": exp.end_date.isoformat() if hasattr(exp, 'end_date') and exp.end_date else None,
            "reference": exp.reference if hasattr(exp, 'reference') else None,
            "description": exp.description,
            "budget_rate": exp.budget_rate if hasattr(exp, 'budget_rate') else None,
            "max_loss_limit": exp.max_loss_limit if hasattr(exp, 'max_loss_limit') else None,
            "target_profit": exp.target_profit if hasattr(exp, 'target_profit') else None,
            "hedge_ratio_policy": exp.hedge_ratio_policy if hasattr(exp, 'hedge_ratio_policy') else 1.0,
            "amount_currency": exp.amount_currency if hasattr(exp, 'amount_currency') else getattr(exp, 'from_currency', None),
            "current_rate": current_rate,
            "current_pnl": pnl_data["current_pnl"],
            "hedged_amount": pnl_data["hedged_amount"],
            "unhedged_amount": pnl_data["unhedged_amount"],
            "pnl_status": pnl_data["pnl_status"]
        })

    return enriched


@app.put("/api/exposure-data/exposures/{exposure_id}")
async def update_exposure(
    exposure_id: int,
    payload_body: dict,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    from sqlalchemy import text as _text

    # Auto-add new columns if not present
    for sql in [
        "ALTER TABLE exposures ADD COLUMN IF NOT EXISTS start_date DATE",
        "ALTER TABLE exposures ADD COLUMN IF NOT EXISTS due_date DATE",
        "ALTER TABLE exposures ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'Buy'",
    ]:
        try:
            db.execute(_text(sql))
        except Exception:
            db.rollback()
    db.commit()

    # Verify ownership
    row = db.execute(_text("SELECT * FROM exposures WHERE id = :id"), {"id": exposure_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Exposure not found")
    safe_id = resolve_company_id(row._mapping["company_id"], payload)

    db.execute(_text("""
        UPDATE exposures SET
            reference        = :reference,
            amount           = :amount,
            description      = :description,
            budget_rate      = :budget_rate,
            instrument_type  = :instrument_type,
            direction        = :direction,
            start_date       = :start_date,
            due_date         = :due_date,
            amount_currency  = :amount_currency
        WHERE id = :id AND company_id = :company_id
    """), {
        "reference":        payload_body.get("reference"),
        "amount":           payload_body.get("amount"),
        "description":      payload_body.get("description"),
        "budget_rate":      payload_body.get("budget_rate"),
        "instrument_type":  payload_body.get("instrument_type", "Spot"),
        "direction":        payload_body.get("direction", "Buy"),
        "start_date":       payload_body.get("start_date") or None,
        "due_date":         payload_body.get("due_date") or None,
        "amount_currency":  payload_body.get("amount_currency") or None,
        "id":               exposure_id,
        "company_id":       safe_id
    })
    db.commit()

    logger.info(f"Exposure {exposure_id} updated by {payload.get('email')}")
    return {"message": "Exposure updated", "exposure_id": exposure_id}


@app.delete("/api/exposure-data/exposures/{exposure_id}")
def delete_exposure_alias(
    exposure_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    return delete_exposure(exposure_id, db, payload)


@app.get("/api/policies/{policy_id}")
def get_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    from sqlalchemy import text
    result = db.execute(text("SELECT * FROM hedging_policies WHERE id = :id"), {"id": policy_id}).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="Policy not found")
    r = result._mapping

    # Viewers can only access policies belonging to their company
    safe_id = resolve_company_id(r["company_id"], payload)
    if r["company_id"] != safe_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "id": r["id"], "company_id": r["company_id"], "policy_name": r["policy_name"],
        "policy_type": r["policy_type"], "hedge_ratio_over_5m": r["hedge_ratio_over_5m"],
        "hedge_ratio_1m_to_5m": r["hedge_ratio_1m_to_5m"], "hedge_ratio_under_1m": r["hedge_ratio_under_1m"],
        "is_active": r["is_active"]
    }


@app.get("/api/policies")
def get_all_policies(
    company_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    from sqlalchemy import text
    safe_id = resolve_company_id(company_id, payload)
    results = db.execute(text("SELECT * FROM hedging_policies WHERE company_id = :cid"), {"cid": safe_id}).fetchall()
    return {
        "policies": [{
            "id": r._mapping["id"], "policy_name": r._mapping["policy_name"],
            "policy_type": r._mapping["policy_type"], "hedge_ratio_over_5m": r._mapping["hedge_ratio_over_5m"],
            "hedge_ratio_1m_to_5m": r._mapping["hedge_ratio_1m_to_5m"], "hedge_ratio_under_1m": r._mapping["hedge_ratio_under_1m"],
            "is_active": r._mapping["is_active"]
        } for r in results]
    }


@app.post("/api/policies/{policy_id}/activate")
def activate_policy(
    policy_id: int,
    company_id: int = 1,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    from sqlalchemy import text
    safe_id = resolve_company_id(company_id, payload)
    db.execute(text("UPDATE hedging_policies SET is_active = false WHERE company_id = :cid"), {"cid": safe_id})
    db.execute(text("UPDATE hedging_policies SET is_active = true WHERE id = :id AND company_id = :cid"), {"id": policy_id, "cid": safe_id})
    db.commit()
    return {"message": "Policy activated", "policy_id": policy_id}


@app.get("/api/recommendations")
def get_recommendations(
    company_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    from sqlalchemy import text
    safe_id = resolve_company_id(company_id, payload)

    policy_row = db.execute(
        text("SELECT * FROM hedging_policies WHERE company_id = :cid AND is_active = true"),
        {"cid": safe_id}
    ).fetchone()

    if not policy_row:
        return {"recommendations": [], "error": "No active policy"}

    p = policy_row._mapping
    exposures = db.execute(text("""
        SELECT e.*,
            COALESCE(SUM(CASE WHEN ht.status IN ('executed','confirmed') THEN ht.amount ELSE 0 END), 0) as actual_hedged
        FROM exposures e
        LEFT JOIN hedge_tranches ht ON ht.exposure_id = e.id
        WHERE e.company_id = :cid AND (e.is_active IS NULL OR e.is_active = true)
        GROUP BY e.id
    """), {"cid": safe_id}).fetchall()

    recommendations = []
    for exp_row in exposures:
        exp = exp_row._mapping
        amount = float(exp["amount"] or 0)
        actual_hedged = float(exp["actual_hedged"] or 0)
        unhedged = max(amount - actual_hedged, 0)
        if unhedged <= 0:
            continue

        # Flat (size-band) base ratio from active policy
        if amount >= 5000000:
            base_ratio = float(p["hedge_ratio_over_5m"])
        elif amount >= 1000000:
            base_ratio = float(p["hedge_ratio_1m_to_5m"])
        else:
            base_ratio = float(p["hedge_ratio_under_1m"])

        # Zone-aware ratio — uses stored current_rate as proxy for live rate
        direction  = exp.get("exposure_type") or exp.get("direction") or "payable"
        spot       = float(exp.get("current_rate") or 0)
        budget     = float(exp.get("budget_rate") or 0)
        adv_trig   = float(p.get("adverse_trigger_pct") or 3.0)
        fav_trig   = float(p.get("favourable_trigger_pct") or 3.0)
        zone       = calculate_zone(spot, budget, adv_trig, fav_trig, direction)
        target_ratio = zone_target_ratio(zone, dict(p), base_ratio)

        recommended_amount = max((amount * target_ratio) - actual_hedged, 0)
        if recommended_amount <= 0:
            continue
        if recommended_amount > 100000:
            recommendations.append({
                "exposure_id":        exp["id"],
                "currency_pair":      f"{exp['from_currency']}/{exp['to_currency']}",
                "action":             f"Hedge {exp['from_currency']} {int(recommended_amount):,}",
                "target_ratio":       f"{int(target_ratio * 100)}%",
                "recommended_amount": int(recommended_amount),
                "total_exposure":     int(amount),
                "instrument":         exp.get("instrument_type") or "Forward",
                "urgency":            "HIGH" if unhedged > amount * 0.5 else "MEDIUM",
                "reason":             (
                    f"Zone: {zone.upper()} — target {int(target_ratio * 100)}% hedge. "
                    f"Recommended: {exp['from_currency']} {int(recommended_amount):,} "
                    f"of {int(amount):,} total exposure."
                ),
                "exposure_type":      exp.get("exposure_type") or "payable",
                "end_date":           exp["end_date"].isoformat() if exp.get("end_date") else None,
                "current_zone":       zone,
                "zone_target_ratio":  target_ratio,
                "base_ratio":         base_ratio,
            })

    return {"company_id": safe_id, "policy": p["policy_name"], "recommendations": recommendations}


# ── Zone calculation ──────────────────────────────────────────────────────────

def calculate_zone(spot_rate: float, budget_rate: float,
                   adverse_trigger: float, favourable_trigger: float,
                   direction: str = 'payable') -> str:
    """
    Determine hedging zone based on how far spot has moved vs budget rate.

    For payable (BUY) exposures: adverse means spot went UP (costs more).
    For receivable (SELL) exposures: adverse means spot went DOWN (receive less).

    Returns: 'defensive' | 'base' | 'opportunistic'
    Soft-fails to 'base' if inputs are invalid.
    """
    try:
        if not budget_rate or not spot_rate or budget_rate == 0:
            return 'base'
        pct_move = (spot_rate - budget_rate) / budget_rate * 100
        # Payable (BUY): flip sign so positive move = adverse
        # Receivable (SELL): use raw pct_move — negative move = adverse
        signed = -pct_move if direction == 'payable' else pct_move
        if signed > (adverse_trigger or 3.0):
            return 'defensive'
        if signed < -(favourable_trigger or 3.0):
            return 'opportunistic'
        return 'base'
    except Exception as e:
        logger.warning(f"calculate_zone failed: {e}")
        return 'base'


def zone_target_ratio(zone: str, policy: dict, base_ratio: float) -> float:
    """Return the hedge target ratio for the given zone."""
    if zone == 'defensive':
        return float(policy.get("defensive_ratio") or 0.75)
    if zone == 'opportunistic':
        return float(policy.get("opportunistic_ratio") or 0.25)
    return base_ratio


# ── Zone manual-override endpoint ─────────────────────────────────────────────

@app.post("/api/zones/manual-override")
async def zone_manual_override(
    body: dict,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Manually override the zone for a currency pair.
    Logs to zone_change_log and sends email if zone_notify_email is true.
    """
    from sqlalchemy import text as _text
    company_id   = body.get("company_id")
    currency_pair = body.get("currency_pair")
    new_zone     = body.get("new_zone")
    reason       = body.get("reason", "Manual override")
    changed_by   = body.get("changed_by") or payload.get("email", "unknown")

    if not company_id or not currency_pair or not new_zone:
        raise HTTPException(status_code=400, detail="company_id, currency_pair, and new_zone are required")
    if new_zone not in ("defensive", "base", "opportunistic"):
        raise HTTPException(status_code=400, detail="new_zone must be defensive, base, or opportunistic")

    safe_id = resolve_company_id(company_id, payload)

    # Fetch active policy for notification preferences
    policy = db.execute(
        _text("SELECT * FROM hedging_policies WHERE company_id = :cid AND is_active = true"),
        {"cid": safe_id}
    ).fetchone()

    # Log the zone change
    db.execute(_text("""
        INSERT INTO zone_change_log
            (company_id, currency_pair, previous_zone, new_zone,
             trigger_type, changed_by, reason, created_at)
        VALUES (:cid, :pair, 'unknown', :new_zone, 'manual', :changed_by, :reason, NOW())
    """), {
        "cid":       safe_id,
        "pair":      currency_pair,
        "new_zone":  new_zone,
        "changed_by": changed_by,
        "reason":    reason,
    })
    db.commit()

    # Send notification email if configured
    if policy and policy._mapping.get("zone_notify_email"):
        try:
            company = db.execute(
                _text("SELECT alert_email, name FROM companies WHERE id = :cid"), {"cid": safe_id}
            ).fetchone()
            alert_email = company._mapping.get("alert_email") if company else None
            resend_api_key = os.getenv("RESEND_API_KEY")
            frontend_url   = os.getenv("FRONTEND_URL", "https://birk-dashboard.onrender.com")
            if alert_email and resend_api_key:
                import httpx as _httpx
                zone_label = {"defensive": "Defensive 🔴", "base": "Base 🔵", "opportunistic": "Opportunistic 🟢"}.get(new_zone, new_zone)
                await _httpx.AsyncClient().post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {resend_api_key}", "Content-Type": "application/json"},
                    json={
                        "from": "Sumnohow <alerts@sumnohow.com>",
                        "to": [alert_email],
                        "subject": f"Zone Override — {currency_pair} shifted to {zone_label}",
                        "html": (
                            f"<p>The hedging zone for <strong>{currency_pair}</strong> has been manually set to "
                            f"<strong>{zone_label}</strong> by {changed_by}.</p>"
                            f"<p>Reason: {reason}</p>"
                            f"<p><a href='{frontend_url}'>Review in Sumnohow →</a></p>"
                        )
                    },
                    timeout=10
                )
        except Exception as e:
            logger.warning(f"Zone override email failed: {e}")

    logger.info(f"Zone override: {currency_pair} → {new_zone} by {changed_by}")
    return {
        "success":      True,
        "currency_pair": currency_pair,
        "new_zone":     new_zone,
        "message":      f"{currency_pair} zone set to {new_zone}"
    }


@app.get("/api/debug/breaches")
def debug_breaches(
    company_id: int = 1,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    from sqlalchemy import text
    safe_id = resolve_company_id(company_id, payload)
    rows = db.execute(text("""
        SELECT from_currency, to_currency, current_pnl, max_loss_limit
        FROM exposures WHERE company_id = :cid AND max_loss_limit IS NOT NULL AND current_pnl IS NOT NULL
    """), {"cid": safe_id}).fetchall()
    return [{"pair": r[0]+"/"+r[1], "pnl": r[2], "limit": r[3], "is_breach": r[2] < r[3]} for r in rows]


@app.get("/api/alerts/send-daily")
async def send_daily_alerts(
    secret: str = "",
    db: Session = Depends(get_db)
):
    """
    Daily digest endpoint — called by cron-job.org at 7am UTC.
    Protected by CRON_SECRET env variable instead of JWT (cron can't log in).
    Sends each company their own digest to their configured alert email.
    """
    from sqlalchemy import text

    # Verify cron secret
    expected_secret = os.getenv("CRON_SECRET", "")
    if not expected_secret or secret != expected_secret:
        raise HTTPException(status_code=401, detail="Invalid cron secret")

    resend_api_key = os.getenv("RESEND_API_KEY")
    frontend_url = os.getenv("FRONTEND_URL", "https://birk-dashboard.onrender.com")

    # Get all companies with an alert email configured
    companies = db.execute(text("""
        SELECT id, name, alert_email
        FROM companies
        WHERE alert_email IS NOT NULL AND alert_email != ''
    """)).fetchall()

    if not companies:
        return {"message": "No companies with alert emails configured", "sent": 0}

    sent_count = 0
    results = []

    for company_row in companies:
        c = company_row._mapping
        company_id = c["id"]
        company_name = c["name"]
        alert_email = c["alert_email"]

        # Get exposures with P&L data
        exposures = db.execute(text("""
            SELECT from_currency, to_currency, amount, budget_rate,
                   hedge_ratio_policy, description
            FROM exposures
            WHERE company_id = :cid
            AND (is_active IS NULL OR is_active = true)
            AND budget_rate IS NOT NULL
        """), {"cid": company_id}).fetchall()

        if not exposures:
            continue

        # Fetch LIVE rates for all pairs in this company
        pairs = list(dict.fromkeys([
            f"{r._mapping['from_currency']}/{r._mapping['to_currency']}"
            for r in exposures
        ]))
        live_rates = await get_current_rates(pairs)

        # Calculate P&L for each exposure using live rates
        breaches, warnings, healthy = [], [], []
        total_pnl = 0

        for row in exposures:
            r = row._mapping
            pair = f"{r['from_currency']}/{r['to_currency']}"
            rate_info = live_rates.get(pair)
            current_rate = rate_info["rate"] if rate_info and rate_info.get("rate") else float(r.get("current_rate", 0))
            pnl = (current_rate - float(r["budget_rate"])) * float(r["amount"])
            total_pnl += pnl
            pair = f"{r['from_currency']}/{r['to_currency']}"
            entry = {
                "pair": pair,
                "pnl": pnl,
                "amount": float(r["amount"]),
                "current_rate": current_rate,
                "budget_rate": float(r["budget_rate"]),
                "description": r["description"] or ""
            }
            if pnl < -50000:
                breaches.append(entry)
            elif pnl < -10000:
                warnings.append(entry)
            else:
                healthy.append(entry)

        # Format P&L
        def fmt_pnl(n):
            sign = "+" if n >= 0 else ""
            return f"{sign}{int(n):,}"

        def pnl_color(n):
            return "#27AE60" if n >= 0 else "#E74C3C"

        def exposure_row(e, bg):
            return f"""
            <tr style="background:{bg};">
              <td style="padding:10px 12px;font-weight:600;color:#1A2744;">{e['pair']}</td>
              <td style="padding:10px 12px;color:#555;">{e['description'][:40] if e['description'] else '—'}</td>
              <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#1A2744;">
                {e['pair'].split('/')[0]} {int(e['amount']):,}
              </td>
              <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#555;">
                {e['budget_rate']:.4f}
              </td>
              <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#555;">
                {e['current_rate']:.4f}
              </td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;color:{pnl_color(e['pnl'])};">
                {fmt_pnl(e['pnl'])}
              </td>
            </tr>"""

        # Build exposure table rows
        breach_rows = "".join(exposure_row(e, "#FEF2F2") for e in breaches)
        warning_rows = "".join(exposure_row(e, "#FFFBEB") for e in warnings)
        healthy_rows = "".join(exposure_row(e, "#F9FAFB") for e in healthy)

        # Summary status
        status_color = "#E74C3C" if breaches else "#F59E0B" if warnings else "#27AE60"
        status_text = f"{len(breaches)} breach{'es' if len(breaches) != 1 else ''} require action" if breaches \
            else f"{len(warnings)} warning{'s' if len(warnings) != 1 else ''} to monitor" if warnings \
            else "All exposures within policy"

        subject = f"{'⚠️ Action Required' if breaches else '📊 Daily FX Digest'} — {company_name}"

        html = f"""
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:32px;">

          <div style="background:#1A2744;padding:24px;border-radius:12px;text-align:center;margin-bottom:24px;">
            <h1 style="color:#C9A86C;margin:0;font-size:20px;letter-spacing:4px;font-weight:800;">SUMNOHOW</h1>
            <p style="color:#8DA4C4;font-size:11px;margin:4px 0 0;font-style:italic;">
              Know your FX position. Before it costs you.
            </p>
          </div>

          <h2 style="color:#1A2744;margin-bottom:4px;">Daily FX Digest</h2>
          <p style="color:#888;font-size:13px;margin-bottom:20px;">
            {company_name} · {datetime.utcnow().strftime('%A %d %B %Y')}
          </p>

          <div style="background:#F4F6FA;border-radius:10px;padding:16px 20px;margin-bottom:24px;
                      display:flex;justify-content:space-between;align-items:center;">
            <div>
              <p style="margin:0;font-size:13px;color:#888;">Total Portfolio P&L</p>
              <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:{pnl_color(total_pnl)};">
                {fmt_pnl(total_pnl)}
              </p>
            </div>
            <div style="text-align:right;">
              <p style="margin:0;font-size:13px;color:#888;">Status</p>
              <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:{status_color};">
                {status_text}
              </p>
            </div>
          </div>

          {'<p style="font-size:13px;font-weight:700;color:#E74C3C;margin-bottom:8px;">⚠️ Breaches</p>' if breaches else ''}
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
            <thead>
              <tr style="background:#1A2744;">
                <th style="padding:10px 12px;text-align:left;color:#C9A86C;font-weight:600;">Pair</th>
                <th style="padding:10px 12px;text-align:left;color:#C9A86C;font-weight:600;">Description</th>
                <th style="padding:10px 12px;text-align:right;color:#C9A86C;font-weight:600;">Amount</th>
                <th style="padding:10px 12px;text-align:right;color:#C9A86C;font-weight:600;">Budget</th>
                <th style="padding:10px 12px;text-align:right;color:#C9A86C;font-weight:600;">Current</th>
                <th style="padding:10px 12px;text-align:right;color:#C9A86C;font-weight:600;">P&L</th>
              </tr>
            </thead>
            <tbody>
              {breach_rows}
              {warning_rows}
              {healthy_rows}
            </tbody>
          </table>

          <div style="text-align:center;margin-bottom:24px;">
            <a href="{frontend_url}"
               style="background:#1A2744;color:white;padding:12px 32px;border-radius:8px;
                      text-decoration:none;font-weight:700;font-size:13px;display:inline-block;">
              View Full Dashboard →
            </a>
          </div>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
          <p style="color:#bbb;font-size:11px;text-align:center;margin:0;">
            Sumnohow FX Risk Management · Stavanger, Norway<br>
            To change your alert preferences, visit Settings in your dashboard.
          </p>
        </div>
        """

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {resend_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "from": "Sumnohow <alerts@updates.sumnohow.com>",
                        "to": [alert_email],
                        "subject": subject,
                        "html": html
                    }
                )
            if resp.status_code == 200:
                sent_count += 1
                results.append({"company": company_name, "email": alert_email, "breaches": len(breaches), "status": "sent"})
            else:
                results.append({"company": company_name, "email": alert_email, "status": "failed", "error": resp.text})
        except Exception as e:
            results.append({"company": company_name, "email": alert_email, "status": "error", "error": str(e)})

    logger.info(f"Daily digest: {sent_count} emails sent")
    return {"message": f"Daily digest sent to {sent_count} companies", "sent": sent_count, "results": results}


@app.get("/setup/create-policies")
def create_policies(db: Session = Depends(get_db)):
    """Setup endpoint — admin only in production, no auth for initial setup."""
    from sqlalchemy import text
    existing = db.execute(text("SELECT COUNT(*) FROM hedging_policies WHERE company_id = 1")).scalar()
    if existing >= 3:
        return {"message": "Policies already exist", "count": existing}

    db.execute(text("DELETE FROM hedging_policies WHERE company_id = 1"))
    policies = [
        {"company_id": 1, "policy_name": "Conservative", "policy_type": "CONSERVATIVE",
         "hedge_ratio_over_5m": 0.85, "hedge_ratio_1m_to_5m": 0.70, "hedge_ratio_under_1m": 0.50,
         "material_exposure_threshold": 1000000, "de_minimis_threshold": 500000,
         "budget_breach_threshold_pct": 0.05, "opportunistic_trigger_threshold": 0.05,
         "trailing_stop_trigger": 0.03, "is_active": True},
        {"company_id": 1, "policy_name": "Balanced", "policy_type": "BALANCED",
         "hedge_ratio_over_5m": 0.65, "hedge_ratio_1m_to_5m": 0.50, "hedge_ratio_under_1m": 0.30,
         "material_exposure_threshold": 1000000, "de_minimis_threshold": 500000,
         "budget_breach_threshold_pct": 0.08, "opportunistic_trigger_threshold": 0.08,
         "trailing_stop_trigger": 0.05, "is_active": False},
        {"company_id": 1, "policy_name": "Opportunistic", "policy_type": "OPPORTUNISTIC",
         "hedge_ratio_over_5m": 0.40, "hedge_ratio_1m_to_5m": 0.25, "hedge_ratio_under_1m": 0.10,
         "material_exposure_threshold": 1000000, "de_minimis_threshold": 500000,
         "budget_breach_threshold_pct": 0.12, "opportunistic_trigger_threshold": 0.12,
         "trailing_stop_trigger": 0.08, "is_active": False},
    ]
    for p in policies:
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
    return {"message": "Created 3 policy templates"}


@app.on_event("startup")
async def startup_event():
    db = SessionLocal()
    try:
        company_count = db.query(Company).count()
        if company_count == 0:
            demo_company = Company(
                name="BIRK Commodities A/S",
                base_currency="USD",
                company_type=CompanyType.COMMODITY_TRADER,
                trading_volume_monthly=150_000_000
            )
            db.add(demo_company)
            db.flush()

            exposures_data = [
                {"from": "EUR", "to": "USD", "amount": 8_500_000, "period": 60, "desc": "European wheat procurement"},
                {"from": "CNY", "to": "USD", "amount": 45_000_000, "period": 90, "desc": "Chinese steel imports"},
                {"from": "MXN", "to": "USD", "amount": 85_000_000, "period": 45, "desc": "Mexican corn exports"},
                {"from": "CAD", "to": "USD", "amount": 6_200_000, "period": 30, "desc": "Canadian canola oil"},
                {"from": "BRL", "to": "USD", "amount": 28_000_000, "period": 75, "desc": "Brazilian soybean contracts"},
                {"from": "AUD", "to": "USD", "amount": 4_800_000, "period": 60, "desc": "Australian wool shipments"},
                {"from": "ZAR", "to": "USD", "amount": 95_000_000, "period": 90, "desc": "South African gold hedging"},
                {"from": "INR", "to": "USD", "amount": 320_000_000, "period": 120, "desc": "Indian textile imports"}
            ]
            for exp_data in exposures_data:
                rate = get_live_fx_rate(exp_data["from"], exp_data["to"])
                usd_value = exp_data["amount"] * rate
                risk = calculate_risk_level(usd_value, exp_data["period"])
                exposure = Exposure(
                    company_id=demo_company.id, from_currency=exp_data["from"], to_currency=exp_data["to"],
                    amount=exp_data["amount"], initial_rate=rate, current_rate=rate,
                    current_value_usd=usd_value, settlement_period=exp_data["period"],
                    risk_level=risk, description=exp_data["desc"]
                )
                db.add(exposure)
            db.commit()
            print("✅ Database seeded successfully!")
        else:
            print(f"ℹ️ Database already contains {company_count} companies")
            first_company = db.query(Company).first()
            if first_company and first_company.name != "BIRK Commodities A/S":
                first_company.name = "BIRK Commodities A/S"
                first_company.updated_at = datetime.utcnow()
                db.commit()

    except Exception as e:
        print(f"✗ Error during startup: {e}")
        db.rollback()

    # Auto-migrate new columns
    try:
        from sqlalchemy import text as _text
        migrations = [
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255)",
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_contact_name VARCHAR(255)",
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_email VARCHAR(255)",
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS alert_email VARCHAR(255)",
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS daily_digest BOOLEAN DEFAULT TRUE",
            "ALTER TABLE exposures ADD COLUMN IF NOT EXISTS hedge_override BOOLEAN DEFAULT FALSE",
            "ALTER TABLE exposures ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
            """CREATE TABLE IF NOT EXISTS policy_audit_log (
                id SERIAL PRIMARY KEY, company_id INTEGER REFERENCES companies(id),
                policy_id INTEGER NOT NULL, policy_name VARCHAR(100) NOT NULL,
                changed_by VARCHAR(255) DEFAULT 'admin', exposures_updated INTEGER DEFAULT 0,
                exposures_skipped INTEGER DEFAULT 0, timestamp TIMESTAMP DEFAULT NOW(), notes TEXT
            )""",
            """CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL, company_id INTEGER REFERENCES companies(id),
                role VARCHAR(50) DEFAULT 'viewer', created_at TIMESTAMP DEFAULT NOW()
            )""",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP",
            "ALTER TABLE exposures ADD COLUMN IF NOT EXISTS amount_currency VARCHAR(3)",
            # Backfill: exposures without amount_currency default to from_currency (base currency)
            "UPDATE exposures SET amount_currency = from_currency WHERE amount_currency IS NULL",

            # ── Dynamic Hedging Policy Zones ──────────────────────────────────
            # Extend hedging_policies with zone ratios and trigger thresholds
            "ALTER TABLE hedging_policies ADD COLUMN IF NOT EXISTS defensive_ratio FLOAT DEFAULT 0.75",
            "ALTER TABLE hedging_policies ADD COLUMN IF NOT EXISTS opportunistic_ratio FLOAT DEFAULT 0.25",
            "ALTER TABLE hedging_policies ADD COLUMN IF NOT EXISTS adverse_trigger_pct FLOAT DEFAULT 3.0",
            "ALTER TABLE hedging_policies ADD COLUMN IF NOT EXISTS favourable_trigger_pct FLOAT DEFAULT 3.0",
            "ALTER TABLE hedging_policies ADD COLUMN IF NOT EXISTS zone_auto_apply BOOLEAN DEFAULT FALSE",
            "ALTER TABLE hedging_policies ADD COLUMN IF NOT EXISTS zone_notify_email BOOLEAN DEFAULT TRUE",
            "ALTER TABLE hedging_policies ADD COLUMN IF NOT EXISTS zone_notify_inapp BOOLEAN DEFAULT TRUE",

            # Audit log for all zone changes (manual and auto)
            """CREATE TABLE IF NOT EXISTS zone_change_log (
                id               SERIAL PRIMARY KEY,
                company_id       INTEGER REFERENCES companies(id),
                currency_pair    VARCHAR(10),
                previous_zone    VARCHAR(20),
                new_zone         VARCHAR(20),
                trigger_type     VARCHAR(20),
                spot_rate        FLOAT,
                budget_rate      FLOAT,
                pct_move         FLOAT,
                changed_by       VARCHAR(255),
                reason           TEXT,
                created_at       TIMESTAMP DEFAULT NOW()
            )""",
        ]
        for sql in migrations:
            try:
                db.execute(_text(sql))
            except Exception as e:
                print(f"Migration note: {e}")
        db.commit()
        print("Database migrations complete")
    except Exception as e:
        print(f"Migration error: {e}")
        db.rollback()
    finally:
        db.close()


@app.post("/api/audit/value-date-change")
def log_value_date_change(
    payload_body: dict,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Compliance audit log for value date changes.
    Called automatically when user overrides the value date on an execution order.
    """
    from sqlalchemy import text as _text

    # Auto-create table if not exists (runs once)
    db.execute(_text("""
        CREATE TABLE IF NOT EXISTS value_date_audit_log (
            id SERIAL PRIMARY KEY,
            company_id INTEGER REFERENCES companies(id),
            exposure_id INTEGER,
            currency_pair VARCHAR(20),
            original_date DATE,
            new_date DATE,
            reason TEXT NOT NULL,
            changed_by VARCHAR(255),
            changed_at TIMESTAMP DEFAULT NOW()
        )
    """))

    db.execute(_text("""
        INSERT INTO value_date_audit_log
            (company_id, exposure_id, currency_pair, original_date, new_date, reason, changed_by)
        VALUES
            (:company_id, :exposure_id, :currency_pair, :original_date, :new_date, :reason, :changed_by)
    """), {
        "company_id":    payload_body.get("company_id"),
        "exposure_id":   payload_body.get("exposure_id"),
        "currency_pair": payload_body.get("currency_pair"),
        "original_date": payload_body.get("original_date"),
        "new_date":      payload_body.get("new_date"),
        "reason":        payload_body.get("reason"),
        "changed_by":    payload_body.get("changed_by") or payload.get("email")
    })
    db.commit()

    logger.info(
        f"Value date change: {payload_body.get('currency_pair')} "
        f"{payload_body.get('original_date')} → {payload_body.get('new_date')} "
        f"by {payload_body.get('changed_by')} — {payload_body.get('reason')}"
    )

    return {"message": "Audit log recorded"}


@app.post("/api/audit/order-sent")
def log_order_sent(
    payload_body: dict,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """Logs every time an execution email draft is opened."""
    from sqlalchemy import text as _text

    db.execute(_text("""
        CREATE TABLE IF NOT EXISTS order_audit_log (
            id SERIAL PRIMARY KEY,
            company_id INTEGER REFERENCES companies(id),
            exposure_id INTEGER,
            currency_pair VARCHAR(20),
            order_type VARCHAR(20),
            action TEXT,
            value_date DATE,
            instrument VARCHAR(20),
            limit_rate NUMERIC(18,6),
            stop_rate NUMERIC(18,6),
            good_till DATE,
            sent_by VARCHAR(255),
            sent_at TIMESTAMP DEFAULT NOW(),
            executed_at TIMESTAMP,
            confirmed_by VARCHAR(255),
            status VARCHAR(20) DEFAULT 'sent'
        )
    """))

    db.execute(_text("""
        INSERT INTO order_audit_log
            (company_id, exposure_id, currency_pair, order_type, action,
             value_date, instrument, limit_rate, stop_rate, good_till, sent_by, sent_at)
        VALUES
            (:company_id, :exposure_id, :currency_pair, :order_type, :action,
             :value_date, :instrument, :limit_rate, :stop_rate, :good_till, :sent_by, :sent_at)
    """), {
        "company_id":    payload_body.get("company_id"),
        "exposure_id":   payload_body.get("exposure_id"),
        "currency_pair": payload_body.get("currency_pair"),
        "order_type":    payload_body.get("order_type"),
        "action":        payload_body.get("action"),
        "value_date":    payload_body.get("value_date"),
        "instrument":    payload_body.get("instrument"),
        "limit_rate":    payload_body.get("limit_rate"),
        "stop_rate":     payload_body.get("stop_rate"),
        "good_till":     payload_body.get("good_till"),
        "sent_by":       payload_body.get("sent_by") or payload.get("email"),
        "sent_at":       payload_body.get("sent_at")
    })
    db.commit()

    logger.info(
        f"Order sent: {payload_body.get('currency_pair')} "
        f"{payload_body.get('order_type')} by {payload_body.get('sent_by')}"
    )
    return {"message": "Order logged"}


@app.post("/api/audit/mark-executed")
def mark_order_executed(
    payload_body: dict,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Marks the most recent sent order for an exposure as executed.
    Called when user clicks 'Mark as Executed' after bank confirms.
    """
    from sqlalchemy import text as _text

    db.execute(_text("""
        UPDATE order_audit_log
        SET executed_at = :executed_at,
            confirmed_by = :confirmed_by,
            status = 'executed'
        WHERE id = (
            SELECT id FROM order_audit_log
            WHERE exposure_id = :exposure_id
            AND company_id = :company_id
            AND status = 'sent'
            ORDER BY sent_at DESC
            LIMIT 1
        )
    """), {
        "executed_at":  payload_body.get("executed_at"),
        "confirmed_by": payload_body.get("confirmed_by") or payload.get("email"),
        "exposure_id":  payload_body.get("exposure_id"),
        "company_id":   payload_body.get("company_id")
    })
    db.commit()

    logger.info(
        f"Order executed: exposure {payload_body.get('exposure_id')} "
        f"confirmed by {payload_body.get('confirmed_by')}"
    )
    return {"message": "Marked as executed"}


@app.delete("/data/exposures/{exposure_id}")
def delete_exposure(
    exposure_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Soft-delete an exposure. Sets is_active = false rather than destroying the record.
    Audit trail (order logs, value date changes) is preserved for compliance.
    Only admin or the owning company can delete.
    """
    from sqlalchemy import text as _text

    # Auto-add is_active column if not exists
    try:
        db.execute(_text(
            "ALTER TABLE exposures ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE"
        ))
        db.commit()
    except Exception:
        db.rollback()

    # Fetch exposure and verify ownership
    exposure = db.execute(
        _text("SELECT * FROM exposures WHERE id = :id"),
        {"id": exposure_id}
    ).fetchone()

    if not exposure:
        raise HTTPException(status_code=404, detail="Exposure not found")

    safe_company_id = resolve_company_id(exposure._mapping["company_id"], payload)

    # Soft delete
    db.execute(
        _text("UPDATE exposures SET is_active = false WHERE id = :id AND company_id = :cid"),
        {"id": exposure_id, "cid": safe_company_id}
    )
    db.commit()

    logger.info(f"Exposure {exposure_id} soft-deleted by {payload.get('email')}")
    return {"message": "Exposure deleted", "exposure_id": exposure_id}


# ── Audit Trail GET endpoints ──────────────────────────────────────────────

@app.get("/api/audit/orders")
def get_audit_orders(
    company_id: int,
    currency_pair: str = None,
    from_date: str = None,
    to_date: str = None,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """Returns order audit log with optional currency/date filters."""
    from sqlalchemy import text as _text
    safe_id = resolve_company_id(company_id, payload)

    conditions = ["o.company_id = :cid"]
    params = {"cid": safe_id}
    if currency_pair:
        conditions.append("o.currency_pair = :pair")
        params["pair"] = currency_pair
    if from_date:
        conditions.append("o.sent_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        conditions.append("o.sent_at <= :to_date")
        params["to_date"] = to_date

    where = " AND ".join(conditions)
    rows = db.execute(_text(f"""
        SELECT o.*, e.description, e.reference, e.budget_rate,
               e.from_currency, e.to_currency
        FROM order_audit_log o
        LEFT JOIN exposures e ON e.id = o.exposure_id
        WHERE {where}
        ORDER BY o.sent_at DESC
    """), params).fetchall()

    return {"orders": [dict(r._mapping) for r in rows]}


@app.get("/api/audit/value-date-changes")
def get_value_date_changes(
    company_id: int,
    currency_pair: str = None,
    from_date: str = None,
    to_date: str = None,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """Returns value date change audit log."""
    from sqlalchemy import text as _text
    safe_id = resolve_company_id(company_id, payload)

    conditions = ["company_id = :cid"]
    params = {"cid": safe_id}
    if currency_pair:
        conditions.append("currency_pair = :pair")
        params["pair"] = currency_pair
    if from_date:
        conditions.append("changed_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        conditions.append("changed_at <= :to_date")
        params["to_date"] = to_date

    where = " AND ".join(conditions)
    rows = db.execute(_text(f"""
        SELECT * FROM value_date_audit_log
        WHERE {where}
        ORDER BY changed_at DESC
    """), params).fetchall()

    return {"changes": [dict(r._mapping) for r in rows]}


@app.get("/api/audit/hedge-trail")
def get_hedge_trail(
    company_id: int,
    currency_pair: str = None,
    from_date: str = None,
    to_date: str = None,
    include_deleted: bool = True,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Unified audit trail combining:
    - Hedge tranches (all statuses) with exposure context
    - Order audit log entries
    - Value date changes
    Sorted newest first. Supports filtering by pair, date range.
    """
    from sqlalchemy import text as _text
    safe_id = resolve_company_id(company_id, payload)

    # Build date/pair filter fragments
    pair_filter    = "AND e.from_currency || '/' || e.to_currency = :pair" if currency_pair else ""
    from_filter_t  = "AND ht.created_at >= :from_date" if from_date else ""
    to_filter_t    = "AND ht.created_at <= :to_date"   if to_date   else ""
    from_filter_o  = "AND o.sent_at >= :from_date"     if from_date else ""
    to_filter_o    = "AND o.sent_at <= :to_date"       if to_date   else ""
    from_filter_v  = "AND v.changed_at >= :from_date"  if from_date else ""
    to_filter_v    = "AND v.changed_at <= :to_date"    if to_date   else ""
    deleted_filter = "" if include_deleted else "AND (e.is_active IS NULL OR e.is_active = true)"

    params = {"cid": safe_id}
    if currency_pair: params["pair"]      = currency_pair
    if from_date:     params["from_date"] = from_date
    if to_date:       params["to_date"]   = to_date

    # --- Tranches ---
    tranches = db.execute(_text(f"""
        SELECT
            'tranche'                                      AS event_type,
            ht.created_at                                  AS event_at,
            e.from_currency || '/' || e.to_currency        AS currency_pair,
            e.description,
            e.reference,
            e.budget_rate,
            e.is_active,
            ht.id                                          AS tranche_id,
            ht.exposure_id,
            ht.amount,
            ht.rate                                        AS execution_rate,
            ht.instrument,
            ht.value_date,
            ht.status                                      AS tranche_status,
            ht.created_by,
            ht.executed_at,
            ht.executed_by,
            ht.notes,
            NULL::VARCHAR                                  AS order_type,
            NULL::NUMERIC                                  AS limit_rate,
            NULL::NUMERIC                                  AS stop_rate,
            NULL::VARCHAR                                  AS reason,
            COALESCE(e.amount_currency, e.from_currency)   AS amount_currency
        FROM hedge_tranches ht
        JOIN exposures e ON e.id = ht.exposure_id
        WHERE ht.company_id = :cid
          {pair_filter} {from_filter_t} {to_filter_t} {deleted_filter}
    """), params).fetchall()

    # --- Orders ---
    # Pre-compute pair filter for orders table (o.currency_pair is already a full pair string)
    order_pair_filter = "AND o.currency_pair = :pair" if currency_pair else ""
    orders = db.execute(_text(f"""
        SELECT
            'order'                                        AS event_type,
            o.sent_at                                      AS event_at,
            o.currency_pair,
            e.description,
            e.reference,
            e.budget_rate,
            e.is_active,
            NULL::INTEGER                                  AS tranche_id,
            o.exposure_id,
            NULL::NUMERIC                                  AS amount,
            NULL::NUMERIC                                  AS execution_rate,
            o.instrument,
            o.value_date,
            o.status                                       AS tranche_status,
            o.sent_by                                      AS created_by,
            o.executed_at,
            o.confirmed_by                                 AS executed_by,
            o.action                                       AS notes,
            o.order_type,
            o.limit_rate,
            o.stop_rate,
            NULL::VARCHAR                                  AS reason,
            COALESCE(e.amount_currency, e.from_currency)   AS amount_currency
        FROM order_audit_log o
        LEFT JOIN exposures e ON e.id = o.exposure_id
        WHERE o.company_id = :cid
          {order_pair_filter} {from_filter_o} {to_filter_o}
    """), params).fetchall()

    # --- Value date changes ---
    vd_pair = "AND v.currency_pair = :pair" if currency_pair else ""
    vd_changes = db.execute(_text(f"""
        SELECT
            'value_date_change'                            AS event_type,
            v.changed_at                                   AS event_at,
            v.currency_pair,
            NULL::VARCHAR                                  AS description,
            NULL::VARCHAR                                  AS reference,
            NULL::NUMERIC                                  AS budget_rate,
            TRUE                                           AS is_active,
            NULL::INTEGER                                  AS tranche_id,
            v.exposure_id,
            NULL::NUMERIC                                  AS amount,
            NULL::NUMERIC                                  AS execution_rate,
            NULL::VARCHAR                                  AS instrument,
            v.new_date                                     AS value_date,
            NULL::VARCHAR                                  AS tranche_status,
            v.changed_by                                   AS created_by,
            NULL::TIMESTAMP                                AS executed_at,
            NULL::VARCHAR                                  AS executed_by,
            v.reason                                       AS notes,
            NULL::VARCHAR                                  AS order_type,
            NULL::NUMERIC                                  AS limit_rate,
            NULL::NUMERIC                                  AS stop_rate,
            v.original_date || ' → ' || v.new_date        AS reason,
            NULL::VARCHAR                                  AS amount_currency
        FROM value_date_audit_log v
        WHERE v.company_id = :cid
          {vd_pair} {from_filter_v} {to_filter_v}
    """), params).fetchall()

    # Merge and sort newest first
    all_events = [dict(r._mapping) for r in tranches + orders + vd_changes]
    all_events.sort(key=lambda x: str(x.get("event_at") or ""), reverse=True)

    # Serialise dates/decimals
    import decimal, datetime
    def clean(v):
        if isinstance(v, decimal.Decimal): return float(v)
        if isinstance(v, (datetime.date, datetime.datetime)): return str(v)
        return v

    return {"events": [{k: clean(v) for k, v in e.items()} for e in all_events]}


@app.get("/api/audit/hedge-trail/csv")
def get_hedge_trail_csv(
    company_id: int,
    currency_pair: str = None,
    from_date: str = None,
    to_date: str = None,
    include_deleted: bool = True,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """Returns the hedge trail as a downloadable CSV."""
    import csv, io
    from fastapi.responses import StreamingResponse

    data = get_hedge_trail(
        company_id=company_id,
        currency_pair=currency_pair,
        from_date=from_date,
        to_date=to_date,
        include_deleted=include_deleted,
        db=db,
        payload=payload
    )
    events = data["events"]

    output = io.StringIO()
    if events:
        writer = csv.DictWriter(output, fieldnames=events[0].keys())
        writer.writeheader()
        writer.writerows(events)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=hedge-audit-trail.csv"}
    )
