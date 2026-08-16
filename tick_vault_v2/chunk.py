"""TickChunk data model and path handling."""

import os
from datetime import UTC, datetime
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from .config import CONFIG
from .constants import DUKASCOPY_DATA_FEED_BASE


def format_relative_tick_path(symbol: str, time: datetime) -> str:
    """
    Format a relative path for tick data following Dukascopy's structure.
    Dukascopy uses 0-indexed months (00-11) in their hierarchy.
    """
    year = time.year
    month = time.month - 1  # 0-indexed month
    day = time.day
    hour = time.hour
    return f"{symbol.upper()}/{year}/{month:02d}/{day:02d}/{hour:02d}h_ticks.bi5"


class TickChunk(BaseModel, frozen=True):
    """Represents a single hour of tick data for a trading symbol."""

    symbol: str = Field(min_length=1)
    time: datetime

    @field_validator("time", mode="before")
    @classmethod
    def validate_and_normalize_time(cls, v: datetime) -> datetime:
        if isinstance(v, str):
            v = datetime.fromisoformat(v)
        if not isinstance(v, datetime):
            raise TypeError(f"Expected datetime, got {type(v).__name__}")
        
        # Round to zero minutes/seconds
        v = v.replace(minute=0, second=0, microsecond=0)
        if v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v.astimezone(UTC)

    @property
    def url(self) -> str:
        return DUKASCOPY_DATA_FEED_BASE + format_relative_tick_path(self.symbol, self.time)

    def path(self, base: str | Path | None = None) -> Path:
        base_dir = Path(base) if base else CONFIG.save_directory
        return base_dir / format_relative_tick_path(self.symbol, self.time)

    def exists(self, base: str | Path | None = None) -> bool:
        return self.path(base).is_file()

    def save(self, content: bytes, base: str | Path | None = None) -> None:
        file_path = self.path(base)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(content)

    def load(self, base: str | Path | None = None) -> bytes:
        file_path = self.path(base)
        if not file_path.exists():
            raise FileNotFoundError(f"Chunk file not found: {file_path}")
        return file_path.read_bytes()
