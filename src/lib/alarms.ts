/** Task alarms: ring at each task's exact clock time — like the phone's own
 *  alarm clock — not just a countdown.
 *
 *  Android: exact AlarmManager alarms (setAlarmClock, survives Doze/screen
 *  off) via the AlarmBridge; every task gets its own request code so many
 *  alarms coexist. Full-screen AlarmActivity rings with the TASK title.
 *  Desktop/Web: the closest alarm is handed to the countdown engine (same
 *  overlay + beeps as the timer); if the countdown is busy we ring through
 *  a precise timeout + notification.
 *
 *  Alarm UI prefs are per-device (ringing is a local action), so the mute
 *  list lives in localStorage. Sync runs at boot, every 15s and on
 *  visibility — registrations themselves are exact (setTimeout / AlarmManager).
 */
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { store } from './store'
import type { Lang } from '../types'
import { t } from './i18n'
import { alarmBridge, startTimer, cancelTimer, getTimer, ringSoft, type AlarmLabels } from './timer'

const MUTE_KEY = 'anjam.alarms.muted'
/** Missed while the app was closed: still ring if less than this late. */
const MISSED_WINDOW_MS = 2 * 60 * 60 * 1000

type Planned = { kind: 'native' | 'timer' | 'timeout' | 'missed'; at: number }
const planned = new Map<string, Planned>()
const timeouts = new Map<string, number>()
/** taskId -> due_at value whose ring already fired (no double rings) */
const handled = new Map<string, number>()

function readMuted(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTE_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

export function isMuted(taskId: string): boolean {
  return readMuted().has(taskId)
}

/** Toggle ring for one task. Returns the new muted state. */
export function toggleMute(taskId: string): boolean {
  const s = readMuted()
  if (s.has(taskId)) s.delete(taskId)
  else s.add(taskId)
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify([...s]))
  } catch { /* ignore */ }
  void syncTaskAlarms()
  return s.has(taskId)
}

function lang(): Lang {
  try {
    const v = localStorage.getItem('anjam.lang')
    if (v === 'en' || v === 'fa') return v
  } catch { /* ignore */ }
  return (navigator.language || 'en').toLowerCase().startsWith('fa') ? 'fa' : 'en'
}

function labelsFor(title: string): AlarmLabels {
  const l = lang()
  return {
    title,
    body: t(l, 'reminderBody'),
    dismiss: t(l, 'alarmDismiss'),
    snooze: t(l, 'alarmSnooze'),
  }
}

/** Stable positive request code per task (kept away from the timer's code). */
function reqFor(taskId: string): number {
  let h = 0
  for (let i = 0; i < taskId.length; i++) h = (h * 31 + taskId.charCodeAt(i)) | 0
  return 10_000 + (Math.abs(h) % 90_000)
}

type Desired = { id: string; at: number; title: string }

function desiredAlarms(): Desired[] {
  const now = Date.now()
  const out: Desired[] = []
  const muted = readMuted()
  const tasks = store.getState().tasks
  for (const task of tasks) {
    if (task.deleted) continue
    if (task.status === 'done' || task.completed_at) continue
    if (!task.due_at || task.all_day) continue
    const d = new Date(task.due_at)
    if (Number.isNaN(d.getTime())) continue
    if (d.getHours() === 0 && d.getMinutes() === 0) continue // midnight = no clock time
    const at = d.getTime()
    if (at < now - MISSED_WINDOW_MS) continue // too old — dropped
    if (muted.has(task.id)) continue
    const done = handled.get(task.id)
    if (done === at) continue // already rang for this exact due time
    if (task.title.trim() === '') continue
    out.push({ id: task.id, at, title: task.title.trim() })
  }
  return out
}

function cancelPlanned(id: string, p: Planned): void {
  if (p.kind === 'native') {
    void alarmBridge.cancel({ req: reqFor(id) }).catch(() => undefined)
  } else if (p.kind === 'timeout') {
    const to = timeouts.get(id)
    if (to) clearTimeout(to)
  } else if (p.kind === 'timer') {
    if (getTimer().owner === id) cancelTimer()
  }
  timeouts.delete(id)
  planned.delete(id)
}

