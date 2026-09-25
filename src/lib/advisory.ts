/**
 * v1.4.0 — night weather advisory (US2, FR-04/05/06).
 *
 * The user asked for one thing: between 21:00 and 08:00, if the app is open,
 * say something **only when the weather actually matters** — an umbrella, a
 * warmer coat, a slippery road — and stay silent otherwise. Silence is the
 * default, not a fallback.
 *
 * This module is deliberately pure: `evaluate()` takes a date and a forecast
 * and returns a message key or `null`. No timers, no fetch, no side effects,
 * which is what makes it unit-testable (scripts/unit.mjs) and what keeps the
 * UI layer (components/Advisory.tsx) free of rules.
 *
 * The message text lives in src/lib/i18n.ts (FR-18), so this file never
 * contains user-facing prose — only keys.
 */

/** Advisory window in local minutes-from-midnight. 21:00 → 08:00, crossing
 *  midnight, so it is expressed as two numbers rather than a range. */
export const WINDOW_START = 21 * 60 // 21:00
export const WINDOW_END = 8 * 60 //  08:00 (exclusive)

/** FR-04: at most once per hour inside the window. */
export const EVAL_INTERVAL_MS = 60 * 60 * 1000

/** Minimum gap between two different advisories, so a re-render or a wake
 *  three minutes later does not notify the same advice twice. */
export const REPEAT_SUPPRESS_MS = 4 * 60 * 60 * 1000

export type AdvisoryKey =
  | 'advRain' | 'advHeavyRain' | 'advSnow' | 'advSleet' | 'advShower'
  | 'advStorm' | 'advHail' | 'advCold' | 'advVeryCold' | 'advHot'
  | 'advFog' | 'advWind' | 'advHumid' | 'advClouds'

export interface Forecast {
  /** WMO weather code (Open-Meteo `weathercode`) */
  code: number
  isDay: boolean
  /** current temperature, °C */
  tempNow: number
  /** tonight's low / high, °C */
  tempMin: number
  tempMax: number
  /** probability of precipitation tonight, 0-100 */
  precipProb: number
  /** millimetres of precipitation tonight */
  precipMm: number
  /** max wind speed tonight, km/h */
  windMax: number
  /** relative humidity tonight, 0-100 */
  humidity: number
  /** max UV index during the day, 0-11+ */
  uvIndex: number
}

export interface Advisory {
  key: AdvisoryKey
  /** 1 = most urgent (storm, snow, very cold) … 5 = mild (clouds) */
  severity: 1 | 2 | 3 | 4 | 5
}

const minOfDay = (d: Date): number => d.getHours() * 60 + d.getMinutes()

/** Is this moment inside the 21:00 → 08:00 window? (FR-04) */
export function isNightWindow(now: Date): boolean {
  const m = minOfDay(now)
  return m >= WINDOW_START || m < WINDOW_END
}

/**
 * Milliseconds until the *next* boundary of the window:
 *   - outside → until it opens (21:00)
 *   - inside  → until it closes (08:00, possibly tomorrow)
 *
 * The window crosses midnight, so "inside" is two branches and the
 * >21:00 branch has to add the day. Getting this wrong is exactly how a
 * feature silently stops running (the first implementation here returned
 * the minutes to 00:00, which is not a boundary of anything).
 */
export function msUntilNextWindow(now: Date): number {
  const m = minOfDay(now)
  const inside = m >= WINDOW_START || m < WINDOW_END
  if (inside) {
    const untilClose = m >= WINDOW_START ? (24 * 60 - m) + WINDOW_END : WINDOW_END - m
    return untilClose * 60_000
  }
  return (WINDOW_START - m) * 60_000
}

/* ------------------------------------------------------------------ *
 * WMO code families
 * ------------------------------------------------------------------ */
const isThunder = (c: number) => c >= 95
const isHail = (c: number) => c === 96 || c === 99
const isSleet = (c: number) => c === 56 || c === 57 || c === 66 || c === 67
const isSnow = (c: number) => c >= 71 && c <= 77
const isDrizzle = (c: number) => c >= 51 && c <= 55
const isFreezingRain = (c: number) => c >= 56 && c <= 67
const isRain = (c: number) => (c >= 61 && c <= 67) || c >= 80
const isFog = (c: number) => c >= 45 && c <= 48
const isOvercast = (c: number) => c === 3

