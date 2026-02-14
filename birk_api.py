"""
BIRK FX Risk Management Platform - Main API
Backend service for FX exposure management and hedging recommendations
"""

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
import requests

# Database configuration
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://birk_user:XbCWbLZ70FhdgPrho9J3rlNO1AVhohvN@dpg-d4sl43qli9vc73eiem90-a.frankfurt-postgres.render.com/birk_db?sslmode=require'
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# FastAPI app
app = FastAPI(
    title="BIRK FX Risk Management API",
    description="AI-powered FX hedging advisor for mid-market corporates",
    version="3.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============================================
# PYDANTIC MODELS
# ============================================

class ExposureCreate(BaseModel):
    company_id: int
    reference: Optional[str] = None
    from_currency: str
    to_currency: str
    amount: float
    instrument_type: Optional[str] = "Spot"
    exposure_type: Optional[str] = "payable"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget_rate: Optional[float] = None
    max_loss_limit: Optional[float] = None
    target_profit: Optional[float] = None
    hedge_ratio_policy: Optional[float] = 1.0
    description: Optional[str] = None

# ============================================
# HEALTH CHECK
# ============================================

@app.get("/")
def health_check():
    return {
        "status": "alive",
        "version": "3.0.0",
        "message": "BIRK FX Risk Management API"
    }

# ============================================
# COMPANY ENDPOINTS
# ============================================

@app.get("/companies")
def get_companies(db: Session = Depends(get_db)):
    """Get all companies"""
    result = db.execute(text("SELECT id, name, base_currency FROM companies")).fetchall()
    companies = [{"id": r[0], "name": r[1], "base_currency": r[2]} for r in result]
    return companies

@app.post("/companies/{company_id}/refresh-rates")
def refresh_rates(company_id: int, db: Session = Depends(get_db)):
    """Refresh FX rates for all exposures of a company"""
    try:
        # Get all exposures for this company
        exposures = db.execute(
            text("SELECT id, from_currency, to_currency FROM exposures WHERE company_id = :company_id"),
            {"company_id": company_id}
        ).fetchall()
        
        # Fetch rates from exchangerate-api.com (free tier)
        updated_count = 0
        for exp in exposures:
            exp_id, from_curr, to_curr = exp[0], exp[1], exp[2]
            
            try:
                # Free API: https://www.exchangerate-api.com/
                url = f"https://api.exchangerate-api.com/v4/latest/{from_curr}"
                response = requests.get(url, timeout=5)
                data = response.json()
                
                if "rates" in data and to_curr in data["rates"]:
                    rate = data["rates"][to_curr]
                    
                    # Update exposure with new rate
                    db.execute(
                        text("""
                            UPDATE exposures 
                            SET current_rate = :rate
                            WHERE id = :id
                        """),
                        {"rate": rate, "id": exp_id}
                    )
                    updated_count += 1
            except Exception as e:
                print(f"Error fetching rate for {from_curr}/{to_curr}: {e}")
                continue
        
        db.commit()
        
        return {
            "success": True,
            "updated": updated_count,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# EXPOSURE ENDPOINTS
# ============================================

@app.get("/exposures")
def get_exposures(company_id: int, db: Session = Depends(get_db)):
    """Get all exposures for a company"""
    result = db.execute(
        text("SELECT * FROM exposures WHERE company_id = :company_id ORDER BY id DESC"),
        {"company_id": company_id}
    ).fetchall()
    
    exposures = []
    for r in result:
        exposures.append({
            "id": r[0],
            "company_id": r[1],
            "from_currency": r[2],
            "to_currency": r[3],
            "amount": float(r[4]) if r[4] else 0,
            "instrument_type": r[5],
            "exposure_type": r[6],
            "start_date": r[7].isoformat() if r[7] else None,
            "end_date": r[8].isoformat() if r[8] else None,
            "reference": r[9],
            "description": r[10],
            "budget_rate": float(r[11]) if r[11] else None,
            "current_rate": float(r[12]) if r[12] else None,
            "max_loss_limit": float(r[13]) if r[13] else None,
            "target_profit": float(r[14]) if r[14] else None,
            "hedge_ratio_policy": float(r[15]) if r[15] else 1.0,
            "current_pnl": float(r[16]) if r[16] else None,
            "hedged_amount": float(r[17]) if r[17] else None,
            "unhedged_amount": float(r[18]) if r[18] else None,
            "pnl_status": r[19],
        })
    
    return exposures

@app.post("/api/exposure-data/manual")
def create_manual_exposure(exposure: ExposureCreate, db: Session = Depends(get_db)):
    """Create a new exposure manually"""
    try:
        db.execute(text("""
            INSERT INTO exposures (
                company_id, reference, from_currency, to_currency, amount,
                instrument_type, exposure_type, start_date, end_date,
                budget_rate, max_loss_limit, target_profit, 
                hedge_ratio_policy, description
            ) VALUES (
                :company_id, :reference, :from_currency, :to_currency, :amount,
                :instrument_type, :exposure_type, :start_date, :end_date,
                :budget_rate, :max_loss_limit, :target_profit,
                :hedge_ratio_policy, :description
            )
        """), {
            "company_id": exposure.company_id,
            "reference": exposure.reference,
            "from_currency": exposure.from_currency,
            "to_currency": exposure.to_currency,
            "amount": exposure.amount,
            "instrument_type": exposure.instrument_type,
            "exposure_type": exposure.exposure_type,
            "start_date": exposure.start_date,
            "end_date": exposure.end_date,
            "budget_rate": exposure.budget_rate,
            "max_loss_limit": exposure.max_loss_limit,
            "target_profit": exposure.target_profit,
            "hedge_ratio_policy": exposure.hedge_ratio_policy,
            "description": exposure.description
        })
        
        db.commit()
        
        return {
            "success": True,
            "message": f"Exposure {exposure.reference} created successfully"
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/exposure-data/exposures/{exposure_id}")
def update_exposure(exposure_id: int, exposure: ExposureCreate, db: Session = Depends(get_db)):
    """Update an existing exposure"""
    try:
        db.execute(text("""
            UPDATE exposures SET
                amount = :amount,
                description = :description,
                budget_rate = :budget_rate,
                hedge_ratio_policy = :hedge_ratio_policy
            WHERE id = :id
        """), {
            "id": exposure_id,
            "amount": exposure.amount,
            "description": exposure.description,
            "budget_rate": exposure.budget_rate,
            "hedge_ratio_policy": exposure.hedge_ratio_policy
        })
        
        db.commit()
        return {"success": True, "message": "Exposure updated"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/exposure-data/exposures/{exposure_id}")
def delete_exposure(exposure_id: int, db: Session = Depends(get_db)):
    """Delete an exposure"""
    try:
        db.execute(text("DELETE FROM exposures WHERE id = :id"), {"id": exposure_id})
        db.commit()
        return {"success": True, "message": "Exposure deleted"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# POLICY ENDPOINTS (NEW)
# ============================================

@app.get("/setup/create-policy-table")
async def setup_policy_table():
    """One-time setup: Creates policy table and inserts Conservative policy"""
    db = SessionLocal()
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS hedging_policies (
                id SERIAL PRIMARY KEY,
                company_id INTEGER NOT NULL,
                policy_name VARCHAR(50) NOT NULL,
                policy_type VARCHAR(20) NOT NULL,
                hedge_ratio_over_5m NUMERIC(3,2) DEFAULT 0.85,
                hedge_ratio_1m_to_5m NUMERIC(3,2) DEFAULT 0.70,
                hedge_ratio_under_1m NUMERIC(3,2) DEFAULT 0.50,
                material_exposure_threshold NUMERIC(15,2) DEFAULT 1000000,
                de_minimis_threshold NUMERIC(15,2) DEFAULT 500000,
                budget_breach_threshold_pct NUMERIC(5,4) DEFAULT 0.05,
                opportunistic_trigger_threshold NUMERIC(5,4) DEFAULT 0.05,
                trailing_stop_trigger NUMERIC(5,4) DEFAULT 0.03,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        
        db.execute(text("""
            INSERT INTO hedging_policies (company_id, policy_name, policy_type) 
            VALUES (1, 'Conservative', 'CONSERVATIVE')
            ON CONFLICT DO NOTHING
        """))
        
        db.commit()
        result = db.execute(text("SELECT * FROM hedging_policies WHERE company_id = 1")).fetchone()
        
        return {
            "success": True,
            "message": "Policy table created successfully!",
            "policy": {
                "id": result[0],
                "company_id": result[1],
                "name": result[2],
                "type": result[3]
            }
        }
        
    except Exception as e:
        db.rollback()
        return {"success": False, "message": f"Error: {str(e)}"}
    finally:
        db.close()

@app.get("/api/policies/{company_id}")
async def get_policy(company_id: int):
    """Get active hedging policy for a company"""
    db = SessionLocal()
    try:
        result = db.execute(
            text("SELECT * FROM hedging_policies WHERE company_id = :id AND is_active = TRUE"),
            {"id": company_id}
        ).fetchone()
        
        if result:
            return {
                "success": True,
                "policy": {
                    "id": result[0],
                    "company_id": result[1],
                    "name": result[2],
                    "type": result[3],
                    "hedge_ratio_large": float(result[4]),
                    "hedge_ratio_medium": float(result[5]),
                    "hedge_ratio_small": float(result[6])
                }
            }
        
        return {"success": False, "policy": None}
        
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}", "policy": None}
    finally:
        db.close()

# ============================================
# STARTUP EVENT
# ============================================

@app.on_event("startup")
async def startup_event():
    """Initialize database and seed demo data on startup"""
    db = SessionLocal()
    try:
        # Check if companies table exists and has data
        result = db.execute(text("SELECT COUNT(*) FROM companies")).fetchone()
        company_count = result[0] if result else 0
        
        if company_count == 0:
            # Create default company
            db.execute(text("""
                INSERT INTO companies (id, name, base_currency)
                VALUES (1, 'BIRK Commodities A/S', 'USD')
                ON CONFLICT (id) DO NOTHING
            """))
            db.commit()
            print("✅ Default company created")
        else:
            print(f"ℹ️ Database already contains {company_count} companies")
        
        # Verify company name
        result = db.execute(text("SELECT name FROM companies WHERE id = 1")).fetchone()
        if result and result[0] != "BIRK Commodities A/S":
            db.execute(text("""
                UPDATE companies 
                SET name = 'BIRK Commodities A/S'
                WHERE id = 1
            """))
            db.commit()
            print("✅ Company name updated")
        else:
            print("✅ Company name is already correct: BIRK Commodities A/S")
            
    except Exception as e:
        print(f"❌ Error during startup: {e}")
        db.rollback()
    finally:
        db.close()

# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)