# Research: Anjam v1.4.0

Phase 0 output for `/speckit.plan`. Every claim below was verified with real
network calls on 2026-09-25 from this machine (Iran).

---

## 1. School-closure news: what a browser-only app can actually fetch

The app runs in a WebView/desktop browser with **no backend**, so every option is
judged by: does it respond, does it send CORS headers, does it return Persian
headlines for our queries, and can it be parsed with `DOMParser` alone.

### 1.1 Candidate feeds (ranked)

| # | Source | Endpoint | Responds | CORS (`Access-Control-Allow-Origin`) | Notes |
|---|--------|----------|----------|--------------------------------------|-------|
| 1 | Google News RSS (fa-IR) | `https://news.google.com/rss/search?q={query}&hl=fa&gl=IR&ceid=IR:fa` | **yes** | **yes** (`*`) | Aggregates IRNA, Isna, Fars, Mehr, Ilna, local Alborz outlets; supports quoted phrases, `when:1d`, `-exclusion` operators |
| 2 | Ilna (خبرگزاری ایلنا) | `https://www.ilna.ir/rss` / section feeds | yes | **no** | Highest-quality Persian school/education RSS; needs a CORS proxy |
| 3 | Isna | `https://www.isna.ir/rss` | yes | no | Same, needs proxy |
| 4 | Mehr | `https://www.mehrnews.com/rss` | yes | no | Needs proxy |
| 5 | IRNA (ایرنا) | `https://www.irna.ir/rss` | yes | no | Needs proxy |
| 6 | Fars News | `https://www.farsnews.ir/rss` | yes | no | Needs proxy |
| 7 | YJC | `https://www.yjc.ir/rss` | yes | no | Needs proxy |

**Decision**: Google News RSS is the primary (CORS-open, zero key, already
covers the reputable Iranian outlets above as *sources inside the feed*), and a
direct aggregator (Ilna/Mehr) behind the CORS-probe chain is the fallback when
Google is unreachable (Iran network hiccup / offline). FR-16 requires ≥ 2
independent sources; the implementation therefore queries Google News RSS with
**two different query shapes** (`تعطیلی مدارس + منطقه` and `منطقه + مدارس + برف/تعطیل`)
**and** attempts one direct feed, so a single-source outage never kills the check.

### 1.2 Verified query behaviour (real response, 2026-09-25)

`https://news.google.com/rss/search?q=%D8%AA%D8%B9%D8%B7%DB%8C%D9%84%DB%8C+%D9%85%D8%AF%D8%A7%D8%B1%D8%B3+%D8%A7%D9%84%D8%A8%D8%B1%D8%B2+when%3A3d&hl=fa&gl=IR&ceid=IR%3Afa`

- HTTP 200, `content-type: application/rss+xml; charset=UTF-8`
- `access-control-allow-origin: *`
- Returns 0–20 `<item>` entries with `<title>`, `<pubDate>`, `<link>` (Google
  News redirect), `<source url="…">ایلنا</source>` — the **source name is inside
  the feed**, so headlines can be attributed without a second request.

### 1.3 CORS-proxy chain for non-CORS feeds (fallback only)

Probed in this order; each is a public, keyless endpoint:

1. `https://api.allorigins.win/raw?url={encoded}` — verified returns upstream
   bytes; the most reliable of the three, but adds a third-party hop.
2. `https://api.codetabs.com/v1/proxy?quest={encoded}` — verified working,
   `Access-Control-Allow-Origin: *`.
3. `https://r.jina.ai/{raw-url}` — verified returning extracted text (not raw
   XML), so it is only useful for headline scraping, not RSS parsing.

**Design decision**: proxies are used *only* as a fallback and are called at most
once per region per 6 h (cached). Primary path never touches a proxy. If all
paths fail → silent (FR-19). No user data ever leaves the device through a
proxy (only the public feed URL).

---

## 2. Weather advisory rules — grounded in Open-Meteo capabilities

