"""
Database configuration and helper functions
"""

import os
import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from functools import lru_cache
from models import RiskLevel

# Database setup
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost/birk_db')
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# API Configuration
FX_API_KEY = os.getenv('FX_API_KEY', '8e0eb70d6c0fb96657f30109')
FX_API_BASE = f"https://v6.exchangerate-api.com/v6/{FX_API_KEY}"


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
        raise Exception(f"Failed to fetch FX rate: {str(e)}")


def calculate_risk_level(usd_value: float, settlement_period: int) -> RiskLevel:
    """Calculate risk level based on USD value and settlement period"""
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