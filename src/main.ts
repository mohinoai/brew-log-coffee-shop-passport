import {
  NOTES_MAX, type Draft, type Entry, type FieldErrors, type FilterMode, type SortMode,
  hasErrors, normalizeDraft, normalizeEntry, validateDraft, visibleEntries,
} from './domain';
import { loadEntries, saveEntries } from './storage';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const form = byId<HTMLFormElement>('entry-form');
const nameEl = byId<HTMLInputElement>('f-name');
const cityEl = byId<HTMLInputElement>('f-city');
const drinkEl = byId<HTMLInputElement>('f-drink');
const notesEl = byId<HTMLTextAreaElement>('f-notes');
const ratingGroup = byId('rating');
const starButtons = Array.from(ratingGroup.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
const fieldEls: Record<keyof Draft, HTMLElement> =
  { name: nameEl, city: cityEl, drink: drinkEl, rating: ratingGroup, notes: notesEl };
const errorSlots: Record<keyof Draft, HTMLElement> =
  { name: byId('e-name'), city: byId('e-city'), drink: byId('e-drink'), rating: byId('e-rating'), notes: byId('e-notes') };
const formError = byId('form-error');
const bootError = byId('boot-error');
const bootNotice = byId('boot-notice');
const live = byId('live-region');
const skeleton = byId('skeleton');
const loadingNote = byId('loading-note');
const grid = byId<HTMLUListElement>('grid');
const emptyState = byId('empty');
const filterEmptyState = byId('filter-empty');
const sortSelect = byId<HTMLSelectElement>('sort');
const filterButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter]'));
const stampCount = byId('stamp-count');
const notesCount = byId('notes-count');

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const FIELDS = Object.keys(errorSlots) as (keyof Draft)[];

let entries: Entry[] = [];
let filter: FilterMode = 'all';
let sortBy: SortMode = 'recent';
let rating = 0;
let freshId: string | null = null;
let pendingDelete: { id: string; button: HTMLButtonElement; label: string } | null = null;

// DOM helpers — textContent only, never innerHTML.

function el(parent: HTMLElement, tag: string, className = '', text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

const announce = (message: string) => { live.textContent = message; };
const starText = (value: number) => '★★★★★'.slice(0, value) + '☆☆☆☆☆'.slice(0, 5 - value);

// Rendering

function buildCard(entry: Entry, index: number): HTMLLIElement {
  const card = document.createElement('li');
  card.className = 'stamp' + (entry.id === freshId ? ' is-fresh' : '');
  card.dataset.id = entry.id;
  card.style.setProperty('--tilt', `${((index % 3) - 1) * 0.85}deg`);

  const head = el(card, 'div', 'stamp-head');
  el(head, 'p', 'stamp-name', entry.name);
  el(head, 'p', 'stamp-city', entry.city);

  const ratingLine = el(card, 'p', 'stamp-rating');
  el(ratingLine, 'span', 'stamp-stars', starText(entry.rating)).setAttribute('aria-hidden', 'true');
  el(ratingLine, 'span', 'sr-only', `Rating ${entry.rating} dari 5 bintang`);

  const drinkLine = el(card, 'p', 'stamp-line');
  el(drinkLine, 'span', 'k', 'Pesanan');
  el(drinkLine, 'span', 'v', entry.drink);
  el(card, 'p', 'stamp-notes', entry.notes);

  const foot = el(card, 'div', 'stamp-foot');
  el(foot, 'p', 'stamp-date', dateFormat.format(new Date(entry.createdAt)));
  const remove = el(foot, 'button', 'btn-del', 'Hapus') as HTMLButtonElement;
  remove.type = 'button';
  remove.setAttribute('aria-label', `Hapus cap ${entry.name}`);

  el(card, 'p', 'alert alert-danger card-error');
  return card as HTMLLIElement;
}

function render(): void {
  stampCount.textContent = String(entries.length);
  const list = visibleEntries(entries, filter, sortBy);
  grid.replaceChildren(...list.map(buildCard));
  grid.hidden = list.length === 0;
  emptyState.hidden = entries.length > 0;
  filterEmptyState.hidden = entries.length === 0 || list.length > 0;
  freshId = null;
  pendingDelete = null;
}

function paintErrors(errors: FieldErrors): void {
  for (const key of FIELDS) {
    const message = errors[key] ?? '';
    errorSlots[key].textContent = message;
    fieldEls[key].setAttribute('aria-invalid', message ? 'true' : 'false');
  }
}

// Rating radiogroup: roving tabindex, arrows + Home/End, Enter/Space via native button click.

function setRating(value: number, moveFocus = false): void {
  rating = value;
  starButtons.forEach((button, index) => {
    const selected = index + 1 === value;
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
    button.tabIndex = selected || (value === 0 && index === 0) ? 0 : -1;
    button.classList.toggle('is-on', index < value);
  });
  errorSlots.rating.textContent = '';
  ratingGroup.setAttribute('aria-invalid', 'false');
  if (moveFocus && value > 0) starButtons[value - 1]?.focus();
}

starButtons.forEach((button, index) => button.addEventListener('click', () => setRating(index + 1)));

ratingGroup.addEventListener('keydown', (event) => {
  const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const key = (event as KeyboardEvent).key;
  const delta = step[key];
  const next = delta !== undefined
    ? Math.min(5, Math.max(1, rating + delta))
    : key === 'Home' ? 1 : key === 'End' ? 5 : 0;
  if (!next) return;
  event.preventDefault();
  setRating(next, true);
});

// Add entry — validate, then save; state and render only move when the write succeeded.

form.addEventListener('submit', (event) => {
  event.preventDefault();
  formError.textContent = '';

  const draft = normalizeDraft({
    name: nameEl.value, city: cityEl.value, drink: drinkEl.value, rating, notes: notesEl.value,
  });
  const errors = validateDraft(draft);
  paintErrors(errors);

  if (hasErrors(errors)) {
    const first = FIELDS.find((key) => errors[key]);
    if (first) fieldEls[first].focus();
    announce('Form belum lengkap. Periksa kolom yang ditandai merah.');
    return;
  }

  const now = Date.now();
  const entry = normalizeEntry({ ...draft, createdAt: now }, now, `c${now.toString(36)}`);
  if (!entry) {
    formError.textContent = 'Entri tidak valid — coba periksa isian lagi.';
    return;
  }

  const updated = [entry, ...entries];
  const result = saveEntries(updated);
  if (!result.ok) {
    formError.textContent = 'Gagal menyimpan ke penyimpanan browser — coba lagi.';
    announce('Gagal menyimpan entri. Data belum tersimpan.');
    return;
  }

  entries = updated;
  freshId = entry.id;
  render();
  form.reset();
  setRating(0);
  paintErrors({});
  notesCount.textContent = `0/${NOTES_MAX} karakter`;
  announce(`${entry.name} dicap di paspor. Total ${entries.length} kafe.`);
  nameEl.focus();
});

// Delete entry — two-step confirmation, same save-then-commit pattern as adding.

function cancelDelete(): void {
  if (!pendingDelete) return;
  pendingDelete.button.textContent = 'Hapus';
  pendingDelete.button.classList.remove('is-confirm');
  pendingDelete.button.setAttribute('aria-label', `Hapus cap ${pendingDelete.label}`);
  pendingDelete = null;
}

grid.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.btn-del');
  if (!button) return;
  const card = button.closest<HTMLLIElement>('li');
  const id = card?.dataset.id;
  const entry = entries.find((item) => item.id === id);
  if (!card || !id || !entry) return;

  if (pendingDelete?.id !== id) {
    cancelDelete();
    button.textContent = 'Yakin hapus?';
    button.classList.add('is-confirm');
    button.setAttribute('aria-label', `Konfirmasi hapus cap ${entry.name}`);
    pendingDelete = { id, button, label: entry.name };
    announce(`Konfirmasi hapus ${entry.name}. Tekan lagi untuk menghapus, Escape untuk batal.`);
    return;
  }

  const updated = entries.filter((item) => item.id !== id);
  const result = saveEntries(updated);
  if (!result.ok) {
    const slot = card.querySelector('.card-error');
    if (slot) slot.textContent = 'Gagal menghapus — penyimpanan menolak. Coba lagi.';
    announce('Gagal menghapus entri. Data tidak berubah.');
    return;
  }

  entries = updated;
  render();
  announce(`${entry.name} dihapus dari paspor. Sisa ${entries.length} kafe.`);
});

