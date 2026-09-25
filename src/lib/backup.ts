import type { StoreName } from './idb'

/**
 * Local backup and emergency restore (US5, SC-06).
 *
 * Two properties drive every decision here:
 *
 *  - **One file must be enough.** Export, wipe the device, import, and the
 *    account is back — every table row and every preference.
 *  - **Restore must not half-apply.** A file that fails validation writes
 *    nothing, and a write that fails part-way puts the pre-import snapshot
 *    back. A half-restored database is worse than a failed restore, because
 *    the user cannot tell which half they are looking at.
 *
 * Nothing here talks to a server: the file stays on the device.
 */

export const BACKUP_APP = 'anjam'
export const BACKUP_VERSION = 2

export interface BackupData {
  tasks: unknown[]
  lists: unknown[]
  labels: unknown[]
  habits: unknown[]
  dates: unknown[]
  subjects: unknown[]
  slots: unknown[]
  homework: unknown[]
  studyLogs: unknown[]
  workoutPlans: unknown[]
  workoutLogs: unknown[]
}

export type BackupDataKey = keyof BackupData

export interface BackupFile {
  app: 'anjam'
  version: number
  exported_at: string
  prefs: Record<string, string>
  data: BackupData
}

/** Backup key -> IndexedDB store. `important_dates` is the odd one out. */
export const TABLES: { key: BackupDataKey; store: StoreName }[] = [
  { key: 'tasks', store: 'tasks' },
  { key: 'lists', store: 'lists' },
  { key: 'labels', store: 'labels' },
  { key: 'habits', store: 'habits' },
  { key: 'dates', store: 'important_dates' },
  { key: 'subjects', store: 'study_subjects' },
  { key: 'slots', store: 'study_slots' },
  { key: 'homework', store: 'study_homework' },
  { key: 'studyLogs', store: 'study_logs' },
  { key: 'workoutPlans', store: 'workout_plans' },
  { key: 'workoutLogs', store: 'workout_logs' },
]

/** Session tokens and API keys must never ride along in a file the user
 *  may upload, share or lose. SC-06 / T046. */
const SECRET_PATTERNS = ['auth', 'token', 'secret', 'aikey', 'apikey', 'password']

export function isSecretKey(k: string): boolean {
  const lower = k.toLowerCase()
  return SECRET_PATTERNS.some((p) => lower.includes(p))
}

/** Every `anjam.*` preference currently in localStorage, minus secrets. */
export function collectPrefs(storage: Storage = localStorage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (!k || !k.startsWith('anjam.')) continue
    if (isSecretKey(k)) continue
    const v = storage.getItem(k)
    if (v != null) out[k] = v
  }
  return out
}

/** `storage` is a parameter so the envelope can be built in a test runner
 *  that has no `localStorage` at all. */
export function buildBackup(
  data: BackupData,
  exportedAt: string,
  storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage,
): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    prefs: storage ? collectPrefs(storage) : {},
    data,
  }
}

export interface Validation {
  ok: boolean
  file: BackupFile | null
  errors: string[]
}

const isRow = (r: unknown): boolean =>
  !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string' && (r as { id: string }).id.length > 0

/**
 * Validate before a single byte is written. Every failure is reported, not
 * just the first, so a user who picked the wrong file can see why.
 */
export function validateBackup(raw: unknown): Validation {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') {
    return { ok: false, file: null, errors: ['not an object'] }
  }
  const f = raw as Partial<BackupFile>
  if (f.app !== BACKUP_APP) errors.push(`app is not '${BACKUP_APP}'`)
  if (typeof f.version !== 'number' || !Number.isFinite(f.version)) errors.push('version missing')
  else if (f.version > BACKUP_VERSION) errors.push(`version ${f.version} is newer than ${BACKUP_VERSION}`)
  if (f.version !== undefined && typeof f.version === 'number' && f.version < 1) errors.push('version < 1')
  if (typeof f.exported_at !== 'string') errors.push('exported_at missing')
  if (f.prefs !== undefined && (typeof f.prefs !== 'object' || f.prefs === null)) errors.push('prefs not an object')

  if (!f.data || typeof f.data !== 'object') {
    errors.push('data table missing')
  } else {
    for (const { key } of TABLES) {
      const rows = (f.data as unknown as Record<string, unknown>)[key]
      if (!Array.isArray(rows)) {
        errors.push(`table ${key} missing`)
        continue
      }
      const bad = rows.findIndex((r) => !isRow(r))
      if (bad >= 0) errors.push(`table ${key} row ${bad} has no id`)
    }
  }

  if (errors.length > 0) return { ok: false, file: null, errors }
  return { ok: true, file: f as BackupFile, errors: [] }
}

export interface Summary {
  version: number
  exportedAt: string
  prefs: number
  tables: { key: BackupDataKey; count: number }[]
  rows: number
}

/** The numbers shown *before* the user confirms — T044. */
export function summarize(file: BackupFile): Summary {
  const tables = TABLES.map(({ key }) => ({
    key,
    count: Array.isArray(file.data[key]) ? file.data[key].length : 0,
  }))
  return {
    version: file.version,
    exportedAt: file.exported_at,
    prefs: Object.keys(file.prefs || {}).length,
    tables,
    rows: tables.reduce((n, t) => n + t.count, 0),
  }
}

/** Download the file in a browser / WebView. Electron and Android both go
 *  through the platform share/save sheet from here. */
export function downloadBackup(file: BackupFile): string {
  const json = JSON.stringify(file, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = file.exported_at.replace(/[:.]/g, '-').replace(/[TZ]/g, '_')
  a.href = url
  a.download = `anjam-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return a.download
}
