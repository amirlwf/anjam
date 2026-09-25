# Feature Specification: Anjam v1.4.0 — Quality, Parity & Smarts

**Feature Branch**: `001-v140-quality-parity`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "مشکلات اندروید و دسکتاپ: لوگو بزرگ‌تر شود؛ هشدار هوشمند آب‌وهوا بین ساعت ۹ شب تا ۸ صبح (پاپ‌آپ فقط وقتی خطری هست)؛ برنامه درسی بدون ساعت و روز — فقط تعداد زنگ در هر روز + درس هر زنگ؛ UI اندروید با انیمیشن‌های روان و تم‌های جدید با جزئیات بیشتر + تم متغیر بر اساس آب‌وهوا؛ باگ اسکرول و دکمه + و ریسپانسیو نبودن باکس‌ها در اندروید؛ اخبار مدارس از چند منبع معتبر مرتبط با موقعیت انتخابی کاربر با پاپ‌آپ ساعت ۹ شب در صورت احتمال تعطیلی؛ UI در حد صافی و زیبایی اپل؛ بک‌آپ محلی و بازیابی؛ کیفیت مهم‌تر از حجم اپ. همچنین روش Spec Kit (github/spec-kit) روی همین پروژه اعمال شود."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Android is actually usable: scrolling, + button, layout (Priority: P1)

On a phone, the user opens any view (today, study, routine, dates, workout, all
tasks) and the content scrolls with a normal swipe — no dead zones, no trapped
scroll containers, no content that can only be reached by scrolling a parent
that does not respond. The floating **+** button works on every view: it either
focuses the inline composer or opens a quick-add composer that works right
there. Boxes and cards reflow at 360 px width with no horizontal overflow.

**Why this priority**: The owner reported these as actual bugs on a real device.
Until they are fixed, every other improvement is invisible on Android — this is
the gate for the whole release.

**Independent Test**: Open the built APK at 360×740 (and desktop at 1280×800),
visit all 12 views, swipe each one end to end, tap **+** in each view and confirm
a composer appears/focuses, and confirm `document.scrollingElement.scrollWidth
<= innerWidth` on every view.

**Acceptance Scenarios**:

1. **Given** the study view is open on Android, **When** the user swipes up on the content area, **Then** the view scrolls smoothly to the bottom without needing a second gesture and without the page behind it moving.
2. **Given** any non-task view (routine, dates, study, workout) is open, **When** the user taps the **+** FAB, **Then** a working quick-add composer opens (modal) and a typed task is created with Enter.
3. **Given** a 360 px wide viewport on any view, **When** the view renders, **Then** no element overflows horizontally (`scrollWidth <= clientWidth`) and no control is clipped or smaller than 44 px tall.
4. **Given** the desktop app at 1280 px, **When** the same views are visited, **Then** they behave identically to Android (platform parity).

---

### User Story 2 — Night weather advisory, 21:00 → 08:00 (Priority: P1)

Between **21:00 and 08:00 local time**, while the app is open, Anjam evaluates
the weather (current + next 24 h forecast for the saved location) and shows **one**
in-app popup with a concrete warning — and stays silent when there is nothing to
warn about. All condition types are covered: rain/snow in the next hours or
tomorrow, a sudden temperature drop, extreme heat, strong wind, fog, thunderstorm
/hail, and poor air quality. The advice is chosen by severity (worst wins), written
like a human in both languages, and never repeats the same rule twice in a row.

**Why this priority**: Explicitly requested on both platforms; it is the app's
"looks after you" moment and depends only on the existing keyless weather stack.

**Independent Test**: With a faked forecast (QA hook) force each rule and confirm
exactly one popup with the expected Persian text appears inside the window, and
that a clear forecast produces **no** popup; then fake the clock outside the
window and confirm silence.

**Acceptance Scenarios**:

1. **Given** the local time is 22:30 and tomorrow's forecast is rain, **When** the advisory runs, **Then** a popup is shown saying (fa) «فردا بارون میاد — چتر را فراموش نکن» with an icon and a dismiss button.
2. **Given** the temperature will drop by ≥ 6 °C before morning, **When** the advisory runs, **Then** the popup advises dressing warmer (fa: «هوای سرد میشه — لباس گرم‌تر بپوش»).
3. **Given** the forecast is clear and mild, **When** the advisory runs at 22:00, **Then** no popup is shown at all.
4. **Given** the local time is 12:00, **When** the advisory logic runs, **Then** nothing is evaluated or shown (outside 21:00–08:00).
5. **Given** the same rule already produced a popup today, **When** the advisory runs again, **Then** it does not repeat that rule (dedupe per rule per day).
6. **Given** the device is offline, **When** the advisory runs, **Then** it uses cached/last-known data or stays silent — never shows an error.

