"""
Golden-input tests for calculate_pnl_split.
Sign convention: positive = favourable for the company.
Payable:    favourable when rate falls (pay less than budgeted)
Receivable: favourable when rate rises (receive more than budgeted)

Approved golden numbers — Finn · Treasury sign-off 02/06/2026.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from routes.hedge_tranche_routes import calculate_pnl_split


def test_payable_partial_hedge_positive_pnl():
    """
    EUR/NOK payable. Budget 11.52, spot 11.13.
    500,000 hedged at 11.40 (below budget = favourable for payable).
    Locked: (11.52 - 11.40) × 500,000 = +60,000
    Floating: (11.52 - 11.13) × 500,000 = +195,000
    Combined: +255,000
    """
    exposure = {
        "amount": 1_000_000,
        "budget_rate": 11.52,
        "exposure_type": "payable",
        "from_currency": "EUR",
        "to_currency": "NOK",
        "amount_currency": "EUR",
    }
    tranches = [
        {"amount": 500_000, "rate": 11.40, "status": "executed"},
    ]
    result = calculate_pnl_split(exposure, tranches, current_spot=11.13)
    assert result["locked_pnl"] == 60_000.00
    assert result["floating_pnl"] == 195_000.00
    assert result["combined_pnl"] == 255_000.00
    assert result["hedge_pct"] == 50.0


def test_receivable_fully_hedged():
    """
    EUR/USD receivable. Budget 1.05, fully hedged at 1.08.
    Locked: (1.08 - 1.05) × 1,000,000 = +30,000
    Floating: nothing open = 0
    Combined: +30,000
    """
    exposure = {
        "amount": 1_000_000,
        "budget_rate": 1.05,
        "exposure_type": "receivable",
        "from_currency": "EUR",
        "to_currency": "USD",
        "amount_currency": "EUR",
    }
    tranches = [
        {"amount": 1_000_000, "rate": 1.08, "status": "executed"},
    ]
    result = calculate_pnl_split(exposure, tranches, current_spot=1.10)
    assert result["locked_pnl"] == 30_000.00
    assert result["floating_pnl"] == 0.0
    assert result["combined_pnl"] == 30_000.00
    assert result["hedge_pct"] == 100.0


def test_pending_tranches_excluded_from_pnl():
    """
    Pending tranches must not count toward locked P&L or hedge coverage.
    """
    exposure = {
        "amount": 1_000_000,
        "budget_rate": 1.10,
        "exposure_type": "payable",
        "from_currency": "EUR",
        "to_currency": "USD",
        "amount_currency": "EUR",
    }
    tranches = [
        {"amount": 500_000, "rate": 1.08, "status": "executed"},
        {"amount": 500_000, "rate": 1.07, "status": "pending"},  # must be ignored
    ]
    result = calculate_pnl_split(exposure, tranches, current_spot=1.09)
    assert result["hedged_amount"] == 500_000.00
    assert result["hedge_pct"] == 50.0


def test_zero_budget_rate_no_crash():
    """Edge case — missing budget rate must not crash, must return zeros."""
    exposure = {
        "amount": 1_000_000,
        "budget_rate": None,
        "exposure_type": "payable",
        "from_currency": "EUR",
        "to_currency": "USD",
        "amount_currency": "EUR",
    }
    tranches = []
    result = calculate_pnl_split(exposure, tranches, current_spot=1.10)
    assert result["locked_pnl"] == 0.0
    assert result["floating_pnl"] == 0.0
