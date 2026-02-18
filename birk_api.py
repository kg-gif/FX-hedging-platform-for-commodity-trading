"""
BIRK FX Risk Management Platform - Enhanced Backend API

Enhancements in this version:
1. Proper rate change percentage calculation using initial_rate
2. Dynamic risk level assessment
3. Improved error handling
4. Rate change indicators (positive/negative)
"""

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

# Import models and database utilities
from models import Base, Company, Exposure, CompanyType, RiskLevel, FXRate
from database import SessionLocal, get_live_fx_rate, calculate_risk_level, engine

# Import Phase 2B FastAPI routers
from routes.hedging_routes_fastapi import router as hedging_router
from routes.data_import_routes_fastapi import router as data_import_router
from routes.monte_carlo_routes_fastapi import router as monte_carlo_router

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)
print("✅ Database ready")


# FastAPI app
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

# ============================================
# HELPER FUNCTIONS FOR P&L CALCULATIONS
# ============================================

def get_mock_current_rate(from_currency, to_currency):
    """
    Mock current FX rates for demonstration.
    In production, replace with real FX API (e.g., exchangerate-api.com)
    """
    mock_rates = {
        "EUR/USD": 1.0722,
        "USD/EUR": 0.9327,
        "GBP/USD": 1.2654,
        "USD/GBP": 0.7903,
        "CNY/USD": 0.1434,
        "USD/CNY": 6.9735,
        "MXN/USD": 0.0587,
        "USD/MXN": 17.0358,
        "JPY/USD": 0.0067,
        "USD/JPY": 149.25,
    }
    
    pair = f"{from_currency}/{to_currency}"
    return mock_rates.get(pair, 1.0)  # Default to 1.0 if pair not found


def calculate_pnl_and_status(exposure, current_rate):
    """
    Calculate P&L and determine breach status for an exposure.
    Returns dict with calculated values.
    """
    if not exposure.budget_rate or not current_rate:
        return {
            "current_pnl": None,
            "hedged_amount": None,
            "unhedged_amount": None,
            "pnl_status": "NO_DATA"
        }
    
    # Calculate P&L: (current_rate - budget_rate) × amount
    pnl = (current_rate - exposure.budget_rate) * exposure.amount
    
    # Calculate hedged/unhedged amounts
    hedge_ratio = exposure.hedge_ratio_policy if exposure.hedge_ratio_policy else 1.0
    hedged_amt = exposure.amount * hedge_ratio
    unhedged_amt = exposure.amount * (1 - hedge_ratio)
    
    # Determine status
    status = "OK"
    
    # Check for breach (loss exceeds limit)
    if exposure.max_loss_limit is not None and pnl < exposure.max_loss_limit:
        status = "BREACH"
    # Check for warning (within 10% of limit)
    elif exposure.max_loss_limit is not None and pnl < (exposure.max_loss_limit * 1.1):
        status = "WARNING"
    # Check if target profit achieved
    elif exposure.target_profit is not None and pnl >= exposure.target_profit:
        status = "TARGET_MET"
    
    return {
        "current_pnl": round(pnl, 2),
        "hedged_amount": round(hedged_amt, 2),
        "unhedged_amount": round(unhedged_amt, 2),
        "pnl_status": status
    }

# Include Phase 2B routers
app.include_router(hedging_router)
app.include_router(data_import_router)
app.include_router(monte_carlo_router)

# Pydantic Models
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
    rate_change_pct: Optional[float]  # Calculated field
    rate_change_direction: Optional[str]  # "up", "down", or "neutral"
    current_value_usd: float
    settlement_period: int
    risk_level: str
    description: str
    updated_at: datetime
    
    class Config:
        from_attributes = True

class RefreshResponse(BaseModel):
    message: str
    updated_count: int
    timestamp: datetime

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# FX Rate Functions
@lru_cache(maxsize=100)
def get_cached_fx_rate(from_currency: str, to_currency: str, cache_key: str):
    """
    Cached FX rate fetching with cache_key based on time
    cache_key format: "YYYY-MM-DD-HH" to cache for 1 hour
    """
    return get_live_fx_rate(from_currency, to_currency)


# --- Live FX fetching via ExchangeRate-API ---
EXCHANGERATE_API_KEY = os.getenv("EXCHANGERATE_API_KEY")
EXCHANGERATE_BASE_URL = os.getenv("EXCHANGERATE_BASE_URL", "https://v6.exchangerate-api.com/v6")

