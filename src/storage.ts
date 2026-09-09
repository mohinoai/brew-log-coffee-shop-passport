// Two independent public functions — neither calls the other. Each owns its try/catch
// and reports failure as a value, never a throw.

export const STORAGE_KEY = 'coffee-passport-entries';

export type LoadResult = { ok: true; raw: unknown[] } | { ok: false; reason: 'read' };
export type SaveResult = { ok: true } | { ok: false; reason: 'write' };

export function loadEntries(): LoadResult {
  try {
    const rawText = localStorage.getItem(STORAGE_KEY);
    if (rawText === null) return { ok: true, raw: [] };
    const parsed: unknown = JSON.parse(rawText);
    if (!Array.isArray(parsed)) return { ok: false, reason: 'read' };
    return { ok: true, raw: parsed };
  } catch {
    return { ok: false, reason: 'read' };
  }
}

export function saveEntries(entries: readonly unknown[]): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return { ok: true };
  } catch {
    return { ok: false, reason: 'write' };
  }
}
