"""
services/ecb_rates.py

Fetches historical daily close FX rates from the ECB Data Portal.
No API key required.

ECB API: https://data-api.ecb.europa.eu/service/data/EXR/D.{CURRENCY}.EUR.SP00.A
All rates are expressed as {CURRENCY}/EUR (how many units of CURRENCY per 1 EUR).

ECB series for GBP gives GBP_per_EUR (≈ 0.86). To get GBP/EUR rate (EUR per GBP): invert → 1/0.86 = 1.16.
Cross rate GBP/NOK (NOK per GBP): NOK_per_EUR / GBP_per_EUR = 11.14 / 0.86 ≈ 12.95.
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
    Returns the rate as: how many to_currency per 1 from_currency.

    ECB series gives X_per_EUR for each currency X.
    Examples: get_ecb_close_rate('GBP') ≈ 0.86 (GBP per EUR)
              get_ecb_close_rate('NOK') ≈ 11.14 (NOK per EUR)

    Derivations:
      from=EUR, to=USD  → USD_per_EUR = to_eur               (e.g. 1.09)
      from=GBP, to=EUR  → EUR_per_GBP = 1 / from_eur         (e.g. 1/0.86 = 1.16)
      from=GBP, to=NOK  → NOK_per_GBP = to_eur / from_eur   (e.g. 11.14/0.86 = 12.95)
    """
    if from_currency == to_currency:
        return 1.0

    if from_currency == "EUR":
        # ECB gives to_per_EUR directly — that IS the EUR/to rate
        to_eur = await get_ecb_close_rate(to_currency, target_date)
        return to_eur  # to_currency per 1 EUR

    if to_currency == "EUR":
        # ECB gives from_per_EUR; invert to get EUR per from
        from_eur = await get_ecb_close_rate(from_currency, target_date)
        return 1.0 / from_eur  # EUR per 1 from_currency

    # Both non-EUR: cross via EUR
    # to_per_EUR / from_per_EUR = to_per_from
    from_eur = await get_ecb_close_rate(from_currency, target_date)
    to_eur   = await get_ecb_close_rate(to_currency,   target_date)
    return to_eur / from_eur  # to_currency per 1 from_currency