# Setup logging
import logging
logger = logging.getLogger(__name__)

async def fetch_fx_rate(base_currency: str, target_currency: str) -> Optional[float]:
    """Fetch live FX rate from ExchangeRate-API.com"""
    api_key = os.getenv("EXCHANGERATE_API_KEY")
    if not api_key:
        logger.error("EXCHANGERATE_API_KEY not set")
        return None
    
    try:
        # ExchangeRate-API.com format: get rates with base_currency as base
        url = f"https://v6.exchangerate-api.com/v6/{api_key}/latest/{base_currency}"
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                logger.error(f"ExchangeRate-API error: {response.text}")
                return None
            
            data = response.json()
            
            if data.get("result") != "success":
                logger.error(f"ExchangeRate-API returned error: {data}")
                return None
            
            rates = data["conversion_rates"]
            return rates.get(target_currency)
                
    except Exception as e:
        logger.error(f"Error fetching FX rate: {str(e)}")
        return None


async def get_current_rates(currency_pairs: List[str]) -> Dict[str, Dict]:
    """Fetch multiple currency pairs concurrently.

    currency_pairs: list like ["EUR/USD", "GBP/USD"]
    Returns mapping pair -> {rate, timestamp, source}
    """
    tasks = []
    for pair in currency_pairs:
        parts = pair.split("/")
        if len(parts) != 2:
            continue
        base, target = parts[0].strip(), parts[1].strip()
        tasks.append(fetch_fx_rate(base, target))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    out = {}
    idx = 0
    for pair in currency_pairs:
        parts = pair.split("/")
        if len(parts) != 2:
            continue
        res = results[idx]
        idx += 1
        if isinstance(res, Exception) or res is None:
            out[pair] = None
        else:
            from datetime import datetime, timezone
            out[pair] = {
                "rate": res,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": "exchangerate-api.com"
            }

    return out

def calculate_rate_change(initial_rate: Optional[float], current_rate: float) -> tuple[Optional[float], str]:
    """
    Calculate percentage change and direction
    
    Returns: (percentage_change, direction)
    direction: "up", "down", or "neutral"
    """
    if initial_rate is None or initial_rate == 0:
        return None, "neutral"
    
    change_pct = ((current_rate - initial_rate) / initial_rate) * 100
    
    if abs(change_pct) < 0.01:  # Less than 0.01% change
        direction = "neutral"
    elif change_pct > 0:
        direction = "up"
    else:
        direction = "down"
    
    return round(change_pct, 2), direction

# API Endpoints

@app.get("/")
def read_root():
    return {
        "service": "BIRK FX Risk Management API",
        "version": "2.0.0",
        "status": "running",
        "features": [
            "Live FX rates with 1-hour caching",
            "Rate change tracking",
            "Dynamic risk assessment",
            "Multi-company support"
        ]
    }

@app.get("/companies", response_model=List[CompanyResponse])
def get_companies(db: Session = Depends(get_db)):
    """Get all companies"""
    companies = db.query(Company).all()
    return companies

@app.get("/companies/{company_id}/exposures", response_model=List[ExposureResponse])
def get_company_exposures(company_id: int, db: Session = Depends(get_db)):
    """Get all exposures for a company with calculated rate changes"""
    exposures = db.query(Exposure).filter(Exposure.company_id == company_id).all()
    
    if not exposures:
        raise HTTPException(status_code=404, detail="No exposures found for this company")
    
    # Enhance exposures with calculated fields
    result = []
    for exp in exposures:
        rate_change_pct, direction = calculate_rate_change(exp.initial_rate, exp.current_rate)
        
        exp_dict = {
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
        }
        result.append(exp_dict)
    
    return result

