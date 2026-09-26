import { useEffect, useRef, useState } from 'react'
import type { Lang, SectionKey, SyncStatus, ThemePref } from '../types'
import { t, fmtDate } from '../lib/i18n'
import { loadConfig, saveConfig } from '../lib/config'
import { getClient, resetClient } from '../lib/supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { onSyncStatus, syncNow } from '../lib/sync'
import { exportJson, store } from '../lib/store'
import { buildBackup, validateBackup, summarize, downloadBackup, type BackupFile, type Summary } from '../lib/backup'
import { restoreBackup } from '../lib/backupIo'
import { prefs } from '../lib/config'
import { THEMES, DEFAULT_THEME } from '../lib/themes'
import { applyStoredTheme, clearAccent } from '../lib/appearance'
import { getSections, setSection } from '../lib/sections'
import { applyTheme } from './Header'
import { Alert, CheckCircle, Download, Refresh, X } from './Icons'
import { getCalPref, setCalPref, type CalSys } from '../lib/calendar'
import { Capacitor } from '@capacitor/core'
import {
  ACCENTS,
  getAccent,
  applyAccent,
  getMotion,
  applyMotion,
  getFontPref,
  applyFontPref,
  type MotionPref,
  type FontPref,
} from '../lib/appearance'
import {
  getAlarmStatus,
  requestNotifPerm,
  requestExactPerm,
  openFsiPage,
  testAlarmRing,
  type AlarmStatus,
} from '../lib/alarms'

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
  const [accent, setAccent] = useState<string>(() => getAccent())
  const [motion, setMotion] = useState<MotionPref>(() => getMotion())
  const [secs, setSecs] = useState(getSections())
  function toggleSection(k: SectionKey, on: boolean) {
    setSection(k, on)
    setSecs(getSections())
  }
  const [fontPref, setFontPref] = useState<FontPref>(() => getFontPref())
  const nativeAlarms = Capacitor.isNativePlatform()
  const [ast, setAst] = useState<AlarmStatus | null>(null)
  const [ringTest, setRingTest] = useState<'idle' | 'scheduled' | 'fail'>('idle')
  /* ---- local backup (US5) ---- */
  const backupFileRef = useRef<HTMLInputElement>(null)
  const [pendingRestore, setPendingRestore] = useState<{ file: BackupFile; summary: Summary } | null>(null)
  /* ---- brand theme (US4) ---- */
  const [skin, setSkin] = useState(() => prefs.getSkin() || DEFAULT_THEME)
  const [variable, setVariable] = useState(() => prefs.getVariableTheme())
  const [backupMsg, setBackupMsg] = useState('')

  useEffect(() => {
    const un = onSyncStatus(setSync)
    void loadConfig().then((c) => {
      setUrl(c.url)
      setKey(c.key)
    })
    return un
  }, [])

  useEffect(() => {
    if (!nativeAlarms) return
    const load = () => void getAlarmStatus().then((s) => { if (s) setAst(s) })
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [nativeAlarms])

  function handleRingTest() {
    void testAlarmRing({
      title: tt('appName'),
      body: tt('testRingBody'),
      dismiss: tt('alarmDismiss'),
      snooze: tt('alarmSnooze'),
      delayMs: 10000,
    }).then((r) => setRingTest(r.ok ? 'scheduled' : 'fail'))
  }

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
    // the brand layer also keys off the mode, so re-derive both together
    applyStoredTheme()
  }

  /**
   * Pick one of the six brands (FR-11).
   *
   * Choosing a brand switches the weather layer off: two sources of truth
   * for the accent at once is exactly how a theme picker ends up feeling
   * broken. The brand is kept in storage either way, so toggling the
   * weather layer back off restores what you had instead of a default.
   */
  function handleSkin(id: string) {
    setSkin(id)
    setVariable(false)
    prefs.setSkin(id)
    prefs.setVariableTheme(false)
    clearAccent()
    applyStoredTheme()
  }

  function handleVariable(on: boolean) {
    setVariable(on)
    prefs.setVariableTheme(on)
    applyStoredTheme()
  }

  function handleAccent(hex: string) {
    setAccent(hex)
    applyAccent(hex)
  }

  function handleMotion(m: MotionPref) {
    setMotion(m)
    applyMotion(m)
  }

  function handleFont(f: FontPref) {
    setFontPref(f)
    applyFontPref(f)
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

  /* --------------------------------------------------------------------
   * Local backup (US5).
   *
   * Export writes one file and stamps the time. Import never touches the
   * database before the file has validated and the user has seen the row
   * counts: a wrong file is rejected with a reason, and a write that fails
   * half-way rolls back to the pre-import snapshot (T044/T045).
   * -------------------------------------------------------------------- */

  function handleBackupExport() {
    try {
      const st = store.getState()
      const file = buildBackup(
        {
          tasks: st.tasks,
          lists: st.lists,
          labels: st.labels,
          habits: st.habits,
          dates: st.dates,
          subjects: st.subjects,
          slots: st.slots,
          homework: st.homework,
          studyLogs: st.studyLogs,
          workoutPlans: st.workoutPlans,
          workoutLogs: st.workoutLogs,
        },
        new Date().toISOString(),
      )
      const name = downloadBackup(file)
      prefs.setBackupLastExport(Date.now())
      setBackupMsg(`${tt('backupExported')}: ${name}`)
    } catch (e) {
      setBackupMsg(`${tt('backupInvalid')}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleBackupFile(el: HTMLInputElement) {
    const f = el.files && el.files[0]
    el.value = ''
    if (!f) return
    let parsed: unknown
    try {
      parsed = JSON.parse(await f.text())
    } catch {
      setPendingRestore(null)
      setBackupMsg(tt('backupInvalid'))
      return
    }
    const v = validateBackup(parsed)
    if (!v.ok || !v.file) {
      setPendingRestore(null)
      setBackupMsg(`${tt('backupInvalid')} — ${v.errors.join(', ')}`)
      return
    }
    setBackupMsg('')
    setPendingRestore({ file: v.file, summary: summarize(v.file) })
  }

  async function confirmRestore() {
    if (!pendingRestore) return
    const res = await restoreBackup(pendingRestore.file)
    setPendingRestore(null)
    if (res.ok) {
      setBackupMsg(`${tt('backupRestoreDone')}: ${res.restored}`)
      // One reload so every reader (store, alarms, themes) re-derives from
      // the restored rows instead of showing a mixture of old and new.
      window.setTimeout(() => window.location.reload(), 700)
    } else {
      setBackupMsg(`${tt('backupInvalid')}: ${res.error || ''}`)
    }
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
          <h3>{tt('appearanceSec')}</h3>
          <div className="appearance-row">
            <span className="muted small">{tt('accentColor')}</span>
            <div className="accent-swatches">
              {ACCENTS.map((hex) => (
                <button
                  key={hex}
                  className={`accent-swatch ${accent === hex ? 'active' : ''}`}
                  style={{ background: hex }}
                  onClick={() => handleAccent(hex)}
                  aria-label={hex}
                />
              ))}
            </div>
          </div>
          <div className="appearance-row">
            <span className="muted small">{tt('motion')}</span>
            <div className="segmented">
              {(['on', 'off'] as MotionPref[]).map((m) => (
                <button
                  key={m}
                  className={`seg-btn ${motion === m ? 'active' : ''}`}
                  onClick={() => handleMotion(m)}
                >
                  {tt(m === 'on' ? 'motionOn' : 'motionOff')}
                </button>
              ))}
            </div>
          </div>
          <div className="appearance-row">
            <span className="muted small">{tt('fontSize')}</span>
            <div className="segmented">
              {(['sm', 'md', 'lg'] as FontPref[]).map((f) => (
                <button
                  key={f}
                  className={`seg-btn ${fontPref === f ? 'active' : ''}`}
                  onClick={() => handleFont(f)}
                >
                  {tt(f === 'sm' ? 'fsSm' : f === 'md' ? 'fsMd' : 'fsLg')}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>{tt('sectionsSec')}</h3>
          <p className="muted small">{tt('sectionsHint')}</p>
          {(['study', 'workout'] as const).map((k) => (
            <div className="appearance-row" key={k}>
              <span className="muted small">{tt(k === 'study' ? 'secStudy' : 'secWorkout')}</span>
              <div className="segmented">
                <button
                  className={`seg-btn ${secs[k] ? 'active' : ''}`}
                  data-testid={`sec-${k}-on`}
                  onClick={() => toggleSection(k, true)}
                >
                  {tt('motionOn')}
                </button>
                <button
                  className={`seg-btn ${!secs[k] ? 'active' : ''}`}
                  data-testid={`sec-${k}-off`}
                  onClick={() => toggleSection(k, false)}
                >
                  {tt('motionOff')}
                </button>
              </div>
            </div>
          ))}
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

          {/* US4 / FR-11 — six brands + the weather layer. Swatches, not a
              dropdown: the choice is visual, so show the colour. */}
          <div className="skin-row" data-testid="skin-row" role="radiogroup" aria-label={tt('theme')}>
            {THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                className={`skin-swatch ${!variable && skin === th.id ? 'active' : ''}`}
                data-testid={`skin-${th.id}`}
                aria-checked={!variable && skin === th.id}
                role="radio"
                title={lang === 'fa' ? th.fa : th.en}
                onClick={() => handleSkin(th.id)}
              >
                <i className="skin-dot" style={{ background: th.swatch }} />
                <span>{lang === 'fa' ? th.fa : th.en}</span>
              </button>
            ))}
            <button
              type="button"
              className={`skin-swatch is-variable ${variable ? 'active' : ''}`}
              data-testid="skin-variable"
              aria-checked={variable}
              role="radio"
              title={tt('themeVariable')}
              onClick={() => handleVariable(!variable)}
            >
              <i className="skin-dot skin-dot-weather" />
              <span>{tt('themeVariable')}</span>
            </button>
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

        {nativeAlarms && (
          <section className="settings-section">
            <h3>{tt('alarmsSec')}</h3>
            <div className="alarm-status-rows">
              <div className="status-row">
                <span>{tt('notifPerm')}</span>
                <button
                  className={`chip ${ast?.notif ? 'ok' : 'warn'}`}
                  onClick={() => {
                    void requestNotifPerm().then(() => getAlarmStatus()).then((s) => { if (s) setAst(s) })
                  }}
                >
                  {ast?.notif ? tt('permGranted') : tt('permFix')}
                </button>
              </div>
              {ast && ast.sdk >= 31 && (
                <div className="status-row">
                  <span>{tt('exactPerm')}</span>
                  <button
                    className={`chip ${ast.exact ? 'ok' : 'warn'}`}
                    onClick={() => {
                      requestExactPerm()
                      setTimeout(() => void getAlarmStatus().then((s) => { if (s) setAst(s) }), 700)
                    }}
                  >
                    {ast.exact ? tt('permGranted') : tt('permFix')}
                  </button>
                </div>
              )}
              {ast && ast.sdk >= 34 && !ast.fsi && (
                <div className="status-row">
                  <span>{tt('fsiPerm')}</span>
                  <button
                    className="chip warn"
                    onClick={() => {
                      openFsiPage()
                      setTimeout(() => void getAlarmStatus().then((s) => { if (s) setAst(s) }), 700)
                    }}
                  >
                    {tt('permFix')}
                  </button>
                </div>
              )}
            </div>
            <div className="status-row">
              <button className="btn" onClick={handleRingTest} disabled={ringTest === 'scheduled'}>
                {tt('testRing')}
              </button>
              <span className="muted small">
                {ringTest === 'scheduled'
                  ? tt('testRingOk')
                  : ringTest === 'fail'
                    ? tt('testRingFail')
                    : tt('testRingHint')}
              </span>
            </div>
          </section>
        )}

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

        <section className="settings-section" data-testid="backup-section">
          <h3>{tt('backupTitle')}</h3>
          <div className="row-btns">
            <button className="btn ghost small" data-testid="backup-export" onClick={handleBackupExport}>
              <Download width={14} height={14} /> {tt('backupExport')}
            </button>
            <button className="btn ghost small" data-testid="backup-import" onClick={() => backupFileRef.current?.click()}>
              <Refresh width={14} height={14} /> {tt('backupImport')}
            </button>
          </div>
          <input
            ref={backupFileRef}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="backup-file"
            onChange={(e) => void handleBackupFile(e.target)}
          />
          {backupMsg && (
            <p className="muted small" data-testid="backup-msg">
              {backupMsg}
            </p>
          )}

          {/* The summary is the whole point of T044: the user sees exactly
              what the file contains before anything is overwritten. */}
          {pendingRestore && (
            <div className="backup-confirm" data-testid="backup-summary">
              <p>
                <b>{tt('backupConfirmTitle')}</b>
              </p>
              <p className="muted small">{tt('backupConfirmBody')}</p>
              <p className="muted small" data-testid="backup-summary-text">
                {tt('backupVersion')} {pendingRestore.summary.version} · {tt('backupSummary')} {pendingRestore.summary.rows}
                {' · '}{pendingRestore.summary.prefs}
              </p>
              <ul className="backup-tables" data-testid="backup-tables">
                {pendingRestore.summary.tables.map((tb) => (
                  <li key={tb.key}>
                    <span>{tb.key}</span>
                    <b>{tb.count}</b>
                  </li>
                ))}
              </ul>
              <div className="row-btns">
                <button className="btn primary small" data-testid="backup-confirm" onClick={() => void confirmRestore()}>
                  {tt('backupImport')}
                </button>
                <button className="btn ghost small" data-testid="backup-cancel" onClick={() => setPendingRestore(null)}>
                  {tt('cancel')}
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="settings-section">
          <h3>{tt('about')}</h3>
          <p className="muted small">
            Anjam v1.4.0 — Electron (Windows) + Capacitor (Android) + Supabase
            <br />
            github.com/amirlwf/anjam
          </p>
        </section>
      </div>
    </div>
  )
}
