import type { ParsedQuickAdd, Priority, Recurrence, ListRow } from '../types'
import { startOfDay } from './util'

const EN_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const FA_DAYS: Record<string, number> = {
  'يکشنبه': 0, 'یکشنبه': 0, 'یکشنبه‌': 0,
  'دوشنبه': 1,
  'سه‌شنبه': 2, 'سه شنبه': 2, 'سشنبه': 2,
  'چهارشنبه': 3,
  'پنجشنبه': 4,
  'جمعه': 5,
  'شنبه': 6,
}

function nextWeekday(target: number, from: Date): Date {
  const d = startOfDay(from)
  let delta = (target - d.getDay() + 7) % 7
  if (delta === 0) delta = 7
  d.setDate(d.getDate() + delta)
  return d
}

function parseEnDay(word: string, now: Date): Date | null {
  const idx = EN_DAYS.indexOf(word)
  if (idx < 0) return null
  return nextWeekday(idx, now)
}

function parseFaDay(word: string, now: Date): Date | null {
  const idx = FA_DAYS[word]
  if (idx === undefined) return null
  return nextWeekday(idx, now)
}

export function parseQuickAdd(
  raw: string,
  opts: { lists: ListRow[]; now?: Date }
): ParsedQuickAdd {
  const now = opts.now ?? new Date()
  let text = ' ' + raw.trim() + ' '
  const out: ParsedQuickAdd = {
    title: raw.trim(),
    priority: 0,
    listName: null,
    labels: [],
    dueAt: null,
    recurrence: 'none',
  }

  const consume = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re)
    if (m) {
      fn(m)
      text = text.replace(re, ' ')
    }
  }

  // priority: !p1 !p2 !0 !4
  consume(/(?:^|\s)!(p[0-4]|[0-4])\b/i, (m) => {
    const n = parseInt(m[1].replace('p', ''), 10)
    out.priority = (n >= 0 && n <= 4 ? n : 0) as Priority
  })

  // project: #name
  consume(/(?:^|\s)#([^\s#]+)/, (m) => {
    const name = m[1].toLowerCase()
    const found = opts.lists.find((l) => l.name.toLowerCase() === name || l.name.toLowerCase().startsWith(name))
    out.listName = found ? found.name : m[1]
  })

  // labels: @name (multiple)
  {
    const labelRe = /(?:^|\s)@([^\s@]+)/g
    let lm: RegExpMatchArray | null
    while ((lm = labelRe.exec(text))) out.labels.push(lm[1])
    text = text.replace(labelRe, ' ')
  }

  // recurrence
  consume(
    /(?:^|\s)(daily|every\s*day|weekly|every\s*week|monthly|every\s*month|yearly|every\s*year|weekdays|روزانه|هر\s*روز|هفتگی|هر\s*هفته|ماهانه|هر\s*ماه|سالانه|هر\s*سال|روزهای\s*کاری)\b/i,
    (m) => {
      const w = m[1].toLowerCase()
      if (/daily|روزانه|هر روز/.test(w)) out.recurrence = 'daily'
      else if (/weekly|هفتگی|هر هفته/.test(w)) out.recurrence = 'weekly'
      else if (/monthly|ماهانه|هر ماه/.test(w)) out.recurrence = 'monthly'
      else if (/yearly|سالانه|هر سال/.test(w)) out.recurrence = 'yearly'
      else out.recurrence = 'weekdays'
    }
  )

  let dueDate: Date | null = null
  let timeSet = false

  // time: 17:30 / 5:30pm / 5pm / ساعت 17
  consume(/(?:^|\s)(?:at\s+|ساعت\s+)?(\d{1,2}):(\d{2})\s*(pm|am)?\b/i, (m) => {
    let h = parseInt(m[1], 10)
    const mi = parseInt(m[2], 10)
    const ap = (m[3] || '').toLowerCase()
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    dueDate = dueDate ?? startOfDay(now)
    dueDate.setHours(h, mi, 0, 0)
    timeSet = true
  })
  if (!timeSet) {
    consume(/(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(pm|am)\b/i, (m) => {
      let h = parseInt(m[1], 10)
      const mi = m[2] ? parseInt(m[2], 10) : 0
      const ap = m[3].toLowerCase()
      if (ap === 'pm' && h < 12) h += 12
      if (ap === 'am' && h === 12) h = 0
      dueDate = dueDate ?? startOfDay(now)
      dueDate.setHours(h, mi, 0, 0)
      timeSet = true
    })
  }

  // english relative days
  consume(/(?:^|\s)(today|tod|tomorrow|tmr|tonight)\b/i, (m) => {
    const w = m[1].toLowerCase()
    dueDate = startOfDay(now)
    if (w === 'tomorrow' || w === 'tmr') dueDate.setDate(dueDate.getDate() + 1)
    if (w === 'tonight') {
      dueDate.setHours(21, 0, 0, 0)
      timeSet = true
    }
  })
  // english weekday names
  {
    const dayRe = new RegExp(`(?:^|\\s)(${EN_DAYS.join('|')})\\b`, 'i')
    consume(dayRe, (m) => {
      const d = parseEnDay(m[1].toLowerCase(), now)
      if (d) dueDate = d
    })
  }
  // persian relative + weekdays
  consume(/(?:^|\s)(امروز|فردا|پس\s*فردا)\b/, (m) => {
    const w = m[1]
    dueDate = startOfDay(now)
    if (w === 'فردا') dueDate.setDate(dueDate.getDate() + 1)
    if (w.replace(/\s/g, '') === 'پسفردا') dueDate.setDate(dueDate.getDate() + 2)
  })
  {
    const faRe = new RegExp(`(?:^|\\s)(${Object.keys(FA_DAYS).join('|')})`, 'u')
    consume(faRe, (m) => {
      const d = parseFaDay(m[1], now)
      if (d) dueDate = d
    })
  }
  // iso date 2026-09-24
  consume(/(?:^|\s)(\d{4}-\d{2}-\d{2})\b/, (m) => {
    const parts = m[1].split('-').map((x) => parseInt(x, 10))
    const d = new Date(parts[0], parts[1] - 1, parts[2])
    if (!Number.isNaN(d.getTime())) dueDate = d
  })
  // next week
  consume(/(?:^|\s)(next\s*week|هفته\s*بعد)\b/i, () => {
    dueDate = startOfDay(now)
    dueDate.setDate(dueDate.getDate() + 7)
  })

  const finalDue = dueDate as Date | null
  if (finalDue && !timeSet) {
    finalDue.setHours(0, 0, 0, 0)
  }

  out.title = text.replace(/\s+/g, ' ').trim() || raw.trim()
  out.dueAt = finalDue ? finalDue.toISOString() : null
  return out
}

export function nextOccurrence(dueAt: string | null, recurrence: Recurrence): string | null {
  if (recurrence === 'none') return dueAt
  const base = dueAt ? new Date(dueAt) : new Date()
  const d = new Date(base)
  switch (recurrence) {
    case 'daily':
      d.setDate(d.getDate() + 1)
      break
    case 'weekdays':
      do {
        d.setDate(d.getDate() + 1)
      } while (d.getDay() === 0 || d.getDay() === 6)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1)
      break
  }
  return d.toISOString()
}
