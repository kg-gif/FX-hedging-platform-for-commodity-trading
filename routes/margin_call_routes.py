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
import secrets
from datetime import datetime

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

        # Acknowledgement: find the most recent alert log row for this tranche
        ack_row = db.execute(text("""
            SELECT id, acknowledged_at, acknowledged_by, triggered_at
            FROM   margin_call_alert_log
            WHERE  company_id = :cid AND tranche_id = :tid
              AND  alert_sent = true
            ORDER  BY triggered_at DESC
            LIMIT  1
        """), {"cid": safe_id, "tid": m["tranche_id"]}).fetchone()

        ack_info = None
        if ack_row and ack_row._mapping.get("acknowledged_at"):
            ack_info = {
                "acknowledged_at": str(ack_row._mapping["acknowledged_at"]),
                "acknowledged_by": ack_row._mapping.get("acknowledged_by") or "email_link",
            }

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
            "acknowledgement":      ack_info,  # None = pending, dict = acknowledged
        })

    total_at_risk_eur = sum(r["notional_eur"] for r in at_risk)

    return {
        "company_id":                safe_id,
        "threshold_pct":             threshold_pct,
        "at_risk_count":             len(at_risk),
        "total_exposure_at_risk_eur": round(total_at_risk_eur, 2),
        "tranches":                  at_risk,
    }


# ── Weekend suppression ───────────────────────────────────────────────────────

def should_send_alert_today() -> bool:
    """
    Suppress all alert emails on weekends — FX markets are closed Fri 5pm → Sun 5pm.
    Returns True on Monday–Friday only.
    """
    return datetime.utcnow().weekday() < 5  # 0=Mon … 4=Fri


# ── Alert sender ──────────────────────────────────────────────────────────────

