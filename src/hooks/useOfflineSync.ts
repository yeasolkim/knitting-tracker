import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getOfflineQueue,
  removeFromOfflineQueue,
  hasOfflineQueue,
} from '@/lib/offlineQueue';

type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

export function useOfflineSync(): { status: SyncStatus; retry: () => void; conflictCount: number; clearConflict: () => void } {
  const supabase = useMemo(() => createClient(), []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [conflictCount, setConflictCount] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    if (processingRef.current) return; // 'online' event + mount + retry can overlap
    if (!hasOfflineQueue()) return;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    processingRef.current = true;
    setSyncStatus('syncing');

    // Items may be enqueued while we are replaying; loop until the queue stops shrinking.
    let queue = getOfflineQueue();
    let pass = 0;
    while (queue.length > 0 && pass < 5) {
      pass += 1;
    for (const item of queue) {
      try {
        // Conflict resolution: compare server's updated_at with local queuedAt.
        // If the server was modified after we queued (= another device saved),
        // the server wins and we discard the local change.
        const { data: serverRow } = await supabase
          .from('pattern_progress')
          .select('updated_at')
          .eq('pattern_id', item.patternId)
          .eq('user_id', item.userId)
          .maybeSingle();

        const serverTime = serverRow?.updated_at
          ? new Date(serverRow.updated_at).getTime()
          : 0;

        if (serverTime > item.queuedAt) {
          // Server is newer (edited on another device) — discard local change
          removeFromOfflineQueue(item.patternId, item.queuedAt);
          setConflictCount(prev => prev + 1);
          continue;
        }

        // Local is newer — push to server
        const { error } = await supabase
          .from('pattern_progress')
          .upsert(
            { pattern_id: item.patternId, user_id: item.userId, ...item.data },
            { onConflict: 'pattern_id,user_id' }
          );

        if (!error) removeFromOfflineQueue(item.patternId, item.queuedAt);
        // If error: leave in queue, retry after delay
      } catch {
        // Network error mid-sync — leave item in queue
      }
    }
      const remaining = getOfflineQueue();
      // Stop if nothing was consumed this pass (persistent failure) to avoid a hot loop
      if (remaining.length >= queue.length) { queue = remaining; break; }
      queue = remaining;
    }
    processingRef.current = false;

    if (!hasOfflineQueue()) {
      setSyncStatus('done');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } else {
      // Some items failed — show error and schedule auto-retry in 30s
      setSyncStatus('error');
      retryTimerRef.current = setTimeout(() => {
        if (navigator.onLine) processQueue();
      }, 30000);
    }
  }, [supabase]);

  useEffect(() => {
    if (hasOfflineQueue()) processQueue();

    window.addEventListener('online', processQueue);
    return () => {
      window.removeEventListener('online', processQueue);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [processQueue]);

  const clearConflict = useCallback(() => setConflictCount(0), []);

  return { status: syncStatus, retry: processQueue, conflictCount, clearConflict };
}
