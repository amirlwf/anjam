/**
 * v1.4.0 / US7 — the advisory engine. NOT a chatbot.
 *
 * Four analyses of the app's own data: day plan, timetable sanity, backlog
 * triage, weekly review. Each runs either through the user's own OpenRouter
 * key or through a deterministic local implementation, and the result always
 * says which of the two produced it.
 *
 * Privacy is a type-level property here, not a filter: `AiContext` has no
 * field for notes, email, ids or tokens, so a request body built from it
 * cannot leak them by accident. `buildPayload` is the only place a request
 * body is constructed, and the harness asserts what it produces.
 */

import type { Priority } from '../types'

export type AnalysisId = 'day' | 'timetable' | 'backlog' | 'weekly'
export type AiLang = 'fa' | 'en'

export const ANALYSES: AnalysisId[] = ['day', 'timetable', 'backlog', 'weekly']

/** Titles and scheduling shape only — deliberately no notes, no email, no ids. */
export interface ContextTask {
  title: string
  priority: Priority
  due: string | null
  done: boolean
}

export interface ContextDay {
  /** 0 = Saturday, matching the app's weekday numbering. */
  weekday: number
  periods: number
  /** Subject names as shown in the timetable, in period order. */
  subjects: string[]
}

export interface AiContext {
  lang: AiLang
  today: string
  tasks: ContextTask[]
  counts: { open: number; done: number; overdue: number }
  timetable: ContextDay[]
}

export interface AiResult {
  id: AnalysisId
  lines: string[]
  source: 'ai' | 'local'
  /** One honest line: which model spoke, or why the local path did. */
  note: string
}

export interface AiModel {
  id: string
  name: string
}

export const OPENROUTER_CHAT = 'https://openrouter.ai/api/v1/chat/completions'
export const OPENROUTER_MODELS = 'https://openrouter.ai/api/v1/models'
export const MODELS_CACHE_KEY = 'anjam.ai.models'
export const MODELS_TTL_MS = 24 * 60 * 60 * 1000
/** OpenRouter asks for a descriptive referrer; an empty one is throttled harder. */
export const APP_TITLE = 'Anjam'

const fa = (lang: AiLang, s: { fa: string; en: string }) => (lang === 'fa' ? s.fa : s.en)

const WEEKDAYS: Record<AiLang, string[]> = {
  fa: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'],
  en: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
}

const PRIORITY_ORDER: Record<string, number> = { p1: 1, p2: 2, p3: 3, p4: 4 }
const rank = (p: Priority): number => PRIORITY_ORDER[p] ?? 9

/* ------------------------------------------------------------------ *
 * Local, deterministic implementations.
 *
 * "Deterministic" is the contract (T063): the same data must produce the
 * same lines every time, so the harness can assert on them and so an offline
 * user never sees an answer change for no reason.
 * ------------------------------------------------------------------ */

/** Minutes to spend on a task, by priority — the time box of the day plan. */
export function timeBox(p: Priority): number {
  return ({ p1: 45, p2: 30, p3: 20, p4: 10 } as Record<string, number>)[p] ?? 15
}

const isOverdue = (t: ContextTask, today: string): boolean =>
  !t.done && !!t.due && t.due.slice(0, 10) < today

/** Open tasks in the order they should be worked on. */
export function orderedOpen(tasks: ContextTask[], today: string): ContextTask[] {
  return tasks
    .filter((t) => !t.done)
    .slice()
    .sort((a, b) => {
      const oa = isOverdue(a, today) ? 0 : 1
      const ob = isOverdue(b, today) ? 0 : 1
      if (oa !== ob) return oa - ob
      const pa = rank(a.priority)
      const pb = rank(b.priority)
      if (pa !== pb) return pa - pb
      const da = a.due ?? '9999-12-31'
      const db = b.due ?? '9999-12-31'
      if (da !== db) return da < db ? -1 : 1
      return a.title.localeCompare(b.title)
    })
}