@app.post("/companies/{company_id}/refresh-rates", response_model=RefreshResponse)
async def refresh_company_rates(company_id: int, db: Session = Depends(get_db)):
    """Refresh FX rates for all company exposures using live rates and persist them."""
    exposures = db.query(Exposure).filter(Exposure.company_id == company_id).all()

    if not exposures:
        raise HTTPException(status_code=404, detail="No exposures found for this company")

    # Build unique pairs list
    pairs = [f"{e.from_currency}/{e.to_currency}" for e in exposures]
    # Fetch current rates concurrently
    rates_map = await get_current_rates(pairs)

    updated_count = 0
    for exposure in exposures:
        pair = f"{exposure.from_currency}/{exposure.to_currency}"
        rate_info = rates_map.get(pair)
        if not rate_info:
            continue

        try:
            new_rate = rate_info["rate"]
            exposure.current_rate = new_rate
            exposure.current_value_usd = exposure.amount * new_rate

            if exposure.initial_rate is None:
                exposure.initial_rate = new_rate

            exposure.risk_level = calculate_risk_level(
                exposure.current_value_usd,
                exposure.settlement_period
            )

            exposure.updated_at = datetime.utcnow()

            # Persist FXRate record
            fx = FXRate(
                currency_pair=pair,
                rate=new_rate,
                timestamp=rate_info.get("timestamp", datetime.utcnow()),
                source=rate_info.get("source", "ExchangeRate-API")
            )
            db.add(fx)

            updated_count += 1
        except Exception as e:
            print(f"Error updating exposure {exposure.id}: {e}")
            continue

    db.commit()

    return RefreshResponse(
        message=f"Successfully refreshed rates for {updated_count} exposures",
        updated_count=updated_count,
        timestamp=datetime.utcnow()
    )


