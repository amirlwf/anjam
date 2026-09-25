---
description: "Task list for Anjam v1.4.0 — Quality, Parity & Smarts"
---

# Tasks: Anjam v1.4.0 — Quality, Parity & Smarts

**Input**: Design documents in `specs/001-v140-quality-parity/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/modules.md, quickstart.md

**Tests**: tests are included — the user asked for «مو به مو، ریز به ریز، با تست و دیباگ»، and
FR-20 requires the QA harness to end with `failed:[]`. Every user story below therefore
starts with harness tasks that must FAIL before implementation.

**Organization**: grouped by user story. Each story is independently implementable and
independently verifiable through `scripts/cdp-ux-check.mjs`.

**Already done (not tasks, shipped in commit 824010a)**: the scroll, timer, important-date
alarm and `type="button"` defects found before this plan existed — the P1 items of US1 are
half-closed already; T0xx below finish the *remaining* mobile work (FAB, overflow, WebView
touch). Do not re-do the grid/timer/alarm work.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] **T001** Bump `package.json` to `1.4.0` and `android/app/build.gradle` `versionCode` +1 / `versionName "1.4.0"`, and mirror the version into `electron/package.json` if it carries one
- [ ] **T002** [P] Create `src/lib/themes.ts` — `ThemeDefinition` registry, 6 themes × {light, dark} token sets, plus the `variable` pseudo-theme marker and the `applyTheme(id, mode)` CSS-custom-property writer
- [ ] **T003** [P] Extend `src/lib/i18n.ts` with every new fa/en string (advisory phrases, news alert copy, backup labels, theme names, period labels) — no string may be added later without its `en` twin
- [ ] **T004** [P] Extend `src/lib/config.ts` with pref keys: `anjam.theme`, `anjam.themeMode`, `anjam.variableTheme`, `anjam.news.region`, `anjam.news.lastCheck`, `anjam.advisory.lastRun`, `anjam.backup.lastExport`
- [ ] **T005** Extend the `--ease-out` / `--dur-*` / `--spring` token layer in `src/styles.css` and add a `[data-theme]` + `[data-theme-mode]` attribute contract that `themes.ts` writes to; verify no hardcoded colour survives outside the token files (FR-11)

---

## Phase 2: Foundational (Blocking Prerequisites)

**CRITICAL**: no story work starts until this phase is done.

- [ ] **T006** Extend `src/lib/weather.ts` to expose the fields the advisory needs: `code` (weather code), `tempMin`/`tempMax` for the coming night, `isDay`, `precipProb`, `precipMm`, `windMax`, `uvIndex`, and the resolved `place` (used as the news region, D2)
- [ ] **T007** [P] Create `src/lib/advisory.ts` — the pure rule engine: `evaluate(now, forecast) → Advisory | null`, one branch per condition class in FR-05, each message authored per condition **and** per language with an actionable clause (FR-06). Pure function, no I/O, < 50 ms
- [ ] **T008** [P] Create `src/lib/news.ts` — `fetchNews(region) → NewsItem[]` per research.md §6.3: primary = rss2json over Bing News RSS, 4 keyword queries × 2 orderings, merged; fallback = direct CORS-open feeds (`borna.news/fa/rss/allnews` first, then entekhab/asriran/yjc), keyword-filtered client-side. 2 retries with backoff, 20 s cap per source
- [ ] **T009** [P] Create `src/lib/backup.ts` — `exportBackup()` / `validateBackup()` / `importBackup()` per FR-14/FR-15: every table + all `anjam.*` prefs + IndexedDB `meta`, versioned envelope, validation **before** any write, restore summary, explicit confirmation, atomic from the user's point of view
- [ ] **T010** Add the migration for `study_slots.period`: additive + idempotent, `start`/`"end"` become nullable, partial unique index per FR-08/FR-09, and pass `python scripts/sql-lint.py`
- [ ] **T011** Extend `src/lib/store.ts` with the period-based slot API (`listPeriods`, `setPeriod`, `clearPeriod`) alongside the existing slot API, plus the `__anjamStore` debug hook the harness needs to seed a timetable without Supabase

**Checkpoint**: rules engine, fetch strategy, backup envelope, migration and period API all
exist and type-check. Foundation ready for story work.

---

## Phase 3: User Story 1 — Android is actually usable (P1) — MVP

**Goal**: single-touch scrolling, a working **+** on every view, zero horizontal overflow 360–1440 px.
**Independent Test**: harness plays a real touch swipe on the Dates view in a 390×844 WebView
emulation, taps the FAB on each of the 12 views, and measures `scrollWidth <= clientWidth` at
360 / 390 / 844 / 1440.

### Tests (must fail first)

- [ ] **T012** [P] [US1] Harness: `scripts/cdp-ux-check.mjs` — touch-scroll test on 3 views (dispatch `Input.dispatchTouchEvent`, assert the view scrolled and the document did not)
- [ ] **T013** [P] [US1] Harness: FAB test on every view — tap, assert a composer became visible, close, assert no view regressed
- [ ] **T014** [P] [US1] Harness: overflow assertion at 360 / 390 / 844 / 1440 px for every view

### Implementation

- [ ] **T015** [US1] Add `min-block-size: 0` to `.main-col` and `.view` and `touch-action: pan-y` on the view column in `src/styles.css`; add `overscroll-behavior: contain` + `touch-action: pan-y` to every nested scroller (`.modal`, `.detail-body`, `.wp-results`, `.sidebar`) so no nested trap steals the gesture
- [ ] **T016** [US1] Add `QuickAddModal` in `src/components/` reusing the existing NLP parser; when the current view has no `#quickadd-input`, the FAB opens this modal on **both** shells
- [ ] **T017** [US1] Make `.tt-grid` and `.week-bars` reflow at narrow widths: the period grid scrolls horizontally **inside its own container** with `-webkit-overflow-scrolling: touch`, so the page itself never overflows, while desktop keeps the full grid
- [ ] **T018** [US1] Verify on the real Android WebView (`android/` build → device or emulator) that T012–T014 also pass there, not just in desktop Chrome

