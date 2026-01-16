"""
Database Models for BIRK FX Platform
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum
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
    company_id = Column(Integer, index=True)
    from_currency = Column(String)
    to_currency = Column(String)
    amount = Column(Float)
    initial_rate = Column(Float)
    current_rate = Column(Float)
    current_value_usd = Column(Float)
    settlement_period = Column(Integer)
    risk_level = Column(Enum(RiskLevel))
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow) 