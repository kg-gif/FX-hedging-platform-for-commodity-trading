"""
BIRK FX Phase 2B Extended - Data Import Routes (FastAPI Version)
FastAPI endpoints for file uploads and manual exposure data entry
NOW WITH CRUD: Create, Read, Update, Delete
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
import io

from models import Exposure, Company, RiskLevel
from database import SessionLocal, get_live_fx_rate, calculate_risk_level

router = APIRouter(prefix="/api/exposure-data", tags=["Exposure Data"])


# Pydantic Models
class ManualExposureRequest(BaseModel):
    company_id: int
    reference_number: str
    currency_pair: str
    amount: float = Field(..., gt=0)
    start_date: str
    end_date: str
    description: Optional[str] = None
    rate: Optional[float] = None
    # Budget & Risk Limits (Phase 2B)
    budget_rate: Optional[float] = None
    max_loss_limit: Optional[float] = None
    target_profit: Optional[float] = None
    hedge_ratio_policy: Optional[float] = Field(default=1.0, ge=0, le=1)
    instrument_type: Optional[str] = "Spot"


class UpdateExposureRequest(BaseModel):
    reference_number: Optional[str] = None
    currency_pair: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None


# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    company_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    POST /api/exposure-data/upload
    Upload CSV/Excel file with exposure data
    """
    try:
        # Validate company exists
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail=f"Company {company_id} not found")
        
        # Read file content
        contents = await file.read()
        
        # Parse file based on extension
        result = {
            'success': True,
            'filename': file.filename,
            'exposures': [],
            'saved_to_database': 0
        }
        
        # TODO: Add CSV/Excel parsing logic here
        # For now, return placeholder
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.post("/manual")
async def create_manual_exposure(
    request: ManualExposureRequest,
    db: Session = Depends(get_db)
):
    """
    POST /api/exposure-data/manual
    Create a single exposure manually
    """
    try:
        # Validate company exists
        company = db.query(Company).filter(Company.id == request.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail=f"Company {request.company_id} not found")
        
        # Parse currency pair (e.g., "EURUSD" -> from="EUR", to="USD")
        currency_pair = request.currency_pair.upper().replace("/", "").replace("-", "")
        
        if len(currency_pair) != 6:
            raise HTTPException(status_code=400, detail="Currency pair must be 6 characters (e.g., EURUSD)")
        
        from_currency = currency_pair[:3]
        to_currency = currency_pair[3:]
        
        # Calculate period days from dates
        start_date_obj = datetime.strptime(request.start_date, '%Y-%m-%d').date()
        end_date_obj = datetime.strptime(request.end_date, '%Y-%m-%d').date()
        period_days = (end_date_obj - start_date_obj).days
        
        if period_days <= 0:
            raise HTTPException(status_code=400, detail="End date must be after start date")
        
        # Get FX rate
        try:
            rate = request.rate if request.rate else get_live_fx_rate(from_currency, to_currency)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to get FX rate: {str(e)}")
        
        # Calculate USD value
        usd_value = request.amount * rate
        
        # Calculate risk level
        risk = calculate_risk_level(usd_value, period_days)
        
        # Create database record with Budget & Risk Limits
        db_exposure = Exposure(
            company_id=request.company_id,
            from_currency=from_currency,
            to_currency=to_currency,
            amount=request.amount,
            start_date=start_date_obj,
            end_date=end_date_obj,
            initial_rate=rate,
            current_rate=rate,
            current_value_usd=usd_value,
            settlement_period=period_days,
            risk_level=risk,
            description=request.description or '',
            budget_rate=request.budget_rate,
            max_loss_limit=request.max_loss_limit,
            target_profit=request.target_profit,
            hedge_ratio_policy=request.hedge_ratio_policy if request.hedge_ratio_policy else 1.0
            instrument_type=request.instrument_type or 'Spot'
        )
        
        db.add(db_exposure)
        db.commit()
        db.refresh(db_exposure)
        
        return {
            'success': True,
            'exposure': {
                'id': db_exposure.id,
                'company_id': db_exposure.company_id,
                'reference_number': request.reference_number,
                'from_currency': db_exposure.from_currency,
                'to_currency': db_exposure.to_currency,
                'amount': db_exposure.amount,
                'start_date': db_exposure.start_date.isoformat() if db_exposure.start_date else None,
                'end_date': db_exposure.end_date.isoformat() if db_exposure.end_date else None,
                'initial_rate': db_exposure.initial_rate,
                'current_rate': db_exposure.current_rate,
                'current_value_usd': db_exposure.current_value_usd,
                'settlement_period': db_exposure.settlement_period,
                'risk_level': db_exposure.risk_level.value,
                'description': db_exposure.description,
                'budget_rate': db_exposure.budget_rate,
                'created_at': db_exposure.created_at.isoformat()
            },
            'message': f'Exposure {request.reference_number} created successfully'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create exposure: {str(e)}")


@router.put("/exposures/{exposure_id}")
async def update_exposure(
    exposure_id: int,
    request: UpdateExposureRequest,
    db: Session = Depends(get_db)
):
    """
    PUT /api/exposure-data/exposures/{exposure_id}
    Update an existing exposure
    """
    try:
        # Fetch exposure
        exposure = db.query(Exposure).filter(Exposure.id == exposure_id).first()
        
        if not exposure:
            raise HTTPException(status_code=404, detail=f"Exposure {exposure_id} not found")
        
        # Update fields if provided
        if request.currency_pair:
            currency_pair = request.currency_pair.upper().replace("/", "").replace("-", "")
            if len(currency_pair) != 6:
                raise HTTPException(status_code=400, detail="Currency pair must be 6 characters")
            exposure.from_currency = currency_pair[:3]
            exposure.to_currency = currency_pair[3:]
        
        if request.amount is not None:
            exposure.amount = request.amount
            # Recalculate USD value
            if exposure.current_rate:
                exposure.current_value_usd = request.amount * exposure.current_rate
        
        if request.start_date:
            exposure.start_date = datetime.strptime(request.start_date, '%Y-%m-%d').date()
        
        if request.end_date:
            exposure.end_date = datetime.strptime(request.end_date, '%Y-%m-%d').date()
        
        # Recalculate period if dates changed
        if exposure.start_date and exposure.end_date:
            exposure.settlement_period = (exposure.end_date - exposure.start_date).days
            
            # Recalculate risk level
            if exposure.current_value_usd:
                exposure.risk_level = calculate_risk_level(
                    exposure.current_value_usd,
                    exposure.settlement_period
                )
        
        if request.description is not None:
            exposure.description = request.description
        
        # Update timestamp
        exposure.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(exposure)
        
        return {
            'success': True,
            'exposure': {
                'id': exposure.id,
                'company_id': exposure.company_id,
                'from_currency': exposure.from_currency,
                'to_currency': exposure.to_currency,
                'currency_pair': f"{exposure.from_currency}{exposure.to_currency}",
                'amount': exposure.amount,
                'start_date': exposure.start_date.isoformat() if exposure.start_date else None,
                'end_date': exposure.end_date.isoformat() if exposure.end_date else None,
                'current_value_usd': exposure.current_value_usd,
                'settlement_period': exposure.settlement_period,
                'risk_level': exposure.risk_level.value if exposure.risk_level else 'Unknown',
                'description': exposure.description,
                'updated_at': exposure.updated_at.isoformat()
            },
            'message': 'Exposure updated successfully'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update exposure: {str(e)}")


@router.delete("/exposures/{exposure_id}")
async def delete_exposure(
    exposure_id: int,
    db: Session = Depends(get_db)
):
    """
    DELETE /api/exposure-data/exposures/{exposure_id}
    Delete an exposure
    """
    try:
        # Fetch exposure
        exposure = db.query(Exposure).filter(Exposure.id == exposure_id).first()
        
        if not exposure:
            raise HTTPException(status_code=404, detail=f"Exposure {exposure_id} not found")
        
        # Store info for response
        exposure_info = {
            'id': exposure.id,
            'currency_pair': f"{exposure.from_currency}{exposure.to_currency}",
            'amount': exposure.amount
        }
        
        # Delete
        db.delete(exposure)
        db.commit()
        
        return {
            'success': True,
            'deleted_exposure': exposure_info,
            'message': f'Exposure {exposure_id} deleted successfully'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete exposure: {str(e)}")


@router.get("/exposures/{company_id}")
async def get_company_exposures(
    company_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    status: str = Query(default="active"),
    db: Session = Depends(get_db)
):
    """
    GET /api/exposure-data/exposures/{company_id}
    Get all exposures for a company with optional filters
    """
    try:
        # Query exposures from database
        query = db.query(Exposure).filter(Exposure.company_id == company_id)
        
        # Apply filters if provided
        if currency:
            query = query.filter(
                (Exposure.from_currency == currency.upper()) | 
                (Exposure.to_currency == currency.upper())
            )
        
        exposures = query.all()
        
        # Convert to dict format
        exposure_list = []
        for exp in exposures:
            exposure_list.append({
                'id': exp.id,
                'company_id': exp.company_id,
                'from_currency': exp.from_currency,
                'to_currency': exp.to_currency,
                'currency_pair': f"{exp.from_currency}{exp.to_currency}",
                'amount': exp.amount,
                'start_date': exp.start_date.isoformat() if exp.start_date else None,
                'end_date': exp.end_date.isoformat() if exp.end_date else None,
                'initial_rate': exp.initial_rate,
                'current_rate': exp.current_rate,
                'current_value_usd': exp.current_value_usd,
                'settlement_period': exp.settlement_period,
                'period_days': exp.settlement_period,
                'risk_level': exp.risk_level.value if exp.risk_level else 'Unknown',
                'description': exp.description,
                'status': 'active',
                'created_at': exp.created_at.isoformat() if exp.created_at else None,
                'updated_at': exp.updated_at.isoformat() if exp.updated_at else None
            })
        
        return {
            'success': True,
            'company_id': company_id,
            'exposures': exposure_list,
            'count': len(exposure_list),
            'filters': {
                'start_date': start_date,
                'end_date': end_date,
                'currency': currency,
                'status': status
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        'status': 'healthy',
        'service': 'Data Import',
        'version': '2.0.0',
        'features': ['CREATE', 'READ', 'UPDATE', 'DELETE']
    }

@router.get("/api/exposure-data/list")
async def list_manual_exposures(company_id: int, db: Session = Depends(get_db)):
    """Fetch all exposures for a company (matches manual entry endpoint pattern)"""
    from models import Exposure
    
    exposures = db.query(Exposure).filter(
        Exposure.company_id == company_id
    ).order_by(Exposure.created_at.desc()).limit(50).all()
    
    # Convert to dict for JSON serialization
    exposure_list = []
    for exp in exposures:
        exposure_list.append({
            "id": exp.id,
            "reference_number": exp.reference if hasattr(exp, 'reference') else exp.reference_number if hasattr(exp, 'reference_number') else None,
            "currency_pair": exp.currency_pair if hasattr(exp, 'currency_pair') else f"{exp.from_currency}{exp.to_currency}",
            "amount": float(exp.amount),
            "start_date": exp.start_date.isoformat() if hasattr(exp, 'start_date') and exp.start_date else None,
            "end_date": exp.end_date.isoformat() if hasattr(exp, 'end_date') and exp.end_date else None,
            "description": exp.description,
            "budget_rate": float(exp.budget_rate) if hasattr(exp, 'budget_rate') and exp.budget_rate else None,
            "hedge_ratio_policy": float(exp.hedge_ratio_policy) if hasattr(exp, 'hedge_ratio_policy') and exp.hedge_ratio_policy else 1.0,
            "created_at": exp.created_at.isoformat() if hasattr(exp, 'created_at') else None
        })
    
    return {"success": True, "exposures": exposure_list, "total": len(exposure_list)}