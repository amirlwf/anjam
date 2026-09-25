/** Countdown timer → alarm + Pomodoro engine.
 *
 *  Android (native): schedules exact AlarmManager alarms (setAlarmClock) that
 *  launch AlarmActivity — rings like the phone's own clock with the screen
 *  OFF or locked (full-screen intent), looping the system alarm tone until
 *  dismissed or snoozed. Distinct request codes let many alarms coexist
 *  (timer uses the default code, each task alarm its own).
 *  Web / Electron: in-app full-screen overlay + looping WebAudio beeps.
 *
 *  Pomodoro: focus(short/long) phases with auto-advanced breaks and a
 *  "waiting" state after each break until the user starts the next round.
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
    /** distinct per-alarm request code (Android); defaults to the timer code */
    req?: number
  }): Promise<{ ok: boolean }>
  cancel(o?: { req?: number }): Promise<void>
  /** diagnostics for the settings screen */
  status(): Promise<{ ok: boolean; notif?: boolean; exact?: boolean; fsi?: boolean; sdk?: number }>
  requestExact(): Promise<void>
  openFsiSettings(): Promise<void>
  testRing(o: {
    delayMs?: number
    title: string
    body: string
    dismiss: string
    snooze: string
  }): Promise<{ ok: boolean; reason?: string }>
}

export const alarmBridge = registerPlugin<AlarmBridge>('AlarmBridge')

export type AlarmLabels = { title: string; body: string; dismiss: string; snooze: string }

export type TimerKind = 'timer' | 'pomodoro' | 'task'
export type PomPhase = 'work' | 'short' | 'long'
export type PomodoroCfg = { work: number; short: number; long: number } // minutes

export type TimerState = {
  running: boolean
  durationMs: number
  endsAt: number | null
  leftMs: number
  ringing: boolean
  /** 'native' = Android AlarmActivity owns sound/UI; 'web' = we ring here. */
  mode: 'native' | 'web' | null
  kind: TimerKind
  phase: PomPhase | null
  /** current/next focus round, 1..4 (long break after round 4) */
  round: number
  /** break finished — waiting for the user to start the next focus round */
  waiting: boolean
  /** task id when a task alarm was handed to the countdown (desktop) */
  owner: string | null
  /** what the current ring is about (persisted so overlays can show it) */
  ringTitle: string | null
  ringBody: string | null
}

const KEY = 'anjam.timer.v1'
const POM_KEY = 'anjam.pomodoro.v1'
const POM_ROUNDS = 4

const subs = new Set<(s: TimerState) => void>()
let labels: AlarmLabels | null = null
let state: TimerState = restore()
let ticker: number | null = null
let beepIv: number | null = null
let autoStop: number | null = null
let actx: AudioContext | null = null

type LblBuilder = (phase: PomPhase, round: number) => AlarmLabels
let lblBuild: LblBuilder | null = null

/** TimerPanel registers the localized label builder on mount. */
export function setLabelBuilder(fn: LblBuilder): void {
  lblBuild = fn
}

function lblFor(phase: PomPhase, round: number): AlarmLabels {
  if (lblBuild) return lblBuild(phase, round)
  return { title: 'Anjam', body: phase, dismiss: 'Dismiss', snooze: 'Snooze +5 min' }
}

export const DEFAULT_POMODORO: PomodoroCfg = { work: 25, short: 5, long: 15 }

