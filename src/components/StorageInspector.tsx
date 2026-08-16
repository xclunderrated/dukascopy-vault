import React, { useEffect, useState } from 'react';
import { HardDrive, CheckCircle2, AlertCircle, Database, Folder, RefreshCw, Layers } from 'lucide-react';
import { StorageMetadata, SymbolStorageRecord } from '../types';

interface StorageInspectorProps {
  onRefresh: () => void;
}

export const StorageInspector: React.FC<StorageInspectorProps> = ({ onRefresh }) => {
  const [metadata, setMetadata] = useState<StorageMetadata | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStorageData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/metadata');
      const data: StorageMetadata = await res.json();
      setMetadata(data);
    } catch (err) {
      console.error('Failed to load storage metadata:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorageData();
  }, []);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const symbolList: SymbolStorageRecord[] = metadata && metadata.symbols ? Object.values(metadata.symbols) : [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Database className="h-5 w-5 text-emerald-400" />
            Storage & SQLite Metadata Registry
          </h2>
          <p className="text-xs text-slate-400">
            WAL-enabled SQLite index tracking every downloaded chunk, data presence flag, and file size.
          </p>
        </div>
        <button
          onClick={() => {
            fetchStorageData();
            onRefresh();
          }}
          disabled={loading}
          className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Registry
        </button>
      </div>

      {/* Symbol Table */}
      {symbolList.length > 0 ? (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Symbol</th>
                <th className="py-3 px-4">Valid Tick Chunks</th>
                <th className="py-3 px-4">Weekend Hours Bypassed</th>
                <th className="py-3 px-4">Total Size</th>
                <th className="py-3 px-4">Last Synced</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {symbolList.map((sym) => (
                <tr key={sym.symbol} className="hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-semibold text-white">{sym.symbol}</td>
                  <td className="py-3 px-4 font-mono text-emerald-400 font-medium">
                    {sym.validChunksDownloaded || 0}
                  </td>
                  <td className="py-3 px-4 font-mono text-cyan-400">
                    {sym.weekendHoursBypassed || 0}
                  </td>
                  <td className="py-3 px-4 font-mono">{formatBytes(sym.totalBytes || 0)}</td>
                  <td className="py-3 px-4 text-slate-400">
                    {sym.lastUpdated ? new Date(sym.lastUpdated).toLocaleString() : 'N/A'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3" /> Indexed
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center space-y-3">
          <Folder className="h-10 w-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-white">No Stored Ticks Yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Use the Downloader tab to stream tick chunks from Dukascopy. Downloaded files and SQLite metadata will populate here automatically.
          </p>
        </div>
      )}
    </div>
  );
};
