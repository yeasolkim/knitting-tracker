import { useEffect, useRef } from 'react';

interface HoldRepeatButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Called once on press, then repeatedly while held. */
  onStep: () => void;
  /** Called once at the start of a press (before the first step) — e.g. captureHistory(). */
  onPressStart?: () => void;
  /** Delay before auto-repeat begins (ms). */
  holdDelay?: number;
  /** Interval between repeats (ms). */
  repeatInterval?: number;
}

/**
 * Button that fires `onStep` immediately on pointer down and keeps firing while held.
 * Uses pointer capture so the repeat stops reliably even if the finger slides off.
 */
export default function HoldRepeatButton({
  onStep,
  onPressStart,
  holdDelay = 400,
  repeatInterval = 60,
  disabled,
  ...rest
}: HoldRepeatButtonProps) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  useEffect(() => stop, []);

  return (
    <button
      {...rest}
      disabled={disabled}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (disabled || e.button !== 0) return;
        e.preventDefault(); // avoid focus/scroll side effects and synthetic click
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        onPressStart?.();
        stepRef.current();
        stop();
        timerRef.current = setTimeout(() => {
          intervalRef.current = setInterval(() => stepRef.current(), repeatInterval);
        }, holdDelay);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => e.preventDefault()}
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', ...(rest.style ?? {}) }}
    />
  );
}
