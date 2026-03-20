"""
Trading Facility Usage — Phase 1

Tracks FX credit facilities per bank. Calculates how much of each
facility limit is consumed by open forward positions (value_date >= today).

Rules:
  - Only executed/confirmed forwards count toward utilisation
  - Expired forwards (value_date < today) are excluded
  - All notionals converted to EUR using rates stored in mtm_snapshot_log
    (same EUR pivot used by the MTM and MC risk modules)
  - Soft-delete only — is_active = False, never hard delete

Status thresholds (hardcoded Phase 1, configurable Phase 2):
  NORMAL   < 70%
  WARNING  70% – 90%
  CRITICAL > 90%
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from datetime import date
from database import SessionLocal, get_rate
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/facilities", tags=["Trading Facilities"])
_security = HTTPBearer(auto_error=False)


# ── Inline auth (same pattern as other route files) ───────────────────────────

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


def _require_admin(payload: dict):
    """Block viewer-only roles from mutating facility data."""
    if payload.get("role") not in ("superadmin", "admin", "company_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")


# ── Pydantic models ───────────────────────────────────────────────────────────

class FacilityCreate(BaseModel):
    company_id: int
    bank_name: str
    facility_limit_eur: float
    facility_type: Optional[str] = "fx_forward"
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None


class FacilityUpdate(BaseModel):
    bank_name: Optional[str] = None
    facility_limit_eur: Optional[float] = None
    facility_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None


# ── CRUD endpoints ────────────────────────────────────────────────────────────

@router.post("")
async def create_facility(
    body: FacilityCreate,
    db: Session = Depends(get_db),
    payload: dict = Depends(_get_token_payload),
):
    """
    POST /api/facilities
    Create a new bank facility for a company. Admin only.
    """
    _require_admin(payload)
    safe_cid = _resolve_company_id(body.company_id, payload)

    row = db.execute(text("""
        INSERT INTO trading_facilities
            (company_id, bank_name, facility_limit_eur, facility_type, contact_name, contact_email, notes)
        VALUES
            (:cid, :bank, :limit, :ftype, :cname, :cemail, :notes)
        RETURNING id, bank_name, facility_limit_eur, facility_type,
                  contact_name, contact_email, notes, is_active, created_at
    """), {
        "cid":    safe_cid,
        "bank":   body.bank_name,
        "limit":  body.facility_limit_eur,
        "ftype":  body.facility_type or "fx_forward",
        "cname":  body.contact_name,
        "cemail": body.contact_email,
        "notes":  body.notes,
    }).fetchone()
    db.commit()

    m = row._mapping
    return {"success": True, "facility": {
        "id":                  m["id"],
        "bank_name":           m["bank_name"],
        "facility_limit_eur":  float(m["facility_limit_eur"]),
        "facility_type":       m["facility_type"],
        "contact_name":        m["contact_name"],
        "contact_email":       m["contact_email"],
        "notes":               m["notes"],
        "is_active":           m["is_active"],
        "created_at":          str(m["created_at"]),
    }}


@router.get("/{company_id}")
async def list_facilities(
    company_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(_get_token_payload),
):
    """
    GET /api/facilities/{company_id}
    List all active facilities for a company.
    """
    safe_cid = _resolve_company_id(company_id, payload)

    rows = db.execute(text("""
        SELECT id, bank_name, facility_limit_eur, facility_type,
               contact_name, contact_email, notes, is_active, created_at, updated_at
        FROM trading_facilities
        WHERE company_id = :cid AND is_active = TRUE
        ORDER BY bank_name
    """), {"cid": safe_cid}).fetchall()

    return {"facilities": [
        {
            "id":                 r._mapping["id"],
            "bank_name":          r._mapping["bank_name"],
            "facility_limit_eur": float(r._mapping["facility_limit_eur"]),
            "facility_type":      r._mapping["facility_type"],
            "contact_name":       r._mapping["contact_name"],
            "contact_email":      r._mapping["contact_email"],
            "notes":              r._mapping["notes"],
            "is_active":          r._mapping["is_active"],
            "created_at":         str(r._mapping["created_at"]),
            "updated_at":         str(r._mapping["updated_at"]),
        }
        for r in rows
    ]}


@router.put("/{facility_id}")
async def update_facility(
    facility_id: int,
    body: FacilityUpdate,
    db: Session = Depends(get_db),
    payload: dict = Depends(_get_token_payload),
):
    """
    PUT /api/facilities/{facility_id}
    Update facility fields. Admin only. Validates company ownership.
    """
    _require_admin(payload)

    # Fetch facility to verify it exists and caller can access it
    existing = db.execute(
        text("SELECT company_id FROM trading_facilities WHERE id = :fid AND is_active = TRUE"),
        {"fid": facility_id},
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Facility not found")

    _resolve_company_id(existing._mapping["company_id"], payload)  # enforces company scoping

    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["fid"] = facility_id

    db.execute(
        text(f"UPDATE trading_facilities SET {set_clause}, updated_at = NOW() WHERE id = :fid"),
        updates,
    )
    db.commit()
    return {"success": True}


@router.delete("/{facility_id}")
async def delete_facility(
    facility_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(_get_token_payload),
):
    """
    DELETE /api/facilities/{facility_id}
    Soft-delete a facility (is_active = False). Admin only.
    Financial records must never be hard-deleted.
    """
    _require_admin(payload)

    existing = db.execute(
        text("SELECT company_id FROM trading_facilities WHERE id = :fid AND is_active = TRUE"),
        {"fid": facility_id},
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Facility not found")

    _resolve_company_id(existing._mapping["company_id"], payload)

    db.execute(
        text("UPDATE trading_facilities SET is_active = FALSE, updated_at = NOW() WHERE id = :fid"),
        {"fid": facility_id},
    )
    db.commit()
    return {"success": True}


# ── Utilisation endpoint ──────────────────────────────────────────────────────

def _utilisation_status(pct: float) -> str:
    """
    Classify facility utilisation into three bands.
    Thresholds are hardcoded in Phase 1; Phase 2 makes them configurable.
    """
    if pct > 90:
        return "CRITICAL"
    if pct >= 70:
        return "WARNING"
    return "NORMAL"


@router.get("/utilisation/{company_id}")
async def get_utilisation(
    company_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(_get_token_payload),
):
    """
    GET /api/facilities/utilisation/{company_id}

    Returns per-facility utilisation. Counts notional (EUR) of all forward
    tranches that are:
      - linked to this facility (facility_id = facility.id)
      - executed or confirmed
      - not yet settled (is_settled = false or NULL)

    Notional EUR is taken from the most recent mtm_snapshot_log row for each
    tranche (written by the MTM endpoint). If no MTM snapshot exists yet for
    a tranche, falls back to raw tranche amount as a rough proxy.
    """
    safe_cid = _resolve_company_id(company_id, payload)
    today = date.today().isoformat()

    # All active facilities for this company
    facilities = db.execute(text("""
        SELECT id, bank_name, facility_limit_eur, facility_type,
               contact_name, contact_email, notes
        FROM trading_facilities
        WHERE company_id = :cid AND is_active = TRUE
        ORDER BY bank_name
    """), {"cid": safe_cid}).fetchall()

    result = []
    total_limit = 0.0
    total_utilised = 0.0

    for fac in facilities:
        f = fac._mapping
        facility_id   = f["id"]
        limit         = float(f["facility_limit_eur"])
        total_limit  += limit

        # Sum notional_eur for active tranches linked to this facility.
        # Use latest mtm_snapshot_log entry where available (accurate EUR value),
        # otherwise fall back to tranche.amount (raw, possibly in non-EUR currency).
        # A tranche consumes facility headroom until explicitly settled (is_settled = true).
        # We no longer use value_date >= today — a forward is released from the facility
        # when it settles, not when the calendar date passes.
        # is_settled IS NULL guard handles rows created before the column was added.
        tranche_rows = db.execute(text("""
            SELECT
                ht.id                   AS tranche_id,
                ht.amount               AS notional_raw,
                ht.value_date,
                snap.notional_eur       AS notional_eur_mtm,
                e.from_currency,
                e.to_currency
            FROM hedge_tranches ht
            JOIN exposures e ON e.id = ht.exposure_id
            LEFT JOIN LATERAL (
                SELECT notional_eur
                FROM mtm_snapshot_log
                WHERE tranche_id = ht.id AND notional_eur IS NOT NULL
                ORDER BY calculated_at DESC
                LIMIT 1
            ) snap ON TRUE
            WHERE ht.facility_id  = :fid
              AND ht.status       IN ('executed', 'confirmed')
              AND LOWER(ht.instrument) = 'forward'
              AND (ht.is_settled = false OR ht.is_settled IS NULL)
              AND e.company_id    = :cid
        """), {"fid": facility_id, "cid": safe_cid}).fetchall()

        def _to_eur(row_mapping) -> float:
            """
            Return the EUR notional for a tranche row.
            Prefer the MTM snapshot (already converted at mark time).
            Fall back to live rate conversion — never use raw amount as EUR.
            """
            mtm = row_mapping["notional_eur_mtm"]
            if mtm is not None:
                return float(mtm)
            raw   = float(row_mapping["notional_raw"] or 0)
            from_ccy = row_mapping["from_currency"]
            try:
                rate = get_rate(from_ccy, "EUR")
                return raw * rate
            except Exception:
                logger.warning(
                    "facility_utilisation: could not convert %s → EUR for tranche %s; "
                    "using raw amount as rough proxy",
                    from_ccy, row_mapping["tranche_id"],
                )
                return raw

        utilised   = sum(_to_eur(r._mapping) for r in tranche_rows)
        count      = len(tranche_rows)
        available  = max(limit - utilised, 0)
        pct        = (utilised / limit * 100) if limit > 0 else 0
        status     = _utilisation_status(pct)

        # Next maturity among linked tranches
        dates = [r._mapping["value_date"] for r in tranche_rows if r._mapping["value_date"]]
        next_maturity = str(min(dates)) if dates else None

        total_utilised += utilised

        result.append({
            "id":                  facility_id,
            "bank_name":           f["bank_name"],
            "facility_type":       f["facility_type"],
            "contact_name":        f["contact_name"],
            "contact_email":       f["contact_email"],
            "notes":               f["notes"],
            "facility_limit_eur":  limit,
            "utilised_eur":        round(utilised, 2),
            "available_eur":       round(available, 2),
            "utilisation_pct":     round(pct, 1),
            "tranche_count":       count,
            "next_maturity":       next_maturity,
            "status":              status,
        })

    total_available = max(total_limit - total_utilised, 0)

    return {
        "facilities":          result,
        "total_limit_eur":     round(total_limit, 2),
        "total_utilised_eur":  round(total_utilised, 2),
        "total_available_eur": round(total_available, 2),
    }
