# Data Model: Anjam v1.4.0 — Quality, Parity & Smarts

All persistent data stays in the existing two stores (IndexedDB `anjam` object
stores + `localStorage` `anjam.*` prefs). This document defines only what v1.4.0
adds or changes. **No new IndexedDB object store and no new Supabase table.**

---

## 1. `StudySlotRow` (CHANGED — the timetable loses clock times)

```ts
export interface StudySlotRow {
  id: string
  user_id: string
  subject_id: string | null
  weekday: number          // 0 = شنبه … 6 = جمعه (unchanged)
  period: number           // NEW: 1..12, position of the زنگ within that day
  start: string | null     // LEGACY, nullable (kept for old rows / back-compat)
  end: string | null       // LEGACY, nullable ("end" is a reserved word in SQL)
  room: string | null
  created_at: string
  updated_at: string
  deleted: boolean
}
```

**Invariants**

- `(user_id, weekday, period)` is unique among non-deleted rows (UI-level;
  the store de-dupes on write).
- `period >= 1 && period <= 12`.
- Rows with `period === null` (legacy) are migrated on first load; after
  migration every live row has a `period`.
- Nothing has a time component in the UI. `start`/`end` remain only so a backup
  exported from v1.3 restores into v1.4 without data loss.

**Per-day period count** is derived, not stored:

```ts
dayPeriodCount(weekday) = max(period of live rows on that weekday)  // 0 = none
```

The user sets the count explicitly through `setDayPeriods(weekday, n)`; setting
it **down** marks the removed periods' rows `deleted` (confirm-first), setting it
**up** only changes the rendered column count (empty cells are placeholders, no
rows yet).

### Client-side migration (idempotent)

```ts
// runs once per load, after store.load(), before Study renders
for each weekday:
  legacy = live rows on that weekday where period == null
  order legacy by (start ?? '00:00', created_at)
  legacy[i].period = i + 1     // updateStudySlot(...)
```

### Supabase migration (idempotent, additive)

```sql
alter table public.study_slots add column if not exists period int;
alter table public.study_slots alter column start  drop not null;
alter table public.study_slots alter column "end" drop not null;
create unique index if not exists study_slots_week_period
  on public.study_slots (user_id, weekday, period) where deleted = false;
```

RLS policy, realtime publication and the existing `study_slots_user_week`
index are untouched — the new unique index is *partial* so tombstones
(`deleted = true`) never collide.

---

## 2. `AdvisoryRule` (NEW — in-memory, no storage)

```ts
export type AdvisoryKind =
  | 'rain-soon' | 'snow-soon' | 'storm' | 'temp-drop' | 'freeze'
  | 'heat' | 'wind' | 'fog' | 'air'

export interface AdvisoryRule {
  id: AdvisoryKind
  severity: number                      // 0..3, highest wins
  matches(ctx: ForecastContext): boolean
  title: { fa: string; en: string }
  body:  { fa: string; en: string }
  icon: WeatherIconName
}
```

`ForecastContext` is derived from the extended `WeatherNow`:

```ts
export interface ForecastContext {
  now: Date
  temp: number
  lo: number                 // min temp until 08:00
  nextTemp: number           // temp at 08:00 (or closest hour)
  code: number               // WMO now
  upcomingCodes: number[]    // WMO codes for the next 24 h
  precipitationHours: number // hours with precipitation_probability >= 40
  precipitationPeak: number  // max probability %
  windPeak: number           // km/h
  tempDrop: number           // max(now - x) over upcoming hours
  aqi: number | null
}
```

**Dedupe**: `localStorage['anjam.advisory.seen']` =
`{ '2026-09-25': ['rain-soon', 'temp-drop'] }`. A rule is skipped if already
shown today; a *different* higher-severity rule may still show.

---

## 3. `ThemeDefinition` (NEW — static registry, no storage)

```ts
export type ThemeId = 'default' | 'ocean' | 'forest' | 'sunset' | 'mono' | 'royal'

export interface TokenSet {
  bg: string; surface: string; surface2: string; surface3: string
  border: string; text: string; muted: string
  accent: string; accentSoft: string; danger: string; ok: string; warn: string
  p1: string; p2: string; p3: string; p4: string
  shadow1: string; shadow2: string; radius: string
}

export interface ThemeDefinition {
  id: ThemeId
  name: { fa: string; en: string }
  light: TokenSet
  dark: TokenSet
}
```

Six themes; each defines **both** modes. Selection pref:
`localStorage['anjam.skin']` (absent = `default`).

### Variable theme (weather-reactive)

Not a seventh palette but a **runtime override layer**: when
`localStorage['anjam.skin'] === 'variable'`, `applyWeatherTheme(w)` sets
`--accent`, `--accent-soft`, `--bg`, `--surface*` from a small weather→token map
(clear-day / clear-night / rain / snow / storm / fog), cross-fading over 400 ms.
The active palette id is exposed as `data-weather-theme` for QA.

---

## 4. `BackupFile` (NEW)

```ts
export interface BackupFile {
  app: 'anjam'
  version: 2            // 1 = v1.3 exportJson() shape; 2 adds prefs
  exported_at: string
  prefs: Record<string, string>      // every localStorage key starting with 'anjam.'
  data: {
    tasks: TaskRow[]; lists: ListRow[]; labels: LabelRow[]
    habits: HabitRow[]; dates: ImportantDateRow[]
    subjects: StudySubjectRow[]; slots: StudySlotRow[]
    homework: HomeworkRow[]; studyLogs: StudyLogRow[]
    workoutPlans: WorkoutPlanRow[]; workoutLogs: WorkoutLogRow[]
  }
}
```

- **Export**: `version: 2`, `data` from the live store, `prefs` from every
  `anjam.*` localStorage key (excluding `anjam.auth` — the Supabase session
  token must never leave the device).
- **Validate before write**: `app === 'anjam'`, `version <= 2`, each table is an
  array, each row has a string `id`/`updated_at`. On any failure: show the error
  and **write nothing**.
- **Summary before restore**: per-table row counts, shown in a confirm dialog.
- **Restore**: write all rows through the same `idbPutMany` path used by sync so
  each restored row is queued for Supabase push; then reload.

---

## 5. `NewsItem` (NEW — transient, cached in localStorage)

```ts
export interface NewsItem {
  id: string            // sha1-ish of title+source
  title: string
  source: string        // display name of the feed
  url: string
  publishedAt: number   // epoch ms
  region: string        // normalized region the query used
  closure: boolean      // matcher verdict
  score: number         // 0..1 confidence from the matcher
}
```

Cache key: `anjam.news.cache` — `{ region, fetchedAt, items[] }`, TTL 6 h.
Acknowledged alert ids: `anjam.news.seen` (array, capped at 40).

---

## 6. Preference keys added in v1.4.0

| Key | Type | Meaning |
|-----|------|---------|
| `anjam.skin` | `ThemeId \| 'variable'` | selected theme |
| `anjam.advisory` | `'on' \| 'off'` | night weather advisory master switch (default on) |
| `anjam.advisory.seen` | JSON map | per-day rule dedupe |
| `anjam.news` | `'on' \| 'off'` | school-news monitor (default on) |
| `anjam.news.region` | string | override; empty = follow weather location |
| `anjam.news.seen` | JSON array | acknowledged alert ids |

All are read through the existing `appearance.ts` / `config.ts` accessors so a
backup picks them up automatically.