**Checkpoint**: US1 fully functional and independently verified. Ship as the P1 bugfix release.

---

## Phase 4: User Story 2 — Night weather advisory, 21:00→08:00 (P1)

**Goal**: a single well-written nightly line, only when the weather actually matters, only at night.
**Independent Test**: seed forecasts for each condition class, set the clock to 21:05 and 20:55,
assert a message appears / does not appear, and that a fine-weather forecast produces nothing.

### Tests (must fail first)

- [ ] **T019** [P] [US2] Harness: advisory matrix — for each condition class in FR-05, seed a forecast, assert the expected message key and language
- [ ] **T020** [P] [US2] Harness: window test — outside 21:00:00–07:59:59 the engine returns `null` and fires no notification; inside, it runs at most once per hour (FR-04)

### Implementation

- [ ] **T021** [US2] `src/components/Advisory.tsx` — the popup: one card, the advice line, an optional "فردا چند درجه" secondary line, dismiss that persists for the night; mounted in `App.tsx` and driven by the `21:00–08:00` window
- [ ] **T022** [US2] Wire the scheduler: on app wake / `visibilitychange` and on an hourly tick inside the window, call `evaluate()`; schedule the local notification through the existing Capacitor path only when there is a real advisory
- [ ] **T023** [US2] Cache the last advisory per night (`anjam.advisory.lastRun`) so a re-render, a wake or a second window does not re-notify the same advice
- [ ] **T024** [US2] Assert FR-19 for this story: no network error, no stale cache and no model failure may produce a popup — the whole path is `try → catch → return null`

**Checkpoint**: US2 works standalone. Weather chips and the existing popup are untouched.

---

## Phase 5: User Story 3 — Period-based weekly study timetable (P1)

**Goal**: set how many rings a day has and which subject sits in each ring. No clock, no day-of-week counters.
**Independent Test**: seed a Monday with 5 periods, assert 5 editable cells in order; assert no
clock-time input exists anywhere in the Study tab; run the FR-08 migration against a copy of
the live rows and assert the mapping is deterministic and idempotent.

### Tests (must fail first)

