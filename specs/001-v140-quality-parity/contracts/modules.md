# Contracts: Anjam v1.4.0 feature modules

Pure TypeScript modules, no framework types except `Lang` and the weather
types. All fetches: keyless, timeout-bounded, silent on failure.

---

## `src/lib/advisory.ts` — night weather advice (FR-04…FR-06, FR-19)

```ts
import type { Lang } from '../types'
import type { ForecastContext } from './advisory'
import type { WeatherIconName, WeatherNow } from './weather'

/** 21:00 -> 08:00 local, inclusive start, exclusive end. */
export function inNightWindow(now: Date): boolean

/** Highest-severity matching rule for this context, or null = stay silent. */
export function pickRule(ctx: ForecastContext): {
  id: string; title: { fa: string; en: string }
  body: { fa: string; en: string }; icon: WeatherIconName
} | null

/** Pure text builders (unit-tested without DOM). */
export function advisoryText(ruleId: string, ctx: ForecastContext, lang: Lang): {
  title: string; body: string
}

/** Dedupe + rate-limit gate. Returns true when the popup should be shown. */
export function shouldShow(ruleId: string, now: Date): boolean

/** Scheduler: tick on interval + visibility; no-op outside the window. */
export function startAdvisoryLoop(opts: {
  getWeather: () => Promise<WeatherNow | null>
  onShow: (rule: NonNullable<ReturnType<typeof pickRule>>) => void
  intervalMs?: number          // default 60_000
}): () => void

/** QA hook: force an evaluation with a fabricated context. */
export function __advisoryEval(ctx: ForecastContext, now: Date, lang: Lang): {
  shown: boolean; ruleId: string | null; title: string; body: string
}
```

**Rules** (severity 3 = urgent, 0 = mild; highest wins):

| id | fires when | fa body (example) |
|----|-----------|-------------------|
| `storm` | any upcoming code 95/96/99 | «طوفان و رعد و برق در راهه — تا فردا صبح بیرون نرو» |
| `freeze` | `temp <= 2 && (snow\|sleet\|freeze-drizzle in upcoming)` | «هوا زیر صفره و یخ میزنه — مواظب جاده و سکوی چوبی باش» |
| `snow-soon` | `precipitationPeak >= 40 && any snow code` | «فردا برف میاد — کفش و لباس گرم و شال بردار» |
| `rain-soon` | `precipitationPeak >= 40 && any rain/drizzle/showers code` | «فردا بارون میاد — چتر یادت نره» |
| `temp-drop` | `tempDrop >= 5` | «هوا ناگهانی سرد میشه — لباس گرم‌تر بپوش» |
| `heat` | `temp >= 35` | «هوا خیلی گرمه — آب کافی بخور و بیرون نرو» |
| `wind` | `windPeak >= 40` | «باد شدید میزنه — حواست به در و شیشه و درخت‌ها باشه» |
| `fog` | `code in 45/48` or visibility < 1 km | «مه شدیده — رانندگی و راه رفتن توی جاده مراقب باش» |
| `air` | `aqi >= 150` | «هوا آلوده‌ست — ماسک بزن و پنجره رو باز نکن» |

**Window rule**: exactly one popup per (rule, day). A *new* higher-severity rule
may replace an already-shown milder one once; it never downgrades.

---

## `src/lib/news.ts` — location-aware school news (FR-16…FR-19)

```ts
export interface NewsSource {
  id: string
  name: { fa: string; en: string }
  buildUrl(region: string): string
  /** Fetch + parse to NewsItem[]; must throw only on hard failure. */
  load(region: string, signal: AbortSignal): Promise<NewsItem[]>
}

export interface Region {
  key: string            // 'alborz' | 'shiraz' | 'tehran' | 'custom:<name>'
  nameFa: string
  nameEn: string
  /** extra query terms in Persian (school, closure, snow…). */
  terms: string[]
}

export const SOURCES: NewsSource[]   // >= 2, ranked primary → fallback

/** Region from the saved weather location (or the user override). */
export function regionFromLocation(place: string, override: string | null): Region

/** All source queries for a region, deduped by URL. */
export function queriesFor(region: Region): Array<{ sourceId: string; url: string }>

/** Parse an RSS 2.0 / Atom XML document into items (DOMParser only). */
export function parseFeed(xml: string, source: NewsSource, region: Region): NewsItem[]

/** Keyword matcher; conservative, returns items whose score >= threshold. */
export function matchClosure(items: NewsItem[], region: Region): NewsItem[]

/** Multi-source fetch with per-source timeout, primary→fallback, cache. */
export async function fetchSchoolNews(region: Region, force = false): Promise<NewsItem[]>

/** 21:00 gate + dedupe; returns an unacknowledged alert or null. */
export function pendingAlert(items: NewsItem[], now: Date): NewsItem | null

export function startNewsLoop(opts: {
  getRegion: () => Region
  onShow: (item: NewsItem) => void
  intervalMs?: number           // default 60_000
}): () => void
```

**Region resolution** (explicit user requirement): the region comes from the
**weather location the user already chose** (e.g. «کرج» → Alborz terms,
«شیراز» → Shiraz terms), with `anjam.news.region` as an explicit override and
Alborz (ساوجبلاغ / هشتگرد) as the default. Region names are matched with a
normalized (ZWNJ-stripped, ی/ي, ک/ك-folded) comparison so «کرج», «كرج» and
«کرج‌» all resolve to Alborz.

**Closure matcher keywords** (fa): `تعطیلی مدارس`, `مدارس تعطیل`, `تعطیل مدارس`,
`آغاز تعطیلی`, `تعطیلی به دلیل`, `بارش برف`, `برف می‌بارد`, `تعلیق مدارس`,
`امتحانات` (exam schedule ⇒ closure notice). Negation guard: a headline that
contains `تعطیل نیست` / `تعطیل نخواهد شد` is excluded.

---

## `src/lib/backup.ts` — export / import (FR-14, FR-15)

```ts
export interface BackupSummary {
  version: number
  exportedAt: string | null
  counts: Record<string, number>
  prefs: number
  total: number
}

export function buildBackup(): BackupFile            // version 2
export function downloadBackup(): void              // anchor + object URL
export function copyBackup(): Promise<string>       // clipboard fallback (Android)
export function parseBackup(text: string): BackupFile  // throws on invalid
export function summarize(b: BackupFile): BackupSummary
export async function restoreBackup(b: BackupFile): Promise<BackupSummary>
```

- `parseBackup` is strict: wrong `app`, `version > 2`, non-array table, or a row
  without string `id`/`updated_at` throws a typed `BackupError` with a message
  key suitable for `t(lang, …)`.
- `restoreBackup` writes rows via the sync-aware `idbPutMany` path (so restored
  data reaches other devices), then rewrites prefs, then returns the summary.
  **Nothing is written before every table has passed validation.**

---

## `src/lib/themes.ts` — theme registry + variable theme (FR-11, FR-12)

```ts
export const THEMES: ThemeDefinition[]        // 6 themes, light + dark each
export function getTheme(id: string | null): ThemeDefinition
export function skinPref(): ThemeId | 'variable'
export function applySkin(id: ThemeId | 'variable'): void
/** Weather -> token overrides; sets data-weather-theme for QA. */
export function applyWeatherTheme(w: WeatherNow | null): void
export function onSkinChange(fn: () => void): () => void
```

`applySkin('variable')` installs the weather-driven layer; every weather refresh
(including the 20-minute TTL refresh in `WeatherChip`) calls
`applyWeatherTheme`. Cross-fade: 400 ms, `color` + `background-color` only,
disabled under reduced-motion.
