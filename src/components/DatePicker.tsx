import { useEffect, useRef, useState } from 'react'
import type { Lang } from '../types'
import { t, toFaDigits } from '../lib/i18n'
import {
  dualLabel,
  formatIso,
  getCalPref,
  isoToParts,
  monthCells,
  monthTitle,
  setCalPref,
  shiftMonth,
  toGregorian,
  toJalaali,
  todayParts,
  weekdayHeaders,
  type CalSys,
} from '../lib/calendar'
import { CalendarDay, ChevronLeft, X } from './Icons'

/** First-day-of-month conversion helpers for the header toggle. */
function firstOfMonth(sys: CalSys, y: number, m: number): { y: number; m: number } {
  if (sys === 'jalali') {
    const g = toGregorian(y, m, 1)
    return { y: g.gy, m: g.gm }
  }
  const j = toJalaali(y, m, 1)
  return { y: j.jy, m: j.jm }
}

function todayIso(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

/** Date picker with a Jalali ⇄ Gregorian toggle (persisted globally). */
export default function DatePicker({
  lang,
  value,
  onChange,
  onClear,
}: {
  lang: Lang
  value: string
  onChange: (iso: string) => void
  onClear?: () => void
}) {
  const tt = (k: string) => t(lang, k)
  const [sys, setSys] = useState<CalSys>(getCalPref())
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const p = isoToParts(getCalPref(), value) || todayParts(getCalPref())
    return { y: p.y, m: p.m }
  })
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = () => setSys(getCalPref())
    const away = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('anjam:cal-changed', sync)
    document.addEventListener('mousedown', away)
    return () => {
      window.removeEventListener('anjam:cal-changed', sync)
      document.removeEventListener('mousedown', away)
    }
  }, [])

  const cells = monthCells(sys, view.y, view.m)
  const fa = lang === 'fa'
  const dig = (n: number) => (fa ? toFaDigits(n) : String(n))

  function go(delta: number) {
    setView(shiftMonth(sys, view.y, view.m, delta))
  }

  function switchSys(next: CalSys) {
    if (next === sys) return
    // Interpret the visible month as belonging to the CURRENT system, convert to the other.
    const conv = firstOfMonth(sys, view.y, view.m)
    setSys(next)
    setCalPref(next)
    setView(conv)
  }

  function pickToday() {
    const p = todayParts(sys)
    onChange(todayIso())
    setView({ y: p.y, m: p.m })
    setOpen(false)
  }

  return (
    <div className="datepicker" ref={rootRef}>
      <button type="button" className="date-trigger" onClick={() => setOpen((o) => !o)}>
        <CalendarDay width={15} height={15} />
        <span className={value ? '' : 'muted'}>{value ? formatIso(value, sys, lang) : tt('noDueDate')}</span>
        {value && onClear && (
          <span
            className="date-clear"
            role="button"
            aria-label={tt('clearDate')}
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
          >
            <X width={12} height={12} />
          </span>
        )}
      </button>

      {open && (
        <div className="cal-pop" role="dialog">
          <div className="cal-head">
            <div className="cal-nav">
              <button className="icon-btn tiny cal-prev" aria-label="prev" onClick={() => go(-1)}>
                <ChevronLeft width={15} height={15} />
              </button>
              <button className="icon-btn tiny cal-next" aria-label="next" onClick={() => go(1)}>
                <ChevronLeft width={15} height={15} />
              </button>
            </div>
            <div className="cal-title">{monthTitle(sys, view.y, view.m, lang)}</div>
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
          </div>

          <div className="cal-weekdays">
            {weekdayHeaders(sys, lang).map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>

          <div className="cal-grid">
            {cells.map((c, i) => (
              <button
                key={i}
                type="button"
                className={`cal-day ${c.faded ? 'faded' : ''} ${c.isToday ? 'today' : ''} ${
                  value === c.iso ? 'sel' : ''
                }`}
                onClick={() => {
                  onChange(c.iso)
                  setOpen(false)
                }}
              >
                {dig(c.day)}
              </button>
            ))}
          </div>

          <div className="cal-foot">
            <button className="cal-foot-btn" onClick={pickToday}>
              {tt('today')}
            </button>
            {value && <span className="cal-dual muted small">{dualLabel(value, sys)}</span>}
            <button
              className="cal-foot-btn"
              onClick={() => {
                onClear?.()
                setOpen(false)
              }}
            >
              {tt('clearDate')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
