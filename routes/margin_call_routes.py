"""
Margin Call Awareness — Phase 1

Detects forward tranches where unrealised MTM loss vs inception exceeds a
configurable threshold (% of notional).  Logs every alert and sends email
via Resend.  No bank API integration in Phase 1.

Key rules:
  - Only negative MTM vs inception triggers a flag (positive = position onside)
  - 24-hour cooldown per tranche to prevent email spam
  - Recipients: all company users OR admins/superadmins only (configurable)
  - notional_eur is stored in mtm_snapshot_log by the MTM endpoint so this
    module never needs to make live FX rate calls

See BACKLOG.md for Phase 2 (bank credit line + ISDA margin calculation).
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import SessionLocal
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/margin-call", tags=["Margin Call"])
_security = HTTPBearer(auto_error=False)


# ── Inline auth (same pattern as other routes) ───────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_token_payload(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> dict:
    from jose import JWTError, jwt
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _resolve_company_id(requested_id: int, payload: dict) -> int:
    """superadmin / admin bypass; all other roles restricted to own company."""
    if payload.get("role") in ("superadmin", "admin"):
        return requested_id
    token_cid = payload.get("company_id")
    if not token_cid:
        raise HTTPException(status_code=403, detail="No company assigned")
    return int(token_cid)


# ── Core detection logic ──────────────────────────────────────────────────────

def check_margin_call_risk(
    mtm_vs_inception_eur: float,
    notional_eur: float,
    threshold_pct: float,
    instrument_type: str = "forward",
) -> bool:
    """
    Returns True if a forward tranche is AT RISK of a margin call.

    Conditions (all must be true):
      1. Instrument is a forward (see instrument guard below)
      2. MTM vs inception is negative (position has moved against you)
      3. The loss as a % of notional >= configured threshold

    Args:
        mtm_vs_inception_eur: Unrealised P&L in EUR vs inception rate (negative = loss)
        notional_eur:         Tranche notional in EUR
        threshold_pct:        Alert threshold, e.g. 2.0 = 2% of notional
        instrument_type:      Instrument type string; defaults to "forward"
    """
    # Margin call risk applies to forward contracts only.
    # Spot transactions settle in T+2 and carry no ongoing margin obligation.
    # Options: excluded in Phase 1, revisit if clients use vanilla options.
    if instrument_type.lower() != "forward":
        return False

    if mtm_vs_inception_eur is None or notional_eur is None or notional_eur <= 0:
        return False
    if mtm_vs_inception_eur >= 0:
        return False  # Positive MTM = onside, no margin call risk
    mtm_loss_pct = (mtm_vs_inception_eur / notional_eur) * 100  # negative value
    return mtm_loss_pct <= -abs(threshold_pct)


# ── Status endpoint ───────────────────────────────────────────────────────────

@router.get("/status/{company_id}")
async def get_margin_call_status(
    company_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(_get_token_payload),
):
    """
    GET /api/margin-call/status/{company_id}

    Returns all forward tranches currently AT RISK of a margin call, using
    the most recent MTM snapshot stored in mtm_snapshot_log.

    Does NOT send emails — that is handled by send_margin_call_alerts_for_company
    (called from daily cron and as a background task after each MTM fetch).
    """
    safe_id = _resolve_company_id(company_id, payload)

    # Company threshold (defaults to 2.0% if column not yet set)
    company_row = db.execute(
        text("SELECT mc_alert_threshold_pct FROM companies WHERE id = :cid"),
        {"cid": safe_id},
    ).fetchone()
    threshold_pct = float(company_row._mapping["mc_alert_threshold_pct"] or 2.0) if company_row else 2.0

    # Latest MTM snapshot per tranche — only executed/confirmed Forwards
    rows = db.execute(text("""
        SELECT DISTINCT ON (m.tranche_id)
            m.tranche_id,
            m.exposure_id,
            m.mtm_vs_inception_eur,
            m.notional_eur,
            m.spot_rate_used,
            m.inception_rate,
            m.calculated_at,
            ht.amount        AS notional,
            ht.rate          AS tranche_rate,
            e.from_currency,
            e.to_currency
        FROM mtm_snapshot_log m
        JOIN hedge_tranches ht ON ht.id = m.tranche_id
        JOIN exposures e       ON e.id  = m.exposure_id
        WHERE m.company_id = :cid
          AND ht.status IN ('executed', 'confirmed')
          AND LOWER(ht.instrument) = 'forward'
          AND m.notional_eur IS NOT NULL
        ORDER BY m.tranche_id, m.calculated_at DESC
    """), {"cid": safe_id}).fetchall()

    at_risk = []
    for r in rows:
        m           = r._mapping
        mtm         = float(m["mtm_vs_inception_eur"]) if m["mtm_vs_inception_eur"] is not None else None
        notional_eur = float(m["notional_eur"])         if m["notional_eur"]         is not None else None

        if not check_margin_call_risk(mtm, notional_eur, threshold_pct):
            continue

        loss_pct = (mtm / notional_eur) * 100
        at_risk.append({
            "tranche_id":           m["tranche_id"],
            "exposure_id":          m["exposure_id"],
            "pair":                 f"{m['from_currency']}/{m['to_currency']}",
            "notional":             float(m["notional"] or 0),
            "notional_eur":         round(notional_eur, 2),
            "inception_rate":       float(m["inception_rate"] or m["tranche_rate"] or 0),
            "current_spot":         float(m["spot_rate_used"] or 0),
            "mtm_vs_inception_eur": round(mtm, 2),
            "mtm_loss_pct":         round(loss_pct, 2),
            "threshold_pct":        threshold_pct,
            "status":               "AT_RISK",
        })

    total_at_risk_eur = sum(r["notional_eur"] for r in at_risk)

    return {
        "company_id":                safe_id,
        "threshold_pct":             threshold_pct,
        "at_risk_count":             len(at_risk),
        "total_exposure_at_risk_eur": round(total_at_risk_eur, 2),
        "tranches":                  at_risk,
    }


# ── Alert sender ──────────────────────────────────────────────────────────────

async def send_margin_call_alerts_for_company(company_id: int, db) -> dict:
    """
    Check all forward tranches for the company against the MC threshold.
    Send email for any at-risk tranche with no alert sent in the last 24 hours.
    Writes a row to margin_call_alert_log for every at-risk tranche (audit trail).

    Called from:
      - Daily cron (/api/alerts/send-daily)
      - Background task after each MTM fetch (trigger_margin_call_check)
    """
    import httpx

    print(f"[mc-alert] send_margin_call_alerts_for_company called for company_id={company_id}")
    resend_api_key = os.getenv("RESEND_API_KEY")
    frontend_url   = os.getenv("FRONTEND_URL", "https://birk-dashboard.onrender.com")
    print(f"[mc-alert] RESEND_API_KEY present={bool(resend_api_key)}")

    # Company settings
    company_row = db.execute(
        text("SELECT name, mc_alert_threshold_pct, mc_alert_recipients FROM companies WHERE id = :cid"),
        {"cid": company_id},
    ).fetchone()
    if not company_row:
        return {"status": "skipped", "reason": "company not found"}

    c              = company_row._mapping
    company_name   = c["name"]
    threshold_pct  = float(c["mc_alert_threshold_pct"] or 2.0)
    recipients_cfg = c["mc_alert_recipients"] or "all"

    # Recipient emails — 'all' or 'admins_only'
    if recipients_cfg == "admins_only":
        email_rows = db.execute(text(
            "SELECT email FROM users WHERE company_id = :cid "
            "AND role IN ('admin', 'superadmin', 'company_admin')"
        ), {"cid": company_id}).fetchall()
    else:
        email_rows = db.execute(
            text("SELECT email FROM users WHERE company_id = :cid"),
            {"cid": company_id},
        ).fetchall()

    recipient_emails = [r._mapping["email"] for r in email_rows]
    if not recipient_emails:
        return {"status": "skipped", "reason": "no recipients configured"}

    # Latest MTM snapshot per tranche (only executed/confirmed Forwards with notional_eur stored)
    rows = db.execute(text("""
        SELECT DISTINCT ON (m.tranche_id)
            m.tranche_id,
            m.mtm_vs_inception_eur,
            m.notional_eur,
            m.spot_rate_used,
            m.inception_rate,
            ht.amount    AS notional,
            e.from_currency,
            e.to_currency
        FROM mtm_snapshot_log m
        JOIN hedge_tranches ht ON ht.id = m.tranche_id
        JOIN exposures e       ON e.id  = m.exposure_id
        WHERE m.company_id = :cid
          AND ht.status IN ('executed', 'confirmed')
          AND LOWER(ht.instrument) = 'forward'
          AND m.notional_eur IS NOT NULL
        ORDER BY m.tranche_id, m.calculated_at DESC
    """), {"cid": company_id}).fetchall()

    alerts_sent = 0

    for r in rows:
        m            = r._mapping
        mtm          = float(m["mtm_vs_inception_eur"]) if m["mtm_vs_inception_eur"] is not None else None
        notional_eur = float(m["notional_eur"])          if m["notional_eur"]         is not None else None

        if not check_margin_call_risk(mtm, notional_eur, threshold_pct):
            continue

        tranche_id = m["tranche_id"]
        loss_pct   = (mtm / notional_eur) * 100
        pair       = f"{m['from_currency']}/{m['to_currency']}"
        spot_rate  = float(m["spot_rate_used"] or 0)
        inception  = float(m["inception_rate"] or 0) if m["inception_rate"] else None

        # 24-hour cooldown: skip if an alert was already sent for this tranche recently
        recent = db.execute(text("""
            SELECT id FROM margin_call_alert_log
            WHERE company_id = :cid AND tranche_id = :tid
              AND triggered_at > NOW() - INTERVAL '24 hours'
              AND alert_sent = true
            LIMIT 1
        """), {"cid": company_id, "tid": tranche_id}).fetchone()
        if recent:
            continue

        # Build and send email
        notional_display = (
            f"{m['from_currency']} {abs(float(m.get('notional') or notional_eur)):,.0f}"
        )
        email_sent = False
        if resend_api_key:
            subject = f"⚠️ Margin Call Risk — {pair} · {company_name}"
            html_body = f"""
