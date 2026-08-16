import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CandlestickData,
  HistogramData,
  ColorType,
  CrosshairMode,
  Time,
  LineData,
} from 'lightweight-charts';
import {
  Maximize2,
  Minimize2,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  ChevronDown,
  Play,
  Pause,
  Square,
  Sparkles,
  Scissors,
  SkipBack,
  SkipForward,
  Rewind,
  ArrowRight,
  ArrowLeft,
  DollarSign,
} from 'lucide-react';
import {
  STANDARD_TIMEFRAMES,
  parseCustomTimeframe,
  resampleMicroCandles,
  formatTimeframeConfig,
} from '../lib/timeframeUtils';
import {
  BaseMicroCandle,
  StreamHourChunk,
  PipelineTelemetry,
  TimeframeConfig,
  Candlestick,
} from '../types';
import {
  saveHourChunkToCache,
  saveHourChunksBatchToCache,
  getCachedHoursForRange,
} from '../lib/chartStorage';

// Available Replay Speeds (speed factor -> interval ms or batch count)
export interface ReplaySpeedOption {
  id: string;
  label: string;
  intervalMs: number; // in milliseconds per step
  barsPerStep: number; // number of bars to advance per step
}

export const REPLAY_SPEEDS: ReplaySpeedOption[] = [
  { id: '0.1x', label: '0.1x (Slow)', intervalMs: 2000, barsPerStep: 1 },
  { id: '0.5x', label: '0.5x', intervalMs: 1000, barsPerStep: 1 },
  { id: '1x', label: '1x (1 bar/s)', intervalMs: 500, barsPerStep: 1 },
  { id: '2x', label: '2x', intervalMs: 250, barsPerStep: 1 },
  { id: '5x', label: '5x', intervalMs: 100, barsPerStep: 1 },
  { id: '10x', label: '10x (20b/s)', intervalMs: 50, barsPerStep: 1 },
  { id: '25x', label: '25x (50b/s)', intervalMs: 20, barsPerStep: 1 },
  { id: '50x', label: '50x Fast', intervalMs: 12, barsPerStep: 1 },
  { id: '100x', label: '100x Turbo', intervalMs: 16, barsPerStep: 3 },
  { id: '500x', label: '500x Hyper', intervalMs: 16, barsPerStep: 15 },
  { id: 'MAX', label: 'MAX (Ultra)', intervalMs: 16, barsPerStep: 40 },
];

export interface ReplayTrade {
  id: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  entryTime: number;
  entryBar: number;
  exitPrice?: number;
  exitTime?: number;
  exitBar?: number;
  pnlPips: number;
  status: 'OPEN' | 'CLOSED';
}

interface PrecomputedSeriesData {
  candles: CandlestickData<Time>[];
  volumes: HistogramData<Time>[];
  sma: (LineData<Time> | null)[];
  ema: (LineData<Time> | null)[];
  rawCandles: Candlestick[];
}

interface TradingViewChartProps {
  symbol: string;
  startDate: string;
  endDate: string;
  runToken: number; // Increment this token to trigger a confirmed run
  onStartRequest?: () => void;
  onStopRequest?: () => void;
  initialTimeframe?: number; // in seconds
  onTimeframeChange?: (tf: TimeframeConfig) => void;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  startDate,
  endDate,
  runToken,
  onStartRequest,
  onStopRequest,
  initialTimeframe = 60,
  onTimeframeChange,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | any>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | any>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | any>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | any>(null);

