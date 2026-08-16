"""TickVault 2.0 - High Performance Dukascopy Tick Engine."""

from .calendar import filter_trading_hours, is_market_open
from .chunk import TickChunk
from .config import CONFIG, Config, reload_config
from .constants import DUKASCOPY_DATA_FEED_BASE, PIPET_SIZE_REGISTRY, VOLUME_SCALE
from .decoder import decode_chunk, decode_raw_bytes
from .downloader import download_range
from .exporter import export_csv, export_feather, export_parquet
from .metadata import MetadataDB
from .parallel_reader import read_tick_data_parallel
from .rate_limiter import AdaptiveRateLimiter, LimiterRegistry

__all__ = [
    "CONFIG",
    "Config",
    "reload_config",
    "TickChunk",
    "download_range",
    "read_tick_data_parallel",
    "export_parquet",
    "export_csv",
    "export_feather",
    "decode_chunk",
    "decode_raw_bytes",
    "MetadataDB",
    "AdaptiveRateLimiter",
    "LimiterRegistry",
    "is_market_open",
    "filter_trading_hours",
    "PIPET_SIZE_REGISTRY",
    "VOLUME_SCALE",
    "DUKASCOPY_DATA_FEED_BASE",
]

__version__ = "2.0.0"
