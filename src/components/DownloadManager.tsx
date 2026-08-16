import React, { useState } from 'react';
import { Play, Calendar, Zap, ShieldCheck, CheckCircle, AlertCircle, RefreshCw, Layers, ArrowRight } from 'lucide-react';
import { ActiveJob, SymbolInfo } from '../types';

interface DownloadManagerProps {
  symbols: SymbolInfo[];
  activeJobs: ActiveJob[];
  onStartDownload: (params: {
    symbol: string;
    startDate: string;
    endDate: string;
    maxConcurrency: number;
    filterMarketHours: boolean;
  }) => Promise<void>;
  onExploreSymbol: (symbol: string, startDate: string, endDate: string) => void;
  isDownloading: boolean;
}

export const DownloadManager: React.FC<DownloadManagerProps> = ({
  symbols,
  activeJobs,
  onStartDownload,
  onExploreSymbol,
  isDownloading,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState('EURUSD');
  const [startDate, setStartDate] = useState('2024-03-01T00:00');
  const [endDate, setEndDate] = useState('2024-03-05T00:00');
  const [concurrency, setConcurrency] = useState(24);
  const [filterMarketHours, setFilterMarketHours] = useState(true);

  const selectedSymbolObj = symbols.find((s) => s.symbol === selectedSymbol);

  const applyPreset = (hours: number) => {
    const end = new Date('2024-03-05T00:00:00Z');
    const start = new Date(end.getTime() - hours * 3600 * 1000);
    setStartDate(start.toISOString().slice(0, 16));
    setEndDate(end.toISOString().slice(0, 16));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartDownload({
      symbol: selectedSymbol,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      maxConcurrency: concurrency,
      filterMarketHours,
    });
  };

  const latestJob = activeJobs[activeJobs.length - 1];

  return (
    <div className="space-y-6">
      {/* Top Banner / Feature Callout */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/30 p-6 border border-emerald-500/20">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                HTTP/2 Multi-Stream
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                Weekend 404 Eliminator
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Concurrent Range Downloader</h2>
            <p className="text-sm text-slate-300 max-w-2xl">
              Streams compressed <code className="text-emerald-400 font-mono">.bi5</code> binary tick chunks directly from Dukascopy. Automatic calendar filtering skips market-closed periods, avoiding hundreds of banned 404 requests.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs bg-slate-950/80 px-4 py-3 rounded-xl border border-slate-800">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-semibold text-white block">Zero-Ban Guarantee</span>
              <span className="text-slate-400">Token Bucket throttles bursts smoothly</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Config Form & Live Job Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Controls (5 cols) */}
        <div className="lg:col-span-5 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-5">
          <h3 className="font-semibold text-white flex items-center gap-2 text-sm border-b border-slate-800 pb-3">
            <Zap className="h-4 w-4 text-emerald-400" />
            Download Configuration
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Symbol Picker */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Asset / Symbol</label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
              >
                {symbols.map((sym) => (
                  <option key={sym.symbol} value={sym.symbol}>
                    {sym.symbol} - {sym.name} ({sym.category})
                  </option>
                ))}
              </select>
              {selectedSymbolObj && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 px-1">
                  <span>Pipet: {selectedSymbolObj.pipetScale}</span>
                  <span>{selectedSymbolObj.active24_7 ? '24/7 Crypto' : 'Market Schedule Active'}</span>
                </div>
              )}
            </div>

            {/* Date Range */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Date Range (UTC)
                </label>
                {/* Presets */}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => applyPreset(24)}
                    className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50 hover:bg-emerald-900 transition font-medium"
                  >
                    24h (Turbo)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(72)}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(24 * 7)}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(24 * 30)}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    30 Days
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">Start</span>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">End</span>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Concurrency Slider */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Turbo Worker Concurrency</span>
                <span className="font-mono text-emerald-400 font-semibold">{concurrency} workers</span>
              </div>
              <input
                type="range"
                min="1"
                max="48"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block">Pipelined parallel connections with token-bucket AIMD rate control</span>
            </div>

            {/* Smart Market Filter Toggle */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800/80">
              <input
                type="checkbox"
                id="marketFilter"
                checked={filterMarketHours}
                onChange={(e) => setFilterMarketHours(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500 accent-emerald-500"
              />
              <label htmlFor="marketFilter" className="text-xs text-slate-300 cursor-pointer">
                <span className="font-semibold text-white block">Enable Market Calendar Filter</span>
                Automatically bypasses weekend closures (Friday 22:00 to Sunday 21:00 UTC) with zero 404 errors sent to Dukascopy.
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isDownloading}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Downloading Chunks...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Start High-Speed Download
                </>
              )}
            </button>
          </form>
        </div>

        {/* Live Job Telemetry & Terminal Logs (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {latestJob ? (
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      latestJob.status === 'running'
                        ? 'bg-emerald-400 animate-ping'
                        : latestJob.status === 'completed'
                        ? 'bg-emerald-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  <h3 className="font-semibold text-white text-sm">
                    Job: {latestJob.symbol} ({latestJob.status.toUpperCase()})
                  </h3>
                </div>
                {latestJob.status === 'completed' && (
                  <button
                    onClick={() => onExploreSymbol(latestJob.symbol, latestJob.start, latestJob.end)}
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 transition"
                  >
                    Explore Ticks <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">
                    Processed {latestJob.completedChunks} / {latestJob.totalChunks} chunks
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {Math.round((latestJob.completedChunks / Math.max(1, latestJob.totalChunks)) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300 rounded-full"
                    style={{
                      width: `${(latestJob.completedChunks / Math.max(1, latestJob.totalChunks)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Key Metrics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Valid Tick Chunks</span>
                  <span className="font-mono text-sm font-bold text-white">{latestJob.validDataChunks}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Weekend 404s Saved</span>
                  <span className="font-mono text-sm font-bold text-emerald-400">
                    {latestJob.bypassedClosedHours}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Download Speed</span>
                  <span className="font-mono text-sm font-bold text-cyan-400">
                    {latestJob.currentSpeed} <span className="text-[10px]">chunks/s</span>
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Downloaded Size</span>
                  <span className="font-mono text-sm font-bold text-slate-200">
                    {(latestJob.totalBytes / 1024).toFixed(1)} <span className="text-[10px]">KB</span>
                  </span>
                </div>
              </div>

              {/* Terminal Logs */}
              <div>
                <span className="text-[11px] text-slate-400 font-medium block mb-1.5">Execution Log</span>
                <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 font-mono text-[11px] text-slate-300 h-44 overflow-y-auto space-y-1">
                  {latestJob.logs.map((log, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="text-emerald-500 select-none">›</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[300px] rounded-xl bg-slate-900 border border-slate-800 p-8 flex flex-col items-center justify-center text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                <Layers className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-white">No Active Download Job</h4>
              <p className="text-xs text-slate-400 max-w-sm">
                Configure your symbol and date range on the left and click "Start High-Speed Download" to download real tick data.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
