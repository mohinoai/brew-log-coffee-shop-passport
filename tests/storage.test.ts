import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, loadEntries, saveEntries } from '../src/storage';

let store: Record<string, string> = {};
let fail: 'read' | 'write' | null = null;

vi.stubGlobal('localStorage', {
  getItem: (key: string) => {
    if (fail === 'read') throw new DOMException('SecurityError');
    return store[key] ?? null;
  },
  setItem: (key: string, value: string) => {
    if (fail === 'write') throw new DOMException('QuotaExceededError');
    store[key] = value;
  },
});
beforeEach(() => { store = {}; fail = null; });

describe('storage', () => {
  it('loads an empty passport, then the rows it wrote', () => {
    expect(loadEntries()).toEqual({ ok: true, raw: [] });
    expect(saveEntries([{ id: 'a' }])).toEqual({ ok: true });
    expect(loadEntries()).toEqual({ ok: true, raw: [{ id: 'a' }] });
  });
  it('reports a read failure for broken JSON, a non-array, or a throwing store', () => {
    for (const stored of ['{bukan json[', '{"bukan":"array"}']) {
      store[STORAGE_KEY] = stored;
      expect(loadEntries()).toEqual({ ok: false, reason: 'read' });
    }
    fail = 'read';
    expect(loadEntries()).toEqual({ ok: false, reason: 'read' });
  });
  it('reports a write failure as a value instead of throwing', () => {
    fail = 'write';
    expect(() => saveEntries([])).not.toThrow();
    expect(saveEntries([])).toEqual({ ok: false, reason: 'write' });
    expect(store[STORAGE_KEY]).toBeUndefined();
  });
});
