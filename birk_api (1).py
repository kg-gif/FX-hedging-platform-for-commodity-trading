"""
BIRK - FX Risk Management Platform for Commodity Traders
Modern API with volatility-based risk, Monte Carlo simulations, and payment corridors
"""

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker, relationship
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from enum import Enum
import os
import numpy as np
from scipy import stats
import json

# =============================================================================
# DATABASE SETUP
# =============================================================================

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./birk.db")

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# =============================================================================
# ENUMS
# =============================================================================

class CurrencyCode(str, Enum):
    # G10 Currencies
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"
    JPY = "JPY"
    CHF = "CHF"
    CAD = "CAD"
    AUD = "AUD"
    NZD = "NZD"
    SEK = "SEK"
    NOK = "NOK"
    
    # Major Emerging Markets
    CNY = "CNY"  # Chinese Yuan
    BRL = "BRL"  # Brazilian Real
    MXN = "MXN"  # Mexican Peso
    INR = "INR"  # Indian Rupee
    RUB = "RUB"  # Russian Ruble
    ZAR = "ZAR"  # South African Rand
    TRY = "TRY"  # Turkish Lira
    KRW = "KRW"  # South Korean Won
    SGD = "SGD"  # Singapore Dollar
    HKD = "HKD"  # Hong Kong Dollar
    PLN = "PLN"  # Polish Zloty
    THB = "THB"  # Thai Baht
    MYR = "MYR"  # Malaysian Ringgit
    IDR = "IDR"  # Indonesian Rupiah
    AED = "AED"  # UAE Dirham
    SAR = "SAR"  # Saudi Riyal


class SettlementPeriod(str, Enum):
    SHORT = "7_days"      # 7 days - lowest volatility risk
    MEDIUM = "14_days"    # 14 days - medium volatility risk
    LONG = "21_days"      # 21 days - higher volatility risk
    EXTENDED = "30_days"  # 30+ days - highest volatility risk


class InstrumentType(str, Enum):
    SPOT = "spot"
    FORWARD = "forward"
    SWAP = "swap"
    OPTION = "option"


class AlertType(str, Enum):
    UPWARD_RISK = "upward_risk"
    DOWNWARD_RISK = "downward_risk"
    LIMIT_BREACH = "limit_breach"
    VOLATILITY_SPIKE = "volatility_spike"
    CORRIDOR_RESTRICTED = "corridor_restricted"


# =============================================================================
# DATABASE MODELS
# =============================================================================

class Company(Base):
    """Company/Trader entity - multi-tenant system"""
    __tablename__ = "companies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    base_currency = Column(String, default="USD")
    company_type = Column(String)  # e.g., "commodity_trader", "corporate", "importer"
    trading_volume_monthly = Column(Float)  # in USD
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    users = relationship("User", back_populates="company")
    exposures = relationship("Exposure", back_populates="company")
    corridors = relationship("PaymentCorridor", back_populates="company")


