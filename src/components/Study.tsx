import { useSyncExternalStore, useState } from 'react'
import type { Lang } from '../types'
import { t, toFaDigits } from '../lib/i18n'
import {
  store,
  liveSubjects,
  liveSlots,
  liveHomework,
  liveStudyLogs,
  addStudySubject,
  destroyStudySubject,
  addStudySlot,
  destroyStudySlot,
  addHomework,
  updateHomework,
  destroyHomework,
  addStudyLog,
  destroyStudyLog,
  weekIdx,
} from '../lib/store'
import { localDate } from '../lib/util'
import { Plus, X } from './Icons'

function useStore() {
  return useSyncExternalStore(store.subscribe, store.getState)
}

const DAYS = [0, 1, 2, 3, 4, 5, 6]

function fmtDur(mins: number, fa: boolean): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const str = h > 0 ? `${h}h ${m}m` : `${m}m`
  return fa ? str.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]) : str
}

export default function Study({ lang }: { lang: Lang }) {
  const tt = (k: string) => t(lang, k)
  useStore() // subscribe: live* readers above need re-renders
  const fa = lang === 'fa'
  const [tab, setTab] = useState<'tt' | 'hw' | 'log'>('tt')

  const subjects = liveSubjects()
  const slots = liveSlots()
  const homework = liveHomework()
  const logs = liveStudyLogs()

  const subjById = new Map(subjects.map((s) => [s.id, s]))

  /* ---------- shared: new-subject input ---------- */
  const [newSubj, setNewSubj] = useState('')
  async function submitSubject() {
    const name = newSubj.trim()
    if (!name) return
    setNewSubj('')
    await addStudySubject(name)
  }

  /* ---------- timetable form ---------- */
  const [fSubject, setFSubject] = useState('')
  const [fDay, setFDay] = useState(String(weekIdx()))
  const [fStart, setFStart] = useState('08:00')
  const [fEnd, setFEnd] = useState('09:30')
  const [fRoom, setFRoom] = useState('')
  async function submitSlot() {
    if (!fStart || !fEnd) return
    await addStudySlot({
      subject_id: fSubject || null,
      weekday: Number(fDay),
      start: fStart,
      end: fEnd,
      room: fRoom,
    })
    setFRoom('')
  }

  /* ---------- homework form ---------- */
  const [hTitle, setHTitle] = useState('')
  const [hSubject, setHSubject] = useState('')
  const [hDue, setHDue] = useState('')
  async function submitHw() {
    const title = hTitle.trim()
    if (!title) return
    await addHomework({ title, subject_id: hSubject || null, due: hDue || null })
    setHTitle('')
    setHDue('')
  }

  /* ---------- study-time form ---------- */
  const [lSubject, setLSubject] = useState('')
  const [lMinutes, setLMinutes] = useState('30')
  async function submitLog() {
    const mins = Number(lMinutes)
    if (!Number.isFinite(mins) || mins <= 0) return
    await addStudyLog({ date: localDate(), minutes: mins, subject_id: lSubject || null })
  }

  /* ---------- derived ---------- */
  const today = localDate()
  const todayMins = logs.filter((l) => l.date === today).reduce((s, l) => s + l.minutes, 0)
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return localDate(d)
  })
  const weekMins = logs.filter((l) => weekDates.includes(l.date)).reduce((s, l) => s + l.minutes, 0)
  const maxDay = Math.max(1, ...weekDates.map((d) => logs.filter((l) => l.date === d).reduce((s, l) => s + l.minutes, 0)))

  const openHw = homework.filter((h) => !h.done)
  const doneHw = homework.filter((h) => h.done)
  const hwSort = (a: { due: string | null }, b: { due: string | null }) => {
    if (!a.due && !b.due) return 0
    if (!a.due) return 1
    if (!b.due) return -1
    return a.due < b.due ? -1 : 1
  }
  openHw.sort(hwSort)

  const Tabs = () => (
    <div className="segmented study-tabs" role="tablist">
      {(['tt', 'hw', 'log'] as const).map((k) => (
        <button
          key={k}
          className={`seg-btn ${tab === k ? 'active' : ''}`}
          data-testid={`study-tab-${k}`}
          onClick={() => setTab(k)}
        >
          {tt(k === 'tt' ? 'stTt' : k === 'hw' ? 'stHw' : 'stLog')}
        </button>
      ))}
    </div>
  )

  return (
    <div className="study-wrap" data-testid="study-view">
      <Tabs />

      {/* ---------------- timetable ---------------- */}
      {tab === 'tt' && (
        <div className="study-panel" data-testid="study-tt">
          <div className="subj-row" data-testid="subj-row">
            {subjects.map((s) => (
              <span key={s.id} className="subj-chip" style={{ borderColor: s.color }}>
                <i className="dot" style={{ background: s.color }} />
                {s.name}
                <button className="chip-x" aria-label={tt('delete')} onClick={() => void destroyStudySubject(s.id)}>
                  <X width={11} height={11} />
                </button>
              </span>
            ))}
            <span className="subj-add">
              <input
                value={newSubj}
                onChange={(e) => setNewSubj(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitSubject()
                }}
                placeholder={tt('newSubject')}
                data-testid="subj-input"
              />
              <button className="icon-btn tiny" data-testid="subj-add" onClick={() => void submitSubject()}>
                <Plus width={13} height={13} />
              </button>
            </span>
          </div>

          <div className="slot-form" data-testid="slot-form">
            <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} aria-label={tt('subjectPick')}>
              <option value="">{tt('subjectPick')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={fDay} onChange={(e) => setFDay(e.target.value)} aria-label={tt('stTt')}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {tt(`wd${d}`)}
                </option>
              ))}
            </select>
            <input type="time" value={fStart} onChange={(e) => setFStart(e.target.value)} aria-label={tt('slotFrom')} />
            <input type="time" value={fEnd} onChange={(e) => setFEnd(e.target.value)} aria-label={tt('slotTo')} />
            <input
              value={fRoom}
              onChange={(e) => setFRoom(e.target.value)}
              placeholder={tt('room')}
              aria-label={tt('room')}
            />
            <button className="btn primary small" data-testid="slot-add" onClick={() => void submitSlot()}>
              {tt('slotAdd')}
            </button>
          </div>

          {slots.length === 0 ? (
            <p className="empty-line muted" data-testid="tt-empty">
              {tt('noSlots')}
            </p>
          ) : (
            <div className="tt-grid">
              {DAYS.map((d) => {
                const daySlots = slots
                  .filter((s) => s.weekday === d)
                  .sort((a, b) => (a.start < b.start ? -1 : 1))
                return (
                  <div key={d} className={`tt-day ${d === weekIdx() ? 'is-today' : ''}`}>
                    <div className="tt-day-h">{tt(`wd${d}`)}</div>
                    {daySlots.length === 0 && <div className="tt-none">—</div>}
                    {daySlots.map((s) => {
                      const subj = s.subject_id ? subjById.get(s.subject_id) : null
                      return (
                        <div key={s.id} className="tt-slot" data-testid="slot-row" style={{ borderColor: subj?.color }}>
                          <b>{subj ? subj.name : '•'}</b>
                          <span className="muted small">
                            {toFaDigits(s.start)} – {toFaDigits(s.end)}
                            {s.room ? ` · ${s.room}` : ''}
                          </span>
                          <button className="chip-x" aria-label={tt('delete')} onClick={() => void destroyStudySlot(s.id)}>
                            <X width={11} height={11} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------- homework ---------------- */}
      {tab === 'hw' && (
        <div className="study-panel" data-testid="study-hw">
          <div className="slot-form" data-testid="hw-form">
            <input
              value={hTitle}
              onChange={(e) => setHTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitHw()
              }}
              placeholder={tt('hwTitle')}
              data-testid="hw-input"
            />
            <select value={hSubject} onChange={(e) => setHSubject(e.target.value)} aria-label={tt('subjectPick')}>
              <option value="">{tt('subjectPick')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input type="date" value={hDue} onChange={(e) => setHDue(e.target.value)} aria-label={tt('hwDue')} />
            <button className="btn primary small" data-testid="hw-add" onClick={() => void submitHw()}>
              {tt('hwAdd')}
            </button>
          </div>

          {homework.length === 0 && (
            <p className="empty-line muted" data-testid="hw-empty">
              {tt('noHw')}
            </p>
          )}

          <div className="hw-list">
            {[...openHw, ...doneHw].map((h) => {
              const subj = h.subject_id ? subjById.get(h.subject_id) : null
              const overdue = !h.done && h.due && h.due < today
              const dueToday = !h.done && h.due === today
              return (
                <div key={h.id} className={`hw-row ${h.done ? 'done' : ''}`} data-testid="hw-row">
                  <button
                    className="hw-check"
                    aria-label={tt('done')}
                    onClick={() => void updateHomework(h.id, { done: !h.done })}
                  >
                    {h.done ? '✓' : ''}
                  </button>
                  <div className="hw-main">
                    <b>{h.title}</b>
                    <span className="muted small">
                      {subj && (
                        <i className="dot" style={{ background: subj.color, display: 'inline-block' }} /> 
                      )}
                      {subj ? ` ${subj.name}` : ''}
                      {h.due ? ` · ${toFaDigits(h.due)}` : ''}
                    </span>
                  </div>
                  {overdue && <span className="hw-chip bad">{tt('hwOverdue')}</span>}
                  {dueToday && <span className="hw-chip warn">{tt('today')}</span>}
                  <button className="chip-x" aria-label={tt('delete')} onClick={() => void destroyHomework(h.id)}>
                    <X width={12} height={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ---------------- study time ---------------- */}
      {tab === 'log' && (
        <div className="study-panel" data-testid="study-log">
          <div className="stat-row">
            <div className="stat-card">
              <span className="stat-num">{toFaDigits(fmtDur(todayMins, fa))}</span>
              <span className="muted small">{tt('stTodayTotal')}</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{toFaDigits(fmtDur(weekMins, fa))}</span>
              <span className="muted small">{tt('stWeek')}</span>
            </div>
          </div>

          <div className="week-bars" data-testid="week-bars">
            {weekDates.map((d) => {
              const m = logs.filter((l) => l.date === d).reduce((s, l) => s + l.minutes, 0)
              const wd = weekIdx(new Date(d + 'T00:00:00'))
              return (
                <div key={d} className="wb-col" title={`${m} min`}>
                  <div className="wb-bar" style={{ height: `${Math.round((m / maxDay) * 100)}%` }} />
                  <span className="wb-lbl">{tt(`wd${wd}`).slice(0, 4)}</span>
                </div>
              )
            })}
          </div>

          <div className="slot-form" data-testid="log-form">
            <select value={lSubject} onChange={(e) => setLSubject(e.target.value)} aria-label={tt('subjectPick')}>
              <option value="">{tt('subjectPick')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={720}
              value={lMinutes}
              onChange={(e) => setLMinutes(e.target.value)}
              aria-label={tt('minutes')}
              data-testid="log-min"
            />
            <span className="muted small">{tt('minutes')}</span>
            <button className="btn primary small" data-testid="log-add" onClick={() => void submitLog()}>
              {tt('stAdd')}
            </button>
          </div>
          <div className="minute-chips">
            {['15', '30', '45', '60', '90'].map((m) => (
              <button key={m} className="chip-btn" onClick={() => setLMinutes(m)}>
                {toFaDigits(m)}
              </button>
            ))}
          </div>

          {logs.length === 0 ? (
            <p className="empty-line muted" data-testid="log-empty">
              {tt('stEmpty')}
            </p>
          ) : (
            <div className="log-list">
              {[...logs]
                .sort((a, b) => (a.date < b.date ? 1 : -1) || b.minutes - a.minutes)
                .slice(0, 30)
                .map((l) => {
                  const subj = l.subject_id ? subjById.get(l.subject_id) : null
                  return (
                    <div key={l.id} className="log-row" data-testid="log-row">
                      <i className="dot" style={{ background: subj?.color || 'var(--muted)' }} />
                      <b>{subj ? subj.name : '—'}</b>
                      <span className="muted small">{toFaDigits(l.date)}</span>
                      <span className="log-min">{toFaDigits(fmtDur(l.minutes, fa))}</span>
                      <button className="chip-x" aria-label={tt('delete')} onClick={() => void destroyStudyLog(l.id)}>
                        <X width={12} height={12} />
                      </button>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
