import type { Lang, TaskRow as Task, View } from '../types'
import { t, fmtDate } from '../lib/i18n'
import { rootTasks, sortTasks, matchesView, dueBucket } from '../lib/store'
import { useStore } from '../lib/hooks'
import TaskRowView from './TaskRow'

function matchesQuery(task: Task, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return (
    task.title.toLowerCase().includes(s) ||
    task.notes.toLowerCase().includes(s) ||
    task.labels.some((l) => l.toLowerCase().includes(s))
  )
}

export default function TaskList({
  lang,
  view,
  query,
  showCompleted,
  selected,
  onOpen,
}: {
  lang: Lang
  view: View
  query: string
  showCompleted: boolean
  selected: string | null
  onOpen: (id: string) => void
}) {
  const tt = (k: string) => t(lang, k)
  const st = useStore()

  const searching = query.trim().length > 0

  let tasks = rootTasks().filter((x) => (searching ? true : matchesView(x, view)))
  if (searching) tasks = tasks.filter((x) => matchesQuery(x, query))
  if (!searching && view.kind !== 'completed') {
    tasks = tasks.filter((x) => x.status === 'todo' || showCompleted)
  }
  tasks = sortTasks(tasks)

  if (!tasks.length) {
    const emptyKey = searching
      ? 'emptySearch'
      : view.kind === 'today'
        ? 'emptyToday'
        : view.kind === 'upcoming'
          ? 'emptyUpcoming'
          : 'emptyList'
    return (
      <div className="empty-state">
        <div className="empty-icon">✓</div>
        <p>{tt(emptyKey)}</p>
      </div>
    )
  }

  // grouping for date-based views
  const groups: { key: string; label: string; items: Task[] }[] = []
  if (!searching && (view.kind === 'today' || view.kind === 'upcoming')) {
    const overdue = tasks.filter((x) => dueBucket(x) === 'overdue')
    const today = tasks.filter((x) => dueBucket(x) === 'today')
    const later = tasks.filter((x) => dueBucket(x) === 'upcoming' || dueBucket(x) === 'none')
    if (view.kind === 'today') {
      if (overdue.length) groups.push({ key: 'od', label: tt('overdue'), items: overdue })
      if (today.length) groups.push({ key: 'td', label: tt('today'), items: today })
      if (later.length) groups.push({ key: 'lt', label: tt('upcoming'), items: later })
    } else {
      const byDay = new Map<string, Task[]>()
      for (const x of tasks) {
        const dkey = x.due_at ? new Date(x.due_at).toDateString() : 'none'
        const arr = byDay.get(dkey) ?? []
        arr.push(x)
        byDay.set(dkey, arr)
      }
      const keys = [...byDay.keys()].sort((a, b) => {
        if (a === 'none') return 1
        if (b === 'none') return -1
        return new Date(a).getTime() - new Date(b).getTime()
      })
      for (const k of keys) {
        const label = k === 'none' ? tt('noDueDate') : fmtDate(lang, new Date(k).toISOString())
        groups.push({ key: k, label, items: byDay.get(k)! })
      }
      if (overdue.length) groups.unshift({ key: 'od', label: tt('overdue'), items: overdue })
    }
  } else {
    groups.push({ key: 'all', label: '', items: tasks })
  }

  void st

  return (
    <div className="task-list-wrap">
      {groups.map((g) => (
        <div key={g.key} className="task-group">
          {g.label && (
            <div className={`group-title ${g.key === 'od' ? 'overdue' : ''}`}>
              {g.label} <span className="muted">· {g.items.length}</span>
            </div>
          )}
          <div className="task-list">
            {g.items.map((task, i) => (
              <TaskRowView key={task.id} lang={lang} task={task} index={i} selected={selected === task.id} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
