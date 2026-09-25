import { useEffect, useMemo, useState } from 'react'
import type { Lang } from '../types'
import { t } from '../lib/i18n'
import { useStore } from '../lib/hooks'
import { addHabit, destroyHabit, toggleHabitDay, dayScore, routineStreak, habitStreak } from '../lib/store'
import { localDate } from '../lib/util'
import {
  getCalPref,
  setCalPref,
  monthCells,
  monthTitle,
  weekdayHeaders,
  shiftMonth,
  todayParts,
  formatIso,
  toJalaali,
  toGregorian,
  type CalSys,
} from '../lib/calendar'
import { CalendarCheck, ChevronLeft, Plus, Trash } from './Icons'

/** First-day-of-month conversion for the Jalali ⇄ Gregorian header toggle. */
function firstOfMonth(sys: CalSys, y: number, m: number): { y: number; m: number } {
  if (sys === 'jalali') {
    const g = toGregorian(y, m, 1)
    return { y: g.gy, m: g.gm }
  }
  const j = toJalaali(y, m, 1)
  return { y: j.jy, m: j.jm }
}

/**
 * Routine view: daily habits + a month heatmap (Jalali/Gregorian) showing
 * exactly which days the routine was kept, with streak counters.
 */
export default function Routine({ lang }: { lang: Lang }) {
  const tt = (k: string) => t(lang, k)
  const st = useStore()
  const [sys, setSys] = useState<CalSys>(() => getCalPref())
  const tp = todayParts(sys)
  const [cur, setCur] = useState(() => ({ y: tp.y, m: tp.m }))
  const [selDay, setSelDay] = useState<string | null>(null)
  const [name, setName] = useState('')

  // follow the global calendar preference when it changes elsewhere
  useEffect(() => {
    const sync = () => setSys(getCalPref())
    window.addEventListener('anjam:cal-changed', sync)
    return () => window.removeEventListener('anjam:cal-changed', sync)
  }, [])

  function switchSys(next: CalSys) {
    if (next === sys) return
    // keep the visible month: reinterpret it in the other system
    setCur(firstOfMonth(sys, cur.y, cur.m))
    setSys(next)
    setCalPref(next)
  }

  const habits = st.habits.filter((h) => !h.deleted)
  const today = localDate()
  const cells = useMemo(() => monthCells(sys, cur.y, cur.m), [sys, cur.y, cur.m])
  const tScore = dayScore(today, st.habits)
  const streak = routineStreak(st.habits)

  const sel = selDay && selDay <= today && selDay ? selDay : null

  function submitHabit() {
    const n = name.trim()
    if (!n) return
    setName('')
    void addHabit(n)
  }

  return (
    <div className="routine-wrap" data-testid="routine-wrap">
      {/* ---- stats ---- */}
      <div className="routine-stats">
        <div className="rstat">
          <span className="rstat-label">{tt('today')}</span>
          <b className="rstat-value" data-testid="r-today-score">
            {tScore.total ? `${tScore.done}/${tScore.total}` : '—'}
          </b>
          <span className={`rstat-sub ${tScore.total > 0 && tScore.done === tScore.total ? 'ok' : ''}`}>
            {tScore.total > 0 && tScore.done === tScore.total ? tt('allDone') : tt('routineSub')}
          </span>
        </div>
        <div className="rstat">
          <span className="rstat-label">🔥 {tt('streakLabel')}</span>
          <b className="rstat-value" data-testid="r-streak">
            {streak.cur}
          </b>
          <span className="rstat-sub">
            {tt('best')}: {streak.best}
          </span>
        </div>
      </div>

      {/* ---- heatmap ---- */}
      <div className="rh-card">
        <div className="rh-head">
          <div className="rh-nav">
            <button className="icon-btn cal-prev" onClick={() => setCur(shiftMonth(sys, cur.y, cur.m, -1))} aria-label="prev">
              <ChevronLeft />
            </button>
            <span className="rh-title">{monthTitle(sys, cur.y, cur.m, lang)}</span>
            <button className="icon-btn cal-next" onClick={() => setCur(shiftMonth(sys, cur.y, cur.m, 1))} aria-label="next">
              <ChevronLeft />
            </button>
          </div>
          <div className="segmented cal-seg">
            <button
              className={`seg-btn ${sys === 'jalali' ? 'active' : ''}`}
              onClick={() => switchSys('jalali')}
            >
              {tt('calSolar')}
            </button>
            <button
              className={`seg-btn ${sys === 'gregorian' ? 'active' : ''}`}
              onClick={() => switchSys('gregorian')}
            >
              {tt('calGreg')}
            </button>
          </div>
          <button className="btn ghost small" onClick={() => setCur({ y: tp.y, m: tp.m })}>
            {tt('goToday')}
          </button>
        </div>
        <div className="rh-weekdays">
          {weekdayHeaders(sys, lang).map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <div className="rh-grid">
          {cells.map((c) => {
            const s = dayScore(c.iso, st.habits)
            const future = c.iso > today
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
            const level =
              s.total === 0 ? 'rh-idle' : s.done === s.total ? 'rh-full' : s.done > 0 ? 'rh-part' : 'rh-zero'
            return (
              <button
                key={c.iso}
                className={`rh-cell ${c.faded ? 'is-out' : ''} ${c.isToday ? 'is-today' : ''} ${
                  future ? 'is-future' : ''
                } ${level} ${sel === c.iso ? 'sel' : ''}`}
                style={level === 'rh-part' ? ({ '--pct': pct + '%' } as React.CSSProperties) : undefined}
                onClick={() => {
                  if (!future && !c.faded) setSelDay(sel === c.iso ? null : c.iso)
                }}
                title={formatIso(c.iso, sys, lang)}
                data-testid={c.isToday ? 'rh-today' : undefined}
              >
                {c.day}
              </button>
            )
          })}
        </div>
        <div className="rh-legend">
          <span>
            <i className="lg-sq rh-idle" /> {tt('legendMiss')}
          </span>
          <span>
            <i className="lg-sq rh-part-lg" /> {tt('legendPart')}
          </span>
          <span>
            <i className="lg-sq rh-full" /> {tt('legendFull')}
          </span>
        </div>
      </div>

      {/* ---- selected day ---- */}
      {sel && (
        <div className="day-detail" data-testid="day-detail">
          <span className="day-detail-title">{formatIso(sel, sys, lang)}</span>
          {habits.map((h) => {
            const on = h.logs.includes(sel)
            const existed = localDate(new Date(h.created_at)) <= sel
            return (
              <button
                key={h.id}
                className={`day-habit ${on ? 'on' : ''}`}
                style={{ '--chip': h.color } as React.CSSProperties}
                disabled={!existed}
                onClick={() => toggleHabitDay(h.id, sel)}
              >
                <span className="dh-dot" />
                {h.name}
              </button>
            )
          })}
        </div>
      )}

      {/* ---- today's habits ---- */}
      <div className="habit-list">
        <div className="detail-section-title">{tt('todayHabits')}</div>
        {habits.length === 0 && <p className="muted small habit-empty">{tt('routineEmpty')}</p>}
        {habits.map((h) => {
          const on = h.logs.includes(today)
          const hs = habitStreak(h)
          return (
            <div className="habit-row" key={h.id} data-testid="habit-row">
              <button
                className={`check-btn ${on ? 'checked' : ''}`}
                style={{
                  borderColor: h.color,
                  ...(on ? { background: h.color, borderColor: h.color } : {}),
                }}
                onClick={() => toggleHabitDay(h.id, today)}
                aria-label="toggle"
              >
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path
                    d="m5 12.5 4.5 4.5L19 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className="h-dot" style={{ background: h.color }} />
              <span className="h-name">{h.name}</span>
              {hs > 0 && <span className="h-streak">🔥 {hs}</span>}
              <button
                className="icon-btn tiny"
                title={tt('delete')}
                onClick={() => {
                  if (window.confirm(tt('delete') + '?')) void destroyHabit(h.id)
                }}
              >
                <Trash width={14} height={14} />
              </button>
            </div>
          )
        })}
        <div className="habit-add">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitHabit()
            }}
            placeholder={tt('habitPlaceholder')}
            data-testid="habit-input"
          />
          <button className="btn primary small" disabled={!name.trim()} onClick={submitHabit}>
            <Plus width={15} height={15} />
            <span className="only-wide">{tt('addHabit')}</span>
          </button>
        </div>
      </div>

      {habits.length === 0 && (
        <div className="routine-hint">
          <CalendarCheck width={18} height={18} />
          <span>{tt('routineHint')}</span>
        </div>
      )}
    </div>
  )
}
