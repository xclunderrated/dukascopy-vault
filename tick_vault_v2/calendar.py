"""Market session and calendar filter to avoid useless 404 requests."""

from datetime import UTC, datetime, timedelta

def is_market_open(symbol: str, dt: datetime) -> bool:
    """
    Check if the global financial market is open for the given symbol and UTC hour.
    
    Forex & Metals:
      - Closed Friday 22:00 UTC to Sunday 21:00 UTC (roughly 47 hours).
      - Closed on Christmas Day (Dec 25) and New Year's Day (Jan 1).
    Crypto:
      - 24/7/365 continuous trading.
    Indices & Commodities:
      - Closed on weekends and standard global holidays.
    """
    sym = symbol.upper()
    # Crypto trades non-stop
    if sym in {"BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "LTCUSD", "DOGEUSD"}:
        return True

    # Normalize to UTC
    if dt.tzinfo is None:
        dt_utc = dt.replace(tzinfo=UTC)
    else:
        dt_utc = dt.astimezone(UTC)

    month = dt_utc.month
    day = dt_utc.day
    weekday = dt_utc.weekday()  # 0=Monday, 4=Friday, 5=Saturday, 6=Sunday
    hour = dt_utc.hour

    # Global holiday closures
    if (month == 12 and day == 25) or (month == 1 and day == 1):
        return False

    # Friday post-close: closed from 22:00 UTC onwards
    if weekday == 4 and hour >= 22:
        return False

    # Saturday: completely closed 24 hours
    if weekday == 5:
        return False

    # Sunday: closed before 21:00 UTC (Tokyo/Sydney pre-open)
    if weekday == 6 and hour < 21:
        return False

    return True


def filter_trading_hours(symbol: str, hourly_dts: list[datetime]) -> tuple[list[datetime], list[datetime]]:
    """
    Split a list of hourly datetimes into:
    1. Active trading hours (to be downloaded)
    2. Market-closed hours (to be automatically recorded as no-data without network requests)
    """
    active = []
    closed = []
    for dt in hourly_dts:
        if is_market_open(symbol, dt):
            active.append(dt)
        else:
            closed.append(dt)
    return active, closed
