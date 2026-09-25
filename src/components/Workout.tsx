import { useSyncExternalStore, useState } from 'react'
import type { Lang, WorkoutExercise } from '../types'
import { t, toFaDigits } from '../lib/i18n'
import {
  store,
  liveWorkoutPlans,
  liveWorkoutLogs,
  addWorkoutPlan,
  updateWorkoutPlan,
  destroyWorkoutPlan,
  saveWorkoutLog,
  weekIdx,
} from '../lib/store'
import { localDate } from '../lib/util'
import { Plus, X } from './Icons'

function useStore() {
  return useSyncExternalStore(store.subscribe, store.getState)
}

const DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Consecutive planned days completed (rest days are skipped, not broken). */
function workoutStreak(plans: { weekday: number }[], logs: { date: string; done: string[] }[]): number {
  const plannedDays = new Set(plans.map((p) => p.weekday))
  const logDates = new Set(logs.filter((l) => l.done.length > 0).map((l) => l.date))
  let n = 0
  const cursor = new Date()
  // a streak survives until the current planned day is actually missed
  const todayIdx = weekIdx(cursor)
  if (plannedDays.has(todayIdx) && !logDates.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1)
  for (let i = 0; i < 90; i++) {
    const wd = weekIdx(cursor)
    if (plannedDays.has(wd)) {
      if (logDates.has(localDate(cursor))) n++
      else break
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

export default function Workout({ lang }: { lang: Lang }) {
  const tt = (k: string) => t(lang, k)
  useStore() // subscribe: live* readers above need re-renders
  const fa = lang === 'fa'
  const [tab, setTab] = useState<'week' | 'today'>('week')

  const plans = liveWorkoutPlans()
  const logs = liveWorkoutLogs()
  const today = localDate()
  const todayIdx = weekIdx()
  const todayPlan = plans.find((p) => p.weekday === todayIdx) || null
  const todayLog = logs.find((l) => l.date === today && l.plan_id === (todayPlan?.id ?? null)) || null

  /* week progress: distinct days of the current week (شنبه..جمعه) with a real log */
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - todayIdx)
  const weekDateSet = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return localDate(d)
  })
  const doneDates = new Set(logs.filter((l) => l.done.length > 0 && weekDateSet.includes(l.date)).map((l) => l.date))
  const weekDone = [...doneDates].filter((d) => {
    const wd = weekIdx(new Date(d + 'T00:00:00'))
    return plans.some((p) => p.weekday === wd)
  }).length
  const streak = workoutStreak(plans, logs)

  /* ---------- add-day form ---------- */
  const [fDay, setFDay] = useState(String(todayIdx))
  const [fTime, setFTime] = useState('18:00')
  async function submitDay() {
    if (plans.some((p) => p.weekday === Number(fDay))) return
    await addWorkoutPlan({ weekday: Number(fDay), time: fTime || null })
  }

  /* ---------- per-plan exercise form ---------- */
  const [exName, setExName] = useState('')
  const [exSets, setExSets] = useState('3')
  const [exReps, setExReps] = useState('12')
  async function addEx(planId: string) {
    const name = exName.trim()
    if (!name) return
    const plan = plans.find((p) => p.id === planId)
    if (!plan) return
    const ex: WorkoutExercise = {
      name,
      sets: Number(exSets) || undefined,
      reps: exReps.trim() || undefined,
    }
    await updateWorkoutPlan(planId, { exercises: [...plan.exercises, ex] })
    setExName('')
  }
  async function removeEx(planId: string, idx: number) {
    const plan = plans.find((p) => p.id === planId)
    if (!plan) return
    await updateWorkoutPlan(planId, { exercises: plan.exercises.filter((_, i) => i !== idx) })
  }

  function toggleCheck(name: string) {
    if (!todayPlan) return
    const cur = todayLog?.done || []
    const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]
    void saveWorkoutLog(today, todayPlan.id, next)
  }

  const doneSet = new Set(todayLog?.done || [])
  const exTotal = todayPlan?.exercises.length || 0
  const exDone = todayPlan ? todayPlan.exercises.filter((e) => doneSet.has(e.name)).length : 0

  const Tabs = () => (
    <div className="segmented study-tabs" role="tablist">
      {(['week', 'today'] as const).map((k) => (
        <button
          key={k}
          className={`seg-btn ${tab === k ? 'active' : ''}`}
          data-testid={`wp-tab-${k}`}
          onClick={() => setTab(k)}
        >
          {tt(k === 'week' ? 'wpWeek' : 'wpTodayTab')}
        </button>
      ))}
    </div>
  )

  return (
    <div className="study-wrap" data-testid="workout-view">
      <Tabs />

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-num">
            {toFaDigits(weekDone)}/{toFaDigits(plans.length || 0)}
          </span>
          <span className="muted small">{tt('wpWeekProgress')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{toFaDigits(streak)}</span>
          <span className="muted small">{tt('wpStreak')}</span>
        </div>
      </div>

      {/* ---------------- weekly plan ---------------- */}
      {tab === 'week' && (
        <div className="study-panel" data-testid="wp-week">
          <div className="slot-form" data-testid="wp-day-form">
            <select value={fDay} onChange={(e) => setFDay(e.target.value)} aria-label={tt('wpWeek')}>
              {DAYS.map((d) => (
                <option key={d} value={d} disabled={plans.some((p) => p.weekday === d)}>
                  {tt(`wd${d}`)}
                </option>
              ))}
            </select>
            <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} aria-label={tt('wpTime')} />
            <button className="btn primary small" data-testid="wp-day-add" onClick={() => void submitDay()}>
              {tt('wpAddDay')}
            </button>
          </div>

          {plans.length === 0 && (
            <p className="empty-line muted" data-testid="wp-empty">
              {tt('noPlans')}
            </p>
          )}

          <div className="wp-list">
            {plans.map((p) => {
              const dayLog = logs.find((l) => l.date === today && l.plan_id === p.id)
              const dayDone = new Set(dayLog?.done || [])
              return (
                <div key={p.id} className={`wp-card ${p.weekday === todayIdx ? 'is-today' : ''}`} data-testid="wp-day">
                  <div className="wp-card-h">
                    <b>{tt(`wd${p.weekday}`)}</b>
                    {p.time && <span className="muted small">{toFaDigits(p.time)}</span>}
                    <span className="spacer" />
                    <button
                      className="chip-x"
                      aria-label={tt('delete')}
                      onClick={() => {
                        if (window.confirm(tt('delete') + '?')) void destroyWorkoutPlan(p.id)
                      }}
                    >
                      <X width={12} height={12} />
                    </button>
                  </div>

                  {p.exercises.length === 0 && <div className="tt-none">{tt('exAdd')}…</div>}
                  <ul className="ex-list">
                    {p.exercises.map((e, i) => (
                      <li key={`${e.name}-${i}`} className={dayDone.has(e.name) ? 'done' : ''} data-testid="wp-ex">
                        <span>{e.name}</span>
                        <span className="muted small">
                          {e.sets ? `${toFaDigits(e.sets)}×` : ''}
                          {e.reps ? toFaDigits(e.reps) : ''}
                          {e.note ? ` · ${e.note}` : ''}
                        </span>
                        <button className="chip-x" aria-label={tt('delete')} onClick={() => void removeEx(p.id, i)}>
                          <X width={11} height={11} />
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="ex-form">
                    <input
                      value={exName}
                      onChange={(e) => setExName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addEx(p.id)
                      }}
                      placeholder={tt('exName')}
                      aria-label={tt('exName')}
                    />
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={exSets}
                      onChange={(e) => setExSets(e.target.value)}
                      placeholder={tt('sets')}
                      aria-label={tt('sets')}
                    />
                    <input
                      value={exReps}
                      onChange={(e) => setExReps(e.target.value)}
                      placeholder={tt('reps')}
                      aria-label={tt('reps')}
                    />
                    <button className="icon-btn tiny" data-testid="wp-ex-add" onClick={() => void addEx(p.id)}>
                      <Plus width={13} height={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ---------------- today ---------------- */}
      {tab === 'today' && (
        <div className="study-panel" data-testid="wp-today">
          {!todayPlan ? (
            <p className="empty-line muted" data-testid="wp-rest">
              {tt('noPlanToday')}
            </p>
          ) : (
            <div className="wp-card is-today">
              <div className="wp-card-h">
                <b>{tt('wpTodayTab')}</b>
                {todayPlan.time && <span className="muted small">{toFaDigits(todayPlan.time)}</span>}
                <span className="spacer" />
                <span className="hw-chip" data-testid="wp-progress">
                  {toFaDigits(exDone)}/{toFaDigits(exTotal)}
                </span>
              </div>

              {todayPlan.exercises.length === 0 ? (
                <div className="tt-none">{tt('exAdd')}…</div>
              ) : (
                <ul className="ex-list checkable">
                  {todayPlan.exercises.map((e, i) => (
                    <li key={`${e.name}-${i}`} className={doneSet.has(e.name) ? 'done' : ''}>
                      <button className="hw-check" data-testid="wp-check" onClick={() => toggleCheck(e.name)}>
                        {doneSet.has(e.name) ? '✓' : ''}
                      </button>
                      <span>{e.name}</span>
                      <span className="muted small">
                        {e.sets ? `${toFaDigits(e.sets)}×` : ''}
                        {e.reps ? toFaDigits(e.reps) : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {exTotal > 0 && exDone === exTotal && (
                <div className="wp-done-banner" data-testid="wp-complete">
                  🎉 {tt('wpStreak')}: {toFaDigits(streak)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
