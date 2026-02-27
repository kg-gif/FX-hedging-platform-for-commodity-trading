"""
BIRK FX Phase 2B - Hedging Routes
Auth functions inlined — no external auth_utils dependency.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import sys, os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.hedging_service import HedgingService

router = APIRouter(prefix="/api/hedging", tags=["hedging"])
hedging_service = HedgingService()
security = HTTPBearer(auto_error=False)

# ── Inline auth ──────────────────────────────────────────────────
def get_token_payload(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    from jose import JWTError, jwt
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def resolve_company_id(requested_id: int, payload: dict) -> int:
    if payload.get("role") == "admin":
        return requested_id
    token_company_id = payload.get("company_id")
    if not token_company_id:
        raise HTTPException(status_code=403, detail="No company assigned to this account")
    return int(token_company_id)

# ── Pydantic models ──────────────────────────────────────────────
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

# ── Endpoints ────────────────────────────────────────────────────

@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "hedging", "timestamp": datetime.now().isoformat()}

@router.post("/recommendations")
async def get_recommendations(request: HedgeRecommendationRequest, payload: dict = Depends(get_token_payload)):
    try:
        rec = hedging_service.calculate_optimal_hedge_ratio(exposure_amount=request.exposure_amount, current_rate=request.current_rate, historical_volatility=request.historical_volatility, time_horizon_days=request.time_horizon_days, risk_tolerance=request.risk_tolerance)
        rec['currency_pair'] = request.currency_pair
        rec['timestamp'] = datetime.now().isoformat()
        return rec
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/scenarios/{company_id}")
async def get_company_scenarios(company_id: int, currency_pair: str = Query(default="EURUSD"), scenario_type: str = Query(default="moderate"), hedge_ratio: float = Query(default=0.5, ge=0, le=1), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(company_id, payload)
    try:
        scenarios = hedging_service.run_scenario_analysis(exposure_amount=1000000, current_rate=1.0850, hedge_ratio=hedge_ratio, scenario_type=scenario_type)
        scenarios['company_id'] = safe_id
        scenarios['currency_pair'] = currency_pair
        scenarios['timestamp'] = datetime.now().isoformat()
        return scenarios
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/calculate-pnl")
async def calculate_pnl(request: PnLCalculationRequest, payload: dict = Depends(get_token_payload)):
    try:
        result = hedging_service.calculate_pnl_impact(exposure_amount=request.exposure_amount, contract_rate=request.contract_rate, current_rate=request.current_rate, hedge_ratio=request.hedge_ratio)
        result['currency_pair'] = request.currency_pair
        result['timestamp'] = datetime.now().isoformat()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/active-hedges/{company_id}")
async def get_active_hedges(company_id: int, status: str = Query(default="active"), currency_pair: Optional[str] = Query(default=None), payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(company_id, payload)
    hedges = [
        {'id': 1, 'company_id': safe_id, 'currency_pair': 'EURUSD', 'hedge_type': 'forward', 'notional_amount': 500000, 'hedge_ratio': 0.50, 'contract_rate': 1.0800, 'current_rate': 1.0850, 'start_date': '2025-01-01', 'maturity_date': '2025-04-01', 'status': 'active', 'days_to_maturity': 79, 'unrealized_pnl': 2500},
        {'id': 2, 'company_id': safe_id, 'currency_pair': 'GBPUSD', 'hedge_type': 'forward', 'notional_amount': 750000, 'hedge_ratio': 0.75, 'contract_rate': 1.2650, 'current_rate': 1.2700, 'start_date': '2024-12-15', 'maturity_date': '2025-03-15', 'status': 'active', 'days_to_maturity': 62, 'unrealized_pnl': 3750}
    ]
    filtered = [h for h in hedges if h['status'] == status and (not currency_pair or h['currency_pair'] == currency_pair)]
    return {'company_id': safe_id, 'hedges': filtered, 'total_count': len(filtered), 'timestamp': datetime.now().isoformat()}

@router.post("/create-hedge")
async def create_hedge(request: HedgeCreationRequest, payload: dict = Depends(get_token_payload)):
    safe_id = resolve_company_id(request.company_id, payload)
    return {'message': 'Hedge created successfully', 'hedge': {'id': 123, 'company_id': safe_id, 'currency_pair': request.currency_pair, 'hedge_type': request.hedge_type, 'notional_amount': request.notional_amount, 'hedge_ratio': request.hedge_ratio, 'contract_rate': request.contract_rate, 'maturity_date': request.maturity_date, 'status': 'active', 'created_at': datetime.now().isoformat()}}

@router.put("/update-hedge/{hedge_id}")
async def update_hedge(hedge_id: int, request: HedgeUpdateRequest, payload: dict = Depends(get_token_payload)):
    return {'message': 'Hedge updated successfully', 'hedge': {'id': hedge_id, 'status': request.status or 'active', 'notes': request.notes or '', 'updated_at': datetime.now().isoformat()}}

@router.get("/rollover-recommendation/{hedge_id}")
async def get_rollover_recommendation(hedge_id: int, market_outlook: str = Query(default="neutral"), payload: dict = Depends(get_token_payload)):
    try:
        rec = hedging_service.recommend_rollover(maturity_date=datetime(2025, 4, 1), current_exposure=500000, market_outlook=market_outlook)
        rec['hedge_id'] = hedge_id
        rec['timestamp'] = datetime.now().isoformat()
        return rec
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare-strategies")
async def compare_strategies(request: StrategyComparisonRequest, payload: dict = Depends(get_token_payload)):
    try:
        comparison = []
        for strategy in request.strategies:
            hedge_ratio = float(strategy['hedge_ratio'])
            scenarios = hedging_service.run_scenario_analysis(exposure_amount=request.exposure_amount, current_rate=request.current_rate, hedge_ratio=hedge_ratio, scenario_type=request.scenario_type)
            comparison.append({'label': strategy.get('label', f"{hedge_ratio*100:.0f}% Hedge"), 'hedge_ratio': hedge_ratio, 'scenarios': scenarios['scenarios'], 'summary': scenarios['summary']})
        return {'exposure_amount': request.exposure_amount, 'current_rate': request.current_rate, 'scenario_type': request.scenario_type, 'comparison': comparison, 'timestamp': datetime.now().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
