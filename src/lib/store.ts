import type { HabitRow, HomeworkRow, ImportantDateRow, LabelRow, ListRow, Priority, Recurrence, StudyLogRow, StudySlotRow, StudySubjectRow, Table, TaskRow, View, WorkoutLogRow, WorkoutPlanRow } from '../types'
import { idbGetAll, idbPut } from './idb'
import { enqueue, onPulled } from './sync'
import { nowISO, tsOf, uuid, sameDay, startOfDay, localDate } from './util'
import { nextOccurrence } from './nlp'

export interface StoreState {
  ready: boolean
  userId: string
  tasks: TaskRow[]
  lists: ListRow[]
  labels: LabelRow[]
  habits: HabitRow[]
  dates: ImportantDateRow[]
  subjects: StudySubjectRow[]
  slots: StudySlotRow[]
  homework: HomeworkRow[]
  studyLogs: StudyLogRow[]
  workoutPlans: WorkoutPlanRow[]
  workoutLogs: WorkoutLogRow[]
}

let state: StoreState = {
  ready: false, userId: '', tasks: [], lists: [], labels: [], habits: [], dates: [],
  subjects: [], slots: [], homework: [], studyLogs: [], workoutPlans: [], workoutLogs: [],
}
const subs = new Set<() => void>()

function emit(): void {
  subs.forEach((f) => f())
}

function set(partial: Partial<StoreState>): void {
  state = { ...state, ...partial }
  emit()
}

async function persist(table: Table, row: Parameters<typeof idbPut>[1]): Promise<void> {
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
    const [tasks, lists, labels, habits, dates, subjects, slots, homework, studyLogs, workoutPlans, workoutLogs] =
      await Promise.all([
        idbGetAll<TaskRow>('tasks'),
        idbGetAll<ListRow>('lists'),
        idbGetAll<LabelRow>('labels'),
        idbGetAll<HabitRow>('habits'),
        idbGetAll<ImportantDateRow>('important_dates'),
        idbGetAll<StudySubjectRow>('study_subjects'),
        idbGetAll<StudySlotRow>('study_slots'),
        idbGetAll<HomeworkRow>('study_homework'),
        idbGetAll<StudyLogRow>('study_logs'),
        idbGetAll<WorkoutPlanRow>('workout_plans'),
        idbGetAll<WorkoutLogRow>('workout_logs'),
      ])
    set({
      ready: true, userId, tasks, lists, labels, habits, dates,
      subjects, slots, homework, studyLogs, workoutPlans, workoutLogs,
    })
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

/* ---------------- habits (routine) ---------------- */

export async function addHabit(name: string, color?: string, userId?: string): Promise<HabitRow> {
  const now = nowISO()
  const palette = ['#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6']
  const maxOrder = state.habits.reduce((m, x) => Math.max(m, x.sort_order), 0)
  const habit: HabitRow = {
    id: uuid(),
    user_id: userId || state.userId,
    name: name.trim(),
    color: color || palette[state.habits.length % palette.length],
    logs: [],
    sort_order: maxOrder + 1,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ habits: [...state.habits, habit] })
  await persist('habits', habit)
  return habit
}

export async function updateHabit(id: string, patch: Partial<HabitRow>): Promise<void> {
  const i = state.habits.findIndex((x) => x.id === id)
  if (i < 0) return
  const next: HabitRow = { ...state.habits[i], ...patch, id, updated_at: nowISO() }
  const habits = state.habits.slice()
  habits[i] = next
  set({ habits })
  await persist('habits', next)
}

export async function destroyHabit(id: string): Promise<void> {
  await updateHabit(id, { deleted: true })
}

/** Toggle completion of a habit for a Gregorian day (YYYY-MM-DD). */
export function toggleHabitDay(id: string, day: string): void {
  const h = state.habits.find((x) => x.id === id)
  if (!h) return
  const logs = h.logs.includes(day) ? h.logs.filter((d) => d !== day) : [...h.logs, day].sort()
  void updateHabit(id, { logs })
}

export function liveHabits(): HabitRow[] {
  return state.habits.filter((x) => !x.deleted)
}

/* ---------------- important dates ---------------- */

export async function addImportantDate(
  input: {
    title: string
    system: 'jalali' | 'gregorian' | 'hijri'
    month: number
    day: number
    remind_days?: number
    remind_time?: string
    source?: string | null
  },
  userId?: string
): Promise<ImportantDateRow> {
  const now = nowISO()
  const row: ImportantDateRow = {
    id: uuid(),
    user_id: userId || state.userId,
    title: input.title.trim(),
    system: input.system,
    month: input.month,
    day: input.day,
    remind_days: input.remind_days ?? 10,
    remind_time: input.remind_time || '09:00',
    enabled: true,
    source: input.source ?? null,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ dates: [...state.dates, row] })
  await persist('important_dates', row)
  return row
}

