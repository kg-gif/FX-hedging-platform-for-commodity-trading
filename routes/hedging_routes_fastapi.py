"""
BIRK FX Phase 2B - Hedging Routes (FastAPI Version)
FastAPI endpoints for hedging recommendations, scenario analysis, and hedge tracking
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import sys
import os

# Add services directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.hedging_service import HedgingService

# Create router
router = APIRouter(prefix="/api/hedging", tags=["hedging"])

# Initialize hedging service
hedging_service = HedgingService()


# Pydantic models for request/response
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


@router.get("/health")
async def health_check():
    """Simple health check endpoint"""
    return {
        "status": "healthy",
        "service": "hedging",
        "timestamp": datetime.now().isoformat()
    }


@router.post("/recommendations")
async def get_recommendations(request: HedgeRecommendationRequest):
    """
    POST /api/hedging/recommendations
    
    Get hedge ratio recommendations for a given exposure
    """
    try:
        # Get recommendations
        recommendations = hedging_service.calculate_optimal_hedge_ratio(
            exposure_amount=request.exposure_amount,
            current_rate=request.current_rate,
            historical_volatility=request.historical_volatility,
            time_horizon_days=request.time_horizon_days,
            risk_tolerance=request.risk_tolerance
        )
        
        # Add metadata
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
    hedge_ratio: float = Query(default=0.5, ge=0, le=1)
):
    """
    GET /api/hedging/scenarios/{company_id}
    
    Get scenario analysis for a company's exposures
    """
    try:
        # Mock exposure data (replace with DB query in production)
        exposure_amount = 1000000  # $1M
        current_rate = 1.0850
        
        # Run scenario analysis
        scenarios = hedging_service.run_scenario_analysis(
            exposure_amount=exposure_amount,
            current_rate=current_rate,
            hedge_ratio=hedge_ratio,
            scenario_type=scenario_type
        )
        
        # Add metadata
        scenarios['company_id'] = company_id
        scenarios['currency_pair'] = currency_pair
        scenarios['timestamp'] = datetime.now().isoformat()
        
        return scenarios
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameter: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/calculate-pnl")
async def calculate_pnl(request: PnLCalculationRequest):
    """
    POST /api/hedging/calculate-pnl
    
    Calculate P&L impact of hedging strategy
    """
    try:
        # Calculate P&L
        pnl_result = hedging_service.calculate_pnl_impact(
            exposure_amount=request.exposure_amount,
            contract_rate=request.contract_rate,
            current_rate=request.current_rate,
            hedge_ratio=request.hedge_ratio
        )
        
        # Add metadata
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
    currency_pair: Optional[str] = Query(default=None)
):
    """
    GET /api/hedging/active-hedges/{company_id}
    
    Get all active hedges for a company
    """
    try:
        # Mock data (replace with DB query in production)
        active_hedges = [
            {
                'id': 1,
                'company_id': company_id,
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
                'company_id': company_id,
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
        
        # Filter by status and currency pair
        filtered_hedges = [
            hedge for hedge in active_hedges
            if hedge['status'] == status and
            (not currency_pair or hedge['currency_pair'] == currency_pair)
        ]
        
        return {
            'company_id': company_id,
            'hedges': filtered_hedges,
            'total_count': len(filtered_hedges),
            'timestamp': datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/create-hedge")
async def create_hedge(request: HedgeCreationRequest):
    """
    POST /api/hedging/create-hedge
    
    Create a new hedge contract
    """
    try:
        # In production, save to database
        hedge_id = 123  # Mock ID
        
        hedge_record = {
            'id': hedge_id,
            'company_id': request.company_id,
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
        
        return {
            'message': 'Hedge created successfully',
            'hedge': hedge_record
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid data: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.put("/update-hedge/{hedge_id}")
async def update_hedge(hedge_id: int, request: HedgeUpdateRequest):
    """
    PUT /api/hedging/update-hedge/{hedge_id}
    
    Update an existing hedge
    """
    try:
        # In production, update database
        updated_hedge = {
            'id': hedge_id,
            'status': request.status or 'active',
            'notes': request.notes or '',
            'updated_at': datetime.now().isoformat()
        }
        
        return {
            'message': 'Hedge updated successfully',
            'hedge': updated_hedge
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/rollover-recommendation/{hedge_id}")
async def get_rollover_recommendation(
    hedge_id: int,
    market_outlook: str = Query(default="neutral", pattern="^(bullish|neutral|bearish)$")
):
    """
    GET /api/hedging/rollover-recommendation/{hedge_id}
    
    Get recommendation on whether to roll over an expiring hedge
    """
    try:
        # Mock hedge data (replace with DB query)
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
async def compare_strategies(request: StrategyComparisonRequest):
    """
    POST /api/hedging/compare-strategies
    
    Compare multiple hedging strategies side-by-side
    """
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
