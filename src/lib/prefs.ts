/**
 * Small per-device preferences (localStorage). Everything here is a convenience,
 * never source of truth: reads fall back to defaults when storage is unavailable.
 */
export type TextSize = 'small' | 'normal' | 'large';

const KEY = 'kis_prefs_v1';

interface Prefs {
  followRuler: boolean;
  textSize: TextSize;
  mobileTipDismissed: boolean;
  viewLocked: Record<string, boolean>; // patternId → locked
  sessions: Record<string, { day: string; rows: number; seconds: number }>; // patternId → today's totals
}

const DEFAULTS: Prefs = { followRuler: true, textSize: 'normal', mobileTipDismissed: false, viewLocked: {}, sessions: {} };

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULTS, ...parsed, viewLocked: parsed.viewLocked ?? {}, sessions: parsed.sessions ?? {} };
  } catch {
    return { ...DEFAULTS };
  }
}
function write(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function getPref<K extends keyof Prefs>(k: K): Prefs[K] { return read()[k]; }
export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) { const p = read(); p[k] = v; write(p); }

export function getViewLocked(patternId: string): boolean { return !!read().viewLocked[patternId]; }
export function setViewLocked(patternId: string, locked: boolean) {
  const p = read(); if (locked) p.viewLocked[patternId] = true; else delete p.viewLocked[patternId]; write(p);
}

/** Root font size drives every rem-based class (text-xs … text-lg) across the app. */
export function applyTextSize(size: TextSize = getPref('textSize')) {
  const pct = size === 'small' ? '93.75%' : size === 'large' ? '118.75%' : '100%';
  document.documentElement.style.fontSize = pct;
  document.documentElement.dataset.textSize = size;
}

// --- per-pattern "today" session stats (rows completed, seconds active) ---
function todayKey() { return new Date().toISOString().slice(0, 10); }
export function getSession(patternId: string): { rows: number; seconds: number } {
  const s = read().sessions[patternId];
  if (!s || s.day !== todayKey()) return { rows: 0, seconds: 0 };
  return { rows: s.rows, seconds: s.seconds };
}
export function addSession(patternId: string, delta: { rows?: number; seconds?: number }) {
  const p = read();
  const cur = p.sessions[patternId];
  const base = cur && cur.day === todayKey() ? cur : { day: todayKey(), rows: 0, seconds: 0 };
  p.sessions[patternId] = { day: base.day, rows: Math.max(0, base.rows + (delta.rows ?? 0)), seconds: Math.max(0, base.seconds + (delta.seconds ?? 0)) };
  // keep the map small
  const ids = Object.keys(p.sessions);
  if (ids.length > 50) for (const id of ids.slice(0, ids.length - 50)) delete p.sessions[id];
  write(p);
}
