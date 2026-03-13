"""
services/ecb_rates.py

Fetches historical daily close FX rates from the ECB Data Portal.
No API key required.

ECB API: https://data-api.ecb.europa.eu/service/data/EXR/D.{CURRENCY}.EUR.SP00.A
All rates are expressed as {CURRENCY}/EUR (how many units of CURRENCY per 1 EUR).

To get the rate for e.g. GBP/EUR: fetch GBP series and invert (1 / rate)
To get a cross rate e.g. GBP/USD: fetch both GBP/EUR and USD/EUR, then divide.
"""

import httpx
from datetime import date, timedelta
from typing import Optional

# Simple in-memory cache for the lifetime of a request / process restart
_rate_cache: dict = {}


def _cache_key(currency: str, d: date) -> str:
    return f"{currency}:{d.isoformat()}"


async def _fetch_ecb_currency_eur(currency: str, d: date) -> Optional[float]:
    """
    Returns the ECB rate for {CURRENCY}/EUR on date d.
    The ECB series gives how many units of CURRENCY equal 1 EUR.
    Returns None if not available.
    """
    key = _cache_key(currency, d)
    if key in _rate_cache:
        return _rate_cache[key]

    start = d.strftime("%Y-%m-%d")
    end   = d.strftime("%Y-%m-%d")
    url = (
        f"https://data-api.ecb.europa.eu/service/data/EXR/"
        f"D.{currency}.EUR.SP00.A"
        f"?startPeriod={start}&endPeriod={end}&format=csvdata"
    )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)

        if resp.status_code != 200:
            return None

        # Parse CSV — rate is in the OBS_VALUE column
        lines = [l for l in resp.text.strip().splitlines() if l and not l.startswith("KEY")]
        if not lines:
            return None

        # Find header row
        header_line = None
        data_lines  = []
        for line in resp.text.strip().splitlines():
            if line.startswith("KEY_FAMILY") or line.startswith("KEY,"):
                header_line = line
            elif header_line and line.strip():
                data_lines.append(line)

        if not header_line or not data_lines:
            return None

        headers = header_line.split(",")
        try:
            val_idx = headers.index("OBS_VALUE")
        except ValueError:
            return None

        last_row = data_lines[-1].split(",")
        if val_idx >= len(last_row):
            return None

        rate = float(last_row[val_idx])
        _rate_cache[key] = rate
        return rate

    except Exception:
        return None


async def get_ecb_close_rate(currency: str, target_date: date) -> float:
    """
    Returns the ECB daily close rate for {currency}/EUR on target_date.
    Walks back up to 3 days to skip weekends/holidays.
    Raises ValueError if unavailable after 3 attempts.
    """
    if currency == "EUR":
        return 1.0

    for days_back in range(4):  # 0, 1, 2, 3
        d = target_date - timedelta(days=days_back)
        rate = await _fetch_ecb_currency_eur(currency, d)
        if rate is not None and rate > 0:
            return rate

    raise ValueError(f"ECB rate for {currency}/EUR unavailable on {target_date} (tried 3 days back)")


async def get_cross_rate(from_currency: str, to_currency: str, target_date: date) -> float:
    """
    Returns the cross rate from_currency/to_currency on target_date.
    Uses EUR as the intermediate currency via ECB.
    """
    if from_currency == to_currency:
        return 1.0

    if from_currency == "EUR":
        # to/EUR → invert to get EUR/to
        to_eur = await get_ecb_close_rate(to_currency, target_date)
        return 1.0 / to_eur  # EUR/to_currency

    if to_currency == "EUR":
        return await get_ecb_close_rate(from_currency, target_date)

    # Both non-EUR: cross via EUR
    from_eur = await get_ecb_close_rate(from_currency, target_date)
    to_eur   = await get_ecb_close_rate(to_currency,   target_date)
    # from/EUR ÷ to/EUR = from/to
    return from_eur / to_eur
