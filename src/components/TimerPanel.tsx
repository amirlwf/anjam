import { useEffect, useState } from 'react'
import type { Lang } from '../types'
import { t, toFaDigits } from '../lib/i18n'
import { Capacitor } from '@capacitor/core'
import logo from '../assets/logo.png'
import {
  cancelTimer,
  fmtLeft,
  getTimer,
  onTimer,
  pauseTimer,
  remainingMs,
  resumeTimer,
  startTimer,
  stopBeep,
  type AlarmLabels,
  type TimerState,
} from '../lib/timer'
import { X } from './Icons'

const PRESETS = [5, 10, 15, 25, 45, 60]

function labelsFor(lang: Lang): AlarmLabels {
  const tt = (k: string) => t(lang, k)
  return {
    title: tt('appName'),
    body: tt('timeUp'),
    dismiss: tt('alarmDismiss'),
    snooze: tt('alarmSnooze'),
  }
}

/** Full-screen alarm card — web/Electron fallback sound lives in lib/timer. */
function AlarmOverlay({ lang }: { lang: Lang }) {
  const tt = (k: string) => t(lang, k)
  const [ringing, setRinging] = useState(getTimer().ringing)
  useEffect(() => onTimer((s) => setRinging(s.ringing)), [])

  useEffect(() => {
    if (!ringing) return
    const iv = window.setInterval(() => {
      try { navigator.vibrate?.([500, 300, 500]) } catch { /* ignore */ }
    }, 3500)
    return () => {
      clearInterval(iv)
      try { navigator.vibrate?.(0) } catch { /* ignore */ }
    }
  }, [ringing])

  if (!ringing) return null
  return (
    <div className="alarm-overlay" role="alertdialog" aria-label={tt('timeUp')}>
      <div className="alarm-card">
        <img className="alarm-logo" src={logo} alt="" />
        <h2 className="alarm-title">{tt('timeUp')}</h2>
        <p className="muted">{tt('timeUpBody')}</p>
        <button className="btn primary block" onClick={stopBeep}>
          {tt('stopAlarm')}
        </button>
      </div>
    </div>
  )
}

export default function TimerPanel({
  lang,
  open,
  onClose,
}: {
  lang: Lang
  open: boolean
  onClose: () => void
}) {
  const tt = (k: string) => t(lang, k)
  const [st, setSt] = useState<TimerState>(getTimer())
  const [left, setLeft] = useState(remainingMs())
  const [mins, setMins] = useState(25)
  const [custom, setCustom] = useState('')

  useEffect(
    () =>
      onTimer((s) => {
        setSt(s)
        setLeft(remainingMs())
      }),
    []
  )

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const active = st.running || st.leftMs > 0
  const total = active ? st.durationMs : mins * 60000
  const cur = active ? left : total
  const R = 74
  const C = 2 * Math.PI * R
  const ratio = total > 0 ? Math.max(0, Math.min(1, cur / total)) : 0
  const offset = C * (1 - ratio)
  const fa = lang === 'fa'
  const digits = fmtLeft(cur, fa)
  const endsAtStr =
    st.running && st.endsAt
      ? new Date(st.endsAt).toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null
  const native = Capacitor.isNativePlatform()

  return (
    <>
      {open && (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal timer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{tt('timerTitle')}</h2>
              <button className="icon-btn" onClick={onClose} aria-label={tt('close')}>
                <X />
              </button>
            </div>
            <div className="timer-body">
              <div className="timer-ring">
                <svg viewBox="0 0 160 160" width="160" height="160" aria-hidden="true">
                  <circle className="ring-track" cx="80" cy="80" r={R} />
                  <circle
                    className={`ring-bar${active ? '' : st.ringing ? ' ringing' : ' idle'}`}
                    cx="80"
                    cy="80"
                    r={R}
                    strokeDasharray={C}
                    strokeDashoffset={offset}
                  />
                </svg>
                <div className="timer-digits">{digits}</div>
              </div>

              {endsAtStr && (
                <div className="timer-end-at">
                  {tt('endsAt')}: {endsAtStr}
                </div>
              )}

              {!active && (
                <div className="timer-presets">
                  {PRESETS.map((m) => (
                    <button
                      key={m}
                      className={`chip timer-preset ${mins === m && !custom ? 'active' : ''}`}
                      onClick={() => {
                        setMins(m)
                        setCustom('')
                      }}
                    >
                      {fa ? toFaDigits(m) : m} {tt('minutes')}
                    </button>
                  ))}
                  <label className={`chip timer-preset custom ${custom ? 'active' : ''}`}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={fa ? toFaDigits(custom) : custom}
                      placeholder={`${fa ? toFaDigits(mins) : mins} ${tt('minutes')}`}
                      aria-label={tt('minutes')}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9۰-۹]/g, '').slice(0, 3)
                        const v = raw.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
                        setCustom(v)
                        if (v) {
                          const n = parseInt(v, 10)
                          setMins(Number.isFinite(n) ? Math.max(1, Math.min(600, n)) : 1)
                        }
                      }}
                    />
                  </label>
                </div>
              )}

              <div className="timer-actions">
                {st.running ? (
                  <>
                    <button className="btn ghost" onClick={pauseTimer}>
                      {tt('pause')}
                    </button>
                    <button className="btn danger" onClick={cancelTimer}>
                      {tt('stopTimer')}
                    </button>
                  </>
                ) : active ? (
                  <>
                    <button className="btn primary" onClick={() => resumeTimer(labelsFor(lang))}>
                      {tt('resume')}
                    </button>
                    <button className="btn danger" onClick={cancelTimer}>
                      {tt('stopTimer')}
                    </button>
                  </>
                ) : (
                  <button className="btn primary" onClick={() => void startTimer(mins * 60000, labelsFor(lang))}>
                    {tt('start')}
                  </button>
                )}
              </div>

              <p className="timer-hint muted small">{native ? tt('timerHintNative') : tt('timerHintWeb')}</p>
            </div>
          </div>
        </div>
      )}
      <AlarmOverlay lang={lang} />
    </>
  )
}
