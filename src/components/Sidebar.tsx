import { useSyncExternalStore, useState } from 'react'
import type { Lang, View } from '../types'
import { t } from '../lib/i18n'
import { store, addList, addLabel, dueBucket, dayScore } from '../lib/store'
import { getSections, subscribeSections } from '../lib/sections'
import { localDate } from '../lib/util'
import { Book, CalendarCheck, CalendarDay, CalendarRange, CheckCircle, Dumbbell, Folder, Gift, Inbox, Layers, Flag, Plus, Tag, X } from './Icons'
import logo from '../assets/logo.png'

function useStore() {
  return useSyncExternalStore(store.subscribe, store.getState)
}

export default function Sidebar({
  lang,
  view,
  setView,
  onClose,
}: {
  lang: Lang
  view: View
  setView: (v: View) => void
  onClose: () => void
}) {
  const tt = (k: string) => t(lang, k)
  const st = useStore()
  const sections = useSyncExternalStore(subscribeSections, getSections)
  const [addingList, setAddingList] = useState(false)
  const [addingLabel, setAddingLabel] = useState(false)
  const [newName, setNewName] = useState('')

  const live = st.tasks.filter((x) => !x.deleted)
  const todo = live.filter((x) => x.status === 'todo')
  const counts = {
    inbox: todo.filter((x) => !x.list_id).length,
    today: todo.filter((x) => {
      const b = dueBucket(x)
      return b === 'today' || b === 'overdue'
    }).length,
    upcoming: todo.filter((x) => {
      if (!x.due_at) return false
      const limit = new Date()
      limit.setDate(limit.getDate() + 7)
      return new Date(x.due_at).getTime() <= limit.getTime() && dueBucket(x) !== 'overdue'
    }).length,
    completed: live.filter((x) => x.status === 'done').length,
    priority: todo.filter((x) => x.priority > 0).length,
    routine: (() => {
      const s = dayScore(localDate())
      return Math.max(0, s.total - s.done)
    })(),
  }

  const lists = st.lists.filter((x) => !x.deleted).sort((a, b) => a.sort_order - b.sort_order)
  const labels = st.labels.filter((x) => !x.deleted)

  const isActive = (v: View) => JSON.stringify(v) === JSON.stringify(view)

  async function submitNew() {
    const name = newName.trim()
    setNewName('')
    setAddingList(false)
    setAddingLabel(false)
    if (!name) return
    if (addingList) {
      const list = await addList(name)
      setView({ kind: 'list', id: list.id })
    } else if (addingLabel) {
      await addLabel(name)
    }
  }

  const Item = ({
    v,
    icon,
    label,
    count,
  }: {
    v: View
    icon: React.ReactNode
    label: string
    count?: number
  }) => (
    <button className={`nav-item ${isActive(v) ? 'active' : ''}`} onClick={() => { setView(v); onClose() }}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand mini">
          <img className="brand-mark is-logo" src={logo} alt="" />
          <span>{tt('appName')}</span>
        </div>
        <button className="icon-btn only-mobile" onClick={onClose}>
          <X />
        </button>
      </div>

      <nav className="nav-group">
        <Item v={{ kind: 'inbox' }} icon={<Inbox />} label={tt('inbox')} count={counts.inbox} />
        <Item v={{ kind: 'today' }} icon={<CalendarDay />} label={tt('today')} count={counts.today} />
        <Item v={{ kind: 'upcoming' }} icon={<CalendarRange />} label={tt('upcoming')} count={counts.upcoming} />
        <Item v={{ kind: 'routine' }} icon={<CalendarCheck />} label={tt('routine')} count={counts.routine} />
        <Item v={{ kind: 'dates' }} icon={<Gift />} label={tt('datesNav')} />
        {sections.study && <Item v={{ kind: 'study' }} icon={<Book />} label={tt('studyNav')} />}
        {sections.workout && <Item v={{ kind: 'workout' }} icon={<Dumbbell />} label={tt('workoutNav')} />}
        <Item v={{ kind: 'priority' }} icon={<Flag />} label={tt('priorities')} count={counts.priority} />
        <Item v={{ kind: 'all' }} icon={<Layers />} label={tt('all')} />
        <Item v={{ kind: 'completed' }} icon={<CheckCircle />} label={tt('completed')} count={counts.completed} />
      </nav>

      <div className="nav-section">
        <div className="nav-section-title">
          <span>{tt('projects')}</span>
          <button className="icon-btn tiny" onClick={() => { setAddingList(true); setAddingLabel(false) }} title={tt('newList')}>
            <Plus width={14} height={14} />
          </button>
        </div>
        {lists.map((l) => (
          <button
            key={l.id}
            className={`nav-item ${isActive({ kind: 'list', id: l.id }) ? 'active' : ''}`}
            onClick={() => { setView({ kind: 'list', id: l.id }); onClose() }}
          >
            <span className="dot" style={{ background: l.color }} />
            <span className="nav-label">{l.name}</span>
            <span className="count">
              {todo.filter((x) => x.list_id === l.id).length || ''}
            </span>
          </button>
        ))}
        {addingList && (
          <div className="inline-add">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNew()
                if (e.key === 'Escape') { setAddingList(false); setNewName('') }
              }}
              placeholder={tt('newList')}
            />
            <button className="icon-btn tiny" onClick={() => void submitNew()}>
              <Plus width={14} height={14} />
            </button>
          </div>
        )}
        {lists.length === 0 && !addingList && (
          <button className="nav-item muted-item" onClick={() => setAddingList(true)}>
            <Folder />
            <span className="nav-label">{tt('addFirstList')}</span>
          </button>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-section-title">
          <span>{tt('labels')}</span>
          <button className="icon-btn tiny" onClick={() => { setAddingLabel(true); setAddingList(false) }} title={tt('newLabel')}>
            <Plus width={14} height={14} />
          </button>
        </div>
        <div className="label-chips">
          {labels.map((l) => (
            <button
              key={l.id}
              className={`chip-label ${isActive({ kind: 'label', name: l.name }) ? 'active' : ''}`}
              style={{ '--chip': l.color } as React.CSSProperties}
              onClick={() => { setView({ kind: 'label', name: l.name }); onClose() }}
            >
              <Tag width={12} height={12} />
              {l.name}
            </button>
          ))}
        </div>
        {addingLabel && (
          <div className="inline-add">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNew()
                if (e.key === 'Escape') { setAddingLabel(false); setNewName('') }
              }}
              placeholder={tt('newLabel')}
            />
            <button className="icon-btn tiny" onClick={() => void submitNew()}>
              <Plus width={14} height={14} />
            </button>
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <span className="muted small">{tt('tagline')}</span>
      </div>
    </aside>
  )
}