export function localDay(ctx: AiContext): string[] {
  const open = orderedOpen(ctx.tasks, ctx.today)
  const lines: string[] = []
  lines.push(
    fa(ctx.lang, {
      fa: `${open.length} کار باز داری؛ اولویت‌ها به این ترتیب.`,
      en: `${open.length} open task${open.length === 1 ? '' : 's'} — in this order.`,
    })
  )
  const budget = 8
  open.slice(0, budget).forEach((t) => {
    const mins = timeBox(t.priority)
    const late = isOverdue(t, ctx.today)
      ? fa(ctx.lang, { fa: '، عقب‌افتاده', en: ', overdue' })
      : ''
    lines.push(`• ${t.title} — ${mins} ${fa(ctx.lang, { fa: 'دقیقه', en: 'min' })}${late}`)
  })
  const rest = open.length - Math.min(open.length, budget)
  if (rest > 0) {
    lines.push(
      fa(ctx.lang, {
        fa: `${rest} کار دیگر هم ماند؛ برای فردا جا بگذار.`,
        en: `${rest} more left — park them for tomorrow.`,
      })
    )
  }
  if (open.length === 0) {
    lines.push(
      fa(ctx.lang, {
        fa: 'امروز چیزی برای انجام نداری. همین الان تمام شد.',
        en: 'Nothing due today. Enjoy!',
      })
    )
  }
  return lines
}

export function localTimetable(ctx: AiContext): string[] {
  const lines: string[] = []
  const day = (w: number) => WEEKDAYS[ctx.lang][w] ?? String(w)
  const busy = ctx.timetable.filter((d) => d.periods > 10)
  const empty = ctx.timetable.filter((d) => d.weekday !== 6 && d.periods === 0)
  const thin = ctx.timetable.filter((d) => d.weekday !== 6 && d.periods > 0 && d.periods < 3)

  if (busy.length === 0 && empty.length === 0 && thin.length === 0) {
    lines.push(
      fa(ctx.lang, {
        fa: 'برنامه‌ات سالم است: روزهای پُر و خالی متعادل‌اند.',
        en: 'The timetable looks balanced — no day is overloaded or empty.',
      })
    )
  }
  busy.forEach((d) =>
    lines.push(
      fa(ctx.lang, {
        fa: `${day(d.weekday)} با ${d.periods} زنگ سنگین است؛ یک زنگ را جابه‌جا کن.`,
        en: `${day(d.weekday)} has ${d.periods} periods — move one out.`,
      })
    )
  )
  empty.forEach((d) =>
    lines.push(
      fa(ctx.lang, {
        fa: `${day(d.weekday)} خالی است.`,
        en: `${day(d.weekday)} is empty.`,
      })
    )
  )
  thin.forEach((d) =>
    lines.push(
      fa(ctx.lang, {
        fa: `${day(d.weekday)} فقط ${d.periods} زنگ دارد.`,
        en: `${day(d.weekday)} has only ${d.periods} periods.`,
      })
    )
  )

  // Two of the same subject back to back is revision, not two lessons.
  let backToBack = 0
  for (const d of ctx.timetable) {
    for (let i = 1; i < d.subjects.length; i++) {
      const a = d.subjects[i - 1]
      const b = d.subjects[i]
      if (a && b && a === b) backToBack++
    }
  }
  if (backToBack > 0) {
    lines.push(
      fa(ctx.lang, {
        fa: `${backToBack} زنگِ پشت‌سرهم یکی‌اند؛ بهتر است مرور شوند.`,
        en: `${backToBack} back-to-back pair${backToBack === 1 ? '' : 's'} of the same subject — treat as revision.`,
      })
    )
  }
  return lines
}

export function localBacklog(ctx: AiContext): string[] {
  const open = orderedOpen(ctx.tasks, ctx.today)
  const lines: string[] = []
  const doNow = open.filter(
    (t) => isOverdue(t, ctx.today) || rank(t.priority) <= 2 || t.due?.slice(0, 10) === ctx.today
  )
  const defer = open.filter((t) => !doNow.includes(t) && !!t.due)
  const drop = open.filter((t) => !doNow.includes(t) && !defer.includes(t))

  lines.push(
    fa(ctx.lang, {
      fa: `${doNow.length} کار امروز، ${defer.length} بعداً، ${drop.length} حذف‌شدنی.`,
      en: `${doNow.length} today, ${defer.length} later, ${drop.length} droppable.`,
    })
  )
  doNow.slice(0, 6).forEach((t) =>
    lines.push(
      `• ${t.title} — ` +
        fa(ctx.lang, {
          fa: isOverdue(t, ctx.today)
            ? 'عقب‌افتاده، همین امروز'
            : rank(t.priority) <= 2
              ? 'اولویت بالا'
              : 'سررسید امروز',
          en: isOverdue(t, ctx.today)
            ? 'overdue — today'
            : rank(t.priority) <= 2
              ? 'high priority'
              : 'due today',
        })
    )
  )
  drop.slice(0, 5).forEach((t) =>
    lines.push(
      `• ${t.title} — ` +
        fa(ctx.lang, {
          fa: 'اولویت پایین و بدون سرسید؛ حذفش کن یا به یک تاریخ وصل کن',
          en: 'low priority and undated — delete it or give it a date',
        })
    )
  )
  if (drop.length === 0 && doNow.length === 0 && defer.length > 0) {
    lines.push(
      fa(ctx.lang, {
        fa: 'هیچ‌کدام فوری نیستند؛ فقط تاریخ‌شان را مشخص کن.',
        en: 'Nothing is urgent — just give them dates.',
      })
    )
  }
  return lines
}

