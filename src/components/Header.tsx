import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, StatusBarStyle } from '@capacitor/status-bar'
import type { Lang, SyncStatus, ThemePref } from '../types'
import { t } from '../lib/i18n'
import { onSyncStatus } from '../lib/sync'
import { Alert, Gear, Menu, Moon, Monitor, Refresh, Search, Sun, LogOut, Timer } from './Icons'
import TimerPanel from './TimerPanel'
import WeatherChip from './WeatherChip'
import { fmtLeft, getTimer, onTimer, remainingMs } from '../lib/timer'

function nextTheme(cur: ThemePref): ThemePref {
  return cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light'
}

/**
 * Read the shell background off `:root` instead of repeating a literal.
 *
 * FR-11: colours belong to the theme modules, so this file must not carry
 * its own. If the token has not resolved yet we write nothing at all —
 * leaving the previous colour is better than writing one the next theme
 * will contradict.
 */
function bgToken(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
}

export function applyTheme(pref: ThemePref): void {
  localStorage.setItem('anjam.theme', pref)
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // Native status bar + browser theme color follow the app theme.
  try {
    const bg = bgToken()
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta && bg) meta.setAttribute('content', bg)
    if (Capacitor.isNativePlatform()) {
      void StatusBar.setStyle({ style: dark ? StatusBarStyle.Dark : StatusBarStyle.Light }).catch(() => undefined)
      const rgb = getComputedStyle(document.body).backgroundColor
      const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/)
      const color = m
        ? `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`
        : bg
      if (color) void StatusBar.setBackgroundColor({ color }).catch(() => undefined)
    }
  } catch { /* ignore */ }
}

export default function Header({
  lang,
  setLang,
  query,
  setQuery,
  onMenu,
  onSettings,
  email,
  onSignOut,
}: {
  lang: Lang
  setLang: (l: Lang) => void
  query: string
  setQuery: (q: string) => void
  onMenu: () => void
  onSettings: () => void
  email: string
  onSignOut: () => void
}) {
  const tt = (k: string) => t(lang, k)
  const [theme, setTheme] = useState<ThemePref>(
    () => (localStorage.getItem('anjam.theme') as ThemePref) || 'system'
  )
  const [sync, setSync] = useState<SyncStatus>({ state: 'disabled', lastSyncAt: null, pending: 0, error: null })
  const [tm, setTm] = useState(getTimer())
  const [timerOpen, setTimerOpen] = useState(false)

  useEffect(() => onSyncStatus(setSync), [])
  useEffect(() => onTimer(setTm), [])

  function cycleTheme() {
    const nx = nextTheme(theme)
    setTheme(nx)
    applyTheme(nx)
  }

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const syncClass = sync.state === 'error' ? 'bad' : sync.state === 'offline' ? 'warn' : 'ok'

  return (
    <>
    <header className="topbar">
      <button className="icon-btn only-mobile" onClick={onMenu} aria-label={tt('openMenu')}>
        <Menu />
      </button>
      <div className="searchbox">
        <Search width={16} height={16} />
        <input
          id="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tt('searchPlaceholder')}
        />
      </div>
      <div className="topbar-actions">
        <WeatherChip lang={lang} />
        <button
          className={`sync-badge ${syncClass}`}
          onClick={() => window.dispatchEvent(new CustomEvent('anjam:sync-now'))}
          title={tt('syncNow')}
        >
          {sync.state === 'error' ? <Alert width={14} height={14} /> : <Refresh width={14} height={14} className={sync.state === 'syncing' ? 'spin' : ''} />}
          <span>
            {sync.state === 'syncing'
              ? tt('syncing')
              : sync.state === 'offline'
                ? tt('offline')
                : sync.state === 'error'
                  ? tt('syncError')
                  : sync.pending > 0
                    ? `${sync.pending} …`
                    : tt('synced')}
          </span>
        </button>
        <button
          className={`icon-btn timer-btn ${tm.running ? 'is-running' : ''}`}
          onClick={() => setTimerOpen(true)}
          title={tt('timer')}
          aria-label={tt('timer')}
        >
          <Timer />
          {(tm.running || tm.leftMs > 0) && (
            <span className="timer-pill">{fmtLeft(remainingMs(), lang === 'fa')}</span>
          )}
        </button>
        <button className="icon-btn" onClick={cycleTheme} title={tt('theme')}>
          <ThemeIcon />
        </button>
        <button
          className="btn ghost small lang-btn"
          onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
          title={tt('language')}
        >
          {lang === 'fa' ? 'EN' : 'فا'}
        </button>
        <button className="icon-btn" onClick={onSettings} title={tt('settings')}>
          <Gear />
        </button>
        <div className="account" title={email}>
          <span className="avatar">{(email || '?').slice(0, 1).toUpperCase()}</span>
          <button className="icon-btn" onClick={onSignOut} title={tt('signOut')}>
            <LogOut width={15} height={15} />
          </button>
        </div>
      </div>
    </header>
      <TimerPanel lang={lang} open={timerOpen} onClose={() => setTimerOpen(false)} />
    </>
  )
}
