import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '../types'
import { t } from '../lib/i18n'
import { prefs } from '../lib/config'
import { cachedWeather, fetchWeather, type WeatherNow } from '../lib/weather'
import { notify } from '../lib/alarms'
import {
  evaluate, isNightWindow, shouldShow, msUntilNextWindow,
  EVAL_INTERVAL_MS, type Advisory as Adv
} from '../lib/advisory'

/**
 * v1.4.0 — the 21:00 → 08:00 night weather advisory (US2).
 *
 * Behaviour the user asked for, in one sentence: between 21:00 and 08:00,
 * if the weather is worth knowing about, say so once — otherwise stay quiet.
 *
 * This component is a dumb renderer. All decisions live in
 * `src/lib/advisory.ts` (pure, unit-tested); all persistence lives in
 * `config.ts`; all notification goes through the single `notify()` in
 * `alarms.ts`. What is left here is scheduling and rendering.
 *
 * FR-19 is enforced by construction: every network and parse failure returns
 * `null` and renders nothing. There is no error state to show.
 */

const MAX_TIMER_MS = 2_147_000_000 // 32-bit setTimeout ceiling, chunked below

interface Props {
  lang: Lang
  /** test hook: lets the harness freeze the clock and the forecast */
  _test?: { now?: () => Date; weather?: () => WeatherNow | null; skipNotify?: boolean }
}

interface State {
  adv: Adv | null
  /** night low/high shown as the secondary line, when we have them */
  low: number | null
  high: number | null
  place: string
}

export default function Advisory({ lang, _test }: Props) {
  const tt = (k: string) => t(lang, k)
  const [state, setState] = useState<State | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const timerRef = useRef<number | null>(null)
  // the engine is a singleton: two Advisory mounts must not double-notify
  const busyRef = useRef(false)

  const now = useCallback(() => (_test?.now ? _test.now() : new Date()), [_test])

  const run = useCallback(async (atMs?: number) => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      // `atMs` exists only so the harness can evaluate a night window that is
      // not the wall clock; production always passes undefined.
      const at = atMs != null ? new Date(atMs) : now()

      // FR-04: outside the window the engine does not speak
      if (!isNightWindow(at)) {
        prefs.setAdvisoryLastRun(Date.now())
        return
      }

      let w = _test?.weather ? _test.weather() : cachedWeather()
      if (!w) {
        // never block the UI on the network, never surface the failure
        w = await fetchWeather(lang, true).catch(() => null)
      }
      if (!w || !w.night) return

      const n = w.night
      const adv = evaluate(at, {
        code: n.nightCode,
        isDay: n.isDay,
        tempNow: w.temp,
        tempMin: n.tempMin,
        tempMax: n.tempMax,
        precipProb: n.precipProb,
        precipMm: n.precipMm,
        windMax: n.windMax,
        humidity: n.humidity,
        uvIndex: n.uvIndex
      }, lang)

      if (!adv) {
        // a calm night: remember that we looked, so we do not re-run hourly
        prefs.setAdvisoryLastRun(Date.now())
        return
      }

      const last = prefs.getAdvisoryLastRun()
      const lastKey = prefs.getAdvisoryLastKey()
      if (!shouldShow(at, adv, last, lastKey)) return

      prefs.setAdvisoryLastRun(Date.now())
      prefs.setAdvisoryLastKey(adv.key)
      setDismissed(false)
      setState({ adv, low: n.tempMin, high: n.tempMax, place: w.place })

      if (!_test?.skipNotify) notify(tt('advTitle'), tt(adv.key))
    } catch {
      // FR-19: silence on any failure
    } finally {
      busyRef.current = false
    }
  }, [lang, _test, now])

  /** Arm the next evaluation, chunked so no setTimeout exceeds the 32-bit cap. */
  const schedule = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const wait = Math.max(1000, Math.min(MAX_TIMER_MS, msUntilNextWindow(now())))
    timerRef.current = window.setTimeout(() => {
      void run()
      schedule()
    }, wait)
  }, [now, run])

  // Debug hook for scripts/cdp-ux-check.mjs. Deliberately narrow: it only
  // lets a test observe state and force a re-run, never forge a verdict.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__anjamAdvisory = {
      run: (atMs?: number) => run(atMs),
      dismiss: () => setDismissed(true),
      show: (key: string, low: number, high: number) => {
        setDismissed(false)
        setState({ adv: { key: key as Adv['key'], severity: 3 }, low, high, place: '' })
      },
      hide: () => setState(null),
      state: () => ({
        visible: !!state && !dismissed,
        key: state?.adv?.key ?? null,
        dismissed
      })
    }
    return () => { delete w.__anjamAdvisory }
  }, [run, state, dismissed])

  // on mount, on wake, and on a slow tick inside the window
  useEffect(() => {
    void run()
    schedule()
    const onWake = () => {
      void run()
      schedule()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    // a plain interval is the "wake me hourly" backstop; the timer above is
    // what actually schedules, so this only matters if the tab is throttled
    const tick = window.setInterval(() => {
      if (Date.now() - (prefs.getAdvisoryLastRun() ?? 0) > EVAL_INTERVAL_MS) onWake()
    }, 15 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
      window.clearInterval(tick)
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    }
  }, [run, schedule])

  // changing the language re-renders the text without re-running the engine
  if (!state || !state.adv || dismissed) return null

  const sev = state.adv.severity
  return (
    <div className="advisory" role="status" data-testid="advisory" data-sev={sev}>
      <div className="advisory-body">
        <div className="advisory-head">
          <span className="advisory-dot" aria-hidden="true" />
          <strong>{tt('advTitle')}</strong>
          {state.place ? <span className="advisory-place">{state.place}</span> : null}
        </div>
        <p className="advisory-text" data-testid="advisory-text">
          {tt(state.adv.key)}
        </p>
        {state.low != null && state.high != null ? (
          <p className="advisory-range" data-testid="advisory-range">
            {tt('advTomorrow')}: {Math.round(state.low)}° … {Math.round(state.high)}°
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="btn advisory-dismiss"
        data-testid="advisory-dismiss"
        onClick={() => setDismissed(true)}
      >
        {tt('advDismiss')}
      </button>
    </div>
  )
}
