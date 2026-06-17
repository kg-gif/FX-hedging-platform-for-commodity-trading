"""
Monte Carlo Simulation API Routes
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from models import Exposure, SimulationResult
from database import SessionLocal, get_db
from services.monte_carlo_service import MonteCarloService
from datetime import datetime, date, timedelta
import httpx
import os
import logging
import numpy as np

logger = logging.getLogger(__name__)

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


@router.get("/simulate/exposure/{exposure_id}")
async def simulate_exposure_structured(
    exposure_id: int,
    horizon_days: int = Query(default=90, ge=1, le=365),
    history_days: int = Query(default=90, ge=30, le=365),
    db: Session = Depends(get_db)
):
    """
    GET /api/monte-carlo/simulate/exposure/{exposure_id}

    Returns structured simulation output for RiskEngine.jsx Phase 3.
    Shape matches BF-005 spec — Axel · CTO / Finn · Treasury, 02/06/2026.

    Output includes:
    - forward_path: day-by-day P50 (median) path
    - confidence_bands: day-by-day P10/P25/P75/P90 across all paths
    - historical_rates: lookback from exchangerate-api
    - var_95_pct: worst P5 outcome expressed as rate delta
    - expected_shortfall_95_pct: mean of worst 5% paths
    - narrative: ai_generated flag carried per Ada contract

    Volatility calibrated from historical daily returns (not static lookup).
    Finn · Treasury requirement — approved 02/06/2026.
    """
    exposure = db.query(Exposure).filter(Exposure.id == exposure_id).first()
    if not exposure:
        raise HTTPException(status_code=404, detail=f"Exposure {exposure_id} not found")

    currency_pair = f"{exposure.from_currency}/{exposure.to_currency}"
    spot = float(exposure.current_rate or 1.0)
    budget_rate = float(exposure.budget_rate or spot)
    simulation_date = date.today().isoformat()

    # ── Historical rates from internal table ──────────────────────
    # Shared market data — no API calls, no quota, no paid plan needed.
    # fx_rate_history populated daily by /api/admin/fx-history/snapshot
    # and seeded via /api/admin/fx-history/upload (investing.com CSV).
    historical_rates = []
    calibrated_vol = None

    try:
        hist_rows = db.execute(text("""
            SELECT rate_date, closing_rate
            FROM fx_rate_history
            WHERE currency_pair = :pair
              AND rate_date < CURRENT_DATE
            ORDER BY rate_date DESC
            LIMIT :days
        """), {"pair": currency_pair, "days": history_days}).fetchall()

        if hist_rows:
            # Reverse to chronological order for the chart
            hist_rows = list(reversed(hist_rows))
            historical_rates = [
                {"day": i - len(hist_rows), "rate": float(r.closing_rate)}
                for i, r in enumerate(hist_rows)
            ]
            # Calibrate vol from actual daily log returns
            if len(historical_rates) >= 10:
                rate_vals = np.array([r["rate"] for r in historical_rates])
                log_returns = np.diff(np.log(rate_vals))
                calibrated_vol = float(np.std(log_returns) * np.sqrt(252))
    except Exception as e:
        logger.warning(f"Historical rates fetch failed: {e}")

    # ── Run simulation ─────────────────────────────────────────────
    mc = MonteCarloService()
    num_scenarios = 10000
    num_steps = horizon_days
    dt = 1 / 252
    vol = calibrated_vol or mc.estimate_volatility_from_pair(currency_pair)

    np.random.seed(42)
    shocks = np.random.normal(0, 1, (num_scenarios, num_steps))
    paths = np.zeros((num_scenarios, num_steps + 1))
    paths[:, 0] = spot
    for t in range(num_steps):
        paths[:, t + 1] = paths[:, t] * np.exp(
            (-0.5 * vol**2) * dt + vol * np.sqrt(dt) * shocks[:, t]
        )

    # ── Forward path (P50 at each step) ───────────────────────────
    forward_path = [
        {"day": t, "rate": round(float(np.percentile(paths[:, t], 50)), 6)}
        for t in range(0, num_steps + 1, max(1, num_steps // 20))
    ]

    # ── Confidence bands ──────────────────────────────────────────
    confidence_bands = [
        {
            "day": t,
            "p10": round(float(np.percentile(paths[:, t], 10)), 6),
            "p25": round(float(np.percentile(paths[:, t], 25)), 6),
            "p75": round(float(np.percentile(paths[:, t], 75)), 6),
            "p90": round(float(np.percentile(paths[:, t], 90)), 6),
        }
        for t in range(0, num_steps + 1, max(1, num_steps // 20))
    ]

    # ── VaR and Expected Shortfall ─────────────────────────────────
    final_rates = paths[:, -1]
    rate_deltas = final_rates - spot
    var_95_rate = float(np.percentile(rate_deltas, 5))
    es_threshold = np.percentile(rate_deltas, 5)
    worst_paths = rate_deltas[rate_deltas <= es_threshold]
    expected_shortfall = float(np.mean(worst_paths)) if len(worst_paths) > 0 else var_95_rate

    return {
        "pair":             currency_pair,
        "spot":             spot,
        "budget_rate":      budget_rate,
        "simulation_date":  simulation_date,
        "horizon_days":     horizon_days,
        "volatility_used":  round(vol, 6),
        "vol_calibrated":   calibrated_vol is not None,

        "forward_path":     forward_path,
        "confidence_bands": confidence_bands,

        "var_95_pct":              round(var_95_rate, 6),
        "expected_shortfall_95_pct": round(expected_shortfall, 6),

        "historical_rates": historical_rates,

        "narrative": None,
        "ai_generated": False,
        "fallback_used": True,
    }
