'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutoSave<T>(
  saveFn: (data: T) => Promise<void>,
  delay = 500
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestDataRef = useRef<T | null>(null);

  const save = useCallback(
    (data: T) => {
      latestDataRef.current = data;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setStatus('saving');

      timeoutRef.current = setTimeout(async () => {
        try {
          await saveFn(data);
          setStatus('saved');
          setTimeout(() => setStatus('idle'), 2000);
        } catch {
          setStatus('error');
        }
      }, delay);
    },
    [saveFn, delay]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { save, status };
}
