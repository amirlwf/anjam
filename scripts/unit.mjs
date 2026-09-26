#!/usr/bin/env node
/**
 * Unit tests for the pure modules added in v1.4.0 — no browser needed.
 * Run with:  node --experimental-strip-types scripts/unit.mjs
 *
 * These are the checks that must be red before the component work starts:
 * a broken rule engine or an incomplete token set is a design bug, and a
 * design bug is cheaper to catch here than through the CDP harness.
 */
import { THEMES, isThemeId, weatherAccent, DEFAULT_THEME } from '../src/lib/themes.ts'
import {
  evaluate, isNightWindow, shouldShow, msUntilNextWindow,
  WINDOW_START, WINDOW_END
} from '../src/lib/advisory.ts'
import { buildNight } from '../src/lib/weather.ts'
import {
  migrateToPeriods, periodsOfDay, periodCount, withPeriodCount, MAX_PERIODS
} from '../src/lib/periods.ts'
import {
  pickAlert, isClosureSignal, regionTerms, dedupeTitles, isFresh, rss2jsonUrl, fetchCandidates,
  QUERIES,
} from '../src/lib/news.ts'
import {
  buildBackup, validateBackup, summarize, collectPrefs, isSecretKey, TABLES, BACKUP_VERSION,
} from '../src/lib/backup.ts'
import {
  ANALYSES, buildPayload, localAnalysis, localDay, localTimetable,
  localBacklog, localWeekly, orderedOpen, timeBox, parseReply, otherModel,
  AiError, OPENROUTER_CHAT, SYSTEM_PROMPTS,
} from '../src/lib/ai.ts'