<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;">
  <div style="background:#1A2744;padding:24px;border-radius:12px;text-align:center;margin-bottom:24px;">
    <h1 style="color:#C9A86C;margin:0;font-size:20px;letter-spacing:4px;font-weight:800;">SUMNOHOW</h1>
    <p style="color:#8DA4C4;font-size:11px;margin:6px 0 0;font-style:italic;">Know your FX position. Before it costs you.</p>
  </div>

  <div style="background:#FFF5F5;border:1px solid #FEB2B2;border-radius:10px;padding:18px 22px;margin-bottom:24px;">
    <p style="color:#C53030;font-size:14px;font-weight:700;margin:0 0 4px;">⚠️ Margin Call Risk Detected</p>
    <p style="color:#742A2A;font-size:13px;margin:0;">
      A forward position has moved beyond your margin call alert threshold.
    </p>
  </div>

  <div style="background:#F4F6FA;border-radius:10px;padding:20px;margin-bottom:24px;">
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="color:#888;padding:5px 0;">Pair</td>
          <td style="color:#1A2744;font-weight:600;text-align:right;">{pair}</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Notional</td>
          <td style="color:#1A2744;font-weight:600;text-align:right;">{notional_display}</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Inception Rate</td>
          <td style="color:#1A2744;font-weight:600;text-align:right;">{f"{inception:.4f}" if inception else "—"}</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Current Spot</td>
          <td style="color:#1A2744;font-weight:600;text-align:right;">{spot_rate:.4f}</td></tr>
      <tr style="border-top:1px solid #E2E8F0;">
        <td style="color:#C53030;font-weight:700;padding:8px 0 5px;">MTM Loss</td>
        <td style="color:#C53030;font-weight:700;text-align:right;padding:8px 0 5px;">
          −€{abs(mtm):,.0f} ({loss_pct:.1f}% of notional)
        </td>
      </tr>
      <tr><td style="color:#888;padding:5px 0;">Threshold</td>
          <td style="color:#1A2744;font-weight:600;text-align:right;">{threshold_pct:.1f}%</td></tr>
    </table>
  </div>

  <div style="text-align:center;margin-bottom:24px;">
    <a href="{frontend_url}"
       style="background:#1A2744;color:white;padding:14px 36px;border-radius:8px;
              text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
      Review in Dashboard →
    </a>
  </div>

  <p style="color:#999;font-size:12px;text-align:center;margin:0;">
    Automated risk alert from Sumnohow.
    Threshold can be adjusted in Settings → Alert Preferences.
  </p>
