import type { SyncStatus, Table } from '../types'
import { getClient } from './supabaseClient'
import { idbGetAll, idbGet, idbPutMany, idbClear, idbDelete, metaGet, metaSet } from './idb'
import { nowISO, tsOf, debounce } from './util'

type AnyRow = Record<string, unknown> & { id: string; updated_at: string; user_id: string }

const TABLES: Table[] = [
  'lists', 'labels', 'tasks', 'habits', 'important_dates',
  'study_subjects', 'study_slots', 'study_homework', 'study_logs',
  'workout_plans', 'workout_logs',
]
const CURSORS: Record<Table, string> = {
  lists: 'c:lists',
  labels: 'c:labels',
  tasks: 'c:tasks',
  habits: 'c:habits',
  important_dates: 'c:important_dates',
  study_subjects: 'c:study_subjects',
  study_slots: 'c:study_slots',
  study_homework: 'c:study_homework',
  study_logs: 'c:study_logs',
  workout_plans: 'c:workout_plans',
  workout_logs: 'c:workout_logs',
}

interface OutboxItem {
  key: string
  table: Table
  id: string
  row: AnyRow
  ts: number
}

let status: SyncStatus = { state: 'disabled', lastSyncAt: null, pending: 0, error: null }
const statusSubs = new Set<(s: SyncStatus) => void>()
const pullSubs = new Set<() => void>()

let uid = ''
let started = false
let interval: number | null = null
let channel: { unsubscribe: () => void } | null = null
let flushing = false
let pulling = false
let pullQueued: boolean | null = null

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  statusSubs.forEach((f) => f(status))
}

export function getSyncStatus(): SyncStatus {
  return status
}

export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  statusSubs.add(fn)
  fn(status)
  return () => void statusSubs.delete(fn)
}

/** store subscribes to know when remote rows landed locally */
export function onPulled(fn: () => void): () => void {
  pullSubs.add(fn)
  return () => void pullSubs.delete(fn)
}

export async function enqueue(table: Table, row: AnyRow): Promise<void> {
  const item: OutboxItem = {
    key: `${table}:${row.id}:${row.updated_at}`,
    table,
    id: row.id,
    row,
    ts: tsOf(row.updated_at),
  }
  await idbPutManySafe('outbox', [item])
  const pending = await idbCountSafe()
  setStatus({ pending, state: status.state === 'disabled' ? 'disabled' : status.state })
  scheduleFlush()
}

async function idbPutManySafe(store: 'outbox', rows: OutboxItem[]): Promise<void> {
  const { idbPut } = await import('./idb')
  for (const r of rows) await idbPut(store, r)
}

async function idbCountSafe(): Promise<number> {
  return idbGetAll<OutboxItem>('outbox').then((r) => r.length)
}

async function flushOnce(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const sb = await getClient()
    const items = await idbGetAll<OutboxItem>('outbox')
    if (items.length) {
      setStatus({ state: 'syncing', error: null })
      const byTable = new Map<Table, Map<string, OutboxItem>>()
      for (const it of items) {
        let m = byTable.get(it.table)
        if (!m) {
          m = new Map()
          byTable.set(it.table, m)
        }
        const prev = m.get(it.id)
        if (!prev || it.ts >= prev.ts) m.set(it.id, it)
      }
      const flushedKeys: string[] = []
      for (const [table, m] of byTable) {
        const rows = [...m.values()].map((i) => i.row)
        const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' })
        if (error) throw new Error(`${table}: ${error.message}`)
        for (const i of m.values()) flushedKeys.push(i.key)
      }
      for (const k of flushedKeys) await idbDelete('outbox', k)
      setStatus({ pending: await idbCountSafe() })
    }
    await pullOnce()
    setStatus({ state: 'synced', lastSyncAt: nowISO(), error: null })
  } catch (e) {
    const msg = String((e as Error)?.message || e)
    const offline =
      (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      /Failed to fetch|NetworkError|network|fetch failed|Load failed|ECONN/i.test(msg)
    setStatus({ state: offline ? 'offline' : 'error', error: offline ? null : msg })
  } finally {
    flushing = false
  }
}

