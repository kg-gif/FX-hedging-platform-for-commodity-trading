"""
Monte Carlo Simulation API Routes
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy.orm import Session

from models import Exposure, SimulationResult
from database import SessionLocal, get_db
from services.monte_carlo_service import MonteCarloService
from datetime import datetime

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
        currency_pair = f"{exposure.from_currency}/{exposure.to_currency}"
        current_rate = exposure.current_rate or 1.0
        
        # Run simulation
        try:
            result = mc_service.run_simulation(
                current_rate=current_rate,
                amount=exposure.amount,
                time_horizon_days=request.time_horizon_days,
                num_scenarios=request.num_scenarios,
                currency_pair=currency_pair
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Save to database
        sim_result = SimulationResult(
            exposure_id=exposure.id,
            horizon_days=request.time_horizon_days,
            num_scenarios=result['simulation_params']['num_scenarios'],
            volatility=result['simulation_params']['volatility'],
            current_rate=result['simulation_params']['current_rate'],
            var_95=result['risk_metrics'].get('var_95'),
            var_99=result['risk_metrics'].get('var_99'),
            expected_pnl=result['summary'].get('expected_pnl'),
            max_loss=result['risk_metrics'].get('max_loss'),
            max_gain=result['risk_metrics'].get('max_gain'),
            probability_of_loss=result['risk_metrics'].get('probability_of_loss'),
            pnl_distribution=result['outcomes'].get('simulated_pnl'),
            rate_distribution=result['outcomes'].get('simulated_rates')
        )
        
        db.add(sim_result)
        db.commit()
        db.refresh(sim_result)
        
        # Clean up internal arrays before returning
        if '_internal_full_pnl' in result:
            del result['_internal_full_pnl']
        
        return {
            'success': True,
            'simulation_id': sim_result.id,
            'exposure_id': exposure.id,
            'currency_pair': currency_pair,
            'amount': exposure.amount,
            'current_rate': current_rate,
            'simulation': result,
            'created_at': sim_result.created_at
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.get("/history/{exposure_id}")
async def get_simulation_history(
    exposure_id: int,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get historical simulation results for an exposure"""
    simulations = db.query(SimulationResult)\
        .filter(SimulationResult.exposure_id == exposure_id)\
        .order_by(SimulationResult.created_at.desc())\
        .limit(limit)\
        .all()
    
    return {
        "exposure_id": exposure_id,
        "total_simulations": len(simulations),
        "simulations": [
            {
                "id": sim.id,
                "created_at": sim.created_at,
                "horizon_days": sim.horizon_days,
                "num_scenarios": sim.num_scenarios,
                "var_95": float(sim.var_95) if sim.var_95 else None,
                "var_99": float(sim.var_99) if sim.var_99 else None,
                "expected_pnl": float(sim.expected_pnl) if sim.expected_pnl else None,
                "max_loss": float(sim.max_loss) if sim.max_loss else None,
                "max_gain": float(sim.max_gain) if sim.max_gain else None,
                "probability_of_loss": float(sim.probability_of_loss) if sim.probability_of_loss else None
            }
            for sim in simulations
        ]
    }


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
            currency_pair = f"{exp.from_currency}/{exp.to_currency}"
            exposure_data.append({
                'id': exp.id,
                'amount': exp.amount,
                'current_rate': exp.current_rate or 1.0,
                'currency_pair': currency_pair
            })
        
        # Run portfolio simulation
        try:
            portfolio_result = mc_service.run_portfolio_simulation(
                exposures=exposure_data,
                time_horizon_days=request.time_horizon_days,
                num_scenarios=request.num_scenarios
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Clean up: Remove NumPy arrays before JSON serialization
        if 'individual_exposures' in portfolio_result:
            for exp_result in portfolio_result['individual_exposures']:
                if 'result' in exp_result and '_internal_full_pnl' in exp_result['result']:
                    del exp_result['result']['_internal_full_pnl']
        
        return {
            'success': True,
            'portfolio_simulation': portfolio_result,
            'created_at': datetime.utcnow()
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
