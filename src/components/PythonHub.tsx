import React, { useState } from 'react';
import { Terminal, Copy, Check, Code, Cpu, ArrowUpRight, BookOpen, Layers } from 'lucide-react';

export const PythonHub: React.FC = () => {
  const [activeSnippet, setActiveSnippet] = useState<'quickstart' | 'pandas' | 'parquet' | 'duckdb' | 'backtrader'>(
    'quickstart'
  );
  const [copied, setCopied] = useState(false);

  const snippets = {
    quickstart: `# 1. Import TickVault 2.0
import asyncio
from datetime import datetime, UTC
import tick_vault_v2 as tv

# 2. Download historical range with Adaptive Rate Limiting & Calendar Filtering
async def main():
    result = await tv.download_range(
        symbol="EURUSD",
        start=datetime(2024, 3, 1, tzinfo=UTC),
        end=datetime(2024, 3, 5, tzinfo=UTC),
    )
    print(f"Download complete: {result}")

    # 3. Read ticks across multi-core ThreadPool (15x-25x speedup)
    df = tv.read_tick_data_parallel(
        symbol="EURUSD",
        start=datetime(2024, 3, 1, tzinfo=UTC),
        end=datetime(2024, 3, 2, tzinfo=UTC),
    )
    print(df.head())

asyncio.run(main())`,

    pandas: `import tick_vault_v2 as tv
from datetime import datetime, UTC
import pandas as pd

# Load high-frequency ticks into a memory-efficient Pandas DataFrame
df = tv.read_tick_data_parallel(
    symbol="EURUSD",
    start=datetime(2024, 1, 1, tzinfo=UTC),
    end=datetime(2024, 1, 31, tzinfo=UTC),
)

# Calculate microsecond mid-price and spread
df["mid"] = (df["ask"] + df["bid"]) / 2.0
df["spread_pips"] = (df["ask"] - df["bid"]) / 1e-4

# Resample to 1-Minute OHLCV Candles
df["datetime"] = pd.to_datetime(df["time"])
df.set_index("datetime", inplace=True)
ohlcv_1m = df["mid"].resample("1min").ohlc()
print(ohlcv_1m.head())`,

    parquet: `import tick_vault_v2 as tv
from datetime import datetime, UTC

# Stream & directly compile to compressed Apache Parquet (ZSTD)
out_path = tv.export_parquet(
    symbol="XAUUSD",
    output_path="./data/gold_ticks_2024.parquet",
    start=datetime(2024, 1, 1, tzinfo=UTC),
    end=datetime(2024, 3, 1, tzinfo=UTC),
    compression="zstd",
)
print(f"Parquet file generated: {out_path}")`,

    duckdb: `import duckdb
import tick_vault_v2 as tv
from datetime import datetime, UTC

# Export to Parquet first
parquet_file = tv.export_parquet("EURUSD", "eurusd.parquet", start=datetime(2024, 3, 1, tzinfo=UTC))

# Run zero-copy SQL analytics via DuckDB engine
con = duckdb.connect()
analytics = con.execute("""
    SELECT 
        time_bucket(INTERVAL '5 Minutes', time::TIMESTAMP) as bucket,
        FIRST(bid) as open,
        MAX(bid) as high,
        MIN(bid) as low,
        LAST(bid) as close,
        SUM(ask_volume + bid_volume) as total_volume,
        AVG(ask - bid) as avg_spread
    FROM 'eurusd.parquet'
    GROUP BY 1
    ORDER BY 1 ASC
""").df()

print(analytics.head())`,

    backtrader: `import backtrader as bt
import tick_vault_v2 as tv
from datetime import datetime, UTC

# 1. Pull historical tick data
df = tv.read_tick_data_parallel("EURUSD", start=datetime(2024, 3, 1, tzinfo=UTC))

# 2. Feed into Backtrader PandasData feed
data = bt.feeds.PandasData(
    dataname=df,
    datetime='time',
    open='bid',
    high='bid',
    low='bid',
    close='bid',
    volume='bid_volume',
    openinterest=-1
)

cerebro = bt.Cerebro()
cerebro.adddata(data)
print("Ready for algorithmic backtesting!")`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeSnippet]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Terminal className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">TickVault 2.0 Python Library</h2>
            <p className="text-xs text-slate-400">
              High-speed Python engine with parallel C-level LZMA decompression and zero-copy export
            </p>
          </div>
        </div>
      </div>

      {/* Code Snippet Box */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between bg-slate-950 px-4 py-2 border-b border-slate-800 gap-2">
          <div className="flex gap-1 overflow-x-auto">
            {(
              [
                { id: 'quickstart', label: 'Quickstart' },
                { id: 'pandas', label: 'Pandas / Resampling' },
                { id: 'parquet', label: 'Parquet (ZSTD)' },
                { id: 'duckdb', label: 'DuckDB SQL' },
                { id: 'backtrader', label: 'Backtrader Feed' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveSnippet(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeSnippet === t.id
                    ? 'bg-slate-800 text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded bg-slate-850 border border-slate-700 transition cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Code View */}
        <div className="p-4 bg-slate-950 font-mono text-xs text-emerald-300 overflow-x-auto">
          <pre className="leading-relaxed whitespace-pre">{snippets[activeSnippet]}</pre>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
          <span className="font-semibold text-white flex items-center gap-1.5">
            <Cpu className="h-4 w-4 text-emerald-400" /> Multi-Core LZMA
          </span>
          <p className="text-slate-400">
            Releases the Python GIL during LZMA decompression, achieving over 2,400,000 ticks/sec across worker pools.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
          <span className="font-semibold text-white flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-cyan-400" /> DuckDB & Parquet
          </span>
          <p className="text-slate-400">
            Directly export multi-gigabyte tick datasets into zero-copy Apache Arrow and Parquet for instant quant backtesting.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
          <span className="font-semibold text-white flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-purple-400" /> SQLite Range Index
          </span>
          <p className="text-slate-400">
            Replaces SQL <code>IN (...)</code> variable limits with continuous time index interval queries for unlimited data spans.
          </p>
        </div>
      </div>
    </div>
  );
};
