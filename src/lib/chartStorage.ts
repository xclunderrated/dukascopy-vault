import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { BaseMicroCandle, StreamHourChunk } from '../types';

interface TickVaultDB extends DBSchema {
  hourChunks: {
    key: string; // `${symbol}_${hourTimestamp}`
    value: {
      key: string;
      symbol: string;
      hourTimestamp: string;
      hasData: boolean;
      totalTicks: number;
      candles1s: BaseMicroCandle[];
      candles1m: BaseMicroCandle[];
      storedAt: number;
    };
    indexes: {
      'by-symbol': string;
      'by-symbol-hour': [string, string];
    };
  };
}

const DB_NAME = 'tickvault_chart_cache_v2';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TickVaultDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TickVaultDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('hourChunks')) {
          const store = db.createObjectStore('hourChunks', { keyPath: 'key' });
          store.createIndex('by-symbol', 'symbol');
          store.createIndex('by-symbol-hour', ['symbol', 'hourTimestamp']);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveHourChunkToCache(chunk: StreamHourChunk): Promise<void> {
  try {
    const db = await getDB();
    const key = `${chunk.symbol}_${chunk.hourTimestamp}`;
    await db.put('hourChunks', {
      key,
      symbol: chunk.symbol,
      hourTimestamp: chunk.hourTimestamp,
      hasData: chunk.hasData,
      totalTicks: chunk.totalTicks,
      candles1s: chunk.candles1s || [],
      candles1m: chunk.candles1m || [],
      storedAt: Date.now(),
    });
  } catch (err) {
    console.warn('Failed to save chunk to IndexedDB:', err);
  }
}

export async function saveHourChunksBatchToCache(chunks: StreamHourChunk[]): Promise<void> {
  if (!chunks || chunks.length === 0) return;
  try {
    const db = await getDB();
    const tx = db.transaction('hourChunks', 'readwrite');
    const store = tx.objectStore('hourChunks');
    const now = Date.now();
    for (const chunk of chunks) {
      const key = `${chunk.symbol}_${chunk.hourTimestamp}`;
      store.put({
        key,
        symbol: chunk.symbol,
        hourTimestamp: chunk.hourTimestamp,
        hasData: chunk.hasData,
        totalTicks: chunk.totalTicks,
        candles1s: chunk.candles1s || [],
        candles1m: chunk.candles1m || [],
        storedAt: now,
      });
    }
    await tx.done;
  } catch (err) {
    console.warn('Failed to batch save chunks to IndexedDB:', err);
  }
}

export async function getHourChunkFromCache(symbol: string, hourTimestamp: string) {
  try {
    const db = await getDB();
    const key = `${symbol}_${hourTimestamp}`;
    return await db.get('hourChunks', key);
  } catch {
    return null;
  }
}

export async function getCachedHoursForRange(
  symbol: string,
  hours: string[]
): Promise<Map<string, { candles1s: BaseMicroCandle[]; candles1m: BaseMicroCandle[]; hasData: boolean }>> {
  const result = new Map();
  try {
    const db = await getDB();
    const tx = db.transaction('hourChunks', 'readonly');
    const store = tx.objectStore('hourChunks');

    await Promise.all(
      hours.map(async (hour) => {
        const key = `${symbol}_${hour}`;
        const item = await store.get(key);
        if (item) {
          result.set(hour, {
            candles1s: item.candles1s,
            candles1m: item.candles1m,
            hasData: item.hasData,
          });
        }
      })
    );
  } catch (err) {
    console.warn('Failed to bulk read from IndexedDB:', err);
  }
  return result;
}

export async function clearChartCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('hourChunks');
  } catch (err) {
    console.warn('Failed to clear cache:', err);
  }
}
