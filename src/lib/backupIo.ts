import { idbClear, idbGetAll, idbPutMany, type StoreName } from './idb'
import { collectPrefs, isSecretKey, TABLES, type BackupFile } from './backup'

/**
 * The IndexedDB half of the local backup (US5).
 *
 * Split out from `backup.ts` on purpose: everything that decides *whether* a
 * restore is legal lives in the pure module and is unit-tested without a
 * browser, while the code that actually touches the database lives here.
 *
 * Nothing is uploaded. The file is read from disk and written straight back
 * to disk.
 */

/** Rows currently in memory, for the rollback path. */
export type Snapshot = Partial<Record<StoreName, unknown[]>>

export async function takeSnapshot(): Promise<Snapshot> {
  const snap: Snapshot = {}
  for (const { store } of TABLES) {
    snap[store] = await idbGetAll(store)
  }
  return snap
}

export interface RestoreResult {
  ok: boolean
  restored: number
  rolledBack: boolean
  error?: string
}

/**
 * Replace every table with the file's contents.
 *
 * The snapshot is taken *before* the first write and written back if any
 * store rejects, so the user either gets the whole restore or their old
 * data — never a mixture of the two (T045).
 */
export function applyPrefs(prefs: Record<string, string>): void {
  const doomed: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('anjam.') && !isSecretKey(k)) doomed.push(k)
  }
  for (const k of doomed) localStorage.removeItem(k)
  for (const [k, v] of Object.entries(prefs || {})) {
    if (isSecretKey(k)) continue
    localStorage.setItem(k, v)
  }
}

/**
 * Replace every table with the file's contents.
 *
 * Both snapshots — rows *and* preferences — are taken before the first
 * write. Any failure puts both back, so the user gets the whole restore or
 * their old data, never a mixture (T045).
 */
export async function restoreBackup(file: BackupFile): Promise<RestoreResult> {
  const snapshot = await takeSnapshot()
  const prefsBefore = collectPrefs()
  try {
    let restored = 0
    for (const { key, store } of TABLES) {
      const rows = (file.data[key] || []) as unknown[]
      await idbClear(store)
      if (rows.length > 0) await idbPutMany(store, rows)
      restored += rows.length
    }
    // Preferences apply last: a table failure must not leave settings
    // describing data that never arrived.
    applyPrefs(file.prefs || {})
    return { ok: true, restored, rolledBack: false }
  } catch (e) {
    let rolledBack = false
    try {
      for (const { store } of TABLES) {
        await idbClear(store)
        const rows = snapshot[store] || []
        if (rows.length > 0) await idbPutMany(store, rows)
      }
      applyPrefs(prefsBefore)
      rolledBack = true
    } catch {
      rolledBack = false
    }
    return {
      ok: false,
      restored: 0,
      rolledBack,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