- [ ] **T025** [P] [US3] Harness: period grid renders N cells for N periods, in order, with the right subject labels
- [ ] **T026** [P] [US3] Harness: assert zero `input[type=time]` and zero clock strings inside the Study view
- [ ] **T027** [P] [US3] `scripts/sql-lint.py` on the migrated schema + a fixture test proving the `start`-ordering → `period_index` mapping is stable across re-runs

### Implementation

- [ ] **T028** [US3] Rewrite `src/components/Study.tsx` as the period grid: per-day period count 1–12, tap a cell → subject picker, long-press → clear; the grid scrolls horizontally inside its own container on narrow screens (ties into T017)
- [ ] **T029** [US3] Remove every clock-time affordance from the Study tab: no timer row, no per-day time inputs, no "روز" counters — the per-day count *is* the schedule
- [ ] **T030** [US3] Migrate existing `study_slots` rows deterministically (order by `start` within a weekday → `period_index` 1..n) and make the migration safe to re-run
- [ ] **T031** [US3] Add i18n for period labels (زنگ ۱ … زنگ ۱۲) in fa+en, and subject-picker empty state
- [ ] **T032** [US3] Keep the existing study-minute counter and workout section working untouched (they are not the class timetable)

**Checkpoint**: US3 works standalone; old timetables converted on first open.

---

## Phase 6: User Story 4 — Apple-grade UI: logo, themes, variable theme, motion (P2)

**Goal**: a visibly softer, more finished product on both shells.
**Independent Test**: logo ≥ 48 px in all six placements; switch each of the 6 themes in both
modes and screenshot; set the variable theme with a rain forecast and assert the accent changed;
assert no hardcoded colour outside `themes.ts`.

### Tests (must fail first)

- [ ] **T033** [P] [US4] Harness: logo longest-side ≥ 48 px measured from the rendered box in 6 placements (desktop sidebar, mobile drawer, auth, setup, boot splash, alarm ring)
- [ ] **T034** [P] [US4] Harness: theme matrix — 6 themes × light/dark, assert the token set applies and persists across reload; assert the variable theme re-derives on a weather change
- [ ] **T035** [P] [US4] Static check: no hardcoded colour literal in `src/**/*.tsx` outside the theme modules (FR-11)

### Implementation

- [ ] **T036** [US4] Render the logo larger everywhere: 58 px sidebar, 48 px mini/drawer, 72 px auth card, and scale up the boot splash and alarm ring marks (the 46/40/58 → 58/48/72 part shipped in 824010a)
- [ ] **T037** [US4] Wire the theme picker into `Settings.tsx` (grid of 6 swatches × light/dark toggle + a "متغیر با هوا" row) and `src/lib/appearance.ts`; persist and re-apply on boot
- [ ] **T038** [US4] Implement the variable (weather) theme as a runtime override layer on the same tokens, driven by `code` + `isDay`: clear day/night, rain, snow, storm, fog — with a 400 ms `color`/`background-color` cross-fade
- [ ] **T039** [US4] Motion pass: route every new animation through `--ease-out` / `--dur-*` / `--spring`, keep it to 150–420 ms and to transform/opacity only, and honour `prefers-reduced-motion` plus the existing motion toggle (FR-13)
- [ ] **T040** [US4] Soften the surfaces: consistent corner radii, one elevation scale, and hairline separators that read as iOS rather than as web borders

**Checkpoint**: all four P1 stories plus this P2 story ship; US5–US7 remain.

---

## Phase 7: User Story 5 — Local backup and emergency restore (P2)

**Goal**: one file that fully restores the account, and a restore path that cannot half-apply.
**Independent Test**: export → wipe → import → deep-diff the result against the pre-export snapshot
(SC-06); a corrupt or wrong-version file must be rejected with a summary and change nothing.

### Tests (must fail first)

- [ ] **T041** [P] [US5] Harness: round-trip — export, clear local data, import, assert every table row count and every `anjam.*` pref matches the snapshot
- [ ] **T042** [P] [US5] Harness: rejection cases — corrupt JSON, unknown version, missing table → assert a restore summary is shown, **no** write happened, and local data is untouched