---

### User Story 3 — Period-based weekly study timetable (Priority: P1)

The timetable has **no clock times**. The user sets how many periods (زنگ) each
day has, then assigns a subject to each period of each day. The resulting grid
(روز × زنگ) is the weekly program. Old time-based entries are migrated, never
lost.

**Why this priority**: Replaces a core school workflow with the exact model the
owner described; blocks nothing else but must land before the UI freeze.

**Independent Test**: Configure 6 periods for شنبه and 5 for یکشنبه, fill the
grid with subjects, reload, and confirm the same grid appears with no time inputs
anywhere; confirm an old `start/end` row still renders as a period.

**Acceptance Scenarios**:

1. **Given** the study → timetable tab, **When** the user changes a day's period count, **Then** that day's column count changes immediately (1..12) and empty periods show a placeholder, not an error.
2. **Given** a period cell, **When** the user picks a subject, **Then** the cell shows the subject with its colour and persists across reload and across devices (sync).
3. **Given** a timetable created in v1.3 with `start`/`end` times, **When** the app loads after the upgrade, **Then** rows are converted to periods by their time order per weekday and nothing is deleted.
4. **Given** the timetable, **When** the schema changes, **Then** `supabase/schema.sql` stays idempotent and `python scripts/sql-lint.py supabase/schema.sql` prints `PARSE_OK`.

---

### User Story 4 — Apple-grade UI: bigger logo, richer themes, weather-reactive theme, smooth motion (Priority: P2)

The logo is large enough to be recognized everywhere it appears (sidebar, mobile
drawer, auth, setup, boot splash, alarm screen). The app ships a set of detailed
themes — each a full token set for light **and** dark — plus an optional
**variable theme** that re-tints the whole app from the current weather (rain →
cool blue, snow → icy, clear → warm, night → deep indigo, storm → violet) with a
soft cross-fade. Motion follows shared spring/easing tokens so screens feel as
polished as Apple's first-party apps.

**Why this priority**: The owner's central demand ("کیفیت می‌خوام") and the
visible differentiator; it depends on the P1 fixes not to mask broken basics.

**Independent Test**: In settings, switch through every theme in both light and
dark and confirm every surface (sidebar, cards, chips, modals, weather chip,
timer) follows the tokens with no stray hex colour; enable the variable theme,
fake the weather to rain/snow/clear, and confirm the palette changes with a
400 ms cross-fade.

**Acceptance Scenarios**:

1. **Given** any screen in light theme, **When** a dark theme is selected, **Then** every element is legible (contrast ≥ 4.5:1 for body text) with no white-on-white or dark-on-dark surfaces.
2. **Given** the variable theme is on and the weather is rain, **When** the weather refreshes, **Then** the accent/background shift to the rain palette within one smooth transition and the status-bar/theme-color meta follows.
3. **Given** `prefers-reduced-motion` or `data-motion="off"`, **When** any screen renders, **Then** all animations are disabled (instant state changes).
4. **Given** the sidebar, mobile drawer, auth, setup, boot and alarm screens, **When** viewed, **Then** the logo is rendered at ≥ 48 px on its longest side and is not pixelated or cropped.

---

### User Story 5 — Local backup and emergency restore (Priority: P2)

The user can export a complete local backup (all data **and** preferences: theme,
language, sections, weather location, alarms/news settings) to a file, and later
import it to restore everything — including on a freshly installed copy, with or
without a Supabase account.

**Why this priority**: Data safety (constitution principle V); independent of all
other stories.

**Independent Test**: Export → delete all data → import → compare row counts and
prefs against the exported file; the diff must be empty.

**Acceptance Scenarios**:

1. **Given** the settings → backup section, **When** the user taps export on desktop, **Then** a file `anjam-backup-YYYY-MM-DD.json` downloads containing every table plus prefs.
2. **Given** Android, **When** the user taps export, **Then** the file is handed to the system share/save flow (or clipboard fallback) — not a silent no-op.
3. **Given** a backup file, **When** the user imports it, **Then** a confirmation dialog shows what will be restored (row counts) and, after confirming, every row and preference is back and queued for sync.
4. **Given** a corrupt or foreign JSON file, **When** imported, **Then** a clear error is shown and **nothing** is overwritten.

