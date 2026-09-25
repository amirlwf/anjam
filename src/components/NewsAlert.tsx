import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '../types'
import { t } from '../lib/i18n'
import { prefs } from '../lib/config'
import { isNightWindow } from '../lib/advisory'
import { cachedWeather, readSavedLoc } from '../lib/weather'
import { fetchCandidates, pickAlert, type NewsItem } from '../lib/news'
import { notify } from '../lib/alarms'

/**
 * The 21:00 school-closure alert (US6, FR-17/FR-19).
 *
 * Three rules shape every branch below:
 *
 *  1. **Only at night, only once.** The check runs inside the same 21:00-08:00
 *     window as the weather advisory, and at most once per night.
 *  2. **A failed check is not news.** No candidates, no signal, no region, no
 *     network — all of them mean the component renders nothing. There is no
 *     error toast path in this file on purpose: a 21:00 popup that says "we
 *     could not reach the news" is worse than staying quiet.
 *  3. **The user's region is the weather city.** D2 — the city they already
 *     picked for the forecast. A settings override wins if they set one.
 */

interface StoredAlert extends NewsItem {
  at: number
  acked: boolean
}

const HOURLY = 60 * 60 * 1000
const RESHOW_MS = 12 * HOURLY
const MAX_ATTEMPTS_PER_NIGHT = 3

function readStored(): StoredAlert | null {
  try {
    const raw = prefs.getNewsLastIds()
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredAlert
    return parsed && typeof parsed.title === 'string' && parsed.title ? parsed : null
  } catch {
    return null
  }
}

function writeStored(a: StoredAlert | null): void {
  prefs.setNewsLastIds(a ? JSON.stringify(a) : '')
}

export default function NewsAlert({ lang }: { lang: Lang }) {
  const tt = (k: string) => t(lang, k)
  const fa = lang === 'fa'
  const [alert, setAlert] = useState<StoredAlert | null>(null)
  const attemptsRef = useRef(0)
  const nightRef = useRef('')
  const busyRef = useRef(false)
  // `run` lives in an interval that must not re-subscribe on every language
  // change, so it reads the current language through a ref instead.
  const langRef = useRef(lang)
  langRef.current = lang

  /* An unacknowledged alert from earlier tonight comes back on next open,
   * but never older than 12 h — yesterday's closure is not this morning's. */
  useEffect(() => {
    const stored = readStored()
    if (!stored) return
    const age = Date.now() - stored.at
    if (!stored.acked && age >= 0 && age <= RESHOW_MS && isNightWindow(new Date())) {
      setAlert(stored)
    }
  }, [])

  /** The region is the saved weather city unless overridden in settings. */
  const resolveRegion = useCallback((): string => {
    const override = prefs.getNewsRegion()
    if (override) return override
    return readSavedLoc()?.place || cachedWeather()?.place || ''
  }, [])

  const run = useCallback(
    async (atMs?: number, injected?: NewsItem[]) => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        const at = atMs != null ? new Date(atMs) : new Date()
        if (!isNightWindow(at)) return

        const day = at.toDateString()
        if (nightRef.current !== day) {
          nightRef.current = day
          attemptsRef.current = 0
        }
        if (attemptsRef.current >= MAX_ATTEMPTS_PER_NIGHT) return

        const last = prefs.getNewsLastCheck()
        if (last && Math.abs(at.getTime() - last) < HOURLY) return

        const region = resolveRegion()
        if (!region) return

        attemptsRef.current += 1
        const items = injected ?? (await fetchCandidates(region))
        // Record the attempt only when we actually got an answer, so a dead
        // network does not burn the night's single slot.
        if (!injected) prefs.setNewsLastCheck(at.getTime())
        if (items.length === 0) return

        const hit = pickAlert(items, region, at.getTime())
        if (!hit) return

        const stored = readStored()
        if (stored && stored.title === hit.title && stored.acked) return

        const next: StoredAlert = { ...hit, at: at.getTime(), acked: false }
        writeStored(next)
        setAlert(next)
        notify(t(langRef.current, 'newsTitle'), hit.title)
      } finally {
        busyRef.current = false
      }
    },
    [resolveRegion, langRef],
  )

  useEffect(() => {
    const id = window.setInterval(() => void run(), 60_000)
    void run()
    return () => window.clearInterval(id)
  }, [run])

  const dismiss = useCallback(() => {
    const stored = readStored()
    if (stored && alert && stored.title === alert.title) {
      writeStored({ ...stored, acked: true })
    }
    setAlert(null)
  }, [alert])

  useEffect(() => {
    const w = window as unknown as {
      __anjamNews?: {
        run: (atMs?: number, items?: NewsItem[]) => Promise<void>
        dismiss: () => void
        hide: () => void
        state: () => { shown: boolean; title: string; region: string }
      }
    }
    w.__anjamNews = {
      run: (atMs?: number, items?: NewsItem[]) => run(atMs, items),
      dismiss,
      hide: () => setAlert(null),
      state: () => ({ shown: !!alert, title: alert?.title ?? '', region: resolveRegion() }),
    }
    return () => {
      delete w.__anjamNews
    }
  }, [run, dismiss, resolveRegion, alert])

  if (!alert) return null

  return (
    <div className="advisory" data-testid="news-alert" data-sev="3" role="alert">
      <div className="advisory-top">
        <span className="advisory-badge">{tt('newsTitle')}</span>
        <button
          className="icon-btn tiny"
          data-testid="news-ack"
          aria-label={tt('newsAck')}
          onClick={dismiss}
        >
          ✕
        </button>
      </div>
      <p className="advisory-text" data-testid="news-alert-text">
        {alert.title}
      </p>
      <div className="advisory-actions">
        {alert.link ? (
          <a className="btn ghost small" data-testid="news-link" href={alert.link} target="_blank" rel="noreferrer noopener">
            {tt('newsOpen')}
          </a>
        ) : null}
        <span className="advisory-src" data-testid="news-source">
          {alert.source || (fa ? 'خبرگزاری' : 'source')}
        </span>
        <button className="btn primary small" data-testid="news-done" onClick={dismiss}>
          {tt('newsAck')}
        </button>
      </div>
    </div>
  )
}