export function getPomodoroCfg(): PomodoroCfg {
  try {
    const raw = localStorage.getItem(POM_KEY)
    if (raw) {
      const c = JSON.parse(raw) as Partial<PomodoroCfg>
      return {
        work: clampMin(c.work, 1, 120, DEFAULT_POMODORO.work),
        short: clampMin(c.short, 1, 60, DEFAULT_POMODORO.short),
        long: clampMin(c.long, 1, 60, DEFAULT_POMODORO.long),
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_POMODORO }
}

export function setPomodoroCfg(cfg: PomodoroCfg): void {
  try {
    localStorage.setItem(POM_KEY, JSON.stringify(cfg))
  } catch { /* ignore */ }
}

function clampMin(v: unknown, lo: number, hi: number, fb: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fb
  return Math.max(lo, Math.min(hi, n))
}

function restore(): TimerState {
  const base: TimerState = {
    running: false, durationMs: 0, endsAt: null, leftMs: 0, ringing: false, mode: null,
    kind: 'timer', phase: null, round: 1, waiting: false, owner: null,
    ringTitle: null, ringBody: null,
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<TimerState>
      // If the countdown expired while the app was closed, stopping silently
      // is what we want: ringing at the next launch felt like a ghost alarm
      // (same family as the rings-at-login bug). A tiny grace keeps a
      // reopen-right-after-expiry ringing so a backgrounded app still alerts.
      const endsAtRaw = typeof s.endsAt === 'number' ? s.endsAt : null
      const expiredAway = !!s.running && endsAtRaw !== null && Date.now() - endsAtRaw > 15_000
      if (expiredAway) {
        return { ...base, durationMs: s.durationMs || 0, kind: s.kind === 'pomodoro' || s.kind === 'task' ? s.kind : 'timer' }
      }
      return {
        ...base,
        running: !!s.running,
        durationMs: s.durationMs || 0,
        endsAt: s.endsAt ?? null,
        leftMs: s.leftMs || 0,
        kind: s.kind === 'pomodoro' || s.kind === 'task' ? s.kind : 'timer',
        phase: s.phase === 'work' || s.phase === 'short' || s.phase === 'long' ? s.phase : null,
        round: typeof s.round === 'number' && s.round >= 1 ? s.round : 1,
        waiting: !!s.waiting,
        owner: typeof s.owner === 'string' ? s.owner : null,
        ringTitle: typeof s.ringTitle === 'string' ? s.ringTitle : null,
        ringBody: typeof s.ringBody === 'string' ? s.ringBody : null,
      }
    }
  } catch { /* ignore */ }
  return base
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, ringing: false, mode: null }))
  } catch { /* ignore */ }
}

function emit(): void {
  // Publish a NEW object every time: React's useState bails out when the
  // reference is unchanged, so emitting `state` as-is left the header's
  // countdown pill frozen between start and ring (probe: 16 emits, 1 render).
  const snapshot: TimerState = { ...state }
  subs.forEach((fn) => fn(snapshot))
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

type StartOpts = {
  kind?: TimerKind
  phase?: PomPhase | null
  round?: number
  owner?: string | null
  keepRinging?: boolean
  ringTitle?: string | null
  ringBody?: string | null
}

async function baseStart(durationMs: number, lbl: AlarmLabels, opts: StartOpts = {}): Promise<void> {
  if (!opts.keepRinging) stopBeep()
  labels = lbl
  const at = Date.now() + Math.max(1000, durationMs)
  state = {
    running: true,
    durationMs,
    endsAt: at,
    leftMs: durationMs,
    ringing: opts.keepRinging ? state.ringing : false,
    mode: 'web',
    kind: opts.kind ?? 'timer',
    phase: opts.phase ?? null,
    round: opts.round ?? state.round,
    waiting: false,
    owner: opts.owner ?? null,
    ringTitle: opts.ringTitle ?? null,
    ringBody: opts.ringBody ?? null,
  }
  persist()
  emit()
  ensureTicker()
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.requestPermissions()
      const res = await alarmBridge.schedule({ at, ...lbl })
      if (res && res.ok) state = { ...state, mode: 'native' }
    } catch {
      state = { ...state, mode: 'web' }
    }
    persist()
    emit()
  }
}

/** Start (or restart) a plain countdown. Pass `owner` when a task alarm uses it. */
export function startTimer(durationMs: number, lbl: AlarmLabels, opts?: { owner?: string }): Promise<void> {
  return baseStart(durationMs, lbl, {
    kind: opts?.owner ? 'task' : 'timer',
    owner: opts?.owner ?? null,
    ringTitle: opts?.owner ? lbl.title : null,
    ringBody: opts?.owner ? lbl.body : null,
  })
}

/* ---------------- Pomodoro ---------------- */

async function runPhase(phase: PomPhase, round: number, keepRinging = false): Promise<void> {
  const cfg = getPomodoroCfg()
  const durMs = (phase === 'work' ? cfg.work : phase === 'short' ? cfg.short : cfg.long) * 60_000
  const lbl = lblFor(phase, round)
  await baseStart(durMs, lbl, {
    kind: 'pomodoro',
    phase,
    round,
    keepRinging,
    ringTitle: lbl.title,
    ringBody: lbl.body,
  })
}

/** Fresh Pomodoro: focus round 1. */
export function startPomodoro(): Promise<void> {
  return runPhase('work', 1)
}