export async function updateImportantDate(id: string, patch: Partial<ImportantDateRow>): Promise<void> {
  const i = state.dates.findIndex((x) => x.id === id)
  if (i < 0) return
  const next: ImportantDateRow = { ...state.dates[i], ...patch, id, updated_at: nowISO() }
  const dates = state.dates.slice()
  dates[i] = next
  set({ dates })
  await persist('important_dates', next)
}

export async function destroyImportantDate(id: string): Promise<void> {
  await updateImportantDate(id, { deleted: true })
}

export function liveDates(): ImportantDateRow[] {
  return state.dates.filter((x) => !x.deleted)
}

/* ---------------- study & workout (opt-in sections) ---------------- */

const STUDY_PALETTE = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6']

/** Weekday index used across the app: 0 = شنبه (Sat) … 6 = جمعه (Fri). */
export function weekIdx(d = new Date()): number {
  return (d.getDay() + 1) % 7
}

async function updateRow<T extends { id: string; updated_at: string }>(
  table: Table,
  arr: T[],
  key: keyof StoreState,
  id: string,
  patch: Partial<T>
): Promise<void> {
  const i = arr.findIndex((x) => x.id === id)
  if (i < 0) return
  const next = { ...arr[i], ...patch, id, updated_at: nowISO() } as T
  const rows = arr.slice()
  rows[i] = next
  set({ [key]: rows } as Partial<StoreState>)
  await persist(table, next)
}

async function destroyRow<T extends { id: string; updated_at: string; deleted?: boolean }>(
  table: Table,
  arr: T[],
  key: keyof StoreState,
  id: string
): Promise<void> {
  await updateRow(table, arr, key, id, { deleted: true } as Partial<T>)
}

/* ---- subjects ---- */

export function liveSubjects(): StudySubjectRow[] {
  return state.subjects.filter((x) => !x.deleted).sort((a, b) => a.sort_order - b.sort_order)
}

export async function addStudySubject(name: string, color?: string): Promise<StudySubjectRow> {
  const now = nowISO()
  const row: StudySubjectRow = {
    id: uuid(),
    user_id: state.userId,
    name: name.trim(),
    color: color || STUDY_PALETTE[state.subjects.length % STUDY_PALETTE.length],
    sort_order: state.subjects.length + 1,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ subjects: [...state.subjects, row] })
  await persist('study_subjects', row)
  return row
}

export async function updateStudySubject(id: string, patch: Partial<StudySubjectRow>): Promise<void> {
  await updateRow('study_subjects', state.subjects, 'subjects', id, patch)
}

export async function destroyStudySubject(id: string): Promise<void> {
  await destroyRow('study_subjects', state.subjects, 'subjects', id)
}

/* ---- timetable slots ---- */

export function liveSlots(): StudySlotRow[] {
  return state.slots.filter((x) => !x.deleted)
}

export async function addStudySlot(input: {
  subject_id?: string | null
  weekday: number
  start: string
  end: string
  room?: string | null
}): Promise<StudySlotRow> {
  const now = nowISO()
  const row: StudySlotRow = {
    id: uuid(),
    user_id: state.userId,
    subject_id: input.subject_id ?? null,
    weekday: input.weekday,
    start: input.start,
    end: input.end,
    room: input.room?.trim() || null,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ slots: [...state.slots, row] })
  await persist('study_slots', row)
  return row
}

export async function updateStudySlot(id: string, patch: Partial<StudySlotRow>): Promise<void> {
  await updateRow('study_slots', state.slots, 'slots', id, patch)
}

export async function destroyStudySlot(id: string): Promise<void> {
  await destroyRow('study_slots', state.slots, 'slots', id)
}

/* ---- homework ---- */

export function liveHomework(): HomeworkRow[] {
  return state.homework.filter((x) => !x.deleted)
}

export async function addHomework(input: {
  title: string
  subject_id?: string | null
  due?: string | null
}): Promise<HomeworkRow> {
  const now = nowISO()
  const row: HomeworkRow = {
    id: uuid(),
    user_id: state.userId,
    title: input.title.trim(),
    subject_id: input.subject_id ?? null,
    due: input.due || null,
    done: false,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ homework: [...state.homework, row] })
  await persist('study_homework', row)
  return row
}

export async function updateHomework(id: string, patch: Partial<HomeworkRow>): Promise<void> {
  await updateRow('study_homework', state.homework, 'homework', id, patch)
}

export async function destroyHomework(id: string): Promise<void> {
  await destroyRow('study_homework', state.homework, 'homework', id)
}

/* ---- study logs ---- */

export function liveStudyLogs(): StudyLogRow[] {
  return state.studyLogs.filter((x) => !x.deleted)
}