---

### User Story 6 — Location-aware school news with a 21:00 closure alert (Priority: P3)

Anjam watches several reputable Persian news sources for school news **for the
region the user picked for weather** (default: البرز / ساوجبلاغ / هشتگرد). At
21:00 every day it evaluates the last 24 h of headlines and, **only if** a
credible closure/cancellation signal exists, shows a popup in the same style as
the weather advisory, with the headline and source. Otherwise it stays silent.

**Why this priority**: Requested explicitly, but it depends on external feeds —
it must never be able to break the app (constitution VI), so it ships last.

**Independent Test**: Feed the matcher a set of real headlines (one closure, one
routine) and confirm the popup fires only for the closure one, at 21:00, for the
configured region only.

**Acceptance Scenarios**:

1. **Given** the weather location is «کرج», **When** news runs, **Then** queries target کرج/البرز school news; when the user changes the location to «شیراز», **Then** queries target شیراز and nothing from کرج is shown.
2. **Given** a headline «مدارس البرز فردا تعطیل شد», **When** the 21:00 evaluation runs, **Then** one popup shows the headline, source name and time.
3. **Given** only routine headlines (no closure signal), **When** 21:00 arrives, **Then** no popup is shown.
4. **Given** every feed is unreachable, **When** 21:00 arrives, **Then** nothing is shown and no error popup appears (silent degradation).
5. **Given** at least two sources are configured, **When** the primary fails, **Then** the fallback source is used automatically.

### User Story 7 — An AI that advises on my data, not a chatbot (Priority: P3)

The user can optionally connect **their own OpenRouter API key** and pick any
**free** model from a live list, then get four non-chat analyses of their own
data: a **day plan** (which task in which free period, with time boxes), a
**timetable sanity check** (overloaded days, back-to-back subjects, too few
periods), a **backlog triage** (do today / defer / drop with a one-line reason),
and a **weekly review** (what went well, what slipped, one change for next
week). There is no chat window, no user persona, no profile building. Everything
is computed from the app's own local data, works offline with a deterministic
local fallback, and sends only a minimal, privacy-safe payload.

**Why this priority**: Explicitly requested as an idea, and it is additive — the
app is fully usable with the feature off. It must never become a hard dependency
or a privacy leak.

**Independent Test**: With a fake key and a stubbed OpenRouter response, each of
the four panels renders the returned analysis; with no key, no network, or a 429
from the free tier, each panel renders the local deterministic result and an
honest one-line note — never an error dialog.

**Acceptance Scenarios**:

1. **Given** settings → AI, **When** the user opens the model list, **Then** only models priced `0/0` on OpenRouter are offered (live list, cached 24 h, refreshable).
2. **Given** a key + model + today's tasks, **When** the user opens "Day plan", **Then** an ordered plan appears; with the network blocked, a locally-computed plan appears instead.
3. **Given** a 429 / model-unavailable response, **When** an analysis runs, **Then** the panel falls back locally and suggests another free model once.
4. **Given** the AI feature, **When** any request is made, **Then** only task titles of the current view, counts, and the timetable shape are sent — no notes, no email, no Supabase token, and the key is stored only on the device.
5. **Given** AI is enabled, **When** the user browses the app, **Then** nothing blocks, no chat UI exists, and no request is made unless a panel is opened.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-01**: The floating **+** button must be operable from every view on Android and desktop, producing a usable composer each time.
- **FR-02**: Each view must scroll with a single touch swipe on Android WebView; no nested scroll trap may block it.
- **FR-03**: All layout containers must be fluid between 360 px and 1440 px with zero horizontal overflow.
- **FR-04**: The weather advisory engine runs only between 21:00:00 and 07:59:59 local time, at most once per hour, plus on app wake/visibility.
- **FR-05**: The advisory engine must model every relevant condition class: precipitation (rain/drizzle/sleet/snow/showers/thunder+hail), temperature shock (drop ≥ 5 °C or feels-like ≤ 4 °C), heat (≥ 35 °C), wind (≥ 40 km/h), fog/visibility, and air quality; exactly one message (highest severity) is shown per run.
- **FR-06**: Advisory messages must be authored per condition and per language (fa/en), sound natural, and include an actionable clause.
- **FR-07**: The timetable model is `(weekday, period_index, subject_id)` with a per-day period count of 1–12 and **no** clock-time fields in the UI.
- **FR-08**: Existing `study_slots` rows with `start`/`end` must migrate to periods deterministically (order by `start` within a weekday); the migration runs client-side and is idempotent.
- **FR-09**: The Supabase schema change must be additive and idempotent, pass `scripts/sql-lint.py`, and keep realtime publication + RLS policies intact.
- **FR-10**: The logo must appear at ≥ 48 px (longest side) in: desktop sidebar, mobile drawer, auth, setup, boot splash, alarm/full-screen ring.
- **FR-11**: The app must ship at least 6 selectable themes, each a complete token set for light **and** dark, with no hardcoded colours left outside the token layer.
- **FR-12**: A "variable theme" mode must derive its palette from the current weather condition and day/night state, persist the choice, and re-apply after every weather refresh.
- **FR-13**: All motion must go through shared tokens (`--ease-out`, `--dur-*`, `--spring`), stay within 150–420 ms, animate transform/opacity only, and be fully disabled by reduced-motion.
- **FR-14**: Backup export must include every table **and** all preference keys (`anjam.*` localStorage + IndexedDB meta), versioned for forward compatibility.
- **FR-15**: Backup import must validate before writing, show a restore summary, require explicit confirmation, and be atomic from the user's point of view.
- **FR-16**: News monitoring must use ≥ 2 independent sources and resolve its region from the saved weather location, with a user override in settings and a default of البرز/ساوجبلغ/هشتگرد.
- **FR-17**: The closure alert fires only in the 21:00 evaluation (plus a one-time re-show of an unacknowledged alert on next app open within 12 h), never more than once per alert id.
- **FR-18**: Every new user-facing string must exist in both `fa` and `en` dictionaries.
- **FR-19**: All network features must cache and fail silently; no routine network error may produce a popup.
- **FR-20**: The QA harness must be extended to cover the new behaviours and must end with `failed:[]`.

