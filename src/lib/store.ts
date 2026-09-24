import type { LabelRow, ListRow, Priority, Recurrence, TaskRow, View } from '../types'
import { idbGetAll, idbPut } from './idb'
import { enqueue, onPulled } from './sync'
import { nowISO, tsOf, uuid, sameDay, startOfDay } from './util'
import { nextOccurrence } from './nlp'

export interface StoreState {
  ready: boolean
  userId: string
  tasks: TaskRow[]
  lists: ListRow[]
  labels: LabelRow[]
}

let state: StoreState = { ready: false, userId: '', tasks: [], lists: [], labels: [] }
const subs = new Set<() => void>()

function emit(): void {
  subs.forEach((f) => f())
}

function set(partial: Partial<StoreState>): void {
  state = { ...state, ...partial }
  emit()
}

async function persist(table: 'tasks' | 'lists' | 'labels', row: TaskRow | ListRow | LabelRow): Promise<void> {
  await idbPut(table, row)
  await enqueue(table, row as never)
}

export const store = {
  subscribe(fn: () => void): () => void {
    subs.add(fn)
    return () => void subs.delete(fn)
  },
  getState(): StoreState {
    return state
  },
  async load(userId: string): Promise<void> {
    const [tasks, lists, labels] = await Promise.all([
      idbGetAll<TaskRow>('tasks'),
      idbGetAll<ListRow>('lists'),
      idbGetAll<LabelRow>('labels'),
    ])
    set({ ready: true, userId, tasks, lists, labels })
  },
}

onPulled(() => {
  if (state.userId) void store.load(state.userId)
})

/* ---------------- tasks ---------------- */

export async function addTask(
  input: Partial<TaskRow> & { title: string },
  userId?: string
): Promise<TaskRow> {
  const now = nowISO()
  const uid = userId || state.userId
  const maxOrder = state.tasks.reduce((m, x) => Math.max(m, x.sort_order), 0)
  const task: TaskRow = {
    id: uuid(),
    user_id: uid,
    list_id: input.list_id ?? null,
    parent_id: input.parent_id ?? null,
    title: input.title.trim(),
    notes: input.notes ?? '',
    status: 'todo',
    priority: (input.priority ?? 0) as Priority,
    due_at: input.due_at ?? null,
    all_day: input.all_day ?? !input.due_at ? true : input.all_day ?? true,
    recurrence: (input.recurrence ?? 'none') as Recurrence,
    completed_at: null,
    labels: input.labels ?? [],
    sort_order: input.sort_order ?? maxOrder + 1,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  if (input.due_at && input.all_day === false) task.all_day = false
  set({ tasks: [...state.tasks, task] })
  await persist('tasks', task)
  return task
}

export async function updateTask(id: string, patch: Partial<TaskRow>): Promise<void> {
  const i = state.tasks.findIndex((x) => x.id === id)
  if (i < 0) return
  const next: TaskRow = { ...state.tasks[i], ...patch, id, updated_at: nowISO() }
  const tasks = state.tasks.slice()
  tasks[i] = next
  set({ tasks })
  await persist('tasks', next)
}

export async function toggleTask(id: string): Promise<void> {
  const t = state.tasks.find((x) => x.id === id)
  if (!t) return
  const willComplete = t.status !== 'done'
  await updateTask(id, {
    status: willComplete ? 'done' : 'todo',
    completed_at: willComplete ? nowISO() : null,
  })
  if (willComplete && t.recurrence !== 'none') {
    const current = state.tasks.find((x) => x.id === id)
    await addTask({
      list_id: current?.list_id ?? t.list_id,
      parent_id: t.parent_id,
      title: t.title,
      notes: t.notes,
      priority: t.priority,
      due_at: nextOccurrence(current?.due_at ?? t.due_at, t.recurrence),
      all_day: t.all_day,
      recurrence: t.recurrence,
      labels: [...t.labels],
    })
  }
}

export async function destroyTask(id: string): Promise<void> {
  const ids: string[] = []
  const collect = (pid: string) => {
    ids.push(pid)
    for (const c of state.tasks) if (c.parent_id === pid) collect(c.id)
  }
  collect(id)
  for (const tid of ids) await updateTask(tid, { deleted: true })
}

export function subtasksOf(id: string): TaskRow[] {
  return state.tasks.filter((x) => x.parent_id === id && !x.deleted)
}

/* ---------------- lists ---------------- */

export async function addList(name: string, color?: string, userId?: string): Promise<ListRow> {
  const now = nowISO()
  const palette = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6']
  const maxOrder = state.lists.reduce((m, x) => Math.max(m, x.sort_order), 0)
  const list: ListRow = {
    id: uuid(),
    user_id: userId || state.userId,
    name: name.trim(),
    color: color || palette[state.lists.length % palette.length],
    sort_order: maxOrder + 1,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ lists: [...state.lists, list] })
  await persist('lists', list)
  return list
}