export async function addStudyLog(input: {
  date: string
  minutes: number
  subject_id?: string | null
}): Promise<StudyLogRow> {
  const now = nowISO()
  const row: StudyLogRow = {
    id: uuid(),
    user_id: state.userId,
    date: input.date,
    minutes: Math.max(1, Math.round(input.minutes)),
    subject_id: input.subject_id ?? null,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ studyLogs: [...state.studyLogs, row] })
  await persist('study_logs', row)
  return row
}

export async function destroyStudyLog(id: string): Promise<void> {
  await destroyRow('study_logs', state.studyLogs, 'studyLogs', id)
}

/* ---- workout plans ---- */

export function liveWorkoutPlans(): WorkoutPlanRow[] {
  return state.workoutPlans.filter((x) => !x.deleted).sort((a, b) => a.weekday - b.weekday || a.sort_order - b.sort_order)
}

export async function addWorkoutPlan(input: {
  weekday: number
  time?: string | null
  exercises?: { name: string; sets?: number; reps?: string }[]
}): Promise<WorkoutPlanRow> {
  const now = nowISO()
  const row: WorkoutPlanRow = {
    id: uuid(),
    user_id: state.userId,
    weekday: input.weekday,
    time: input.time || null,
    exercises: input.exercises ?? [],
    sort_order: state.workoutPlans.length + 1,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ workoutPlans: [...state.workoutPlans, row] })
  await persist('workout_plans', row)
  return row
}

export async function updateWorkoutPlan(id: string, patch: Partial<WorkoutPlanRow>): Promise<void> {
  await updateRow('workout_plans', state.workoutPlans, 'workoutPlans', id, patch)
}

export async function destroyWorkoutPlan(id: string): Promise<void> {
  await destroyRow('workout_plans', state.workoutPlans, 'workoutPlans', id)
}

/* ---- workout logs (check-off per date + plan) ---- */

export function liveWorkoutLogs(): WorkoutLogRow[] {
  return state.workoutLogs.filter((x) => !x.deleted)
}

/** Upsert: same date + plan → replace the `done` list (idempotent check-off). */
export async function saveWorkoutLog(date: string, planId: string | null, done: string[]): Promise<void> {
  const existing = state.workoutLogs.find((x) => !x.deleted && x.date === date && x.plan_id === planId)
  if (existing) {
    await updateRow('workout_logs', state.workoutLogs, 'workoutLogs', existing.id, { done })
    return
  }
  const now = nowISO()
  const row: WorkoutLogRow = {
    id: uuid(),
    user_id: state.userId,
    date,
    plan_id: planId,
    done,
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  set({ workoutLogs: [...state.workoutLogs, row] })
  await persist('workout_logs', row)
}

/**
 * Score for a calendar day: of the habits that already existed that day,
 * how many are logged. Used by the heatmap, today stats and streaks.
 */
export function dayScore(day: string, habits: HabitRow[] = state.habits): { done: number; total: number } {
  const active = habits.filter((x) => !x.deleted && localDate(new Date(x.created_at)) <= day)
  const total = active.length
  const done = active.filter((h) => h.logs.includes(day)).length
  return { done, total }
}

/** Current / best run of consecutive fully-completed days. */
export function routineStreak(habits: HabitRow[] = state.habits): { cur: number; best: number } {
  const live = habits.filter((x) => !x.deleted)
  if (!live.length) return { cur: 0, best: 0 }
  const full = (day: string) => {
    const s = dayScore(day, habits)
    return s.total > 0 && s.done === s.total
  }
  let cur = 0
  const cursor = new Date()
  // a streak survives until the current day is actually missed
  if (!full(localDate(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (full(localDate(cursor))) {
    cur++
    cursor.setDate(cursor.getDate() - 1)
  }
  let best = 0
  let run = 0
  const scan = new Date()
  for (let i = 0; i < 366; i++) {
    if (full(localDate(scan))) {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
    scan.setDate(scan.getDate() - 1)
  }
  return { cur, best }
}

/** Days this single habit has been done in a row (ending today or yesterday). */
export function habitStreak(h: HabitRow): number {
  const has = (day: string) => h.logs.includes(day)
  const cursor = new Date()
  if (!has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (has(localDate(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
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
    case 'routine':
      // the routine view renders its own component, never the task list
      return false
    case 'dates':
      // same — the dates view is its own component
      return false
    case 'study':
    case 'workout':
      // optional sections render their own components
      return false
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

// Debug / QA hook — lets the harness seed & clean dates without UI clicks.
;(window as unknown as Record<string, unknown>).__anjamDates = {
  add: addImportantDate,
  update: updateImportantDate,
  destroy: destroyImportantDate,
  list: liveDates,
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
      habits: state.habits,
      dates: state.dates,
      subjects: state.subjects,
      slots: state.slots,
      homework: state.homework,
      studyLogs: state.studyLogs,
      workoutPlans: state.workoutPlans,
      workoutLogs: state.workoutLogs,
    },
    null,
    2
  )
}