### Implementation

- [ ] **T043** [US5] `src/components/` backup section in `Settings.tsx`: Export → file save (Electron `dialog`, browser download, Android `Filesystem`/share sheet), with the `anjam.backup.lastExport` stamp
- [ ] **T044** [US5] Import flow: pick file → `validateBackup()` → **show a summary (N tasks, M slots, K prefs, version)** → require explicit confirmation → write → reload state
- [ ] **T045** [US5] Make the restore atomic from the user's point of view: stage everything, and on any write error roll back to the pre-import snapshot rather than leaving a half-restored database
- [ ] **T046** [US5] Never store a backup file server-side and never include auth tokens in the envelope

**Checkpoint**: US5 works standalone.

---

## Phase 8: User Story 6 — Location-aware school news + 21:00 closure alert (P3)

**Goal**: at 21:00, and only then, a popup **only if** there is a real closure signal for the city the user already picked for the weather.
**Independent Test**: stub `news.ts` with a matching title and assert the popup appears at 21:00; stub it empty / `status !== 'ok'` and assert **silence**; assert a different region produces no alert.

### Tests (must fail first)

- [ ] **T047** [P] [US6] Harness: with a stubbed matching item, advance the clock to 21:00 and assert the popup and the notification appear
- [ ] **T048** [P] [US6] Harness: with an empty / failing fetch, assert **no** popup and **no** notification (FR-17, FR-19)
- [ ] **T049** [P] [US6] Harness: region mismatch — an Alborz item while the user's weather city is Tehran → no alert

### Implementation

- [ ] **T050** [US6] Implement the research.md §6.3 fetch: 4 keyword queries (`تعطیلی مدارس {region}`, `تعطیلی مدارس ساوجبلاغ`, `تعطیلی مدارس هشتگرد`, `بارش برف مدارس البرز`) × 2 Bing orderings via rss2json, merged and deduped
- [ ] **T051** [US6] Keyword gate: an item counts only with ≥2 closure keywords + ≥1 locality term, and only if ≤24 h old; otherwise it is dropped silently
- [ ] **T052** [US6] Resolve the region from the saved weather location (D2), with a settings override; build the URL templates exactly as research.md documents them
- [ ] **T053** [US6] `NewsAlert.tsx` — the 21:00 popup: headline, source, a link out to the publisher (never republish full text), acknowledge action; and a one-time re-show of an unacknowledged alert on the next open within 12 h
- [ ] **T054** [US6] Throttle: the check runs once per night; a failed check is retried twice with backoff and then **stays silent for the night**
- [ ] **T055** [US6] Fallback path: when rss2json is unavailable, fall back to the direct CORS-open feeds and apply the same gate; if both fail, silence (research.md §6.2 — do not use allorigins/cors.lol/jina/codetabs/corsproxy)

**Checkpoint**: US6 works standalone; the popup is rare by design.

---

## Phase 9: User Story 7 — An AI that advises on my data, not a chatbot (P3)

**Goal**: four non-chat analyses over the user's own data, each degrading to a local deterministic result.
**Independent Test**: with no key set, each of the four features returns the deterministic result; with a stubbed OpenRouter response, each returns the model's suggestion; with a 429, the app stays fully usable.

### Tests (must fail first)

- [ ] **T056** [P] [US7] Harness: no key → all four features fall back locally and the app never blocks
- [ ] **T057** [P] [US7] Harness: stubbed OpenRouter 200 → the panel shows a suggestion (not a chat box); stubbed 429/500 → graceful fallback, no error popup
- [ ] **T058** [P] [US7] Harness: assert no request body contains notes, email or any auth token

### Implementation