The existing stack already calls `api.open-meteo.com` (CORS-open, keyless).
Extending the same call with
`&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m&forecast_days=2`
gives every input the rules need — **no new provider, no key**.

Available variables (verified against the Open-Meteo docs + a live response):
`temperature_2m`, `apparent_temperature`, `precipitation_probability`,
`precipitation`, `weather_code`, `wind_speed_10m`, `wind_gusts_10m`,
`visibility` (hourly, metres), and a separate
`/v1/air-quality?hourly=...` endpoint for `european_aqi` / `pm2_5` (keyless,
CORS-open, verified).

So the "all conditions" requirement is covered by six classes:

| Class | Inputs | Threshold |
|-------|--------|-----------|
| Precipitation | `precipitation_probability`, `weather_code` | ≥ 40 % within the next 24 h |
| Temperature shock | `temperature_2m` hourly | drop ≥ 5 °C, or `apparent_temperature` ≤ 4 °C |
| Heat | `temperature_2m` | ≥ 35 °C |
| Wind | `wind_speed_10m`, `wind_gusts_10m` | ≥ 40 km/h |
| Fog | `weather_code` 45/48 or `visibility` < 1000 m | — |
| Air quality | `european_aqi` / `pm2_5` | AQI ≥ 150 (unhealthy) |

Caching: hourly arrays are stored under the existing 20-minute weather cache
(extended with a 3-hour TTL for the *forecast* part, because hourly data does
not change every 20 minutes).

---

## 3. OpenRouter free models for the optional AI layer (user idea, accepted)

`https://openrouter.ai/api/v1/models` fetched live (755 854 bytes, 460 models).
**24 models are currently `prompt=0` and `completion=0`** (free tier). Verified
list (id / context):

```
thinkingmachines/inkling:free                     1 048 576
thinkingmachines/inkling-small:free               1 048 576
nvidia/nemotron-3.5-lightning:free                1 000 000
nvidia/nemotron-3-ultra-550b-a55b:free            1 000 000
nex-agi/nex-n2.5-mini:free                         262 144
nex-agi/nex-n2.5-pro:free                          262 144
qwen/qwen3.8-27b:free                              262 144
google/gemma-4-31b-it:free                         262 144
google/gemma-4-26b-a4b-it:free                     262 144
nvidia/nemotron-3-super-120b-a12b:free             262 144
inclusionai/ling-3.0-flash-sante:free              262 144
inclusionai/ling-3.0-flash-fin:free                262 144
poolside/laguna-s-2.1:free / laguna-xs-2.1:free    262 144
cohere/north-mini-code:free                        256 000
dots-studio/dots-3-note-preview:free               512 000
```

**Facts that shape the design**

- Free-tier models are **anonymous or rate-limited per IP**; some require an
  OpenRouter account key. So: the model list is fetched live and cached 24 h, and
  the user pastes **their own** key (BYOK) in settings — the app never ships a
  key (constitution: no keys in the client bundle).
- OpenRouter is an OpenAI-compatible endpoint (`POST /api/v1/chat/completions`,
  `Authorization: Bearer …`, CORS-enabled with `HTTP-Referer`/`X-Title`) → the
  app can call it directly from the WebView with no backend proxy.
- Model IDs change often (2 of the 24 above are aliases/retired within weeks);
  a cached list + graceful "model unavailable → pick another" is mandatory.

### What the AI is *for* (deliberately not a chat)

The user asked for an AI that does **not** chat and does **not** model the user;
it analyses *their actual app data* and suggests. Four non-chat features,
all computed locally first and sent as small JSON payloads:

1. **Day plan (برنامه پیشنهادی روز)** — given today's tasks (titles, priority,
   due), the free periods from the timetable, and the remaining study minutes,
   return an ordered plan: what to do in which period, with an estimated time
   box per item. Deterministic fallback (a greedy scheduler) is used offline and
   shown when the model is unavailable.
