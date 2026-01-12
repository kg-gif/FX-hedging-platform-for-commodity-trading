"""
BIRK FX Phase 2B Extended - Data Import Routes (FastAPI Version)
FastAPI endpoints for file uploads and manual exposure data entry
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import io
import sys
import os

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
    company_id: int = Form(...)
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
        
        # In production, save exposures to database
        # for exposure in result['exposures']:
        #     db.insert('exposures', exposure)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.post("/manual")
async def create_manual_exposure(request: ManualExposureRequest):
    """
    POST /api/exposure-data/manual
    
    Create a single exposure record manually
    """
    try:
        # Create exposure
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
        
        # In production, save to database
        # exposure_id = db.insert('exposures', result['exposure'])
        # result['exposure']['id'] = exposure_id
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.post("/batch-manual")
async def create_batch_exposures(request: BatchExposureRequest):
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
                created.append(result['exposure'])
            else:
                errors.append({
                    'index': idx,
                    'reference': exp_data.get('reference_number', 'Unknown'),
                    'errors': result['errors']
                })
        
        return {
            'success': len(errors) == 0,
            'created_count': len(created),
            'error_count': len(errors),
            'created': created,
            'errors': errors
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.get("/exposures/{company_id}")
async def get_company_exposures(
    company_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    status: str = Query(default="active")
):
    """
    GET /api/exposure-data/exposures/{company_id}
    
    Get all exposures for a company with optional date filtering
    """
    try:
        # Get exposures
        if start_date and end_date:
            exposures = data_service.get_exposures_by_period(
                company_id=company_id,
                start_date=start_date,
                end_date=end_date
            )
        else:
            # In production, query from database
            exposures = []  # Mock empty for now
        
        # Apply filters
        if currency:
            exposures = [exp for exp in exposures if exp['currency_pair'] == currency.upper()]
        
        if status:
            exposures = [exp for exp in exposures if exp['status'] == status]
        
        return {
            'success': True,
            'company_id': company_id,
            'exposures': exposures,
            'count': len(exposures),
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
async def get_exposure_detail(exposure_id: int):
    """
    GET /api/exposure-data/exposure/{exposure_id}
    
    Get details of a specific exposure
    """
    try:
        # In production, query from database
        # exposure = db.query("SELECT * FROM exposures WHERE id = ?", [exposure_id])
        
        # Mock data
        exposure = {
            'id': exposure_id,
            'company_id': 1,
            'reference_number': 'REF-2025-001',
            'currency_pair': 'EURUSD',
            'amount': 1000000,
            'start_date': '2025-01-15',
            'end_date': '2025-04-15',
            'period_days': 90,
            'status': 'active'
        }
        
        return {
            'success': True,
            'exposure': exposure
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.put("/exposure/{exposure_id}")
async def update_exposure(exposure_id: int, request: ExposureUpdateRequest):
    """
    PUT /api/exposure-data/exposure/{exposure_id}
    
    Update an existing exposure
    """
    try:
        # In production, update database
        # db.update('exposures', exposure_id, request.dict(exclude_none=True))
        
        # Mock response
        updated_exposure = {
            'id': exposure_id,
            'updated_at': datetime.now().isoformat(),
            **request.dict(exclude_none=True)
        }
        
        return {
            'success': True,
            'message': 'Exposure updated successfully',
            'exposure': updated_exposure
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.delete("/exposure/{exposure_id}")
async def delete_exposure(exposure_id: int):
    """
    DELETE /api/exposure-data/exposure/{exposure_id}
    
    Delete an exposure
    """
    try:
        # In production, delete from database
        # db.delete('exposures', exposure_id)
        
        return {
            'success': True,
            'message': f'Exposure {exposure_id} deleted successfully'
        }
        
    except Exception as e:
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
    end_date: Optional[str] = Query(None)
):
    """
    GET /api/exposure-data/summary/{company_id}
    
    Get summary statistics for company exposures
    """
    try:
        # Get exposures
        if start_date and end_date:
            exposures = data_service.get_exposures_by_period(
                company_id, start_date, end_date
            )
        else:
            exposures = []  # Mock
        
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
