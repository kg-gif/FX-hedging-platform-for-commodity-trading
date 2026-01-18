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
async def simulate_portfolio(
    request: PortfolioSimulationRequest,
    db: Session = Depends(get_db)
):
    try:
        exposures = db.query(Exposure).filter(
            Exposure.company_id == request.company_id
        ).all()
        
        if not exposures:
            raise HTTPException(
                status_code=404,
                detail=f"No exposures found for company {request.company_id}"
            )
        
        exposure_dicts = []
        for exp in exposures:
            exposure_dicts.append({
                'id': exp.id,
                'currency_pair': f"{exp.from_currency}{exp.to_currency}",
                'current_rate': exp.current_rate,
                'amount': exp.amount,
                'from_currency': exp.from_currency,
                'to_currency': exp.to_currency
            })
        
        result = monte_carlo_service.run_portfolio_simulation(
            exposures=exposure_dicts,
            time_horizon_days=request.time_horizon_days,
            num_scenarios=request.num_scenarios
        )
        
        return {
            'success': True,
            'company_id': request.company_id,
            'portfolio_simulation': result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Portfolio simulation failed: {str(e)}")
</details>