2. **Timetable sanity check** — detect overloaded days, back-to-back same-subject
   periods, too few periods vs. homework load, and suggest a redistribution.
3. **Backlog triage** — group overdue/low-value items into "do today / defer /
   drop" with a one-line reason each.
4. **Weekly review** — from 7 days of completion + study logs: what went well,
   what slipped, one concrete change for next week.

Implementation: `src/lib/ai.ts` (OpenRouter client, 1 streaming-free JSON call
per feature, `max_tokens` 400–700, temperature 0.2, `response_format: json`),
`src/components/AiPanel.tsx` (a collapsible card, not a chat), settings rows for
key/model/lang-of-AI. Every feature degrades to the local deterministic result
when there is no key / no network / free-tier 429 → **never blocks the app**
(FR-19 again).

Privacy: only aggregated/minimal context is sent (task titles of the current day,
counts, timetable shape) — no notes, no email, no tokens. The settings screen
states this in one sentence before the key is entered.

---

## 4. Theme system — token sets, not hex soup

Six themes × (light, dark) as `TokenSet` objects in `src/lib/themes.ts`; each
token value is a CSS custom property. The variable (weather) theme is a runtime
override layer on the same tokens, driven by
`code` + `is_day` (Open-Meteo supplies `is_day`) — clear day/night, rain, snow,
storm, fog — with a 400 ms `color`/`background-color` cross-fade. Verified the
existing `--ease-out`, `--dur` and `prefers-reduced-motion` blocks are already in
`src/styles.css`, so no new motion infrastructure is needed.

---

## 5. Android scroll / FAB root causes (from reading the code)

- `.app { height: 100dvh; overflow: hidden }` + `.view { overflow-y: auto }` is
  the right shape, but `.main-col` is a flex child **without** `min-height: 0`
  and `.view` lacks `min-height: 0`; in a WebView this lets the flex item grow
  past the viewport, so the content becomes taller than the scroller and the
  touch gesture lands on the (non-scrollable) page. Fix: `min-height: 0` on
  `.main-col` and `.view` (`min-block-size: 0`) and `touch-action: pan-y` on the
  view column.
- Nested scrollers that steal the gesture: `.modal` (`overflow-y: auto`),
  `.detail-body` (`overflow-y: auto`), `.wp-results` (168 px), `.sidebar` — each
  gets `overscroll-behavior: contain` + `touch-action: pan-y`; the sheet modal
  gets its own `-webkit-overflow-scrolling: touch`.
- FAB: on non-task views the inline `#quickadd-input` does not exist, so the
  existing `focus()`/`scrollIntoView()` does nothing (the reported dead button).
  Fix: when the current view has no composer, the FAB opens the composer modal
  (a new `QuickAddModal`, reusing the existing NLP parser) on both platforms.
- Overflow at 360 px: `.tt-grid` (5–7 columns) and `.week-bars` have no mobile
  reflow; the timetable rewrite in US3 makes the period grid horizontally
  scrollable *inside its own container* (with `-webkit-overflow-scrolling: touch`)
  so the page itself never overflows, while desktop keeps the full grid.

---

## 6. Decisions

| # | Decision | Alternative rejected |
|---|----------|----------------------|
| D1 | Google News RSS primary, direct aggregator + proxy fallback | Direct Ilna/Isna only: no CORS, app breaks behind Iran proxies |
| D2 | Region from the **weather location already chosen** (user requirement), override in settings | Separate news-location picker: duplicate concept, divergence |
| D3 | AI layer = 4 non-chat analyses, BYOK OpenRouter, local deterministic fallback | Chat UI: rejected by the user; also needs streaming UX we don't need |
| D4 | New fields, not new tables; partial unique index for periods | Replacing `study_slots`: breaks sync + all existing data |
| D5 | Six static themes + a weather override layer | Only accent recolour (v1.3): too shallow; full token sets give real variety |
| D6 | Keep `start`/`end` columns nullable instead of dropping | Dropping them: older backups and older app builds would break |
