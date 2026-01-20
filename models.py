"""
Database Models for BIRK FX Platform
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum, Date, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum

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