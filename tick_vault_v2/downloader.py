"""Pipelined concurrent download orchestrator with market calendar filtering."""

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Callable, List, Optional
from .calendar import filter_trading_hours
from .chunk import TickChunk
from .config import CONFIG
from .fetcher import create_http_client, fetch_chunk_content
from .metadata import MetadataDB
from .rate_limiter import LimiterRegistry


def generate_hourly_datetimes(start: datetime, end: datetime) -> List[datetime]:
    """Generate normalized UTC hourly datetimes [start, end)."""
    start_utc = start.replace(minute=0, second=0, microsecond=0)
    start_utc = start_utc if start_utc.tzinfo else start_utc.replace(tzinfo=UTC)
    
    end_utc = end.replace(minute=0, second=0, microsecond=0)
    end_utc = end_utc if end_utc.tzinfo else end_utc.replace(tzinfo=UTC)

    hours = []
    curr = start_utc
    while curr < end_utc:
        hours.append(curr)
        curr += timedelta(hours=1)
    return hours


async def _download_worker_loop(
    worker_id: int,
    proxy: Optional[str],
    input_queue: asyncio.Queue[Optional[TickChunk]],
    output_queue: asyncio.Queue[tuple[TickChunk, Optional[bytes]]],
):
    """Persistent worker loop reusing an HTTP/2 client connection."""
    client = create_http_client(proxy)
    try:
        while True:
            try:
                chunk = await asyncio.wait_for(input_queue.get(), timeout=CONFIG.worker_queue_timeout)
            except asyncio.TimeoutError:
                break

            if chunk is None:
                # Sentinel shutdown signal
                input_queue.task_done()
                break

            try:
                content = await fetch_chunk_content(client, chunk.url, proxy=proxy)
                if content is not None:
                    # Async non-blocking file write
                    await asyncio.to_thread(chunk.save, content)
                await output_queue.put((chunk, content))
            except Exception as e:
                # Put with None on hard failure
                await output_queue.put((chunk, None))
            finally:
                input_queue.task_done()
    finally:
        await client.aclose()


async def download_range(
    symbol: str,
    start: datetime,
    end: Optional[datetime] = None,
    proxies: Optional[List[str]] = None,
    progress_callback: Optional[Callable[[dict], None]] = None,
) -> dict:
    """
    High-speed download orchestrator for Dukascopy tick data.
    
    Features:
    - Smart calendar filtering (zero 404 requests for closed weekends/holidays)
    - Persistent HTTP/2 connection pooling
    - Adaptive AIMD rate limiting & proxy circuit breakers
    - SQLite WAL batch updates with parameter overflow protection
    """
    sym = symbol.upper()
    end_dt = end or datetime.now(tz=UTC)
    all_hours = generate_hourly_datetimes(start, end_dt)

    if not all_hours:
        return {"status": "no_hours", "total_chunks": 0}

    # 1. Market Calendar Filter
    if CONFIG.filter_market_hours:
        active_hours, closed_hours = filter_trading_hours(sym, all_hours)
    else:
        active_hours, closed_hours = all_hours, []

    # 2. SQLite Database Initialization & Query
    with MetadataDB() as db:
        # Pre-record closed hours as no-data without sending network requests
        if closed_hours:
            closed_chunks = [TickChunk(symbol=sym, time=dt) for dt in closed_hours]
            db.insert_rows(closed_chunks)

        # Find unattempted active chunks using fast range scan
        chunks_to_download = db.find_not_attempted_chunks(sym, start, end_dt, active_hours)

    total_chunks = len(chunks_to_download)
    bypassed_404_count = len(closed_hours)

    if not chunks_to_download:
        return {
            "status": "completed",
            "symbol": sym,
            "total_chunks": len(all_hours),
            "downloaded": 0,
            "bypassed_closed_hours": bypassed_404_count,
            "message": "All data already present in database",
        }

    # 3. Setup Worker Queues and Proxy Distribution
    proxy_list = proxies or [None]
    workers_per_endpoint = CONFIG.worker_per_proxy
    total_workers = min(len(proxy_list) * workers_per_endpoint, max(1, total_chunks))

    input_queue: asyncio.Queue[Optional[TickChunk]] = asyncio.Queue()
    output_queue: asyncio.Queue[tuple[TickChunk, Optional[bytes]]] = asyncio.Queue()

    # Pre-fill input queue with all chunks
    for c in chunks_to_download:
        await input_queue.put(c)

    # Spawn persistent worker tasks
    tasks = []
    for i in range(total_workers):
        proxy = proxy_list[i % len(proxy_list)]
        t = asyncio.create_task(_download_worker_loop(i, proxy, input_queue, output_queue))
        tasks.append(t)

    # 4. Result Collector & Batch Database Writer
    completed_count = 0
    valid_chunks_count = 0
    total_bytes = 0
    batch_records: List[TickChunk] = []

    with MetadataDB() as db:
        while completed_count < total_chunks:
            chunk, content = await output_queue.get()
            completed_count += 1
            if content is not None:
                valid_chunks_count += 1
                total_bytes += len(content)

            batch_records.append(chunk)

            # Flush batch to SQLite
            if len(batch_records) >= CONFIG.metadata_update_batch_size or completed_count == total_chunks:
                db.insert_rows(batch_records)
                batch_records.clear()

            if progress_callback:
                progress_callback({
                    "symbol": sym,
                    "completed": completed_count,
                    "total": total_chunks,
                    "valid_chunks": valid_chunks_count,
                    "bypassed_closed_hours": bypassed_404_count,
                    "total_bytes": total_bytes,
                    "rate_limiters": [s.__dict__ for s in LimiterRegistry.all_stats()],
                })

    # Signal stop to all workers
    for _ in range(total_workers):
        await input_queue.put(None)

    await asyncio.gather(*tasks, return_exceptions=True)

    return {
        "status": "completed",
        "symbol": sym,
        "total_requested_hours": len(all_hours),
        "downloaded_chunks": total_chunks,
        "valid_tick_chunks": valid_chunks_count,
        "bypassed_closed_hours": bypassed_404_count,
        "total_bytes": total_bytes,
    }
