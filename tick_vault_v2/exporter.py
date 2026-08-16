"""High-performance export engine for quantitative finance research."""

from datetime import datetime
from pathlib import Path
from typing import Optional
import pandas as pd
from .parallel_reader import read_tick_data_parallel


def export_parquet(
    symbol: str,
    output_path: str | Path,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    compression: str = "zstd",
    pipet_scale: Optional[float] = None,
) -> Path:
    """
    Export tick data directly to a compressed Apache Parquet file.
    Parquet files offer 5x-10x compression over raw CSV and sub-second query speeds in DuckDB & Polars.
    """
    df = read_tick_data_parallel(symbol=symbol, start=start, end=end, pipet_scale=pipet_scale)
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(str(out_file), index=False, compression=compression)
    return out_file


def export_csv(
    symbol: str,
    output_path: str | Path,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    compress: bool = False,
    pipet_scale: Optional[float] = None,
) -> Path:
    """Export tick data to standard or gzip-compressed CSV."""
    df = read_tick_data_parallel(symbol=symbol, start=start, end=end, pipet_scale=pipet_scale)
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    compression_arg = "gzip" if compress or str(out_file).endswith(".gz") else None
    df.to_csv(str(out_file), index=False, compression=compression_arg)
    return out_file


def export_feather(
    symbol: str,
    output_path: str | Path,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    pipet_scale: Optional[float] = None,
) -> Path:
    """Export tick data to Apache Arrow Feather format for zero-copy memory mapping."""
    df = read_tick_data_parallel(symbol=symbol, start=start, end=end, pipet_scale=pipet_scale)
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    df.to_feather(str(out_file))
    return out_file
