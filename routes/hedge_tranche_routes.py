"""
hedge_tranche_routes.py

Handles all hedge tranche logic:
- Creating tranches when orders are executed
- Fetching tranche history per exposure
- Corridor reset (trailing stop recalculation)
- Enriched exposure view with locked/floating/combined P&L

Add to birk_api.py:
    from routes.hedge_tranche_routes import router as tranche_router
    app.include_router(tranche_router)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from typing import Optional
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def get_db():
    from database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_security = HTTPBearer(auto_error=False)

def get_token_payload(credentials: HTTPAuthorizationCredentials = Depends(_security)) -> dict:
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
        raise HTTPException(status_code=403, detail="No company assigned")
    return int(token_company_id)


# ── Auto-migrate tables on first use ─────────────────────────────────────────

def ensure_tables(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS hedge_tranches (
            id                  SERIAL PRIMARY KEY,
            exposure_id         INTEGER REFERENCES exposures(id) ON DELETE CASCADE,
            company_id          INTEGER REFERENCES companies(id),
            amount              NUMERIC(18,2) NOT NULL,
            rate                NUMERIC(18,6),
            instrument          VARCHAR(20) DEFAULT 'Forward',
            value_date          DATE,
            status              VARCHAR(20) DEFAULT 'pending',
            order_ref           VARCHAR(100),
            confirmation_doc    VARCHAR(500),
            created_at          TIMESTAMP DEFAULT NOW(),
            created_by          VARCHAR(255),
            executed_at         TIMESTAMP,
            executed_by         VARCHAR(255),
            confirmed_at        TIMESTAMP,
            confirmed_by        VARCHAR(255),
            notes               TEXT
        )
    """))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS hedge_corridor_log (
            id                  SERIAL PRIMARY KEY,
            exposure_id         INTEGER REFERENCES exposures(id) ON DELETE CASCADE,
            company_id          INTEGER REFERENCES companies(id),
            open_amount         NUMERIC(18,2),
            reference_rate      NUMERIC(18,6),
            original_budget_rate NUMERIC(18,6),
            take_profit_rate    NUMERIC(18,6),
            stop_loss_rate      NUMERIC(18,6),
            corridor_pct        NUMERIC(6,4),
            reset_by            VARCHAR(255),
            reset_at            TIMESTAMP DEFAULT NOW(),
            reason              TEXT
        )
    """))
    db.commit()


# ── Helper: calculate P&L split ───────────────────────────────────────────────

def calculate_pnl_split(exposure: dict, tranches: list, current_spot: float) -> dict:
    """
    Returns locked P&L, floating P&L, and combined P&L.

    Locked P&L:   sum of (tranche_rate - budget_rate) * tranche_amount
                  for executed/confirmed tranches. Crystallised — won't change.

    Floating P&L: (current_spot - budget_rate) * open_amount
                  Moves daily with the market.

    Combined P&L: locked + floating — total picture for the CFO.
    """
    budget_rate = float(exposure.get("budget_rate") or 0)
    total_amount = float(exposure.get("amount") or 0)

    hedged_amount = sum(
        float(t["amount"]) for t in tranches
        if t["status"] in ("executed", "confirmed")
    )
    open_amount = max(total_amount - hedged_amount, 0)

    # Locked P&L — weighted against each tranche's execution rate
    locked_pnl = sum(
        (float(t["rate"] or budget_rate) - budget_rate) * float(t["amount"])
        for t in tranches
        if t["status"] in ("executed", "confirmed")
    )

    # Floating P&L — open portion vs today's spot
    floating_pnl = (current_spot - budget_rate) * open_amount if budget_rate and current_spot else 0

    combined_pnl = locked_pnl + floating_pnl
    hedge_pct = (hedged_amount / total_amount * 100) if total_amount > 0 else 0

    return {
        "hedged_amount":  round(hedged_amount, 2),
        "open_amount":    round(open_amount, 2),
        "hedge_pct":      round(hedge_pct, 1),
        "locked_pnl":     round(locked_pnl, 2),
        "floating_pnl":   round(floating_pnl, 2),
        "combined_pnl":   round(combined_pnl, 2),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/api/exposures/{exposure_id}/tranches")
def get_tranches(
    exposure_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """Get all hedge tranches for an exposure."""
    ensure_tables(db)

    exposure = db.execute(
        text("SELECT * FROM exposures WHERE id = :id"), {"id": exposure_id}
    ).fetchone()
    if not exposure:
        raise HTTPException(status_code=404, detail="Exposure not found")

    resolve_company_id(exposure._mapping["company_id"], payload)

    tranches = db.execute(
        text("SELECT * FROM hedge_tranches WHERE exposure_id = :eid ORDER BY created_at DESC"),
        {"eid": exposure_id}
    ).fetchall()

    return {
        "exposure_id": exposure_id,
        "tranches": [dict(t._mapping) for t in tranches]
    }


@router.post("/api/exposures/{exposure_id}/tranches")
def create_tranche(
    exposure_id: int,
    body: dict,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Create a new hedge tranche.
    Called when user clicks 'Mark as Executed' on an order.
    Status starts as 'executed'. Moves to 'confirmed' when bank confirmation uploaded.
    """
    ensure_tables(db)

    exposure = db.execute(
        text("SELECT * FROM exposures WHERE id = :id"), {"id": exposure_id}
    ).fetchone()
    if not exposure:
        raise HTTPException(status_code=404, detail="Exposure not found")

    exp = exposure._mapping
    safe_company_id = resolve_company_id(exp["company_id"], payload)

    # Validate amount doesn't exceed open portion
    existing_hedged = db.execute(text("""
        SELECT COALESCE(SUM(amount), 0) as total
        FROM hedge_tranches
        WHERE exposure_id = :eid AND status IN ('executed', 'confirmed', 'pending')
    """), {"eid": exposure_id}).scalar()

    total_amount = float(exp["amount"])
    already_hedged = float(existing_hedged or 0)
    new_amount = float(body.get("amount", 0))
    open_amount = total_amount - already_hedged

    if new_amount > open_amount + 1:  # +1 for rounding tolerance
        raise HTTPException(
            status_code=400,
            detail=f"Tranche amount {new_amount:,.0f} exceeds open exposure {open_amount:,.0f}"
        )

    db.execute(text("""
        INSERT INTO hedge_tranches
            (exposure_id, company_id, amount, rate, instrument, value_date,
             status, order_ref, created_by, executed_at, executed_by, notes)
        VALUES
            (:exposure_id, :company_id, :amount, :rate, :instrument, :value_date,
             'executed', :order_ref, :created_by, NOW(), :executed_by, :notes)
    """), {
        "exposure_id":  exposure_id,
        "company_id":   safe_company_id,
        "amount":       new_amount,
        "rate":         body.get("rate"),
        "instrument":   body.get("instrument", "Forward"),
        "value_date":   body.get("value_date"),
        "order_ref":    body.get("order_ref"),
        "created_by":   payload.get("email"),
        "executed_by":  payload.get("email"),
        "notes":        body.get("notes"),
    })
    db.commit()

    logger.info(f"Tranche created: exposure {exposure_id}, amount {new_amount}, by {payload.get('email')}")
    return {"message": "Tranche recorded", "exposure_id": exposure_id}


