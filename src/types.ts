export type ThemePref = 'light' | 'dark' | 'system'
export type Lang = 'en' | 'fa'

/** 0 = none, 1 = P1 (urgent) … 4 = P4 (low) */
export type Priority = 0 | 1 | 2 | 3 | 4

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

export interface ListRow {
  id: string
  user_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
  updated_at: string
  deleted: boolean
}

export interface LabelRow {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
  deleted: boolean
}

export interface TaskRow {
  id: string
  user_id: string
  list_id: string | null
  parent_id: string | null
  title: string
  notes: string
  status: 'todo' | 'done'
  priority: Priority
  due_at: string | null
  all_day: boolean
  recurrence: Recurrence
  completed_at: string | null
  labels: string[]
  sort_order: number
  created_at: string
  updated_at: string
  deleted: boolean
}

export type Table = 'lists' | 'labels' | 'tasks'
export type Row = ListRow | LabelRow | TaskRow

export type SyncState = 'disabled' | 'offline' | 'syncing' | 'synced' | 'error'

export interface SyncStatus {
  state: SyncState
  lastSyncAt: string | null
  pending: number
  error: string | null
}

export type View =
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'all' }
  | { kind: 'completed' }
  | { kind: 'priority' }
  | { kind: 'list'; id: string }
  | { kind: 'label'; name: string }

export interface ParsedQuickAdd {
  title: string
  priority: Priority
  listName: string | null
  labels: string[]
  dueAt: string | null
  recurrence: Recurrence
}
