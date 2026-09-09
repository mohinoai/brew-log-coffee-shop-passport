# Coffee Shop Passport — Brew Log

Paspor kafe pribadi: tiap kafe dapat satu "cap" — nama, kota, minuman, rating bintang, catatan
rasa/vibe. Tersimpan di `localStorage`. Vite + TypeScript vanilla, tanpa framework.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit test domain (vitest)
npm run build    # typecheck + build
```

## Arsitektur

- `src/domain.ts` — fungsi murni: `normalizeDraft`, `validateDraft`, `normalizeEntry`,
  `filterEntries`, `sortEntries`, `visibleEntries`. Tidak menyentuh DOM/storage; waktu dan id masuk
  sebagai parameter.
- `src/storage.ts` — `loadEntries()` dan `saveEntries()`: dua fungsi publik independen, tidak
  saling memanggil, masing-masing punya `try/catch`, mengembalikan `{ ok }` bukan melempar.
- `src/main.ts` — wiring DOM: render kartu pakai `textContent`, state filter/sort, boot async.
- `index.html` — kerangka statis: header, form + slot error per field, filter/sort bar, skeleton,
  empty/filter-empty state, skip link.

Satu gerbang validasi: entri dari form **dan** baris dari storage sama-sama lewat `normalizeDraft` +
`validateDraft`. Baris yang gagal validasi dihitung dan dilaporkan ke user, bukan dibuang diam-diam.

Pola tulis identik di **kedua** jalur (tambah & hapus): `saveEntries()` dulu, kalau gagal isi slot
error milik aksi itu lalu `return` — state dan render tidak bergerak. Region error ada di DOM sejak
page load, disembunyikan lewat CSS `.alert:empty` / `.err:empty`, tidak pernah di-`hidden` oleh JS.

Loading: `boot()` async menunggu `readStored()`, `Promise` yang resolve setelah dua
`requestAnimationFrame` — skeleton dijamin ter-paint dulu. Bukan `setTimeout` durasi tetap.

## Cara memicu tiap error state

Jalankan di console DevTools; reload untuk memulihkan `setItem`.

```js
// 1. Read failure — pesan page-level terpisah, dipicu dari jalur boot()
localStorage.setItem('coffee-passport-entries', '{bukan json['); location.reload();

// 2. Baris korup dilewati — notice terpisah dari read failure
localStorage.setItem('coffee-passport-entries', JSON.stringify([{id:'bad',rating:9}, 'rusak']));
location.reload();

// 3 & 4. Write failure — lalu submit form (pesan di slot form), atau klik "Hapus" dua kali pada
//        satu kartu (pesan di dalam kartu). Data lama tidak berubah.
Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError'); };
```

5. Error validasi — submit form kosong: pesan inline di bawah tiap field + `aria-invalid="true"`.

## Aksesibilitas

- Skip link muncul pada Tab pertama; landmark `header` / `main` / `section aria-labelledby`.
- Rating: `role="radiogroup"` berisi `<button role="radio">` berlabel "1 bintang"–"5 bintang", penuh
  keyboard (←/→/↑/↓, Home, End, Enter/Space) dengan roving tabindex.
- Hapus pakai konfirmasi dua langkah, tidak bergantung `:hover`; Escape atau klik di luar membatalkan.
- `#live-region` (`aria-live="polite"`) mengumumkan tambah, hapus, filter kosong, gagal simpan.
- Focus ring terlihat di semua kontrol, termasuk tombol hapus di dalam kartu. Mobile-first, satu
  kolom di ≤375px tanpa scroll horizontal; light dan dark lolos WCAG AA 4.5:1.

## Ukuran repo

Semua file yang di-commit di bawah 40 KB — cek: `git ls-files | xargs wc -c | tail -1`.
