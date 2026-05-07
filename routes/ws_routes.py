"""
WebSocket endpoint for the live FX rate ticker.

Streams rate snapshots to authenticated dashboard clients.
Each client subscribes only to the currency pairs that appear in
their company's active exposures — derived on connect from the DB.

In-process broadcast (no Redis) — suitable for single-instance
Render deployments.  To scale horizontally: swap RateTickerManager
for a Redis pub/sub adapter and enable sticky sessions in Render's
load-balancer settings.

Broadcast cadence: every 5 s.  The upstream rate cache has a 5-minute
TTL, so consecutive broadcasts between refreshes carry the same values —
this is correct behaviour.  Clients will see a rate change within 5 s of
the cache refreshing.

HTTP fallback endpoint: GET /api/fx-rates/ticker?company_id=X
Returns the same JSON shape so the polling path is drop-in compatible.
"""
import asyncio
import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy import text

from database import SessionLocal, get_rate, get_rate_async, _rate_cache
from models import Exposure

logger = logging.getLogger(__name__)

router = APIRouter()

_SECRET    = os.getenv("JWT_SECRET_KEY", "change-this-in-production-use-a-long-random-string")
_ALGORITHM = "HS256"
_security  = HTTPBearer()


# ── Connection record ──────────────────────────────────────────────────────────

class _Conn:
    __slots__ = ("ws", "company_id", "pairs", "prev_rates")

    def __init__(self, ws: WebSocket, company_id: int, pairs: list[str]):
        self.ws                         = ws
        self.company_id: int            = company_id
        self.pairs:      list[str]      = pairs
        self.prev_rates: dict[str, float] = {}


# ── Manager ───────────────────────────────────────────────────────────────────

class RateTickerManager:
    """
    Keeps track of all open WebSocket connections and pushes rate updates.
    Single-threaded asyncio — no locking needed.
    """

    def __init__(self) -> None:
        self._conns: list[_Conn] = []

    def add(self, conn: _Conn) -> None:
        self._conns.append(conn)

    def remove(self, ws: WebSocket) -> None:
        self._conns = [c for c in self._conns if c.ws is not ws]

    async def send_snapshot(self, conn: _Conn) -> None:
        """Immediate snapshot for a newly connected client."""
        payload = await _build_rates(conn)
        if payload:
            await conn.ws.send_text(json.dumps({"type": "rates", "data": payload}))

    async def broadcast(self) -> None:
        """Push rate updates to every active connection; silently drop dead sockets."""
        dead: list[WebSocket] = []
        for conn in list(self._conns):
            try:
                payload = await _build_rates(conn)
                if payload:
                    await conn.ws.send_text(json.dumps({"type": "rates", "data": payload}))
            except Exception:
                dead.append(conn.ws)
        for ws in dead:
            self.remove(ws)


manager = RateTickerManager()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _build_rates(conn: _Conn) -> dict:
    """
    Fetch current cached rate for every subscribed pair.
    Uses get_rate_async (run_in_executor) so a cold-cache HTTP refresh
    does not block the event loop and stall the WebSocket handshake.
    Computes percent-change vs the previous broadcast and updates
    conn.prev_rates in place.
    """
    updates: dict[str, dict] = {}
    for pair in conn.pairs:
        try:
            from_ccy, to_ccy = pair.split("/", 1)
            rate = await get_rate_async(from_ccy, to_ccy)
            prev = conn.prev_rates.get(pair)
            if prev and prev != 0:
                change_pct = round(((rate - prev) / prev) * 100, 4)
                direction  = "up" if change_pct > 0 else ("down" if change_pct < 0 else "flat")
            else:
                change_pct = 0.0
                direction  = "flat"
            conn.prev_rates[pair] = rate
            updates[pair] = {
                "rate":       round(rate, 5),
                "change_pct": change_pct,
                "direction":  direction,
            }
        except Exception:
            pass
    return updates


def _decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
    except JWTError:
        return None


