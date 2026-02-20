import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
from services.pdf_service import generate_currency_plan_pdf

router = APIRouter()


@router.get("/api/reports/currency-plan")
def get_currency_plan(company_id: int = Query(1), db: Session = Depends(get_db)):
    # ── Fetch exposures ──────────────────────────────────────────────────────
    rows = db.execute(
        sa.text("SELECT * FROM exposures WHERE company_id = :cid"),
        {"cid": company_id}
    ).fetchall()

    exposures = []
    for row in rows:
        m = row._mapping
        exposures.append({
            "id":                m["id"],
            "from_currency":     m["from_currency"],
            "to_currency":       m["to_currency"],
            "amount":            m["amount"],
            "budget_rate":       m["budget_rate"],
            "current_rate":      m["current_rate"],
            "hedge_ratio_policy": m["hedge_ratio_policy"],
            "hedged_amount":     m["hedged_amount"],
            "end_date":          str(m["end_date"]) if m["end_date"] else "TBC",
        })

    # ── Fetch active policy ──────────────────────────────────────────────────
    policy_row = db.execute(
        sa.text(
            "SELECT * FROM hedging_policies "
            "WHERE company_id = :cid AND is_active = true LIMIT 1"
        ),
        {"cid": company_id}
    ).fetchone()

    active_policy = None
    if policy_row:
        pm = policy_row._mapping
        active_policy = {
            "id":                    pm["id"],
            "name":                  pm.get("name", "Balanced"),
            "hedge_ratio_over_5m":   pm.get("hedge_ratio_over_5m", 0.85),
            "hedge_ratio_1m_to_5m":  pm.get("hedge_ratio_1m_to_5m", 0.65),
            "hedge_ratio_under_1m":  pm.get("hedge_ratio_under_1m", 0.45),
        }

    # ── Build recommendations ────────────────────────────────────────────────
    recommendations = []
    if active_policy:
        for exp in exposures:
            amt = exp.get("amount", 0) or 0
            current_hedge = float(exp.get("hedge_ratio_policy", 0) or 0)

    if amt >= 5_000_000:
        target = float(active_policy["hedge_ratio_over_5m"])
    elif amt >= 1_000_000:
        target = float(active_policy["hedge_ratio_1m_to_5m"])
    else:
        target = float(active_policy["hedge_ratio_under_1m"])

    if current_hedge < target - 0.05:
                action = "INCREASE HEDGE"
    elif current_hedge > target + 0.05:
                action = "REDUCE HEDGE"
    else:
        action = "MAINTAIN"

    recommendations.append({
                "exposure_id":        exp["id"],
                "target_hedge_ratio": target,
                "instrument":         "3-month forward",
                "action":             action,
            })

    # ── Fetch company name ───────────────────────────────────────────────────
    try:
        co_row = db.execute(
            sa.text("SELECT name FROM companies WHERE id = :cid LIMIT 1"),
            {"cid": company_id}
        ).fetchone()
        company_name = co_row._mapping["name"] if co_row else "BIRK Commodities A/S"
    except Exception:
        company_name = "BIRK Commodities A/S"

    # ── Generate and return PDF ──────────────────────────────────────────────
    pdf_bytes = generate_currency_plan_pdf(
        exposures, recommendations, active_policy, company_name
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f"attachment; filename=currency-plan-{company_id}.pdf"
        }
    )