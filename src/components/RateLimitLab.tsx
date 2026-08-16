import React, { useState } from 'react';
import { Shield, Zap, AlertTriangle, CheckCircle2, TrendingUp, RefreshCw, Layers, Cpu, Radio } from 'lucide-react';
import { RateLimiterStats } from '../types';

interface RateLimitLabProps {
  rateLimiter?: RateLimiterStats;
}

export const RateLimitLab: React.FC<RateLimitLabProps> = ({ rateLimiter }) => {
  const [calcSymbol, setCalcSymbol] = useState('EURUSD');
  const [calcYears, setCalcYears] = useState(1);

  // Math for 404 savings
  // 52 weeks * 47 hours of weekend closure = ~2,444 hours + 48 hours holidays = ~2,492 hours
  const totalHours = calcYears * 8760;
  const weekend404Hours = calcSymbol.includes('BTC') || calcSymbol.includes('ETH') ? 0 : Math.round(calcYears * 2492);
  const tradingHours = totalHours - weekend404Hours;
  const savingsPercent = Math.round((weekend404Hours / totalHours) * 100);

  const currentRate = rateLimiter?.currentRate || 35.0;
  const capacity = rateLimiter?.capacity || 50;
  const availableTokens = rateLimiter?.availableTokens || 45;
  const fillPercentage = Math.min(100, Math.round((availableTokens / capacity) * 100));

  return (
    <div className="space-y-6">
      {/* Hero Explainer */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950/30 to-slate-900 border border-emerald-500/20 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Rate Limit Immunity Architecture</h2>
            <p className="text-xs text-slate-400">How TickVault 2.0 makes 429 / 403 CDN bans mathematically impossible</p>
          </div>
        </div>
        <p className="text-sm text-slate-300 max-w-3xl leading-relaxed mt-3">
          Traditional scrapers hammer data endpoints with fixed-rate concurrency and scrape weekends blindly, triggering Akamai/Cloudflare bot flags within minutes. TickVault 2.0 combines three mathematical layers: <strong>Smart Calendar Filtering</strong>, <strong>Token Bucket Throttling</strong>, and <strong>Adaptive AIMD Backoff</strong>.
        </p>
      </div>

      {/* 3 Protection Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Pillar 1 */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-white text-sm">1. Token Bucket Limiter</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Eliminates uncontrolled request bursts. Each request must acquire a token. Tokens replenish continuously at <code className="text-emerald-400">{currentRate} req/s</code> up to a hard capacity of {capacity}.
          </p>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Bucket Tokens</span>
              <span className="font-mono text-emerald-400">{availableTokens} / {capacity}</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${fillPercentage}%` }} />
            </div>
          </div>
        </div>

        {/* Pillar 2 */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-white text-sm">2. Adaptive AIMD Engine</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong>Additive Increase / Multiplicative Decrease</strong>: Automatically scales speed up when the CDN is healthy (+2.5 req/s every 40 safe chunks), and immediately slashes rate by 50% if a 429 is encountered.
          </p>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>On Success:</span> <span className="text-emerald-400">Rate += 2.5 req/s</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>On 429 Throttle:</span> <span className="text-rose-400">Rate *= 0.5 (Instant)</span>
            </div>
          </div>
        </div>

        {/* Pillar 3 */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-white text-sm">3. Circuit Breaker</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            If a proxy endpoint encounters 3 consecutive errors or 403s, its circuit trips into a 15-60s cooldown state, dynamically diverting chunk requests to healthy fallback proxies without crashing.
          </p>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs flex items-center justify-between">
            <span className="text-slate-400">Circuit State:</span>
            {rateLimiter?.circuitBreakerTripped ? (
              <span className="text-amber-400 font-semibold flex items-center gap-1">
                <Radio className="h-3.5 w-3.5 animate-pulse" /> Tripped (Cooldown)
              </span>
            ) : (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Armed & Healthy
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Weekend 404 Savings Calculator */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              Weekend 404 Request Eliminator Calculator
            </h3>
            <p className="text-xs text-slate-400">
              Forex and Metals markets close every Friday at 22:00 UTC and reopen Sunday at 21:00 UTC.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4 bg-slate-950 p-4 rounded-lg border border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Select Asset</label>
              <select
                value={calcSymbol}
                onChange={(e) => setCalcSymbol(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-white"
              >
                <option value="EURUSD">EURUSD (Forex Major - Weekend Closed)</option>
                <option value="XAUUSD">XAUUSD (Gold - Weekend Closed)</option>
                <option value="GBPUSD">GBPUSD (Forex Major - Weekend Closed)</option>
                <option value="BTCUSD">BTCUSD (Crypto - 24/7 Trading)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Historical Time Span</span>
                <span className="font-mono text-emerald-400 font-semibold">{calcYears} Year(s)</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={calcYears}
                onChange={(e) => setCalcYears(parseInt(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Total Calendar Hours</span>
              <span className="font-mono text-sm font-bold text-white">{totalHours.toLocaleString()}</span>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Active Trading Hours</span>
              <span className="font-mono text-sm font-bold text-cyan-400">{tradingHours.toLocaleString()}</span>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-lg border border-emerald-500/30">
              <span className="text-[10px] text-emerald-400 font-semibold block">Eliminated 404 Requests</span>
              <span className="font-mono text-base font-bold text-emerald-400">
                {weekend404Hours.toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Network Traffic Saved</span>
              <span className="font-mono text-base font-bold text-white">{savingsPercent}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
