"""
Hedge coverage % — pending tranches must be excluded.
Approved — Finn · Treasury sign-off 02/06/2026.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from routes.hedge_tranche_routes import calculate_pnl_split


def test_coverage_excludes_pending():
    """
    1,000,000 exposure.
    300,000 executed + 200,000 confirmed + 100,000 pending.
    Coverage = 500,000 / 1,000,000 = 50%. Pending excluded.
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
        {"amount": 300_000, "rate": 1.09, "status": "executed"},
        {"amount": 200_000, "rate": 1.08, "status": "confirmed"},
        {"amount": 100_000, "rate": 1.07, "status": "pending"},
    ]
    result = calculate_pnl_split(exposure, tranches, current_spot=1.09)
    assert result["hedge_pct"] == 50.0
    assert result["hedged_amount"] == 500_000.0