def _get_company_pairs(company_id: int) -> list[str]:
    """
    Return distinct currency pairs for the company's active exposures.

    Exposure has separate from_currency / to_currency columns (no currency_pair
    field).  is_active is a nullable DB column not mapped in the ORM model, so
    we use raw SQL — matching the pattern in birk_api.py line 358.
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(Exposure.from_currency, Exposure.to_currency)
            .filter(
                Exposure.company_id == company_id,
                text("(is_active IS NULL OR is_active = true)"),
            )
            .distinct()
            .all()
        )
        return [
            f"{r.from_currency}/{r.to_currency}"
            for r in rows
            if r.from_currency and r.to_currency
        ]
    finally:
        db.close()


# ── Background broadcast loop ─────────────────────────────────────────────────

async def rate_broadcast_loop() -> None:
    """
    Started once at app startup via birk_api.py.
    Checks every 15 s whether the upstream rate cache has refreshed.
    Only broadcasts when fetched_at changes — so clients receive exactly
    one push per cache refresh (~once per 5 minutes) rather than 60 identical
    pushes per cache cycle.
    """
    last_cache_ts = None
    while True:
        try:
            cache_ts = _rate_cache.get("fetched_at")
            if cache_ts != last_cache_ts:
                await manager.broadcast()
                last_cache_ts = cache_ts
        except Exception as e:
            logger.error("[rate-ticker] broadcast error: %s", e)
        await asyncio.sleep(15)


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/rates")
async def ws_rates(
    websocket: WebSocket,
    token:      str            = Query(default=""),
    company_id: Optional[int]  = Query(default=None),
):
    """
    Live rate ticker stream.

    Query params
    ------------
    token       JWT bearer token (required)
    company_id  Company to subscribe to.  Superadmins/admins may pass any
                company_id; non-admins are always locked to their own.
                Mirrors the resolve_company_id() pattern used by all other
                endpoints so superadmins viewing a client company see that
                company's pairs rather than their own (which has none).

    Protocol (server → client only)
    --------------------------------
    {"type": "rates", "data": {<pair>: {"rate": float, "change_pct": float, "direction": "up"|"down"|"flat"}}}
    {"type": "ping"}   keepalive every 30 s
    """
    await websocket.accept()

    payload = _decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    token_company_id = payload.get("company_id")
    role             = payload.get("role", "")

    # Admins may view any company; everyone else is locked to their own
    if role in ("superadmin", "admin") and company_id:
        resolved_id = company_id
    elif token_company_id:
        resolved_id = int(token_company_id)
    else:
        await websocket.close(code=4001)
        return

    try:
        pairs = _get_company_pairs(resolved_id)
    except Exception as e:
        logger.error("[rate-ticker] DB error fetching pairs for company %s: %s", resolved_id, e)
        await websocket.close(code=1011)
        return

    conn = _Conn(websocket, resolved_id, pairs)
    manager.add(conn)

    try:
        # Immediate snapshot so the banner isn't blank for the first 5 s
        await manager.send_snapshot(conn)

        # Keep the coroutine alive — updates are driven by the background task
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("[rate-ticker] WS closed: %s", e)
    finally:
        manager.remove(websocket)


# ── HTTP fallback endpoint ────────────────────────────────────────────────────

@router.get("/api/fx-rates/ticker")
async def http_rate_ticker(
    company_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(_security),
):
    """
    REST fallback for environments where WebSocket is unavailable.

    Returns the same JSON shape as WebSocket rate messages so the
    frontend polling path is drop-in compatible with the WS handler:
      {"rates": {<pair>: {"rate": float, "change_pct": float, "direction": str}}}

    change_pct is always 0.0 here — directional tracking happens
    client-side when comparing consecutive poll responses.
    """
    from fastapi import HTTPException

    decoded = _decode_token(credentials.credentials)
    if not decoded:
        raise HTTPException(status_code=401, detail="Invalid token")

    pairs  = _get_company_pairs(company_id)
    rates: dict[str, dict] = {}
    for pair in pairs:
        try:
            from_ccy, to_ccy = pair.split("/", 1)
            rate = await get_rate_async(from_ccy, to_ccy)
            rates[pair] = {"rate": round(rate, 5), "change_pct": 0.0, "direction": "flat"}
        except Exception:
            pass
    return {"rates": rates}
