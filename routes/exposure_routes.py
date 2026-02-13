"""
AP Exposure Upload Routes
Handles CSV upload and classification of accounts payable exposures
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
import sys
import os

# Add parent directory to path to import services
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from services import exposure_service
from database import get_db

router = APIRouter(
    prefix="/api/exposures",
    tags=["exposures"]
)


@router.post("/upload")
async def upload_exposures(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    uploaded_by: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Upload AP data CSV and auto-classify exposures
    
    **Business Logic:**
    1. Parses CSV with Norwegian column headers
    2. Auto-classifies each exposure (Committed/Probable/Forecast)
    3. Identifies recurring suppliers (100+ invoices)
    4. Stores in database with audit trail
    
    **Returns:**
    - summary: Currency breakdown, classification stats
    - preview: First 10 classified exposures
    
    **Example Request:**
```bash
    curl -X POST http://localhost:8000/api/exposures/upload \
      -F "file=@data.csv" \
      -F "tenant_id=uuid" \
      -F "uploaded_by=user@company.com"
```
    """
    try:
        # 1. Validate file type
        if not file.filename.endswith('.csv'):
            raise HTTPException(
                status_code=400,
                detail="File must be a CSV (.csv extension)"
            )
        
        # 2. Read file content
        content = await file.read()
        
        if len(content) == 0:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty"
            )
        
        # 3. Parse CSV
        df = await exposure_service.parse_csv(content)
        
        if df.empty:
            raise HTTPException(
                status_code=400,
                detail="CSV contains no valid data rows"
            )
        
        # 4. Process and classify exposures
        exposures, summary = await exposure_service.process_exposures(
            df=df,
            tenant_id=tenant_id,
            uploaded_by=uploaded_by,
            source_file=file.filename,
            db=db
        )
        
        # 5. Bulk insert to database
        rows_inserted = await exposure_service.bulk_insert_exposures(exposures, db)
        
        # 6. Return summary + preview
        return {
            "success": True,
            "message": f"Successfully processed {rows_inserted} exposures",
            "summary": summary,
            "preview": exposures[:10]  # First 10 rows
        }
        
    except ValueError as e:
        # Expected errors (bad data, parsing issues)
        raise HTTPException(status_code=400, detail=str(e))
        
    except Exception as e:
        # Unexpected errors
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/summary/{tenant_id}")
async def get_exposure_summary(
    tenant_id: str,
    db: Session = Depends(get_db)
):
    """
    Get summary of all exposures for a tenant
    
    **Returns:**
    - Total exposure by currency
    - Classification breakdown
    - Recurring supplier count
    """
    # TODO: Implement summary query
    return {"message": "Coming in v1.1"}