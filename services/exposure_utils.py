"""
services/exposure_utils.py
==========================
Shared calculation utilities for exposure-level computations.

Import from here — NEVER write inline hedge_pct, zone, P&L, or scenario
calculations in endpoint handlers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUDIT LOG — duplicate locations that still need migration:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

calculate_hedge_pct():
  DONE   → routes/hedge_tranche_routes.py:152  (inside calculate_pnl_split)
  DONE   → birk_api.py:1135                    (inside /api/simulator)
  DONE   → routes/forecasting_routes.py:161    (migrated to calculate_hedge_pct)
  TODO   → routes/margin_call_routes.py        (wherever hedge % is computed)

calculate_zone():
  DONE   → birk_api.py:872                     (primary definition — still there for compat)
  DONE   → routes/hedge_tranche_routes.py:617  (imports from birk_api)
  TODO   → birk_api.py:826                     (/api/portfolio — same file)
  NEW    → services/exposure_utils.py          (this file — new canonical home)

classify_exposure_tab():
  NEW    → services/exposure_utils.py          (this file — used by tabbed endpoint)

calculate_pnl():
  DONE   → routes/hedge_tranche_routes.py:128  (as calculate_pnl_split — already shared)
  TODO   → birk_api.py:~2699                   (/api/dashboard/summary — inline call with local to_eur)
  TODO   → routes/forecasting_routes.py        (uses hedged_amount from stale field, not tranches)
  TODO   → routes/hedging_routes_fastapi.py    (/api/scenarios — simplified version)

EUR conversion — inline to_eur() duplicates:
  DONE   → services/currency_utils.py         (to_eur, pnl_to_eur — canonical)
  DONE   → birk_api.py:~1063                  (/api/simulator — already uses services.currency_utils)
  DONE   → birk_api.py:2654                   (/api/dashboard/summary — migrated to pnl_to_eur)
  TODO   → birk_api.py:~2466                  (/api/mtm — local to_eur_rate calculation)

calculate_scenario_pnl():
  DONE   → birk_api.py:~1200                  (/api/simulator — fixed in previous commit)
  TODO   → routes/hedging_routes_fastapi.py   (if per-exposure scenario calc exists)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from datetime import date
from typing import Optional
from services.currency_utils import pnl_to_eur


# ── 1. Hedge coverage ────────────────────────────────────────────────────────

def calculate_hedge_pct(hedged_notional: float, total_notional: float) -> float:
    """
    Hedge coverage as a percentage. Capped at 100%.

    Args:
        hedged_notional: Sum of executed/confirmed tranche amounts (same currency as total)
        total_notional:  Total exposure notional

    Returns:
        Coverage % (0.0 – 100.0)
    """
    if not total_notional:
        return 0.0
    return min(round((hedged_notional / total_notional) * 100, 1), 100.0)


# ── 2. Zone classification ───────────────────────────────────────────────────

def calculate_zone(
    spot: float,
    budget: float,
    defensive_threshold: float,
    opportunistic_threshold: float,
    direction: str = "payable",
) -> str:
    """
    Classify the current rate move into BASE / DEFENSIVE / OPPORTUNISTIC.

    Direction logic:
    - Payable  (BUY):  adverse = rate rises  → DEFENSIVE when spot > budget by threshold
    - Receivable (SELL): adverse = rate falls → DEFENSIVE when spot < budget by threshold

    Args:
        spot:                    Current spot rate
        budget:                  Budgeted rate
        defensive_threshold:     % move that triggers DEFENSIVE zone
        opportunistic_threshold: % move that triggers OPPORTUNISTIC zone
        direction:               'payable'/'buy' or 'receivable'/'sell'

    Returns:
        'BASE' | 'DEFENSIVE' | 'OPPORTUNISTIC'
    """
    if not budget:
        return "BASE"
    try:
        pct_move = ((spot - budget) / budget) * 100
    except ZeroDivisionError:
        return "BASE"

    is_receivable = direction.lower() in ("receivable", "sell", "receive")

    if is_receivable:
        # Adverse for receivable = from_ccy weakens (spot falls below budget)
        if pct_move <= -defensive_threshold:
            return "DEFENSIVE"
        if pct_move >= opportunistic_threshold:
            return "OPPORTUNISTIC"
    else:
        # Payable: adverse = from_ccy strengthens (spot rises above budget)
        if pct_move >= defensive_threshold:
            return "DEFENSIVE"
        if pct_move <= -opportunistic_threshold:
            return "OPPORTUNISTIC"

    return "BASE"


# ── 3. Tab classification ────────────────────────────────────────────────────

def classify_exposure_tab(
    exposure: dict,
    hedge_pct: float,
    is_breach: bool,
    policy_target_pct: float,   # 0–100 (e.g. 80.0 for 80% target)
) -> str:
    """
    Classify an enriched exposure into one of five lifecycle tabs.

    Priority order:
      1. archived         → 'settled'
      2. past end_date    → 'awaiting_settlement'
      3. breach OR 0%     → 'requires_action'
      4. >= policy target → 'hedged'
      5. > 0%             → 'in_progress'
      6. else             → 'requires_action'

    Args:
        exposure:          Enriched exposure dict (must have 'archived', 'end_date',
                           'budget_rate' fields)
        hedge_pct:         Hedge coverage % (0–100)
        is_breach:         True if exposure is in BREACH status
        policy_target_pct: Hedge % required to be considered fully hedged (0–100)

    Returns:
        Tab name string
    """
    # Archived = lifecycle complete (settled)
    if exposure.get("archived"):
        return "settled"

    # Past maturity and not yet archived = awaiting settlement
    end_date = exposure.get("end_date")
    if end_date:
        if isinstance(end_date, str):
            try:
                end_date = date.fromisoformat(end_date[:10])
            except ValueError:
                end_date = None
        if end_date and end_date < date.today():
            return "awaiting_settlement"

    # Breach always requires immediate action
    if is_breach:
        return "requires_action"

    # No hedging at all (and has a budget rate) = action needed
    if hedge_pct == 0 and (exposure.get("budget_rate") or 0) > 0:
        return "requires_action"

    # At or above policy target = fully hedged
    if hedge_pct >= policy_target_pct:
        return "hedged"

    # Partially hedged = in progress
    if hedge_pct > 0:
        return "in_progress"

    # No budget rate or no hedges and no budget → requires action
    return "requires_action"


# ── 4. P&L calculation ───────────────────────────────────────────────────────

def calculate_pnl(
    spot: float,
    budget: float,
    inception_rate: float,
    total_notional: float,
    hedged_notional: float,
    to_currency: str,
    rates: dict,
) -> dict:
    """
    Calculate locked / floating / combined P&L and convert to EUR.

    All raw P&L figures are in to_currency (since P&L = rate_diff × notional
    and rate = to_ccy/from_ccy). They are then converted to EUR via pnl_to_eur.

    Args:
        spot:             Current spot rate (to_ccy per from_ccy)
        budget:           Budget rate
        inception_rate:   Average rate of executed hedges (weighted)
        total_notional:   Full exposure notional in from_currency
        hedged_notional:  Executed/confirmed tranche amount in from_currency
        to_currency:      Settlement currency (e.g. 'NOK', 'USD')
        rates:            Dict keyed as 'CCY/USD' for EUR conversion

    Returns:
        {
          'locked_pnl_eur':   float,
          'floating_pnl_eur': float,
          'combined_pnl_eur': float,
          'open_notional':    float,
        }
    """
    open_notional = max(total_notional - hedged_notional, 0.0)

    # Locked P&L: hedged portion vs budget (crystallised — not affected by scenario)
    locked_raw   = (inception_rate - budget) * hedged_notional

    # Floating P&L: open portion vs today's spot
    floating_raw = (spot - budget) * open_notional

    return {
        "locked_pnl_eur":   pnl_to_eur(locked_raw,             to_currency, rates),
        "floating_pnl_eur": pnl_to_eur(floating_raw,           to_currency, rates),
        "combined_pnl_eur": pnl_to_eur(locked_raw + floating_raw, to_currency, rates),
        "open_notional":    open_notional,
    }


# ── 5. Scenario P&L ──────────────────────────────────────────────────────────

def calculate_scenario_pnl(
    direction_sign: int,        # +1 receivable, -1 payable
    scenario_pct: float,        # e.g. -5.0 for "5% adverse"
    current_spot: float,
    budget_rate: float,
    total_notional: float,
    hedged_notional: float,
    avg_hedge_rate: float,
    to_currency: str,
    rates: dict,
) -> dict:
    """
    Calculate P&L impact of a rate scenario, applied in the adverse direction
    for each exposure type.

    For adverse scenarios (scenario_pct < 0):
    - Receivable (sign=+1): rate falls  — adverse_spot = spot × (1 + sign × pct)
    - Payable    (sign=-1): rate rises  — adverse_spot = spot × (1 - sign × pct)

    Coverage % = how much of the potential unhedged loss the hedge covers.
    Only meaningful when fully_unhedged_pnl < 0.  Capped at 100%.

    Args:
        direction_sign:    +1 for receivable, -1 for payable
        scenario_pct:      % shock as a decimal (e.g. -0.05 for -5%)
        current_spot:      Live spot rate
        budget_rate:       Budgeted rate
        total_notional:    Full exposure notional in from_ccy
        hedged_notional:   Executed/confirmed tranche total in from_ccy
        avg_hedge_rate:    Weighted average hedge rate across executed tranches
        to_currency:       Settlement currency for EUR conversion
        rates:             {'CCY/USD': rate} dict for pnl_to_eur

    Returns:
        {
          'unhedged_pnl_eur':  float,   # fully unhedged scenario P&L
          'hedged_pnl_eur':    float,   # actual P&L with current hedges
          'hedge_saving_eur':  float,   # difference (always positive in adverse scenario)
          'coverage_pct':      float or None,
        }
    """
    # Apply shock in the direction adverse to THIS exposure type
    scenario_spot  = current_spot * (1 + direction_sign * scenario_pct)
    open_notional  = max(total_notional - hedged_notional, 0.0)

    # Fully unhedged: entire notional at scenario rate vs budget
    fully_unhedged  = direction_sign * (scenario_spot - budget_rate) * total_notional

    # Actual position: locked at hedge rate + open portion at scenario rate
    locked_portion  = direction_sign * (avg_hedge_rate - budget_rate) * hedged_notional
    open_portion    = direction_sign * (scenario_spot - budget_rate)  * open_notional
    actual_pnl      = locked_portion + open_portion

    hedge_saving    = actual_pnl - fully_unhedged

    # Coverage: % of unhedged loss the hedges protect against (adverse scenarios only)
    if fully_unhedged < 0:
        raw_pct      = (hedge_saving / abs(fully_unhedged)) * 100
        coverage_pct = round(min(raw_pct, 100.0), 1)
    else:
        coverage_pct = None   # favourable scenario — no loss to protect

    return {
        "unhedged_pnl_eur": pnl_to_eur(fully_unhedged, to_currency, rates),
        "hedged_pnl_eur":   pnl_to_eur(actual_pnl,     to_currency, rates),
        "hedge_saving_eur": pnl_to_eur(hedge_saving,    to_currency, rates),
        "coverage_pct":     coverage_pct,
    }
