"""
Exposure Forecasting — Phase 1
GET /api/forecasting/timeline/{company_id}

Returns exposures grouped by maturity month with EUR-converted amounts,
hedged/open split, and a summary strip (30/90/12-month open exposure).

Data sources and confidence levels are included on each item so the
frontend can render badges and icons without a second fetch.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import SessionLocal, get_rate
from datetime import date, timedelta
import os, sys
from calendar import month_abbr
from services.exposure_utils import calculate_hedge_pct

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

router = APIRouter(prefix="/api/forecasting", tags=["forecasting"])
security = HTTPBearer(auto_error=False)


# ── Inline auth (same pattern as all other routes) ───────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_token_payload(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    from jose import JWTError, jwt
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    secret = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
    try:
        return jwt.decode(credentials.credentials, secret, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def resolve_company_id(requested_id: int, payload: dict) -> int:
    if payload.get("role") in ("admin", "superadmin"):
        return requested_id
    token_cid = payload.get("company_id")
    if not token_cid:
        raise HTTPException(status_code=403, detail="No company assigned to this account")
    return int(token_cid)


# ── Helper ────────────────────────────────────────────────────────────────────

def _month_label(yr: int, mo: int) -> str:
    """'May 2026'"""
    return f"{month_abbr[mo]} {yr}"


def _month_key(yr: int, mo: int) -> str:
    """'2026-05'"""
    return f"{yr}-{mo:02d}"


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/timeline/{company_id}")
def get_forecasting_timeline(
    company_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(get_token_payload),
):
    """
    Returns all active, non-archived exposures grouped by maturity month.

    Amounts are EUR-converted using the same live-rate pivot as the enriched
    endpoint (from_currency → EUR via get_rate).  Confidence and data_source
    fields are passed through from the exposures table.
    """
    safe_id = resolve_company_id(company_id, payload)

    # Company base currency
    company_row = db.execute(
        text("SELECT base_currency FROM companies WHERE id = :cid"), {"cid": safe_id}
    ).fetchone()
    base_currency = company_row._mapping["base_currency"] if company_row else "EUR"

    # All active exposures with their actual hedged amount
    rows = db.execute(text("""
        SELECT
            e.id,
            e.from_currency,
            e.to_currency,
            e.amount,
            e.budget_rate,
            e.description,
            e.reference,
            COALESCE(e.end_date, e.due_date)           AS maturity_date,
            COALESCE(e.confidence, 'COMMITTED')         AS confidence,
            COALESCE(e.data_source, 'manual')           AS data_source,
            COALESCE(SUM(
                CASE WHEN ht.status IN ('executed', 'confirmed') AND (ht.is_settled IS NULL OR ht.is_settled = false)
                     THEN ht.amount ELSE 0 END
            ), 0)                                       AS hedged_amount
        FROM exposures e
        LEFT JOIN hedge_tranches ht ON ht.exposure_id = e.id
        WHERE e.company_id = :cid
          AND (e.is_active IS NULL OR e.is_active = true)
          AND (e.archived IS NULL OR e.archived = false)
          AND (e.is_settled IS NULL OR e.is_settled = false)
        GROUP BY e.id, e.from_currency, e.to_currency, e.amount, e.budget_rate,
                 e.description, e.reference, maturity_date, e.confidence, e.data_source
        ORDER BY maturity_date ASC NULLS LAST
    """), {"cid": safe_id}).fetchall()

    today = date.today()

    # ── EUR conversion — one get_rate() call per unique from_currency ─────────
    # get_rate() uses the in-memory 5-min cache — effectively free.
    unique_ccys = list(dict.fromkeys(
        r._mapping["from_currency"] for r in rows
        if r._mapping["from_currency"] != base_currency
    ))
    eur_rates: dict[str, float] = {}
    for ccy in unique_ccys:
        rate = get_rate(ccy, base_currency)  # synchronous — uses in-memory cache
        if rate is not None:
            eur_rates[ccy] = float(rate)

    def to_base(amount: float, from_ccy: str) -> float:
        if from_ccy == base_currency:
            return amount
        r = eur_rates.get(from_ccy)
        return amount * r if r else amount  # fallback: use raw (logs as warning implicitly)

    # ── Group by maturity month ───────────────────────────────────────────────
    months: dict[str, dict] = {}  # key = "2026-05"

    total_exposure_eur  = 0.0
    next_30_open_eur    = 0.0
    next_90_open_eur    = 0.0
    next_12m_open_eur   = 0.0
    total_hedged_eur    = 0.0
    exposure_count      = 0

    for row in rows:
        r = row._mapping
        amount       = float(r["amount"] or 0)
        hedged       = float(r["hedged_amount"] or 0)
        open_amt     = max(amount - hedged, 0)
        from_ccy     = r["from_currency"]
        mat_date     = r["maturity_date"]

        amount_eur = to_base(amount, from_ccy)
        hedged_eur = to_base(hedged, from_ccy)
        open_eur   = to_base(open_amt, from_ccy)
        hedge_pct  = calculate_hedge_pct(hedged, amount)

        total_exposure_eur += amount_eur
        total_hedged_eur   += hedged_eur
        exposure_count     += 1

        # Summary strip windows
        if mat_date:
            delta = (mat_date - today).days
            if delta <= 30:
                next_30_open_eur  += open_eur
            if delta <= 90:
                next_90_open_eur  += open_eur
            if delta <= 365:
                next_12m_open_eur += open_eur

        # Bucket into month
        if mat_date:
            mk = _month_key(mat_date.year, mat_date.month)
            label = _month_label(mat_date.year, mat_date.month)
        else:
            mk    = "no-date"
            label = "No maturity date"

        if mk not in months:
            months[mk] = {
                "month":            mk,
                "label":            label,
                "exposures":        [],
                "total_open_eur":   0.0,
                "total_hedged_eur": 0.0,
            }

        months[mk]["exposures"].append({
            "id":           r["id"],
            "pair":         f"{r['from_currency']}/{r['to_currency']}",
            "amount_eur":   round(amount_eur, 2),
            "open_eur":     round(open_eur, 2),
            "hedged_eur":   round(hedged_eur, 2),
            "hedge_pct":    hedge_pct,
            "confidence":   r["confidence"],
            "data_source":  r["data_source"],
            "maturity_date": mat_date.isoformat() if mat_date else None,
            "description":  r.get("description") or "",
            "reference":    r.get("reference") or "",
        })
        months[mk]["total_open_eur"]   += open_eur
        months[mk]["total_hedged_eur"] += hedged_eur

    # Round month totals
    for m in months.values():
        m["total_open_eur"]   = round(m["total_open_eur"], 2)
        m["total_hedged_eur"] = round(m["total_hedged_eur"], 2)

    avg_hedge_coverage = round(
        (total_hedged_eur / total_exposure_eur * 100) if total_exposure_eur > 0 else 0, 1
    )

    return {
        "timeline": list(months.values()),
        "summary": {
            "total_exposure_eur":  round(total_exposure_eur, 2),
            "next_30_days_eur":    round(next_30_open_eur, 2),
            "next_90_days_eur":    round(next_90_open_eur, 2),
            "next_12_months_eur":  round(next_12m_open_eur, 2),
            "avg_hedge_coverage":  avg_hedge_coverage,
            "base_currency":       base_currency,
        },
    }
