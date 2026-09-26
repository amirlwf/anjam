import { useEffect, useRef, useState } from 'react'
import type { Lang } from '../types'
import { t, toFaDigits } from '../lib/i18n'
import { applyStoredTheme } from '../lib/appearance'
import {
  cachedWeather,
  fetchWeather,
  myLocation,
  saveLoc,
  searchPlace,
  wmoInfo,
  type WeatherIconName,
  type WeatherNow,
} from '../lib/weather'
import { Loc, Refresh, Search, X } from './Icons'

const CLOUD = 'M17.5 19a4.5 4.5 0 0 0 .4-8.98A6 6 0 0 0 6.3 10.2 4 4 0 0 0 7 19h10.5z'

/** Tiny stroke-weather glyph set — matches the app's line-icon style. */
function WIcon({ name, night = false, size = 18 }: { name: WeatherIconName; night?: boolean; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'clear-day':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </svg>
      )
    case 'clear-night':
      return (
        <svg {...p}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
        </svg>
      )
    case 'partly':
      return night ? (
        <svg {...p}>
          <path d="M15.5 4.5A6.5 6.5 0 0 0 18 16.6" />
          <path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6 6 0 0 0 6.3 10.2 4 4 0 0 0 7 19h10.5z" />
        </svg>
      ) : (
        <svg {...p}>
          <circle cx="8" cy="7.5" r="3" />
          <path d="M8 2v1.5M2.8 7.5H4.3M4.4 3.9l1 1M11.6 3.9l-1 1" />
          <path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6 6 0 0 0 6.3 10.2 4 4 0 0 0 7 19h10.5z" />
        </svg>
      )
    case 'cloudy':
    case 'overcast':
      return (
        <svg {...p}>
          <path d={CLOUD} />
          {name === 'overcast' && <path d="M6.5 8.5A4 4 0 0 1 10 6" />}
        </svg>
      )
    case 'fog':
      return (
        <svg {...p}>
          <path d="M17.5 16.5a4.5 4.5 0 0 0 .4-8.98A6 6 0 0 0 6.3 7.7 4 4 0 0 0 7 16.5h10.5z" />
          <path d="M6 19h12M8 21.5h8" />
        </svg>
      )
    case 'drizzle':
    case 'rain':
    case 'sleet':
      return (
        <svg {...p}>
          <path d={CLOUD} />
          <path d={name === 'rain' ? 'M8.5 19.5 7.5 22M12 19.5 11 22M15.5 19.5 14.5 22' : 'M8.5 20v1.5M12 20v1.5M15.5 20v1.5'} />
        </svg>
      )
    case 'showers':
      return (
        <svg {...p}>
          <path d={CLOUD} />
          <path d="M8.5 19.5 7.5 22M12 19.5 11 22M15.5 19.5 14.5 22" />
        </svg>
      )
    case 'snow':
    case 'snow-showers':
      return (
        <svg {...p}>
          <path d={CLOUD} />
          <path d="M8.5 20.2v1.6M7.7 20.6l1.6.8M9.3 20.6l-1.6.8M15.5 20.2v1.6M14.7 20.6l1.6.8M16.3 20.6l-1.6.8M12 19.8v1.6M11.2 20.2l1.6.8M12.8 20.2l-1.6.8" />
        </svg>
      )
    case 'thunder':
      return (
        <svg {...p}>
          <path d={CLOUD} />
          <path d="M13 16.5 10 21h3.2l-1.4 3" />
        </svg>
      )
  }
}

function isNight(): boolean {
  const h = new Date().getHours()
  return h >= 19 || h < 6
}

export default function WeatherChip({ lang }: { lang: Lang }) {
  const tt = (k: string) => t(lang, k)
  const [w, setW] = useState<WeatherNow | null>(() => cachedWeather())
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Array<{ lat: number; lon: number; name: string; detail: string }>>([])
  const wrapRef = useRef<HTMLDivElement | null>(null)

  async function load(force = false) {
    setBusy(true)
    try {
      const next = await fetchWeather(lang, force)
      setW(next)
      setErr(false)
      // A fresh condition can change the weather-reactive accent (FR-12);
      // re-apply so the variable theme tracks the forecast, not the boot.
      applyStoredTheme()
    } catch {
      if (!cachedWeather()) setErr(true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Purposeful geolocation: only this button may trigger the permission prompt. */
  async function useMyLoc() {
    setBusy(true)
    try {
      await myLocation(lang)
      setQ('')
      setResults([])
      const next = await fetchWeather(lang, true)
      setW(next)
      setErr(false)
      applyStoredTheme()
    } catch {
      if (!cachedWeather()) setErr(true)
    } finally {
      setBusy(false)
    }
  }

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function doSearch(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (!term) return
    setResults(await searchPlace(term, lang))
  }

  function pick(loc: { lat: number; lon: number; name: string }) {
    saveLoc({ lat: loc.lat, lon: loc.lon, place: loc.name })
    setQ('')
    setResults([])
    void load(true)
  }

  const info = w ? wmoInfo(w.code, lang) : null
  const temp = w ? `${toFaDigits(w.temp)}°` : '··°'
  const updated =
    w && lang === 'fa'
      ? toFaDigits(new Date(w.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))
      : w
        ? new Date(w.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : ''

  return (
    <div className="weather-wrap" ref={wrapRef}>
      <button
        className={`weather-chip ${busy ? 'is-busy' : ''} ${err && !w ? 'is-err' : ''}`}
        data-testid="weather-chip"
        title={tt('weatherRefresh')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="wc-icon">{info ? <WIcon name={info.icon} night={isNight()} /> : <WIcon name="partly" />}</span>
        <span className="wc-temp">{temp}</span>
        {w && <span className="wc-place">{w.place}</span>}
      </button>

      {open && (
        <div className="weather-pop" data-testid="weather-pop">
          <div className="wp-head">
            <div className="wp-place">
              <b>{w ? w.place : '—'}</b>
              <span className="muted small">{w ? updated : tt('weatherErr')}</span>
            </div>
            <button className="icon-btn" onClick={() => void useMyLoc()} title={tt('weatherMyLoc')}>
              <Loc width={15} height={15} />
            </button>
            <button className="icon-btn" onClick={() => void load(true)} title={tt('weatherRefresh')}>
              <Refresh width={15} height={15} className={busy ? 'spin' : ''} />
            </button>
            <button className="icon-btn" onClick={() => setOpen(false)} title={tt('close')}>
              <X width={15} height={15} />
            </button>
          </div>

          {w && info && (
            <div className="wp-main">
              <span className="wp-icon">
                <WIcon name={info.icon} night={isNight()} size={44} />
              </span>
              <div className="wp-temp-block">
                <span className="wp-temp">{toFaDigits(w.temp)}°</span>
                <span className="wp-cond muted">{info.text}</span>
              </div>
              <div className="wp-meta">
                <span>
                  {tt('weatherHi')} {toFaDigits(w.hi)}° · {tt('weatherLo')} {toFaDigits(w.lo)}°
                </span>
                <span>
                  {tt('weatherWind')} {toFaDigits(w.wind)}
                </span>
              </div>
            </div>
          )}

          <form className="wp-search" onSubmit={doSearch}>
            <Search width={14} height={14} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tt('weatherCityPh')}
              aria-label={tt('weatherCityPh')}
            />
          </form>
          {results.length > 0 && (
            <ul className="wp-results" data-testid="weather-results">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button onClick={() => pick(r)}>
                    <b>{r.name}</b>
                    <span className="muted small">{r.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