export async function updateList(id: string, patch: Partial<ListRow>): Promise<void> {
  const i = state.lists.findIndex((x) => x.id === id)
  if (i < 0) return
  const next: ListRow = { ...state.lists[i], ...patch, id, updated_at: nowISO() }
  const lists = state.lists.slice()
  lists[i] = next
  set({ lists })
  await persist('lists', next)
}

export async function destroyList(id: string): Promise<void> {
  const affected = state.tasks.filter((x) => x.list_id === id && !x.deleted)
  await updateList(id, { deleted: true })
  for (const task of affected) await updateTask(task.id, { list_id: null })
}

/* ---------------- labels ---------------- */

export async function addLabel(name: string, color?: string, userId?: string): Promise<LabelRow> {
  const now = nowISO()
  const palette = ['#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#8b5cf6']
  const label: LabelRow = {
    id: uuid(),
    user_id: userId || state.userId,
    name: name.trim(),
    color: color || palette[state.labels.length % palette.length],
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ labels: [...state.labels, label] })
  await persist('labels', label)
  return label
}

export async function updateLabel(id: string, patch: Partial<LabelRow>): Promise<void> {
  const i = state.labels.findIndex((x) => x.id === id)
  if (i < 0) return
  const next: LabelRow = { ...state.labels[i], ...patch, id, updated_at: nowISO() }
  const labels = state.labels.slice()
  labels[i] = next
  set({ labels })
  await persist('labels', next)
}

export async function destroyLabel(id: string): Promise<void> {
  const label = state.labels.find((x) => x.id === id)
  if (!label) return
  await updateLabel(id, { deleted: true })
  for (const task of state.tasks.filter((x) => !x.deleted && x.labels.includes(label.name))) {
    await updateTask(task.id, { labels: task.labels.filter((l) => l !== label.name) })
  }
}

/* ---------------- helpers ---------------- */

export function liveTasks(): TaskRow[] {
  return state.tasks.filter((x) => !x.deleted)
}

export function rootTasks(): TaskRow[] {
  return liveTasks().filter((x) => !x.parent_id)
}

export function dueBucket(t: TaskRow, now = new Date()): 'overdue' | 'today' | 'upcoming' | 'none' {
  if (!t.due_at) return 'none'
  const d = new Date(t.due_at)
  if (startOfDay(d).getTime() < startOfDay(now).getTime()) return 'overdue'
  if (sameDay(d, now)) return 'today'
  return 'upcoming'
}

export function matchesView(t: TaskRow, view: View): boolean {
  switch (view.kind) {
    case 'inbox':
      return !t.list_id
    case 'today':
      return dueBucket(t) === 'today' || dueBucket(t) === 'overdue'
    case 'upcoming': {
      if (!t.due_at) return false
      const b = dueBucket(t)
      if (b === 'overdue') return false
      const limit = new Date()
      limit.setDate(limit.getDate() + 7)
      const d = new Date(t.due_at)
      return b !== 'none' && d.getTime() <= limit.getTime()
    }
    case 'all':
      return true
    case 'completed':
      return t.status === 'done'
    case 'priority':
      return t.priority > 0
    case 'list':
      return t.list_id === view.id
    case 'label':
      return t.labels.includes(view.name)
  }
}

export function sortTasks(arr: TaskRow[]): TaskRow[] {
  return arr.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === 'todo' ? -1 : 1
    const ap = a.priority || 9
    const bp = b.priority || 9
    if (ap !== bp) return ap - bp
    const ad = a.due_at ? tsOf(a.due_at) : Infinity
    const bd = b.due_at ? tsOf(b.due_at) : Infinity
    if (ad !== bd) return ad - bd
    return a.sort_order - b.sort_order
  })
}

export function exportJson(): string {
  return JSON.stringify(
    {
      app: 'anjam',
      version: 1,
      exported_at: nowISO(),
      tasks: state.tasks,
      lists: state.lists,
      labels: state.labels,
    },
    null,
    2
  )
}
