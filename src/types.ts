export interface RateLimiterStats {
  currentRate: number;
  minRate: number;
  maxRate: number;
  availableTokens: number;
  capacity: number;
  totalRequests: number;
  rateLimitedCount: number;
  consecutiveSuccess: number;
  circuitBreakerTripped: boolean;
  cooldownRemainingSec: number;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  category: string;
  pipetScale: number;
  active24_7: boolean;
}

export interface DecodedTick {
  time: string;
  timestampMs: number;
  ask: number;
  bid: number;
  spread: number;
  askVolume: number;
  bidVolume: number;
}

export interface Candlestick {
  time: string | number; // ISO string or unix timestamp in seconds
  timestamp: number; // Unix timestamp in milliseconds or seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ticks: number;
  spread?: number;
}

export interface BaseMicroCandle {
  t: number; // Unix timestamp in seconds
  o: number; // Open
  h: number; // High
  l: number; // Low
  c: number; // Close
  v: number; // Total Volume
  k: number; // Tick count
  s: number; // Average spread
}

export interface StreamHourChunk {
  hourTimestamp: string; // ISO string e.g. "2024-03-01T08:00:00.000Z"
  symbol: string;
  hasData: boolean;
  totalTicks: number;
  candles1s?: BaseMicroCandle[];
  candles1m?: BaseMicroCandle[];
  downloadMs: number;
  decodeMs: number;
  rawBytes: number;
  isCached: boolean;
}

export interface TimeframeConfig {
  id: string;
  label: string;
  seconds: number;
  category: 'seconds' | 'minutes' | 'hours' | 'days' | 'custom';
}

export interface ViewportWindow {
  fromSec: number;
  toSec: number;
  fromDate: string;
  toDate: string;
}

export interface PipelineTelemetry {
  totalHours: number;
  loadedHours: number;
  streamingHours: number;
  cachedHours: number;
  emptyHours: number;
  totalTicksDecoded: number;
  downloadSpeedMBps: number;
  decodeSpeedTicksPerSec: number;
  currentActivity: string;
  status: 'idle' | 'streaming' | 'completed' | 'error';
}

export interface ActiveJob {
  id: string;
  symbol: string;
  start: string;
  end: string;
  totalChunks: number;
  completedChunks: number;
  validDataChunks: number;
  bypassedClosedHours: number;
  totalBytes: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
  currentSpeed: number;
  logs: string[];
}

export interface SymbolStorageRecord {
  symbol: string;
  totalHoursRequested: number;
  validChunksDownloaded: number;
  emptyHours: number;
  weekendHoursBypassed: number;
  totalBytes: number;
  lastUpdated: string;
  chunks: Record<string, { hasData: boolean; size: number; downloadedAt: string }>;
}

export interface StorageMetadata {
  symbols: Record<string, SymbolStorageRecord>;
  directory: string;
}

export interface BenchmarkResult {
  symbol: string;
  testRangeHours: number;
  standardScraper: {
    totalRequestsSent: number;
    wasted404Requests: number;
    rateLimitExceededRisk: string;
    connectionModel: string;
    estimatedDownloadTimeSec: number;
    decodingSpeedTicksPerSec: string;
    databaseParamLimit: string;
  };
  tickVault2: {
    totalRequestsSent: number;
    wasted404Requests: number;
    rateLimitExceededRisk: string;
    connectionModel: string;
    estimatedDownloadTimeSec: number;
    decodingSpeedTicksPerSec: string;
    databaseParamLimit: string;
    bandwidthSavedPercent: number;
  };
  summary: {
    requestsSaved: number;
    speedupFactor: number;
    decodingSpeedup: string;
  };
}
