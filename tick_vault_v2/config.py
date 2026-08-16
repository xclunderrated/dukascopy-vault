"""Configuration settings for TickVault 2.0."""

import os
from pathlib import Path
from typing import Literal, Optional
from pydantic import BaseModel, Field

class Config(BaseModel):
    """Configuration settings for TickVault 2.0."""
    base_directory: Path = Field(
        default=Path("./tick_vault_data"),
        description="Root directory for all tick data, metadata database, and logs",
    )
    fetch_max_retry_attempts: int = Field(
        default=5,
        ge=0,
        le=15,
        description="Maximum retry attempts for failed requests (0-15)",
    )
    fetch_base_retry_delay: float = Field(
        default=0.8,
        gt=0,
        le=60.0,
        description="Base delay in seconds for exponential backoff",
    )
    worker_per_proxy: int = Field(
        default=24,
        ge=1,
        le=100,
        description="Concurrent download workers per proxy endpoint",
    )
    enable_http2: bool = Field(
        default=False,
        description="Enable HTTP/2 multiplexing (False for fast HTTP/1.1 pipelining with Dukascopy)",
    )
    filter_market_hours: bool = Field(
        default=True,
        description="Auto-filter weekend & holiday closures to eliminate 404s",
    )
    worker_queue_timeout: float = Field(
        default=45.0,
        gt=0,
        description="Timeout in seconds for worker queue operations",
    )
    metadata_update_batch_size: int = Field(
        default=500,
        ge=1,
        le=50000,
        description="Number of chunk records per SQLite batch write",
    )
    decompression_workers: int = Field(
        default=16,
        ge=1,
        le=64,
        description="Parallel CPU workers for multi-core LZMA decompression",
    )
    base_log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO",
        description="Base logging level",
    )

    @property
    def save_directory(self) -> Path:
        return self.base_directory / "downloads"

    @property
    def metadata_db_path(self) -> Path:
        return self.base_directory / "metadata.db"

    @property
    def log_file_path(self) -> Path:
        return self.base_directory / "logs.log"


CONFIG = Config()


def reload_config(**kwargs) -> Config:
    global CONFIG
    data = CONFIG.model_dump()
    data.update(kwargs)
    CONFIG = Config(**data)
    return CONFIG
