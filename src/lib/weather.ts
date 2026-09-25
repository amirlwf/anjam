/** Minimal, keyless weather: Open-Meteo for data, three-layer location
 *  (cached → browser geolocation → IP → Tehran fallback), 20-minute cache.
 *  Everything degrades to the last known value when offline. */
import type { Lang } from '../types'

export interface WeatherNow {
  temp: number // °C, current
  hi: number
  lo: number
  code: number // WMO weather code
  wind: number // km/h
  place: string
  at: number // fetched-at epoch ms
  loc: { lat: number; lon: number }
  /** v1.4.0 — fields the night advisory needs (FR-05). All optional so an
   *  older cache entry written by v1.3 still parses. */
  night?: NightOutlook
}

/** The coming night, as the advisory engine wants to see it. */
export interface NightOutlook {
  tempMin: number
  tempMax: number
  precipProb: number // %
  precipMm: number
  windMax: number // km/h
  humidity: number // %
  uvIndex: number
  isDay: boolean
  /** the WMO code the night is mostly made of (the worst of the hours) */
  nightCode: number
}

const DATA_KEY = 'anjam.weather' // { w: WeatherNow, loc }
const LOC_KEY = 'anjam.weather.loc' // { lat, lon, place }
const TTL_MS = 20 * 60 * 1000

interface Cached {
  w?: WeatherNow
  loc?: { lat: number; lon: number; place: string }
}

function readCache(): Cached {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) return JSON.parse(raw) as Cached
  } catch { /* ignore */ }
  return {}
}

function writeCache(c: Cached): void {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(c))
  } catch { /* ignore */ }
}

/** Last known conditions, for an instant first paint (may be stale). */
export function cachedWeather(): WeatherNow | null {
  return readCache().w ?? null
}

export function readSavedLoc(): { lat: number; lon: number; place: string } | null {
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (raw) return JSON.parse(raw) as { lat: number; lon: number; place: string }
  } catch { /* ignore */ }
  return readCache().loc ?? null
}

export function saveLoc(loc: { lat: number; lon: number; place: string }): void {
  try {
    localStorage.setItem(LOC_KEY, JSON.stringify(loc))
  } catch { /* ignore */ }
  writeCache({ ...readCache(), loc })
}

/** Reverse-geocode a coordinate to a locality name (no key, CORS-open). */
async function reversePlace(lat: number, lon: number, lang: Lang): Promise<string> {
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang === 'fa' ? 'fa' : 'en'}`
    )
    const j = (await r.json()) as { city?: string; locality?: string; countryName?: string }
    return j.city || j.locality || j.countryName || ''
  } catch {
    return ''
  }
}

function browserGeo(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('no-geo'))
    const to = setTimeout(() => reject(new Error('geo-timeout')), 7000)
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(to); resolve({ lat: p.coords.latitude, lon: p.coords.longitude }) },
      (e) => { clearTimeout(to); reject(new Error(e.message || 'geo-denied')) },
      { enableHighAccuracy: false, timeout: 6500, maximumAge: 30 * 60 * 1000 }
    )
  })
}

async function ipGeo(): Promise<{ lat: number; lon: number; place: string }> {
  const r = await fetch('https://ipwho.is/')
  const j = (await r.json()) as { success?: boolean; city?: string; latitude?: number; longitude?: number }
  if (!j.success || typeof j.latitude !== 'number' || typeof j.longitude !== 'number') {
    throw new Error('ip-failed')
  }
  return { lat: j.latitude, lon: j.longitude, place: j.city || '' }
}

/** Resolve the location once and remember it. */
export async function resolveLoc(lang: Lang, allowGeo = false): Promise<{ lat: number; lon: number; place: string }> {
  const saved = readSavedLoc()
  if (saved) return saved
  // Geolocation shows a permission prompt, so it must never fire on app
  // boot — only after an explicit user action (the "my location" button).
  if (allowGeo) {
    try {
      const g = await browserGeo()
      const place = (await reversePlace(g.lat, g.lon, lang)) || (lang === 'fa' ? 'موقعیت من' : 'My location')
      const loc = { ...g, place }
      saveLoc(loc)
      return loc
    } catch { /* fall through to IP */ }
  }
  try {
    const ip = await ipGeo()
    saveLoc(ip)
    return ip
  } catch { /* fall through to default */ }
  const fallback = { lat: 35.6892, lon: 51.389, place: lang === 'fa' ? 'تهران' : 'Tehran' }
  saveLoc(fallback)
  return fallback
}

/** Explicit "use my location" action — prompts geolocation on purpose. */
export async function myLocation(lang: Lang): Promise<{ lat: number; lon: number; place: string }> {
  const g = await browserGeo()
  const place = (await reversePlace(g.lat, g.lon, lang)) || (lang === 'fa' ? 'موقعیت من' : 'My location')
  const loc = { ...g, place }
  saveLoc(loc)
  return loc
}

/** City search through Open-Meteo's free geocoder. */
export async function searchPlace(
  q: string,
  lang: Lang
): Promise<Array<{ lat: number; lon: number; name: string; detail: string }>> {
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=${lang === 'fa' ? 'fa' : 'en'}`
    )
    const j = (await r.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country?: string }>
    }
    return (j.results || []).map((x) => ({
      lat: x.latitude,
      lon: x.longitude,
      name: x.name,
      detail: [x.admin1, x.country].filter(Boolean).join('، '),
    }))
  } catch {
    return []
  }
}