async function scheduleOne(d: Desired): Promise<void> {
  const now = Date.now()
  const lbl = labelsFor(d.title)

  if (Capacitor.isNativePlatform()) {
    const res = await alarmBridge
      .schedule({ at: d.at, ...lbl, req: reqFor(d.id) })
      .catch(() => ({ ok: false }))
    if (res && res.ok) {
      planned.set(d.id, { kind: 'native', at: d.at })
      return
    }
    // Native scheduling failed (permission/plugin) — degrade to the in-app
    // path instead of staying silent, and surface the reason for debugging.
    console.warn('[anjam] native alarm failed, using web fallback:', (res as { reason?: string })?.reason)
  }

  // Desktop / web
  if (d.at <= now) {
    handled.set(d.id, d.at)
    planned.set(d.id, { kind: 'missed', at: d.at })
    ringSoft()
    notify(lbl.title, lbl.body)
    return
  }
  const s = getTimer()
  const timerFree = !s.running && !s.ringing && s.leftMs <= 0
  if (timerFree) {
    await startTimer(d.at - now, lbl, { owner: d.id })
    planned.set(d.id, { kind: 'timer', at: d.at })
    return
  }
  const to = window.setTimeout(() => {
    timeouts.delete(d.id)
    ringSoft()
    notify(lbl.title, lbl.body)
  }, d.at - now)
  timeouts.set(d.id, to)
  planned.set(d.id, { kind: 'timeout', at: d.at })
}

function notify(title: string, body: string): void {
  try {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body, silent: false })
      } else if (Notification.permission === 'default') {
        void Notification.requestPermission().then((p) => {
          if (p === 'granted') new Notification(title, { body, silent: false })
        }).catch(() => undefined)
      }
    }
  } catch { /* ignore */ }
  try {
    LocalNotifications.schedule({
      notifications: [{ title, body, id: Math.floor(Math.random() * 100000) + 1 }],
    }).catch(() => undefined)
  } catch { /* ignore */ }
}

/** Reconcile every task alarm with the store. Cheap; safe to call often. */
export async function syncTaskAlarms(): Promise<void> {
  try {
    const desired = desiredAlarms()
    const want = new Map(desired.map((d) => [d.id, d]))

    // Drop stale registrations (completed / edited / muted / deleted tasks).
    for (const [id, p] of [...planned.entries()]) {
      const d = want.get(id)
      const sameDue = d && d.at === p.at
      if (!sameDue) {
        cancelPlanned(id, p)
        continue
      }
      if (p.kind === 'timer' && getTimer().owner !== id) {
        // user overwrote the countdown — re-plan through the fallback path
        planned.delete(id)
      }
    }

    for (const d of desired) {
      if (planned.has(d.id)) continue
      await scheduleOne(d)
    }
  } catch { /* never break the UI over alarms */ }
}

let loop: number | null = null

/** Boot: register everything, then keep reconciling (15s + visibility). */
export function startAlarmLoop(): void {
  if (Capacitor.isNativePlatform()) {
    // Android 13+: without this runtime grant every notification — and the
    // full-screen alarm behind it — is dropped by the system silently.
    void LocalNotifications.requestPermissions().catch(() => undefined)
  }
  void syncTaskAlarms()
  if (loop) return
  loop = window.setInterval(() => void syncTaskAlarms(), 15_000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void syncTaskAlarms()
  })
  window.addEventListener('focus', () => void syncTaskAlarms())
}

/* ---------------- Settings diagnostics ---------------- */

export type AlarmStatus = { notif: boolean; exact: boolean; fsi: boolean; sdk: number }

/** null on web/desktop — the native core only exists on Android. */
export async function getAlarmStatus(): Promise<AlarmStatus | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const s = await alarmBridge.status()
    if (!s || !s.ok) return null
    return {
      notif: !!s.notif,
      exact: !!s.exact,
      fsi: !!s.fsi,
      sdk: typeof s.sdk === 'number' ? s.sdk : 0,
    }
  } catch {
    return null
  }
}

export function requestNotifPerm(): Promise<unknown> {
  return LocalNotifications.requestPermissions().catch(() => undefined)
}

export function requestExactPerm(): void {
  void alarmBridge.requestExact().catch(() => undefined)
}

export function openFsiPage(): void {
  void alarmBridge.openFsiSettings().catch(() => undefined)
}

/** 10-second ring straight to the native alarm screen. */
export async function testAlarmRing(o: {
  title: string
  body: string
  dismiss: string
  snooze: string
  delayMs?: number
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await alarmBridge.testRing({ delayMs: o.delayMs ?? 10_000, ...o })
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message || e) }
  }
}

// Debug / QA hook.
;(window as unknown as Record<string, unknown>).__anjamAlarms = {
  sync: syncTaskAlarms,
  isMuted,
  toggleMute,
  planned: () => [...planned.entries()],
}
