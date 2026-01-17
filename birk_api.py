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
from typing import List, Optional
from functools import lru_cache

# Import models and database utilities
from models import Base, Company, Exposure, CompanyType, RiskLevel
from database import SessionLocal, get_live_fx_rate, calculate_risk_level, engine

# Import Phase 2B FastAPI routers
from routes.hedging_routes_fastapi import router as hedging_router
from routes.data_import_routes_fastapi import router as data_import_router

# Create tables
Base.metadata.create_all(bind=engine)

# FastAPI app
app = FastAPI(title="BIRK FX Risk Management API", version="2.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Phase 2B routers
app.include_router(hedging_router)
app.include_router(data_import_router)

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
def refresh_company_rates(company_id: int, db: Session = Depends(get_db)):
    """Refresh FX rates for all company exposures"""
    exposures = db.query(Exposure).filter(Exposure.company_id == company_id).all()
    
    if not exposures:
        raise HTTPException(status_code=404, detail="No exposures found for this company")
    
    updated_count = 0
    cache_key = datetime.utcnow().strftime("%Y-%m-%d-%H")  # Cache key changes every hour
    
    for exposure in exposures:
        try:
            # Get live rate (with caching)
            new_rate = get_cached_fx_rate(
                exposure.from_currency, 
                exposure.to_currency,
                cache_key
            )
            
            # Update rate and USD value
            exposure.current_rate = new_rate
            exposure.current_value_usd = exposure.amount * new_rate
            
            # Set initial_rate if not set
            if exposure.initial_rate is None:
                exposure.initial_rate = new_rate
            
            # Recalculate risk level
            exposure.risk_level = calculate_risk_level(
                exposure.current_value_usd,
                exposure.settlement_period
            )
            
            exposure.updated_at = datetime.utcnow()
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)