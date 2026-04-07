import type { PatternWithProgress } from './types';

const QUEUE_KEY = 'kis_offline_queue';
const PATTERN_CACHE_KEY = 'kis_pattern_cache';

export interface OfflineQueueItem {
  patternId: string;
  userId: string;
  data: Record<string, unknown>;
  queuedAt: number; // client timestamp — used for conflict resolution
}

export function enqueueOfflineUpdate(item: OfflineQueueItem): void {
  try {
    const queue = getOfflineQueue();
    // Keep only the latest entry per pattern (last write wins locally)
    const deduped = queue.filter(i => i.patternId !== item.patternId);
    deduped.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(deduped));
  } catch {
    // Ignore storage quota errors
  }
}

export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function removeFromOfflineQueue(patternId: string): void {
  try {
    const queue = getOfflineQueue().filter(i => i.patternId !== patternId);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export function hasOfflineQueue(): boolean {
  return getOfflineQueue().length > 0;
}

// Pattern list cache — for showing the dashboard when offline
export function cachePatterns(patterns: PatternWithProgress[]): void {
  try {
    localStorage.setItem(PATTERN_CACHE_KEY, JSON.stringify({ patterns, cachedAt: Date.now() }));
  } catch {}
}

export function getCachedPatterns(): PatternWithProgress[] | null {
  try {
    const raw = localStorage.getItem(PATTERN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { patterns: PatternWithProgress[]; cachedAt: number };
    return parsed.patterns ?? null;
  } catch {
    return null;
  }
}
