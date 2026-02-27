"""
BIRK FX Phase 2B - Hedging Routes (FastAPI Version)
All company-specific endpoints require JWT. Viewers restricted to their own company.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.hedging_service import HedgingService
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from auth_utils import get_token_payload, resolve_company_id

router = APIRouter(prefix="/api/hedging", tags=["hedging"])
hedging_service = HedgingService()


# ── Pydantic models ──────────────────────────────────────────────────────────

class HedgeRecommendationRequest(BaseModel):
    exposure_amount: float = Field(..., gt=0)
    current_rate: float = Field(..., gt=0)
    historical_volatility: float = Field(..., gt=0, le=1)
    time_horizon_days: int = Field(default=90, ge=1, le=365)
    risk_tolerance: str = Field(default="moderate", pattern="^(low|moderate|high)$")
    currency_pair: Optional[str] = Field(default="N/A")


class PnLCalculationRequest(BaseModel):
    exposure_amount: float = Field(..., gt=0)
    contract_rate: float = Field(..., gt=0)
    current_rate: float = Field(..., gt=0)
    hedge_ratio: float = Field(..., ge=0, le=1)
    currency_pair: Optional[str] = Field(default="N/A")


class HedgeCreationRequest(BaseModel):
    company_id: int
    currency_pair: str
    hedge_type: str = Field(..., pattern="^(forward|option|swap)$")
    notional_amount: float = Field(..., gt=0)
    hedge_ratio: float = Field(..., ge=0, le=1)
    contract_rate: float = Field(..., gt=0)
    maturity_date: str


class HedgeUpdateRequest(BaseModel):
    status: Optional[str] = Field(None, pattern="^(active|matured|cancelled)$")
    notes: Optional[str] = None


class StrategyComparisonRequest(BaseModel):
    exposure_amount: float = Field(..., gt=0)
    current_rate: float = Field(..., gt=0)
    strategies: List[dict]
    scenario_type: str = Field(default="moderate", pattern="^(conservative|moderate|aggressive)$")


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/health")
async def health_check():
    """Public health check — no auth required."""
    return {
        "status": "healthy",
        "service": "hedging",
        "timestamp": datetime.now().isoformat()
    }


@router.post("/recommendations")
async def get_recommendations(
    request: HedgeRecommendationRequest,
    payload: dict = Depends(get_token_payload)
):
    """Hedge ratio recommendations. Auth required."""
    try:
        recommendations = hedging_service.calculate_optimal_hedge_ratio(
            exposure_amount=request.exposure_amount,
            current_rate=request.current_rate,
            historical_volatility=request.historical_volatility,
            time_horizon_days=request.time_horizon_days,
            risk_tolerance=request.risk_tolerance
        )
        recommendations['currency_pair'] = request.currency_pair
        recommendations['timestamp'] = datetime.now().isoformat()
        return recommendations
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid data: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/scenarios/{company_id}")
async def get_company_scenarios(
    company_id: int,
    currency_pair: str = Query(default="EURUSD"),
    scenario_type: str = Query(default="moderate", pattern="^(conservative|moderate|aggressive)$"),
    hedge_ratio: float = Query(default=0.5, ge=0, le=1),
    payload: dict = Depends(get_token_payload)
):
    """Scenario analysis. Viewers restricted to their own company."""
    safe_id = resolve_company_id(company_id, payload)

    try:
        exposure_amount = 1000000
        current_rate = 1.0850

        scenarios = hedging_service.run_scenario_analysis(
            exposure_amount=exposure_amount,
            current_rate=current_rate,
            hedge_ratio=hedge_ratio,
            scenario_type=scenario_type
        )
        scenarios['company_id'] = safe_id
        scenarios['currency_pair'] = currency_pair
        scenarios['timestamp'] = datetime.now().isoformat()
        return scenarios
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameter: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/calculate-pnl")
async def calculate_pnl(
    request: PnLCalculationRequest,
    payload: dict = Depends(get_token_payload)
):
    """P&L calculation. Auth required."""
    try:
        pnl_result = hedging_service.calculate_pnl_impact(
            exposure_amount=request.exposure_amount,
            contract_rate=request.contract_rate,
            current_rate=request.current_rate,
            hedge_ratio=request.hedge_ratio
        )
        pnl_result['currency_pair'] = request.currency_pair
        pnl_result['timestamp'] = datetime.now().isoformat()
        return pnl_result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid data: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/active-hedges/{company_id}")
async def get_active_hedges(
    company_id: int,
    status: str = Query(default="active"),
    currency_pair: Optional[str] = Query(default=None),
    payload: dict = Depends(get_token_payload)
):
    """Active hedges. Viewers restricted to their own company."""
    safe_id = resolve_company_id(company_id, payload)

    try:
        active_hedges = [
            {
                'id': 1,
                'company_id': safe_id,
                'currency_pair': 'EURUSD',
                'hedge_type': 'forward',
                'notional_amount': 500000,
                'hedge_ratio': 0.50,
                'contract_rate': 1.0800,
                'current_rate': 1.0850,
                'start_date': '2025-01-01',
                'maturity_date': '2025-04-01',
                'status': 'active',
                'days_to_maturity': 79,
                'unrealized_pnl': 2500
            },
            {
                'id': 2,
                'company_id': safe_id,
                'currency_pair': 'GBPUSD',
                'hedge_type': 'forward',
                'notional_amount': 750000,
                'hedge_ratio': 0.75,
                'contract_rate': 1.2650,
                'current_rate': 1.2700,
                'start_date': '2024-12-15',
                'maturity_date': '2025-03-15',
                'status': 'active',
                'days_to_maturity': 62,
                'unrealized_pnl': 3750
            }
        ]

        filtered_hedges = [
            h for h in active_hedges
            if h['status'] == status and
            (not currency_pair or h['currency_pair'] == currency_pair)
        ]

        return {
            'company_id': safe_id,
            'hedges': filtered_hedges,
            'total_count': len(filtered_hedges),
            'timestamp': datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/create-hedge")
async def create_hedge(
    request: HedgeCreationRequest,
    payload: dict = Depends(get_token_payload)
):
    """Create hedge. company_id in body is enforced against token."""
    safe_id = resolve_company_id(request.company_id, payload)

    try:
        hedge_record = {
            'id': 123,
            'company_id': safe_id,
            'currency_pair': request.currency_pair,
            'hedge_type': request.hedge_type,
            'notional_amount': request.notional_amount,
            'hedge_ratio': request.hedge_ratio,
            'contract_rate': request.contract_rate,
            'start_date': datetime.now().strftime('%Y-%m-%d'),
            'maturity_date': request.maturity_date,
            'status': 'active',
            'created_at': datetime.now().isoformat()
        }
        return {'message': 'Hedge created successfully', 'hedge': hedge_record}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid data: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.put("/update-hedge/{hedge_id}")
async def update_hedge(
    hedge_id: int,
    request: HedgeUpdateRequest,
    payload: dict = Depends(get_token_payload)
):
    """Update hedge. Auth required."""
    try:
        updated_hedge = {
            'id': hedge_id,
            'status': request.status or 'active',
            'notes': request.notes or '',
            'updated_at': datetime.now().isoformat()
        }
        return {'message': 'Hedge updated successfully', 'hedge': updated_hedge}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/rollover-recommendation/{hedge_id}")
async def get_rollover_recommendation(
    hedge_id: int,
    market_outlook: str = Query(default="neutral", pattern="^(bullish|neutral|bearish)$"),
    payload: dict = Depends(get_token_payload)
):
    """Rollover recommendation. Auth required."""
    try:
        maturity_date = datetime(2025, 4, 1)
        current_exposure = 500000

        recommendation = hedging_service.recommend_rollover(
            maturity_date=maturity_date,
            current_exposure=current_exposure,
            market_outlook=market_outlook
        )
        recommendation['hedge_id'] = hedge_id
        recommendation['timestamp'] = datetime.now().isoformat()
        return recommendation
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/compare-strategies")
async def compare_strategies(
    request: StrategyComparisonRequest,
    payload: dict = Depends(get_token_payload)
):
    """Strategy comparison. Auth required."""
    try:
        comparison = []
        for strategy in request.strategies:
            hedge_ratio = float(strategy['hedge_ratio'])
            label = strategy.get('label', f"{hedge_ratio*100:.0f}% Hedge")
            scenarios = hedging_service.run_scenario_analysis(
                exposure_amount=request.exposure_amount,
                current_rate=request.current_rate,
                hedge_ratio=hedge_ratio,
                scenario_type=request.scenario_type
            )
            comparison.append({
                'label': label,
                'hedge_ratio': hedge_ratio,
                'scenarios': scenarios['scenarios'],
                'summary': scenarios['summary']
            })

        return {
            'exposure_amount': request.exposure_amount,
            'current_rate': request.current_rate,
            'scenario_type': request.scenario_type,
            'comparison': comparison,
            'timestamp': datetime.now().isoformat()
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid data: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