document.addEventListener('click', (event) => {
  if (!(event.target as HTMLElement).closest('.btn-del')) cancelDelete();
});
document.addEventListener('keydown', (event) => {
  if ((event as KeyboardEvent).key === 'Escape') cancelDelete();
});

// Filter + sort

function setFilter(mode: FilterMode): void {
  filter = mode;
  for (const button of filterButtons) {
    const on = button.dataset.filter === mode;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
  }
  render();
  announce(
    !filterEmptyState.hidden
      ? 'Tidak ada kafe dengan rating 4 bintang ke atas.'
      : mode === 'high'
        ? `Menampilkan ${grid.childElementCount} kafe rating 4 bintang ke atas.`
        : `Menampilkan semua ${entries.length} kafe.`,
  );
}

filterButtons.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter as FilterMode)));

sortSelect.addEventListener('change', () => {
  sortBy = sortSelect.value as SortMode;
  render();
  announce(`Koleksi diurutkan: ${sortSelect.options[sortSelect.selectedIndex]?.text ?? ''}.`);
});

byId('reset-filter').addEventListener('click', () => {
  setFilter('all');
  filterButtons[0]?.focus();
});
byId('empty-cta').addEventListener('click', () => nameEl.focus());
notesEl.addEventListener('input', () => {
  notesCount.textContent = `${notesEl.value.length}/${NOTES_MAX} karakter`;
});

// Boot — the skeleton stays up until a real async read resolves.

/** Resolves only after the browser has actually painted the skeleton (two real frames). */
function readStored(): Promise<ReturnType<typeof loadEntries>> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(loadEntries())));
  });
}

async function boot(): Promise<void> {
  const result = await readStored();
  skeleton.hidden = true;
  loadingNote.hidden = true;

  if (!result.ok) {
    bootError.textContent =
      'Paspor tersimpan tidak bisa dibaca — datanya rusak. Koleksi dimulai kosong; cap baru akan menimpa data lama.';
    announce('Data paspor tersimpan gagal dibaca.');
    entries = [];
    render();
    return;
  }

  const now = Date.now();
  const parsed = result.raw.map((row, i) => normalizeEntry(row, now, `r${now.toString(36)}${i}`));
  entries = parsed.filter((entry): entry is Entry => entry !== null);
  const skipped = parsed.length - entries.length;
  if (skipped > 0) bootNotice.textContent = `${skipped} entri lama tidak bisa dibaca dan dilewati.`;
  render();
}

void boot();
