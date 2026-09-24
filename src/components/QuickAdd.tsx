import { useMemo, useState } from 'react'
import type { Lang } from '../types'
import { t, fmtDate } from '../lib/i18n'
import { parseQuickAdd } from '../lib/nlp'
import { store, addTask, addList, addLabel } from '../lib/store'
import { Plus, Flag, CalendarDay, Repeat, Folder, Tag } from './Icons'

export default function QuickAdd({
  lang,
  defaultListId,
}: {
  lang: Lang
  defaultListId: string | null
}) {
  const tt = (k: string) => t(lang, k)
  const [text, setText] = useState('')

  const preview = useMemo(() => {
    if (!text.trim()) return null
    const st = store.getState()
    return parseQuickAdd(text, { lists: st.lists.filter((l) => !l.deleted) })
  }, [text])

  async function submit() {
    const raw = text.trim()
    if (!raw) return
    const st = store.getState()
    const parsed = parseQuickAdd(raw, { lists: st.lists.filter((l) => !l.deleted) })

    let listId: string | null = defaultListId
    if (parsed.listName) {
      const found = st.lists.find(
        (l) => !l.deleted && l.name.toLowerCase() === parsed.listName!.toLowerCase()
      )
      listId = found ? found.id : (await addList(parsed.listName)).id
    }

    for (const ln of parsed.labels) {
      const exists = st.labels.some((l) => !l.deleted && l.name.toLowerCase() === ln.toLowerCase())
      if (!exists) await addLabel(ln)
    }

    let allDay = true
    if (parsed.dueAt) {
      const d = new Date(parsed.dueAt)
      allDay = d.getHours() === 0 && d.getMinutes() === 0
    }

    await addTask({
      title: parsed.title,
      priority: parsed.priority,
      due_at: parsed.dueAt,
      all_day: allDay,
      recurrence: parsed.recurrence,
      labels: parsed.labels,
      list_id: listId,
    })
    setText('')
  }

  return (
    <div className="quickadd-wrap">
      <div className="quickadd">
        <button
          className="btn primary small"
          onClick={() => void submit()}
          disabled={!text.trim()}
        >
          <Plus width={15} height={15} />
          <span className="only-wide">{tt('addTask')}</span>
        </button>
        <input
          id="quickadd-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder={tt('quickAddPlaceholder')}
        />
      </div>
      {preview && (
        <div className="parse-preview">
          {preview.dueAt && (
            <span className="chip due">
              <CalendarDay width={12} height={12} />
              {fmtDate(lang, preview.dueAt)}
            </span>
          )}
          {preview.priority > 0 && (
            <span className={`chip pri p${preview.priority}`}>
              <Flag width={12} height={12} />
              P{preview.priority}
            </span>
          )}
          {preview.listName && (
            <span className="chip">
              <Folder width={12} height={12} />
              {preview.listName}
            </span>
          )}
          {preview.recurrence !== 'none' && (
            <span className="chip">
              <Repeat width={12} height={12} />
              {t(lang, 'repeat' + preview.recurrence.charAt(0).toUpperCase() + preview.recurrence.slice(1))}
            </span>
          )}
          {preview.labels.map((l) => (
            <span key={l} className="chip">
              <Tag width={12} height={12} />
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
