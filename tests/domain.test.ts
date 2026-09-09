import { describe, expect, it } from 'vitest';
import {
  NOTES_MAX, type Entry, filterEntries, normalizeDraft, normalizeEntry,
  sortEntries, validateDraft, visibleEntries,
} from '../src/domain';

const NOW = 1_700_000_000_000;
const e = (o: Partial<Entry> = {}): Entry =>
  ({ id: 'a', name: 'Kopi Toko', city: 'Bandung', drink: 'Latte', rating: 5, notes: 'enak', createdAt: NOW, ...o });

describe('normalizeDraft', () => {
  it('trims, collapses whitespace, coerces rating', () => {
    expect(normalizeDraft({ name: ' Kopi   Toko ', city: ' Bandung ', drink: ' Latte  Panas ', rating: '4', notes: ' wangi  sekali ' }))
      .toEqual({ name: 'Kopi Toko', city: 'Bandung', drink: 'Latte Panas', rating: 4, notes: 'wangi sekali' });
  });
  it('clamps notes to NOTES_MAX and blanks non-strings', () => {
    expect(normalizeDraft({ notes: 'x'.repeat(400) }).notes).toHaveLength(NOTES_MAX);
    expect(normalizeDraft({ name: 42, rating: 'abc' })).toMatchObject({ name: '', rating: 0 });
  });
});

describe('validateDraft', () => {
  it('accepts a complete draft', () => expect(validateDraft(normalizeDraft(e()))).toEqual({}));
  it('flags every empty required field', () => {
    expect(Object.keys(validateDraft(normalizeDraft({}))).sort()).toEqual(['city', 'drink', 'name', 'notes', 'rating']);
  });
  it('rejects ratings outside 1-5 and blank notes', () => {
    for (const rating of [0, -2, 6, 99]) expect(validateDraft(normalizeDraft({ ...e(), rating })).rating).toBeDefined();
    for (const rating of [1, 3, 5]) expect(validateDraft(normalizeDraft({ ...e(), rating })).rating).toBeUndefined();
    expect(validateDraft(normalizeDraft({ ...e(), notes: '   ' })).notes).toBeDefined();
  });
});

describe('normalizeEntry — one gate for form and storage', () => {
  it('rejects non-objects and corrupt rows', () => {
    for (const bad of [null, 'x', 7, [], { name: 'Kopi' }, { ...e(), rating: 9 }]) expect(normalizeEntry(bad, NOW, 'fb')).toBeNull();
  });
  it('keeps a stored id and createdAt, repairs missing ones, normalizes', () => {
    expect(normalizeEntry(e({ id: 'keep', createdAt: 123 }), NOW, 'fb')).toMatchObject({ id: 'keep', createdAt: 123 });
    expect(normalizeEntry({ ...e(), id: '', createdAt: 'nope' }, NOW, 'fb')).toMatchObject({ id: 'fb', createdAt: NOW });
    expect(normalizeEntry({ ...e(), name: ' Filosofi Kopi ' }, NOW, 'fb')?.name).toBe('Filosofi Kopi');
  });
});

describe('filterEntries', () => {
  const list = [e({ id: '1', rating: 3 }), e({ id: '2', rating: 4 }), e({ id: '3', rating: 5 })];
  it('copies for "all", keeps 4 stars and up for "high", can come back empty', () => {
    expect(filterEntries(list, 'all').map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(filterEntries(list, 'all')).not.toBe(list);
    expect(filterEntries(list, 'high').map((x) => x.id)).toEqual(['2', '3']);
    expect(filterEntries([e({ rating: 2 })], 'high')).toEqual([]);
  });
});

describe('sortEntries', () => {
  const list = [
    e({ id: 'b', city: 'bandung', rating: 3, createdAt: 200 }),
    e({ id: 'a', city: 'Ambon', rating: 5, createdAt: 100 }),
    e({ id: 'c', city: 'Cirebon', rating: 5, createdAt: 300 }),
  ];
  it('newest first by default', () => expect(sortEntries(list, 'recent').map((x) => x.id)).toEqual(['c', 'b', 'a']));
  it('city A-Z ignoring case', () => expect(sortEntries(list, 'city').map((x) => x.city)).toEqual(['Ambon', 'bandung', 'Cirebon']));
  it('rating high to low, newest first on ties, without mutating', () => {
    const copy = list.slice();
    expect(sortEntries(list, 'rating').map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(list).toEqual(copy);
  });
});

describe('visibleEntries', () => {
  const list = [
    e({ id: 'low', rating: 2, city: 'Aceh', createdAt: 900 }),
    e({ id: 'mid', rating: 4, city: 'Zurich', createdAt: 100 }),
    e({ id: 'top', rating: 5, city: 'Malang', createdAt: 200 }),
  ];
  it('filters first, then sorts what is left', () => {
    expect(visibleEntries(list, 'high', 'city').map((x) => x.id)).toEqual(['top', 'mid']);
    expect(visibleEntries(list, 'high', 'rating').map((x) => x.id)).toEqual(['top', 'mid']);
    expect(visibleEntries(list, 'all', 'recent')[0]?.id).toBe('low');
  });
});
