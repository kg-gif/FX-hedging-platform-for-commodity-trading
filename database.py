"""
Database configuration and shared FX rate cache.

Rate cache design
─────────────────
All FX rate lookups route through get_rate() / get_rate_async().
On first call (or after the 5-minute TTL expires) a single bulk request
is made to ExchangeRate-API /latest/USD, which returns every supported
currency at once.  Subsequent calls within the TTL window are pure dict
lookups — zero network I/O.

Maximum API usage: 1 call / 5 min = 288 calls / day, regardless of
how many components load or how many users are active.
"""

import os
import asyncio
import threading
import requests
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import RiskLevel

# ── Database setup ──────────────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://birk_user:XbCWbLZ70FhdgPrho9J3rlNO1AVhohvN@dpg-d4sl43qli9vc73eiem90-a.frankfurt-postgres.render.com/birk_db?sslmode=require",
)
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── FX Rate Cache ───────────────────────────────────────────────────────────
# Conversion rates stored as "X per 1 USD" — the standard ExchangeRate-API
# format for /latest/USD.
# Cross-rate formula: rate(FROM → TO) = rates[TO] / rates[FROM]
_rate_cache: dict = {
    "rates":      {},    # { "EUR": 0.915, "GBP": 0.787, ... }
    "fetched_at": None,  # datetime UTC of last successful refresh
    "ttl_seconds": 300,  # 5 minutes → 288 API calls/day maximum
}
# Serialises HTTP refresh; prevents two concurrent threads from both
# firing a refresh at the same time (re-check freshness inside the lock).
_refresh_lock = threading.Lock()

# Preserve FX_API_BASE so any code that still imports it keeps working
FX_API_KEY  = os.getenv("FX_API_KEY", "8e0eb70d6c0fb96657f30109")
FX_API_BASE = f"https://v6.exchangerate-api.com/v6/{FX_API_KEY}"


def _is_cache_fresh() -> bool:
    if not _rate_cache["fetched_at"] or not _rate_cache["rates"]:
        return False
    age = (datetime.utcnow() - _rate_cache["fetched_at"]).total_seconds()
    return age < _rate_cache["ttl_seconds"]


def _refresh_rate_cache() -> bool:
    """
    Fetch ALL rates in one bulk call to ExchangeRate-API /latest/USD.

    Thread-safe: _refresh_lock ensures only one HTTP request fires at a time.
    The freshness re-check inside the lock means a second thread that was
    waiting does NOT make another API call if the first already refreshed.

    Returns True on success; False on failure (cache left at previous state
    so callers can fall back to stale data rather than hard-failing).
    """
    with _refresh_lock:
        # Re-check under lock — another thread may have already refreshed
        if _is_cache_fresh():
            return True

        # Prefer EXCHANGERATE_API_KEY; fall back to FX_API_KEY
        api_key = os.getenv("EXCHANGERATE_API_KEY") or FX_API_KEY
        if not api_key:
            print("[rate-cache] No API key configured — cannot refresh rates")
            return False

        try:
            url = f"https://v6.exchangerate-api.com/v6/{api_key}/latest/USD"
            resp = requests.get(url, timeout=8)
            resp.raise_for_status()
            data = resp.json()
            if data.get("result") != "success":
                print(f"[rate-cache] API error: {data.get('error-type', 'unknown')}")
                return False

            _rate_cache["rates"]      = data["conversion_rates"]
            _rate_cache["fetched_at"] = datetime.utcnow()
            print(
                f"[rate-cache] Refreshed — {len(_rate_cache['rates'])} currencies "
                f"at {_rate_cache['fetched_at'].strftime('%H:%M:%S')} UTC"
            )
            return True

        except Exception as e:
            print(f"[rate-cache] Refresh failed: {e}")
            return False


def get_rate(from_ccy: str, to_ccy: str) -> float:
    """
    Return the exchange rate for from_ccy → to_ccy.

    Uses the in-memory cache (5-min TTL, single bulk API call on refresh).
    When the cache is warm this is a pure dict lookup with no I/O.

    Raises Exception if the API is unavailable AND the cache is empty.
    If the cache is stale but non-empty (API temporarily down) the most
    recent values are returned to keep the platform usable.
    """
    from_ccy = from_ccy.upper()
    to_ccy   = to_ccy.upper()

    if from_ccy == to_ccy:
        return 1.0

    if not _is_cache_fresh():
        _refresh_rate_cache()

    rates = _rate_cache.get("rates", {})
    if not rates:
        raise Exception(
            "FX rate service unavailable — cache empty and API refresh failed"
        )

    # All cached values are "X per 1 USD".
    # rate(FROM → TO) = rates[TO] / rates[FROM]
    if from_ccy == "USD":
        if to_ccy not in rates:
            raise Exception(f"Currency '{to_ccy}' not in rate cache")
        return float(rates[to_ccy])

    if to_ccy == "USD":
        if from_ccy not in rates:
            raise Exception(f"Currency '{from_ccy}' not in rate cache")
        return 1.0 / float(rates[from_ccy])

    # Cross-rate via USD pivot: FROM → USD → TO
    if from_ccy not in rates:
        raise Exception(f"Currency '{from_ccy}' not in rate cache")
    if to_ccy not in rates:
        raise Exception(f"Currency '{to_ccy}' not in rate cache")
    return float(rates[to_ccy]) / float(rates[from_ccy])


async def get_rate_async(from_ccy: str, to_ccy: str) -> float:
    """
    Async wrapper for get_rate().

    The blocking HTTP refresh (fires at most once per 5 min) runs in the
    default thread-pool executor so it never stalls the FastAPI event loop.
    When the cache is warm (99%+ of calls) this is effectively instant.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, get_rate, from_ccy, to_ccy)


def get_live_fx_rate(from_currency: str, to_currency: str) -> float:
    """
    Backward-compatible shim — delegates to get_rate().
    Kept so data_import_routes and startup seed keep working without changes.
    """
    return get_rate(from_currency, to_currency)


def calculate_risk_level(usd_value: float, settlement_period: int) -> RiskLevel:
    """Calculate risk level based on USD value and settlement period"""
    if usd_value > 5_000_000:
        base_risk = 3  # High
    elif usd_value > 1_000_000:
        base_risk = 2  # Medium
    else:
        base_risk = 1  # Low

    # Adjust for settlement period (>90 days adds risk)
    if settlement_period > 90:
        base_risk = min(3, base_risk + 1)

    if base_risk >= 3:
        return RiskLevel.HIGH
    elif base_risk == 2:
        return RiskLevel.MEDIUM
    else:
        return RiskLevel.LOW


def get_db():
    """Database session dependency for FastAPI"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
