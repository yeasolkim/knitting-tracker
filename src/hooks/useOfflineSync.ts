import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getOfflineQueue,
  removeFromOfflineQueue,
  hasOfflineQueue,
} from '@/lib/offlineQueue';

type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

export function useOfflineSync(): { status: SyncStatus; retry: () => void } {
  const supabase = useMemo(() => createClient(), []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setSyncStatus('syncing');

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
          removeFromOfflineQueue(item.patternId);
          continue;
        }

        // Local is newer — push to server
        const { error } = await supabase
          .from('pattern_progress')
          .upsert(
            { pattern_id: item.patternId, user_id: item.userId, ...item.data },
            { onConflict: 'pattern_id,user_id' }
          );

        if (!error) removeFromOfflineQueue(item.patternId);
        // If error: leave in queue, retry after delay
      } catch {
        // Network error mid-sync — leave item in queue
      }
    }

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

  return { status: syncStatus, retry: processQueue };
}
