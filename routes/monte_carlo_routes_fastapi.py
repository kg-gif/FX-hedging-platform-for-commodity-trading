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

router = APIRouter(prefix="/api/monte-carlo", tags=["Monte Carlo Simulation"])


# Pydantic Models
class ExposureSimulationRequest(BaseModel):
    exposure_id: int
    time_horizon_days: int = Field(default=90, ge=1, le=365)
    num_scenarios: Optional[int] = Field(default=10000, ge=100, le=100000)


class PortfolioSimulationRequest(BaseModel):
    company_id: int
    time_horizon_days: int = Field(default=90, ge=1, le=365)
    num_scenarios: Optional[int] = Field(default=10000, ge=100, le=100000)


# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/simulate/exposure")
async def simulate_single_exposure(
    request: ExposureSimulationRequest,
    db: Session = Depends(get_db)
):
    """
    POST /api/monte-carlo/simulate/exposure
    Run Monte Carlo simulation for a single exposure
    """
    try:
        mc_service = MonteCarloService()
        
        # Fetch exposure from database
        exposure = db.query(Exposure).filter(Exposure.id == request.exposure_id).first()
        
        if not exposure:
            raise HTTPException(status_code=404, detail=f"Exposure {request.exposure_id} not found")
        
        # Prepare simulation parameters
        currency_pair = f"{exposure.from_currency}{exposure.to_currency}"
        current_rate = exposure.current_rate or 1.0
        
        # Run simulation
        result = mc_service.run_simulation(
            current_rate=current_rate,
            amount=exposure.amount,
            time_horizon_days=request.time_horizon_days,
            num_scenarios=request.num_scenarios,
            currency_pair=currency_pair
        )
        
        # Clean up internal arrays before returning
        if '_internal_full_pnl' in result:
            del result['_internal_full_pnl']
        
        return {
            'success': True,
            'exposure_id': exposure.id,
            'currency_pair': currency_pair,
            'amount': exposure.amount,
            'simulation': result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.post("/simulate/portfolio")
async def simulate_portfolio_exposure(
    request: PortfolioSimulationRequest,
    db: Session = Depends(get_db)
):
    """
    POST /api/monte-carlo/simulate/portfolio
    Run Monte Carlo simulation for entire portfolio
    """
    try:
        mc_service = MonteCarloService()
        
        # Fetch all exposures for the company
        exposures = db.query(Exposure).filter(
            Exposure.company_id == request.company_id
        ).all()
        
        if not exposures:
            raise HTTPException(status_code=404, detail="No exposures found for this company")
        
        # Prepare exposure data
        exposure_data = []
        for exp in exposures:
            currency_pair = f"{exp.from_currency}{exp.to_currency}"
            exposure_data.append({
                'id': exp.id,
                'amount': exp.amount,
                'current_rate': exp.current_rate or 1.0,
                'currency_pair': currency_pair
            })
        
        # Run portfolio simulation
        portfolio_result = mc_service.run_portfolio_simulation(
            exposures=exposure_data,
            time_horizon_days=request.time_horizon_days,
            num_scenarios=request.num_scenarios
        )
        
        # Clean up: Remove NumPy arrays before JSON serialization
        if 'individual_exposures' in portfolio_result:
            for exp_result in portfolio_result['individual_exposures']:
                if 'result' in exp_result and '_internal_full_pnl' in exp_result['result']:
                    del exp_result['result']['_internal_full_pnl']
        
        return {
            'success': True,
            'portfolio_simulation': portfolio_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Portfolio simulation failed: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        'status': 'healthy',
        'service': 'Monte Carlo Simulation',
        'version': '2.0.0'
    }