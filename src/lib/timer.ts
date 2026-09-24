/** Countdown timer → alarm.
 *
 *  Android (native): schedules an exact AlarmManager alarm (setAlarmClock) that
 *  launches AlarmActivity — rings like the phone's own clock with the screen
 *  OFF or locked (full-screen intent), looping the system alarm tone until
 *  dismissed or snoozed.
 *  Web / Electron: in-app full-screen overlay + looping WebAudio beeps.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export interface AlarmBridge {
  schedule(o: {
    at: number
    title: string
    body: string
    dismiss: string
    snooze: string
  }): Promise<{ ok: boolean }>
  cancel(): Promise<void>
}

const alarm = registerPlugin<AlarmBridge>('AlarmBridge')

export type AlarmLabels = { title: string; body: string; dismiss: string; snooze: string }

export type TimerState = {
  running: boolean
  durationMs: number
  endsAt: number | null
  leftMs: number
  ringing: boolean
  /** 'native' = Android AlarmActivity owns sound/UI; 'web' = we ring here. */
  mode: 'native' | 'web' | null
}

const KEY = 'anjam.timer.v1'
const subs = new Set<(s: TimerState) => void>()
let labels: AlarmLabels | null = null
let state: TimerState = restore()
let ticker: number | null = null
let beepIv: number | null = null
let autoStop: number | null = null
let actx: AudioContext | null = null

function restore(): TimerState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<TimerState>
      return {
        running: !!s.running,
        durationMs: s.durationMs || 0,
        endsAt: s.endsAt ?? null,
        leftMs: s.leftMs || 0,
        ringing: false,
        mode: null,
      }
    }
  } catch { /* ignore */ }
  return { running: false, durationMs: 0, endsAt: null, leftMs: 0, ringing: false, mode: null }
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, ringing: false, mode: null }))
  } catch { /* ignore */ }
}

function emit(): void {
  subs.forEach((fn) => fn(state))
}

export function onTimer(fn: (s: TimerState) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => { subs.delete(fn) }
}

export function getTimer(): TimerState {
  return state
}

export function remainingMs(): number {
  if (state.running && state.endsAt) return Math.max(0, state.endsAt - Date.now())
  return Math.max(0, state.leftMs)
}

/** mm:ss (or h:mm:ss) formatted remaining time. */
export function fmtLeft(ms: number, faDigits: boolean): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const str = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return faDigits ? str.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]) : str
}

function ensureTicker(): void {
  if (ticker) return
  ticker = window.setInterval(tick, 400)
  tick()
}

function clearTicker(): void {
  if (ticker) clearInterval(ticker)
  ticker = null
}

function tick(): void {
  if (!state.running) return
  emit()
  if (remainingMs() <= 0) fire()
}

/** Start (or restart) a countdown of durationMs. */
export async function startTimer(durationMs: number, lbl: AlarmLabels): Promise<void> {
  stopBeep()
  labels = lbl
  const at = Date.now() + durationMs
  state = { running: true, durationMs, endsAt: at, leftMs: durationMs, ringing: false, mode: 'web' }
  persist()
  emit()
  ensureTicker()
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.requestPermissions()
      const res = await alarm.schedule({ at, ...lbl })
      if (res && res.ok) state = { ...state, mode: 'native' }
    } catch {
      state = { ...state, mode: 'web' }
    }
    persist()
    emit()
  }
}

export function pauseTimer(): void {
  if (!state.running) return
  const left = remainingMs()
  if (state.mode === 'native') void alarm.cancel().catch(() => undefined)
  clearTicker()
  state = { ...state, running: false, endsAt: null, leftMs: left }
  persist()
  emit()
}

export function resumeTimer(lbl: AlarmLabels): void {
  if (state.running || state.leftMs <= 0) return
  void startTimer(state.leftMs, lbl)
}

export function cancelTimer(): void {
  if (state.mode === 'native') void alarm.cancel().catch(() => undefined)
  clearTicker()
  stopBeep()
  state = { running: false, durationMs: 0, endsAt: null, leftMs: 0, ringing: false, mode: null }
  persist()
  emit()
}

function fire(): void {
  clearTicker()
  const native = state.mode === 'native'
  state = { ...state, running: false, endsAt: null, leftMs: 0, ringing: !native }
  persist()
  emit()
  // Native mode: AlarmActivity owns sound + visuals (even with screen off).
  if (native) return
  // Web/Electron: loop beeps until dismissed (max 5 min).
  startBeep()
}

function beep(actx: AudioContext, freq: number, at: number, dur: number): void {
  const osc = actx.createOscillator()
  const gain = actx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(gain)
  gain.connect(actx.destination)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

function startBeep(): void {
  try {
    actx = actx || new AudioContext()
    if (actx.state === 'suspended') void actx.resume()
    const ring = () => {
      if (!actx) return
      const t0 = actx.currentTime
      // classic double-beep, clock style
      beep(actx, 880, t0, 0.16)
      beep(actx, 660, t0 + 0.22, 0.16)
      beep(actx, 880, t0 + 0.44, 0.16)
    }
    ring()
    if (beepIv) clearInterval(beepIv)
    beepIv = window.setInterval(ring, 1400)
    if (autoStop) clearTimeout(autoStop)
    autoStop = window.setTimeout(stopBeep, 5 * 60 * 1000)
    try { navigator.vibrate?.([600, 300, 600, 300, 900]) } catch { /* ignore */ }
  } catch { /* audio unavailable */ }
}

export function stopBeep(): void {
  if (beepIv) clearInterval(beepIv)
  beepIv = null
  if (autoStop) clearTimeout(autoStop)
  autoStop = null
  try { navigator.vibrate?.(0) } catch { /* ignore */ }
  if (state.ringing) {
    state = { ...state, ringing: false }
    persist()
    emit()
  }
}

// Restore state: if the countdown ended while we were away, settle it.
queueMicrotask(() => {
  if (state.running && state.endsAt && state.endsAt <= Date.now()) {
    // On Android the native alarm already rang (AlarmManager survives).
    if (Capacitor.isNativePlatform() && state.mode !== 'web') {
      clearTicker()
      state = { ...state, running: false, endsAt: null, leftMs: 0 }
      persist()
      emit()
      return
    }
    fire()
  } else if (state.running) {
    ensureTicker()
  }
})

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.running && remainingMs() <= 0) fire()
})
window.addEventListener('focus', () => {
  if (state.running && remainingMs() <= 0) fire()
})

// Debug / QA hook (harmless in production).
;(window as unknown as Record<string, unknown>).__anjamTimer = {
  start: (ms: number, lbl?: AlarmLabels) =>
    startTimer(ms, lbl || { title: 'Anjam', body: 'timer', dismiss: 'Dismiss', snooze: 'Snooze' }),
  cancel: cancelTimer,
  stopBeep,
  get: getTimer,
}
