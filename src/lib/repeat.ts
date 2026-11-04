import type { SubPattern } from './types';

export interface RepeatInfo {
  /** 1-based pass number (0 before the section, `count` after it) */
  pass: number;
  count: number;
  /** 1-based row inside the current pass (0 before the section) */
  rowInPass: number;
  rows: number;
  phase: 'before' | 'in' | 'after';
}

export function hasRepeat(sub: SubPattern | undefined | null): boolean {
  return !!sub && (sub.repeat_rows ?? 0) > 0 && (sub.repeat_count ?? 0) > 0;
}

/** Where a given 1-based row sits inside the sub-pattern's repeat section. */
export function repeatInfoForRow(sub: SubPattern, row: number): RepeatInfo | null {
  if (!hasRepeat(sub)) return null;
  const start = Math.max(1, sub.repeat_start ?? 1);
  const rows = sub.repeat_rows!;
  const count = sub.repeat_count!;
  if (row < start) return { pass: 0, count, rowInPass: 0, rows, phase: 'before' };
  const off = row - start;
  if (off >= rows * count) return { pass: count, count, rowInPass: rows, rows, phase: 'after' };
  return { pass: Math.floor(off / rows) + 1, count, rowInPass: (off % rows) + 1, rows, phase: 'in' };
}
