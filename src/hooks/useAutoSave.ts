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
  // Saves run strictly one after another so a slow older request can never
  // land after (and overwrite) a newer one. Only the newest save drives status.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const seqRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const data = pendingDataRef.current;
        pendingDataRef.current = null;
        chainRef.current = chainRef.current.then(() => saveFnRef.current(data)).catch(() => {});
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

      timeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        pendingDataRef.current = null;
        const seq = ++seqRef.current;
        if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
        setStatus('saving');
        chainRef.current = chainRef.current
          .then(() => saveFnRef.current(data))
          .then(() => {
            if (!isMountedRef.current || seq !== seqRef.current) return;
            setStatus('saved');
            idleTimerRef.current = setTimeout(() => {
              if (isMountedRef.current && seq === seqRef.current) setStatus('idle');
            }, 2000);
          })
          .catch(() => {
            if (isMountedRef.current && seq === seqRef.current) setStatus('error');
          });
      }, delay);
    },
    [delay]
  );

  return { save, status };
}
