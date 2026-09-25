import type { StudySlotRow } from '../types'

/**
 * The study timetable is a **period grid**, not a clock grid.
 *
 * v1.3 stored `{ weekday, start, end }` and drew a time list. v1.4 (FR-08)
 * stores `{ weekday, period }` where `period` is 1..MAX and the period number
 * *is* the schedule — there is no timer, no day-of-week counter, no clock
 * input anywhere in the Study tab.
 *
 * Everything here is pure so the migration can be tested without a browser:
 * the whole point of this file is that converting an old timetable is
 * deterministic (same input → same output, every time) and idempotent
 * (running it again is a no-op rather than a re-shuffle).
 */

/** 12 is the ceiling for one school day; the UI lets you pick 1..12. */
export const MAX_PERIODS = 12

const isValidPeriod = (p: unknown): p is number =>
  typeof p === 'number' && Number.isInteger(p) && p >= 1 && p <= MAX_PERIODS

/**
 * Total ordering for clock rows: `start` first, then `created_at`, then `id`.
 *
 * The `id` tie-break is what makes this deterministic rather than merely
 * stable-in-practice — two rows at the same minute (a duplicated timetable,
 * a bad import) must not swap places between runs, or the migration would
 * silently reorder a student's day.
 */
function byClockThenIdentity(a: StudySlotRow, b: StudySlotRow): number {
  const as = a.start ?? ''
  const bs = b.start ?? ''
  if (as !== bs) return as < bs ? -1 : 1
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
  return a.id < b.id ? -1 : 1
}

/**
 * Map an old clock-ordered timetable onto period indices.
 *
 * Rules:
 *  - a day whose rows already all carry a valid `period` is left untouched
 *    (that is what makes a second run a true no-op);
 *  - a day with any unmigrated row is re-derived **as a whole** from its clock
 *    order, so a half-migrated day cannot end up with two rows at period 1;
 *  - rows past MAX_PERIODS are dropped from the mapping rather than clamped,
 *    because two classes collapsing onto one period would lose a subject.
 *
 * Returns the same array reference when nothing needed migrating, which the
 * caller uses to decide whether anything has to be written back.
 */
export function migrateToPeriods(slots: StudySlotRow[]): StudySlotRow[] {
  const live = slots.filter((s) => !s.deleted)
  const days = new Map<number, StudySlotRow[]>()
  for (const s of live) {
    const arr = days.get(s.weekday)
    if (arr) arr.push(s)
    else days.set(s.weekday, [s])
  }

  const dirtyDays = new Set<number>()
  for (const [wd, rows] of days) {
    if (rows.some((r) => !isValidPeriod(r.period))) dirtyDays.add(wd)
  }
  if (dirtyDays.size === 0) return slots

  const next = slots.map((s) => ({ ...s }))
  const nextById = new Map(next.map((s) => [s.id, s]))
  const overflow = new Set<string>()

  for (const wd of dirtyDays) {
    const rows = (days.get(wd) ?? []).slice().sort(byClockThenIdentity)
    rows.forEach((row, i) => {
      if (i >= MAX_PERIODS) {
        overflow.add(row.id)
        return
      }
      const target = nextById.get(row.id)
      if (target) target.period = i + 1
    })
  }
  // Rows past the ceiling cannot be numbered, so they leave the timetable
  // here rather than being clamped onto ring 12 — two classes sharing one
  // ring would lose one of them on the next edit anyway.
  return overflow.size ? next.filter((s) => !overflow.has(s.id)) : next
}

/** Every live row of one weekday, ordered by period. */
export function periodsOfDay(slots: StudySlotRow[], weekday: number): StudySlotRow[] {
  return slots
    .filter((s) => !s.deleted && s.weekday === weekday && isValidPeriod(s.period))
    .slice()
    .sort((a, b) => a.period - b.period)
}

/** How many rings a day currently has. */
export function periodCount(slots: StudySlotRow[], weekday: number): number {
  return periodsOfDay(slots, weekday).filter((s) => isValidPeriod(s.period)).length
}

/**
 * Expand a day to exactly `count` rings, adding blank (subject-less) rows and
 * trimming the surplus from the end. Blank rows are real rows, so the grid is
 * always `count` cells wide and a tap on cell N always has somewhere to land.
 */
export function withPeriodCount(
  slots: StudySlotRow[],
  weekday: number,
  count: number,
  make: (period: number) => StudySlotRow,
): { rows: StudySlotRow[]; added: StudySlotRow[]; removed: string[] } {
  const n = Math.max(1, Math.min(MAX_PERIODS, Math.round(count)))
  const current = periodsOfDay(slots, weekday)
  const added: StudySlotRow[] = []
  const removed: string[] = []

  for (let p = current.length + 1; p <= n; p++) added.push(make(p))
  for (let p = n; p < current.length; p++) {
    const victim = current[p]
    if (victim) removed.push(victim.id)
  }

  const keep = current.slice(0, n)
  const merged = [...keep, ...added].sort((a, b) => a.period - b.period)
  return { rows: merged, added, removed }
}