async def send_margin_call_alerts_for_company(company_id: int, db) -> dict:
    """
    Check all forward tranches for the company against the MC threshold.
    Sends ONE grouped email per company showing ALL new at-risk tranches.
    Writes a per-tranche row to margin_call_alert_log for every at-risk tranche (audit trail).

    Improvements vs old version:
      - Weekend suppression: no emails on Saturday/Sunday
      - BCC: recipients hidden from each other
      - Grouped: one email per company, not one per tranche
      - Acknowledgement link in email body
      - Cooldown respects acknowledged_at (extends to 48h after acknowledgement)

    Called from:
      - Daily cron (/api/alerts/send-daily)
      - Background task after each MTM fetch (trigger_margin_call_check)
    """
    import httpx

    # Weekend suppression — FX markets closed; alerting on stale rates is misleading
    if not should_send_alert_today():
        print(f"[mc-alert] Weekend — suppressing alert for company={company_id}")
        return {"status": "skipped", "reason": "weekend"}

    print(f"[mc-alert] send_margin_call_alerts_for_company called for company_id={company_id}")
    resend_api_key = os.getenv("RESEND_API_KEY")
    frontend_url   = os.getenv("FRONTEND_URL", "https://app.sumnohow.com")
    backend_url    = os.getenv("BACKEND_URL", "https://birk-fx-api.onrender.com")

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

    # Collect NEW at-risk tranches (at risk AND not within their cooldown window)
    new_at_risk = []

    for r in rows:
        m            = r._mapping
        mtm          = float(m["mtm_vs_inception_eur"]) if m["mtm_vs_inception_eur"] is not None else None
        notional_eur = float(m["notional_eur"])          if m["notional_eur"]         is not None else None

        if not check_margin_call_risk(mtm, notional_eur, threshold_pct):
            continue

        tranche_id = m["tranche_id"]
        loss_pct   = (mtm / notional_eur) * 100
        pair       = f"{m['from_currency']}/{m['to_currency']}"

        # Per-tranche cooldown: check last alert and its cooldown_hours setting
        # Default: 24h. After acknowledgement: 48h (set by acknowledge endpoint).
        recent = db.execute(text("""
            SELECT triggered_at,
                   COALESCE(cooldown_hours, 24) AS cooldown_hours
            FROM   margin_call_alert_log
            WHERE  company_id = :cid AND tranche_id = :tid
              AND  alert_sent = true
            ORDER  BY triggered_at DESC
            LIMIT  1
        """), {"cid": company_id, "tid": tranche_id}).fetchone()

        if recent:
            r2 = recent._mapping
            hours_since = (datetime.utcnow() - r2["triggered_at"]).total_seconds() / 3600
            if hours_since < float(r2["cooldown_hours"]):
                continue  # Still within cooldown for this tranche

        new_at_risk.append({
            "tranche_id":     tranche_id,
            "pair":           pair,
            "from_currency":  m["from_currency"],
            "notional":       float(m.get("notional") or notional_eur),
            "notional_eur":   round(notional_eur, 2),
            "inception_rate": float(m["inception_rate"] or 0) if m["inception_rate"] else None,
            "spot_rate":      float(m["spot_rate_used"] or 0),
            "mtm":            round(mtm, 2),
            "loss_pct":       round(loss_pct, 2),
        })

    if not new_at_risk:
        return {"company_id": company_id, "alerts_sent": 0}

    # ── Build ONE grouped email for all new at-risk tranches ───────────────────
    n               = len(new_at_risk)
    total_at_risk   = sum(t["notional_eur"] for t in new_at_risk)
    worst_loss_pct  = min(t["loss_pct"] for t in new_at_risk)  # most negative = worst

    email_sent = False
    # We will fill alert_ids after inserting audit rows; pass them into email via ack links
    # First, pre-generate tokens for each tranche so we can embed ack links in the email
    tokens_by_tranche: dict = {}

    # Write audit log rows NOW (before email, so we have IDs for ack links)
    alert_ids: dict = {}
    for t in new_at_risk:
        tok = secrets.token_hex(16)  # 32-char random hex token
        tokens_by_tranche[t["tranche_id"]] = tok
        row_id = db.execute(text("""
            INSERT INTO margin_call_alert_log
                (company_id, tranche_id, mtm_loss_eur, threshold_pct, spot_rate_used,
                 alert_sent, ack_token)
            VALUES
                (:cid, :tid, :mtm_loss, :threshold, :spot, false, :token)
            RETURNING id
        """), {
            "cid":       company_id,
            "tid":       t["tranche_id"],
            "mtm_loss":  t["mtm"],
            "threshold": threshold_pct,
            "spot":      t["spot_rate"],
            "token":     tok,
        }).fetchone()
        db.commit()
        alert_ids[t["tranche_id"]] = row_id._mapping["id"]

    if resend_api_key:
        # Build tranche rows for the email table
        def tranche_row_html(t):
            ack_id  = alert_ids[t["tranche_id"]]
            ack_tok = tokens_by_tranche[t["tranche_id"]]
            ack_url = f"{backend_url}/api/margin-call/acknowledge/{ack_id}?token={ack_tok}"
            return f"""
              <tr style="border-top:1px solid #E2E8F0;">
                <td style="padding:8px 12px;font-weight:600;color:#1A2744;">{t['pair']}</td>
                <td style="padding:8px 12px;font-family:monospace;color:#555;">
                  {t['from_currency']} {t['notional']:,.0f}
                </td>
                <td style="padding:8px 12px;font-family:monospace;color:#555;">
                  {f"{t['inception_rate']:.4f}" if t['inception_rate'] else "—"}
                </td>
                <td style="padding:8px 12px;font-family:monospace;color:#555;">{t['spot_rate']:.4f}</td>
                <td style="padding:8px 12px;font-weight:700;color:#C53030;text-align:right;">
                  −€{abs(t['mtm']):,.0f}<br>
                  <span style="font-size:11px;font-weight:400;">({abs(t['loss_pct']):.1f}%)</span>
                </td>
                <td style="padding:8px 12px;text-align:center;">
                  <a href="{ack_url}"
                     style="font-size:11px;background:#F0FDF4;color:#065F46;padding:4px 10px;
                            border-radius:4px;border:1px solid #86EFAC;text-decoration:none;
                            white-space:nowrap;">
                    ✓ Acknowledge
                  </a>
                </td>
              </tr>"""

        tranche_rows_html = "".join(tranche_row_html(t) for t in new_at_risk)
        subject = f"⚠️ Margin Call Risk — {n} position{'s' if n != 1 else ''} · {company_name}"

        html_body = f"""
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;">
  <div style="background:#1A2744;padding:24px;border-radius:12px;text-align:center;margin-bottom:24px;">
    <h1 style="color:#C9A86C;margin:0;font-size:20px;letter-spacing:4px;font-weight:800;">SUMNOHOW</h1>
    <p style="color:#8DA4C4;font-size:11px;margin:6px 0 0;font-style:italic;">Know your FX position. Before it costs you.</p>
  </div>

  <div style="background:#FFF5F5;border:1px solid #FEB2B2;border-radius:10px;padding:18px 22px;margin-bottom:24px;">
    <p style="color:#C53030;font-size:15px;font-weight:700;margin:0 0 6px;">
      ⚠️ {n} position{'s' if n != 1 else ''} require{'s' if n == 1 else ''} attention
    </p>
    <p style="color:#742A2A;font-size:13px;margin:0 0 4px;">
      Total exposure at risk: <strong>€{total_at_risk:,.0f}</strong>
      &nbsp;·&nbsp; Worst position: <strong>{abs(worst_loss_pct):.1f}% MTM loss</strong>
      &nbsp;·&nbsp; Threshold: <strong>{threshold_pct:.1f}%</strong>
    </p>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
    <thead>
      <tr style="background:#F4F6FA;">
        <th style="padding:8px 12px;text-align:left;color:#1A2744;font-weight:600;">Pair</th>
        <th style="padding:8px 12px;text-align:left;color:#1A2744;font-weight:600;">Notional</th>
        <th style="padding:8px 12px;text-align:left;color:#1A2744;font-weight:600;">Inception</th>
        <th style="padding:8px 12px;text-align:left;color:#1A2744;font-weight:600;">Spot</th>
        <th style="padding:8px 12px;text-align:right;color:#1A2744;font-weight:600;">MTM Loss</th>
        <th style="padding:8px 12px;text-align:center;color:#1A2744;font-weight:600;">Action</th>
      </tr>
    </thead>
    <tbody>
      {tranche_rows_html}
    </tbody>
  </table>

  <div style="text-align:center;margin-bottom:24px;">
    <a href="{frontend_url}"
       style="background:#1A2744;color:white;padding:14px 36px;border-radius:8px;
              text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
      Review MTM Report →
    </a>
  </div>

  <p style="color:#999;font-size:12px;text-align:center;margin:0;">
    Automated risk alert from Sumnohow · Alert threshold: {threshold_pct:.1f}% of notional<br>
    Recipients are hidden from each other. Threshold can be adjusted in Settings → Alert Preferences.
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
                        "from":    "Sumnohow Alerts <alerts@updates.sumnohow.com>",
                        "to":      ["alerts@updates.sumnohow.com"],  # send to self
                        "bcc":     recipient_emails,                  # recipients in BCC
                        "subject": subject,
                        "html":    html_body,
                    },
                )
                email_sent = resp.status_code == 200
                if not email_sent:
                    logger.error(f"[mc-alert] Email failed company={company_id}: {resp.text}")
                    print(f"[mc-alert] Email FAILED company={company_id} status={resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"[mc-alert] Email error company={company_id}: {e}")
            print(f"[mc-alert] Email EXCEPTION company={company_id}: {e}")

    # Update audit log rows with final email_sent status
    for t in new_at_risk:
        db.execute(text("""
            UPDATE margin_call_alert_log SET alert_sent = :sent WHERE id = :id
        """), {"sent": email_sent, "id": alert_ids[t["tranche_id"]]})
    db.commit()

    if email_sent:
        print(f"[mc-alert] company={company_id} grouped alert: {n} tranches → "
              f"€{total_at_risk:,.0f} at risk, BCC to {len(recipient_emails)} recipients")

    return {"company_id": company_id, "alerts_sent": 1 if email_sent else 0, "tranches_flagged": n}


# ── Acknowledge endpoint ──────────────────────────────────────────────────────

@router.get("/acknowledge/{alert_id}")
async def acknowledge_margin_call(
    alert_id: int,
    token: str = "",
    db: Session = Depends(get_db),
):
    """
    GET /api/margin-call/acknowledge/{alert_id}?token={token}

    One-click acknowledgement link embedded in the margin call email.
    No JWT required — the token is the auth (HMAC-derived per alert).

    Effects:
      - Sets acknowledged_at and acknowledged_by on the alert log row
      - Extends cooldown_hours to 48 (acknowledged = less urgent)
      - Returns a simple confirmation page (HTML)
    """
    row = db.execute(
        text("SELECT * FROM margin_call_alert_log WHERE id = :id"),
        {"id": alert_id},
    ).fetchone()

    if not row:
        return _ack_response("Not found", "Alert ID not found. It may have expired.", error=True)

    r = row._mapping
    stored_token = r.get("ack_token") or ""

    # Constant-time comparison to prevent timing attacks
    import hmac as _hmac
    if not stored_token or not _hmac.compare_digest(stored_token, token):
        return _ack_response("Invalid link", "This acknowledgement link is invalid or has expired.", error=True)

    if r.get("acknowledged_at"):
        return _ack_response(
            "Already acknowledged",
            f"This alert was already acknowledged.",
            info=True,
        )

    # Mark acknowledged + extend cooldown to 48h
    db.execute(text("""
        UPDATE margin_call_alert_log
           SET acknowledged_at  = NOW(),
               acknowledged_by  = 'email_link',
               cooldown_hours   = 48
         WHERE id = :id
    """), {"id": alert_id})
    db.commit()

    tranche_id = r.get("tranche_id")
    print(f"[mc-ack] alert_id={alert_id} tranche_id={tranche_id} acknowledged via email link")

    return _ack_response(
        "Acknowledged",
        "Thank you — this margin call alert has been acknowledged. "
        "The next alert for this position will be sent after 48 hours if it remains at risk.",
    )


def _ack_response(title: str, message: str, error: bool = False, info: bool = False) -> dict:
    """Return a simple HTML response for the one-click acknowledge page."""
    from fastapi.responses import HTMLResponse
    color = "#EF4444" if error else "#F59E0B" if info else "#10B981"
    icon  = "✗" if error else "ℹ" if info else "✓"
    html  = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{title} — Sumnohow</title></head>
<body style="font-family:sans-serif;background:#F4F6FA;margin:0;padding:40px;display:flex;
             align-items:center;justify-content:center;min-height:80vh;">
  <div style="background:white;border-radius:16px;padding:40px 48px;max-width:420px;
              text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="font-size:48px;margin-bottom:16px;color:{color};">{icon}</div>
    <h2 style="color:#1A2744;margin:0 0 12px;font-size:20px;">{title}</h2>
    <p style="color:#6B7280;font-size:14px;line-height:1.6;margin:0 0 24px;">{message}</p>
    <a href="{os.getenv('FRONTEND_URL', 'https://app.sumnohow.com')}"
       style="background:#1A2744;color:white;padding:12px 28px;border-radius:8px;
              text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
      Open Dashboard →
    </a>
  </div>
</body></html>"""
    return HTMLResponse(content=html)


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
