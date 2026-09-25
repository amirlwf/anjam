import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Lang } from '../types'
import { t, toFaDigits } from '../lib/i18n'
import { store, addImportantDate, updateImportantDate, destroyImportantDate } from '../lib/store'
import { CATALOG, occNext, rowNext, daysUntil, formatIn, type Occasion } from '../lib/occasions'
import { getCalPref, toJalaali } from '../lib/calendar'
import { localDate } from '../lib/util'
import DatePicker from './DatePicker'
import { Bell, CalendarDay, Plus, Trash } from './Icons'

function useStore() {
  return useSyncExternalStore(store.subscribe, store.getState)
}

const LEADS = [0, 3, 7, 10, 14, 30]

export default function Dates({ lang }: { lang: Lang }) {
  const tt = (k: string) => t(lang, k)
  const st = useStore()

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [iso, setIso] = useState<string>(() => localDate())
  const [lead, setLead] = useState(10)
  const [time, setTime] = useState('09:00')
  const [calSys, setCalSys] = useState(() => getCalPref())

  // Follow the global Jalali ⇄ Gregorian switch (same event DatePicker emits).
  useEffect(() => {
    const sync = () => setCalSys(getCalPref())
    window.addEventListener('anjam:cal-changed', sync)
    return () => window.removeEventListener('anjam:cal-changed', sync)
  }, [])

  const live = st.dates.filter((d) => !d.deleted)
  const rows = useMemo(
    () =>
      live
        .map((r) => {
          const n = rowNext(r)
          return { r, n, left: daysUntil(n) }
        })
        .sort((a, b) => a.n.getTime() - b.n.getTime()),
    [live]
  )

  function leftLabel(left: number): string {
    if (left <= 0) return lang === 'fa' ? 'امروز' : 'Today'
    return lang === 'fa' ? `${toFaDigits(left)} روز مانده` : `${left} days left`
  }

  function leadLabel(days: number): string {
    return tt(`lead${days}`)
  }

  function reset() {
    setTitle('')
    setIso(localDate())
    setLead(10)
    setTime('09:00')
    setAdding(false)
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const name = title.trim()
    if (!name) return
    // `iso` is ALWAYS a Gregorian YYYY-MM-DD (that is what DatePicker emits
    // and what localDate() returns). Rows are stored per calendar system, so
    // the parts must be converted when the display system is Jalali/Hijri —
    // previously the raw 2027-01-01 became jalali month=1, day=1, i.e. Farvardin.
    const [gy, gm, gd] = iso.split('-').map(Number)
    if (!gy || !gm || !gd) return
    let system: 'jalali' | 'gregorian' | 'hijri' = calSys
    let month = gm
    let day = gd
    if (calSys === 'jalali') {
      const j = toJalaali(gy, gm, gd)
      system = 'jalali'
      month = j.jm
      day = j.jd
    }
    if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12) return
    if (day < 1 || day > 31) return
    const leadDays = LEADS.includes(lead) ? lead : 10
    void addImportantDate({
      title: name,
      system,
      month,
      day,
      remind_days: leadDays,
      remind_time: time || '09:00',
    })
    reset()
  }

  /** Keep a catalog suggestion: the row stores the catalog id so its rule
   *  (fixed day, nth-weekday, or hijri) stays exact for every future year. */
  function keep(o: Occasion) {
    void addImportantDate({
      title: lang === 'fa' ? o.fa : o.en,
      system: o.sys,
      month: o.month,
      day: o.day ?? 1,
      remind_days: 10,
      remind_time: '09:00',
      source: o.id,
    })
  }

  const suggestions = CATALOG.filter((o) => !live.some((r) => r.source === o.id))
  const upcoming = rows.slice(0, 4)

  return (
    <div className="dates-wrap" data-testid="dates-view">
      <div className="dates-hero">
        <div className="dates-hero-text">
          <h2>{tt('datesTitle')}</h2>
          <p className="muted">{tt('datesSub')}</p>
        </div>
        <button
          className="btn primary"
          data-testid="date-add-open"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus width={16} height={16} />
          {tt('addDate')}
        </button>
      </div>

      {adding && (
        <form className="card date-form" data-testid="date-form" onSubmit={save}>
          <input
            className="input"
            data-testid="date-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tt('dateTitlePh')}
            autoFocus
          />
          <div className="date-form-row">
            <div className="date-form-field">
              <span className="muted small">{tt('datePick')}</span>
              <DatePicker lang={lang} value={iso} onChange={setIso} onClear={() => setIso(localDate())} />
            </div>
            <label className="date-form-field">
              <span className="muted small">{tt('remindBefore')}</span>
              <select
                className="select"
                data-testid="date-lead"
                value={lead}
                onChange={(e) => setLead(Number(e.target.value))}
              >
                {LEADS.map((n) => (
                  <option key={n} value={n}>
                    {tt(`lead${n}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="date-form-field">
              <span className="muted small">{tt('remindAt')}</span>
              <input
                className="input"
                type="time"
                data-testid="date-time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          </div>
          <div className="date-form-actions">
            <button type="submit" className="btn primary" data-testid="date-save">
              {tt('save')}
            </button>
            <button type="button" className="btn ghost" onClick={reset}>
              {tt('cancel')}
            </button>
          </div>
        </form>
      )}

      {upcoming.length > 0 && (
        <div className="date-strip" data-testid="date-strip">
          {upcoming.map(({ r, n, left }) => (
            <div
              className={`date-strip-card ${left <= 0 ? 'is-today' : left <= 7 ? 'is-soon' : ''}`}
              key={r.id}
            >
              <div className="ds-main">
                <b>{r.title}</b>
                <span className="muted small">{formatIn(n, calSys, lang)}</span>
              </div>
              <span className={`ds-count ${left <= 0 ? 'today' : left <= 7 ? 'soon' : ''}`}>
                {leftLabel(left)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="section-head">
        <h3>{tt('myDates')}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="card empty date-empty" data-testid="dates-empty">
          <CalendarDay width={28} height={28} />
          <p className="muted">{tt('noDates')}</p>
        </div>
      ) : (
        <ul className="date-list" data-testid="date-list">
          {rows.map(({ r, n, left }) => (
            <li className="date-row" data-testid="date-row" key={r.id}>
              <div className="dr-main">
                <b>{r.title}</b>
                <span className="muted small">
                  {formatIn(n, calSys, lang)} · {leftLabel(left)}
                </span>
              </div>
              <span className={`dr-lead ${r.enabled ? '' : 'is-off'}`} data-testid="date-lead-chip">
                {r.enabled
                  ? `${leadLabel(r.remind_days)} ${tt('remindAt')} ${toFaDigits(r.remind_time)}`
                  : tt('remindOff') ?? '—'}
              </span>
              <button
                className={`icon-btn ${r.enabled ? '' : 'is-muted'}`}
                title={tt('remindOn')}
                aria-pressed={r.enabled}
                onClick={() => void updateImportantDate(r.id, { enabled: !r.enabled })}
              >
                <Bell />
              </button>
              <button
                className="icon-btn danger"
                title={tt('deleteDate')}
                onClick={() => {
                  if (window.confirm(tt('delete') + '?')) void destroyImportantDate(r.id)
                }}
              >
                <Trash />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="section-head">
        <h3>{tt('suggestions')}</h3>
        <span className="muted small">{tt('suggestSub')}</span>
      </div>
      <div className="sugg-grid" data-testid="sugg-grid">
        {suggestions.map((o) => {
          const n = occNext(o)
          return (
            <div className="sugg-card" data-testid="sugg-card" key={o.id}>
              <span className="sc-emoji" aria-hidden>
                {o.emoji}
              </span>
              <div className="sc-text">
                <b>{lang === 'fa' ? o.fa : o.en}</b>
                <span className="muted small">{formatIn(n, calSys, lang)}</span>
              </div>
              <button
                className="icon-btn"
                data-testid="sugg-add"
                title={tt('suggestAdd')}
                onClick={() => keep(o)}
              >
                <Plus />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
