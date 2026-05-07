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

from database import SessionLocal, get_rate
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
        payload = _build_rates(conn)
        if payload:
            await conn.ws.send_text(json.dumps({"type": "rates", "data": payload}))

    async def broadcast(self) -> None:
        """Push rate updates to every active connection; silently drop dead sockets."""
        dead: list[WebSocket] = []
        for conn in list(self._conns):
            try:
                payload = _build_rates(conn)
                if payload:
                    await conn.ws.send_text(json.dumps({"type": "rates", "data": payload}))
            except Exception:
                dead.append(conn.ws)
        for ws in dead:
            self.remove(ws)


manager = RateTickerManager()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_rates(conn: _Conn) -> dict:
    """
    Fetch current cached rate for every subscribed pair.
    Computes percent-change vs the previous broadcast and
    updates conn.prev_rates in place.
    """
    updates: dict[str, dict] = {}
    for pair in conn.pairs:
        try:
            from_ccy, to_ccy = pair.split("/", 1)
            rate = get_rate(from_ccy, to_ccy)
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
    """Return distinct currency pairs from the company's active exposures."""
    db = SessionLocal()
    try:
        rows = (
            db.query(Exposure.currency_pair)
            .filter(Exposure.company_id == company_id, Exposure.is_active.is_(True))
            .distinct()
            .all()
        )
        return [r.currency_pair for r in rows if r.currency_pair]
    finally:
        db.close()


# ── Background broadcast loop ─────────────────────────────────────────────────

async def rate_broadcast_loop() -> None:
    """
    Started once at app startup via birk_api.py.
    Wakes every 5 s and broadcasts current rates to all connected clients.
    """
    while True:
        try:
            await manager.broadcast()
        except Exception as e:
            logger.error("[rate-ticker] broadcast error: %s", e)
        await asyncio.sleep(5)


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/rates")
async def ws_rates(websocket: WebSocket, token: str = Query(default="")):
    """
    Live rate ticker stream.

    Query params
    ------------
    token  JWT bearer token (required)

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

    company_id = payload.get("company_id")
    if not company_id:
        await websocket.close(code=4001)
        return

    pairs = _get_company_pairs(int(company_id))
    conn  = _Conn(websocket, int(company_id), pairs)
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
            rate = get_rate(from_ccy, to_ccy)
            rates[pair] = {"rate": round(rate, 5), "change_pct": 0.0, "direction": "flat"}
        except Exception:
            pass
    return {"rates": rates}