export function localWeekly(ctx: AiContext): string[] {
  const lines: string[] = []
  const well = ctx.counts.done
  const slipped = ctx.counts.overdue
  lines.push(
    fa(ctx.lang, {
      fa: `هفته‌ای که گذشت: ${well} کار تمام شد، ${slipped} جا ماند.`,
      en: `This week: ${well} done, ${slipped} slipped.`,
    })
  )
  lines.push(
    fa(ctx.lang, {
      fa:
        slipped > 0
          ? 'چیزی که خوب پیش رفت: عقب‌افتاده‌ها را بشناس و تکرارشان نکن.'
          : 'چیزی که خوب پیش رفت: هیچ کاری از دست نرفت.',
      en:
        slipped > 0
          ? 'What went well: no surprise — the overdue set is the pattern to break.'
          : 'What went well: nothing slipped.',
    })
  )
  lines.push(
    fa(ctx.lang, {
      fa:
        slipped > 0
          ? `یک تغییر برای هفته‌ی بعد: سراغ ${slipped} کار عقب‌افتاده برو و بقیه را به بعد موکول کن.`
          : 'یک تغییر برای هفته‌ی بعد: همان برنامه را نگه دار.',
      en:
        slipped > 0
          ? `One change next week: clear the ${slipped} overdue first and defer the rest.`
          : 'One change next week: keep the same rhythm.',
    })
  )
  const openDays = ctx.timetable.filter((d) => d.periods > 0).length
  lines.push(
    fa(ctx.lang, {
      fa: `${openDays} روز درس داری.`,
      en: `${openDays} study day${openDays === 1 ? '' : 's'} this week.`,
    })
  )
  return lines
}

const LOCAL: Record<AnalysisId, (ctx: AiContext) => string[]> = {
  day: localDay,
  timetable: localTimetable,
  backlog: localBacklog,
  weekly: localWeekly,
}

export function localAnalysis(id: AnalysisId, ctx: AiContext): AiResult {
  return { id, lines: LOCAL[id](ctx), source: 'local', note: localNote(ctx.lang) }
}

export function localNote(lang: AiLang): string {
  return fa(lang, {
    fa: 'محاسبه‌ی محلی — بدون کلید، بدون شبکه.',
    en: 'Computed locally — no key, no network.',
  })
}

/* ------------------------------------------------------------------ *
 * The request. Everything that leaves the device goes through here.
 * ------------------------------------------------------------------ */

export const SYSTEM_PROMPTS: Record<AnalysisId, Record<AiLang, string>> = {
  day: {
    fa: 'برنامه‌ی امروز کاربر را بنویس: چند خط کوتاه، مرتب‌شده بر اساس اولویت، با مدت زمان تقریبی هر کار. فقط همان داده‌های داده‌شده را ببین.',
    en: "Write the user's day plan: a few short lines, ordered by priority, with a rough time box per task. Use only the data given.",
  },
  timetable: {
    fa: 'برنامه‌ی درسی را بررسی کن و فقط مشکل‌ها را بگو: روزهای سنگین، زنگ‌های خالی، درس تکراریِ پشت‌سرهم.',
    en: 'Review the timetable and report only problems: overloaded days, empty days, the same subject back to back.',
  },
  backlog: {
    fa: 'کارهای باز را دسته‌بندی کن: امروز / بعداً / حذف. برای هر کار یک دلیل کوتاه.',
    en: 'Triage the open tasks into do-today / defer / drop, one short reason each.',
  },
  weekly: {
    fa: 'مرور هفتگی بنویس: چه خوب پیش رفت، چه جا ماند، و یک تغییر برای هفته‌ی بعد.',
    en: 'Write the weekly review: what went well, what slipped, one change for next week.',
  },
}

/**
 * The only request body constructor in the app.
 *
 * Note what is NOT here: no notes, no email, no user id, no Supabase token,
 * no key (the key rides in the Authorization header, never in the body).
 * T058 asserts exactly that on the serialised output.
 */
export function buildPayload(id: AnalysisId, ctx: AiContext, model: string): unknown {
  return {
    model,
    max_tokens: 600,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS[id][ctx.lang] },
      {
        role: 'user',
        content: JSON.stringify({
          lang: ctx.lang,
          today: ctx.today,
          tasks: ctx.tasks.map((t) => ({
            title: t.title,
            priority: t.priority,
            due: t.due,
            done: t.done,
          })),
          counts: ctx.counts,
          timetable: ctx.timetable,
        }),
      },
    ],
  }
}

