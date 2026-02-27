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
    safe_id = resolve_company_id(company_id, payload)
    exposures = db.query(Exposure).filter(Exposure.company_id == safe_id).all()

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
            "current_rate": current_rate,
            "current_pnl": pnl_data["current_pnl"],
            "hedged_amount": pnl_data["hedged_amount"],
            "unhedged_amount": pnl_data["unhedged_amount"],
            "pnl_status": pnl_data["pnl_status"]
        })

    return enriched


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
    exposures = db.execute(text("SELECT * FROM exposures WHERE company_id = :cid"), {"cid": safe_id}).fetchall()

    recommendations = []
    for exp_row in exposures:
        exp = exp_row._mapping
        amount = float(exp["amount"])
        unhedged = float(exp["unhedged_amount"]) if exp["unhedged_amount"] is not None else amount
        if unhedged <= 0:
            continue
        if amount >= 5000000:
            target_ratio = float(p["hedge_ratio_over_5m"])
        elif amount >= 1000000:
            target_ratio = float(p["hedge_ratio_1m_to_5m"])
        else:
            target_ratio = float(p["hedge_ratio_under_1m"])
        recommended_amount = amount * target_ratio - (amount - unhedged)
        if recommended_amount > 100000:
            recommendations.append({
                "exposure_id": exp["id"],
                "currency_pair": f"{exp['from_currency']}/{exp['to_currency']}",
                "action": f"Hedge {exp['from_currency']} {int(recommended_amount):,}",
                "target_ratio": f"{int(target_ratio * 100)}%",
                "instrument": "Forward",
                "urgency": "HIGH" if unhedged > amount * 0.5 else "MEDIUM",
                "reason": f"Policy target: {int(target_ratio * 100)}% hedge"
            })

    return {"company_id": safe_id, "policy": p["policy_name"], "recommendations": recommendations}


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
    company_id: int = 1,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    from sqlalchemy import text
    safe_id = resolve_company_id(company_id, payload)

    all_rows = db.execute(text(
        "SELECT from_currency, to_currency, amount, budget_rate, current_rate FROM exposures WHERE company_id = :cid AND budget_rate IS NOT NULL AND current_rate IS NOT NULL"
    ), {"cid": safe_id}).fetchall()

    breach_list = []
    for row in all_rows:
        r = row._mapping
        pnl = (float(r["current_rate"]) - float(r["budget_rate"])) * float(r["amount"])
        if pnl < -50000:
            breach_list.append(f"{r['from_currency']}/{r['to_currency']} P&L: ${int(pnl)}")

    if not breach_list:
        return {"message": "No alerts to send - all exposures within policy"}

    html_content = "<h2>BIRK FX Daily Alert</h2><ul>" + "".join(f"<li>{item}</li>" for item in breach_list) + "</ul><p><a href='https://birk-dashboard.onrender.com'>View Dashboard</a></p>"

    resend_api_key = os.environ.get("RESEND_API_KEY")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {resend_api_key}", "Content-Type": "application/json"},
            json={"from": "BIRK FX Alerts <alerts@updates.sumnohow.com>", "to": ["kg@sumnohow.com"],
                  "subject": f"BIRK FX Alert - {len(breach_list)} breach(es) detected", "html": html_content}
        )
    if response.status_code == 200:
        return {"message": "Alert sent", "breaches": len(breach_list)}
    raise HTTPException(status_code=500, detail=f"Resend error: {response.text}")


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
            )"""
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
