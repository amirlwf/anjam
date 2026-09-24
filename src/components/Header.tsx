import { useEffect, useState } from 'react'
import type { Lang, SyncStatus, ThemePref } from '../types'
import { t } from '../lib/i18n'
import { onSyncStatus } from '../lib/sync'
import { Alert, Gear, Menu, Moon, Monitor, Refresh, Search, Sun, LogOut } from './Icons'

function nextTheme(cur: ThemePref): ThemePref {
  return cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light'
}

export function applyTheme(pref: ThemePref): void {
  localStorage.setItem('anjam.theme', pref)
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
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

  useEffect(() => onSyncStatus(setSync), [])

  function cycleTheme() {
    const nx = nextTheme(theme)
    setTheme(nx)
    applyTheme(nx)
  }

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const syncClass = sync.state === 'error' ? 'bad' : sync.state === 'offline' ? 'warn' : 'ok'

  return (
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
        <button className="icon-btn" onClick={cycleTheme} title={tt('theme')}>
          <ThemeIcon />
        </button>
        <button
          className="btn ghost small"
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
  )
}