/** Tolerant parse: a model that answers plain text is still an answer. */
export function parseReply(content: string): string[] {
  const raw = String(content ?? '').trim()
  if (!raw) return []
  try {
    const obj = JSON.parse(raw)
    // A bare array is a legal answer: `["line 1","line 2"]`.
    if (Array.isArray(obj)) return obj.map((x) => String(x)).filter(Boolean)
    const candidate = obj.lines ?? obj.analysis ?? obj.result
    if (Array.isArray(candidate)) return candidate.map((x) => String(x)).filter(Boolean)
    if (typeof candidate === 'string') return splitLines(candidate)
    if (obj && typeof obj === 'object') {
      const values = Object.values(obj).find((v) => Array.isArray(v))
      if (values) return (values as unknown[]).map((x) => String(x)).filter(Boolean)
    }
  } catch {
    /* not JSON — fall through to plain text */
  }
  return splitLines(raw)
}

function splitLines(s: string): string[] {
  return s
    .split(/\r?\n+/)
    .map((l) => l.replace(/^[\s•*\-\d.)]+/, '').trim())
    .filter(Boolean)
    .slice(0, 12)
}

export class AiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AiError'
    this.status = status
  }
}

/**
 * One call to OpenRouter. Throws `AiError` on any problem — the caller
 * turns that into the local result, because FR-19 means a failing network
 * feature is silent, never a dialog.
 */
export async function askOpenRouter(
  id: AnalysisId,
  ctx: AiContext,
  opts: { key: string; model: string }
): Promise<AiResult> {
  const { key, model } = opts
  if (!key) throw new AiError(0, 'no key')
  const res = await fetch(OPENROUTER_CHAT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://anjam.app',
      'X-Title': APP_TITLE,
    },
    body: JSON.stringify(buildPayload(id, ctx, model)),
  })
  if (!res.ok) throw new AiError(res.status, `openrouter ${res.status}`)
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
    model?: string
  }
  const content = data?.choices?.[0]?.message?.content ?? ''
  const lines = parseReply(content)
  if (lines.length === 0) throw new AiError(502, 'empty reply')
  return {
    id,
    lines,
    source: 'ai',
    note: fa(ctx.lang, {
      fa: `پاسخ از مدل ${data?.model || model}.`,
      en: `Answer from ${data?.model || model}.`,
    }),
  }
}

/** 429 / model-unavailable → try another free model exactly once. */
export function otherModel(current: string, models: AiModel[]): AiModel | null {
  const free = models.filter((m) => m.id !== current)
  if (free.length === 0) return null
  return free.find((m) => !m.id.includes(current.split('/')[0])) ?? free[0]
}

/* ------------------------------------------------------------------ *
 * The live free-model list (acceptance scenario 1): priced 0/0 only,
 * cached for 24 h so the settings screen never blocks on the network.
 * ------------------------------------------------------------------ */

interface ModelCache {
  at: number
  models: AiModel[]
}

function readModelCache(): ModelCache | null {
  try {
    const raw = localStorage.getItem(MODELS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ModelCache
    if (!parsed || !Array.isArray(parsed.models)) return null
    return parsed
  } catch {
    return null
  }
}

export function cachedModels(now = Date.now()): AiModel[] {
  const c = readModelCache()
  if (!c) return []
  return now - c.at < MODELS_TTL_MS ? c.models : []
}

/** Live list of models priced prompt=0 and completion=0, cached 24 h. */
export async function freeModels(force = false): Promise<AiModel[]> {
  if (!force) {
    const hit = cachedModels()
    if (hit.length > 0) return hit
  }
  const res = await fetch(OPENROUTER_MODELS)
  if (!res.ok) {
    const stale = readModelCache()
    return stale?.models ?? []
  }
  const data = (await res.json()) as {
    data?: {
      id?: string
      name?: string
      pricing?: { prompt?: string; completion?: string }
    }[]
  }
  const models: AiModel[] = (data.data ?? [])
    .filter(
      (m) =>
        !!m.id &&
        m.pricing?.prompt === '0' &&
        m.pricing?.completion === '0'
    )
    .map((m) => ({ id: m.id as string, name: m.name || (m.id as string) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (models.length > 0) {
    try {
      localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ at: Date.now(), models }))
    } catch {
      /* a full or unavailable store must not break the picker */
    }
  }
  return models
}
