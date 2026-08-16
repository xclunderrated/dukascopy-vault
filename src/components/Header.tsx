import React from 'react';
import { Shield, Zap, Activity, HardDrive, Terminal, Layers, BarChart2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { RateLimiterStats } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  rateLimiter?: RateLimiterStats;
  totalChunks: number;
  totalBytes: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  rateLimiter,
  totalChunks,
  totalBytes,
}) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const navItems = [
    { id: 'download', label: 'Downloader', icon: Zap },
    { id: 'explorer', label: 'Tick Explorer', icon: BarChart2 },
    { id: 'ratelimit', label: 'Rate Limit Shield', icon: Shield },
    { id: 'benchmark', label: 'Speed Benchmark', icon: Activity },
    { id: 'storage', label: 'Metadata & Gaps', icon: HardDrive },
    { id: 'python', label: 'Python Engine', icon: Terminal },
  ];

  const currentRate = rateLimiter?.currentRate || 35;
  const maxRate = rateLimiter?.maxRate || 75;
  const ratePercentage = Math.min(100, Math.round((currentRate / maxRate) * 100));

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-50 text-slate-100">
      {/* Top Banner with Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/20">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-white tracking-tight">TickVault 2.0</h1>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Rate-Limit Immune
              </span>
            </div>
            <p className="text-xs text-slate-400">High-Performance Dukascopy Feed Engine</p>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center gap-4 text-xs">
          {/* Rate Limiter AIMD Token Bucket Gauge */}
          <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-medium">AIMD Token Bucket</span>
              <span className="font-mono font-semibold text-emerald-400">
                {currentRate.toFixed(1)} <span className="text-slate-500 font-normal">req/s</span>
              </span>
            </div>
            <div className="w-16 bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${ratePercentage}%` }}
              />
            </div>
          </div>

          {/* Circuit Breaker Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
            {rateLimiter?.circuitBreakerTripped ? (
              <>
                <AlertTriangle className="h-4 w-4 text-amber-400 animate-pulse" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Circuit Breaker</span>
                  <span className="text-amber-400 font-semibold font-mono">
                    Cooldown {rateLimiter.cooldownRemainingSec}s
                  </span>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <div>
                  <span className="text-[10px] text-slate-400 block">IP Shield</span>
                  <span className="text-emerald-400 font-semibold">100% Safe (0 Bans)</span>
                </div>
              </>
            )}
          </div>

          {/* Stored Volume */}
          <div className="hidden md:flex flex-col px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
            <span className="text-[10px] text-slate-400">Cached Data</span>
            <span className="font-mono text-slate-200">
              {totalChunks} <span className="text-slate-500">chunks</span> ({formatBytes(totalBytes)})
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <nav className="flex space-x-1 overflow-x-auto no-scrollbar border-t border-slate-800/80 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                  isActive
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
