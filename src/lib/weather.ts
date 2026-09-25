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
export async function resolveLoc(lang: Lang): Promise<{ lat: number; lon: number; place: string }> {
  const saved = readSavedLoc()
  if (saved) return saved
  try {
    const g = await browserGeo()
    const place = (await reversePlace(g.lat, g.lon, lang)) || (lang === 'fa' ? 'موقعیت من' : 'My location')
    const loc = { ...g, place }
    saveLoc(loc)
    return loc
  } catch { /* fall through to IP */ }
  try {
    const ip = await ipGeo()
    saveLoc(ip)
    return ip
  } catch { /* fall through to default */ }
  const fallback = { lat: 35.6892, lon: 51.389, place: lang === 'fa' ? 'تهران' : 'Tehran' }
  saveLoc(fallback)
  return fallback
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

/** Fetch current conditions for a coordinate (Open-Meteo, no API key). */
async function fetchAt(lat: number, lon: number, place: string): Promise<WeatherNow> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min&temperature_unit=celsius` +
    `&wind_speed_unit=kmh&timezone=auto&forecast_days=1`
  const r = await fetch(url)
  if (!r.ok) throw new Error('weather-http-' + r.status)
  const j = (await r.json()) as {
    current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number }
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] }
  }
  const cur = j.current || {}
  return {
    temp: Math.round(cur.temperature_2m ?? 0),
    hi: Math.round(j.daily?.temperature_2m_max?.[0] ?? cur.temperature_2m ?? 0),
    lo: Math.round(j.daily?.temperature_2m_min?.[0] ?? cur.temperature_2m ?? 0),
    code: cur.weather_code ?? 0,
    wind: Math.round(cur.wind_speed_10m ?? 0),
    place,
    at: Date.now(),
    loc: { lat, lon },
  }
}

/** Current conditions for the saved location; cached for 20 minutes.
 *  On network failure returns the last cached value rather than nothing. */
export async function fetchWeather(lang: Lang, force = false): Promise<WeatherNow> {
  const cache = readCache()
  if (!force && cache.w && Date.now() - cache.w.at < TTL_MS) return cache.w
  const loc = await resolveLoc(lang)
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
