"""Constants and registries for TickVault 2.0."""

DUKASCOPY_DATA_FEED_BASE = "https://freeserv.dukascopy.com/datafeed/"

PIPET_SIZE_REGISTRY: dict[str, float] = {
    # Forex Majors
    "EURUSD": 1e-5,
    "GBPUSD": 1e-5,
    "USDJPY": 1e-3,
    "AUDUSD": 1e-5,
    "NZDUSD": 1e-5,
    "USDCAD": 1e-5,
    "USDCHF": 1e-5,
    # Forex Crosses
    "EURGBP": 1e-5,
    "EURJPY": 1e-3,
    "GBPJPY": 1e-3,
    "AUDJPY": 1e-3,
    "CADJPY": 1e-3,
    "CHFJPY": 1e-3,
    "EURAUD": 1e-5,
    "EURCAD": 1e-5,
    "EURCHF": 1e-5,
    "GBPCHF": 1e-5,
    # Commodities / Metals
    "XAUUSD": 1e-3,  # Gold (pipet 0.001)
    "XAGUSD": 1e-3,  # Silver
    "BRENTCMDUSD": 1e-3,  # Brent Crude
    "LIGHTCMDUSD": 1e-3,  # WTI Crude
    # Cryptocurrencies
    "BTCUSD": 0.1,
    "ETHUSD": 0.1,
    "SOLUSD": 0.01,
    "XRPUSD": 0.0001,
    # Indices
    "USA500IDXUSD": 1e-2,
    "USATECHIDXUSD": 1e-2,
    "USA30IDXUSD": 1e-1,
    "DEUIDXEUR": 1e-1,
    "GBRIDXGBP": 1e-1,
}

VOLUME_SCALE = 1e6

DEFAULT_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]
