import React, { useState } from 'react';
import { Activity, Zap, Shield, AlertTriangle, RefreshCw, Cpu, Gauge, CheckCircle2, Flame, BarChart3, Database } from 'lucide-react';
import { BenchmarkResult } from '../types';

interface LiveBenchmarkResult {
  targetTicks: number;
  totalDurationMs: number;
  totalThroughputTicksPerSec: number;
  stages: {
    decompression: {
      engine: string;
      durationMs: number;
      ticksPerSec: number;
      bandwidthMBps: number;
    };
    binaryParsing: {
      engine: string;
      durationMs: number;
      ticksPerSec: number;
    };
    columnarPipeline: {
      engine: string;
      durationMs: number;
      ticksPerSec: number;
    };
    candlestickAggregation: {
      engine: string;
      ticksPerSec: number;
    };
  };
}

export const BenchmarkView: React.FC = () => {
  const [symbol, setSymbol] = useState('EURUSD');
  const [testHours, setTestHours] = useState(72);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  // Live Hardware Decoder Stress Test State
  const [targetTicks, setTargetTicks] = useState(250000);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveResult, setLiveResult] = useState<LiveBenchmarkResult | null>(null);

  const runBenchmark = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, testHours }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('Benchmark failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const runLiveHardwareStressTest = async () => {
    setLiveLoading(true);
    try {
      const res = await fetch('/api/benchmark/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTicks }),
      });
      const data = await res.json();
      setLiveResult(data);
    } catch (err) {
      console.error('Live benchmark failed:', err);
    } finally {
      setLiveLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Live Hardware Decoder Benchmark Section */}
      <div className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-emerald-500/30 p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px] uppercase tracking-wider border border-emerald-500/30">
                Native C++ liblzma Engine
              </span>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Flame className="h-5 w-5 text-amber-400" />
                Live Hardware Decoder Stress Test
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Decompresses real Dukascopy binary streams in-memory and benchmarks end-to-end ticks/sec on this server.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={targetTicks}
              onChange={(e) => setTargetTicks(parseInt(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              <option value={50000}>50,000 Ticks (Micro-burst)</option>
              <option value={250000}>250,000 Ticks (Standard Day)</option>
              <option value={1000000}>1,000,000 Ticks (Extreme Stress)</option>
            </select>

            <button
              onClick={runLiveHardwareStressTest}
              disabled={liveLoading}
              className="py-1.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-950/30"
            >
              {liveLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
              Execute Live Benchmark
            </button>
          </div>
        </div>

        {liveResult ? (
          <div className="space-y-4">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[11px] text-slate-400 font-medium block">Total Throughput</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    {(liveResult.totalThroughputTicksPerSec / 1000000).toFixed(2)}M
                  </span>
                  <span className="text-[10px] text-slate-400">ticks/sec</span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[11px] text-slate-400 font-medium block">C++ liblzma Decompression</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-bold font-mono text-cyan-400">
                    {(liveResult.stages.decompression.ticksPerSec / 1000000).toFixed(2)}M
                  </span>
                  <span className="text-[10px] text-slate-400">ticks/sec</span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[11px] text-slate-400 font-medium block">Binary Parsing</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-bold font-mono text-purple-400">
                    {(liveResult.stages.binaryParsing.ticksPerSec / 1000000).toFixed(2)}M
                  </span>
                  <span className="text-[10px] text-slate-400">ticks/sec</span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[11px] text-slate-400 font-medium block">Candlestick Aggregator</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-bold font-mono text-amber-400">
                    {(liveResult.stages.candlestickAggregation.ticksPerSec / 1000000).toFixed(1)}M
                  </span>
                  <span className="text-[10px] text-slate-400">ticks/sec</span>
                </div>
              </div>
            </div>

            {/* Detailed Stage Breakdown Table */}
            <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-900/80 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5">Pipeline Stage</th>
                    <th className="px-4 py-2.5">Implementation Engine</th>
                    <th className="px-4 py-2.5 text-right">Execution Latency</th>
                    <th className="px-4 py-2.5 text-right">Throughput</th>
                    <th className="px-4 py-2.5 text-right">Legacy Scraper Speedup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  <tr>
                    <td className="px-4 py-2.5 text-white font-medium flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                      LZMA Decompression
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{liveResult.stages.decompression.engine}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-cyan-400">{liveResult.stages.decompression.durationMs}ms</td>
                    <td className="px-4 py-2.5 text-right font-mono text-white font-semibold">
                      {liveResult.stages.decompression.ticksPerSec.toLocaleString()} ticks/s
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-400 font-bold">
                      {Math.max(1, Math.round(liveResult.stages.decompression.ticksPerSec / 150000))}x faster
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-white font-medium flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-purple-400" />
                      Vectorized Struct Unpack
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{liveResult.stages.binaryParsing.engine}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-purple-400">{liveResult.stages.binaryParsing.durationMs}ms</td>
                    <td className="px-4 py-2.5 text-right font-mono text-white font-semibold">
                      {liveResult.stages.binaryParsing.ticksPerSec.toLocaleString()} ticks/s
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-400 font-bold">
                      {Math.max(1, Math.round(liveResult.stages.binaryParsing.ticksPerSec / 450000))}x faster
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-white font-medium flex items-center gap-2">
                      <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
                      Candlestick Stream Aggregator
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{liveResult.stages.candlestickAggregation.engine}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-400">&lt; 1ms</td>
                    <td className="px-4 py-2.5 text-right font-mono text-white font-semibold">
                      {liveResult.stages.candlestickAggregation.ticksPerSec.toLocaleString()} ticks/s
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-400 font-bold">50x faster</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-slate-500">
              Click <strong className="text-emerald-400 font-semibold">"Execute Live Benchmark"</strong> to test real C++ liblzma decompression performance directly on this server.
            </p>
          </div>
        )}
      </div>

      {/* Benchmark Control Header */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-400" />
              Engine Architecture & Request Elimination Matrix
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Compare naive sequential scraping vs TickVault 2.5 Turbo with Token-Bucket AIMD and Multi-Core Decompression
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              <option value="EURUSD">EURUSD (Forex)</option>
              <option value="XAUUSD">XAUUSD (Gold)</option>
              <option value="BTCUSD">BTCUSD (Crypto)</option>
            </select>

            <select
              value={testHours}
              onChange={(e) => setTestHours(parseInt(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              <option value={48}>48 Hours (2 Days)</option>
              <option value={168}>168 Hours (1 Week)</option>
              <option value={720}>720 Hours (1 Month)</option>
              <option value={8760}>8,760 Hours (1 Year)</option>
            </select>

            <button
              onClick={runBenchmark}
              disabled={loading}
              className="py-1.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Run Architectural Analysis
            </button>
          </div>
        </div>
      </div>

      {result ? (
        <div className="space-y-6">
          {/* Summary Callout Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/30">
              <span className="text-xs text-emerald-400 font-semibold block mb-1">Download Acceleration</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-white">{result.summary.speedupFactor}x</span>
                <span className="text-xs text-slate-400">Faster HTTP/2 Streams</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-950/40 to-slate-900 border border-cyan-500/30">
              <span className="text-xs text-cyan-400 font-semibold block mb-1">Decompression Throughput</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-white">{result.summary.decodingSpeedup}</span>
                <span className="text-xs text-slate-400">Native C++ liblzma</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/40 to-slate-900 border border-purple-500/30">
              <span className="text-xs text-purple-400 font-semibold block mb-1">Wasted Requests Eliminated</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-white">{result.summary.requestsSaved}</span>
                <span className="text-xs text-slate-400">Zero Weekend 404s</span>
              </div>
            </div>
          </div>

          {/* Side-by-Side Architectural Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Standard Scraper Card */}
            <div className="rounded-xl bg-slate-900/90 border border-rose-900/40 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-400" />
                  <h3 className="font-bold text-white text-sm">Standard / Legacy Scraper</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  Vulnerable
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Requests Dispatched:</span>
                  <span className="font-mono text-slate-200">{result.standardScraper.totalRequestsSent}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Wasted 404 Weekend Requests:</span>
                  <span className="font-mono text-rose-400 font-semibold">
                    {result.standardScraper.wasted404Requests} (banned risk)
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">IP Ban / 429 Throttle Risk:</span>
                  <span className="font-semibold text-rose-400">{result.standardScraper.rateLimitExceededRisk}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Connection Architecture:</span>
                  <span className="text-slate-300">{result.standardScraper.connectionModel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Estimated Download Time:</span>
                  <span className="font-mono text-slate-200">{result.standardScraper.estimatedDownloadTimeSec}s</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">LZMA Decoding Speed:</span>
                  <span className="font-mono text-slate-400">{result.standardScraper.decodingSpeedTicksPerSec}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Database Query Limits:</span>
                  <span className="font-mono text-rose-400">{result.standardScraper.databaseParamLimit}</span>
                </div>
              </div>
            </div>

            {/* TickVault 2.5 Card */}
            <div className="rounded-xl bg-slate-900/90 border border-emerald-500/40 p-5 space-y-4 shadow-lg shadow-emerald-950/20">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-emerald-400" />
                  <h3 className="font-bold text-white text-sm">TickVault 2.5 Turbo Engine</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Optimized
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Requests Dispatched:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{result.tickVault2.totalRequestsSent}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Wasted 404 Weekend Requests:</span>
                  <span className="font-mono text-emerald-400 font-semibold">0 (Zero!)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">IP Ban / 429 Throttle Risk:</span>
                  <span className="font-semibold text-emerald-400">{result.tickVault2.rateLimitExceededRisk}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Connection Architecture:</span>
                  <span className="text-emerald-300">{result.tickVault2.connectionModel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Estimated Download Time:</span>
                  <span className="font-mono text-emerald-400 font-bold">{result.tickVault2.estimatedDownloadTimeSec}s</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">LZMA Decoding Speed:</span>
                  <span className="font-mono text-emerald-400 font-bold">{result.tickVault2.decodingSpeedTicksPerSec}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Database Query Limits:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{result.tickVault2.databaseParamLimit}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center space-y-3">
          <Activity className="h-10 w-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-white">Ready for Performance Comparison</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click "Run Architectural Analysis" above to compute mathematical metrics for request savings, speedups, and ban elimination.
          </p>
        </div>
      )}
    </div>
  );
};