/**
 * Rate every condition class the user listed, then return the most urgent.
 *
 * Severity ordering is deliberate, not alphabetical: a storm outranks a cold
 * snap, because you can put a coat on but you cannot stop hail.
 */
export function evaluate(now: Date, f: Forecast, _lang: 'fa' | 'en'): Advisory | null {
  // outside the window the engine does not speak at all (FR-04)
  if (!isNightWindow(now)) return null

  const c = f.code
  const candidates: Array<{ key: AdvisoryKey; severity: 1 | 2 | 3 | 4 | 5 }> = []

  // --- precipitation -------------------------------------------------
  if (isThunder(c)) {
    // thunder with hail is the worst case in the whole table
    candidates.push({ key: isHail(c) ? 'advHail' : 'advStorm', severity: 1 })
  } else if (isSleet(c) || (isFreezingRain(c) && f.tempNow <= 1)) {
    candidates.push({ key: 'advSleet', severity: 2 })
  } else if (isSnow(c)) {
    candidates.push({ key: 'advSnow', severity: 2 })
  } else if (c === 81 || c === 82) {
    candidates.push({ key: 'advHeavyRain', severity: 2 })
  } else if (isRain(c) || isDrizzle(c)) {
    // a passing shower is a lighter matter than steady rain
    const heavy = c === 63 || c === 65 || (f.precipProb >= 60 && f.precipMm >= 4)
    const light = c === 80 || isDrizzle(c)
    candidates.push({ key: heavy ? 'advHeavyRain' : light ? 'advShower' : 'advRain', severity: heavy ? 2 : 3 })
  } else if (f.precipProb >= 50 && f.precipMm >= 1) {
    // no code says rain, but the numbers do
    candidates.push({ key: f.precipMm >= 5 ? 'advHeavyRain' : 'advRain', severity: 3 })
  }

  // --- temperature ---------------------------------------------------
  if (typeof f.tempMin === 'number') {
    if (f.tempMin <= -5) candidates.push({ key: 'advVeryCold', severity: 1 })
    else if (f.tempMin <= 2) candidates.push({ key: 'advCold', severity: 2 })
    else if (f.tempMin <= 8) candidates.push({ key: 'advCold', severity: 3 })
    else if (f.tempMax >= 38) candidates.push({ key: 'advHot', severity: 2 })
    else if (f.tempMax >= 33) candidates.push({ key: 'advHot', severity: 3 })
  }

  // --- visibility / wind / humidity ---------------------------------
  if (isFog(c)) candidates.push({ key: 'advFog', severity: 2 })
  if (f.windMax >= 60) candidates.push({ key: 'advWind', severity: 2 })
  else if (f.windMax >= 40) candidates.push({ key: 'advWind', severity: 3 })
  if (f.humidity >= 90) candidates.push({ key: 'advHumid', severity: 4 })

  // --- the one case that is not a warning -----------------------------
  // A clear, mild, calm night is the majority of nights in Iran. Saying
  // "overcast tonight" for a cloudless night would teach the user to ignore
  // the popup, so a mild clear sky returns nothing (FR-19 spirit).
  if (candidates.length === 0) {
    if (isOvercast(c)) return { key: 'advClouds', severity: 5 }
    return null
  }

  candidates.sort((a, b) => a.severity - b.severity)
  return candidates[0]
}

/**
 * Should this advisory be shown, given what we already showed tonight?
 * Pure so the caller (Advisory.tsx) stays a dumb renderer.
 */
export function shouldShow(
  now: Date,
  adv: Advisory,
  lastRunAt: number | null,
  lastKey: string
): boolean {
  if (lastRunAt == null) return true
  if (now.getTime() - lastRunAt < EVAL_INTERVAL_MS) return false
  if (adv.key === lastKey && now.getTime() - lastRunAt < REPEAT_SUPPRESS_MS) return false
  return true
}
