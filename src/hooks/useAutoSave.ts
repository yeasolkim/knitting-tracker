import { useCallback, useEffect, useRef, useState } from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutoSave<T>(
  saveFn: (data: T) => Promise<void>,
  delay = 500
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveFnRef = useRef(saveFn);
  const isMountedRef = useRef(true);
  // Stores the most recently scheduled (not yet fired) save payload.
  // Flushed immediately on unmount so browser-back / swipe-to-go-back
  // never silently drops a pending save.
  const pendingDataRef = useRef<T | null>(null);

  // Keep saveFn ref up to date without causing save() to be recreated
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Flush any pending debounced save before the component is torn down.
      // This covers browser back button, swipe-to-go-back (iOS), and any
      // navigation that bypasses the in-app back button's explicit saveAll().
      if (pendingDataRef.current !== null) {
        saveFnRef.current(pendingDataRef.current).catch(() => {});
        pendingDataRef.current = null;
      }
    };
  }, []);

  // save is now stable - it never changes reference
  const save = useCallback(
    (data: T) => {
      pendingDataRef.current = data;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;
        pendingDataRef.current = null;
        setStatus('saving');
        try {
          await saveFnRef.current(data);
          if (!isMountedRef.current) return;
          setStatus('saved');
          setTimeout(() => {
            if (isMountedRef.current) setStatus('idle');
          }, 2000);
        } catch {
          if (isMountedRef.current) setStatus('error');
        }
      }, delay);
    },
    [delay]
  );

  return { save, status };
}
