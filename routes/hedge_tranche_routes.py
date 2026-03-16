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


# ── Helper: normalize amount to base currency ────────────────────────────────

def normalize_to_base(amount: float, amount_currency: str, from_currency: str, budget_rate: float) -> float:
    """
    Exposure amounts may be entered in either the base (from) or quote (to) currency.
    P&L and coverage calculations always work in base currency (from_currency).

    If amount_currency == from_currency: already in base, return as-is.
    If amount_currency == to_currency:  convert to base by dividing by budget_rate.
    """
    if not amount_currency or not from_currency:
        return amount
    if amount_currency.upper() == from_currency.upper():
        return amount
    # amount is in quote (to) currency — convert to base
    if budget_rate and budget_rate > 0:
        return amount / budget_rate
    return amount


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
    raw_amount = float(exposure.get("amount") or 0)
    # Normalize stored amount to base (from) currency for all calculations
    total_amount = normalize_to_base(
        raw_amount,
        exposure.get("amount_currency"),
        exposure.get("from_currency"),
        budget_rate
    )

    hedged_amount = sum(
        float(t["amount"]) for t in tranches
        if t["status"] in ("executed", "confirmed")
    )
    open_amount = max(total_amount - hedged_amount, 0)

    # Locked P&L — weighted against each tranche's execution rate
    locked_pnl = sum(
        (float(t["rate"] or budget_rate or 0) - (budget_rate or 0)) * float(t["amount"] or 0)
        for t in tranches
        if t["status"] in ("executed", "confirmed")
        and t["amount"] is not None
    )

    # Floating P&L — open portion vs today's spot
    floating_pnl = (current_spot - (budget_rate or 0)) * open_amount if current_spot and budget_rate else 0

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
    tp_pct       = float(body.get("take_profit_pct") or body.get("corridor_pct") or 0.03)
    sl_pct       = float(body.get("stop_loss_pct")   or body.get("corridor_pct") or 0.03)
    reason       = body.get("reason", "Manual corridor reset")

    if not current_spot:
        raise HTTPException(status_code=400, detail="current_spot is required")

    existing_hedged = db.execute(text("""
        SELECT COALESCE(SUM(amount), 0)
        FROM hedge_tranches
        WHERE exposure_id = :eid AND status IN ('executed', 'confirmed')
    """), {"eid": exposure_id}).scalar()

    total_amount = float(exp["amount"])
    open_amount  = total_amount - float(existing_hedged or 0)

    # Asymmetric corridor — take profit and stop loss set independently
    take_profit = round(current_spot * (1 + tp_pct), 6)
    stop_loss   = round(current_spot * (1 - sl_pct), 6)

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
        "corridor_pct":         tp_pct,  # take_profit side stored; stop_loss_pct in notes
        "reset_by":             payload.get("email"),
        "reason":               f"{reason} | TP: {tp_pct*100:.1f}% SL: {sl_pct*100:.1f}%",
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
        "take_profit_rate":  take_profit,
        "stop_loss_rate":    stop_loss,
        "take_profit_pct":   f"{tp_pct * 100:.1f}%",
        "stop_loss_pct":     f"{sl_pct * 100:.1f}%",
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
    include_archived: bool = False,
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
    print("[enriched] endpoint called")
    from birk_api import get_current_rates, fetch_fx_rate, calculate_zone, zone_target_ratio
    ensure_tables(db)

    safe_id = resolve_company_id(company_id, payload)

    # Fetch company base_currency for portfolio aggregation
    company_info = db.execute(
        text("SELECT base_currency FROM companies WHERE id = :cid"), {"cid": safe_id}
    ).fetchone()
    base_currency = company_info._mapping["base_currency"] if company_info else "USD"

    archived_filter = "" if include_archived else "AND (archived IS NULL OR archived = false)"
    exposures = db.execute(
        text(f"SELECT * FROM exposures WHERE company_id = :cid AND (is_active IS NULL OR is_active = true) {archived_filter}"),
        {"cid": safe_id}
    ).fetchall()

    if not exposures:
        return {"items": [], "portfolio": {"total_base": 0, "hedged_base": 0, "open_base": 0, "protection_pct": 0, "base_currency": base_currency}}

    # Fetch live rates for all exposure pairs + conversion pairs to base_currency
    pairs = list(dict.fromkeys([
        f"{e._mapping['from_currency']}/{e._mapping['to_currency']}"
        for e in exposures
    ]))
    conversion_pairs = list(dict.fromkeys([
        f"{e._mapping['from_currency']}/{base_currency}"
        for e in exposures
        if e._mapping['from_currency'] != base_currency
    ]))
    live_rates = await get_current_rates(list(dict.fromkeys(pairs + conversion_pairs)))

    # Fetch active policy once — needed for zone thresholds and notification prefs
    policy_row = db.execute(
        text("SELECT * FROM hedging_policies WHERE company_id = :cid AND is_active = true"),
        {"cid": safe_id}
    ).fetchone()
    active_policy = dict(policy_row._mapping) if policy_row else {}

    # Fetch company alert email once for zone notifications
    company_row = db.execute(
        text("SELECT alert_email FROM companies WHERE id = :cid"), {"cid": safe_id}
    ).fetchone()
    company_alert_email = company_row._mapping["alert_email"] if company_row else None

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

        # Calculate P&L split (normalize amount to base currency first)
        exp_for_pnl = dict(exp)
        exp_for_pnl["amount_currency"] = exp.get("amount_currency") or exp["from_currency"]
        pnl = calculate_pnl_split(exp_for_pnl, tranche_list, current_spot)

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

        amount_currency = exp.get("amount_currency") or exp["from_currency"]
        total_amount_base = normalize_to_base(
            float(exp["amount"]), amount_currency, exp["from_currency"], budget_rate
        )

        # Zone calculation — requires budget_rate and live spot
        direction = exp.get("exposure_type") or exp.get("direction") or "payable"
        adv_trig  = float(active_policy.get("adverse_trigger_pct") or 3.0)
        fav_trig  = float(active_policy.get("favourable_trigger_pct") or 3.0)
        pct_move  = 0.0
        current_zone = "base"
        if budget_rate and current_spot:
            try:
                pct_move = (current_spot - budget_rate) / budget_rate * 100
            except Exception:
                pct_move = 0.0
            current_zone = calculate_zone(current_spot, budget_rate, adv_trig, fav_trig, direction)

        # Zone-adjusted target ratio (falls back to base if no size-band match)
        if total_amount_base >= 5_000_000:
            base_ratio = float(active_policy.get("hedge_ratio_over_5m") or 1.0)
        elif total_amount_base >= 1_000_000:
            base_ratio = float(active_policy.get("hedge_ratio_1m_to_5m") or 1.0)
        else:
            base_ratio = float(active_policy.get("hedge_ratio_under_1m") or 1.0)
        z_target_ratio = zone_target_ratio(current_zone, active_policy, base_ratio)

        # ── Zone-shift detection and notification ─────────────────────────────
        # Send email only when zone actually changes (no time-based cooldown).
        print(f"[zone-shift] {pair}: current_zone={current_zone}, budget_rate={budget_rate}, current_spot={current_spot}, notify_email={active_policy.get('zone_notify_email')}, alert_email={company_alert_email}")
        if current_zone != "base" and active_policy.get("zone_notify_email") and budget_rate:
            try:
                last_log = db.execute(text("""
                    SELECT new_zone FROM zone_change_log
                    WHERE company_id = :cid AND currency_pair = :pair
                    ORDER BY created_at DESC LIMIT 1
                """), {"cid": safe_id, "pair": pair}).fetchone()

                last_zone = last_log._mapping["new_zone"] if last_log else "base"
                print(f"[zone-shift] {pair}: last_zone={last_zone}")

                if current_zone != last_zone:
                    # Log the zone change
                    db.execute(text("""
                        INSERT INTO zone_change_log
                            (company_id, currency_pair, previous_zone, new_zone,
                             trigger_type, spot_rate, budget_rate, pct_move, created_at)
                        VALUES (:cid, :pair, :prev, :new, 'auto', :spot, :budget, :pct, NOW())
                    """), {
                        "cid":    safe_id,
                        "pair":   pair,
                        "prev":   last_zone,
                        "new":    current_zone,
                        "spot":   round(current_spot, 6),
                        "budget": budget_rate,
                        "pct":    round(pct_move, 2),
                    })
                    db.commit()
                    print(f"[zone-shift] {pair}: logged zone change {last_zone} → {current_zone}")

                    # Send email notification
                    resend_key = os.getenv("RESEND_API_KEY")
                    print(f"[zone-shift] {pair}: resend_key present={bool(resend_key)}, company_alert_email={company_alert_email}")
                    if resend_key and company_alert_email:
                        import httpx as _httpx
                        zone_label = current_zone.upper()
                        direction_txt = exp.get("exposure_type") or exp.get("direction") or "payable"
                        action_txt = (
                            "Increase hedge coverage to the Defensive target."
                            if current_zone == "defensive"
                            else "Consider reducing hedge coverage to the Opportunistic target."
                        )
                        body_html = (
                            f"<p><strong>{pair}</strong> has moved into the "
                            f"<strong>{zone_label}</strong> zone.</p>"
                            f"<ul>"
                            f"<li>Current spot: {round(current_spot, 4)}</li>"
                            f"<li>Budget rate: {round(budget_rate, 4)}</li>"
                            f"<li>Move vs budget: {round(pct_move, 2)}%</li>"
                            f"<li>Direction: {direction_txt}</li>"
                            f"</ul>"
                            f"<p><strong>Recommended action:</strong> {action_txt}</p>"
                            f"<p><a href='{os.getenv('FRONTEND_URL', 'https://birk-dashboard.onrender.com')}'>Review in Sumnohow →</a></p>"
                        )
                        try:
                            async with _httpx.AsyncClient(timeout=10) as client:
                                resp = await client.post(
                                    "https://api.resend.com/emails",
                                    headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                                    json={
                                        "from": "Sumnohow <alerts@updates.sumnohow.com>",
                                        "to":   [company_alert_email],
                                        "subject": f"{pair} Zone Alert — {zone_label}",
                                        "html": body_html,
                                    },
                                )
                            print(f"[zone-email] sent to {company_alert_email} for {pair} - {current_zone} | status={resp.status_code} body={resp.text}")
                        except Exception as _e:
                            print(f"[zone-email] FAILED for {pair}: {_e}")
                else:
                    print(f"[zone-shift] {pair}: skipped — zone unchanged ({current_zone})")
            except Exception as _e:
                logger.warning(f"Zone shift detection failed for {pair}: {_e}")
                print(f"[zone-shift] {pair}: outer exception: {_e}")
        # ── End zone-shift notification ────────────────────────────────────────

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
            "amount":           float(exp["amount"]),
            "amount_currency":  amount_currency,
            "total_amount":     round(total_amount_base, 2),  # Always in from_currency (base)
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

            # Dynamic zone
            "current_zone":       current_zone,
            "pct_move_vs_budget": round(pct_move, 2),
            "zone_target_ratio":  z_target_ratio,

            # Archive state
            "archived":           bool(exp.get("archived")),
            "archived_at":        exp["archived_at"].isoformat() if exp.get("archived_at") else None,
            "archive_reason":     exp.get("archive_reason") or "",
        })

    # ── Portfolio totals — convert all active exposure amounts to base_currency ──
    # Use USD as pivot to avoid stale or direction-inverted direct cross-rates.
    # Formula: from_ccy_per_base = from_ccy_USD / base_USD
    #          converted = amount × from_ccy_per_base
    # e.g. GBP→EUR: GBP/USD=1.27, EUR/USD=1.10 → GBP/EUR = 1.27/1.10 = 1.154
    import asyncio as _asyncio

    unique_from_ccys = list(dict.fromkeys([
        item["from_currency"]
        for item in result
        if not item.get("archived") and item["from_currency"] != base_currency
    ]))

    # Currencies whose USD rate we need: all non-base from_ccys + base_currency (if not USD)
    ccys_for_usd = list(dict.fromkeys(
        unique_from_ccys + ([base_currency] if base_currency != "USD" else [])
    ))
    usd_rate_map: dict = {}  # {currency: how_many_USD_per_1_unit}
    if ccys_for_usd:
        usd_results = await _asyncio.gather(
            *[fetch_fx_rate(ccy, "USD") for ccy in ccys_for_usd],
            return_exceptions=True
        )
        for ccy, rate_val in zip(ccys_for_usd, usd_results):
            if isinstance(rate_val, Exception) or rate_val is None:
                print(f"[portfolio] WARNING: could not fetch {ccy}/USD")
            else:
                usd_rate_map[ccy] = float(rate_val)
                print(f"[portfolio] {ccy}/USD = {rate_val:.6f}")

    base_usd = usd_rate_map.get(base_currency, 1.0) if base_currency != "USD" else 1.0

    portfolio_total_base  = 0.0
    portfolio_hedged_base = 0.0
    for item in result:
        if item.get("archived"):
            continue
        from_ccy = item["from_currency"]
        total    = item.get("total_amount") or 0.0
        hedged   = item.get("hedged_amount") or 0.0

        if from_ccy == base_currency:
            rate = 1.0
        elif from_ccy == "USD":
            rate = (1.0 / base_usd) if base_usd else None
        else:
            from_usd = usd_rate_map.get(from_ccy)
            rate = (from_usd / base_usd) if (from_usd and base_usd) else None

        if rate is not None:
            converted = total * rate
            portfolio_total_base  += converted
            portfolio_hedged_base += hedged * rate
            print(f"[conversion] {item.get('currency_pair','?')}: {total:,.0f} {from_ccy} × {rate:.6f} = {converted:,.0f} {base_currency}")
        else:
            print(f"[portfolio] WARNING: no USD rate for {from_ccy}, excluding from total")

    protection_pct = (portfolio_hedged_base / portfolio_total_base * 100) if portfolio_total_base > 0 else 0.0

    return {
        "items": result,
        "portfolio": {
            "total_base":     round(portfolio_total_base, 2),
            "hedged_base":    round(portfolio_hedged_base, 2),
            "open_base":      round(max(portfolio_total_base - portfolio_hedged_base, 0), 2),
            "protection_pct": round(protection_pct, 1),
            "base_currency":  base_currency,
        }
    }
