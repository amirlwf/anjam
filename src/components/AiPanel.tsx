/**
 * v1.4.0 / US7 — the AI advisory card.
 *
 * Acceptance shape (spec §US7): a collapsible card, never a chat view, with
 * four analyses of the app's own data. FR-19 is the rule that shapes this
 * component — every failure resolves to the local answer, silently, so a
 * missing key, a dead network or a 429 all end in the same rendered lines.
 *
 * Privacy note: `buildContext` reads only titles, dates, priorities and the
 * timetable shape. Notes and email never enter the payload, and the key
 * stays in the header.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '../types'
import { t } from '../lib/i18n'
import { prefs } from '../lib/config'
import { useStore } from '../lib/hooks'
import { liveSubjects, liveSlots, liveTasks, rootTasks, dueBucket } from '../lib/store'
import {
  ANALYSES,
  type AiContext,
  type AiLang,
  type AiModel,
  type AiResult,
  type AnalysisId,
  askOpenRouter,
  cachedModels,
  freeModels,
  localAnalysis,
} from '../lib/ai'

const TABS: { id: AnalysisId; key: string }[] = [
  { id: 'day', key: 'aiPlan' },
  { id: 'timetable', key: 'aiTimetable' },
  { id: 'backlog', key: 'aiBacklog' },
  { id: 'weekly', key: 'aiWeek' },
]

function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Everything the engine is allowed to see.
 *
 * Deliberately projects the store down: `rootTasks()` would drag `notes`
 * along, so each task is copied field by field. `buildContextSource` is
 * named as the counterpart of `buildPayload` — it is the *source* side of
 * the same privacy boundary.
 */
export function buildContextSource(lang: Lang): AiContext {
  const today = localDate()
  const all = liveTasks()
  const subjects = new Map(liveSubjects().map((s) => [s.id, s.name]))
  const slots = liveSlots()

  const dayCount = new Map<number, { periods: number; subjects: string[] }>()
  for (const s of slots) {
    const cur = dayCount.get(s.weekday) ?? { periods: 0, subjects: [] }
    cur.periods += 1
    cur.subjects.push(s.subject_id ? subjects.get(s.subject_id) ?? '' : '')
    dayCount.set(s.weekday, cur)
  }

  const tasks = all.slice(0, 300).map((x) => ({
    title: x.title,
    priority: x.priority,
    due: x.due_at ? localDate(new Date(x.due_at)) : null,
    done: x.status === 'done',
  }))

  const overdue = all.filter((x) => x.status !== 'done' && dueBucket(x) === 'overdue').length

  return {
    lang: (lang === 'fa' ? 'fa' : 'en') as AiLang,
    today,
    tasks,
    counts: {
      open: rootTasks().filter((x) => x.status !== 'done').length,
      done: rootTasks().filter((x) => x.status === 'done').length,
      overdue,
    },
    timetable: [...dayCount.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([weekday, v]) => ({ weekday, periods: v.periods, subjects: v.subjects })),
  }
}

export default function AiPanel({ lang }: { lang: Lang }) {
  const tt = (k: string) => t(lang, k)
  const st = useStore()

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<AnalysisId>('day')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AiResult | null>(null)
  const [ran, setRan] = useState(false)
  const runToken = useRef(0)

  const hasKey = prefs.getAiKey().length > 0

  /** FR-19: never throws to the UI. Local is the answer of last resort. */
  const run = useCallback(
    async (id: AnalysisId, force = false) => {
      const token = ++runToken.current
      const ctx = buildContextSource(lang)
      const fallback = localAnalysis(id, ctx)
      setResult(fallback)
      setRan(true)
      setBusy(true)
      try {
        const key = prefs.getAiKey()
        const model = prefs.getAiModel()
        if (!key || !model) throw new Error('no key')
        const r = await askOpenRouter(id, ctx, { key, model })
        if (token === runToken.current) setResult(r)
      } catch {
        if (token === runToken.current) {
          // A 429 / unavailable model gets exactly one other suggestion
          // (T057); anything else simply stays on the local result.
          if (force) {
            try {
              const models = await freeModels()
              const alt = models.find((m) => m.id !== prefs.getAiModel())
              if (alt) prefs.setAiModel(alt.id)
            } catch {
              /* offline: the local result already stands */
            }
          }
          setResult(fallback)
        }
      } finally {
        if (token === runToken.current) setBusy(false)
      }
    },
    [lang]
  )

  // Selecting a tab re-runs that analysis — a suggestion should never show
  // stale data from a previous visit.
  useEffect(() => {
    if (open && ran) void run(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    if (open && !ran) void run(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Warm the model list once so the settings picker is not empty later.
  useEffect(() => {
    if (cachedModels().length > 0) return
    void freeModels().catch(() => undefined)
  }, [])

  const active = result && result.id === tab ? result : localAnalysis(tab, buildContextSource(lang))

  return (
    <section className="card ai-panel" data-testid="ai-panel" data-open={open}>
      <button
        type="button"
        className="ai-head"
        data-testid="ai-header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ai-head-title">{tt('aiTitle')}</span>
        <span className="ai-head-hint muted small">{hasKey ? tt('aiRun') : tt('aiNoKey')}</span>
        <span className={`ai-chev ${open ? 'open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="ai-body" data-testid="ai-body">
          <div className="ai-tabs" role="tablist" data-testid="ai-tabs">
            {TABS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                className={`ai-tab ${tab === x.id ? 'active' : ''}`}
                data-testid={`ai-tab-${x.id}`}
                onClick={() => setTab(x.id)}
              >
                {tt(x.key)}
              </button>
            ))}
          </div>

          <div className="ai-result" data-testid="ai-result" data-source={active.source}>
            <p className="ai-lines" data-testid="ai-lines">
              {active.lines.map((l, i) => (
                <span key={i} className="ai-line">
                  {l}
                </span>
              ))}
            </p>
            <p className="ai-note muted small" data-testid="ai-source">
              <b>{active.source === 'ai' ? tt('aiFromAi') : tt('aiFromLocal')}</b> · {active.note}
            </p>
          </div>

          <div className="ai-actions">
            <button
              type="button"
              className="btn ghost small"
              data-testid="ai-run"
              disabled={busy}
              onClick={() => void run(tab, true)}
            >
              {busy ? tt('aiThinking') : tt('aiAgain')}
            </button>
            <span className="muted small">{tt('aiPrivacy')}</span>
          </div>
          <p className="muted small ai-hint">{tt('aiHint')}</p>
        </div>
      )}
    </section>
  )
}