### Key Entities (existing + new)

- **StudySlot** (changed): `weekday`, **`period`** (new, 1-based), `subject_id`, `room` (kept, nullable), audit columns. `start`/`end` become nullable legacy columns.
- **AdvisoryRule** (new, in-memory/config): `{ id, severity, when(state) → message keys }`.
- **ThemeDefinition** (new): `{ id, name_fa, name_en, light: TokenSet, dark: TokenSet }`.
- **BackupFile** (new): `{ app: 'anjam', version, exported_at, prefs: {...}, data: { table: rows[] } }`.
- **NewsItem** (new): `{ id, title, source, url, publishedAt, region, score }`.

### Assumptions

- The user's chosen weather location **is** their region for news (explicit user requirement); it can be overridden in settings.
- "پاپ‌آپ" means the same in-app modal/toast style already used elsewhere; native OS notifications are a bonus, not a requirement.
- No user account is required for weather, news, or backup (keyless, local).

## Success Criteria *(mandatory)*

- **SC-01**: On a 360×740 Android WebView, all 12 views scroll in one gesture and **+** works in all 12; measured by the QA harness, `failed:[]`.
- **SC-02**: Zero horizontal overflow at 360 px on every view (asserted in QA).
- **SC-03**: For each of the 6+ weather condition classes, exactly one correct popup is produced in-window and none out-of-window (asserted in QA with a faked clock/forecast).
- **SC-04**: A v1.3 timetable loads as a period grid with no data loss; `PARSE_OK` from the SQL lint.
- **SC-05**: All 6 themes render both modes with no untracked hex colours in `src/styles.css` outside token definitions.
- **SC-06**: Export → wipe → import restores 100 % of rows and preferences (scripted before/after diff).
- **SC-07**: With the region set to a city, only that city's news is queried; a closure headline produces exactly one 21:00 popup.
- **SC-08**: `npm run build` clean, APK signed + `apksigner verify` exit 0, Electron installer built, all pushed.

## Edge Cases

- Clock crossing 08:00 while the popup is open → the popup stays until dismissed (no auto-kill mid-read), but no new evaluation starts.
- Device timezone change → window re-evaluated on next tick using local time.
- No saved location → weather falls back to Tehran (existing behaviour); news falls back to the default region.
- Legacy timetable rows with identical `start` times → tie-broken by `created_at`.
- Backup file from a newer app version → refuse with a clear message.
- Both weather advisory and news alert due at 21:00 → queue them (max two), never overlap; news renders second.

## Non-Goals (out of scope for v1.4.0)

- Push/server-side notifications (no backend exists).
- Teacher/period substitution scheduling, room conflict detection.
- News article full-text reading inside the app (headlines + source link only).
- Redesigning the task model, sync protocol, or alarm engine.
