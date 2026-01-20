"""
Monte Carlo Simulation API Routes
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy.orm import Session

from models import Exposure
from database import SessionLocal
from services.monte_carlo_service import MonteCarloService

router = APIRouter(prefix="/api/monte-carlo", tags=["monte-carlo"])
monte_carlo_service = MonteCarloService()


class SimulationRequest(BaseModel):
    exposure_id: int
    time_horizon_days: int = Field(default=90, ge=1, le=365)
    num_scenarios: Optional[int] = Field(default=10000, ge=1000, le=50000)
    volatility: Optional[float] = Field(default=None, ge=0.01, le=1.0)


class PortfolioSimulationRequest(BaseModel):
    company_id: int
    time_horizon_days: int = Field(default=90, ge=1, le=365)
    num_scenarios: Optional[int] = Field(default=10000, ge=1000, le=50000)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "monte_carlo"
    }


@router.post("/simulate/exposure")
async def simulate_exposure(
    request: SimulationRequest,
    db: Session = Depends(get_db)
):
    try:
        exposure = db.query(Exposure).filter(Exposure.id == request.exposure_id).first()
        
        if not exposure:
            raise HTTPException(status_code=404, detail="Exposure not found")
        
        currency_pair = f"{exposure.from_currency}{exposure.to_currency}"
        
        result = monte_carlo_service.run_simulation(
            current_rate=exposure.current_rate,
            amount=exposure.amount,
            time_horizon_days=request.time_horizon_days,
            num_scenarios=request.num_scenarios,
            volatility=request.volatility,
            currency_pair=currency_pair
        )
        
        result['exposure_context'] = {
            'id': exposure.id,
            'currency_pair': currency_pair,
            'from_currency': exposure.from_currency,
            'to_currency': exposure.to_currency,
            'description': exposure.description,
            'settlement_period': exposure.settlement_period,
            'risk_level': exposure.risk_level.value if exposure.risk_level else 'Unknown'
        }
        
        return {
            'success': True,
            'simulation': result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.post("/simulate/portfolio")
@router.post("/simulate/portfolio")
async def simulate_portfolio_exposure(request: PortfolioSimulationRequest, db: Session = Depends(get_db)):
    # ... existing code ...
    
    # Run portfolio simulation
    portfolio_result = mc_service.run_portfolio_simulation(
        exposures=exposure_data,
        time_horizon_days=request.time_horizon_days,
        num_scenarios=request.num_scenarios
    )
    
    # Clean up: Remove NumPy arrays from individual exposure results before returning
    if 'individual_exposures' in portfolio_result:
        for exp_result in portfolio_result['individual_exposures']:
            if 'result' in exp_result and '_internal_full_pnl' in exp_result['result']:
                # Remove the NumPy array before JSON serialization
                del exp_result['result']['_internal_full_pnl']
    
    return {
        'success': True,
        'portfolio_simulation': portfolio_result
    }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Portfolio simulation failed: {str(e)}")