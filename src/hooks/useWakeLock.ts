import { useCallback, useEffect, useRef, useState } from 'react';

export function useWakeLock() {
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // User intent: true between request() and release(). The browser drops the
  // sentinel whenever the page is hidden, so isActive alone cannot drive re-acquire.
  const wantedRef = useRef(false);

  const request = useCallback(async () => {
    wantedRef.current = true;
    try {
      if ('wakeLock' in navigator) {
        if (wakeLockRef.current && !wakeLockRef.current.released) return;
        const sentinel = await navigator.wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        setIsActive(true);
        sentinel.addEventListener('release', () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
          setIsActive(false);
        }, { once: true });
      }
    } catch {
      setIsActive(false);
    }
  }, []);

  const release = useCallback(async () => {
    wantedRef.current = false;
    if (wakeLockRef.current) {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      try { await sentinel.release(); } catch { /* ignore */ }
      setIsActive(false);
    }
  }, []);

  // Re-acquire when the page becomes visible again (browser releases it when hidden)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && wantedRef.current) {
        request();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [request]);

  // Release on unmount
  useEffect(() => () => {
    wantedRef.current = false;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  return { isActive, request, release };
}