@router.patch("/api/tranches/{tranche_id}/confirm")
def confirm_tranche(
    tranche_id: int,
    body: dict,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Mark a tranche as bank-confirmed.
    Optional: attach confirmation reference or document path.
    """
    ensure_tables(db)

    db.execute(text("""
        UPDATE hedge_tranches
        SET status = 'confirmed',
            confirmed_at = NOW(),
            confirmed_by = :confirmed_by,
            order_ref = COALESCE(:order_ref, order_ref),
            notes = COALESCE(:notes, notes)
        WHERE id = :id
    """), {
        "id":           tranche_id,
        "confirmed_by": payload.get("email"),
        "order_ref":    body.get("order_ref"),
        "notes":        body.get("notes"),
    })
    db.commit()

    logger.info(f"Tranche {tranche_id} confirmed by {payload.get('email')}")
    return {"message": "Tranche confirmed"}


@router.post("/api/exposures/{exposure_id}/reset-corridor")
def reset_corridor(
    exposure_id: int,
    body: dict,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Reset the hedge corridor (trailing stop) for the open portion of an exposure.
    Uses today's spot rate as new reference point.
    Preserves original budget rate for post-trade reporting.
    Logs the reset with full audit trail.
    """
    ensure_tables(db)

    exposure = db.execute(
        text("SELECT * FROM exposures WHERE id = :id"), {"id": exposure_id}
    ).fetchone()
    if not exposure:
        raise HTTPException(status_code=404, detail="Exposure not found")

    exp = exposure._mapping
    resolve_company_id(exp["company_id"], payload)

    current_spot = float(body.get("current_spot") or 0)
    corridor_pct = float(body.get("corridor_pct") or 0.03)  # default 3%
    reason = body.get("reason", "Manual corridor reset")

    if not current_spot:
        raise HTTPException(status_code=400, detail="current_spot is required")

    # Calculate open amount
    existing_hedged = db.execute(text("""
        SELECT COALESCE(SUM(amount), 0)
        FROM hedge_tranches
        WHERE exposure_id = :eid AND status IN ('executed', 'confirmed')
    """), {"eid": exposure_id}).scalar()

    total_amount = float(exp["amount"])
    open_amount = total_amount - float(existing_hedged or 0)

    # Calculate new corridor around today's spot
    take_profit = round(current_spot * (1 + corridor_pct), 6)
    stop_loss   = round(current_spot * (1 - corridor_pct), 6)

    db.execute(text("""
        INSERT INTO hedge_corridor_log
            (exposure_id, company_id, open_amount, reference_rate, original_budget_rate,
             take_profit_rate, stop_loss_rate, corridor_pct, reset_by, reason)
        VALUES
            (:exposure_id, :company_id, :open_amount, :reference_rate, :original_budget_rate,
             :take_profit_rate, :stop_loss_rate, :corridor_pct, :reset_by, :reason)
    """), {
        "exposure_id":          exposure_id,
        "company_id":           exp["company_id"],
        "open_amount":          round(open_amount, 2),
        "reference_rate":       current_spot,
        "original_budget_rate": exp.get("budget_rate"),
        "take_profit_rate":     take_profit,
        "stop_loss_rate":       stop_loss,
        "corridor_pct":         corridor_pct,
        "reset_by":             payload.get("email"),
        "reason":               reason,
    })
    db.commit()

    logger.info(
        f"Corridor reset: exposure {exposure_id}, spot {current_spot}, "
        f"TP {take_profit}, SL {stop_loss}, by {payload.get('email')}"
    )

    return {
        "message":          "Corridor reset",
        "exposure_id":      exposure_id,
        "open_amount":      round(open_amount, 2),
        "reference_rate":   current_spot,
        "take_profit_rate": take_profit,
        "stop_loss_rate":   stop_loss,
        "corridor_pct":     f"{corridor_pct * 100:.1f}%",
    }


@router.get("/api/exposures/{exposure_id}/corridor")
def get_current_corridor(
    exposure_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """Get the most recent corridor for an exposure."""
    ensure_tables(db)

    corridor = db.execute(text("""
        SELECT * FROM hedge_corridor_log
        WHERE exposure_id = :eid
        ORDER BY reset_at DESC
        LIMIT 1
    """), {"eid": exposure_id}).fetchone()

    if not corridor:
        return {"exposure_id": exposure_id, "corridor": None}

    return {"exposure_id": exposure_id, "corridor": dict(corridor._mapping)}


@router.get("/api/exposures/enriched")
async def get_enriched_exposures(
    company_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload)
):
    """
    Full enriched exposure view for the register.
    Returns each exposure with:
    - Hedged amount (sum of executed/confirmed tranches)
    - Open amount (remaining)
    - Locked P&L (crystallised from executed tranches vs budget)
    - Floating P&L (open portion vs today's spot)
    - Combined P&L (total picture)
    - Current corridor (latest take profit / stop loss)
    - Tranche count and list
    """
    from birk_api import get_current_rates
    ensure_tables(db)

    safe_id = resolve_company_id(company_id, payload)

    exposures = db.execute(
        text("SELECT * FROM exposures WHERE company_id = :cid"),
        {"cid": safe_id}
    ).fetchall()

    if not exposures:
        return []

    # Fetch live rates for all pairs
    pairs = list(dict.fromkeys([
        f"{e._mapping['from_currency']}/{e._mapping['to_currency']}"
        for e in exposures
    ]))
    live_rates = await get_current_rates(pairs)

    result = []
    for exp_row in exposures:
        exp = exp_row._mapping
        exposure_id = exp["id"]
        pair = f"{exp['from_currency']}/{exp['to_currency']}"

        rate_info = live_rates.get(pair)
        current_spot = float(rate_info["rate"]) if rate_info and rate_info.get("rate") else float(exp.get("current_rate") or 0)

        # Get tranches
        tranches = db.execute(text("""
            SELECT * FROM hedge_tranches
            WHERE exposure_id = :eid
            ORDER BY created_at DESC
        """), {"eid": exposure_id}).fetchall()
        tranche_list = [dict(t._mapping) for t in tranches]

        # Get latest corridor
        corridor = db.execute(text("""
            SELECT * FROM hedge_corridor_log
            WHERE exposure_id = :eid
            ORDER BY reset_at DESC LIMIT 1
        """), {"eid": exposure_id}).fetchone()

        # Calculate P&L split
        pnl = calculate_pnl_split(dict(exp), tranche_list, current_spot)

        # Determine status
        budget_rate = float(exp.get("budget_rate") or 0)
        if not budget_rate:
            status = "NO_BUDGET"
        elif pnl["combined_pnl"] < (float(exp.get("max_loss_limit") or -999999999)):
            status = "BREACH"
        elif pnl["hedge_pct"] >= 80:
            status = "WELL_HEDGED"
        elif pnl["hedge_pct"] >= 40:
            status = "IN_PROGRESS"
        else:
            status = "OPEN"

        result.append({
            # Core exposure fields
            "id":               exposure_id,
            "company_id":       exp["company_id"],
            "currency_pair":    pair,
            "from_currency":    exp["from_currency"],
            "to_currency":      exp["to_currency"],
            "instrument_type":  exp.get("instrument_type") or "Spot",
            "description":      exp.get("description") or "",
            "reference":        exp.get("reference") or "",
            "budget_rate":      budget_rate,
            "current_spot":     round(current_spot, 6),
            "total_amount":     float(exp["amount"]),
            "end_date":         exp["end_date"].isoformat() if exp.get("end_date") else None,

            # Tranche summary
            "hedged_amount":    pnl["hedged_amount"],
            "open_amount":      pnl["open_amount"],
            "hedge_pct":        pnl["hedge_pct"],
            "tranche_count":    len([t for t in tranche_list if t["status"] in ("executed","confirmed")]),
            "tranches":         tranche_list,

            # P&L split — the three numbers the CFO cares about
            "locked_pnl":       pnl["locked_pnl"],
            "floating_pnl":     pnl["floating_pnl"],
            "combined_pnl":     pnl["combined_pnl"],

            # Corridor
            "corridor": {
                "take_profit_rate": float(corridor._mapping["take_profit_rate"]) if corridor else None,
                "stop_loss_rate":   float(corridor._mapping["stop_loss_rate"])   if corridor else None,
                "reference_rate":   float(corridor._mapping["reference_rate"])   if corridor else None,
                "corridor_pct":     float(corridor._mapping["corridor_pct"])     if corridor else None,
                "reset_at":         corridor._mapping["reset_at"].isoformat()    if corridor else None,
            } if corridor else None,

            # Status
            "status":           status,
            "max_loss_limit":   float(exp.get("max_loss_limit") or 0),
        })

    return result
