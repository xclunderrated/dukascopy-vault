import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DownloadManager } from './components/DownloadManager';
import { TickExplorer } from './components/TickExplorer';
import { RateLimitLab } from './components/RateLimitLab';
import { BenchmarkView } from './components/BenchmarkView';
import { StorageInspector } from './components/StorageInspector';
import { PythonHub } from './components/PythonHub';
import { ActiveJob, RateLimiterStats, SymbolInfo } from './types';

export function App() {
  const [activeTab, setActiveTab] = useState('download');
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [rateLimiter, setRateLimiter] = useState<RateLimiterStats>();
  const [totalStoredChunks, setTotalStoredChunks] = useState(0);
  const [totalStoredBytes, setTotalStoredBytes] = useState(0);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  // Selected symbol state for passing to explorer
  const [exploreParams, setExploreParams] = useState<{
    symbol: string;
    startDate: string;
    endDate: string;
  }>({
    symbol: 'EURUSD',
    startDate: '2024-03-01T00:00:00Z',
    endDate: '2024-03-02T00:00:00Z',
  });

  // Fetch status and symbols
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setRateLimiter(data.rateLimiter);
        setTotalStoredChunks(data.storage.totalStoredChunks || 0);
        setTotalStoredBytes(data.storage.totalStoredBytes || 0);
        if (data.activeJobs && data.activeJobs.length > 0) {
          setActiveJobs(data.activeJobs);
          const running = data.activeJobs.some((j: ActiveJob) => j.status === 'running');
          setIsDownloading(running);
        }
      }
    } catch {
      // Quietly ignore transient network disconnects during background polling
    }
  };

  const fetchSymbols = async () => {
    try {
      const res = await fetch('/api/symbols');
      if (res.ok) {
        const data = await res.json();
        setSymbols(data);
      }
    } catch {
      // Quietly ignore transient network disconnects
    }
  };

  useEffect(() => {
    fetchSymbols();
    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleStartDownload = async (params: {
    symbol: string;
    startDate: string;
    endDate: string;
    maxConcurrency: number;
    filterMarketHours: boolean;
  }) => {
    setIsDownloading(true);
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (data.jobId) {
        fetchStatus();
      }
    } catch (err) {
      console.error('Start download failed:', err);
      setIsDownloading(false);
    }
  };

  const handleExploreSymbol = (symbol: string, startDate: string, endDate: string) => {
    setExploreParams({ symbol, startDate, endDate });
    setActiveTab('explorer');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        rateLimiter={rateLimiter}
        totalChunks={totalStoredChunks}
        totalBytes={totalStoredBytes}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'download' && (
          <DownloadManager
            symbols={symbols}
            activeJobs={activeJobs}
            onStartDownload={handleStartDownload}
            onExploreSymbol={handleExploreSymbol}
            isDownloading={isDownloading}
          />
        )}

        {activeTab === 'explorer' && (
          <TickExplorer
            symbols={symbols}
            initialSymbol={exploreParams.symbol}
            initialStartDate={exploreParams.startDate}
            initialEndDate={exploreParams.endDate}
          />
        )}

        {activeTab === 'ratelimit' && <RateLimitLab rateLimiter={rateLimiter} />}

        {activeTab === 'benchmark' && <BenchmarkView />}

        {activeTab === 'storage' && <StorageInspector onRefresh={fetchStatus} />}

        {activeTab === 'python' && <PythonHub />}
      </main>

      {/* Subtle Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>TickVault 2.0 &bull; High-Performance Dukascopy Feed Engine</span>
          <span className="font-mono text-slate-600">Adaptive AIMD Throttling &bull; HTTP/2 Stream Multiplexing</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
