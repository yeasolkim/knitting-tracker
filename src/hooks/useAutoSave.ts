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
      }
    };
  }, []);

  // save is now stable - it never changes reference
  const save = useCallback(
    (data: T) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;
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
