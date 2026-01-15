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
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Enum, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional
import os
import enum
import requests
from functools import lru_cache

# Import Phase 2B FastAPI routers
from routes.hedging_routes_fastapi import router as hedging_router
from routes.data_import_routes_fastapi import router as data_import_router


# Database setup
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost/birk_db')
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# API Configuration
FX_API_KEY = os.getenv('FX_API_KEY', '8e0eb70d6c0fb96657f30109')
FX_API_BASE = f"https://v6.exchangerate-api.com/v6/{FX_API_KEY}"

# In-memory cache for FX rates (1 hour)
fx_rate_cache = {}
CACHE_DURATION = timedelta(hours=1)

# Enums
class CompanyType(str, enum.Enum):
    COMMODITY_TRADER = "commodity_trader"
    MANUFACTURER = "manufacturer"
    IMPORTER = "importer"
    EXPORTER = "exporter"

class RiskLevel(str, enum.Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

# Database Models
class Company(Base):
    __tablename__ = "companies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    base_currency = Column(String, default="USD")
    company_type = Column(Enum(CompanyType))
    trading_volume_monthly = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Exposure(Base):
    __tablename__ = "exposures"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, index=True)
    from_currency = Column(String)
    to_currency = Column(String)
    amount = Column(Float)
    initial_rate = Column(Float)  # Baseline rate for comparison
    current_rate = Column(Float)
    current_value_usd = Column(Float)
    settlement_period = Column(Integer)  # days
    risk_level = Column(Enum(RiskLevel))
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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

def get_live_fx_rate(from_currency: str, to_currency: str) -> float:
    """Fetch live FX rate from exchangerate-api.com"""
    try:
        url = f"{FX_API_BASE}/pair/{from_currency}/{to_currency}"
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        if data.get('result') == 'success':
            return data['conversion_rate']
        else:
            raise Exception(f"API returned error: {data.get('error-type', 'Unknown')}")
    except Exception as e:
        print(f"Error fetching FX rate for {from_currency}/{to_currency}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch FX rate: {str(e)}")

def calculate_risk_level(usd_value: float, settlement_period: int) -> RiskLevel:
    """
    Calculate risk level based on USD value and settlement period
    
    Risk factors:
    - USD value (higher = more risk)
    - Settlement period (longer = more risk)
    """
    # Base risk on USD value
    if usd_value > 5_000_000:
        base_risk = 3  # High
    elif usd_value > 1_000_000:
        base_risk = 2  # Medium
    else:
        base_risk = 1  # Low
    
    # Adjust for settlement period (>90 days adds risk)
    if settlement_period > 90:
        base_risk = min(3, base_risk + 1)
    
    # Map to RiskLevel enum
    if base_risk >= 3:
        return RiskLevel.HIGH
    elif base_risk == 2:
        return RiskLevel.MEDIUM
    else:
        return RiskLevel.LOW

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
    """Initialize database with demo data if empty"""
    db = SessionLocal()
    
    try:
        # Check if we have any companies
        company_count = db.query(Company).count()
        
        if company_count == 0:
            print("🌱 Seeding database with demo data...")
            
            # Create demo company
            demo_company = Company(
                name="GlobalTrade Commodities Ltd",
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
                    initial_rate=rate,  # Set initial rate on creation
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
            print(f"ℹ️  Database already contains {company_count} companies")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