@app.get("/api/fx-rates")
async def api_get_fx_rates(pairs: str, company_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Fetch live FX rates for comma-separated pairs, persist them, and return results."""
    pair_list = [p.strip() for p in pairs.split(",") if p.strip()]
    rates_map = await get_current_rates(pair_list)

    response = []
    for pair in pair_list:
        info = rates_map.get(pair)
        if not info:
            response.append({"currency_pair": pair, "rate": None, "timestamp": None, "source": None})
            continue

        # Persist
        fx = FXRate(
            currency_pair=pair,
            rate=info["rate"],
            timestamp=info.get("timestamp", datetime.utcnow()),
            source=info.get("source", "ExchangeRate-API")
        )
        db.add(fx)

        response.append({
            "currency_pair": pair,
            "rate": info["rate"],
            "timestamp": info.get("timestamp"),
            "source": info.get("source")
        })

    db.commit()
    return {"rates": response, "timestamp": datetime.utcnow()}


@app.get("/api/fx-rates/history")
def api_get_fx_history(currency_pair: str, days: int = 30, db: Session = Depends(get_db)):
    """Return historical FX rates for a currency pair over the last N days."""
    since = datetime.utcnow() - timedelta(days=days)
    rows = db.query(FXRate).filter(
        FXRate.currency_pair == currency_pair,
        FXRate.timestamp >= since
    ).order_by(FXRate.timestamp.desc()).all()

    result = [
        {"currency_pair": r.currency_pair, "rate": r.rate, "timestamp": r.timestamp, "source": r.source}
        for r in rows
    ]

    return {"currency_pair": currency_pair, "history": result}

@app.get("/exposures")
async def get_exposures(company_id: int, db: Session = Depends(get_db)):
    """Get all exposures for a company with calculated P&L data (uses live FX rates)."""
    exposures = db.query(Exposure).filter(Exposure.company_id == company_id).all()

    # Build pairs and fetch live rates
    pairs = [f"{e.from_currency}/{e.to_currency}" for e in exposures]
    unique_pairs = list(dict.fromkeys(pairs))
    rates_map = await get_current_rates(unique_pairs)

    enriched_exposures = []
    for exp in exposures:
        pair = f"{exp.from_currency}/{exp.to_currency}"
        rate_info = rates_map.get(pair)

        if rate_info and rate_info.get("rate"):
            current_rate = rate_info["rate"]
        else:
            current_rate = get_mock_current_rate(exp.from_currency, exp.to_currency)

        # Calculate P&L and status
        pnl_data = calculate_pnl_and_status(exp, current_rate)

        # Convert exposure to dict and add calculated fields
        exp_dict = {
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
            # Add calculated fields
            "current_rate": current_rate,
            "current_pnl": pnl_data["current_pnl"],
            "hedged_amount": pnl_data["hedged_amount"],
            "unhedged_amount": pnl_data["unhedged_amount"],
            "pnl_status": pnl_data["pnl_status"]
        }

        enriched_exposures.append(exp_dict)

    return enriched_exposures

@app.on_event("startup")
async def startup_event():
    """Initialize database with demo data if empty, or update existing"""
    db = SessionLocal()
    
    try:
        # Check if we have any companies
        company_count = db.query(Company).count()
        
        if company_count == 0:
            # Create new demo company
            demo_company = Company(
                name="BIRK Commodities A/S",
                base_currency="USD",
                company_type=CompanyType.COMMODITY_TRADER,
                trading_volume_monthly=150_000_000
            )
            db.add(demo_company)
            db.flush()
            
            # Create demo exposures
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
                # Get initial rate
                rate = get_live_fx_rate(exp_data["from"], exp_data["to"])
                usd_value = exp_data["amount"] * rate
                risk = calculate_risk_level(usd_value, exp_data["period"])
                
                exposure = Exposure(
                    company_id=demo_company.id,
                    from_currency=exp_data["from"],
                    to_currency=exp_data["to"],
                    amount=exp_data["amount"],
                    initial_rate=rate,
                    current_rate=rate,
                    current_value_usd=usd_value,
                    settlement_period=exp_data["period"],
                    risk_level=risk,
                    description=exp_data["desc"]
                )
                db.add(exposure)
            
            db.commit()
            print("✅ Database seeded successfully!")
        else:
            # UPDATE EXISTING COMPANY NAME
            print(f"ℹ️ Database already contains {company_count} companies")
            
            # Find and update the first company
            first_company = db.query(Company).first()
            if first_company and first_company.name != "BIRK Commodities A/S":
                old_name = first_company.name
                first_company.name = "BIRK Commodities A/S"
                first_company.updated_at = datetime.utcnow()
                db.commit()
                print(f"✅ Updated company name from '{old_name}' to 'BIRK Commodities A/S'")
            else:
                print(f"✅ Company name is already correct: {first_company.name if first_company else 'No company found'}")
            
    except Exception as e:
        print(f"✗ Error during startup: {e}")
        db.rollback()
    finally:
        db.close()

@app.get("/api/policies/{policy_id}")
def get_policy(policy_id: int, db: Session = Depends(get_db)):
    try:
        from sqlalchemy import text
        result = db.execute(text("SELECT * FROM hedging_policies WHERE id = :id"), {"id": policy_id}).fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Policy not found")
        return {
            "id": result[0],
            "company_id": result[1],
            "policy_name": result[2],
            "policy_type": result[3],
            "hedge_ratio_over_5m": result[4],
            "hedge_ratio_1m_to_5m": result[5],
            "hedge_ratio_under_1m": result[6],
            "is_active": result[11]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/setup/create-policies")
def create_policies(db: Session = Depends(get_db)):
    try:
        from sqlalchemy import text
        
        # Check if policies already exist
        existing = db.execute(text("SELECT COUNT(*) FROM hedging_policies WHERE company_id = 1")).scalar()
        if existing >= 3:
            return {"message": "Policies already exist", "count": existing}
        
        # Delete existing policies for company 1
        db.execute(text("DELETE FROM hedging_policies WHERE company_id = 1"))
        
        # Create 3 policy templates
        policies = [
            {
                "company_id": 1,
                "policy_name": "Conservative",
                "policy_type": "CONSERVATIVE",
                "hedge_ratio_over_5m": 0.85,
                "hedge_ratio_1m_to_5m": 0.70,
                "hedge_ratio_under_1m": 0.50,
                "material_exposure_threshold": 1000000,
                "de_minimis_threshold": 500000,
                "budget_breach_threshold_pct": 0.05,
                "opportunistic_trigger_threshold": 0.05,
                "trailing_stop_trigger": 0.03,
                "is_active": True
            },
            {
                "company_id": 1,
                "policy_name": "Balanced",
                "policy_type": "BALANCED",
                "hedge_ratio_over_5m": 0.65,
                "hedge_ratio_1m_to_5m": 0.50,
                "hedge_ratio_under_1m": 0.30,
                "material_exposure_threshold": 1000000,
                "de_minimis_threshold": 500000,
                "budget_breach_threshold_pct": 0.08,
                "opportunistic_trigger_threshold": 0.08,
                "trailing_stop_trigger": 0.05,
                "is_active": False
            },
            {
                "company_id": 1,
                "policy_name": "Opportunistic",
                "policy_type": "OPPORTUNISTIC",
                "hedge_ratio_over_5m": 0.40,
                "hedge_ratio_1m_to_5m": 0.25,
                "hedge_ratio_under_1m": 0.10,
                "material_exposure_threshold": 1000000,
                "de_minimis_threshold": 500000,
                "budget_breach_threshold_pct": 0.12,
                "opportunistic_trigger_threshold": 0.12,
                "trailing_stop_trigger": 0.08,
                "is_active": False
            }
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
        return {"message": "Created 3 policy templates", "policies": ["Conservative (active)", "Balanced", "Opportunistic"]}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))