/**
 * Severity order used to pick the one code that represents the whole night.
 * Low value = the most conditions the user would want to know about, so the
 * advisory never says "clear" while hail is forecast at 03:00.
 */
const WMO_SEVERITY: Record<number, number> = {
  0: 0, 1: 0, 2: 1, 3: 2, 45: 4, 48: 4,
  51: 5, 53: 6, 55: 7, 56: 8, 57: 8,
  61: 6, 63: 8, 65: 9, 66: 9, 67: 9,
  71: 6, 73: 8, 75: 10, 77: 7,
  80: 5, 81: 7, 82: 9, 85: 7, 86: 9,
  95: 10, 96: 11, 99: 11
}
const worstCode = (codes: number[]): number => {
  let best = 0
  let worst = -1
  for (const c of codes) {
    const s = WMO_SEVERITY[c] ?? 1
    if (s > worst) { worst = s; best = c }
  }
  return best
}

/**
 * Fetch current conditions for a coordinate (Open-Meteo, no API key).
 *
 * Two calls, deliberately: `current` for what it is like now, and an hourly
 * slice for tonight. Asking one combined URL for tomorrow's daily aggregates
 * would be wrong for a 21:00–08:00 window, which is *tonight*, not *tomorrow*.
 */
async function fetchAt(lat: number, lon: number, place: string): Promise<WeatherNow> {
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
  const common = `&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`

  const [nowRes, nightRes] = await Promise.all([
    fetch(
      base + common +
      '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day' +
      '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1',
      { signal: abortAfter(12_000) }
    ),
    // tonight only: past_days=1 so a 23:00 call still has the whole night
    fetch(
      base + common +
      '&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m,relative_humidity_2m,uv_index' +
      '&forecast_days=1&past_days=1',
      { signal: abortAfter(12_000) }
    ).catch(() => null)
  ])

  if (!nowRes.ok) throw new Error('weather-http-' + nowRes.status)
  const j = (await nowRes.json()) as {
    current?: {
      temperature_2m?: number; weather_code?: number; wind_speed_10m?: number
      relative_humidity_2m?: number; is_day?: number
    }
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] }
  }
  const cur = j.current || {}

  const night = nightRes && nightRes.ok
    ? buildNight(await nightRes.json() as Hourly, new Date())
    : undefined

  return {
    temp: Math.round(cur.temperature_2m ?? 0),
    hi: Math.round(j.daily?.temperature_2m_max?.[0] ?? cur.temperature_2m ?? 0),
    lo: Math.round(j.daily?.temperature_2m_min?.[0] ?? cur.temperature_2m ?? 0),
    code: cur.weather_code ?? 0,
    wind: Math.round(cur.wind_speed_10m ?? 0),
    place,
    at: Date.now(),
    loc: { lat, lon },
    night
  }
}

interface Hourly {
  time?: string[]
  temperature_2m?: number[]
  weather_code?: number[]
  precipitation_probability?: number[]
  precipitation?: number[]
  wind_speed_10m?: number[]
  relative_humidity_2m?: number[]
  uv_index?: number[]
}

/** "2026-09-25T22:00" (or with seconds) as a LOCAL Date, or null. */
function parseLocalStamp(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s.trim())
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

function abortAfter(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms)
  } catch {
    return undefined
  }
}

/**
 * Reduce the hourly series to the 21:00 → 08:00 window that contains `now`,
 * rolling over to the next day after midnight. Returns undefined rather than
 * guessing when the series does not line up (FR-19: no invented data).
 */
