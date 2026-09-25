# Anjam Constitution

Anjam is a bilingual (فارسی/English) personal organizer: tasks, habits, key dates,
study timetable, workout, timers/alarms, weather — shipped as one codebase to
Windows (Electron) and Android (Capacitor WebView) with optional Supabase sync.

## Core Principles

### I. Quality Over Size (NON-NEGOTIABLE)
The owner explicitly trades APK/installer size for quality. A bigger bundle is
acceptable when it buys visible quality: richer themes, smoother motion, more
detailed icons, better typography, more QA. Conversely, no dead weight: unused
code, unthemed elements, placeholder art, and unpolished screens are defects.
Every new UI surface ships finished (states: empty, loading, error, RTL, both
languages, light + dark, 360px to 1440px).

### II. Platform Parity
Any feature that exists on desktop must work on Android and vice versa. A change
is incomplete if it only renders on one platform. Capacitor-only and
Electron-only code paths must be guarded (`Capacitor.isNativePlatform()`) and
must degrade to a working fallback, never to a dead control. "Works on desktop,
needs scrolling or broken on Android" is a P0 defect, not a follow-up.

### III. Motion Is Design, Not Decoration
Animations follow the shared motion tokens only (`--ease-out`, `--dur-*`,
`--spring`); durations stay in 150-420ms, transforms/opacity only, no layout
thrash, and `prefers-reduced-motion` / `data-motion="off"` disable all of them.
Every transition communicates state (entry, exit, focus, success). Target the
smoothness of Apple's first-party apps: no jank, no double-bounce, no abrupt
cuts.

### IV. Persian-First i18n
Every user-facing string goes through `src/lib/i18n.ts` with BOTH `fa` and `en`
entries; no hardcoded strings in components. Persian renders RTL correctly
(ZWNJ-aware regex), digits localized with `toFaDigits` where the screen is
Persian. Layouts must be mirrored-safe (no fixed left/right assumptions).

### V. Data Safety First
- Local state (IndexedDB + localStorage) is the source of truth for offline use.
- Schema changes require an **idempotent** `supabase/schema.sql` migration plus
  `python scripts/sql-lint.py supabase/schema.sql` -> `PARSE_OK`, plus a
  client-side migration for rows already stored on devices.
- Backup must round-trip: export -> import restores every user-visible row,
  verified by a scripted before/after comparison.
- Nothing silently destroys user data (clear/overwrite actions confirm first).

### VI. Offline-First and Graceful Degradation
Weather, news and sync are enhancements. Every network feature must cache, fail
silently (no error popups for routine failures), and never block first paint. A
feature that needs the internet stays usable offline with last known data or an
honest empty state.

### VII. Evidence-Based Completion
Done means: `npm run build` (tsc + vite) passes, the CDP QA harness passes with
zero failures, versions are bumped in `package.json` + `android/app/build.gradle`,
and the work is committed **and pushed**. A claim of "fixed" requires a log,
screenshot or harness line as evidence — never an assertion alone.

## Constraints

- Stack is fixed: Vite + React 18 + TypeScript, Capacitor 6 (Android), Electron
  31 (Windows), Supabase (optional sync). New dependencies need a stated reason;
  prefer platform APIs and hand-rolled code over libraries.
- No API keys in the client; weather/news sources must be keyless or public.
- Single CSS design system (`src/styles.css` custom properties). Colors come from
  tokens; themes are expressed as token sets, not ad-hoc overrides.
- Persian copy must sound human — no literal translations, no AI-isms.

## Quality Gates (every release)

1. `npm run build` -> clean (no TS errors).
2. `python scripts/sql-lint.py supabase/schema.sql` -> `PARSE_OK` (if schema changed).
3. CDP QA harness -> `total:N passed:N failed:[]` (extended for new features).
4. APK content check (feature marker string present in `assets/public/assets/*.js`).
5. `apksigner verify` exit 0; Electron installer + portable built.
6. Commit with multiple `-m` paragraphs, push with
   `git -c http.sslBackend=openssl -c http.version=HTTP/1.1 push origin main`.

## Governance

This constitution outranks local habits and ad-hoc shortcuts. Amendments are
documented in the commit that makes them. Principle conflicts resolve in favour
of Principle I (quality) and V (data safety). Runtime guidance lives in
`README.md` and `PENDING.md`.

**Version**: 1.0.0 | **Ratified**: 2026-09-25 | **Last Amended**: 2026-09-25
