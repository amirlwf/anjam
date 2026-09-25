import type { Lang, TaskRow as Task } from '../types'
import { t, fmtDate } from '../lib/i18n'
import { toggleTask, destroyTask, subtasksOf, dueBucket } from '../lib/store'
import { Repeat, Tag, Trash, Chevron } from './Icons'

export default function TaskRowView({
  lang,
  task,
  selected,
  onOpen,
  index = 0,
}: {
  lang: Lang
  task: Task
  selected: boolean
  onOpen: (id: string) => void
  index?: number
}) {
  const tt = (k: string) => t(lang, k)
  const children = subtasksOf(task.id)
  const doneChildren = children.filter((c) => c.status === 'done').length
  const bucket = task.due_at ? dueBucket(task) : 'none'
  const dueLabel =
    task.due_at && task.status !== 'done'
      ? bucket === 'overdue'
        ? tt('overdue')
        : fmtDate(lang, task.due_at) + (task.all_day ? '' : ' · ' + new Date(task.due_at).toTimeString().slice(0, 5))
      : task.due_at
        ? fmtDate(lang, task.due_at)
        : ''

  return (
    <div
      className={`task-row ${task.status === 'done' ? 'done' : ''} ${selected ? 'selected' : ''}`}
      style={({ '--i': Math.min(index, 14), ...(index > 14 ? { animation: 'none' } : {}) }) as React.CSSProperties}
      onClick={() => onOpen(task.id)}
    >
      <button
        className={`check-btn p${task.priority} ${task.status === 'done' ? 'checked' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          void toggleTask(task.id)
        }}
        aria-label="toggle"
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="task-main">
        <span className="task-title">{task.title || tt('untitled')}</span>
        <div className="task-chips">
          {dueLabel && <span className={`chip due ${bucket === 'overdue' ? 'overdue' : bucket === 'today' ? 'today' : ''}`}>{dueLabel}</span>}
          {task.recurrence !== 'none' && (
            <span className="chip">
              <Repeat width={11} height={11} />
            </span>
          )}
          {children.length > 0 && (
            <span className="chip sub">
              {doneChildren}/{children.length}
            </span>
          )}
          {task.labels.slice(0, 2).map((l) => (
            <span key={l} className="chip label">
              <Tag width={11} height={11} />
              {l}
            </span>
          ))}
          {task.labels.length > 2 && <span className="chip">+{task.labels.length - 2}</span>}
        </div>
      </div>
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn tiny" title={tt('delete')} onClick={() => { if (window.confirm(tt('delete') + '?')) void destroyTask(task.id) }}>
          <Trash width={14} height={14} />
        </button>
        <button className="icon-btn tiny" onClick={() => onOpen(task.id)}>
          <Chevron width={14} height={14} />
        </button>
      </div>
    </div>
  )
}
