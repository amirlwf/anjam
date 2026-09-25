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

/* ------------------------------------------------------- report */
if (failures.length) {
  console.error(`UNIT_FAIL ${pass} passed, ${failures.length} failed`)
  for (const f of failures) console.error('  FAIL ' + f)
  process.exit(1)
}
console.log(`UNIT_OK ${pass} checks passed`)
