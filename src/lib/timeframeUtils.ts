import { BaseMicroCandle, Candlestick, TimeframeConfig } from '../types';

export const STANDARD_TIMEFRAMES: TimeframeConfig[] = [
  { id: '1s', label: '1s', seconds: 1, category: 'seconds' },
  { id: '5s', label: '5s', seconds: 5, category: 'seconds' },
  { id: '15s', label: '15s', seconds: 15, category: 'seconds' },
  { id: '30s', label: '30s', seconds: 30, category: 'seconds' },
  { id: '1m', label: '1m', seconds: 60, category: 'minutes' },
  { id: '3m', label: '3m', seconds: 180, category: 'minutes' },
  { id: '5m', label: '5m', seconds: 300, category: 'minutes' },
  { id: '15m', label: '15m', seconds: 900, category: 'minutes' },
  { id: '30m', label: '30m', seconds: 1800, category: 'minutes' },
  { id: '1h', label: '1h', seconds: 3600, category: 'hours' },
  { id: '4h', label: '4h', seconds: 14400, category: 'hours' },
  { id: '1D', label: '1D', seconds: 86400, category: 'days' },
  { id: '1W', label: '1W', seconds: 604800, category: 'days' },
  { id: '1M', label: '1M', seconds: 2592000, category: 'days' },
];

/**
 * Parses a custom timeframe expression like "45s", "3m", "2h", "5D", "2W", "1M" or numerical value
 */
export function parseCustomTimeframe(input: string | number): TimeframeConfig {
  if (typeof input === 'number') {
    const sec = Math.max(1, Math.round(input));
    return formatTimeframeConfig(sec);
  }

  const str = input.trim();
  const match = str.match(/^(\d+)\s*([smhdwM]?)$/i);
  if (!match) {
    return { id: '60s', label: '1m', seconds: 60, category: 'minutes' };
  }

  const value = parseInt(match[1], 10);
  const rawUnit = match[2] || 'm';
  const unit = rawUnit.toLowerCase();

  let seconds = 60;
  let category: TimeframeConfig['category'] = 'minutes';

  if (rawUnit === 'M') {
    seconds = value * 2592000;
    category = 'days';
  } else {
    switch (unit) {
      case 's':
        seconds = value;
        category = 'seconds';
        break;
      case 'm':
        seconds = value * 60;
        category = 'minutes';
        break;
      case 'h':
        seconds = value * 3600;
        category = 'hours';
        break;
      case 'd':
        seconds = value * 86400;
        category = 'days';
        break;
      case 'w':
        seconds = value * 604800;
        category = 'days';
        break;
      default:
        seconds = value * 60;
    }
  }

  return {
    id: `${value}${rawUnit}`,
    label: `${value}${rawUnit}`,
    seconds: Math.max(1, seconds),
    category: 'custom',
  };
}

export function formatTimeframeConfig(seconds: number): TimeframeConfig {
  if (seconds < 60) {
    return { id: `${seconds}s`, label: `${seconds}s`, seconds, category: 'seconds' };
  }
  if (seconds < 3600 && seconds % 60 === 0) {
    const mins = seconds / 60;
    return { id: `${mins}m`, label: `${mins}m`, seconds, category: 'minutes' };
  }
  if (seconds < 86400 && seconds % 3600 === 0) {
    const hrs = seconds / 3600;
    return { id: `${hrs}h`, label: `${hrs}h`, seconds, category: 'hours' };
  }
  if (seconds === 86400) {
    return { id: '1D', label: '1D', seconds, category: 'days' };
  }
  if (seconds === 604800) {
    return { id: '1W', label: '1W', seconds, category: 'days' };
  }
  if (seconds === 2592000) {
    return { id: '1M', label: '1M', seconds, category: 'days' };
  }
  return { id: `${seconds}s`, label: `${seconds}s`, seconds, category: 'custom' };
}

/**
 * Ultra-fast O(N) Resampling Engine:
 * Converts base 1-second or 1-minute micro-candles into arbitrary target intervals (e.g. 5s, 3m, 4h, 1D).
 * Guarantees 100% strictly monotonic timestamps, valid OHLC boundaries, zero duplicate bars.
 */
export function resampleMicroCandles(
  baseCandles: BaseMicroCandle[],
  targetSeconds: number
): Candlestick[] {
  if (!baseCandles || baseCandles.length === 0) return [];
  const sec = Math.max(1, targetSeconds);

  // 1. Sort base candles chronologically to prevent any out-of-order anomalies
  // Most of the time it is already sorted; fast single-pass check
  let isSorted = true;
  for (let i = 1; i < baseCandles.length; i++) {
    if (baseCandles[i].t < baseCandles[i - 1].t) {
      isSorted = false;
      break;
    }
  }

  const sorted = isSorted ? baseCandles : [...baseCandles].sort((a, b) => a.t - b.t);

  const resampled: Candlestick[] = [];
  let currentBucketTime = -1;
  let o = 0;
  let h = -Infinity;
  let l = Infinity;
  let c = 0;
  let v = 0;
  let k = 0;
  let spreadSum = 0;

  for (let i = 0; i < sorted.length; i++) {
    const candle = sorted[i];
    if (!candle || isNaN(candle.t) || isNaN(candle.o) || isNaN(candle.c)) continue;

    const bucketTime = Math.floor(candle.t / sec) * sec;

    if (bucketTime !== currentBucketTime) {
      if (currentBucketTime !== -1 && h >= l && !isNaN(o) && !isNaN(c)) {
        resampled.push({
          time: currentBucketTime,
          timestamp: currentBucketTime * 1000,
          open: o,
          high: Math.max(h, o, c),
          low: Math.min(l, o, c),
          close: c,
          volume: Math.round(v * 100) / 100,
          ticks: k,
          spread: k > 0 ? Number((spreadSum / k).toFixed(6)) : 0,
        });
      }
      currentBucketTime = bucketTime;
      o = candle.o;
      h = Math.max(candle.h, candle.o, candle.c);
      l = Math.min(candle.l, candle.o, candle.c);
      c = candle.c;
      v = candle.v || 0;
      k = candle.k || 1;
      spreadSum = (candle.s || 0) * (candle.k || 1);
    } else {
      if (candle.h > h) h = candle.h;
      if (candle.l < l) l = candle.l;
      c = candle.c;
      v += candle.v || 0;
      k += candle.k || 1;
      spreadSum += (candle.s || 0) * (candle.k || 1);
    }
  }

  if (currentBucketTime !== -1 && h >= l && !isNaN(o) && !isNaN(c)) {
    resampled.push({
      time: currentBucketTime,
      timestamp: currentBucketTime * 1000,
      open: o,
      high: Math.max(h, o, c),
      low: Math.min(l, o, c),
      close: c,
      volume: Math.round(v * 100) / 100,
      ticks: k,
      spread: k > 0 ? Number((spreadSum / k).toFixed(6)) : 0,
    });
  }

  return resampled;
}
