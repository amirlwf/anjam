import { useEffect, useState } from 'react'
import type { Lang, SyncStatus, ThemePref } from '../types'
import { t, fmtDate } from '../lib/i18n'
import { loadConfig, saveConfig } from '../lib/config'
import { getClient, resetClient } from '../lib/supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { onSyncStatus, syncNow } from '../lib/sync'
import { exportJson, store } from '../lib/store'
import { applyTheme } from './Header'
import { Alert, CheckCircle, Download, Refresh, X } from './Icons'
import { getCalPref, setCalPref, type CalSys } from '../lib/calendar'

type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' } | { kind: 'fail'; msg: string }

export default function Settings({
  lang,
  setLang,
  email,
  onClose,
  onSignOut,
}: {
  lang: Lang
  setLang: (l: Lang) => void
  email: string
  onClose: () => void
  onSignOut: () => void
}) {
  const tt = (k: string) => t(lang, k)
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [theme, setTheme] = useState<ThemePref>((localStorage.getItem('anjam.theme') as ThemePref) || 'system')
  const [sync, setSync] = useState<SyncStatus>({ state: 'disabled', lastSyncAt: null, pending: 0, error: null })
  const [cal, setCal] = useState<CalSys>(getCalPref())

  useEffect(() => {
    const un = onSyncStatus(setSync)
    void loadConfig().then((c) => {
      setUrl(c.url)
      setKey(c.key)
    })
    return un
  }, [])

  async function handleTest() {
    setTest({ kind: 'testing' })
    try {
      const sb = createClient(url.trim().replace(/\/+$/, ''), key.trim())
      const { error } = await sb.from('tasks').select('id').limit(1)
      if (error) setTest({ kind: 'fail', msg: error.message })
      else setTest({ kind: 'ok' })
    } catch (e) {
      setTest({ kind: 'fail', msg: String((e as Error).message || e) })
    }
  }

  function handleSaveConnection() {
    if (!url.trim() || !key.trim()) return
    saveConfig(url, key)
    localStorage.removeItem('anjam.auth')
    resetClient()
    window.location.reload()
  }

  function handleTheme(p: ThemePref) {
    setTheme(p)
    applyTheme(p)
  }

  function handleExport() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `anjam-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function handleClear() {
    if (!window.confirm(tt('clearAll') + '?')) return
    indexedDB.deleteDatabase('anjam')
    window.location.reload()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{tt('settings')}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </div>

        <section className="settings-section">
          <h3>{tt('account')}</h3>
          <p className="muted small">
            {tt('accountSection')} <b dir="ltr">{email}</b>
          </p>
          <button className="btn ghost small" onClick={onSignOut}>
            {tt('signOut')}
          </button>
        </section>

        <section className="settings-section">
          <h3>{tt('theme')}</h3>
          <div className="segmented">
            {(['light', 'dark', 'system'] as ThemePref[]).map((p) => (
              <button
                key={p}
                className={`seg-btn ${theme === p ? 'active' : ''}`}
                onClick={() => handleTheme(p)}
              >
                {tt('theme' + p.charAt(0).toUpperCase() + p.slice(1))}
              </button>
            ))}
          </div>
          <h3 style={{ marginTop: 14 }}>{tt('language')}</h3>
          <div className="segmented">
            <button className={`seg-btn ${lang === 'fa' ? 'active' : ''}`} onClick={() => setLang('fa')}>
              فارسی
            </button>
            <button className={`seg-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>
              English
            </button>
          </div>
          <h3 style={{ marginTop: 14 }}>{tt('calendar')}</h3>
          <div className="segmented">
            <button
              className={`seg-btn ${cal === 'jalali' ? 'active' : ''}`}
              onClick={() => {
                setCal('jalali')
                setCalPref('jalali')
              }}
            >
              {tt('calSolar')}
            </button>
            <button
              className={`seg-btn ${cal === 'gregorian' ? 'active' : ''}`}
              onClick={() => {
                setCal('gregorian')
                setCalPref('gregorian')
              }}
            >
              {tt('calGreg')}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>{tt('synced')}</h3>
          <div className="sync-row">
            <span className={`state ${sync.state}`}>
              {sync.state === 'synced' ? <CheckCircle width={15} height={15} /> : <Alert width={15} height={15} />}
              {sync.state === 'synced' ? tt('synced') : sync.state === 'offline' ? tt('offline') : sync.state === 'syncing' ? tt('syncing') : sync.state === 'error' ? tt('syncError') : '—'}
            </span>
            <button className="btn ghost small" onClick={() => syncNow()}>
              <Refresh width={14} height={14} /> {tt('syncNow')}
            </button>
          </div>
          <p className="muted small">
            {tt('lastSync')}: {sync.lastSyncAt ? fmtDate(lang, sync.lastSyncAt) : '—'} · {tt('pendingChanges')}: {sync.pending}
          </p>
          {sync.error && <p className="msg fail small">{sync.error}</p>}
          <p className="muted small">
            {tt('items')}: {store.getState().tasks.filter((x) => !x.deleted).length}
          </p>
        </section>

        <section className="settings-section">
          <h3>{tt('connection')}</h3>
          <label className="field">
            <span>{tt('supabaseUrl')}</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" spellCheck={false} />
          </label>
          <label className="field">
            <span>{tt('anonKey')}</span>
            <input value={key} onChange={(e) => setKey(e.target.value)} dir="ltr" spellCheck={false} />
          </label>
          <div className="row-btns">
            <button className="btn ghost small" onClick={() => void handleTest()} disabled={test.kind === 'testing'}>
              {tt('testConnection')}
            </button>
            <button className="btn primary small" onClick={handleSaveConnection}>
              {tt('save')}
            </button>
          </div>
          {test.kind === 'ok' && (
            <p className="msg ok small">
              <CheckCircle width={14} height={14} /> {tt('connectionOk')}
            </p>
          )}
          {test.kind === 'fail' && (
            <p className="msg fail small">
              <Alert width={14} height={14} /> {test.msg}
            </p>
          )}
        </section>

        <section className="settings-section">
          <h3>{tt('deviceLocal')}</h3>
          <div className="row-btns">
            <button className="btn ghost small" onClick={handleExport}>
              <Download width={14} height={14} /> {tt('exportJson')}
            </button>
            <button className="btn danger small" onClick={handleClear}>
              {tt('clearAll')}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>{tt('about')}</h3>
          <p className="muted small">
            Anjam v1.1.0 — Electron (Windows) + Capacitor (Android) + Supabase
            <br />
            github.com/amirlwf/anjam
          </p>
        </section>
      </div>
    </div>
  )
}
