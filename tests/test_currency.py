"""
Golden-input tests for EUR conversion utilities.
Approved numbers — Finn · Treasury sign-off 02/06/2026.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services.currency_utils import to_eur, pnl_to_eur


def test_eur_passthrough():
    """EUR amount needs no conversion."""
    rates = {"EUR/USD": 1.08}
    assert to_eur(1_000_000, "EUR", "USD", rates) == 1_000_000


def test_gbp_to_eur():
    """
    1,000,000 GBP. GBP/USD = 1.27, EUR/USD = 1.08.
    USD value = 1,270,000. EUR value = 1,270,000 / 1.08 = 1,175,925.93
    """
    rates = {"GBP/USD": 1.27, "EUR/USD": 1.08}
    result = to_eur(1_000_000, "GBP", "USD", rates)
    assert abs(result - 1_175_925.93) < 1.0  # within 1 EUR


def test_pnl_usd_to_eur():
    """100,000 USD P&L. EUR/USD = 1.08. EUR P&L = 100,000 / 1.08 = 92,592.59"""
    rates = {"EUR/USD": 1.08}
    result = pnl_to_eur(100_000, "USD", rates)
    assert abs(result - 92_592.59) < 1.0


def test_pnl_eur_passthrough():
    """EUR P&L needs no conversion."""
    rates = {"EUR/USD": 1.08}
    assert pnl_to_eur(50_000, "EUR", rates) == 50_000
