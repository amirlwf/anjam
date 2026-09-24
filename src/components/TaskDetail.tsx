import { useState } from 'react'
import type { Lang, Recurrence } from '../types'
import { t, fmtDate } from '../lib/i18n'
import { store, updateTask, toggleTask, destroyTask, addTask, subtasksOf } from '../lib/store'
import { useStore } from '../lib/hooks'
import { Plus, Trash, X } from './Icons'
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

  const task = st.tasks.find((x) => x.id === taskId && !x.deleted)
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
          {task.due_at && !task.all_day && (
            <label className="field compact">
              <span>{tt('dueTime')}</span>
              <input type="time" value={toTimeInput(task.due_at)} onChange={(e) => setTime(e.target.value)} />
            </label>
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