class User(Base):
    """Users belong to companies"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    role = Column(String)  # "cfo", "treasurer", "trader"
    company_id = Column(Integer, ForeignKey("companies.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    company = relationship("Company", back_populates="users")


class Exposure(Base):
    """
    Currency exposure with volatility-based risk calculation
    The longer the settlement period, the higher the risk
    """
    __tablename__ = "exposures"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    
    # Currency pair
    from_currency = Column(String, index=True)
    to_currency = Column(String, index=True)
    settlement_currency = Column(String)  # Actual settlement currency
    amount = Column(Float)
    
    # Settlement period affects volatility risk
    settlement_period = Column(String)  # 7_days, 14_days, 21_days, 30_days
    settlement_date = Column(DateTime)
    
    # Risk thresholds
    upward_risk_threshold = Column(Float, default=40.0)
    downward_risk_threshold = Column(Float, default=80.0)
    
    # Calculated volatility (updated daily)
    volatility_7d = Column(Float)
    volatility_14d = Column(Float)
    volatility_21d = Column(Float)
    current_volatility = Column(Float)  # Based on settlement period
    
    # Risk metrics
    var_95 = Column(Float)  # Value at Risk (95% confidence)
    var_99 = Column(Float)  # Value at Risk (99% confidence)
    expected_shortfall = Column(Float)  # CVaR
    
    # Current state
    instrument_type = Column(String, default="spot")
    current_rate = Column(Float)
    initial_rate = Column(Float)
    current_value_usd = Column(Float)
    is_secured = Column(Boolean, default=False)
    
    # Metadata
    description = Column(Text)  # e.g., "Oil shipment from Saudi Arabia"
    counterparty = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    company = relationship("Company", back_populates="exposures")
    alerts = relationship("Alert", back_populates="exposure")
    simulations = relationship("MonteCarloSimulation", back_populates="exposure")


class PaymentCorridor(Base):
    """
    Payment corridors define limits and rules for currency pairs between countries
    E.g., USD->BRL has different limits than USD->EUR
    """
    __tablename__ = "payment_corridors"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    
    from_currency = Column(String, index=True)
    to_currency = Column(String, index=True)
    from_country = Column(String)  # ISO country code
    to_country = Column(String)
    
    # Limits
    daily_limit = Column(Float)
    monthly_limit = Column(Float)
    per_transaction_limit = Column(Float)
    
    # Current usage
    daily_used = Column(Float, default=0.0)
    monthly_used = Column(Float, default=0.0)
    
    # Corridor characteristics
    average_settlement_days = Column(Integer)
    typical_volatility = Column(Float)
    regulatory_restrictions = Column(Text)  # JSON string
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    company = relationship("Company", back_populates="corridors")


class Alert(Base):
    """Risk alerts triggered by thresholds, volatility, or limits"""
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    exposure_id = Column(Integer, ForeignKey("exposures.id"))
    
    alert_type = Column(String)
    severity = Column(String)  # "low", "medium", "high", "critical"
    message = Column(String)
    details = Column(Text)  # JSON with additional info
    triggered_at = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)
    is_resolved = Column(Boolean, default=False)
    
    exposure = relationship("Exposure", back_populates="alerts")


class ExchangeRate(Base):
    """Historical exchange rates for volatility calculation"""
    __tablename__ = "exchange_rates"
    
    id = Column(Integer, primary_key=True, index=True)
    from_currency = Column(String, index=True)
    to_currency = Column(String, index=True)
    rate = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    source = Column(String)  # "api", "manual", "calculated"


class MonteCarloSimulation(Base):
    """Store Monte Carlo simulation results for exposures"""
    __tablename__ = "monte_carlo_simulations"
    
    id = Column(Integer, primary_key=True, index=True)
    exposure_id = Column(Integer, ForeignKey("exposures.id"))
    
    simulation_date = Column(DateTime, default=datetime.utcnow)
    num_simulations = Column(Integer, default=10000)
    
    # Results
    mean_outcome = Column(Float)
    median_outcome = Column(Float)
    percentile_5 = Column(Float)
    percentile_95 = Column(Float)
    worst_case = Column(Float)
    best_case = Column(Float)
    
    # Risk metrics
    probability_of_loss = Column(Float)
    expected_loss = Column(Float)
    
    # Store full distribution as JSON
    distribution_data = Column(Text)  # JSON array
    
    exposure = relationship("Exposure", back_populates="simulations")


# Create all tables
Base.metadata.create_all(bind=engine)

# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class CompanyCreate(BaseModel):
    name: str
    base_currency: str = "USD"
    company_type: str = "commodity_trader"
    trading_volume_monthly: float


class CompanyResponse(BaseModel):
    id: int
    name: str
    base_currency: str
    company_type: str
    trading_volume_monthly: float
    created_at: datetime
    
    class Config:
        from_attributes = True


class ExposureCreate(BaseModel):
    from_currency: str
    to_currency: str
    settlement_currency: str
    amount: float
    settlement_period: str = "14_days"
    settlement_date: datetime
    upward_risk_threshold: float = 40.0
    downward_risk_threshold: float = 80.0
    instrument_type: str = "spot"
    description: Optional[str] = None
    counterparty: Optional[str] = None


class ExposureResponse(BaseModel):
    id: int
    from_currency: str
    to_currency: str
    settlement_currency: str
    amount: float
    settlement_period: str
    settlement_date: datetime
    volatility_7d: Optional[float]
    volatility_14d: Optional[float]
    volatility_21d: Optional[float]
    current_volatility: Optional[float]
    var_95: Optional[float]
    var_99: Optional[float]
    current_rate: Optional[float]
    current_value_usd: Optional[float]
    is_secured: bool
    description: Optional[str]
    counterparty: Optional[str]
    
    class Config:
        from_attributes = True


class CorridorCreate(BaseModel):
    from_currency: str
    to_currency: str
    from_country: str
    to_country: str
    daily_limit: float
    monthly_limit: float
    per_transaction_limit: float
    average_settlement_days: int = 14


class CorridorResponse(BaseModel):
    id: int
    from_currency: str
    to_currency: str
    from_country: str
    to_country: str
    daily_limit: float
    monthly_limit: float
    per_transaction_limit: float
    daily_used: float
    monthly_used: float
    average_settlement_days: int
    is_active: bool
    
    class Config:
        from_attributes = True


class AlertResponse(BaseModel):
    id: int
    alert_type: str
    severity: str
    message: str
    triggered_at: datetime
    is_read: bool
    
    class Config:
        from_attributes = True


class MonteCarloRequest(BaseModel):
    exposure_id: int
    num_simulations: int = 10000
    confidence_level: float = 0.95


class MonteCarloResponse(BaseModel):
    exposure_id: int
    mean_outcome: float
    median_outcome: float
    percentile_5: float
    percentile_95: float
    worst_case: float
    best_case: float
    probability_of_loss: float
    expected_loss: float
    
    class Config:
        from_attributes = True


# =============================================================================
# RISK CALCULATION FUNCTIONS
# =============================================================================

def calculate_volatility(rates: List[float], period_days: int) -> float:
    """
    Calculate annualized volatility from historical rates
    Uses log returns method (industry standard)
    """
    if len(rates) < 2:
        return 0.0
    
    # Calculate log returns
    log_returns = np.diff(np.log(rates))
    
    # Calculate volatility (standard deviation of returns)
    volatility = np.std(log_returns) * np.sqrt(252)  # Annualized
    
    return float(volatility * 100)  # Return as percentage


def calculate_var(amount: float, volatility: float, confidence: float, days: int) -> float:
    """
    Calculate Value at Risk (VaR)
    amount: exposure amount in USD
    volatility: annualized volatility (as percentage)
    confidence: confidence level (e.g., 0.95 for 95%)
    days: time horizon in days
    """
    # Convert to daily volatility
    daily_vol = (volatility / 100) / np.sqrt(252)
    
    # Calculate VaR
    z_score = stats.norm.ppf(confidence)
    var = amount * daily_vol * z_score * np.sqrt(days)
    
    return float(abs(var))


def run_monte_carlo_simulation(
    current_rate: float,
    volatility: float,
    amount: float,
    days_to_settlement: int,
    num_simulations: int = 10000
) -> Dict[str, Any]:
    """
    Run Monte Carlo simulation for FX exposure
    Returns distribution of possible outcomes
    """
    # Convert annualized volatility to daily
    daily_vol = (volatility / 100) / np.sqrt(252)
    
    # Generate random price paths using Geometric Brownian Motion
    dt = 1  # daily steps
    drift = 0  # Assume no drift for simplicity
    
    # Generate random shocks
    random_shocks = np.random.normal(0, daily_vol, (num_simulations, days_to_settlement))
    
    # Calculate cumulative returns
    cumulative_returns = np.exp(drift * dt + np.cumsum(random_shocks, axis=1))
    
    # Final rates at settlement
    final_rates = current_rate * cumulative_returns[:, -1]
    
    # Calculate USD values
    final_values = amount * final_rates
    
    # Calculate outcomes (profit/loss)
    initial_value = amount * current_rate
    outcomes = final_values - initial_value
    
    # Calculate statistics
    results = {
        "mean_outcome": float(np.mean(outcomes)),
        "median_outcome": float(np.median(outcomes)),
        "percentile_5": float(np.percentile(outcomes, 5)),
        "percentile_95": float(np.percentile(outcomes, 95)),
        "worst_case": float(np.min(outcomes)),
        "best_case": float(np.max(outcomes)),
        "probability_of_loss": float(np.sum(outcomes < 0) / num_simulations),
        "expected_loss": float(np.mean(outcomes[outcomes < 0])) if np.any(outcomes < 0) else 0.0,
        "distribution": outcomes.tolist()[:100]  # Store sample for visualization
    }
    
    return results


def get_settlement_days(settlement_period: str) -> int:
    """Convert settlement period to days"""
    mapping = {
        "7_days": 7,
        "14_days": 14,
        "21_days": 21,
        "30_days": 30
    }
    return mapping.get(settlement_period, 14)


def get_volatility_for_period(exposure: Exposure) -> float:
    """Get appropriate volatility based on settlement period"""
    period = exposure.settlement_period
    
    if period == "7_days":
        return exposure.volatility_7d or 0.0
    elif period == "14_days":
        return exposure.volatility_14d or 0.0
    elif period == "21_days":
        return exposure.volatility_21d or 0.0
    else:
        return exposure.volatility_21d or 0.0  # Use longest for extended periods


# =============================================================================
# FASTAPI APP
# =============================================================================

app = FastAPI(
    title="Birk API",
    description="FX Risk Management Platform for Commodity Traders",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    """Database session dependency"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.get("/")
