# ============================================================
# SHARED CURRENCY CONVERSION — BACKEND
# ONE source of truth for all EUR conversion.
# Import from here — never write inline conversion logic.
#
# NOTE: For live-rate conversions in request handlers, prefer
# get_rate(from_ccy, "EUR") from database.py — it handles
# caching and the USD pivot internally. These functions are
# useful when you already have a pre-fetched rates dict
# (e.g. inside a batch calculation loop).
# ============================================================

from datetime import datetime
from typing import Optional


def to_eur(amount: float, from_currency: str,
           to_currency: str, rates: dict) -> float:
    """
    Convert any notional to EUR equivalent.

    Args:
        amount:        notional in from_currency
        from_currency: e.g. 'GBP', 'JPY', 'CHF'
        to_currency:   e.g. 'USD', 'NOK'  (used for cross-pair routing)
        rates:         dict of live rates keyed as 'CCY/USD' (units per USD)
                       or pass the result of get_rate_cache() from database.py

    Returns:
        EUR equivalent of the notional
    """
    if from_currency == "EUR":
        return amount

    eur_usd = rates.get("EUR/USD") or rates.get("EUR", 1.0)

    if to_currency == "EUR":
        # from_ccy → EUR directly
        from_usd = _to_usd_rate(from_currency, rates)
        return (amount * from_usd) / eur_usd if eur_usd else amount

    # Cross pair — convert via USD pivot
    from_usd = _to_usd_rate(from_currency, rates)
    usd_value = amount * from_usd
    return usd_value / eur_usd if eur_usd else usd_value


def pnl_to_eur(pnl: float, settlement_currency: str, rates: dict) -> float:
    """
    Convert a P&L figure in settlement currency to EUR.
    P&L is always denominated in to_currency (the settlement currency).
    """
    if settlement_currency == "EUR":
        return pnl

    eur_usd = rates.get("EUR/USD") or rates.get("EUR", 1.0)

    if settlement_currency == "USD":
        return pnl / eur_usd if eur_usd else pnl

    to_usd = _to_usd_rate(settlement_currency, rates)
    usd_value = pnl * to_usd
    return usd_value / eur_usd if eur_usd else usd_value


def _to_usd_rate(currency: str, rates: dict) -> float:
    """
    Return how many USD 1 unit of currency buys.
    Checks both 'CCY/USD' and inverts 'USD/CCY' if needed.
    """
    direct = rates.get(f"{currency}/USD")
    if direct:
        return float(direct)
    inverse = rates.get(f"USD/{currency}")
    if inverse and float(inverse) > 0:
        return 1.0 / float(inverse)
    return 1.0  # fallback — no conversion


# ── Date formatting (European convention) ────────────────────

def format_date_eu(dt) -> str:
    """19/03/2026"""
    if not dt:
        return "—"
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    return dt.strftime("%d/%m/%Y")


def format_datetime_eu(dt) -> str:
    """19/03/2026 08:41"""
    if not dt:
        return "—"
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    return dt.strftime("%d/%m/%Y %H:%M")


def format_date_long(dt) -> str:
    """19 March 2026"""
    if not dt:
        return "—"
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    return dt.strftime("%-d %B %Y")