/** From the waiting state: start the next focus round. */
export function startNextRound(): Promise<void> {
  if (!state.waiting || state.kind !== 'pomodoro') return Promise.resolve()
  return runPhase('work', state.round)
}

export function pauseTimer(): void {
  if (!state.running) return
  const left = remainingMs()
  if (state.mode === 'native') void alarmBridge.cancel().catch(() => undefined)
  clearTicker()
  state = { ...state, running: false, endsAt: null, leftMs: left }
  persist()
  emit()
}

export function resumeTimer(lbl: AlarmLabels): Promise<void> {
  if (state.running || state.leftMs <= 0) return Promise.resolve()
  return baseStart(state.leftMs, lbl, {
    kind: state.kind,
    phase: state.phase,
    round: state.round,
    owner: state.owner,
    ringTitle: state.ringTitle ?? (state.owner ? lbl.title : null),
    ringBody: state.ringBody ?? (state.owner ? lbl.body : null),
  })
}

export function cancelTimer(): void {
  if (state.mode === 'native') void alarmBridge.cancel().catch(() => undefined)
  clearTicker()
  stopBeep()
  state = {
    running: false, durationMs: 0, endsAt: null, leftMs: 0, ringing: false, mode: null,
    kind: 'timer', phase: null, round: 1, waiting: false, owner: null,
    ringTitle: null, ringBody: null,
  }
  persist()
  emit()
}

function fire(): void {
  clearTicker()
  const native = state.mode === 'native'
  const kind = state.kind
  const ended = state.phase
  const round = state.round

  if (kind === 'pomodoro' && ended) {
    const cfg = getPomodoroCfg()
    if (ended === 'work') {
      // focus done → auto-start the break; announce it now.
      const nextPhase: PomPhase = round >= POM_ROUNDS ? 'long' : 'short'
      const durMs = (nextPhase === 'short' ? cfg.short : cfg.long) * 60_000
      const lbl = lblFor(nextPhase, round)
      const at = Date.now() + durMs
      state = {
        running: true, durationMs: durMs, endsAt: at, leftMs: durMs,
        ringing: !native, mode: 'web',
        kind: 'pomodoro', phase: nextPhase, round, waiting: false, owner: null,
        ringTitle: lbl.title, ringBody: lbl.body,
      }
      persist()
      emit()
      ensureTicker()
      if (!native) startBeep()
      if (native) {
        void alarmBridge.schedule({ at, ...lbl }).then((res) => {
          if (res && res.ok) {
            state = { ...state, mode: 'native' }
            persist()
            emit()
          }
        }).catch(() => undefined)
      }
      return
    }
    // break done → ring and WAIT for the user to start the next round
    const nextRound = ended === 'long' ? 1 : Math.min(POM_ROUNDS, round + 1)
    state = {
      running: false, durationMs: 0, endsAt: null, leftMs: 0,
      ringing: !native, mode: null,
      kind: 'pomodoro', phase: 'work', round: nextRound, waiting: true, owner: null,
      ringTitle: state.ringTitle, ringBody: state.ringBody,
    }
    persist()
    emit()
    if (!native) startBeep()
    return
  }

  // base: timer | task countdown
  state = {
    ...state,
    running: false, endsAt: null, leftMs: 0,
    ringing: !native, waiting: false,
  }
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

/** A few beeps without touching state (used by the task-alarm fallback). */
export function ringSoft(times = 3): void {
  try {
    actx = actx || new AudioContext()
    if (actx.state === 'suspended') void actx.resume()
    let n = 0
    const group = () => {
      if (!actx || n >= times) {
        if (beepSoft) clearInterval(beepSoft)
        beepSoft = null
        return
      }
      n += 1
      const t0 = actx.currentTime
      beep(actx, 880, t0, 0.16)
      beep(actx, 660, t0 + 0.22, 0.16)
      beep(actx, 880, t0 + 0.44, 0.16)
    }
    group()
    if (beepSoft) clearInterval(beepSoft)
    beepSoft = window.setInterval(group, 1200)
    try { navigator.vibrate?.([500, 250, 500]) } catch { /* ignore */ }
  } catch { /* audio unavailable */ }
}
let beepSoft: number | null = null

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
  pomodoro: () => startPomodoro(),
  next: () => startNextRound(),
  cancel: cancelTimer,
  stopBeep,
  get: getTimer,
  cfg: getPomodoroCfg,
  on: (fn: (s: TimerState) => void) => onTimer(fn),
  subCount: () => subs.size,
}
