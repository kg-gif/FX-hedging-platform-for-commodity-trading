"""
routes/market_report_routes.py

Endpoints for AI-generated weekly FX market reports.

GET  /api/reports/market/{company_id}          — latest report
GET  /api/reports/market/{company_id}/history  — last 12 reports
POST /api/reports/market/generate/{company_id} — superadmin: generate on demand
POST /api/reports/market/generate-all          — cron: generate + email all companies
     (cron-job.org: every Monday 06:00 UTC)
"""

import logging
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

router   = APIRouter(prefix="/api/reports/market", tags=["market-reports"])
security = HTTPBearer()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def get_db():
    from database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from routes.auth_routes import decode_token
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


def resolve_company_id(requested_id: int, payload: dict) -> int:
    role = payload.get("role", "")
    if role in ("superadmin", "admin"):
        return requested_id
    token_company_id = payload.get("company_id")
    if not token_company_id:
        raise HTTPException(status_code=403, detail="No company assigned to this account")
    return int(token_company_id)


# ── GET latest report ─────────────────────────────────────────────────────────

@router.get("/{company_id}")
def get_latest_report(
    company_id: int,
    payload: dict = Depends(require_auth),
    db: Session   = Depends(get_db),
):
    """Return the most recent market report for a company."""
    safe_id = resolve_company_id(company_id, payload)

    row = db.execute(text("""
        SELECT id, company_id, report_date, report_type,
               content_json, generated_at, delivered_at
        FROM market_reports
        WHERE company_id = :cid
          AND (is_active IS NULL OR is_active = true)
        ORDER BY generated_at DESC
        LIMIT 1
    """), {"cid": safe_id}).fetchone()

    if not row:
        return {"report": None}

    r = row._mapping
    return {
        "report": {
            "id":           r["id"],
            "company_id":   r["company_id"],
            "report_date":  r["report_date"].isoformat() if r["report_date"] else None,
            "report_type":  r["report_type"],
            "content":      r["content_json"],
            "generated_at": r["generated_at"].isoformat() if r["generated_at"] else None,
            "delivered_at": r["delivered_at"].isoformat() if r["delivered_at"] else None,
        }
    }


# ── GET report history ────────────────────────────────────────────────────────

@router.get("/{company_id}/history")
def get_report_history(
    company_id: int,
    payload: dict = Depends(require_auth),
    db: Session   = Depends(get_db),
):
    """List the last 12 market reports for a company (date + headline only)."""
    safe_id = resolve_company_id(company_id, payload)

    rows = db.execute(text("""
        SELECT id, report_date, generated_at,
               content_json->>'headline' AS headline
        FROM market_reports
        WHERE company_id = :cid
          AND (is_active IS NULL OR is_active = true)
        ORDER BY generated_at DESC
        LIMIT 12
    """), {"cid": safe_id}).fetchall()

    return {
        "history": [
            {
                "id":           r._mapping["id"],
                "report_date":  r._mapping["report_date"].isoformat() if r._mapping["report_date"] else None,
                "generated_at": r._mapping["generated_at"].isoformat() if r._mapping["generated_at"] else None,
                "headline":     r._mapping["headline"],
            }
            for r in rows
        ]
    }


# ── POST generate single report (superadmin / on-demand) ─────────────────────

@router.post("/generate/{company_id}")
async def generate_report(
    company_id: int,
    payload: dict = Depends(require_auth),
    db: Session   = Depends(get_db),
):
    """Generate a fresh market report for one company. Superadmin only."""
    if payload.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Superadmin access required")

    from services.market_report_service import generate_market_report
    try:
        report = await generate_market_report(company_id, db)
        return {"success": True, "report": report}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Report generation failed for company {company_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


# ── POST generate-all (weekly cron) ──────────────────────────────────────────

@router.post("/generate-all")
async def generate_all_reports(
    payload: dict = Depends(require_auth),
    db: Session   = Depends(get_db),
):
    """
    Weekly cron endpoint — generates and emails reports for all active companies.
    Triggered by cron-job.org every Monday 06:00 UTC:
      POST https://birk-fx-api.onrender.com/api/reports/market/generate-all
    """
    if payload.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Superadmin access required")

    from services.market_report_service import generate_market_report, send_market_report_email

    companies = db.execute(text("""
        SELECT id, name, alert_email
        FROM companies
        WHERE (is_active IS NULL OR is_active = true)
        ORDER BY id
    """)).fetchall()

    results = []
    for company in companies:
        cid         = company._mapping["id"]
        cname       = company._mapping["name"]
        alert_email = company._mapping["alert_email"]
        try:
            report     = await generate_market_report(cid, db)
            email_sent = False
            if alert_email:
                email_sent = await send_market_report_email(report, alert_email, cname)
                if email_sent:
                    db.execute(text(
                        "UPDATE market_reports SET delivered_at = NOW() WHERE id = :rid"
                    ), {"rid": report["id"]})
                    db.commit()
            results.append({
                "company_id": cid, "company": cname,
                "status": "ok", "email_sent": email_sent,
            })
        except Exception as e:
            logger.error(f"generate-all: failed for {cname} (id={cid}): {e}")
            results.append({
                "company_id": cid, "company": cname,
                "status": "error", "error": str(e),
            })

    ok_count = sum(1 for r in results if r["status"] == "ok")
    return {"generated": ok_count, "total": len(results), "results": results}