</div>"""
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.post(
                        "https://api.resend.com/emails",
                        headers={
                            "Authorization": f"Bearer {resend_api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "from": "Sumnohow Alerts <alerts@updates.sumnohow.com>",
                            "to": recipient_emails,
                            "subject": subject,
                            "html": html_body,
                        },
                    )
                    email_sent = resp.status_code == 200
                    if not email_sent:
                        logger.error(f"[mc-alert] Email failed tranche={tranche_id}: {resp.text}")
                        print(f"[mc-alert] Email FAILED tranche={tranche_id} status={resp.status_code}: {resp.text}")
            except Exception as e:
                logger.error(f"[mc-alert] Email error tranche={tranche_id}: {e}")
                print(f"[mc-alert] Email EXCEPTION tranche={tranche_id}: {e}")

        # Write audit log row regardless of email success (compliance requirement)
        db.execute(text("""
            INSERT INTO margin_call_alert_log
                (company_id, tranche_id, mtm_loss_eur, threshold_pct, spot_rate_used, alert_sent)
            VALUES
                (:cid, :tid, :mtm_loss, :threshold, :spot, :sent)
        """), {
            "cid":       company_id,
            "tid":       tranche_id,
            "mtm_loss":  round(mtm, 2),
            "threshold": threshold_pct,
            "spot":      spot_rate,
            "sent":      email_sent,
        })
        db.commit()

        if email_sent:
            alerts_sent += 1
            print(f"[mc-alert] company={company_id} tranche={tranche_id} pair={pair} "
                  f"loss=€{abs(mtm):,.0f} ({loss_pct:.1f}%) sent to {len(recipient_emails)} recipients")

    return {"company_id": company_id, "alerts_sent": alerts_sent}


async def trigger_margin_call_check(company_id: int) -> None:
    """
    Background wrapper — creates its own DB session so it can run safely
    as an asyncio task after the MTM endpoint commits and returns.
    """
    db = SessionLocal()
    try:
        await send_margin_call_alerts_for_company(company_id, db)
    except Exception as e:
        logger.error(f"[mc-alert] Background check failed company={company_id}: {e}")
    finally:
        db.close()
