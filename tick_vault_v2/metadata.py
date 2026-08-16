"""Optimized SQLite metadata database with WAL mode and range queries."""

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import List, Optional, Set
from .chunk import TickChunk
from .config import CONFIG


class MetadataDB:
    """
    High-speed SQLite metadata manager for tracking downloaded hours per symbol.
    Supports WAL journaling, indexed range queries, and fast batch inserts.
    """

    def __init__(self, db_path: Optional[str | Path] = None):
        self.db_path = Path(db_path) if db_path else CONFIG.metadata_db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        self.conn = sqlite3.connect(
            str(self.db_path),
            timeout=30.0,
            check_same_thread=False,
        )
        # WAL mode and speed PRAGMAs
        self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.execute("PRAGMA synchronous = NORMAL")
        self.conn.execute("PRAGMA temp_store = MEMORY")
        self.conn.execute("PRAGMA cache_size = -64000")  # 64MB cache

    def _get_table_name(self, symbol: str) -> str:
        clean = "".join(c if c.isalnum() else "_" for c in symbol.upper())
        return f"symbol_{clean}"

    def _ensure_table(self, symbol: str) -> str:
        table_name = self._get_table_name(symbol)
        self.conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                timestamp INTEGER PRIMARY KEY,
                has_data INTEGER NOT NULL CHECK(has_data IN (0, 1)),
                file_size INTEGER DEFAULT 0,
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
            """
        )
        self.conn.commit()
        return table_name

    def insert_rows(self, chunks: List[TickChunk]) -> None:
        """Insert or update metadata rows in batch."""
        if not chunks:
            return

        by_symbol: dict[str, list[tuple[int, int, int]]] = {}
        for c in chunks:
            sym = c.symbol.upper()
            if sym not in by_symbol:
                by_symbol[sym] = []
            
            ts = int(c.time.timestamp())
            path = c.path()
            if path.is_file() and path.stat().st_size > 0:
                has_data = 1
                size = path.stat().st_size
            else:
                has_data = 0
                size = 0
            by_symbol[sym].append((ts, has_data, size))

        for sym, rows in by_symbol.items():
            tbl = self._ensure_table(sym)
            self.conn.executemany(
                f"""
                INSERT OR REPLACE INTO {tbl} (timestamp, has_data, file_size, updated_at)
                VALUES (?, ?, ?, strftime('%s', 'now'))
                """,
                rows,
            )
        self.conn.commit()

    def find_not_attempted_chunks(
        self, symbol: str, start: datetime, end: datetime, all_hours: List[datetime]
    ) -> List[TickChunk]:
        """
        Find chunks within range that are not yet recorded in SQLite.
        Uses an indexed interval scan to completely avoid SQLite parameter limit crashes.
        """
        tbl = self._ensure_table(symbol)
        
        start_ts = int(start.timestamp())
        end_ts = int(end.timestamp())

        cursor = self.conn.execute(
            f"SELECT timestamp FROM {tbl} WHERE timestamp >= ? AND timestamp < ?",
            (start_ts, end_ts),
        )
        existing_ts: Set[int] = {row[0] for row in cursor.fetchall()}

        unattempted = []
        for dt in all_hours:
            ts = int(dt.timestamp())
            if ts not in existing_ts:
                unattempted.append(TickChunk(symbol=symbol, time=dt))

        return unattempted

    def get_available_chunks(
        self, symbol: str, start: datetime, end: datetime
    ) -> List[TickChunk]:
        """Retrieve all downloaded chunks with actual data (has_data=1) in range."""
        tbl = self._ensure_table(symbol)
        start_ts = int(start.timestamp())
        end_ts = int(end.timestamp())

        cursor = self.conn.execute(
            f"""
            SELECT timestamp FROM {tbl}
            WHERE timestamp >= ? AND timestamp < ? AND has_data = 1
            ORDER BY timestamp ASC
            """,
            (start_ts, end_ts),
        )
        return [
            TickChunk(symbol=symbol, time=datetime.fromtimestamp(row[0], tz=UTC))
            for row in cursor.fetchall()
        ]

    def first_chunk(self, symbol: str) -> Optional[TickChunk]:
        tbl = self._ensure_table(symbol)
        cursor = self.conn.execute(f"SELECT MIN(timestamp) FROM {tbl} WHERE has_data = 1")
        row = cursor.fetchone()
        if row and row[0] is not None:
            return TickChunk(symbol=symbol, time=datetime.fromtimestamp(row[0], tz=UTC))
        return None

    def last_chunk(self, symbol: str) -> Optional[TickChunk]:
        tbl = self._ensure_table(symbol)
        cursor = self.conn.execute(f"SELECT MAX(timestamp) FROM {tbl} WHERE has_data = 1")
        row = cursor.fetchone()
        if row and row[0] is not None:
            return TickChunk(symbol=symbol, time=datetime.fromtimestamp(row[0], tz=UTC))
        return None

    def get_summary(self, symbol: str) -> dict:
        tbl = self._ensure_table(symbol)
        cursor = self.conn.execute(
            f"""
            SELECT 
                COUNT(*) as total_records,
                SUM(CASE WHEN has_data = 1 THEN 1 ELSE 0 END) as valid_data_chunks,
                SUM(CASE WHEN has_data = 0 THEN 1 ELSE 0 END) as empty_chunks,
                SUM(file_size) as total_bytes,
                MIN(timestamp) as min_ts,
                MAX(timestamp) as max_ts
            FROM {tbl}
            """
        )
        row = cursor.fetchone()
        if not row or row[0] == 0:
            return {
                "symbol": symbol,
                "total_records": 0,
                "valid_data_chunks": 0,
                "empty_chunks": 0,
                "total_bytes": 0,
                "start_time": None,
                "end_time": None,
            }

        return {
            "symbol": symbol,
            "total_records": row[0] or 0,
            "valid_data_chunks": row[1] or 0,
            "empty_chunks": row[2] or 0,
            "total_bytes": row[3] or 0,
            "start_time": datetime.fromtimestamp(row[4], tz=UTC).isoformat() if row[4] else None,
            "end_time": datetime.fromtimestamp(row[5], tz=UTC).isoformat() if row[5] else None,
        }

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
