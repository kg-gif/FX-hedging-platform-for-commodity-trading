"""
Database Models for BIRK FX Platform
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum, Date, ForeignKey, JSON, Numeric, Boolean, UniqueConstraint, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum
import uuid

Base = declarative_base()

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
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    from_currency = Column(String, nullable=False)
    to_currency = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    initial_rate = Column(Float, nullable=True)
    current_rate = Column(Float, nullable=True)
    current_value_usd = Column(Float, nullable=True)
    settlement_period = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    risk_level = Column(Enum(RiskLevel), nullable=True)
    description = Column(String, nullable=True)
    status = Column(String, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    budget_rate = Column(Float, nullable=True)
    max_loss_limit = Column(Float, nullable=True)  # e.g., -500000
    target_profit = Column(Float, nullable=True)   # e.g., 300000
    hedge_ratio_policy = Column(Float, nullable=True, default=1.0)  # e.g., 0.60 for 60%
    current_pnl = Column(Float, nullable=True)
    hedged_amount = Column(Float, nullable=True)
    unhedged_amount = Column(Float, nullable=True)
    instrument_type = Column(String(20), default="Spot")  # Spot, Forward, Option, Swap
    
    # Relationship to SimulationResult
    simulations = relationship("SimulationResult", back_populates="exposure")


class FXRate(Base):
    __tablename__ = "fx_rates"

    id = Column(Integer, primary_key=True, index=True)
    currency_pair = Column(String(7), nullable=False, index=True)  # e.g., EUR/USD
    rate = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    source = Column(String(50), nullable=True)


class SimulationResult(Base):
    __tablename__ = 'simulation_results'
    
    id = Column(Integer, primary_key=True, index=True)
    exposure_id = Column(Integer, ForeignKey('exposures.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Simulation parameters
    horizon_days = Column(Integer, nullable=False)
    num_scenarios = Column(Integer, nullable=False)
    volatility = Column(Numeric(6, 4), nullable=False)
    current_rate = Column(Numeric(10, 6), nullable=False)
    
    # Risk metrics
    var_95 = Column(Numeric(15, 2))
    var_99 = Column(Numeric(15, 2))
    expected_pnl = Column(Numeric(15, 2))
    max_loss = Column(Numeric(15, 2))
    max_gain = Column(Numeric(15, 2))
    probability_of_loss = Column(Numeric(5, 4))
    
    # Distribution data (for charts) - store as JSON
    pnl_distribution = Column(JSON)  # Array of P&L values for histogram
    rate_distribution = Column(JSON)  # Array of final rates
    
    # Relationship
    exposure = relationship("Exposure", back_populates="simulations")


# ============================================
# EXPOSURE MANAGEMENT MODELS (Added 2025-02-12)
# ============================================

class Tenant(Base):
    """Multi-tenant isolation for different companies"""
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_name = Column(String(255), nullable=False)
    base_currency = Column(String(3), nullable=False, default='NOK')
    created_at = Column(TIMESTAMP, default=datetime.utcnow)


class APExposure(Base):
    """AP line items with classification"""
    __tablename__ = "ap_exposures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey('tenants.id'), nullable=False)

    # Source data from CSV
    order_number = Column(String(100))
    invoice_number = Column(String(100))
    supplier = Column(String(255), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    order_date = Column(Date)
    invoice_date = Column(Date)
    due_date = Column(Date)
    payment_terms = Column(String(50))

    # Classification (auto-generated)
    confidence_level = Column(String(50), nullable=False)
    confidence_score = Column(Numeric(3, 2), nullable=False)
    is_recurring = Column(Boolean, default=False)
    reasoning = Column(Text)

    # Audit trail (compliance requirement)
    uploaded_by = Column(String(255), nullable=False)
    uploaded_at = Column(TIMESTAMP, default=datetime.utcnow)
    source_file_name = Column(String(255), nullable=False)

    __table_args__ = (
        UniqueConstraint('tenant_id', 'invoice_number', name='unique_invoice'),
    )


class HedgeStrategy(Base):
    """Saved hedge scenarios"""
    __tablename__ = "hedge_strategies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey('tenants.id'), nullable=False)
    strategy_name = Column(String(255), nullable=False)
    hedge_ratio = Column(Numeric(3, 2), nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
    created_by = Column(String(255))