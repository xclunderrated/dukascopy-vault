import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import {
  BarChart2,
  Download,
  Table,
  Activity,
  Filter,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Layers,
  Sparkles,
  Play,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Candlestick, DecodedTick, SymbolInfo, TimeframeConfig } from '../types';
import { unpackBinaryTicks } from '../lib/tickEngine';
import { TradingViewChart } from './TradingViewChart';

interface TickExplorerProps {
  symbols: SymbolInfo[];
  initialSymbol?: string;
  initialStartDate?: string;
  initialEndDate?: string;
}

export const TickExplorer: React.FC<TickExplorerProps> = ({
  symbols,
  initialSymbol = 'EURUSD',
  initialStartDate = '2024-03-01T08:00:00Z',
  initialEndDate = '2024-03-01T16:00:00Z',
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [startDate, setStartDate] = useState(initialStartDate.slice(0, 16));
  const [endDate, setEndDate] = useState(initialEndDate.slice(0, 16));
  const [timeframeSec, setTimeframeSec] = useState(60);
  const [activeView, setActiveView] = useState<'tradingview' | 'ticks' | 'table'>('tradingview');
  const [ipcMode, setIpcMode] = useState<'json' | 'binary'>('binary');

  // Confirmed execution state
  const [confirmedRange, setConfirmedRange] = useState<{
    symbol: string;
    startDate: string;
    endDate: string;
    runToken: number;
  }>({
    symbol: initialSymbol,
    startDate: new Date(initialStartDate).toISOString(),
    endDate: new Date(initialEndDate).toISOString(),
    runToken: 0, // 0 = not started yet until user confirms
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticksData, setTicksData] = useState<DecodedTick[]>([]);
  const [stats, setStats] = useState<{
    avgSpread: number;
    minPrice: number;
    maxPrice: number;
    totalAskVol: number;
    totalBidVol: number;
    totalTicks: number;
    decodeDurationMs: number;
  }>({
    avgSpread: 0,
    minPrice: 0,
    maxPrice: 0,
    totalAskVol: 0,
    totalBidVol: 0,
    totalTicks: 0,
    decodeDurationMs: 0,
  });

  // Calculate hours in selected range
  const selectedRangeHours = useMemo(() => {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) return 0;
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60)));
  }, [startDate, endDate]);

  // Check if current inputs differ from confirmed run
  const isParametersChanged = useMemo(() => {
    if (confirmedRange.runToken === 0) return true;
    const currentStartIso = new Date(startDate).toISOString();
    const currentEndIso = new Date(endDate).toISOString();
    return (
      confirmedRange.symbol !== symbol ||
      confirmedRange.startDate !== currentStartIso ||
      confirmedRange.endDate !== currentEndIso
    );
  }, [symbol, startDate, endDate, confirmedRange]);

  // Trigger the confirmed pipeline run
  const handleConfirmAndStart = () => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) {
      setError('Please provide a valid start and end date (end date must be after start date)');
      return;
    }
    setError(null);
    const newRunToken = Date.now();
    setConfirmedRange({
      symbol,
      startDate: s.toISOString(),
      endDate: e.toISOString(),
      runToken: newRunToken,
    });

    if (activeView === 'ticks' || activeView === 'table') {
      fetchRawTicks(s.toISOString(), e.toISOString());
    }
  };

  const fetchRawTicks = async (customStart?: string, customEnd?: string) => {
    const sDate = customStart || new Date(startDate).toISOString();
    const eDate = customEnd || new Date(endDate).toISOString();
    setLoading(true);
    setError(null);
    const fetchStart = performance.now();
    try {
      if (ipcMode === 'binary') {
        const binRes = await fetch(
          `/api/ticks/binary?symbol=${symbol}&startDate=${sDate}&endDate=${eDate}&downsample=3000`
        );
        if (!binRes.ok) throw new Error(`Binary fetch failed: ${binRes.statusText}`);
        const arrayBuf = await binRes.arrayBuffer();
        const ticks = unpackBinaryTicks(arrayBuf);
        const decodeDurationMs = Math.round(performance.now() - fetchStart);
        setTicksData(ticks);

        // Fetch stats
        const candleRes = await fetch(
          `/api/ticks?symbol=${symbol}&startDate=${sDate}&endDate=${eDate}&timeframeSeconds=${timeframeSec}&maxTicks=10`
        );
        const candleData = await candleRes.json();
        setStats({
          avgSpread: candleData.stats?.avgSpread || 0,
          minPrice: candleData.stats?.minPrice || 0,
          maxPrice: candleData.stats?.maxPrice || 0,
          totalAskVol: candleData.stats?.totalAskVol || 0,
          totalBidVol: candleData.stats?.totalBidVol || 0,
          totalTicks: ticks.length,
          decodeDurationMs,
        });
      } else {
        const res = await fetch(
          `/api/ticks?symbol=${symbol}&startDate=${sDate}&endDate=${eDate}&timeframeSeconds=${timeframeSec}&maxTicks=4000`
        );
        if (!res.ok) throw new Error(`Failed to load ticks: ${res.statusText}`);
        const data = await res.json();
        setTicksData(data.ticks || []);
        setStats({
          avgSpread: data.stats?.avgSpread || 0,
          minPrice: data.stats?.minPrice || 0,
          maxPrice: data.stats?.maxPrice || 0,
          totalAskVol: data.stats?.totalAskVol || 0,
          totalBidVol: data.stats?.totalBidVol || 0,
          totalTicks: data.totalTicks || 0,
          decodeDurationMs: data.decodeDurationMs || 0,
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (hours: number, baseDateStr = '2024-03-01T08:00') => {
    const start = new Date(baseDateStr + ':00Z');
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    const sStr = start.toISOString().slice(0, 16);
    const eStr = end.toISOString().slice(0, 16);
    setStartDate(sStr);
    setEndDate(eStr);
  };

  // Export current ticks as CSV
  const downloadCSV = () => {
    if (!ticksData || ticksData.length === 0) return;
    const headers = 'time,timestampMs,ask,bid,spread,askVolume,bidVolume\n';
    const rows = ticksData
      .map((t) => `${t.time},${t.timestampMs},${t.ask},${t.bid},${t.spread},${t.askVolume},${t.bidVolume}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${symbol}_ticks_${startDate.replace(/:/g, '-')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Range Configuration & Confirm Bar */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 shadow-xl">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {/* Symbol */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">1. Symbol</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              >
                {symbols.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol} ({s.name})
                  </option>
                ))}
              </select>
            </div>

            {/* Start Time */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">2. Start Range (UTC)</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">3. End Range (UTC)</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Confirm & Start Action Button */}
            <div className="pt-2 sm:pt-0">
              <button
                onClick={handleConfirmAndStart}
                disabled={loading}
                className="py-1.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-400/30"
              >
                {loading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
                Confirm &amp; Start Process ({selectedRangeHours}h)
              </button>
            </div>

            {/* Protocol Switcher for raw views */}
            {activeView !== 'tradingview' && (
              <div className="pt-2 sm:pt-0">
                <button
                  onClick={() => {
                    const nextMode = ipcMode === 'json' ? 'binary' : 'json';
                    setIpcMode(nextMode);
                  }}
                  className={`py-1.5 px-2.5 rounded-lg border text-xs font-mono flex items-center gap-1 transition ${
                    ipcMode === 'binary'
                      ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-400 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'
                  }`}
                  title="Toggle between JSON object serialization and zero-copy binary streaming"
                >
                  <Zap className="h-3 w-3" />
                  {ipcMode === 'binary' ? 'Binary Stream (0-Copy)' : 'JSON IPC'}
                </button>
              </div>
            )}
          </div>

          {/* View Toggles & CSV Export */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveView('tradingview')}
                className={`px-3 py-1 text-xs rounded font-medium flex items-center gap-1.5 transition cursor-pointer ${
                  activeView === 'tradingview'
                    ? 'bg-emerald-600 text-white shadow font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="h-3 w-3" />
                TradingView Chart
              </button>
              <button
                onClick={() => setActiveView('ticks')}
                className={`px-3 py-1 text-xs rounded font-medium transition cursor-pointer ${
                  activeView === 'ticks' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Microstructure Spread
              </button>
              <button
                onClick={() => setActiveView('table')}
                className={`px-3 py-1 text-xs rounded font-medium transition cursor-pointer ${
                  activeView === 'table' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Data Table
              </button>
            </div>

            <button
              onClick={downloadCSV}
              disabled={ticksData.length === 0}
              className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Quick Session Presets Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-800/80 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Presets:
            </span>
            <button
              onClick={() => applyPreset(1, '2024-03-01T08:00')}
              className="px-2.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
            >
              London Open (1 Hr)
            </button>
            <button
              onClick={() => applyPreset(4, '2024-03-01T12:00')}
              className="px-2.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
            >
              NY/London (4 Hrs)
            </button>
            <button
              onClick={() => applyPreset(12, '2024-03-01T06:00')}
              className="px-2.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
            >
              Full Day (12 Hrs)
            </button>
            <button
              onClick={() => applyPreset(72, '2024-03-01T00:00')}
              className="px-2.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
            >
              3 Days (72 Hrs)
            </button>
            <button
              onClick={() => applyPreset(168, '2024-03-01T00:00')}
              className="px-2.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
            >
              1 Week (168 Hrs)
            </button>
          </div>

          {/* Configuration Status Notice */}
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            {confirmedRange.runToken === 0 ? (
              <span className="text-amber-400">
                &bull; Range selected ({selectedRangeHours}h). Press <strong>Confirm &amp; Start Process</strong> to stream.
              </span>
            ) : isParametersChanged ? (
              <span className="text-amber-300 font-medium">
                &bull; Parameters updated. Click <strong>Confirm &amp; Start</strong> to stream new range.
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Active Range Confirmed ({selectedRangeHours}h)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Primary Chart or Sub-views */}
      {activeView === 'tradingview' ? (
        <TradingViewChart
          symbol={confirmedRange.symbol}
          startDate={confirmedRange.startDate}
          endDate={confirmedRange.endDate}
          runToken={confirmedRange.runToken}
          onStartRequest={handleConfirmAndStart}
          initialTimeframe={timeframeSec}
          onTimeframeChange={(tf: TimeframeConfig) => setTimeframeSec(tf.seconds)}
        />
      ) : activeView === 'ticks' ? (
        <div className="space-y-4">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Total Ticks Decoded</span>
              <span className="font-mono text-sm font-bold text-white">
                {stats.totalTicks.toLocaleString()}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Avg Bid/Ask Spread</span>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {stats.avgSpread}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Low Price</span>
              <span className="font-mono text-sm font-bold text-slate-200">{stats.minPrice}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">High Price</span>
              <span className="font-mono text-sm font-bold text-slate-200">{stats.maxPrice}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Ask / Bid Volume</span>
              <span className="font-mono text-sm font-bold text-cyan-400">
                {(stats.totalAskVol / 1e6).toFixed(1)}M / {(stats.totalBidVol / 1e6).toFixed(1)}M
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">LZMA Decode Time</span>
              <span className="font-mono text-sm font-bold text-amber-400">
                {stats.decodeDurationMs} <span className="text-[10px]">ms</span>
              </span>
            </div>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
            {loading ? (
              <div className="h-80 flex flex-col items-center justify-center space-y-3 text-slate-400">
                <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
                <p className="text-xs">Decompressing LZMA .bi5 chunks and constructing tick array...</p>
              </div>
            ) : error ? (
              <div className="h-80 flex flex-col items-center justify-center space-y-2 text-rose-400">
                <p className="text-sm font-semibold">Error decoding ticks</p>
                <p className="text-xs text-slate-400">{error}</p>
              </div>
            ) : ticksData.length === 0 ? (
              <div className="h-80 flex flex-col items-center justify-center space-y-2 text-slate-400">
                <BarChart2 className="h-8 w-8 text-slate-600" />
                <p className="text-sm font-medium text-slate-300">No ticks decoded yet</p>
                <p className="text-xs text-slate-500">
                  Select your range and click "Confirm &amp; Start Process" above.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span className="font-medium text-white">{symbol} - High Frequency Bid/Ask Tick Stream</span>
                  <span>{ticksData.length} raw ticks sampled</span>
                </div>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ticksData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(val) =>
                          new Date(val).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        }
                        stroke="#64748b"
                        fontSize={11}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => v.toFixed(4)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelFormatter={(val) => new Date(val).toISOString()}
                      />
                      <Area
                        type="stepAfter"
                        dataKey="ask"
                        stroke="#06b6d4"
                        fill="#06b6d4"
                        fillOpacity={0.1}
                        strokeWidth={1.5}
                        name="Ask Price"
                      />
                      <Area
                        type="stepAfter"
                        dataKey="bid"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.1}
                        strokeWidth={1.5}
                        name="Bid Price"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
          {loading ? (
            <div className="h-80 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
              <p className="text-xs">Loading tabular tick stream...</p>
            </div>
          ) : ticksData.length === 0 ? (
            <div className="h-80 flex flex-col items-center justify-center space-y-2 text-slate-400">
              <Table className="h-8 w-8 text-slate-600" />
              <p className="text-sm font-medium text-slate-300">Data Table is Empty</p>
              <p className="text-xs text-slate-500">
                Select your range and click "Confirm &amp; Start Process" above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs font-mono">
                <thead className="sticky top-0 bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">UTC Time (ms)</th>
                    <th className="py-2 px-3">Ask Price</th>
                    <th className="py-2 px-3">Bid Price</th>
                    <th className="py-2 px-3">Spread</th>
                    <th className="py-2 px-3">Ask Vol</th>
                    <th className="py-2 px-3">Bid Vol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {ticksData.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="py-1.5 px-3 text-slate-400">{t.time}</td>
                      <td className="py-1.5 px-3 text-cyan-400">{t.ask}</td>
                      <td className="py-1.5 px-3 text-emerald-400">{t.bid}</td>
                      <td className="py-1.5 px-3 text-slate-400">{t.spread}</td>
                      <td className="py-1.5 px-3">{t.askVolume.toLocaleString()}</td>
                      <td className="py-1.5 px-3">{t.bidVolume.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