let pass = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) pass++
  else failures.push(`${name}${detail ? ' — ' + detail : ''}`)
}
function eq(name, got, want) {
  check(name, Object.is(got, want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

/* ---------------------------------------------------------------- themes */
eq('themes: six of them', THEMES.length, 6)
eq('themes: default is first', DEFAULT_THEME, 'indigo')

const REQUIRED_TOKENS = [
  'bg', 'surface', 'surface2', 'surface3', 'border', 'text', 'muted',
  'accent', 'danger', 'ok', 'warn', 'radius'
]
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

for (const th of THEMES) {
  for (const mode of ['light', 'dark']) {
    for (const tok of REQUIRED_TOKENS) {
      const v = th[mode][tok]
      const isColour = tok !== 'radius'
      check(
        `themes: ${th.id}/${mode} has ${tok}`,
        typeof v === 'string' && v.length > 0,
        `got ${JSON.stringify(v)}`
      )
      if (isColour) {
        check(`themes: ${th.id}/${mode}.${tok} is hex`, HEX.test(v), `got ${v}`)
      }
    }
  }
  // light and dark must actually differ, or the "dark" half is a lie
  check(
    `themes: ${th.id} light/dark differ`,
    th.light.bg !== th.dark.bg && th.light.text !== th.dark.text
  )
  check(`themes: ${th.id} has fa label`, typeof th.fa === 'string' && th.fa.length > 0)
  check(`themes: ${th.id} has en label`, typeof th.en === 'string' && th.en.length > 0)
}
const ids = new Set(THEMES.map(t => t.id))
eq('themes: ids unique', ids.size, THEMES.length)
check('themes: isThemeId rejects junk', !isThemeId('nope'))
check('themes: isThemeId accepts a real one', isThemeId('ocean'))

// day/night must be distinguishable, and both modes must exist (FR-12)
for (const [code, label] of [[0, 'clear'], [61, 'rain'], [71, 'snow'], [95, 'storm'], [45, 'fog']]) {
  const day = weatherAccent(code, true)
  const night = weatherAccent(code, false)
  check(`weather: ${label} day/night differ`, day.light !== night.light, `${day.light}`)
  check(`weather: ${label} hex on both branches`, HEX.test(day.light) && HEX.test(night.light) && HEX.test(day.dark) && HEX.test(night.dark))
}
// unknown code must not throw
check('weather: unknown code falls back', HEX.test(weatherAccent(999, true).light))

/* -------------------------------------------------------------- advisory */
eq('advisory: window starts 21:00', WINDOW_START, 21 * 60)
eq('advisory: window ends 08:00', WINDOW_END, 8 * 60)

const at = (h, m = 0) => { const d = new Date(2026, 8, 25, h, m, 0); return d }
check('advisory: 21:00 is inside', isNightWindow(at(21, 0)))
check('advisory: 07:59 is inside', isNightWindow(at(7, 59)))
check('advisory: 08:00 is outside', !isNightWindow(at(8, 0)))
check('advisory: 20:59 is outside', !isNightWindow(at(20, 59)))
check('advisory: 12:00 is outside', !isNightWindow(at(12, 0)))

// a calm, mild, dry night must produce nothing at all
const calm = {
  code: 1, isDay: false, tempNow: 18, tempMin: 16, tempMax: 20,
  precipProb: 0, precipMm: 0, windMax: 8, humidity: 55, uvIndex: 0
}
eq('advisory: calm night is silent', evaluate(at(22), calm, 'fa'), null)
eq('advisory: calm day window is silent', evaluate(at(21), calm, 'en'), null)

/* ------------------------------------- advisory: the whole condition table
 * FR-05 requires every class to be modelled. Each row below is one class with
 * a real WMO code, checked at 22:00 (inside the window).
 */
const AT_NIGHT = at(22, 0)
const fc = (over) => ({ code: 0, isDay: false, tempNow: 15, tempMin: 12, tempMax: 18, precipProb: 0, precipMm: 0, windMax: 8, humidity: 55, uvIndex: 0, ...over })

const MATRIX = [
  [61, 'advRain'], [63, 'advHeavyRain'], [65, 'advHeavyRain'],
  [80, 'advShower'], [81, 'advHeavyRain'],
  [71, 'advSnow'], [73, 'advSnow'], [75, 'advSnow'], [77, 'advSnow'],
  [66, 'advSleet'], [67, 'advSleet'],
  [95, 'advStorm'], [96, 'advHail'], [99, 'advHail'],
  [45, 'advFog'], [48, 'advFog'],
  [51, 'advShower']
]
for (const [code, wantKey] of MATRIX) {
  const got = evaluate(AT_NIGHT, fc({ code }), 'fa')
  check(`advisory: WMO ${code} -> ${wantKey}`, got?.key === wantKey, `got ${got?.key}`)
}

// numeric-only triggers (no code says so, the numbers do)
eq('advisory: precip numbers alone', evaluate(AT_NIGHT, fc({ precipProb: 70, precipMm: 2 }), 'fa')?.key, 'advRain')
eq('advisory: heavy precip numbers', evaluate(AT_NIGHT, fc({ precipProb: 90, precipMm: 9 }), 'fa')?.key, 'advHeavyRain')
eq('advisory: hard frost', evaluate(AT_NIGHT, fc({ tempMin: -9 }), 'fa')?.key, 'advVeryCold')
eq('advisory: cold', evaluate(AT_NIGHT, fc({ tempMin: 5 }), 'fa')?.key, 'advCold')
eq('advisory: hot night', evaluate(AT_NIGHT, fc({ tempMax: 40, tempMin: 30 }), 'fa')?.key, 'advHot')
eq('advisory: gale', evaluate(AT_NIGHT, fc({ windMax: 75 }), 'fa')?.key, 'advWind')
eq('advisory: humid', evaluate(AT_NIGHT, fc({ humidity: 95 }), 'fa')?.key, 'advHumid')
eq('advisory: overcast is the mildest note', evaluate(AT_NIGHT, fc({ code: 3 }), 'fa')?.key, 'advClouds')

// a clear mild night must say nothing at all — the whole point of the feature
eq('advisory: clear mild night is silent', evaluate(AT_NIGHT, fc({ code: 0 }), 'fa'), null)
eq('advisory: partly cloudy mild night is silent', evaluate(AT_NIGHT, fc({ code: 2 }), 'fa'), null)
eq('advisory: silence even in English', evaluate(AT_NIGHT, fc({ code: 0 }), 'en'), null)

// severity: the most urgent condition wins when several are true at once
const mixed = evaluate(AT_NIGHT, fc({ code: 0, tempMin: -12, windMax: 80, humidity: 96 }), 'fa')
eq('advisory: hard frost outranks wind', mixed?.key, 'advVeryCold')
eq('advisory: thunder outranks a cold snap', evaluate(AT_NIGHT, fc({ code: 95, tempMin: -12 }), 'fa')?.key, 'advStorm')
eq('advisory: hail outranks plain thunder', evaluate(AT_NIGHT, fc({ code: 99 }), 'fa')?.key, 'advHail')

// a missing forecast must not crash and must not speak
const broken = evaluate(AT_NIGHT, { code: 0, tempMin: undefined, tempMax: undefined, precipProb: NaN, precipMm: NaN, windMax: NaN, humidity: NaN }, 'fa')
check('advisory: NaN forecast survives', broken === null || typeof broken.key === 'string', `got ${JSON.stringify(broken)}`)

/* --------------------------------------------- shouldShow (throttle) */
const base = { key: 'advRain', severity: 3 }
const now = at(22, 0).getTime()
check('advisory: first run always shows', shouldShow(new Date(now), base, null, ''))
check('advisory: same hour is throttled', !shouldShow(new Date(now + 10 * 60_000), base, now, 'advRain'))
check('advisory: different key after an hour shows', shouldShow(new Date(now + 61 * 60_000), base, now, 'advClouds'))
check('advisory: same key after the suppress window shows', shouldShow(new Date(now + 5 * 60 * 60_000), base, now, 'advRain'))

/* msUntilNextWindow — used to schedule the next evaluation (FR-04) */
const mins = (h, m = 0) => msUntilNextWindow(at(h, m)) / 60_000
eq('advisory: 20:00 waits until 21:00', mins(20), 60)
eq('advisory: 22:00 waits until 08:00', mins(22), 10 * 60)
eq('advisory: 07:00 waits until 08:00', mins(7), 60)
eq('advisory: 08:00 waits until 21:00', mins(8), 13 * 60)
eq('advisory: 21:00 closes at 08:00 tomorrow', mins(21), 11 * 60)
eq('advisory: 23:00 crosses midnight to 08:00', mins(23), 9 * 60)
eq('advisory: 04:00 waits 4h to 08:00', mins(4), 4 * 60)
eq('advisory: 12:00 waits 9h to 21:00', mins(12), 9 * 60)

/* --------------------------------------------- buildNight (T006)
 * The reduction from an hourly series to the 21:00→08:00 window. This is
 * where a timezone or an off-by-one hour silently turns "rain tonight" into
 * "clear", so it gets a real 48-hour fixture.
 */
const series = (startHour, hours, fn) => {
  const time = [], temperature_2m = [], weather_code = []
  const precipitation_probability = [], precipitation = []
  const wind_speed_10m = [], relative_humidity_2m = [], uv_index = []
  const base = new Date(2026, 8, 25, startHour, 0, 0)
  for (let i = 0; i < hours; i++) {
    const t = new Date(base.getTime() + i * 3600_000)
    const v = fn(t.getHours(), i)
    // Open-Meteo with timezone=auto returns LOCAL time with no offset
    // ("2026-09-25T22:00"), not a Z-suffixed ISO string. Match reality.
    time.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:00`)
    temperature_2m.push(v.temp)
    weather_code.push(v.code)
    precipitation_probability.push(v.prob ?? 0)
    precipitation.push(v.mm ?? 0)
    wind_speed_10m.push(v.wind ?? 8)
    relative_humidity_2m.push(v.hum ?? 55)
    uv_index.push(v.uv ?? 0)
  }
  return { time, temperature_2m, weather_code, precipitation_probability, precipitation, wind_speed_10m, relative_humidity_2m, uv_index }
}

// 48 h from 12:00 on the 25th; a clear night, then a snowy one
const clear48 = series(12, 48, () => ({ temp: 18, code: 0 }))
const n1 = buildNight(clear48, at(22))
check('buildNight: returns an outlook', !!n1)
eq('buildNight: a clear night has no precipitation', n1?.precipProb, 0)
eq('buildNight: a clear night has no mm', n1?.precipMm, 0)
eq('buildNight: a clear night keeps code 0', n1?.nightCode, 0)

// the window must pick up the *next* night's snow, not the clear hours before
const snowy48 = series(12, 48, h => (h >= 21 || h < 8 ? { temp: -3, code: 73, prob: 90, mm: 2, wind: 40 } : { temp: 12, code: 1 }))
const n2 = buildNight(snowy48, at(22))
eq('buildNight: finds the night low', n2?.tempMin, -3)
eq('buildNight: carries the code', n2?.nightCode, 73)
eq('buildNight: carries the probability', n2?.precipProb, 90)
eq('buildNight: max wind, not mean', n2?.windMax, 40)

// daytime hours must not leak into the night numbers
const mildDay = series(0, 24, h => (h >= 21 || h < 8 ? { temp: 20, code: 0 } : { temp: 35, code: 0, wind: 90, hum: 99 }))
const n3 = buildNight(mildDay, at(22))
eq('buildNight: ignores the 35° afternoon high', n3?.tempMax, 20)
eq('buildNight: ignores daytime wind', n3?.windMax, 8)
eq('buildNight: ignores daytime humidity', n3?.humidity, 55)

// worst code wins across the night, even if the last hour is clear
const hailThenClear = series(12, 48, h => (h === 23 ? { temp: 10, code: 99 } : { temp: 10, code: 0 }))
eq('buildNight: worst code wins', buildNight(hailThenClear, at(22))?.nightCode, 99)

// a 02:00 call must still resolve the same night (window rolls over midnight)
const early = buildNight(snowy48, at(2))
eq('buildNight: 02:00 sees the same night', early?.tempMin, -3)

// malformed / empty input must not invent data
eq('buildNight: empty series', buildNight({ time: [] }, at(22)), undefined)
eq('buildNight: missing arrays', buildNight({}, at(22)), undefined)
eq('buildNight: garbage timestamps', buildNight({ time: ['x', 'y'], temperature_2m: [1, 2] }, at(22)), undefined)

// end-to-end: the built outlook must actually drive the advisory
const e2e = buildNight(snowy48, at(22))
if (e2e) {
  const got = evaluate(at(22), {
    code: 0, isDay: e2e.isDay, tempNow: 18, tempMin: e2e.tempMin, tempMax: e2e.tempMax,
    precipProb: e2e.precipProb, precipMm: e2e.precipMm, windMax: e2e.windMax,
    humidity: e2e.humidity, uvIndex: e2e.uvIndex
  }, 'fa')
  check('advisory: built outlook triggers a note', got !== null, 'snow at -3 should speak')
}

/* ------------------------------------------------ study timetable (US3) */
/* FR-08: an old clock timetable must convert to period indices in a way that
 * is (a) deterministic — the same file converted twice gives the same day,
 * (b) idempotent — the second run changes nothing at all, and (c) ordered
 * — ring N is always the class that used to come Nth, never a subject that
 * happened to sort earlier. A migration that reshuffles a student's day is
 * worse than no migration, so these are hard assertions, not smoke tests. */

const slot = (id, weekday, start, period, extra = {}) => ({
  id,
  user_id: 'u',
  subject_id: extra.subject_id ?? null,
  weekday,
  period,
  start,
  end: extra.end ?? null,
  room: extra.room ?? null,
  created_at: extra.created_at ?? '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted: extra.deleted ?? false,
})

/* a real v1.3 Monday: five classes, clock-ordered, no `period` field */
const legacyMonday = [
  slot('a', 0, '08:00', undefined),
  slot('b', 0, '09:00', undefined),
  slot('c', 0, '10:30', undefined),
  slot('d', 0, '12:00', undefined),
  slot('e', 0, '13:15', undefined),
].map((r) => { const { period, ...rest } = r; return rest })

const m1 = migrateToPeriods(legacyMonday)
eq('periods: legacy monday gains 5 rings', m1.length, 5)
eq('periods: ring 1 is the 08:00 class', m1.find((r) => r.id === 'a').period, 1)
eq('periods: ring 2 is the 09:00 class', m1.find((r) => r.id === 'b').period, 2)
eq('periods: ring 3 is the 10:30 class', m1.find((r) => r.id === 'c').period, 3)
eq('periods: ring 4 is the 12:00 class', m1.find((r) => r.id === 'd').period, 4)
eq('periods: ring 5 is the 13:15 class', m1.find((r) => r.id === 'e').period, 5)

/* (b) idempotent: same reference back means nothing to rewrite */
check('periods: second run is a no-op', migrateToPeriods(m1) === m1, 'expected identity')

/* (a) deterministic: shuffling the input must not change the output */
const shuffled = [m1[3], m1[0], m1[4], m1[1], m1[2]]
const m2 = migrateToPeriods(shuffled)
eq('periods: order survives a shuffled input',
  JSON.stringify(periodsOfDay(m2, 0).map((r) => r.id)),
  JSON.stringify(['a', 'b', 'c', 'd', 'e']))

/* a day that is already numbered is never re-derived from the clock, even
 * when the clock order disagrees — otherwise the second run would reshuffle */
const numbered = [
  slot('x', 0, '13:00', 1),
  slot('y', 0, '08:00', 2),
]
const nm = migrateToPeriods(numbered)
eq('periods: a migrated day keeps its rings', nm.find((r) => r.id === 'x').period, 1)
eq('periods: a migrated day keeps its rings (2)', nm.find((r) => r.id === 'y').period, 2)

/* days must never bleed into each other */
const twoDays = migrateToPeriods([
  slot('mo1', 1, '08:00', undefined),
  slot('su1', 0, '08:00', undefined),
  slot('su2', 0, '09:00', undefined),
].map((r) => { const { period, ...rest } = r; return rest }))
eq('periods: Sunday is its own numbering', periodCount(twoDays, 0), 2)
eq('periods: Monday is its own numbering', periodCount(twoDays, 1), 1)

/* a tie on `start` must still be stable: created_at, then id */
const tied = [
  slot('z', 0, '08:00', undefined, { created_at: '2026-01-02' }),
  slot('a', 0, '08:00', undefined, { created_at: '2026-01-01' }),
].map((r) => { const { period, ...rest } = r; return rest })
eq('periods: ties break on created_at', migrateToPeriods(tied).find((r) => r.id === 'a').period, 1)
// idempotency is about the SECOND run changing nothing: same array back,
// not "two freshly-built arrays that happen to look alike".
const tied1 = migrateToPeriods(tied)
const tied2 = migrateToPeriods(tied1)
check('periods: tie-break is idempotent', tied2 === tied1, 'second run rebuilt the array')

/* deleted rows never occupy a ring */
const withDeleted = migrateToPeriods([
  slot('gone', 0, '08:00', undefined, { deleted: true }),
  slot('here', 0, '09:00', undefined),
].map((r) => { const { period, ...rest } = r; return rest }))
eq('periods: deleted rows are skipped', periodCount(withDeleted, 0), 1)
eq('periods: surviving row becomes ring 1', periodsOfDay(withDeleted, 0)[0].period, 1)

/* more than MAX_PERIODS in one day: the overflow is dropped, not clamped
 * onto the last ring (two classes at ring 12 would lose one silently) */
const many = Array.from({ length: MAX_PERIODS + 3 }, (_, i) =>
  slot('m' + i, 0, String(7 + i).padStart(2, '0') + ':00', undefined)
).map((r) => { const { period, ...rest } = r; return rest })
eq('periods: capped at MAX_PERIODS', periodCount(migrateToPeriods(many), 0), MAX_PERIODS)

/* ring N is always rendered in order, even out of storage order */
eq('periods: periodsOfDay sorts by ring',
  JSON.stringify(periodsOfDay([slot('p3', 0, null, 3), slot('p1', 0, null, 1), slot('p2', 0, null, 2)], 0).map((r) => r.period)),
  JSON.stringify([1, 2, 3]))

/* growing/shrinking a day */
const day = migrateToPeriods(legacyMonday)
const grow = withPeriodCount(day, 0, 7, (p) => slot('n' + p, 0, null, p))
eq('periods: grow adds blank rings', grow.added.length, 2)
eq('periods: grow keeps existing rings', grow.rows.filter((r) => r.period <= 5).length, 5)
eq('periods: grow result is 7 wide', grow.rows.length, 7)
const shrink = withPeriodCount(day, 0, 3, (p) => slot('n' + p, 0, null, p))
eq('periods: shrink trims the tail', shrink.removed.length, 2)
eq('periods: shrink result is 3 wide', shrink.rows.length, 3)
eq('periods: shrink removes the last rings, not the first',
  JSON.stringify(shrink.rows.map((r) => r.id)), JSON.stringify(['a', 'b', 'c']))
/* ---------------------------------------------- school-closure news (US6) */
/* FR-17/FR-19: silence is the default. A 21:00 popup is intrusive, so the
 * gate has to be right in BOTH directions — it must fire on a real closure
 * in the user's own region, and it must stay mute on stale news, on the
 * wrong province, on a negated headline and on a dead network. */

const NOW = Date.parse('2026-09-25T21:00:00+03:30')
const ago = (h) => new Date(NOW - h * 3600e3).toISOString()
const item = (title, ageH = 2, link = 'https://example.com/a') => ({
  title, link, pubDate: ago(ageH), source: 'bing.com',
})

/* --- positive: a real closure, in-region, fresh --- */
check('news: provincial closure fires',
  pickAlert([item('تعطیلی مدارس البرز در روز شنبه')], 'البرز', NOW) !== null)
check('news: non-homework closure fires',
  pickAlert([item('برخی مدارس البرز غیرحضوری شدند')], 'هشتگرد', NOW) !== null)
check('news: snow-day query fires',
  pickAlert([item('بارش برف مدارس البرز فردا تعطیلی شد')], 'کرج', NOW) !== null)

/* --- T049: region mismatch must be silent --- */
check('news: Alborz item does not alert Tehran',
  pickAlert([item('تعطیلی مدارس البرز در روز شنبه')], 'تهران', NOW) === null)
check('news: Tehran item does not alert Alborz',
  pickAlert([item('تعطیلی مدارس تهران در روز شنبه')], 'هشتگرد', NOW) === null)

/* --- weak titles: one keyword is not a signal --- */
check('news: a lone مدارس headline is silent',
  pickAlert([item('مدارس ابتدایی استان البرز'), item('مدارس البرز برقرار است')], 'البرز', NOW) === null)
check('news: start-of-year is not a closure',
  pickAlert([item('آغاز سال تحصیلی مدارس البرز')], 'البرز', NOW) === null)
check('news: an explicitly non-closure is silent',
  pickAlert([item('مدارس البرز تعطیل نیست')], 'البرز', NOW) === null)
check('news: an opening ceremony is silent',
  pickAlert([item('افتتاح مدارس البرز با حضور مسئولان')], 'البرز', NOW) === null)

/* --- T048: empty / stale / failing must mean silence, not an error --- */
eq('news: empty feed is null', pickAlert([], 'البرز', NOW), null)
eq('news: stale headline is dropped', pickAlert([item('تعطیلی مدارس البرز فردا', 40)], 'البرز', NOW), null)
eq('news: undated headline is dropped',
  pickAlert([{ title: 'تعطیلی مدارس البرز', link: '', pubDate: '', source: 'x' }], 'البرز', NOW), null)
check('news: future-dated headline is dropped',
  !isFresh(new Date(NOW + 6 * 3600e3).toISOString(), NOW))
check('news: 23h-old headline is still fresh', isFresh(ago(23), NOW))

/* a failed fetch must resolve to no candidates, never reject */
const deadFetcher = async () => { throw new Error('network down') }
check('news: a dead network yields no candidates',
  (await fetchCandidates('البرز', deadFetcher)).length === 0)

/* a non-ok payload must not become a signal */
const badFetcher = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'error', items: [] }) })
check('news: status!=ok yields no candidates',
  (await fetchCandidates('البرز', badFetcher)).length === 0)

/* a real rss2json payload flows through the same gate end-to-end */
const goodFetcher = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ status: 'ok', items: [
    { title: 'تعطیلی مدارس البرز در روز شنبه', link: 'https://b/1', pubDate: new Date(NOW - 3600e3).toUTCString() },
    { title: 'ورزش فوتبال اروپا', link: 'https://b/2', pubDate: new Date(NOW - 3600e3).toUTCString() },
  ] }),
})
const cands = await fetchCandidates('البرز', goodFetcher)
eq('news: primary parse returns both items', cands.length, 2)
check('news: end-to-end gate picks the closure',
  pickAlert(cands, 'البرز', NOW) !== null && pickAlert(cands, 'البرز', NOW).title.includes('البرز'))
check('news: primary is tried for every verified query', QUERIES.length === 4)
check('news: rss2json url encodes the Bing url',
  rss2jsonUrl('تعطیلی مدارس البرز').includes('https%3A%2F%2Fwww.bing.com%2Fnews%2Fsearch'))

/* dedupe: closure notices mutate, one story must not become four */
eq('news: near-identical titles collapse',
  dedupeTitles([item('تعطیلی مدارس البرز فردا'), item('تعطیلی مدارس البرز فردا')]).length, 1)

/* region vocabulary */
check('news: هشتگرد knows its province', regionTerms('هشتگرد').includes('البرز'))
check('news: تهران is not silently treated as Alborz', !regionTerms('تهران').includes('البرز'))
/* --------------------------------------------- local backup (US5, SC-06) */
/* Two guarantees: one file restores everything, and a bad file writes
 * nothing. Both are decided here, before any IndexedDB call, so they are
 * testable without a browser. */

const fakeStorage = (pairs) => {
  const map = new Map(pairs)
  return {
    get length() { return map.size },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
}

const samplePrefs = fakeStorage([
  ['anjam.skin', 'indigo'],
  ['anjam.themeMode', 'dark'],
  ['anjam.news.region', 'هشتگرد'],
  ['anjam.auth', '{"access_token":"SECRET"}'],
  ['anjam.aikey', 'sk-or-v1-SECRET'],
  ['other.key', 'ignored'],
])

const collected = collectPrefs(samplePrefs)
eq('backup: prefs collected', Object.keys(collected).length, 3)
check('backup: auth token is excluded', !('anjam.auth' in collected))
check('backup: AI key is excluded', !('anjam.aikey' in collected))
check('backup: non-anjam keys are ignored', !('other.key' in collected))
check('backup: secret detection is per-key', isSecretKey('anjam.auth') && !isSecretKey('anjam.skin'))

const goodData = {
  tasks: [{ id: 't1', updated_at: 'x' }],
  lists: [], labels: [], habits: [], dates: [], subjects: [],
  slots: [{ id: 's1', updated_at: 'x' }, { id: 's2', updated_at: 'x' }],
  homework: [], studyLogs: [], workoutPlans: [], workoutLogs: [],
}
const built = buildBackup(goodData, '2026-09-25T21:00:00.000Z')
eq('backup: envelope app', built.app, 'anjam')
eq('backup: envelope version', built.version, BACKUP_VERSION)
eq('backup: envelope carries prefs', Object.keys(built.prefs).length, 0)

const good = validateBackup(JSON.parse(JSON.stringify({ ...built, prefs: { 'anjam.skin': 'indigo' } })))
check('backup: a well-formed file validates', good.ok === true, JSON.stringify(good.errors))
eq('backup: no validation errors on a good file', good.errors.length, 0)

const badCases = [
  ['corrupt JSON', 'not-json', 'not an object'],
  ['wrong app', { ...built, app: 'other' }, 'app is not'],
  ['newer version', { ...built, version: BACKUP_VERSION + 1 }, 'newer than'],
  ['missing data', { app: 'anjam', version: 2, exported_at: 'x', prefs: {} }, 'data table missing'],
  ['missing table', { ...built, data: { ...goodData, tasks: undefined } }, 'table tasks missing'],
  ['row without id', { ...built, data: { ...goodData, tasks: [{ updated_at: 'x' }] } }, 'table tasks row 0 has no id'],
  ['missing exported_at', { app: 'anjam', version: 2, prefs: {}, data: goodData }, 'exported_at missing'],
]
for (const [label, payload, expect] of badCases) {
  const v = validateBackup(payload)
  check(`backup: rejected — ${label}`, v.ok === false && v.file === null, JSON.stringify(v.errors))
  check(`backup: rejected with a reason — ${label}`, v.errors.some((e) => e.includes(expect)), JSON.stringify(v.errors))
}

/* the summary the user confirms against, T044 */
const sum = summarize({ ...built, prefs: { a: '1', b: '2' } })
eq('backup: summary version', sum.version, BACKUP_VERSION)
eq('backup: summary prefs count', sum.prefs, 2)
eq('backup: summary row total', sum.rows, 3)
eq('backup: summary has every table', sum.tables.length, TABLES.length)
check('backup: summary names the big table', sum.tables.find((t) => t.key === 'tasks').count === 1)

/* a v1.3 export (version 1, no prefs) must still restore */
const legacy = validateBackup({ app: 'anjam', version: 1, exported_at: '2026-01-01', data: goodData })
check('backup: v1 exports still validate', legacy.ok === true, JSON.stringify(legacy.errors))
/* ------------------------------------------------------- US7 · AI */
const aiCtx = {
  lang: 'fa',
  today: '2026-09-26',
  tasks: [
    { title: 'گزارش', priority: 'p1', due: '2026-09-24', done: false },
    { title: 'خرید', priority: 'p4', due: null, done: false },
    { title: 'تماس', priority: 'p2', due: '2026-09-26', done: false },
    { title: 'تمیزکاری', priority: 'p3', due: null, done: true },
  ],
  counts: { open: 3, done: 1, overdue: 1 },
  timetable: [
    { weekday: 0, periods: 11, subjects: ['ریاضی', 'ریاضی', 'فیزیک'] },
    { weekday: 1, periods: 0, subjects: [] },
    { weekday: 2, periods: 2, subjects: ['ادبیات'] },
  ],
}

// T058 — the payload is the privacy boundary: no notes, no email, no ids.
const payload = JSON.stringify(buildPayload('day', aiCtx, 'free/model'))
const pl = buildPayload('day', aiCtx, 'm')
check('ai: payload carries no notes field', !/"notes"/.test(payload), payload.slice(0, 200))
check('ai: payload carries no email', !/@|email/i.test(payload), payload.slice(0, 200))
check('ai: payload carries no id field', !/"id"\s*:/.test(payload), payload.slice(0, 200))
check('ai: payload carries no supabase/token', !/supabase|access_token|refresh_token|eyJ/i.test(payload))
check('ai: the key is never in the body', !/sk-or/.test(payload))
eq('ai: payload carries the model', pl.model !== undefined, true)
eq('ai: temperature is low', pl.temperature, 0.2)
check('ai: max_tokens in 400-700', pl.max_tokens >= 400 && pl.max_tokens <= 700)

// T063 — every analysis has a local implementation, in both languages.
for (const id of ANALYSES) {
  const r = localAnalysis(id, aiCtx)
  check(`ai: ${id} has a local result`, r.source === 'local' && r.lines.length > 0, JSON.stringify(r.lines))
  check(`ai: ${id} note says it was local`, /محلی|local/i.test(r.note), r.note)
  const en = localAnalysis(id, { ...aiCtx, lang: 'en' })
  check(`ai: ${id} english twin exists`, en.lines.length > 0, JSON.stringify(en.lines))
  const again = localAnalysis(id, aiCtx)
  check(`ai: ${id} is deterministic`, JSON.stringify(r.lines) === JSON.stringify(again.lines))
}

// ordering: overdue beats priority beats due date
const order = orderedOpen(aiCtx.tasks, aiCtx.today).map((t) => t.title)
eq('ai: overdue comes first', order[0], 'گزارش')
eq('ai: high priority next', order[1], 'تماس')
eq('ai: done tasks never enter the plan', order.length, 3)
eq('ai: time box by priority', timeBox('p1'), 45)
eq('ai: time box floor', timeBox('p4'), 10)

const dayLines = localDay(aiCtx).join('\n')
check('ai: day plan names the overdue task', dayLines.includes('گزارش'))
check('ai: day plan carries a time box', /\d+ (دقیقه|min)/.test(dayLines), dayLines)
const emptyDay = localDay({ ...aiCtx, tasks: [] }).join('\n')
check('ai: an empty day says so', /هیچ|نداری|Nothing due|empty/i.test(emptyDay), emptyDay)

const tt = localTimetable(aiCtx).join('\n')
check('ai: timetable flags an overloaded day', tt.includes('شنبه') && /۱۱|11/.test(tt), tt)
check('ai: timetable flags an empty day', /یکشنبه|Sun/.test(tt), tt)
check('ai: timetable flags a thin day', /دوشنبه|Mon/.test(tt), tt)
check('ai: timetable flags back-to-back subjects', /پشت‌سرهم|back-to-back/i.test(tt), tt)
const ttOk = localTimetable({
  ...aiCtx,
  timetable: [
    { weekday: 0, periods: 6, subjects: ['ریاضی', 'فیزیک', 'ادبیات'] },
    { weekday: 1, periods: 6, subjects: ['شیمی', 'زیست'] },
  ],
}).join('\n')
check('ai: a healthy timetable is called healthy', /سالم|balanced/.test(ttOk), ttOk)

const bl = localBacklog(aiCtx).join('\n')
// 2 land in "today" (one overdue, one p2), 0 are deferred, and 1 is droppable
// — so the headline must say 2/0/1, not 3/0/0. Template-interpolated counts
// are Latin digits, so the assertion accepts both digit sets.
check('ai: backlog counts the buckets', /(?:[2۲]) کار امروز|(?:2) today/.test(bl), bl)
check('ai: backlog keeps undated low-priority work out of today', /(?:[1۱]) حذف‌شدنی|(?:1) droppable/.test(bl), bl)
check('ai: backlog gives a reason per task', bl.split('\n').filter((l) => l.startsWith('•')).length >= 1, bl)

const wk = localWeekly(aiCtx).join('\n')
check('ai: weekly states what slipped', /جا ماند|slipped/.test(wk), wk)
check('ai: weekly proposes one change', /یک تغییر|One change/.test(wk), wk)

// reply parsing must tolerate a model that ignores the JSON instruction
eq('ai: json array reply', parseReply('["a","b"]').length, 2)
eq('ai: json object reply', parseReply('{"lines":["x","y"]}').length, 2)
check('ai: plain text reply survives', parseReply('خط اول\nخط دوم').length >= 1)
check('ai: empty reply is empty', parseReply('').length === 0)
check('ai: list markers are stripped', !parseReply('- item').join('').startsWith('-'))

// 429 → a different free model, exactly one suggestion
const models = [
  { id: 'a/one', name: 'One' },
  { id: 'b/two', name: 'Two' },
  { id: 'a/three', name: 'Three' },
]
const nxt = otherModel('a/one', models)
check('ai: suggests a different model', nxt !== null && nxt.id !== 'a/one', JSON.stringify(nxt))
eq('ai: no second suggestion without a second model', otherModel('only/x', [{ id: 'only/x', name: 'Only' }]), null)

eq('ai: chat endpoint is openrouter', OPENROUTER_CHAT, 'https://openrouter.ai/api/v1/chat/completions')
check('ai: every analysis has a system prompt in both languages',
  ANALYSES.every((id) => SYSTEM_PROMPTS[id].fa.length > 10 && SYSTEM_PROMPTS[id].en.length > 10))

// the failure path must be a typed error the panel can swallow
const err = new AiError(429, 'rate limited')
eq('ai: error keeps its status', err.status, 429)
check('ai: error is catchable as Error', err instanceof Error)

/* ------------------------------------------------------- report */
if (failures.length) {
  console.error(`UNIT_FAIL ${pass} passed, ${failures.length} failed`)
  for (const f of failures) console.error('  FAIL ' + f)
  process.exit(1)
}
console.log(`UNIT_OK ${pass} checks passed`)
