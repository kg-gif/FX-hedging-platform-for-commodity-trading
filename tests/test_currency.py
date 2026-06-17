"""
Golden-input tests for EUR conversion utilities.
Approved numbers — Finn · Treasury sign-off 02/06/2026.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services.currency_utils import (
    to_eur, pnl_to_eur, format_pnl,
    format_date_eu, format_datetime_eu, format_date_long,
)
from datetime import datetime


# ── EUR conversion ───────────────────────────────────────────────────────────

def test_eur_passthrough():
    """EUR amount needs no conversion."""
    rates = {"EUR/USD": 1.08}
    assert to_eur(1_000_000, "EUR", "USD", rates) == 1_000_000


def test_gbp_to_eur():
    """1M GBP. GBP/USD=1.27, EUR/USD=1.08. EUR = 1,270,000 / 1.08 = 1,175,925.93"""
    rates = {"GBP/USD": 1.27, "EUR/USD": 1.08}
    result = to_eur(1_000_000, "GBP", "USD", rates)
    assert abs(result - 1_175_925.93) < 1.0


def test_to_eur_direct_pair():
    """GBP → EUR (to_currency == EUR). Same arithmetic, different routing branch."""
    rates = {"GBP/USD": 1.27, "EUR/USD": 1.08}
    result = to_eur(1_000_000, "GBP", "EUR", rates)
    assert abs(result - 1_175_925.93) < 1.0


def test_inverse_rate_lookup():
    """
    _to_usd_rate inverts USD/NOK when NOK/USD is absent.
    USD/NOK=10.50 → NOK/USD=0.09524. 1M NOK in EUR = 95,238 / 1.08 = 88,183.43
    """
    rates = {"USD/NOK": 10.50, "EUR/USD": 1.08}
    result = to_eur(1_000_000, "NOK", "USD", rates)
    assert abs(result - 88_183.43) < 1.0


# ── P&L conversion ───────────────────────────────────────────────────────────

def test_pnl_usd_to_eur():
    """100,000 USD P&L. EUR/USD=1.08. EUR = 100,000 / 1.08 = 92,592.59"""
    rates = {"EUR/USD": 1.08}
    result = pnl_to_eur(100_000, "USD", rates)
    assert abs(result - 92_592.59) < 1.0


def test_pnl_eur_passthrough():
    """EUR P&L needs no conversion."""
    rates = {"EUR/USD": 1.08}
    assert pnl_to_eur(50_000, "EUR", rates) == 50_000


def test_pnl_non_usd_cross():
    """100,000 GBP P&L. GBP/USD=1.27, EUR/USD=1.08. EUR = 127,000 / 1.08 = 117,592.59"""
    rates = {"GBP/USD": 1.27, "EUR/USD": 1.08}
    result = pnl_to_eur(100_000, "GBP", rates)
    assert abs(result - 117_592.59) < 1.0


# ── format_pnl ───────────────────────────────────────────────────────────────

def test_format_pnl_positive_eur():
    assert format_pnl(42_000, "EUR") == "+€42,000"


def test_format_pnl_negative_gbp():
    assert format_pnl(-124_529, "GBP") == "-£124,529"


def test_format_pnl_negative_nok():
    assert format_pnl(-8_000, "NOK") == "-kr8,000"


# ── Date formatting ──────────────────────────────────────────────────────────

def test_format_date_eu_from_datetime():
    assert format_date_eu(datetime(2026, 3, 19, 8, 41, 0)) == "19/03/2026"


def test_format_date_eu_none():
    assert format_date_eu(None) == "—"


def test_format_datetime_eu():
    assert format_datetime_eu(datetime(2026, 3, 19, 8, 41, 0)) == "19/03/2026 08:41"


def test_format_date_long():
    assert format_date_long(datetime(2026, 3, 19)) == "19 March 2026"


def test_format_date_eu_from_iso_string():
    """String branch: format_date_eu accepts ISO 8601 string."""
    assert format_date_eu("2026-03-19T08:41:00") == "19/03/2026"


def test_format_datetime_eu_from_string():
    assert format_datetime_eu("2026-03-19T08:41:00") == "19/03/2026 08:41"


def test_format_date_long_from_string():
    assert format_date_long("2026-03-19T00:00:00") == "19 March 2026"


def test_to_eur_no_rate_fallback():
    """_to_usd_rate fallback: when no CCY/USD or USD/CCY rate exists, returns 1.0."""
    rates = {"EUR/USD": 1.08}  # no NOK rate at all
    result = to_eur(1_000_000, "NOK", "USD", rates)
    # fallback = 1.0, so USD value = 1M, EUR = 1M / 1.08
    assert abs(result - 925_925.93) < 1.0
