import { useEffect, useState } from 'react'
import type { Lang, Recurrence } from '../types'
import { t, fmtDate, fmtTime } from '../lib/i18n'
import { store, updateTask, toggleTask, destroyTask, addTask, subtasksOf } from '../lib/store'
import { isMuted, toggleMute } from '../lib/alarms'
import { useStore } from '../lib/hooks'
import { Bell, Plus, Trash, X } from './Icons'
import DatePicker from './DatePicker'

function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function toTimeInput(iso: string | null): string {
  if (!iso) return '09:00'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function TaskDetail({
  lang,
  taskId,
  onClose,
}: {
  lang: Lang
  taskId: string
  onClose: () => void
}) {
  const tt = (k: string) => t(lang, k)
  const st = useStore()
  const [subInput, setSubInput] = useState('')
  const [, setBellTick] = useState(0)
  /**
   * The clock field is controlled by `task.due_at`, and `setTime` writes to
   * the store asynchronously. Without a local draft every keystroke triggers a
   * re-render that pushes the *previous* value back into the input while the
   * write is still in flight — which is exactly how digits went missing when
   * typing a real clock time (the QA harness caught it: 21:35 arrived as
   * 02:13). The draft holds the edited value until the store has caught up.
   */
  const [timeDraft, setTimeDraft] = useState<string | null>(null)

  const task = st.tasks.find((x) => x.id === taskId && !x.deleted)

  // The lookup must stay above the hooks: a dependency array is evaluated
  // during render, so `task` has to exist by the time it is read.
  useEffect(() => setTimeDraft(null), [taskId])
  const dueAt = task?.due_at ?? null
  useEffect(() => {
    // Drop the draft only once the store carries the edited value, otherwise
    // blurring before the write lands would snap the field back. Depending on
    // the value (not the row) matters: the store may keep object identity
    // across an update, and then this would never re-run.
    if (timeDraft !== null && toTimeInput(dueAt) === timeDraft) setTimeDraft(null)
  }, [timeDraft, dueAt])

  if (!task) return null
  const tk = task

  const children = subtasksOf(task.id)
  const lists = st.lists.filter((x) => !x.deleted).sort((a, b) => a.sort_order - b.sort_order)
  const labels = st.labels.filter((x) => !x.deleted)

  function setDate(value: string) {
    if (!value) {
      void updateTask(taskId, { due_at: null, all_day: true })
      return
    }
    const existing = tk.due_at ? new Date(tk.due_at) : null
    const [y, m, d] = value.split('-').map((x) => parseInt(x, 10))
    const date = new Date(y, m - 1, d)
    if (!tk.all_day && existing) {
      date.setHours(existing.getHours(), existing.getMinutes(), 0, 0)
    } else {
      date.setHours(0, 0, 0, 0)
    }
    void updateTask(taskId, { due_at: date.toISOString() })
  }

  function setTime(value: string) {
    if (!tk.due_at) return
    const date = new Date(tk.due_at)
    const [h, mi] = value.split(':').map((x) => parseInt(x, 10))
    date.setHours(h, mi, 0, 0)
    void updateTask(taskId, { due_at: date.toISOString(), all_day: false })
  }

  function toggleLabel(name: string) {
    const has = tk.labels.includes(name)
    void updateTask(taskId, {
      labels: has ? tk.labels.filter((l) => l !== name) : [...tk.labels, name],
    })
  }

  return (
    <div className="detail" role="dialog">
      <div className="detail-head">
        <button
          className={`check-btn big p${task.priority} ${task.status === 'done' ? 'checked' : ''}`}
          onClick={() => void toggleTask(task.id)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <input
          className="detail-title"
          defaultValue={task.title}
          key={task.id + task.updated_at}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== task.title) void updateTask(taskId, { title: v })
            else e.target.value = task.title
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <button className="icon-btn" onClick={onClose}>
          <X />
        </button>
      </div>

      <div className="detail-body">
        <div className="detail-grid">
          <label className="field compact">
            <span>{tt('dueDate')}</span>
            <DatePicker lang={lang} value={toDateInput(task.due_at)} onChange={setDate} onClear={() => setDate('')} />
          </label>
          {task.due_at && (
            <label className="field compact">
              <span>{tt('dueTime')}</span>
              <div className="time-row">
                <div className="segmented time-seg">
                  <button
                    className={`seg-btn ${task.all_day ? 'active' : ''}`}
                    onClick={() => void updateTask(taskId, { all_day: true })}
                  >
                    {tt('allDay')}
                  </button>
                  <button
                    className={`seg-btn ${!task.all_day ? 'active' : ''}`}
                    onClick={() => {
                      if (!task.due_at) return
                      const d = new Date(task.due_at)
                      if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(9, 0, 0, 0)
                      void updateTask(taskId, { due_at: d.toISOString(), all_day: false })
                      setBellTick((x) => x + 1)
                    }}
                  >
                    {tt('timed')}
                  </button>
                </div>
                {!task.all_day && (
                  <input
                    className="time-input"
                    data-testid="time-input"
                    type="time"
                    value={timeDraft ?? toTimeInput(task.due_at)}
                    onChange={(e) => {
                      setTimeDraft(e.target.value)
                      setTime(e.target.value)
                    }}
                    onBlur={() => {
                      // If the write already landed the effect has cleared the
                      // draft; if it has not, dropping it here would flash the
                      // old time back, so only settle when they agree.
                      if (toTimeInput(task.due_at) === timeDraft) setTimeDraft(null)
                    }}
                  />
                )}
              </div>
            </label>
          )}
          {task.due_at && !task.all_day && (new Date(task.due_at).getHours() !== 0 || new Date(task.due_at).getMinutes() !== 0) && (
            <div className="field compact">
              <span>{tt('alarm')}</span>
              <button
                className={`bell-btn ${isMuted(task.id) ? 'off' : 'on'}`}
                data-testid="bell-btn"
                onClick={() => {
                  toggleMute(task.id)
                  setBellTick((x) => x + 1)
                }}
              >
                <Bell width={14} height={14} />
                {isMuted(task.id) ? tt('alarmOff') : `${tt('alarmOn')} ${fmtTime(lang, task.due_at)}`}
              </button>
            </div>
          )}
          <label className="field compact">
            <span>{tt('priority')}</span>
            <div className="segmented">
              {[0, 1, 2, 3, 4].map((p) => (
                <button
                  key={p}
                  className={`seg-btn sp${p} ${task.priority === p ? 'active' : ''}`}
                  onClick={() => void updateTask(taskId, { priority: p as 0 | 1 | 2 | 3 | 4 })}
                >
                  {p === 0 ? '—' : p}
                </button>
              ))}
            </div>
          </label>
          <label className="field compact">
            <span>{tt('projects')}</span>
            <select
              value={task.list_id ?? ''}
              onChange={(e) => void updateTask(taskId, { list_id: e.target.value || null })}
            >
              <option value="">{tt('inbox')}</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field compact">
            <span>{tt('recurrence')}</span>
            <select
              value={task.recurrence}
              onChange={(e) => void updateTask(taskId, { recurrence: e.target.value as Recurrence })}
            >
              <option value="none">{tt('repeatNone')}</option>
              <option value="daily">{tt('repeatDaily')}</option>
              <option value="weekdays">{tt('repeatWeekdays')}</option>
              <option value="weekly">{tt('repeatWeekly')}</option>
              <option value="monthly">{tt('repeatMonthly')}</option>
              <option value="yearly">{tt('repeatYearly')}</option>
            </select>
          </label>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">{tt('labels')}</div>
          <div className="label-chips">
            {labels.map((l) => (
              <button
                key={l.id}
                className={`chip-label ${task.labels.includes(l.name) ? 'active' : ''}`}
                style={{ '--chip': l.color } as React.CSSProperties}
                onClick={() => toggleLabel(l.name)}
              >
                {l.name}
              </button>
            ))}
            {labels.length === 0 && <span className="muted small">{tt('newLabel')}…</span>}
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">{tt('notes')}</div>
          <textarea
            defaultValue={task.notes}
            key={task.id + '-notes-' + task.updated_at}
            placeholder={tt('notesPlaceholder')}
            rows={4}
            onBlur={(e) => {
              const v = e.target.value
              if (v !== task.notes) void updateTask(taskId, { notes: v })
            }}
          />
        </div>

        <div className="detail-section">
          <div className="detail-section-title">
            {tt('subtasks')} {children.length > 0 && <span className="muted">· {children.length}</span>}
          </div>
          {children.map((c) => (
            <div key={c.id} className={`subtask-row ${c.status === 'done' ? 'done' : ''}`}>
              <button
                className={`check-btn small p${c.priority} ${c.status === 'done' ? 'checked' : ''}`}
                onClick={() => void toggleTask(c.id)}
              >
                <svg viewBox="0 0 24 24" width="11" height="11">
                  <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="subtask-title">{c.title}</span>
              <button className="icon-btn tiny" onClick={() => void destroyTask(c.id)}>
                <Trash width={13} height={13} />
              </button>
            </div>
          ))}
          <div className="inline-add wide">
            <input
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && subInput.trim()) {
                  void addTask({ title: subInput.trim(), parent_id: task.id, list_id: task.list_id })
                  setSubInput('')
                }
              }}
              placeholder={tt('addSubtask')}
            />
            <button
              className="icon-btn tiny"
              onClick={() => {
                if (subInput.trim()) {
                  void addTask({ title: subInput.trim(), parent_id: task.id, list_id: task.list_id })
                  setSubInput('')
                }
              }}
            >
              <Plus width={14} height={14} />
            </button>
          </div>
        </div>

        <div className="detail-foot">
          <span className="muted small">
            {tt('created')}: {fmtDate(lang, task.created_at)}
            {task.completed_at ? ` · ${tt('doneOn')} ${fmtDate(lang, task.completed_at)}` : ''}
          </span>
          <button
            className="btn danger small"
            onClick={() => {
              if (window.confirm(tt('delete') + '?')) {
                void destroyTask(task.id)
                onClose()
              }
            }}
          >
            <Trash width={14} height={14} /> {tt('delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
