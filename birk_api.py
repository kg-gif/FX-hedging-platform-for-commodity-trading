# Database setup endpoint - ONE TIME USE - DELETE AFTER RUNNING
@app.post("/api/setup/setup-database")
async def setup_database(include_demo_data: bool = False):
    """Create all required database tables"""
    try:
        with engine.connect() as conn:
            # Drop and create tables
            conn.execute(text("""
                -- Drop existing tables first
                DROP TABLE IF EXISTS scenario_results CASCADE;
                DROP TABLE IF EXISTS active_hedges CASCADE;
                DROP TABLE IF EXISTS hedging_recommendations CASCADE;
                DROP TABLE IF EXISTS exposures CASCADE;
                
                -- Create exposures table matching the Exposure model
                CREATE TABLE exposures (
                    id SERIAL PRIMARY KEY,
                    company_id INTEGER NOT NULL,
                    from_currency VARCHAR(10) NOT NULL,
                    to_currency VARCHAR(10) NOT NULL,
                    amount FLOAT NOT NULL,
                    initial_rate FLOAT,
                    current_rate FLOAT,
                    current_value_usd FLOAT,
                    settlement_period INTEGER,
                    risk_level VARCHAR(20),
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE hedging_recommendations (
                    id SERIAL PRIMARY KEY,
                    company_id INTEGER NOT NULL,
                    exposure_id INTEGER REFERENCES exposures(id) ON DELETE CASCADE,
                    recommended_ratio DECIMAL(5,2),
                    var_95 DECIMAL(15,2),
                    var_99 DECIMAL(15,2),
                    strategy_type VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE active_hedges (
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
                
                CREATE TABLE scenario_results (
                    id SERIAL PRIMARY KEY,
                    company_id INTEGER NOT NULL,
                    scenario_type VARCHAR(50),
                    hedge_ratio DECIMAL(5,2),
                    rate_change_pct DECIMAL(5,2),
                    unhedged_pnl DECIMAL(15,2),
                    hedged_pnl DECIMAL(15,2),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.commit()
            
            # Optionally add demo data
            if include_demo_data:
                conn.execute(text("""
                    INSERT INTO exposures (company_id, from_currency, to_currency, amount, initial_rate, settlement_period, description) 
                    VALUES
                    (1, 'EUR', 'USD', 500000.00, 1.0850, 180, 'European supplier payment'),
                    (1, 'GBP', 'USD', 250000.00, 1.2650, 60, 'UK equipment purchase'),
                    (1, 'EUR', 'NOK', 1000000.00, 11.4500, 334, 'Norwegian operations')
                    ON CONFLICT DO NOTHING;
                """))
                conn.commit()
            
            # Count exposures
            result = conn.execute(text("SELECT COUNT(*) FROM exposures"))
            count = result.scalar()
            
            return {
                "success": True,
                "message": "Database tables created successfully",
                "exposure_count": count,
                "demo_data_loaded": include_demo_data
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }