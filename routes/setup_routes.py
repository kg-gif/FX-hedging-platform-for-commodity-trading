"""
Database Setup Script for BIRK FX Platform
ONE-TIME USE: Creates all required tables
Run this once, then delete the endpoint for security
"""

from fastapi import APIRouter, HTTPException
from sqlalchemy import text
import os

router = APIRouter()

# SQL statements to create all tables
SETUP_SQL = """
-- 1. EXPOSURES TABLE
CREATE TABLE IF NOT EXISTS exposures (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    reference_number VARCHAR(50) NOT NULL,
    currency_pair VARCHAR(10) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    period_days INTEGER,
    start_rate DECIMAL(10,6),
    description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exposures_company_id ON exposures(company_id);
CREATE INDEX IF NOT EXISTS idx_exposures_currency_pair ON exposures(currency_pair);
CREATE INDEX IF NOT EXISTS idx_exposures_status ON exposures(status);
CREATE INDEX IF NOT EXISTS idx_exposures_end_date ON exposures(end_date);

-- 2. HEDGING RECOMMENDATIONS TABLE
CREATE TABLE IF NOT EXISTS hedging_recommendations (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    exposure_id INTEGER REFERENCES exposures(id) ON DELETE CASCADE,
    recommended_ratio DECIMAL(5,2),
    var_95 DECIMAL(15,2),
    var_99 DECIMAL(15,2),
    strategy_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recommendations_company_id ON hedging_recommendations(company_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_exposure_id ON hedging_recommendations(exposure_id);

-- 3. ACTIVE HEDGES TABLE
CREATE TABLE IF NOT EXISTS active_hedges (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    exposure_id INTEGER REFERENCES exposures(id) ON DELETE SET NULL,
    currency_pair VARCHAR(10) NOT NULL,
    hedge_type VARCHAR(20) NOT NULL,
    notional_amount DECIMAL(15,2) NOT NULL,
    hedge_ratio DECIMAL(5,2),
    contract_rate DECIMAL(10,6),
    start_date DATE,
    maturity_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_active_hedges_company_id ON active_hedges(company_id);
CREATE INDEX IF NOT EXISTS idx_active_hedges_exposure_id ON active_hedges(exposure_id);
CREATE INDEX IF NOT EXISTS idx_active_hedges_status ON active_hedges(status);
CREATE INDEX IF NOT EXISTS idx_active_hedges_maturity ON active_hedges(maturity_date);

-- 4. SCENARIO RESULTS TABLE
CREATE TABLE IF NOT EXISTS scenario_results (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    scenario_type VARCHAR(50),
    hedge_ratio DECIMAL(5,2),
    rate_change_pct DECIMAL(5,2),
    unhedged_pnl DECIMAL(15,2),
    hedged_pnl DECIMAL(15,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scenario_results_company_id ON scenario_results(company_id);

-- 5. UPDATE TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_exposures_updated_at BEFORE UPDATE ON exposures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
"""

DEMO_DATA_SQL = """
-- Insert sample exposures for testing
INSERT INTO exposures (company_id, reference_number, currency_pair, amount, start_date, end_date, period_days, start_rate, description) VALUES
(1, 'EXP-2026-001', 'EURUSD', 500000.00, '2026-01-01', '2026-06-30', 180, 1.0850, 'European supplier payment - 500k EUR'),
(1, 'EXP-2026-002', 'GBPUSD', 250000.00, '2026-01-15', '2026-03-15', 60, 1.2650, 'UK equipment purchase - 250k GBP'),
(1, 'EXP-2026-003', 'EURNOK', 1000000.00, '2026-02-01', '2026-12-31', 334, 11.4500, 'Norwegian operations - 1M EUR')
ON CONFLICT DO NOTHING;
"""


@router.post("/setup-database")
async def setup_database(include_demo_data: bool = False):
    """
    ONE-TIME SETUP: Creates all required database tables
    
    WARNING: Delete this endpoint after use for security
    
    Args:
        include_demo_data: If True, adds sample exposures for testing
    """
    try:
        from database import engine
        
        with engine.connect() as conn:
            # Execute main setup SQL
            conn.execute(text(SETUP_SQL))
            conn.commit()
            
            # Optionally add demo data
            if include_demo_data:
                conn.execute(text(DEMO_DATA_SQL))
                conn.commit()
            
            # Verify tables were created
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('exposures', 'hedging_recommendations', 'active_hedges', 'scenario_results')
                ORDER BY table_name;
            """))
            
            tables_created = [row[0] for row in result]
            
            # Count rows in exposures
            count_result = conn.execute(text("SELECT COUNT(*) FROM exposures"))
            exposure_count = count_result.scalar()
            
            return {
                "success": True,
                "message": "Database setup completed successfully",
                "tables_created": tables_created,
                "demo_data_loaded": include_demo_data,
                "exposure_count": exposure_count,
                "warning": "IMPORTANT: Delete this /setup-database endpoint now for security!"
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database setup failed: {str(e)}"
        )


@router.get("/verify-database")
async def verify_database():
    """
    Check if all required tables exist and are accessible
    """
    try:
        from database import engine
        
        required_tables = ['exposures', 'hedging_recommendations', 'active_hedges', 'scenario_results']
        
        with engine.connect() as conn:
            # Check table existence
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = ANY(:tables)
            """), {"tables": required_tables})
            
            existing_tables = [row[0] for row in result]
            missing_tables = set(required_tables) - set(existing_tables)
            
            # Get row counts for existing tables
            table_counts = {}
            for table in existing_tables:
                count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                table_counts[table] = count_result.scalar()
            
            return {
                "success": len(missing_tables) == 0,
                "existing_tables": existing_tables,
                "missing_tables": list(missing_tables),
                "row_counts": table_counts,
                "status": "ready" if len(missing_tables) == 0 else "setup_needed"
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "status": "error"
        }