export function buildNight(h: Hourly, now: Date): NightOutlook | undefined {
  const times = h.time
  const temps = h.temperature_2m
  if (!times || !temps || times.length === 0) return undefined

  const inWindow: number[] = []
  for (let i = 0; i < times.length; i++) {
    // Open-Meteo sends "2026-09-25T22:00" with timezone=auto — no offset.
    // `new Date(str)` would read that as UTC, so on a +03:30 device "22:00"
    // becomes 01:30 local and the whole night window shifts. Parse the
    // components as local time instead.
    const t = parseLocalStamp(times[i])
    if (!t) continue
    // the times are local to the forecast timezone, which is the device's
    // own zone (timezone=auto) — so local hours are the right comparison
    const h24 = t.getHours()
    if (h24 >= 21 || h24 < 8) inWindow.push(i)
  }
  if (inWindow.length === 0) return undefined

  const pick = (arr?: number[]): number[] =>
    inWindow
      .map(i => arr?.[i])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const tempsW = pick(temps)
  const codesW = pick(h.weather_code)
  const windW = pick(h.wind_speed_10m)
  const humW = pick(h.relative_humidity_2m)
  const uvW = pick(h.uv_index)

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
  const precipW = pick(h.precipitation)
  const probW = pick(h.precipitation_probability)

  return {
    tempMin: tempsW.length ? Math.min(...tempsW) : (h.temperature_2m?.[0] ?? 0),
    tempMax: tempsW.length ? Math.max(...tempsW) : (h.temperature_2m?.[0] ?? 0),
    precipProb: probW.length ? Math.max(...probW) : 0,
    precipMm: precipW.length ? Number(sum(precipW).toFixed(1)) : 0,
    windMax: windW.length ? Math.round(Math.max(...windW)) : 0,
    humidity: humW.length ? Math.round(sum(humW) / humW.length) : 50,
    uvIndex: uvW.length ? Math.max(...uvW) : 0,
    isDay: false,
    nightCode: codesW.length ? worstCode(codesW) : (h.weather_code?.[0] ?? 0)
  }
}

/** Current conditions for the saved location; cached for 20 minutes.
 *  On network failure returns the last cached value rather than nothing. */
export async function fetchWeather(lang: Lang, force = false, allowGeo = false): Promise<WeatherNow> {
  const cache = readCache()
  if (!force && cache.w && Date.now() - cache.w.at < TTL_MS) return cache.w
  const loc = await resolveLoc(lang, allowGeo)
  const w = await fetchAt(loc.lat, loc.lon, loc.place || cache.w?.place || '')
  writeCache({ ...cache, loc, w })
  return w
}

/* ---------------- WMO code → text + icon ---------------- */

export type WeatherIconName =
  | 'clear-day' | 'clear-night'
  | 'partly' | 'cloudy' | 'overcast' | 'fog'
  | 'drizzle' | 'rain' | 'sleet'
  | 'snow' | 'showers' | 'snow-showers'
  | 'thunder'

export function wmoInfo(code: number, lang: Lang): { text: string; icon: WeatherIconName } {
  const map: Record<number, [WeatherIconName, string, string]> = {
    // [icon, fa, en]
    0: ['clear-day', 'صاف', 'Clear'],
    1: ['clear-day', 'عمدتاً صاف', 'Mainly clear'],
    2: ['partly', 'نیمه‌ابری', 'Partly cloudy'],
    3: ['overcast', 'ابری', 'Overcast'],
    45: ['fog', 'مه', 'Fog'],
    48: ['fog', 'مه یخ‌زده', 'Rime fog'],
    51: ['drizzle', 'نم‌باران', 'Light drizzle'],
    53: ['drizzle', 'نم‌باران', 'Drizzle'],
    55: ['drizzle', 'نم‌باران', 'Heavy drizzle'],
    56: ['sleet', 'نم‌باران یخی', 'Freezing drizzle'],
    57: ['sleet', 'نم‌باران یخی', 'Freezing drizzle'],
    61: ['rain', 'باران خفیف', 'Light rain'],
    63: ['rain', 'باران', 'Rain'],
    65: ['rain', 'باران شدید', 'Heavy rain'],
    66: ['sleet', 'باران یخی', 'Freezing rain'],
    67: ['sleet', 'باران یخی', 'Freezing rain'],
    71: ['snow', 'برف خفیف', 'Light snow'],
    73: ['snow', 'برف', 'Snow'],
    75: ['snow', 'برف شدید', 'Heavy snow'],
    77: ['snow', 'دانه‌های برف', 'Snow grains'],
    80: ['showers', 'باران پراکنده', 'Showers'],
    81: ['showers', 'باران پراکنده', 'Showers'],
    82: ['showers', 'رگبار شدید', 'Violent showers'],
    85: ['snow-showers', 'رگبار برف', 'Snow showers'],
    86: ['snow-showers', 'رگبار برف', 'Snow showers'],
    95: ['thunder', 'طوفان رعد و برق', 'Thunderstorm'],
    96: ['thunder', 'طوفان با تگرگ', 'Thunder + hail'],
    99: ['thunder', 'طوفان با تگرگ', 'Thunder + hail'],
  }
  const hit = map[code] || map[0]
  return { icon: hit[0], text: lang === 'fa' ? hit[1] : hit[2] }
}
