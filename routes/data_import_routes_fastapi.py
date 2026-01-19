"""
BIRK FX Phase 2B Extended - Data Import Routes (FastAPI Version)
FastAPI endpoints for file uploads and manual exposure data entry
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timedelta
import io
import sys
import os
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import models from separate models file to avoid circular imports
from models import Exposure, Company
from database import SessionLocal, get_live_fx_rate, calculate_risk_level

# Add services directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.exposure_data_service import ExposureDataService

# Create router
router = APIRouter(prefix="/api/exposure-data", tags=["data-import"])

# Initialize service
data_service = ExposureDataService()

# Configuration
ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Pydantic models
class ManualExposureRequest(BaseModel):
    company_id: int
    reference_number: str
    currency_pair: str
    amount: float = Field(..., gt=0)
    start_date: str
    end_date: str
    description: Optional[str] = None
    rate: Optional[float] = None


class BatchExposureRequest(BaseModel):
    company_id: int
    exposures: List[dict]


class ExposureUpdateRequest(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    end_date: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(active|closed|cancelled)$")


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@router.get("/health")
async def health_check():
    """Simple health check endpoint"""
    return {
        "status": "healthy",
        "service": "data_import",
        "timestamp": datetime.now().isoformat()
    }


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    company_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    POST /api/exposure-data/upload
    
    Upload CSV or Excel file with exposure data
    """
    try:
        # Check if file is provided
        if not file:
            raise HTTPException(status_code=400, detail="No file provided")
        
        # Check if filename is empty
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file selected")
        
        # Validate file extension
        if not allowed_file(file.filename):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        # Read file content
        file_content = await file.read()
        
        # Check file size
        if len(file_content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024*1024):.0f}MB"
            )
        
        # Parse file
        result = data_service.parse_uploaded_file(
            file_content=file_content,
            filename=file.filename,
            company_id=company_id
        )
        
        if not result['success']:
            raise HTTPException(status_code=400, detail=result.get('error', 'Upload failed'))
        
      # Save exposures to database
        saved_count = 0
        for exp_data in result['exposures']:
            try:
                # Get live FX rate
                rate = get_live_fx_rate(exp_data['from_currency'], exp_data['to_currency'])
                usd_value = exp_data['amount'] * rate
                
                # Calculate risk level
                risk = calculate_risk_level(usd_value, exp_data['period_days'])
                
                # Parse dates if provided
                start_date = None
                end_date = None
                if exp_data.get('start_date'):
                    start_date = datetime.strptime(exp_data['start_date'], '%Y-%m-%d').date()
                if exp_data.get('end_date'):
                    end_date = datetime.strptime(exp_data['end_date'], '%Y-%m-%d').date()
                
                # Create database record
                db_exposure = Exposure(
                    company_id=company_id,
                    from_currency=exp_data['from_currency'],
                    to_currency=exp_data['to_currency'],
                    amount=exp_data['amount'],
                    start_date=start_date,
                    end_date=end_date,
                    initial_rate=rate,
                    current_rate=rate,
                    current_value_usd=usd_value,
                    settlement_period=exp_data['period_days'],
                    risk_level=risk,
                    description=exp_data.get('description', '')
                )
                
                db.add(db_exposure)
                saved_count += 1
            except Exception as e:
                print(f"Error saving exposure: {e}")
                continue
        
        db.commit()
        
        result['saved_to_database'] = saved_count
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.post("/manual")
async def create_manual_exposure(request: ManualExposureRequest, db: Session = Depends(get_db)):
    """
    POST /api/exposure-data/manual
    
    Create a single exposure record manually
    """
    try:
        # Validate the request using the service
        result = data_service.create_manual_exposure(
            company_id=request.company_id,
            reference_number=request.reference_number,
            currency_pair=request.currency_pair,
            amount=request.amount,
            start_date=request.start_date,
            end_date=request.end_date,
            description=request.description,
            rate=request.rate
        )
        
        if not result['success']:
            raise HTTPException(status_code=400, detail=result.get('errors', ['Validation failed']))
        
        # Get the validated exposure data
        exp_data = result['exposure']
        
        # Get live FX rate
        rate = get_live_fx_rate(exp_data['from_currency'], exp_data['to_currency'])
        usd_value = exp_data['amount'] * rate
        
        # Calculate risk level
        risk = calculate_risk_level(usd_value, exp_data['period_days'])
        
        # Parse dates if provided
        start_date = None
        end_date = None
        if exp_data.get('start_date'):
            start_date = datetime.strptime(exp_data['start_date'], '%Y-%m-%d').date()
        if exp_data.get('end_date'):
            end_date = datetime.strptime(exp_data['end_date'], '%Y-%m-%d').date()
        
        # Create database record
        db_exposure = Exposure(
            company_id=exp_data['company_id'],
            from_currency=exp_data['from_currency'],
            to_currency=exp_data['to_currency'],
            amount=exp_data['amount'],
            start_date=start_date,
            end_date=end_date,
            initial_rate=rate,
            current_rate=rate,
            current_value_usd=usd_value,
            settlement_period=exp_data['period_days'],
            risk_level=risk,
            description=exp_data.get('description', '')
        )
        
        db.add(db_exposure)
        db.commit()
        db.refresh(db_exposure)
        
        # Return success with database ID
        return {
            'success': True,
            'exposure': {
                'id': db_exposure.id,
                'company_id': db_exposure.company_id,
                'reference_number': exp_data['reference_number'],
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
                'created_at': db_exposure.created_at.isoformat()
            },
            'message': f'Exposure {exp_data["reference_number"]} created successfully'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.post("/batch-manual")
async def create_batch_exposures(request: BatchExposureRequest, db: Session = Depends(get_db)):
    """
    POST /api/exposure-data/batch-manual
    
    Create multiple exposure records at once
    """
    try:
        company_id = request.company_id
        exposures_data = request.exposures
        
        created = []
        errors = []
        
        for idx, exp_data in enumerate(exposures_data):
            try:
                result = data_service.create_manual_exposure(
                    company_id=company_id,
                    reference_number=exp_data.get('reference_number', ''),
                    currency_pair=exp_data.get('currency_pair', ''),
                    amount=exp_data.get('amount', 0),
                    start_date=exp_data.get('start_date', ''),
                    end_date=exp_data.get('end_date', ''),
                    description=exp_data.get('description'),
                    rate=exp_data.get('rate')
                )
                
                if result['success']:
                    validated_exp = result['exposure']
                    
                    # Get live FX rate
                    rate = get_live_fx_rate(validated_exp['from_currency'], validated_exp['to_currency'])
                    usd_value = validated_exp['amount'] * rate
                    
                    # Calculate risk level
                    risk = calculate_risk_level(usd_value, validated_exp['period_days'])
                    
                    # Parse dates if provided
                    start_date = None
                    end_date = None
                    if validated_exp.get('start_date'):
                        start_date = datetime.strptime(validated_exp['start_date'], '%Y-%m-%d').date()
                    if validated_exp.get('end_date'):
                        end_date = datetime.strptime(validated_exp['end_date'], '%Y-%m-%d').date()
                    
                    # Create database record
                    db_exposure = Exposure(
                        company_id=company_id,
                        from_currency=validated_exp['from_currency'],
                        to_currency=validated_exp['to_currency'],
                        amount=validated_exp['amount'],
                        start_date=start_date,
                        end_date=end_date,
                        initial_rate=rate,
                        current_rate=rate,
                        current_value_usd=usd_value,
                        settlement_period=validated_exp['period_days'],
                        risk_level=risk,
                        description=validated_exp.get('description', '')
                    )
                    
                    db.add(db_exposure)
                    db.flush()
                    
                    created.append({
                        'id': db_exposure.id,
                        'reference_number': validated_exp['reference_number']
                    })
                else:
                    errors.append({
                        'index': idx,
                        'reference': exp_data.get('reference_number', 'Unknown'),
                        'errors': result['errors']
                    })
            except Exception as e:
                errors.append({
                    'index': idx,
                    'reference': exp_data.get('reference_number', 'Unknown'),
                    'errors': [str(e)]
                })
        
        if len(created) > 0:
            db.commit()
        
        return {
            'success': len(errors) == 0,
            'created_count': len(created),
            'error_count': len(errors),
            'created': created,
            'errors': errors
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


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
    
    Get all exposures for a company with optional date filtering
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


@router.get("/exposure/{exposure_id}")
async def get_exposure_detail(exposure_id: int, db: Session = Depends(get_db)):
    """
    GET /api/exposure-data/exposure/{exposure_id}
    
    Get details of a specific exposure
    """
    try:
        exposure = db.query(Exposure).filter(Exposure.id == exposure_id).first()
        
        if not exposure:
            raise HTTPException(status_code=404, detail="Exposure not found")
        
        return {
            'success': True,
            'exposure': {
                'id': exposure.id,
                'company_id': exposure.company_id,
                'from_currency': exposure.from_currency,
                'to_currency': exposure.to_currency,
                'amount': exposure.amount,
                'initial_rate': exposure.initial_rate,
                'current_rate': exposure.current_rate,
                'current_value_usd': exposure.current_value_usd,
                'settlement_period': exposure.settlement_period,
                'risk_level': exposure.risk_level.value if exposure.risk_level else 'Unknown',
                'description': exposure.description,
                'created_at': exposure.created_at.isoformat() if exposure.created_at else None
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.put("/exposure/{exposure_id}")
async def update_exposure(exposure_id: int, request: ExposureUpdateRequest, db: Session = Depends(get_db)):
    """
    PUT /api/exposure-data/exposure/{exposure_id}
    
    Update an existing exposure
    """
    try:
        exposure = db.query(Exposure).filter(Exposure.id == exposure_id).first()
        
        if not exposure:
            raise HTTPException(status_code=404, detail="Exposure not found")
        
        # Update fields if provided
        if request.amount is not None:
            exposure.amount = request.amount
            exposure.current_value_usd = request.amount * exposure.current_rate
        
        if request.description is not None:
            exposure.description = request.description
        
        exposure.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(exposure)
        
        return {
            'success': True,
            'message': 'Exposure updated successfully',
            'exposure': {
                'id': exposure.id,
                'amount': exposure.amount,
                'description': exposure.description,
                'updated_at': exposure.updated_at.isoformat()
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.delete("/exposure/{exposure_id}")
async def delete_exposure(exposure_id: int, db: Session = Depends(get_db)):
    """
    DELETE /api/exposure-data/exposure/{exposure_id}
    
    Delete an exposure
    """
    try:
        exposure = db.query(Exposure).filter(Exposure.id == exposure_id).first()
        
        if not exposure:
            raise HTTPException(status_code=404, detail="Exposure not found")
        
        db.delete(exposure)
        db.commit()
        
        return {
            'success': True,
            'message': f'Exposure {exposure_id} deleted successfully'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.get("/template/{format}")
async def download_template(format: str):
    """
    GET /api/exposure-data/template/{format}
    
    Download a template file
    
    Formats: csv, xlsx
    """
    try:
        if format not in ['csv', 'xlsx']:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format: {format}. Use csv or xlsx"
            )
        
        # Generate template
        template_content = data_service.generate_template(format)
        
        # Set appropriate mimetype
        mimetype = 'text/csv' if format == 'csv' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        filename = f'exposure_template.{format}'
        
        return StreamingResponse(
            io.BytesIO(template_content),
            media_type=mimetype,
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.post("/validate")
async def validate_data(request: ManualExposureRequest):
    """
    POST /api/exposure-data/validate
    
    Validate exposure data without saving
    """
    try:
        result = data_service.create_manual_exposure(
            company_id=request.company_id,
            reference_number=request.reference_number,
            currency_pair=request.currency_pair,
            amount=request.amount,
            start_date=request.start_date,
            end_date=request.end_date,
            description=request.description,
            rate=request.rate
        )
        
        return {
            'is_valid': result['success'],
            'errors': result.get('errors', []),
            'exposure': result.get('exposure') if result['success'] else None
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.get("/summary/{company_id}")
async def get_exposure_summary(
    company_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    GET /api/exposure-data/summary/{company_id}
    
    Get summary statistics for company exposures
    """
    try:
        # Get exposures from database
        exposures_db = db.query(Exposure).filter(Exposure.company_id == company_id).all()
        
        # Convert to list format for summary calculation
        exposures = []
        for exp in exposures_db:
            exposures.append({
                'from_currency': exp.from_currency,
                'to_currency': exp.to_currency,
                'amount': exp.amount,
                'period_days': exp.settlement_period,
                'start_date': exp.created_at.strftime('%Y-%m-%d') if exp.created_at else '',
                'end_date': (exp.created_at + timedelta(days=exp.settlement_period)).strftime('%Y-%m-%d') if exp.created_at else ''
            })
        
        # Calculate summary
        if exposures:
            summary = data_service._calculate_summary(exposures)
        else:
            summary = {
                'total_exposures': 0,
                'total_amount': 0,
                'unique_currencies': 0
            }
        
        return {
            'success': True,
            'company_id': company_id,
            'summary': summary
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")