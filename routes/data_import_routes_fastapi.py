"""
BIRK FX Phase 2B Extended - Data Import Routes (FastAPI Version)
FastAPI endpoints for file uploads and manual exposure data entry
NOW WITH CRUD: Create, Read, Update, Delete
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
import io
import csv
import os

from models import Exposure, Company, RiskLevel
from database import SessionLocal, get_live_fx_rate, calculate_risk_level

# ── Inline auth ───────────────────────────────────────────────────────────────
_security = HTTPBearer()

def _get_token_payload(credentials: HTTPAuthorizationCredentials = Depends(_security)) -> dict:
    from jose import JWTError, jwt
    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

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
    amount_currency: Optional[str] = None  # Which currency the amount is in (defaults to from_currency)



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
    db: Session = Depends(get_db),
    payload: dict = Depends(_get_token_payload),
):
    """
    POST /api/exposure-data/upload
    Parse a CSV file and insert rows as FX exposures.

    Expected CSV columns (header row required):
      reference_number, currency_pair, amount, start_date, end_date,
      description (optional), budget_rate (optional), exposure_type (optional)

    currency_pair format: EURUSD or EUR/USD
    date format: YYYY-MM-DD
    """
    try:
        # Verify company exists and caller can access it
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail=f"Company {company_id} not found")

        # Enforce multi-tenancy — non-superadmin users can only upload to their own company
        role = payload.get("role", "")
        token_cid = payload.get("company_id")
        if role not in ("superadmin", "admin", "company_admin") and int(token_cid or 0) != company_id:
            raise HTTPException(status_code=403, detail="Access denied")

        contents = await file.read()
        filename  = file.filename or "upload.csv"

        # Decode bytes — try UTF-8 with BOM fallback
        try:
            text = contents.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = contents.decode("latin-1")

        reader = csv.DictReader(io.StringIO(text))

        # Normalise header names (lowercase, strip whitespace)
        if reader.fieldnames is None:
            raise HTTPException(status_code=400, detail="Empty file or missing header row")

        required_cols = {"reference_number", "currency_pair", "amount", "start_date", "end_date"}
        headers = {h.strip().lower().replace(" ", "_") for h in reader.fieldnames}
        missing = required_cols - headers
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(sorted(missing))}"
            )

        saved     = 0
        warnings  = []
        total_amt = 0.0
        currencies: set = set()
        periods: list   = []

        from sqlalchemy import text as _text

        for i, raw_row in enumerate(reader, start=2):  # row 1 is header
            # Normalise keys
            row = {k.strip().lower().replace(" ", "_"): (v.strip() if v else "") for k, v in raw_row.items()}

            # Skip fully empty rows
            if not any(row.values()):
                continue

            try:
                # Currency pair
                pair = row["currency_pair"].upper().replace("/", "").replace("-", "")
                if len(pair) != 6:
                    warnings.append(f"Row {i}: invalid currency_pair '{row['currency_pair']}' — skipped")
                    continue
                from_currency = pair[:3]
                to_currency   = pair[3:]

                # Amount
                amount_str = row["amount"].replace(",", "")
                amount = float(amount_str)
                if amount <= 0:
                    warnings.append(f"Row {i}: amount must be > 0 — skipped")
                    continue

                # Dates
                start_date = datetime.strptime(row["start_date"], "%Y-%m-%d").date()
                end_date   = datetime.strptime(row["end_date"],   "%Y-%m-%d").date()
                if end_date <= start_date:
                    warnings.append(f"Row {i}: end_date must be after start_date — skipped")
                    continue
                period_days = (end_date - start_date).days

                # Optional fields
                description   = row.get("description", "") or ""
                reference     = row.get("reference_number", f"IMP-{i}")
                exposure_type = (row.get("exposure_type", "payable") or "payable").lower()
                budget_rate_str = row.get("budget_rate", "")
                budget_rate     = float(budget_rate_str) if budget_rate_str else None

                # FX rate (live)
                try:
                    rate = get_live_fx_rate(from_currency, to_currency)
                except Exception:
                    rate = 1.0
                    warnings.append(f"Row {i}: could not fetch live rate for {pair} — defaulted to 1.0")

                usd_value = amount * rate
                risk      = calculate_risk_level(usd_value, period_days)

                # Insert exposure
                db.execute(_text("""
                    INSERT INTO exposures
                      (company_id, from_currency, to_currency, amount, amount_currency,
                       start_date, end_date, initial_rate, current_rate, current_value_usd,
                       settlement_period, risk_level, description, budget_rate,
                       reference, exposure_type, instrument_type, is_active, created_at, updated_at)
                    VALUES
                      (:cid, :from_ccy, :to_ccy, :amount, :amount_ccy,
                       :start_date, :end_date, :rate, :rate, :usd_value,
                       :period, :risk, :desc, :budget_rate,
                       :reference, :exp_type, 'Forward', true, NOW(), NOW())
                """), {
                    "cid":        company_id,
                    "from_ccy":   from_currency,
                    "to_ccy":     to_currency,
                    "amount":     amount,
                    "amount_ccy": from_currency,
                    "start_date": start_date,
                    "end_date":   end_date,
                    "rate":       rate,
                    "usd_value":  usd_value,
                    "period":     period_days,
                    "risk":       risk.value,
                    "desc":       description,
                    "budget_rate": budget_rate,
                    "reference":  reference,
                    "exp_type":   exposure_type,
                })

                saved     += 1
                total_amt += amount
                currencies.add(from_currency)
                periods.append(period_days)

            except (ValueError, KeyError) as row_err:
                warnings.append(f"Row {i}: {row_err} — skipped")
                continue

        db.commit()
        print(f"[upload] company_id={company_id} — {saved} exposures imported from '{filename}'")

        avg_period = round(sum(periods) / len(periods)) if periods else 0

        return {
            "success":   True,
            "filename":  filename,
            "row_count": saved,
            "summary": {
                "total_exposures":   saved,
                "total_amount":      round(total_amt, 2),
                "unique_currencies": len(currencies),
                "avg_period_days":   avg_period,
            },
            "validation_warnings": warnings,
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/template/{format}")
def download_template(format: str):
    """
    GET /api/exposure-data/template/csv   — CSV template
    GET /api/exposure-data/template/xlsx  — same CSV content, xlsx MIME
    """
    template_csv = (
        "reference_number,currency_pair,amount,start_date,end_date,description,budget_rate,exposure_type\n"
        "EXP-001,EUR/USD,1000000,2025-01-15,2025-06-30,European supplier payment,1.08,payable\n"
        "EXP-002,GBP/USD,500000,2025-02-01,2025-08-01,UK revenue receivable,1.27,receivable\n"
        "EXP-003,USD/NOK,3000000,2025-03-01,2025-09-01,Norwegian gas contract,,payable\n"
    )
    fmt = format.lower()
    if fmt == "csv":
        media_type = "text/csv"
        filename   = "exposure_template.csv"
    elif fmt in ("xlsx", "xls"):
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename   = f"exposure_template.{fmt}"
    else:
        raise HTTPException(status_code=400, detail="Format must be csv or xlsx")

    return StreamingResponse(
        io.BytesIO(template_csv.encode("utf-8")),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

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
            hedge_ratio_policy=request.hedge_ratio_policy if request.hedge_ratio_policy else 1.0,
            instrument_type=request.instrument_type or 'Spot'
        )
        
        db.add(db_exposure)
        db.commit()
        db.refresh(db_exposure)

        # Save fields not on the ORM model via raw SQL (reference, exposure_type, amount_currency)
        from sqlalchemy import text as _text
        effective_amount_currency = (request.amount_currency or from_currency).upper()
        db.execute(_text("""
            UPDATE exposures
            SET reference        = :reference,
                exposure_type    = :exposure_type,
                amount_currency  = :amount_currency
            WHERE id = :id
        """), {
            "reference":       request.reference_number,
            "exposure_type":   getattr(request, 'exposure_type', 'payable') or 'payable',
            "amount_currency": effective_amount_currency,
            "id":              db_exposure.id,
        })
        db.commit()

        # Capture inception rate in the background (non-blocking)
        import asyncio as _asyncio
        from datetime import date as _date
        _asyncio.create_task(_capture_inception_rate(
            db_exposure.id, from_currency, to_currency, start_date_obj, rate
        ))

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



# NOTE: PUT /exposures/{exposure_id} is handled by the app-level endpoint in birk_api.py
# which supports budget_rate, instrument_type, exposure_type, from_currency, to_currency
# and enforces authentication. Do not add a duplicate router-level PUT here.


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


async def _capture_inception_rate(exposure_id: int, from_currency: str, to_currency: str, start_date, live_spot_rate: float):
    """
    Capture the inception rate for a newly created exposure.
    - Past date  → fetch ECB historical close rate
    - Today      → use the live spot already obtained at creation time
    - Future     → mark as 'ecb_scheduled' for the cron job to fill later
    """
    from datetime import date as _date
    from database import SessionLocal as _SessionLocal
    from sqlalchemy import text as _text
    from services.ecb_rates import get_cross_rate

    db = _SessionLocal()
    try:
        today = _date.today()

        if start_date > today:
            db.execute(_text("""
                UPDATE exposures SET inception_rate_source = 'ecb_scheduled' WHERE id = :id
            """), {"id": exposure_id})
            db.commit()
            return

        if start_date == today:
            rate   = live_spot_rate
            source = "live_spot"
        else:
            try:
                rate   = await get_cross_rate(from_currency, to_currency, start_date)
                source = "ecb_historical"
            except Exception as e:
                print(f"[inception] WARNING: ECB rate unavailable for {from_currency}/{to_currency} {start_date}: {e}")
                return

        db.execute(_text("""
            UPDATE exposures
            SET inception_rate = :rate,
                inception_rate_date = :dt,
                inception_rate_source = :src
            WHERE id = :id
        """), {"rate": rate, "dt": start_date, "src": source, "id": exposure_id})
        db.commit()
        print(f"[inception] captured {from_currency}/{to_currency} {start_date}: {rate:.6f} ({source})")
    except Exception as e:
        print(f"[inception] ERROR capturing for exposure {exposure_id}: {e}")
    finally:
        db.close()