  // Timeframe state
  const [selectedTf, setSelectedTf] = useState<TimeframeConfig>(() =>
    formatTimeframeConfig(initialTimeframe)
  );
  const [customInput, setCustomInput] = useState('');
  const [customUnit, setCustomUnit] = useState<'s' | 'm' | 'h' | 'd' | 'w' | 'M'>('m');
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Indicators toggle
  const [showVolume, setShowVolume] = useState(true);
  const [showSMA, setShowSMA] = useState(false);
  const [showEMA, setShowEMA] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Hover crosshair data
  const [hoverData, setHoverData] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    spread?: number;
    change: number;
    changePercent: number;
  } | null>(null);

  // Memory store for base 1-second and 1-minute micro-candles
  // Key: ISO hour string, Value: array of micro-candles
  const baseStoreRef = useRef<Map<string, { s1: BaseMicroCandle[]; m1: BaseMicroCandle[]; hasData: boolean }>>(
    new Map()
  );

  // Precomputed chart data ref for sub-millisecond replay execution
  const precomputedRef = useRef<PrecomputedSeriesData>({
    candles: [],
    volumes: [],
    sma: [],
    ema: [],
    rawCandles: [],
  });

  const [totalCandlesCount, setTotalCandlesCount] = useState<number>(0);

  // Hourly index status for visual timeline
  const [hourStatuses, setHourStatuses] = useState<Map<string, string>>(new Map());

  // Visible viewport bounds in UTC seconds
  const [visibleRange, setVisibleRange] = useState<{ from: number; to: number } | null>(null);

  // Has at least one confirmed stream executed
  const [hasStarted, setHasStarted] = useState(false);

  // ==========================================
  // FXREPLAY / BAR REPLAY ENGINE STATE
  // ==========================================
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [cutIndex, setCutIndex] = useState<number>(0);
  const [selectedSpeed, setSelectedSpeed] = useState<ReplaySpeedOption>(REPLAY_SPEEDS[4]); // default 5x
  const [stepSize, setStepSize] = useState<number>(1);
  const [autoFollowBar, setAutoFollowBar] = useState(true);
  const [showSandbox, setShowSandbox] = useState(false);
  const [activeTrades, setActiveTrades] = useState<ReplayTrade[]>([]);

  // High-performance direct refs for zero-lag 60+ FPS replay loop
  const replayIndexRef = useRef<number>(0);
  const autoFollowBarRef = useRef<boolean>(true);
  autoFollowBarRef.current = autoFollowBar;

  const isReplayModeRef = useRef<boolean>(false);
  isReplayModeRef.current = isReplayMode;

  const isReplayingRef = useRef<boolean>(false);
  isReplayingRef.current = isReplaying;

  const selectedTfRef = useRef<TimeframeConfig>(selectedTf);
  selectedTfRef.current = selectedTf;

  // Telemetry
  const [telemetry, setTelemetry] = useState<PipelineTelemetry>({
    totalHours: 0,
    loadedHours: 0,
    streamingHours: 0,
    cachedHours: 0,
    emptyHours: 0,
    totalTicksDecoded: 0,
    downloadSpeedMBps: 0,
    decodeSpeedTicksPerSec: 0,
    currentActivity: 'Standby - Choose date range and press Confirm to start streaming',
    status: 'idle',
  });

  const telemetryRef = useRef<PipelineTelemetry>(telemetry);
  telemetryRef.current = telemetry;

  const abortControllerRef = useRef<AbortController | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const replayIntervalRef = useRef<any>(null);

  // Zero-allocation streaming buffer and batch synchronization refs
  const incomingChunkBufferRef = useRef<StreamHourChunk[]>([]);
  const hourStatusesMapRef = useRef<Map<string, string>>(new Map());
  const totalBytesStreamedRef = useRef<number>(0);
  const ticksStreamedRef = useRef<number>(0);
  const loadedHoursCountRef = useRef<number>(0);
  const cachedHoursCountRef = useRef<number>(0);
  const emptyHoursCountRef = useRef<number>(0);
  const telemetryTotalHoursRef = useRef<number>(0);
  const streamStartRef = useRef<number>(0);
  const isStreamingRef = useRef<boolean>(false);
  const batchFlushTimerRef = useRef<any>(null);
  const lastBatchFlushTimeRef = useRef<number>(0);

  // Calculate requested hourly keys
  const requestedHours = useMemo(() => {
    const hours: string[] = [];
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return [];
    s.setUTCMinutes(0, 0, 0);
    e.setUTCMinutes(0, 0, 0);

    const cur = new Date(s);
    while (cur < e) {
      hours.push(cur.toISOString());
      cur.setUTCHours(cur.getUTCHours() + 1);
    }
    return hours;
  }, [startDate, endDate]);

  // Direct zero-copy chronological resampler
  // Iterates directly across hourly chunks in requested order
  // O(N) single-pass without array flattening, sorting, or intermediate allocations
  const resampleFromBaseStore = useCallback(
    (
      baseStore: Map<string, { s1: BaseMicroCandle[]; m1: BaseMicroCandle[]; hasData: boolean }>,
      orderedHours: string[],
      tfSec: number
    ): Candlestick[] => {
      if (orderedHours.length === 0 || baseStore.size === 0) return [];
      const sec = Math.max(1, tfSec);
      const use1s = sec < 60;

      const resampled: Candlestick[] = [];
      let currentBucketTime = -1;
      let o = 0;
      let h = -Infinity;
      let l = Infinity;
      let c = 0;
      let v = 0;
      let k = 0;
      let spreadSum = 0;

      for (let hIdx = 0; hIdx < orderedHours.length; hIdx++) {
        const hourKey = orderedHours[hIdx];
        const data = baseStore.get(hourKey);
        if (!data || !data.hasData) continue;

        const candles = use1s && data.s1 && data.s1.length > 0 ? data.s1 : data.m1;
        if (!candles || candles.length === 0) continue;

        for (let i = 0; i < candles.length; i++) {
          const candle = candles[i];
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
    },
    []
  );

  // Apply a slice of precomputed data to Lightweight Charts
  const applySliceToChart = useCallback((targetIdx: number) => {
    const p = precomputedRef.current;
    if (!p || p.candles.length === 0 || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    const clamped = Math.max(0, Math.min(targetIdx, p.candles.length - 1));
    replayIndexRef.current = clamped;

    const candleSlice = p.candles.slice(0, clamped + 1);
    const volumeSlice = p.volumes.slice(0, clamped + 1);

    candleSeriesRef.current.setData(candleSlice);
    volumeSeriesRef.current.setData(volumeSlice);

    if (smaSeriesRef.current) {
      const smaSlice = p.sma.slice(0, clamped + 1).filter(Boolean) as LineData<Time>[];
      smaSeriesRef.current.setData(smaSlice);
    }

    if (emaSeriesRef.current) {
      const emaSlice = p.ema.slice(0, clamped + 1).filter(Boolean) as LineData<Time>[];
      emaSeriesRef.current.setData(emaSlice);
    }

    if (autoFollowBarRef.current && chartRef.current && candleSlice.length > 0) {
      chartRef.current.timeScale().scrollToPosition(2, false);
    }
  }, []);

  // Incremental step forward for silky-smooth 60+ FPS high-speed playback
  const stepForwardBars = useCallback((numBars: number) => {
    const p = precomputedRef.current;
    if (!p || p.candles.length === 0 || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    const cur = replayIndexRef.current;
    const maxIdx = p.candles.length - 1;
    if (cur >= maxIdx) {
      // If still streaming in the background, stay in replay mode and wait for next chunks
      if (telemetryRef.current.status !== 'streaming') {
        setIsReplaying(false);
      }
      return;
    }

    const next = Math.min(cur + numBars, maxIdx);

    if (numBars <= 25) {
      // Incremental O(1) WebGL updates
      for (let i = cur + 1; i <= next; i++) {
        candleSeriesRef.current.update(p.candles[i]);
        volumeSeriesRef.current.update(p.volumes[i]);
        if (p.sma[i] && smaSeriesRef.current) {
          smaSeriesRef.current.update(p.sma[i]!);
        }
        if (p.ema[i] && emaSeriesRef.current) {
          emaSeriesRef.current.update(p.ema[i]!);
        }
      }
    } else {
      // Direct slice for ultra-high batch speeds
      applySliceToChart(next);
    }

    replayIndexRef.current = next;

    if (autoFollowBarRef.current && chartRef.current) {
      chartRef.current.timeScale().scrollToPosition(2, false);
    }
  }, [applySliceToChart]);

  // Step backward by N bars
  const stepBackwardBars = useCallback((numBars: number) => {
    const p = precomputedRef.current;
    if (!p || p.candles.length === 0) return;

    const cur = replayIndexRef.current;
    const next = Math.max(0, cur - numBars);
    applySliceToChart(next);
    setReplayIndex(next);
  }, [applySliceToChart]);

  // Update & precompute chart series data given current timeframe
  const refreshChartData = useCallback(() => {
    const tf = selectedTfRef.current;
    const tfSec = tf.seconds;

    const t0 = performance.now();
    const resampled = resampleFromBaseStore(baseStoreRef.current, requestedHours, tfSec);
    const resampleDurationMs = performance.now() - t0;

    const count = resampled.length;
    if (count === 0) {
      precomputedRef.current = {
        candles: [],
        volumes: [],
        sma: [],
        ema: [],
        rawCandles: [],
      };
      setTotalCandlesCount(0);
      candleSeriesRef.current?.setData([]);
      volumeSeriesRef.current?.setData([]);
      smaSeriesRef.current?.setData([]);
      emaSeriesRef.current?.setData([]);
      return;
    }

    const precomputedCandles: CandlestickData<Time>[] = new Array(count);
    const precomputedVolumes: HistogramData<Time>[] = new Array(count);
    const precomputedSMA: (LineData<Time> | null)[] = new Array(count);
    const precomputedEMA: (LineData<Time> | null)[] = new Array(count);

    const smaPeriod = 20;
    const emaPeriod = 50;
    const emaMultiplier = 2 / (emaPeriod + 1);
    let emaPrev = 0;
    let smaWindowSum = 0;

    for (let i = 0; i < count; i++) {
      const c = resampled[i];
      const timeVal = (c.time as number) as Time;
      const isUp = c.close >= c.open;

      precomputedCandles[i] = {
        time: timeVal,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };

      precomputedVolumes[i] = {
        time: timeVal,
        value: c.volume,
        color: isUp ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)',
      };

      // O(1) Sliding Window SMA 20
      smaWindowSum += c.close;
      if (i >= smaPeriod) {
        smaWindowSum -= resampled[i - smaPeriod].close;
      }
      if (i >= smaPeriod - 1) {
        precomputedSMA[i] = { time: timeVal, value: Number((smaWindowSum / smaPeriod).toFixed(5)) };
      } else {
        precomputedSMA[i] = null;
      }

      // EMA 50
      if (i === 0) {
        emaPrev = c.close;
      } else {
        emaPrev = (c.close - emaPrev) * emaMultiplier + emaPrev;
      }
      precomputedEMA[i] = { time: timeVal, value: Number(emaPrev.toFixed(5)) };
    }

    precomputedRef.current = {
      candles: precomputedCandles,
      volumes: precomputedVolumes,
      sma: precomputedSMA,
      ema: precomputedEMA,
      rawCandles: resampled,
    };

    setTotalCandlesCount(count);

    if (isReplayModeRef.current) {
      // In Replay Mode: keep current replay slice smoothly without interrupting active play
      const targetIdx = Math.min(replayIndexRef.current, Math.max(0, count - 1));
      if (!isReplayingRef.current) {
        applySliceToChart(targetIdx);
      }
    } else {
      // Normal Mode: apply all newly loaded candles instantly
      candleSeriesRef.current?.setData(precomputedCandles);
      volumeSeriesRef.current?.setData(precomputedVolumes);
      if (smaSeriesRef.current) {
        smaSeriesRef.current.setData(precomputedSMA.filter(Boolean) as LineData<Time>[]);
      }
      if (emaSeriesRef.current) {
        emaSeriesRef.current.setData(precomputedEMA.filter(Boolean) as LineData<Time>[]);
      }
      if (autoFollowBarRef.current && chartRef.current && precomputedCandles.length > 0) {
        chartRef.current.timeScale().scrollToPosition(2, false);
      }
    }

    setTelemetry((prev) => ({
      ...prev,
      decodeSpeedTicksPerSec: Math.round(
        (resampled.length / Math.max(0.001, resampleDurationMs)) * 1000
      ),
    }));
  }, [requestedHours, resampleFromBaseStore, applySliceToChart]);

  // High-efficiency throttled batch flush for incoming streaming SSE chunks
  const performBatchFlush = useCallback(
    (forceImmediate = false) => {
      lastBatchFlushTimeRef.current = performance.now();
      if (batchFlushTimerRef.current) {
        clearTimeout(batchFlushTimerRef.current);
        batchFlushTimerRef.current = null;
      }

      // 1. Drain incoming chunks queue for batch IndexedDB write
      const batch = incomingChunkBufferRef.current;
      incomingChunkBufferRef.current = [];
      if (batch.length > 0) {
        saveHourChunksBatchToCache(batch);
      }

      // 2. Single atomic React state update for heatmap timeline
      setHourStatuses(new Map(hourStatusesMapRef.current));

      // 3. Fast UI telemetry update
      const elapsedSec = (performance.now() - streamStartRef.current) / 1000;
      const speedMBps = Number(
        (totalBytesStreamedRef.current / (1024 * 1024) / Math.max(0.1, elapsedSec)).toFixed(2)
      );

      setTelemetry((prev) => ({
        ...prev,
        totalHours: telemetryTotalHoursRef.current || prev.totalHours,
        loadedHours: loadedHoursCountRef.current,
        cachedHours: cachedHoursCountRef.current,
        emptyHours: emptyHoursCountRef.current,
        totalTicksDecoded: ticksStreamedRef.current,
        downloadSpeedMBps: speedMBps,
        currentActivity: isStreamingRef.current
          ? `Decoding on the fly: ${loadedHoursCountRef.current}/${telemetryTotalHoursRef.current} hours ready (${ticksStreamedRef.current.toLocaleString()} ticks)`
          : prev.currentActivity,
        status: isStreamingRef.current ? 'streaming' : prev.status,
      }));

      // 4. Fast single-pass chart resample & indicators
      refreshChartData();
    },
    [refreshChartData]
  );

  const scheduleBatchFlush = useCallback(
    (forceImmediate = false) => {
      const now = performance.now();
      const timeSinceLast = now - lastBatchFlushTimeRef.current;

      if (forceImmediate || timeSinceLast >= 200) {
        performBatchFlush(forceImmediate);
      } else if (!batchFlushTimerRef.current) {
        batchFlushTimerRef.current = setTimeout(() => {
          batchFlushTimerRef.current = null;
          performBatchFlush(false);
        }, 200 - timeSinceLast);
      }
    },
    [performBatchFlush]
  );

  // Handle instant timeframe selection
  const handleSelectTimeframe = (tf: TimeframeConfig) => {
    setSelectedTf(tf);
    selectedTfRef.current = tf;
    onTimeframeChange?.(tf);
    setShowCustomModal(false);
    performBatchFlush(true);
  };

  const handleApplyCustomTimeframe = () => {
    const val = parseInt(customInput, 10);
    if (!isNaN(val) && val > 0) {
      const parsed = parseCustomTimeframe(`${val}${customUnit}`);
      handleSelectTimeframe(parsed);
    }
  };

  // Setup TradingView Lightweight Charts canvas
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.45)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.45)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#38bdf8',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0284c7',
        },
        horzLine: {
          color: '#38bdf8',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0284c7',
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.1,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: selectedTf.seconds < 60,
      },
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });
    candleSeriesRef.current = candleSeries;

    // Volume histogram series in bottom margin
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      color: '#38bdf8',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0.0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Moving average overlays
    const smaSeries = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      priceLineVisible: false,
      title: 'SMA 20',
    });
    smaSeriesRef.current = smaSeries;

    const emaSeries = chart.addSeries(LineSeries, {
      color: '#fbbf24',
      lineWidth: 2,
      priceLineVisible: false,
      title: 'EMA 50',
    });
    emaSeriesRef.current = emaSeries;

    // Crosshair tooltip subscriber
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || param.point === undefined) {
        setHoverData(null);
        return;
      }
      const candle = param.seriesData.get(candleSeries) as any;
      const vol = (param.seriesData.get(volumeSeries) as any)?.value || 0;
      if (candle) {
        const change = candle.close - candle.open;
        const changePercent = candle.open !== 0 ? (change / candle.open) * 100 : 0;
        setHoverData({
          time: new Date(Number(param.time) * 1000).toUTCString(),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: vol,
          change,
          changePercent,
        });
      }
    });

    // Viewport visible range listener
    chart.timeScale().subscribeVisibleTimeRangeChange((newRange) => {
      if (newRange && typeof newRange.from === 'number' && typeof newRange.to === 'number') {
        setVisibleRange({ from: newRange.from, to: newRange.to });
      }
    });

    // Resize observer for responsive layout
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0] && entries[0].contentRect) {
        const { width, height } = entries[0].contentRect;
        chart.applyOptions({ width, height: Math.max(380, height) });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update timeScale seconds visibility when timeframe changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().applyOptions({
        secondsVisible: selectedTf.seconds < 60,
      });
    }
    refreshChartData();
  }, [selectedTf, refreshChartData]);

  // Toggle Volume visibility
  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: showVolume });
    }
  }, [showVolume]);

  // Toggle SMA / EMA visibility
  useEffect(() => {
    if (smaSeriesRef.current) smaSeriesRef.current.applyOptions({ visible: showSMA });
    if (emaSeriesRef.current) emaSeriesRef.current.applyOptions({ visible: showEMA });
  }, [showSMA, showEMA]);

  const stopStreamingPipeline = useCallback(() => {
    isStreamingRef.current = false;
    if (batchFlushTimerRef.current) {
      clearTimeout(batchFlushTimerRef.current);
      batchFlushTimerRef.current = null;
    }
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setTelemetry((prev) => ({
      ...prev,
      status: 'idle',
      currentActivity: 'Stream paused / stopped',
    }));
  }, []);

  // Stream pipeline execution
  const startStreamingPipeline = useCallback(async () => {
    stopStreamingPipeline();
    setHasStarted(true);
    isStreamingRef.current = true;

    if (requestedHours.length === 0) return;

    incomingChunkBufferRef.current = [];
    totalBytesStreamedRef.current = 0;
    ticksStreamedRef.current = 0;
    loadedHoursCountRef.current = 0;
    cachedHoursCountRef.current = 0;
    emptyHoursCountRef.current = 0;
    telemetryTotalHoursRef.current = requestedHours.length;
    streamStartRef.current = performance.now();

    setTelemetry({
      totalHours: requestedHours.length,
      loadedHours: 0,
      streamingHours: requestedHours.length,
      cachedHours: 0,
      emptyHours: 0,
      totalTicksDecoded: 0,
      downloadSpeedMBps: 0,
      decodeSpeedTicksPerSec: 0,
      currentActivity: 'Checking local cache...',
      status: 'streaming',
    });

    const cachedMap = await getCachedHoursForRange(symbol, requestedHours);
    let cachedCount = 0;

    const initialStatuses = new Map<string, string>();
    for (const h of requestedHours) {
      if (cachedMap.has(h)) {
        const item = cachedMap.get(h)!;
        baseStoreRef.current.set(h, {
          s1: item.candles1s,
          m1: item.candles1m,
          hasData: item.hasData,
        });
        initialStatuses.set(h, item.hasData ? 'cached' : 'empty');
        cachedCount++;
      } else {
        initialStatuses.set(h, 'pending');
      }
    }

    hourStatusesMapRef.current = new Map(initialStatuses);
    setHourStatuses(initialStatuses);
    cachedHoursCountRef.current = cachedCount;
    loadedHoursCountRef.current = cachedCount;

    if (cachedCount > 0) {
      refreshChartData();
    }

    const missingHours = requestedHours.filter((h) => !cachedMap.has(h));

    if (missingHours.length === 0) {
      isStreamingRef.current = false;
      setTelemetry((prev) => ({
        ...prev,
        loadedHours: requestedHours.length,
        cachedHours: cachedCount,
        currentActivity: `All ${requestedHours.length} hours ready instantly from local cache`,
        status: 'completed',
      }));
      chartRef.current?.timeScale().fitContent();
      return;
    }

    const priorityStart = visibleRange
      ? new Date(visibleRange.from * 1000).toISOString()
      : startDate;
    const priorityEnd = visibleRange
      ? new Date(visibleRange.to * 1000).toISOString()
      : endDate;

    const streamUrl = `/api/chart/stream?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}&priorityStart=${priorityStart}&priorityEnd=${priorityEnd}&resolution=${selectedTfRef.current.seconds < 60 ? '1s' : '1m'}`;

    const eventSource = new EventSource(streamUrl);
    sseRef.current = eventSource;

    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);

        if (payload.event === 'init') {
          telemetryTotalHoursRef.current = payload.totalHours;
          setTelemetry((prev) => ({
            ...prev,
            totalHours: payload.totalHours,
            currentActivity: `Pipelining ${payload.totalHours} hours (downloading & decoding concurrently)...`,
          }));
        } else if (payload.event === 'chunk') {
          const chunk = payload as StreamHourChunk;
          
          baseStoreRef.current.set(chunk.hourTimestamp, {
            s1: chunk.candles1s || [],
            m1: chunk.candles1m || [],
            hasData: chunk.hasData,
          });

          incomingChunkBufferRef.current.push(chunk);
          totalBytesStreamedRef.current += chunk.rawBytes || 0;
          ticksStreamedRef.current += chunk.totalTicks || 0;
          loadedHoursCountRef.current++;
          if (chunk.isCached) cachedHoursCountRef.current++;
          if (!chunk.hasData) emptyHoursCountRef.current++;

          hourStatusesMapRef.current.set(
            chunk.hourTimestamp,
            chunk.hasData ? (chunk.isCached ? 'cached' : 'loaded') : 'empty'
          );

          scheduleBatchFlush(false);
        } else if (payload.event === 'done') {
          eventSource.close();
          isStreamingRef.current = false;
          performBatchFlush(true);
          setTelemetry((prev) => ({
            ...prev,
            currentActivity: `Completed: ${loadedHoursCountRef.current} hours decoded (${ticksStreamedRef.current.toLocaleString()} ticks ready)`,
            status: 'completed',
          }));
        }
      } catch (err) {
        console.warn('SSE parse error:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      isStreamingRef.current = false;
      performBatchFlush(true);
      setTelemetry((prev) => ({
        ...prev,
        currentActivity: 'Stream disconnected or finished',
        status: prev.loadedHours > 0 ? 'completed' : 'error',
      }));
    };
  }, [
    symbol,
    startDate,
    endDate,
    requestedHours,
    visibleRange,
    refreshChartData,
    scheduleBatchFlush,
    performBatchFlush,
    stopStreamingPipeline,
  ]);

  useEffect(() => {
    if (runToken > 0) {
      startStreamingPipeline();
    }
    return () => {
      sseRef.current?.close();
      abortControllerRef.current?.abort();
    };
  }, [runToken]);

  // ==========================================
  // FXREPLAY ENGINE CONTROLS
  // ==========================================

  // Toggle Replay Mode
  const toggleReplayMode = () => {
    if (!isReplayMode) {
      const p = precomputedRef.current;
      if (p.candles.length === 0) return;
      const initialCut = Math.min(Math.max(15, Math.floor(p.candles.length * 0.25)), p.candles.length - 1);
      setCutIndex(initialCut);
      setReplayIndex(initialCut);
      replayIndexRef.current = initialCut;
      setIsReplayMode(true);
      setIsReplaying(false);
      applySliceToChart(initialCut);
    } else {
      setIsReplayMode(false);
      setIsReplaying(false);
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
        replayIntervalRef.current = null;
      }
      const p = precomputedRef.current;
      candleSeriesRef.current?.setData(p.candles);
      volumeSeriesRef.current?.setData(p.volumes);
      if (smaSeriesRef.current) smaSeriesRef.current.setData(p.sma.filter(Boolean) as LineData<Time>[]);
      if (emaSeriesRef.current) emaSeriesRef.current.setData(p.ema.filter(Boolean) as LineData<Time>[]);
      chartRef.current?.timeScale().fitContent();
    }
  };

  // Jump to specific index (via timeline scrubber)
  const jumpToIndex = useCallback((targetIdx: number) => {
    const p = precomputedRef.current;
    if (p.candles.length === 0) return;
    const clamped = Math.max(0, Math.min(targetIdx, p.candles.length - 1));
    setReplayIndex(clamped);
    replayIndexRef.current = clamped;
    applySliceToChart(clamped);
  }, [applySliceToChart]);

  // Step Forward
  const stepForward = useCallback((n: number = 1) => {
    stepForwardBars(n);
    setReplayIndex(replayIndexRef.current);
  }, [stepForwardBars]);

  // Step Backward
  const stepBackward = useCallback((n: number = 1) => {
    stepBackwardBars(n);
  }, [stepBackwardBars]);

  // Reset to initial cut point
  const jumpToCutStart = () => {
    jumpToIndex(cutIndex);
  };

  // Jump to newest candle (Live / End)
  const jumpToEnd = () => {
    const p = precomputedRef.current;
    if (p.candles.length > 0) {
      jumpToIndex(p.candles.length - 1);
    }
  };

  // Set new cut point at current replay position
  const setCutAtCurrent = () => {
    setCutIndex(replayIndexRef.current);
  };

  // Toggle automated playback loop
  const togglePlayPause = () => {
    setIsReplaying((prev) => !prev);
  };

  // Ultra-smooth, high-frequency playback timer
  useEffect(() => {
    if (!isReplaying || !isReplayMode) {
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
        replayIntervalRef.current = null;
      }
      return;
    }

    const { intervalMs, barsPerStep } = selectedSpeed;

    const interval = setInterval(() => {
      const p = precomputedRef.current;
      if (!p || p.candles.length === 0) return;

      const cur = replayIndexRef.current;
      const maxIdx = p.candles.length - 1;
      if (cur >= maxIdx) {
        // If stream is still loading chunks in background, hold position without stopping playback
        if (telemetryRef.current.status !== 'streaming') {
          setIsReplaying(false);
        }
        return;
      }

      stepForwardBars(barsPerStep);
    }, intervalMs);

    replayIntervalRef.current = interval;

    return () => {
      clearInterval(interval);
      replayIntervalRef.current = null;
    };
  }, [isReplaying, isReplayMode, selectedSpeed, stepForwardBars]);

  // Decoupled 60fps animation frame ticker for UI state sync (slider & clock)
  useEffect(() => {
    if (!isReplayMode) return;

    let animId: number;
    let lastSync = 0;

    const syncLoop = (now: number) => {
      // Throttle React state update to ~30-60ms for silky-smooth DOM performance
      if (now - lastSync > 40) {
        lastSync = now;
        if (replayIndexRef.current !== replayIndex) {
          setReplayIndex(replayIndexRef.current);
        }
      }
      animId = requestAnimationFrame(syncLoop);
    };

    animId = requestAnimationFrame(syncLoop);

    return () => cancelAnimationFrame(animId);
  }, [isReplayMode, replayIndex]);

  // Global keyboard shortcuts for FxReplay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleReplayMode();
      }

      if (!isReplayMode) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : stepSize;
        stepForward(step);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : stepSize;
        stepBackward(step);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReplayMode, stepSize, stepForward, stepBackward]);

  // Current active candle under replay head
  const activeReplayCandle = useMemo(() => {
    const raw = precomputedRef.current.rawCandles;
    if (!raw || raw.length === 0 || replayIndex >= raw.length) return null;
    return raw[replayIndex];
  }, [replayIndex, totalCandlesCount]);

  // Virtual Sandbox Trading in Replay Mode
  const handleExecuteTrade = (type: 'BUY' | 'SELL') => {
    if (!activeReplayCandle) return;
    const newTrade: ReplayTrade = {
      id: `trade_${Date.now()}`,
      type,
      entryPrice: activeReplayCandle.close,
      entryTime: Number(activeReplayCandle.time),
      entryBar: replayIndex,
      pnlPips: 0,
      status: 'OPEN',
    };
    setActiveTrades((prev) => [newTrade, ...prev]);
  };

  const handleCloseTrade = (tradeId: string) => {
    if (!activeReplayCandle) return;
    setActiveTrades((prev) =>
      prev.map((t) => {
        if (t.id !== tradeId || t.status === 'CLOSED') return t;
        const diff = activeReplayCandle.close - t.entryPrice;
        const pips = (t.type === 'BUY' ? diff : -diff) * 10000;
        return {
          ...t,
          exitPrice: activeReplayCandle.close,
          exitTime: Number(activeReplayCandle.time),
          exitBar: replayIndex,
          pnlPips: Number(pips.toFixed(1)),
          status: 'CLOSED',
        };
      })
    );
  };

  const fitChartContent = () => {
    chartRef.current?.timeScale().fitContent();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const isStreaming = telemetry.status === 'streaming';
  const progressPercent = totalCandlesCount > 0 ? ((replayIndex + 1) / totalCandlesCount) * 100 : 0;

  return (
    <div
      className={`flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl transition-all ${
        isFullscreen ? 'fixed inset-4 z-50 rounded-2xl ring-2 ring-emerald-500/50' : ''
      }`}
    >
      {/* Chart Top Toolbar */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Symbol, Price Readout, Timeframe Selector & Indicators */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Symbol Tag */}
          <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <span className="text-xs font-bold text-white tracking-wide font-mono">{symbol}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
              Live bi5
            </span>
          </div>

          {/* Timeframe Presets */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            {['1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1D'].map((tfId) => {
              const config = STANDARD_TIMEFRAMES.find((t) => t.id === tfId) || parseCustomTimeframe(tfId);
              const isActive = selectedTf.id === config.id;
              return (
                <button
                  key={tfId}
                  onClick={() => handleSelectTimeframe(config)}
                  className={`px-2 py-1 text-[11px] font-mono rounded transition cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {config.label}
                </button>
              );
            })}

            {/* Custom Timeframe Popover Button */}
            <button
              onClick={() => setShowCustomModal(!showCustomModal)}
              className={`px-2 py-1 text-[11px] font-mono rounded transition flex items-center gap-1 cursor-pointer ${
                selectedTf.category === 'custom' || !STANDARD_TIMEFRAMES.some((t) => t.id === selectedTf.id)
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Custom Timeframe (seconds to monthly)"
            >
              <span>{selectedTf.category === 'custom' ? selectedTf.label : 'Custom'}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {/* Indicator Toggles */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setShowVolume(!showVolume)}
              className={`px-2 py-1 text-[11px] rounded transition cursor-pointer ${
                showVolume ? 'bg-slate-800 text-sky-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Vol
            </button>
            <button
              onClick={() => setShowSMA(!showSMA)}
              className={`px-2 py-1 text-[11px] rounded transition cursor-pointer ${
                showSMA ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              SMA 20
            </button>
            <button
              onClick={() => setShowEMA(!showEMA)}
              className={`px-2 py-1 text-[11px] rounded transition cursor-pointer ${
                showEMA ? 'bg-slate-800 text-amber-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              EMA 50
            </button>
          </div>
        </div>

        {/* Right: FXREPLAY MODE TOGGLE & Standard Action Buttons */}
        <div className="flex items-center gap-2">
          {/* FxReplay Mode Toggle Button */}
          <button
            onClick={toggleReplayMode}
            disabled={totalCandlesCount === 0}
            className={`px-3 py-1.5 text-xs rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md ${
              isReplayMode
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-400/50 shadow-amber-950/50'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 hover:border-amber-400'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title="Toggle FxReplay Bar Replay Mode (Hotkey: R)"
          >
            <Rewind className="h-3.5 w-3.5 fill-current" />
            <span>{isReplayMode ? 'Exit Replay' : 'FxReplay Bar'}</span>
            {isReplayMode && <span className="w-1.5 h-1.5 rounded-full bg-slate-950 ml-0.5" />}
          </button>

          {isStreaming ? (
            <button
              onClick={stopStreamingPipeline}
              className="px-2.5 py-1 text-xs rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-700/60 text-rose-300 flex items-center gap-1.5 transition cursor-pointer"
              title="Stop current streaming download"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop Stream
            </button>
          ) : (
            <button
              onClick={() => (onStartRequest ? onStartRequest() : startStreamingPipeline())}
              className="px-3 py-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-white flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-950/40"
              title="Start or re-stream the confirmed range"
            >
              <Play className="h-3 w-3 fill-current" />
              {hasStarted ? 'Re-stream Range' : 'Confirm & Stream'}
            </button>
          )}

          <button
            onClick={fitChartContent}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
            title="Auto-Fit Time Horizon"
          >
            Auto Fit
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FXREPLAY DEDICATED REPLAY BAR & CONTROLLER (When Replay Mode is Active)  */}
      {/* ========================================================================= */}
      {isReplayMode && (
        <div className="bg-slate-900/98 border-b border-amber-500/30 p-3 px-4 shadow-xl flex flex-col gap-2.5 transition-all">
          {/* Main Controls Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Playback Controls & Stepping */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
              {/* Jump to Cut Start */}
              <button
                onClick={jumpToCutStart}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Jump to Cut Point / Replay Start (⏮)"
              >
                <SkipBack className="h-4 w-4" />
              </button>

              {/* Step Back (-1 or -N) */}
              <button
                onClick={() => stepBackward(stepSize)}
                disabled={replayIndex <= 0}
                className="px-2 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center gap-1 text-xs font-mono font-semibold cursor-pointer disabled:opacity-40"
                title={`Step Backward by ${stepSize} candle (Hotkey: ←)`}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>-{stepSize}</span>
              </button>

              {/* Play / Pause Toggle */}
              <button
                onClick={togglePlayPause}
                className={`px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                  isReplaying
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-400/40 shadow-amber-950/60'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60'
                }`}
                title="Play / Pause Replay (Hotkey: Spacebar)"
              >
                {isReplaying ? (
                  <>
                    <Pause className="h-4 w-4 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>Play Replay</span>
                  </>
                )}
              </button>

              {/* Step Forward (+1 or +N) */}
              <button
                onClick={() => stepForward(stepSize)}
                disabled={replayIndex >= totalCandlesCount - 1}
                className="px-2 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center gap-1 text-xs font-mono font-semibold cursor-pointer disabled:opacity-40"
                title={`Step Forward by ${stepSize} candle (Hotkey: →)`}
              >
                <span>+{stepSize}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              {/* Jump to Live / End */}
              <button
                onClick={jumpToEnd}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Jump to Latest Candle / Live (⏭)"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>

            {/* Fast Speed Selection Multipliers for High Speed Testing */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 px-1 font-mono uppercase font-semibold flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-400" />
                Speed:
              </span>
              <div className="flex items-center gap-0.5">
                {REPLAY_SPEEDS.map((spd) => (
                  <button
                    key={spd.id}
                    onClick={() => setSelectedSpeed(spd)}
                    className={`px-1.5 py-1 text-[11px] font-mono rounded transition cursor-pointer ${
                      selectedSpeed.id === spd.id
                        ? 'bg-amber-500 text-slate-950 font-bold shadow'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                    title={`${spd.label} (${spd.intervalMs}ms interval, ${spd.barsPerStep} bars/step)`}
                  >
                    {spd.id}
                  </button>
                ))}
              </div>
            </div>

            {/* Step Multiplier & Utilities */}
            <div className="flex items-center gap-2">
              {/* Step Jump Multiplier */}
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
                <span className="text-slate-500 px-1.5">Step:</span>
                {[1, 5, 10, 50].map((step) => (
                  <button
                    key={step}
                    onClick={() => setStepSize(step)}
                    className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                      stepSize === step ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {step}b
                  </button>
                ))}
              </div>

              {/* Cut Point Action */}
              <button
                onClick={setCutAtCurrent}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-400 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Mark current bar as the new Replay Start Cut Point"
              >
                <Scissors className="h-3.5 w-3.5" />
                <span>Cut Here</span>
              </button>

              {/* Auto Follow Bar Toggle */}
              <button
                onClick={() => setAutoFollowBar(!autoFollowBar)}
                className={`px-2 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  autoFollowBar
                    ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-400'
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
                title="Auto scroll viewport with advancing replay candle"
              >
                Follow Bar
              </button>

              {/* Trade Sandbox Toggle */}
              <button
                onClick={() => setShowSandbox(!showSandbox)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                  showSandbox
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-950 border border-slate-800 text-sky-400 hover:bg-slate-800'
                }`}
                title="Toggle FxReplay simulated order execution sandbox"
              >
                <DollarSign className="h-3.5 w-3.5" />
                <span>Trade Sandbox</span>
              </button>
            </div>
          </div>

          {/* Interactive Replay Scrubber Slider & Progress Meta */}
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={Math.max(0, totalCandlesCount - 1)}
                value={replayIndex}
                onChange={(e) => jumpToIndex(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none border border-slate-800"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono">
              <div className="flex items-center gap-3">
                <span>
                  Bar <strong className="text-amber-400">{replayIndex + 1}</strong> of{' '}
                  <strong className="text-slate-200">{totalCandlesCount}</strong> ({progressPercent.toFixed(1)}%)
                </span>
                {isStreaming && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Live Expanding ({telemetry.loadedHours}/{telemetry.totalHours} hrs decoded)
                  </span>
                )}
                {activeReplayCandle && (
                  <span className="text-slate-300 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-emerald-400" />
                    {new Date(Number(activeReplayCandle.time) * 1000).toUTCString().slice(0, 22)} UTC
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {activeReplayCandle && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Price:</span>
                    <strong className="text-white">{activeReplayCandle.close.toFixed(5)}</strong>
                    <span className="text-slate-500">Vol:</span>
                    <span className="text-sky-400">{activeReplayCandle.volume.toLocaleString()}</span>
                  </div>
                )}
                <span className="text-[10px] text-slate-500">
                  Shortcuts: <kbd className="px-1 py-0.5 bg-slate-950 rounded border border-slate-800 text-slate-300">Space</kbd> Play/Pause &bull;{' '}
                  <kbd className="px-1 py-0.5 bg-slate-950 rounded border border-slate-800 text-slate-300">&rarr;</kbd> Forward &bull;{' '}
                  <kbd className="px-1 py-0.5 bg-slate-950 rounded border border-slate-800 text-slate-300">&larr;</kbd> Back
                </span>
              </div>
            </div>
          </div>

          {/* FxReplay Virtual Trading Simulator Sandbox */}
          {showSandbox && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                    FxReplay Strategy Execution Sandbox
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Test your strategy bar-by-bar at current replay price: <strong className="text-emerald-400 font-mono">{activeReplayCandle?.close.toFixed(5)}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExecuteTrade('BUY')}
                    disabled={!activeReplayCandle}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-1 transition cursor-pointer shadow shadow-emerald-950"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    BUY (Long)
                  </button>
                  <button
                    onClick={() => handleExecuteTrade('SELL')}
                    disabled={!activeReplayCandle}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg flex items-center gap-1 transition cursor-pointer shadow shadow-rose-950"
                  >
                    <TrendingDown className="h-3.5 w-3.5" />
                    SELL (Short)
                  </button>
                </div>
              </div>

              {/* Active / Past Orders list */}
              {activeTrades.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-1 max-h-36 overflow-y-auto">
                  {activeTrades.map((t) => {
                    const currentClose = activeReplayCandle?.close || t.entryPrice;
                    const diff = currentClose - t.entryPrice;
                    const livePips = (t.type === 'BUY' ? diff : -diff) * 10000;
                    const displayPips = t.status === 'CLOSED' ? t.pnlPips : Number(livePips.toFixed(1));
                    const isPositive = displayPips >= 0;

                    return (
                      <div
                        key={t.id}
                        className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center justify-between text-xs font-mono"
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                t.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {t.type}
                            </span>
                            <span className="text-slate-300">@{t.entryPrice.toFixed(5)}</span>
                            <span className="text-[10px] text-slate-500">Bar #{t.entryBar + 1}</span>
                          </div>
                          <div className="text-[11px] mt-0.5">
                            <span className="text-slate-500">PnL: </span>
                            <span className={isPositive ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {isPositive ? '+' : ''}
                              {displayPips} pips
                            </span>
                          </div>
                        </div>

                        <div>
                          {t.status === 'OPEN' ? (
                            <button
                              onClick={() => handleCloseTrade(t.id)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-semibold transition cursor-pointer"
                            >
                              Close
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-950">Closed</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-2 text-[11px] text-slate-500">
                  No virtual positions open. Click BUY or SELL above to execute a simulated order at the current replay candle.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Custom Timeframe Popover */}
      {showCustomModal && (
        <div className="bg-slate-900 border-b border-slate-800 p-3 px-4 flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
          <span className="text-xs text-slate-400 font-medium">Custom Timeframe Interval:</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="9999"
              placeholder="e.g. 45"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <select
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            >
              <option value="s">Seconds (s)</option>
              <option value="m">Minutes (m)</option>
              <option value="h">Hours (h)</option>
              <option value="d">Days (d)</option>
              <option value="w">Weeks (w)</option>
              <option value="M">Months (M)</option>
            </select>
            <button
              onClick={handleApplyCustomTimeframe}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
            >
              Apply Instant
            </button>
          </div>
          <div className="text-[11px] text-slate-500">
            Switching happens in &lt; 2ms without re-downloading!
          </div>
        </div>
      )}

      {/* OHLCV Crosshair Hover Data Bar */}
      <div className="bg-slate-950/90 border-b border-slate-800/80 px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
        {hoverData ? (
          <>
            <span className="text-slate-400">{hoverData.time}</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">O:</span>
              <span className="text-white font-semibold">{hoverData.open.toFixed(5)}</span>
              <span className="text-slate-500">H:</span>
              <span className="text-emerald-400 font-semibold">{hoverData.high.toFixed(5)}</span>
              <span className="text-slate-500">L:</span>
              <span className="text-rose-400 font-semibold">{hoverData.low.toFixed(5)}</span>
              <span className="text-slate-500">C:</span>
              <span className="text-white font-semibold">{hoverData.close.toFixed(5)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Change:</span>
              <span className={hoverData.change >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {hoverData.change >= 0 ? '+' : ''}
                {hoverData.change.toFixed(5)} ({hoverData.changePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Vol:</span>
              <span className="text-sky-400">{hoverData.volume.toLocaleString()}</span>
            </div>
          </>
        ) : (
          <span className="text-slate-500 text-[11px]">
            Hover over chart for OHLCV crosshair coordinates &bull; Scroll to Zoom &bull; Drag to Pan Viewport
          </span>
        )}
      </div>

      {/* TradingView Chart Container */}
      <div className="relative flex-1 bg-[#090d16]" style={{ minHeight: isFullscreen ? 'calc(100vh - 220px)' : '460px' }}>
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* Initial Standby Prompt before confirmation */}
        {!hasStarted && runToken === 0 && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Ready to Stream Historical Data</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Selected Range:{' '}
                  <strong className="text-slate-200 font-mono">
                    {symbol} ({requestedHours.length} Hours)
                  </strong>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {new Date(startDate).toUTCString().slice(0, 22)} &rarr; {new Date(endDate).toUTCString().slice(0, 22)}
                </p>
              </div>
              <button
                onClick={() => (onStartRequest ? onStartRequest() : startStreamingPipeline())}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-white text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                <Play className="h-4 w-4 fill-current" />
                Confirm &amp; Start Process
              </button>
              <div className="text-[10px] text-slate-500">
                Data is downloaded, decompressed, and rendered simultaneously in real-time.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pipelined Streaming & Viewport Buffer Bar */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2 flex flex-col gap-2">
        {/* Timeline Chunk Status Strip */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Zap className="h-3 w-3 text-emerald-400" />
              Concurrent Download &amp; Decode Pipeline ({requestedHours.length} Hours)
            </span>
            <span className="font-mono text-slate-400">
              {telemetry.loadedHours}/{telemetry.totalHours || requestedHours.length} chunks ready &bull;{' '}
              {telemetry.totalTicksDecoded.toLocaleString()} ticks decoded
            </span>
          </div>

          {/* Micro Visual Chunk Heatmap */}
          <div className="grid grid-flow-col auto-cols-fr gap-0.5 h-2 bg-slate-950 rounded overflow-hidden p-0.5 border border-slate-800">
            {requestedHours.map((h) => {
              const status = hourStatuses.get(h) || 'pending';
              let bg = 'bg-slate-800';
              if (status === 'loaded') bg = 'bg-emerald-500';
              if (status === 'cached') bg = 'bg-cyan-500';
              if (status === 'empty') bg = 'bg-slate-700/50';
              if (status === 'streaming') bg = 'bg-amber-400 animate-pulse';
              return (
                <div
                  key={h}
                  className={`h-full rounded-[1px] transition-colors ${bg}`}
                  title={`${h.slice(0, 16)}: ${status}`}
                />
              );
            })}
          </div>
        </div>

        {/* Telemetry Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                telemetry.status === 'streaming'
                  ? 'bg-amber-400 animate-pulse'
                  : telemetry.status === 'completed'
                  ? 'bg-emerald-400'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-300 font-medium">{telemetry.currentActivity}</span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[10px] text-slate-400">
            {telemetry.downloadSpeedMBps > 0 && (
              <span>
                CDN Ingest: <strong className="text-emerald-400">{telemetry.downloadSpeedMBps} MB/s</strong>
              </span>
            )}
            {telemetry.decodeSpeedTicksPerSec > 0 && (
              <span>
                Resampling Engine: <strong className="text-cyan-400">{telemetry.decodeSpeedTicksPerSec.toLocaleString()} bars/s</strong>
              </span>
            )}
            <span>
              Cache Hits: <strong className="text-slate-300">{telemetry.cachedHours}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