def root():
    """Health check"""
    return {
        "status": "ok",
        "message": "Birk API - FX Risk Management Platform",
        "version": "1.0.0"
    }


# --- COMPANY ENDPOINTS ---

@app.post("/companies", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
def create_company(company: CompanyCreate, db: Session = Depends(get_db)):
    """Create a new company"""
    existing = db.query(Company).filter(Company.name == company.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Company already exists")
    
    db_company = Company(**company.dict())
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    return db_company


@app.get("/companies", response_model=List[CompanyResponse])
def list_companies(db: Session = Depends(get_db)):
    """Get all companies"""
    return db.query(Company).filter(Company.is_active == True).all()


@app.get("/companies/{company_id}", response_model=CompanyResponse)
def get_company(company_id: int, db: Session = Depends(get_db)):
    """Get specific company"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


# --- EXPOSURE ENDPOINTS ---

@app.post("/companies/{company_id}/exposures", response_model=ExposureResponse)
def create_exposure(
    company_id: int,
    exposure: ExposureCreate,
    db: Session = Depends(get_db)
):
    """Create new currency exposure with volatility calculation"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Get mock current rate (in production, call FX API)
    current_rate = get_mock_fx_rate(exposure.from_currency, exposure.to_currency)
    
    # Get historical rates for volatility calculation
    historical_rates = get_mock_historical_rates(
        exposure.from_currency,
        exposure.to_currency,
        days=30
    )
    
    # Calculate volatilities
    vol_7d = calculate_volatility(historical_rates[-7:], 7) if len(historical_rates) >= 7 else 0.0
    vol_14d = calculate_volatility(historical_rates[-14:], 14) if len(historical_rates) >= 14 else 0.0
    vol_21d = calculate_volatility(historical_rates[-21:], 21) if len(historical_rates) >= 21 else 0.0
    
    # Create exposure
    db_exposure = Exposure(
        company_id=company_id,
        from_currency=exposure.from_currency,
        to_currency=exposure.to_currency,
        settlement_currency=exposure.settlement_currency,
        amount=exposure.amount,
        settlement_period=exposure.settlement_period,
        settlement_date=exposure.settlement_date,
        upward_risk_threshold=exposure.upward_risk_threshold,
        downward_risk_threshold=exposure.downward_risk_threshold,
        instrument_type=exposure.instrument_type,
        description=exposure.description,
        counterparty=exposure.counterparty,
        current_rate=current_rate,
        initial_rate=current_rate,
        volatility_7d=vol_7d,
        volatility_14d=vol_14d,
        volatility_21d=vol_21d,
        current_value_usd=exposure.amount * current_rate
    )
    
    # Set current volatility based on settlement period
    db_exposure.current_volatility = get_volatility_for_period(db_exposure)
    
    # Calculate VaR
    days = get_settlement_days(exposure.settlement_period)
    db_exposure.var_95 = calculate_var(
        exposure.amount * current_rate,
        db_exposure.current_volatility,
        0.95,
        days
    )
    db_exposure.var_99 = calculate_var(
        exposure.amount * current_rate,
        db_exposure.current_volatility,
        0.99,
        days
    )
    
    db.add(db_exposure)
    db.commit()
    db.refresh(db_exposure)
    
    return db_exposure


@app.get("/companies/{company_id}/exposures", response_model=List[ExposureResponse])
def list_exposures(
    company_id: int,
    unsecured_only: bool = Query(False, description="Show only unsecured exposures"),
    db: Session = Depends(get_db)
):
    """Get all exposures for a company"""
    query = db.query(Exposure).filter(Exposure.company_id == company_id)
    
    if unsecured_only:
        query = query.filter(Exposure.is_secured == False)
    
    return query.order_by(Exposure.settlement_date).all()


@app.get("/companies/{company_id}/exposures/{exposure_id}", response_model=ExposureResponse)
def get_exposure(company_id: int, exposure_id: int, db: Session = Depends(get_db)):
    """Get specific exposure"""
    exposure = db.query(Exposure).filter(
        Exposure.id == exposure_id,
        Exposure.company_id == company_id
    ).first()
    
    if not exposure:
        raise HTTPException(status_code=404, detail="Exposure not found")
    
    return exposure


@app.post("/companies/{company_id}/exposures/{exposure_id}/secure")
def secure_exposure(company_id: int, exposure_id: int, db: Session = Depends(get_db)):
    """Mark exposure as secured (hedged)"""
    exposure = db.query(Exposure).filter(
        Exposure.id == exposure_id,
        Exposure.company_id == company_id
    ).first()
    
    if not exposure:
        raise HTTPException(status_code=404, detail="Exposure not found")
    
    exposure.is_secured = True
    db.commit()
    
    return {"message": "Exposure secured successfully", "exposure_id": exposure_id}


@app.post("/exposures/{exposure_id}/monte-carlo", response_model=MonteCarloResponse)
def run_monte_carlo(
    exposure_id: int,
    request: MonteCarloRequest,
    db: Session = Depends(get_db)
):
    """Run Monte Carlo simulation for an exposure"""
    exposure = db.query(Exposure).filter(Exposure.id == exposure_id).first()
    if not exposure:
        raise HTTPException(status_code=404, detail="Exposure not found")
    
    # Calculate days to settlement
    days_to_settlement = (exposure.settlement_date - datetime.utcnow()).days
    if days_to_settlement < 1:
        days_to_settlement = 1
    
    # Run simulation
    results = run_monte_carlo_simulation(
        current_rate=exposure.current_rate,
        volatility=exposure.current_volatility or 10.0,
        amount=exposure.amount,
        days_to_settlement=days_to_settlement,
        num_simulations=request.num_simulations
    )
    
    # Store simulation results
    simulation = MonteCarloSimulation(
        exposure_id=exposure_id,
        num_simulations=request.num_simulations,
        mean_outcome=results["mean_outcome"],
        median_outcome=results["median_outcome"],
        percentile_5=results["percentile_5"],
        percentile_95=results["percentile_95"],
        worst_case=results["worst_case"],
        best_case=results["best_case"],
        probability_of_loss=results["probability_of_loss"],
        expected_loss=results["expected_loss"],
        distribution_data=json.dumps(results["distribution"])
    )
    
    db.add(simulation)
    db.commit()
    db.refresh(simulation)
    
    return simulation


# --- PAYMENT CORRIDOR ENDPOINTS ---

@app.post("/companies/{company_id}/corridors", response_model=CorridorResponse)
def create_corridor(
    company_id: int,
    corridor: CorridorCreate,
    db: Session = Depends(get_db)
):
    """Create payment corridor with limits"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Check if corridor already exists
    existing = db.query(PaymentCorridor).filter(
        PaymentCorridor.company_id == company_id,
        PaymentCorridor.from_currency == corridor.from_currency,
        PaymentCorridor.to_currency == corridor.to_currency
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Corridor already exists")
    
    db_corridor = PaymentCorridor(
        company_id=company_id,
        **corridor.dict()
    )
    
    db.add(db_corridor)
    db.commit()
    db.refresh(db_corridor)
    
    return db_corridor


@app.get("/companies/{company_id}/corridors", response_model=List[CorridorResponse])
def list_corridors(company_id: int, db: Session = Depends(get_db)):
    """Get all payment corridors for a company"""
    return db.query(PaymentCorridor).filter(
        PaymentCorridor.company_id == company_id,
        PaymentCorridor.is_active == True
    ).all()


@app.get("/corridors/check")
def check_corridor_limit(
    company_id: int,
    from_currency: str,
    to_currency: str,
    amount: float,
    db: Session = Depends(get_db)
):
    """Check if transaction is within corridor limits"""
    corridor = db.query(PaymentCorridor).filter(
        PaymentCorridor.company_id == company_id,
        PaymentCorridor.from_currency == from_currency,
        PaymentCorridor.to_currency == to_currency,
        PaymentCorridor.is_active == True
    ).first()
    
    if not corridor:
        return {
            "allowed": False,
            "reason": "No corridor configured for this currency pair"
        }
    
    # Check limits
    checks = {
        "per_transaction": amount <= corridor.per_transaction_limit,
        "daily": (corridor.daily_used + amount) <= corridor.daily_limit,
        "monthly": (corridor.monthly_used + amount) <= corridor.monthly_limit
    }
    
    allowed = all(checks.values())
    
    return {
        "allowed": allowed,
        "checks": checks,
        "corridor": {
            "per_transaction_limit": corridor.per_transaction_limit,
            "daily_limit": corridor.daily_limit,
            "daily_used": corridor.daily_used,
            "daily_remaining": corridor.daily_limit - corridor.daily_used,
            "monthly_limit": corridor.monthly_limit,
            "monthly_used": corridor.monthly_used,
            "monthly_remaining": corridor.monthly_limit - corridor.monthly_used
        }
    }


# --- ALERT ENDPOINTS ---

@app.get("/companies/{company_id}/alerts", response_model=List[AlertResponse])
def list_alerts(
    company_id: int,
    unread_only: bool = False,
    db: Session = Depends(get_db)
):
    """Get alerts for a company"""
    query = db.query(Alert).join(Exposure).filter(Exposure.company_id == company_id)
    
    if unread_only:
        query = query.filter(Alert.is_read == False)
    
    return query.order_by(Alert.triggered_at.desc()).limit(50).all()


# --- EXCHANGE RATE ENDPOINTS ---

@app.get("/rates/{from_currency}/{to_currency}")
def get_exchange_rate(from_currency: str, to_currency: str):
    """Get current exchange rate"""
    rate = get_mock_fx_rate(from_currency, to_currency)
    
    return {
        "from_currency": from_currency,
        "to_currency": to_currency,
        "rate": rate,
        "timestamp": datetime.utcnow(),
        "source": "mock"  # In production: "live_api"
    }


@app.get("/currencies")
def list_currencies():
    """Get all supported currencies"""
    return {
        "g10": ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK"],
        "emerging": ["CNY", "BRL", "MXN", "INR", "RUB", "ZAR", "TRY", "KRW", "SGD", "HKD"],
        "all": [c.value for c in CurrencyCode]
    }


# =============================================================================
# MOCK DATA FUNCTIONS (Replace with real API in production)
# =============================================================================

def get_mock_fx_rate(from_curr: str, to_curr: str) -> float:
    """Mock FX rates - replace with real API"""
    rates = {
        ("GBP", "USD"): 1.2850,
        ("EUR", "USD"): 1.0920,
        ("JPY", "USD"): 0.0067,
        ("CHF", "USD"): 1.1350,
        ("CAD", "USD"): 0.7450,
        ("AUD", "USD"): 0.6580,
        ("CNY", "USD"): 0.1380,
        ("BRL", "USD"): 0.1950,
        ("MXN", "USD"): 0.0580,
        ("USD", "USD"): 1.0000,
    }
    
    # Try direct lookup
    rate = rates.get((from_curr, to_curr))
    if rate:
        return rate
    
    # Try reverse
    reverse_rate = rates.get((to_curr, from_curr))
    if reverse_rate:
        return 1 / reverse_rate
    
    # Default
    return 1.0


def get_mock_historical_rates(from_curr: str, to_curr: str, days: int = 30) -> List[float]:
    """Generate mock historical rates with realistic volatility"""
    base_rate = get_mock_fx_rate(from_curr, to_curr)
    
    # Simulate daily rates with random walk
    rates = [base_rate]
    for _ in range(days - 1):
        change = np.random.normal(0, 0.005)  # 0.5% daily volatility
        new_rate = rates[-1] * (1 + change)
        rates.append(new_rate)
    
    return rates


# =============================================================================
# STARTUP
# =============================================================================

@app.on_event("startup")
def startup_event():
    print("=" * 70)
    print("🚀 BIRK - FX Risk Management Platform")
    print("=" * 70)
    print("📊 Features:")
    print("   ✓ Multi-currency exposure tracking (G10 + Emerging Markets)")
    print("   ✓ Volatility-based risk (7/14/21-day periods)")
    print("   ✓ Monte Carlo simulations")
    print("   ✓ Payment corridor limits")
    print("   ✓ VaR & CVaR calculations")
    print("=" * 70)
    print("📝 API Documentation: http://localhost:8000/docs")
    print("=" * 70)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
