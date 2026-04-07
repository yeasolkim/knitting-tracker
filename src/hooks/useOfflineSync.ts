import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getOfflineQueue,
  removeFromOfflineQueue,
  hasOfflineQueue,
} from '@/lib/offlineQueue';

type SyncStatus = 'idle' | 'syncing' | 'done';

export function useOfflineSync(): SyncStatus {
  const supabase = useMemo(() => createClient(), []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const processQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

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
        // If error: leave in queue, retry next time online
      } catch {
        // Network error mid-sync — leave item in queue
      }
    }

    // Only show 'done' if queue is actually empty (all items synced or server-won)
    if (!hasOfflineQueue()) {
      setSyncStatus('done');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } else {
      setSyncStatus('idle');
    }
  }, [supabase]);

  useEffect(() => {
    // Try on mount (in case there are leftover items from a previous session)
    if (hasOfflineQueue()) processQueue();

    window.addEventListener('online', processQueue);
    return () => window.removeEventListener('online', processQueue);
  }, [processQueue]);

  return syncStatus;
}