async function pullOnce(full = false): Promise<void> {
  if (pulling) {
    pullQueued = pullQueued ?? full
    return
  }
  pulling = true
  try {
    const sb = await getClient()
    for (const table of TABLES) {
      const ck = CURSORS[table]
      let since: string | null = full ? null : await metaGet(ck)
      if (since) {
        const back = new Date(Math.max(0, tsOf(since) - 2000)).toISOString()
        since = back
      }
      let q = sb.from(table).select('*').eq('user_id', uid)
      if (since) q = q.gte('updated_at', since)
      const { data, error } = await q
      if (error) throw new Error(`${table}: ${error.message}`)
      const rows = (data ?? []) as unknown as AnyRow[]
      if (rows.length) {
        const updates: AnyRow[] = []
        for (const r of rows) {
          const local = await idbGet<AnyRow>(table, r.id)
          if (!local || tsOf(r.updated_at) > tsOf(local.updated_at)) updates.push(r)
        }
        if (updates.length) await idbPutMany(table, updates)
        let maxMs = 0
        for (const r of rows) maxMs = Math.max(maxMs, tsOf(r.updated_at))
        const stored = await metaGet(ck)
        if (maxMs && (!stored || maxMs > tsOf(stored))) await metaSet(ck, new Date(maxMs).toISOString())
      }
    }
    pullSubs.forEach((f) => f())
  } finally {
    pulling = false
    if (pullQueued !== null) {
      const again = pullQueued
      pullQueued = null
      if (again) void pullOnce(true).catch(() => undefined)
    }
  }
}

const schedulePull = debounce(() => {
  pullOnce()
    .then(() => {
      if (status.state !== 'synced') setStatus({ state: 'synced', lastSyncAt: nowISO(), error: null })
    })
    .catch((e) => {
      const msg = String((e as Error)?.message || e)
      const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || /fetch|network/i.test(msg)
      setStatus({ state: offline ? 'offline' : 'error', error: offline ? null : msg })
    })
}, 400)

const scheduleFlush = debounce(() => void flushOnce(), 250)

async function subscribeRealtime(userId: string): Promise<void> {
  try {
    const sb = await getClient()
    const ch = sb.channel(`anjam:${userId}`)
    for (const table of TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => schedulePull())
    }
    await ch.subscribe((st) => {
      if (st === 'SUBSCRIBED') schedulePull()
    })
    channel = ch
  } catch {
    channel = null
  }
}

function handleOnline(): void {
  scheduleFlush()
}

function handleVisible(): void {
  if (!document.hidden) scheduleFlush()
}

export async function startSync(userId: string): Promise<void> {
  if (started && uid === userId) return
  if (started) await stopSync()
  uid = userId
  started = true
  setStatus({ state: 'syncing', error: null })
  const prev = await metaGet('uid')
  if (prev && prev !== userId) {
    for (const t of TABLES) {
      await idbClear(t)
      await metaSet(CURSORS[t], '')
    }
    await idbClear('outbox')
    pullSubs.forEach((f) => f())
  }
  await metaSet('uid', userId)
  window.addEventListener('online', handleOnline)
  document.addEventListener('visibilitychange', handleVisible)
  await subscribeRealtime(userId)
  await flushOnce()
  interval = window.setInterval(() => {
    if (!document.hidden) scheduleFlush()
  }, 45000)
}

export async function stopSync(): Promise<void> {
  started = false
  uid = ''
  if (interval !== null) window.clearInterval(interval)
  interval = null
  window.removeEventListener('online', handleOnline)
  document.removeEventListener('visibilitychange', handleVisible)
  try {
    channel?.unsubscribe()
  } catch {}
  channel = null
  setStatus({ state: 'disabled', pending: 0 })
}

export function syncNow(): void {
  scheduleFlush()
}
