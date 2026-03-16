import asyncio
import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
from services.pdf_service import generate_currency_plan_pdf

router = APIRouter()


@router.get("/api/reports/currency-plan")
async def get_currency_plan(company_id: int = Query(1), db: Session = Depends(get_db)):
    from birk_api import fetch_fx_rate

    # ── Fetch active, non-archived exposures ────────────────────────────────
    rows = db.execute(
        sa.text(
            "SELECT * FROM exposures "
            "WHERE company_id = :cid "
            "AND is_active IS TRUE "
            "AND (archived IS NULL OR archived = false)"
        ),
        {"cid": company_id}
    ).fetchall()

    # ── Fetch company name and base currency ─────────────────────────────────
    try:
        co_row = db.execute(
            sa.text("SELECT name, base_currency FROM companies WHERE id = :cid LIMIT 1"),
            {"cid": company_id}
        ).fetchone()
        company_name  = co_row._mapping["name"]         if co_row else "BIRK Commodities A/S"
        base_currency = (co_row._mapping.get("base_currency") or "USD") if co_row else "USD"
    except Exception:
        company_name  = "BIRK Commodities A/S"
        base_currency = "USD"

    # ── Fetch USD pivot rates for base-currency conversion ───────────────────
    # from_ccy/base = (from_ccy/USD) / (base/USD)  — avoids stale cross-rate cache
    unique_from_ccys = list(dict.fromkeys([
        row._mapping["from_currency"] for row in rows
        if row._mapping["from_currency"] != base_currency
    ]))
    ccys_for_usd = list(dict.fromkeys(
        unique_from_ccys + ([base_currency] if base_currency != "USD" else [])
    ))
    usd_rate_map: dict = {}
    if ccys_for_usd:
        usd_results = await asyncio.gather(
            *[fetch_fx_rate(ccy, "USD") for ccy in ccys_for_usd],
            return_exceptions=True
        )
        for ccy, rate_val in zip(ccys_for_usd, usd_results):
            if not isinstance(rate_val, Exception) and rate_val is not None:
                usd_rate_map[ccy] = float(rate_val)
    base_usd = usd_rate_map.get(base_currency, 1.0) if base_currency != "USD" else 1.0

    # ── Also fetch live spot rates for each exposure pair ───────────────────
    exp_pairs = list(dict.fromkeys([
        f"{row._mapping['from_currency']}/{row._mapping['to_currency']}"
        for row in rows
    ]))
    spot_results = await asyncio.gather(
        *[fetch_fx_rate(*pair.split("/")) for pair in exp_pairs],
        return_exceptions=True
    )
    live_spot: dict = {}
    for pair, rate_val in zip(exp_pairs, spot_results):
        if not isinstance(rate_val, Exception) and rate_val is not None:
            live_spot[pair] = float(rate_val)

    # ── Build exposure list with actual tranche data ─────────────────────────
    exposures = []
    for row in rows:
        m = row._mapping
        exp_id       = m["id"]
        from_ccy     = m["from_currency"]
        to_ccy       = m["to_currency"]
        raw_amount   = float(m["amount"] or 0)
        budget_rate  = float(m["budget_rate"] or 0)
        pair         = f"{from_ccy}/{to_ccy}"
        current_rate = live_spot.get(pair) or float(m["current_rate"] or 0)

        # Normalise amount to from_currency
        amount_currency = m.get("amount_currency") or from_ccy
        if amount_currency.upper() != from_ccy.upper() and budget_rate > 0:
            total_amount = raw_amount / budget_rate  # convert quote→base
        else:
            total_amount = raw_amount

        # Fetch actual executed/confirmed tranches
        tranche_rows = db.execute(sa.text("""
            SELECT amount, rate FROM hedge_tranches
            WHERE exposure_id = :eid
              AND status IN ('executed', 'confirmed')
        """), {"eid": exp_id}).fetchall()

        actual_hedged  = sum(float(t._mapping["amount"] or 0) for t in tranche_rows)
        actual_hedge_ratio = (actual_hedged / total_amount) if total_amount > 0 else 0.0
        pair = f"{from_ccy}/{to_ccy}"
        print(f"[currency-plan] {pair}: hedged={actual_hedged:,.0f} total={total_amount:,.0f} pct={actual_hedge_ratio*100:.1f}%")

        # P&L: locked (crystallised) + floating (open portion vs current spot)
        locked_pnl = sum(
            (float(t._mapping["rate"] or 0) - budget_rate) * float(t._mapping["amount"] or 0)
            for t in tranche_rows
        )
        open_amount  = max(total_amount - actual_hedged, 0)
        floating_pnl = (current_rate - budget_rate) * open_amount if current_rate else 0.0
        combined_pnl = locked_pnl + floating_pnl

        # Amount in base_currency for portfolio total
        if from_ccy == base_currency:
            amount_in_base = total_amount
        elif from_ccy == "USD":
            amount_in_base = total_amount / base_usd if base_usd else total_amount
        else:
            from_usd = usd_rate_map.get(from_ccy)
            amount_in_base = (total_amount * from_usd / base_usd) if (from_usd and base_usd) else total_amount

        exposures.append({
            "id":                 exp_id,
            "from_currency":      from_ccy,
            "to_currency":        to_ccy,
            "amount":             total_amount,
            "amount_in_base":     amount_in_base,
            "budget_rate":        budget_rate,
            "current_rate":       current_rate,
            "hedge_ratio_policy": m.get("hedge_ratio_policy", 0) or 0,  # policy target
            "actual_hedge_ratio": actual_hedge_ratio,                    # real coverage
            "actual_hedged":      actual_hedged,
            "locked_pnl":         locked_pnl,
            "floating_pnl":       floating_pnl,
            "pnl":                combined_pnl,
            "end_date":           str(m["end_date"]) if m["end_date"] else "TBC",
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
            "name":                  pm.get("policy_name") or pm.get("name") or "Balanced",
            "hedge_ratio_over_5m":   pm.get("hedge_ratio_over_5m", 0.85),
            "hedge_ratio_1m_to_5m":  pm.get("hedge_ratio_1m_to_5m", 0.65),
            "hedge_ratio_under_1m":  pm.get("hedge_ratio_under_1m", 0.45),
        }
        print(f"[currency-plan] policy='{active_policy['name']}' "
              f">5M={active_policy['hedge_ratio_over_5m']:.0%} "
              f"1-5M={active_policy['hedge_ratio_1m_to_5m']:.0%} "
              f"<1M={active_policy['hedge_ratio_under_1m']:.0%}")

    # ── Build recommendations (based on actual hedge ratio vs policy target) ─
    recommendations = []
    if active_policy:
        for exp in exposures:
            amt          = exp["amount"]
            actual_hedge = exp["actual_hedge_ratio"]

            if amt >= 5_000_000:
                target = float(active_policy["hedge_ratio_over_5m"])
            elif amt >= 1_000_000:
                target = float(active_policy["hedge_ratio_1m_to_5m"])
            else:
                target = float(active_policy["hedge_ratio_under_1m"])

            if actual_hedge < target - 0.05:
                action = "INCREASE HEDGE"
            elif actual_hedge > target + 0.05:
                action = "REDUCE HEDGE"
            else:
                action = "MAINTAIN"

            recommendations.append({
                "exposure_id":        exp["id"],
                "target_hedge_ratio": target,
                "instrument":         "3-month forward",
                "action":             action,
            })

    # ── Generate and return PDF ──────────────────────────────────────────────
    pdf_bytes = generate_currency_plan_pdf(
        exposures, recommendations, active_policy, company_name, base_currency
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f"attachment; filename=currency-plan-{company_id}.pdf"
        }
    )
