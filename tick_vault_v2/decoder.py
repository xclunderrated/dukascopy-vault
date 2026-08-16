"""High-speed binary chunk decoder for Dukascopy .bi5 LZMA compressed tick data."""

import lzma
import struct
from datetime import UTC, datetime
from typing import Optional
import numpy as np
from .constants import PIPET_SIZE_REGISTRY, VOLUME_SCALE
from .chunk import TickChunk


# Record layout: Big-Endian (>u4, >u4, >u4, >f4, >f4)
TICK_DTYPE = np.dtype([
    ("time", ">u4"),        # Milliseconds from start of the hour
    ("ask", ">u4"),         # Ask price in integer points
    ("bid", ">u4"),         # Bid price in integer points
    ("ask_volume", ">f4"),  # Ask volume (float32)
    ("bid_volume", ">f4"),  # Bid volume (float32)
])

DECODED_DTYPE = np.dtype([
    ("time", "datetime64[ms]"),
    ("ask", "float64"),
    ("bid", "float64"),
    ("ask_volume", "int64"),
    ("bid_volume", "int64"),
])


def decode_raw_bytes(
    raw_compressed: bytes,
    pipet_scale: float,
    chunk_time: datetime,
) -> np.ndarray:
    """
    Decompress raw .bi5 LZMA bytes and parse 20-byte records into a structured NumPy array.
    """
    if not raw_compressed or len(raw_compressed) == 0:
        return np.empty(0, dtype=DECODED_DTYPE)

    # Decompress LZMA raw buffer
    try:
        decompressed = lzma.decompress(raw_compressed)
    except Exception:
        # Some empty or corrupted files might fail decompress
        return np.empty(0, dtype=DECODED_DTYPE)

    if len(decompressed) == 0 or len(decompressed) % 20 != 0:
        return np.empty(0, dtype=DECODED_DTYPE)

    raw_data = np.frombuffer(decompressed, dtype=TICK_DTYPE)
    count = len(raw_data)
    if count == 0:
        return np.empty(0, dtype=DECODED_DTYPE)

    result = np.empty(count, dtype=DECODED_DTYPE)

    # Convert timestamps: hour start in UTC ms + offset in ms
    base_ms = np.datetime64(chunk_time.replace(tzinfo=None), "ms")
    result["time"] = base_ms + raw_data["time"].astype(np.int64).astype("timedelta64[ms]")

    # Convert integer prices to floating point
    result["ask"] = raw_data["ask"].astype(np.float64) * pipet_scale
    result["bid"] = raw_data["bid"].astype(np.float64) * pipet_scale

    # Convert volume to integer lots / units
    result["ask_volume"] = np.round(raw_data["ask_volume"].astype(np.float64) * VOLUME_SCALE).astype(np.int64)
    result["bid_volume"] = np.round(raw_data["bid_volume"].astype(np.float64) * VOLUME_SCALE).astype(np.int64)

    return result


def decode_chunk(chunk: TickChunk, pipet_scale: Optional[float] = None) -> np.ndarray:
    """Load and decode a single chunk from disk."""
    if pipet_scale is None:
        pipet_scale = PIPET_SIZE_REGISTRY.get(chunk.symbol.upper(), 1e-5)

    try:
        raw_bytes = chunk.load()
        return decode_raw_bytes(raw_bytes, pipet_scale, chunk.time)
    except FileNotFoundError:
        return np.empty(0, dtype=DECODED_DTYPE)
