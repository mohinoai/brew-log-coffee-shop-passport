// Pure domain layer: no DOM, no localStorage, no clock. Time and ids arrive as parameters.

export type Entry = {
  id: string;
  name: string;
  city: string;
  drink: string;
  rating: number;
  notes: string;
  createdAt: number;
};

export type Draft = Omit<Entry, 'id' | 'createdAt'>;
export type FieldErrors = Partial<Record<keyof Draft, string>>;
export type FilterMode = 'all' | 'high';
export type SortMode = 'recent' | 'city' | 'rating';

export const NOTES_MAX = 200;
export const TEXT_MAX = 60;
export const HIGH_RATING = 4;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function cleanRating(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
}

/** Trim, collapse whitespace and clamp lengths. Same gate for form input and stored data. */
export function normalizeDraft(raw: Record<string, unknown>): Draft {
  return {
    name: cleanText(raw.name, TEXT_MAX),
    city: cleanText(raw.city, TEXT_MAX),
    drink: cleanText(raw.drink, TEXT_MAX),
    rating: cleanRating(raw.rating),
    notes: cleanText(raw.notes, NOTES_MAX),
  };
}

export function validateDraft(draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.name) errors.name = 'Nama kafe wajib diisi.';
  if (!draft.city) errors.city = 'Kota atau lingkungan wajib diisi.';
  if (!draft.drink) errors.drink = 'Minuman yang dipesan wajib diisi.';
  if (draft.rating < 1 || draft.rating > 5) errors.rating = 'Pilih rating 1 sampai 5 bintang.';
  if (!draft.notes) errors.notes = 'Tulis catatan rasa atau vibe singkat.';
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Single validation gate: any unknown value (form draft or stored row) becomes an Entry, or null. */
export function normalizeEntry(raw: unknown, now: number, fallbackId: string): Entry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const draft = normalizeDraft(source);
  if (hasErrors(validateDraft(draft))) return null;
  const createdAt = typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
    ? source.createdAt
    : now;
  const id = typeof source.id === 'string' && source.id !== '' ? source.id : fallbackId;
  return { id, ...draft, createdAt };
}

export function filterEntries(entries: readonly Entry[], mode: FilterMode): Entry[] {
  return mode === 'high' ? entries.filter((e) => e.rating >= HIGH_RATING) : entries.slice();
}

export function sortEntries(entries: readonly Entry[], mode: SortMode): Entry[] {
  const list = entries.slice();
  if (mode === 'city') {
    list.sort(
      (a, b) =>
        a.city.localeCompare(b.city, 'id', { sensitivity: 'base' }) || b.createdAt - a.createdAt,
    );
  } else if (mode === 'rating') {
    list.sort((a, b) => b.rating - a.rating || b.createdAt - a.createdAt);
  } else {
    list.sort((a, b) => b.createdAt - a.createdAt);
  }
  return list;
}

/** Filter first, then sort the result. */
export function visibleEntries(
  entries: readonly Entry[],
  filter: FilterMode,
  sort: SortMode,
): Entry[] {
  return sortEntries(filterEntries(entries, filter), sort);
}