- [ ] **T059** [US7] `src/lib/ai.ts` — OpenRouter client (`POST /api/v1/chat/completions`, `max_tokens` 400–700, `temperature 0.2`, JSON response format), free-model list fetched live and cached 24 h, graceful "model unavailable → pick another"
- [ ] **T060** [US7] `src/components/AiPanel.tsx` — a collapsible card (never a chat view) with the four analyses: day plan, timetable sanity check, backlog triage, weekly review
- [ ] **T061** [US7] Settings rows: BYOK key input (stored per user, **never** in the bundle), model picker from the live free list, AI language (fa/en)
- [ ] **T062** [US7] Send only minimal aggregated context (today's task titles, counts, timetable shape) and state that in one sentence in settings before the key is entered
- [ ] **T063** [US7] Deterministic local implementations for all four features, used when there is no key, no network, or a free-tier 429

**Checkpoint**: all 7 user stories independently functional.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] **T064** [P] Extend `scripts/cdp-ux-check.mjs` to cover every new behaviour; the run must end with `failed:[]` (FR-20) — this is the release gate
- [ ] **T065** [P] Run the full `scripts/probe-bugs.mjs` battery (5/5 verdicts green) plus `tsc --noEmit` and `npm run build`
- [ ] **T066** [P] Re-verify the Android WebView: scroll, FAB, themes, advisory, and the 21:00 alert on a real device
- [ ] **T067** [P] Document the new features in `README.md` (advisory window, timetable model, backup, news sources + their caveats, AI key setup)
- [ ] **T068** Code cleanup: remove dead code and the debug hooks that are no longer needed, keeping `__anjam*` hooks that the harness depends on
- [ ] **T069** Release: `scripts/verify-release.mjs` + `apksigner verify` on the APK, then build the Electron installer
- [ ] **T070** Commit and push the release to `origin/main` with the v1.4.0 tag

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T005)**: no dependencies — start immediately
- **Foundational (T006–T011)**: depends on Setup — **blocks all stories**
- **US1 (T012–T018)**: after Foundational — no other story needed
- **US2 (T019–T024)**: after Foundational (T006, T007)
- **US3 (T025–T032)**: after Foundational (T010, T011)
- **US4 (T033–T040)**: after Foundational (T002, T005); themes layer feeds US2's variable theme
- **US5 (T041–T046)**: after Foundational (T009)
- **US6 (T047–T055)**: after Foundational (T008) and T006 (needs the resolved `place`)
- **US7 (T056–T063)**: after Foundational (T003, T004)
- **Polish (T064–T070)**: after every story you intend to ship

### Critical path

`T001–T011 → US1 → US2 → US6` is the shortest path to the two features you asked for by name
(the 21:00–08:00 advisory and the 21:00 closure alert); US3 is the longest single story.

### Parallel Opportunities

- All `[P]` tasks inside a phase can run in parallel
- After Foundational, US2, US5 and US7 are fully independent of each other
- US4's theme work and US2's variable theme share `themes.ts` — sequence T036–T038 before T021's mount, or assign T038 to the same owner

### Within Each User Story

- Harness tasks first, and they must FAIL before the implementation tasks
- Rules/engines (`advisory.ts`, `news.ts`, `backup.ts`) before the components that use them
- Component before settings row
- Independent test green before moving to the next story

---

## Implementation Strategy

### MVP first (US1 only)

1. T001–T011 (Setup + Foundational)
2. US1 (T012–T018) — the Android/desktop usability fix
3. **STOP and validate** in the harness *and* on a real Android WebView
4. Ship as a bugfix release

### Incremental delivery

1. Foundation → US1 → validate → release (P1 usability)
2. + US2 → validate → release (night advisory)
3. + US3 → validate → release (period timetable)
4. + US4 → validate → release (visual quality)
5. + US5, US6, US7 → validate → v1.4.0 tag

---

## Notes

- [P] = different files, no dependencies within the phase
- Each `[USn]` label maps tasks to a user story for traceability
- Every user story is independently completable and testable — that is the whole point of the split
- Harness tests must fail before implementation; a test that passes pre-implementation is testing nothing
- The 824010a fixes (scroll grid, timer snapshot, alarm lead, `type="button"`) are already shipped — do not re-implement them
- Known constraints that shaped the task list: Google News RSS is geo-blocked from non-Iran IPs and rss2json cannot proxy it; Bing RSS has no ACAO so it must go through rss2json; rss2json's keyless tier caps at 10 items; the fallback feeds are CORS-open but keyword-filtered client-side (research.md §6)
