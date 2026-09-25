// Tight repro loops for two reported bugs. Run against a live preview:
//   node scripts/probe-bugs.mjs [--port 9333]
// Evidence, not a gate: prints PROBE_* lines for each hypothesis.
const PORT = Number((process.argv.find((a, i) => process.argv[i - 1] === '--port') || 9333))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')) })
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  const send = (method, params = {}, ms = 30000) => new Promise((res, rej) => {
    const i = ++id
    const to = setTimeout(() => { pending.delete(i); rej(new Error('CDP_TIMEOUT ' + method)) }, ms)
    pending.set(i, (m) => { clearTimeout(to); res(m) })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500))
    return r.result?.result?.value
  }
  return { send, evalJs, close: () => ws.close() }
}

/** Seed a fake local session so the app boots into the main view (same
 *  technique as scripts/cdp-ux-check.mjs — no Supabase needed). */
async function seed(evalJs, send) {
  await evalJs(`(() => { localStorage.removeItem('anjam.auth'); localStorage.removeItem('anjam.auth-user'); return 'out' })()`)
  await send('Page.reload', { ignoreCache: true })
  await sleep(900)
  await send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:4173', storageTypes: 'indexeddb,local_storage' })
  await evalJs(`(() => {
    const user = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'qa@anjam.local', aud: 'authenticated', role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z'
    }
    const payload = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' +
      btoa(JSON.stringify({ sub: user.id, exp: 4102444800, role: 'authenticated', email: user.email })) + '.sig'
    const session = {
      access_token: payload, refresh_token: 'fake-refresh', expires_in: 9999999,
      expires_at: 4102444800, token_type: 'bearer', user
    }
    localStorage.setItem('anjam.lang', 'fa')
    localStorage.setItem('anjam.supabase.url', 'https://fake-project.supabase.co')
    localStorage.setItem('anjam.supabase.key', 'eyJfak...e-qa')
    localStorage.setItem('anjam.auth', JSON.stringify(session))
    localStorage.setItem('anjam.auth-user', JSON.stringify({ user }))
    return 'seeded'
  })()`)
  await send('Page.reload', { ignoreCache: true })
  for (let i = 0; i < 30; i++) {
    await sleep(500)
    const ok = await evalJs(`!!document.querySelector('.view')`).catch(() => false)
    if (ok) return 'booted'
  }
  return 'not-booted'
}

/** Pre-inject a Notification recorder + error/submit trace before the app runs. */
async function installTracers(send) {
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__notifLog = [];
      if (typeof Notification !== 'undefined') {
        const Orig = Notification;
        function Rec(title, opts) {
          window.__notifLog.push({ title: String(title), body: (opts && opts.body) || '', t: Date.now() });
          try { return new Orig(title, opts) } catch (e) { return {} }
        }
        Rec.permission = Orig.permission;
        Rec.requestPermission = Orig.requestPermission && Orig.requestPermission.bind(Orig);
        window.Notification = Rec;
      }
      window.__trace = [];
      window.__oscCount = 0;
      try {
        const Osc = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function () { window.__oscCount++; return Osc.apply(this, arguments) };
      } catch (e) {}
      window.addEventListener('error', e => window.__trace.push({ kind: 'error', msg: String(e.message) }));
      window.addEventListener('unhandledrejection', e => window.__trace.push({ kind: 'rej', msg: String(e.reason) }));
      document.addEventListener('submit', e => window.__trace.push({ kind: 'submit', cls: String(e.target.className || ''), t: Date.now() }), true);
      const st = window.setTimeout;
      // Record at SCHEDULE time, not at fire time: an overflow timeout that
      // fires 1 ms after being created must still be caught, and a correct
      // 24-day chunk that fires on time must not look "late".
      window.__scheduled = [];
      window.setTimeout = function (fn, delay, ...a) {
        if (typeof fn === 'function' && typeof delay === 'number' && delay > 3600000) {
          const rec = { delay: delay, at: Date.now(), drift: null };
          window.__scheduled.push(rec);
          const orig = fn;
          fn = function (...x) { rec.drift = Date.now() - rec.at - delay; return orig.apply(this, x) };
        }
        return st.call(window, fn, delay, ...a);
      };
    })()`,
  })
}

async function main() {
  const { send, evalJs, close } = await connect()
  await send('Page.enable')
  await send('Runtime.enable')
  await installTracers(send)

  const boot = await seed(evalJs, send)
  console.log('PROBE_BOOT ' + boot)

  /* ------------------------------------------------------------------ *
   * BUG B — content taller than the screen: is it clipped or scrollable?
   * Repro: inject 4000px of content into the current .view, then try to
   * scroll it. Red = scrollTop stays 0 while scrollHeight > clientHeight.
   * ------------------------------------------------------------------ */
  const before = await evalJs(`(() => {
    const v = document.querySelector('.view')
    if (!v) return { found: false }
    const injected = document.createElement('div')
    injected.id = 'probe-tall'
    injected.style.cssText = 'height:4000px;background:linear-gradient(#f00,#00f);'
    v.appendChild(injected)
    const r = v.getBoundingClientRect()
    return {
      found: true,
      viewH: Math.round(r.height),
      clientH: v.clientHeight,
      scrollH: v.scrollHeight,
      docScrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      mainColH: Math.round(document.querySelector('.main-col')?.getBoundingClientRect().height || 0),
      mainColMinH: document.querySelector('.main-col') ? getComputedStyle(document.querySelector('.main-col')).minHeight : null,
      appRows: document.querySelector('.app') ? getComputedStyle(document.querySelector('.app')).gridTemplateRows : null,
      bodyOverflow: getComputedStyle(document.body).overflow,
      appOverflow: getComputedStyle(document.querySelector('.app') || document.body).overflow,
    }
  })()`)
  await sleep(250)
  const after = await evalJs(`(() => {
    const v = document.querySelector('.view')
    v.scrollTop = 900
    const top1 = v.scrollTop
    v.scrollTop = 0
    // wheel-scroll the page too, in case the scroller is the document
    window.scrollBy(0, 900)
    const docTop = window.scrollY
    window.scrollTo(0, 0)
    return { viewScrollTopAfterSet: top1, docScrollYAfterScroll: docTop }
  })()`)
  const viewScrollable = after.viewScrollTopAfterSet > 0
  const docScrollable = after.docScrollYAfterScroll > 0
  console.log('PROBE_B_LAYOUT ' + JSON.stringify({ before, after, viewScrollable, docScrollable }))
  console.log(
    viewScrollable
      ? 'PROBE_B_VERDICT view-scroller works'
      : 'PROBE_B_VERDICT RED — content overflows and NEITHER .view nor the document scrolls'
  )
  if (docScrollable && !viewScrollable) console.log('PROBE_B_HINT the document scrolled instead of .view (grid/flex min-height issue)')


  // Real path: schedule an important date ~110 days out with a 10-day lead
  // while the countdown is busy (timerFree false) -> alarms.ts setTimeout path.
  const real = await evalJs(`(async () => {
    const out = {}
    try {
      if (!window.__anjamDates || !window.__anjamAlarms) return { skip: 'no hooks' }
      // make the countdown engine "busy" so scheduleOne takes the setTimeout path
      await window.__anjamTimer.start(600000, { title: 'probe', body: 'b', dismiss: 'd', snooze: 's' })
      out.timerRunning = window.__anjamTimer.get().running
      const far = new Date(Date.now() + 110 * 86400000)
      const iso = far.toISOString().slice(0, 10)
      const row = await window.__anjamDates.add({
        title: 'PROBE-A-DATE', system: 'gregorian',
        month: far.getMonth() + 1, day: far.getDate(),
        remind_days: 10, remind_time: '09:00',
      })
      out.rowId = row && row.id
      await window.__anjamAlarms.sync()
      await new Promise(r => setTimeout(r, 1500))
      out.planned = window.__anjamAlarms.planned().filter(([id]) => id.startsWith('date:'))
      out.rows = (window.__anjamDates.list ? window.__anjamDates.list() : [])
        .filter(r => !r.deleted)
        .map(r => ({ id: r.id, system: r.system, month: r.month, day: r.day,
                     lead: r.remind_days, time: r.remind_time }))
      out.ringOverlay = !!document.querySelector('.alarm-overlay')
      out.picked = iso
      const [pid, pp] = out.planned[0] || []
      out.delayDays = pp ? Math.round((pp.at - Date.now()) / 86400000 * 10) / 10 : null
      out.plannedKind = pp ? pp.kind : null
      out.notifs = (window.__notifLog || []).map(n => n.title)
      out.longTimeouts = (window.__setTimeoutEarly || [])
    } catch (e) { out.error = String(e && e.message || e) }
    return out
  })()`)
  console.log('PROBE_A_REALPATH ' + JSON.stringify(real))

  /* ------------------------------------------------------------------ *
   * BUG C — timer: does a running countdown survive a reload, and does the
   * UI show the right remaining time?
   * ------------------------------------------------------------------ */
  const tm = await evalJs(`(async () => {
    const out = {}
    try {
      const T = window.__anjamTimer
      if (!T) return { skip: 'no hook' }
      out.hookKeys = Object.keys(T)
      const before = T.get ? T.get() : null
      out.persisted = before
      out.leftBefore = before && before.endsAt ? before.endsAt - Date.now() : null
      out.dom = [...document.querySelectorAll('[data-testid]')]
        .filter(e => /timer|count|hd-timer/i.test(e.getAttribute('data-testid') || ''))
        .map(e => ({ id: e.getAttribute('data-testid'), text: (e.textContent||'').slice(0,40) }))
      out.timerText = (document.querySelector('.hd-timer, .timer-display, [data-testid="timer-left"]')||{}).textContent || null
    } catch (e) { out.error = String(e && e.message || e) }
    return out
  })()`)
  console.log('PROBE_C_TIMER ' + JSON.stringify(tm))
  await evalJs(`window.location.reload()`)
  await sleep(2600)
  const tm2 = await evalJs(`(() => {
    const s = JSON.parse(localStorage.getItem('anjam.timer.v1') || 'null')
    const T = window.__anjamTimer
    return { persisted: s, leftAfter: s && s.endsAt ? s.endsAt - Date.now() : null,
             running: !!(T && T.get && T.get().running),
             timerText: (document.querySelector('.hd-timer, .timer-display, [data-testid="timer-left"]')||{}).textContent || null }
  })()`)
  console.log('PROBE_C_AFTER_RELOAD ' + JSON.stringify(tm2))

  /* ------------------------------------------------------------------ *
   * BUG C2 — does a short countdown actually RING, and does the header
   * pill show the remaining time while it runs?
   * ------------------------------------------------------------------ */
  const ring = await evalJs(`(async () => {
    const out = {}
    const pill = () => (document.querySelector('.timer-pill')||{}).textContent || null
    out.pillAtStart = pill()
    await window.__anjamTimer.start(6000, { title: 'RING PROBE', body: 'b', dismiss: 'd', snooze: 's' })
    out.samples = []
    for (let i = 0; i < 9; i++) {
      out.samples.push({ t: i * 1000, pill: pill(), running: window.__anjamTimer.get().running })
      await new Promise(r => setTimeout(r, 1000))
    }
    out.overlay = !!document.querySelector('.alarm-overlay')
    out.notifs = (window.__notifLog||[]).map(n=>n.title)
    out.final = window.__anjamTimer.get()
    return out
  })()`)
  console.log('PROBE_C2_RING ' + JSON.stringify(ring))

  /* ------------------------------------------------------------------ *
   * BUG A2 — the USER's actual flow: Dates view → add → pick a date with
   * the DatePicker UI → save. Then read the stored row + planned alarm.
   * ------------------------------------------------------------------ */
  const ui = await evalJs(`(async () => {
    const out = {}
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const clickText = (sel, needle) => {
      const e = [...document.querySelectorAll(sel)].find(x => (x.textContent||'').includes(needle))
      if (!e) return false; e.click(); return true
    }
    const click = sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true }
    const setVal = (sel, v) => {
      const i = document.querySelector(sel); if (!i) return false
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
      set.call(i, v); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true}))
      return true
    }
    // titles are rendered with Persian digits in fa mode
    const norm = s => String(s||'').replace(/[۰-۹]/g, d => String(d.charCodeAt(0)-0x06F0))
    const dayNum = t => { const n = norm(t).trim(); return n === '1' }

    out.nav = clickText('.nav-item', 'مهم')
    await sleep(600)
    out.open = click('[data-testid="date-add-open"]')
    await sleep(350)
    out.formOpen = !!document.querySelector('[data-testid="date-form"]')
    out.titleSet = setVal('[data-testid="date-title"]', 'شروع سال 2027')

    // DatePicker UI
    out.trigger = click('[data-testid="date-form"] .date-trigger')
    await sleep(350)
    out.calOpen = !!document.querySelector('.cal-pop')
    out.sysBefore = (document.querySelector('.cal-title')||{}).textContent || ''
    // switch to Gregorian (second segment)
    const segs = [...document.querySelectorAll('.cal-seg .seg-btn')]
    out.segCount = segs.length
    out.segLabels = segs.map(s => (s.textContent||'').trim())
    if (segs[1]) { segs[1].click() }
    await sleep(300)
    out.sysAfter = (document.querySelector('.cal-title')||{}).textContent || ''
    out.submitsAfterSeg = (window.__trace||[]).filter(x => x.kind==='submit').length
    // step forward until Jan 2027 (titles use Persian digits in fa mode)
    out.titles = []
    for (let i = 0; i < 14; i++) {
      const raw = (document.querySelector('.cal-title')||{}).textContent || ''
      const tt = norm(raw)
      out.titles.push(raw)
      if (/2027/.test(tt) && /(ژانویه|January)/i.test(tt)) break
      const n = document.querySelector('.cal-next')
      if (!n) { out.noNext = true; break }
      n.click(); await sleep(90)
    }
    out.navTitle = (document.querySelector('.cal-title')||{}).textContent || ''
    // click day 1 of that month (non-faded only, Persian digits allowed)
    const day1 = [...document.querySelectorAll('.cal-day')].find(x => !x.classList.contains('faded') && dayNum(x.textContent))
    out.day1 = !!day1
    if (day1) day1.click()
    await sleep(300)
    out.triggerLabel = (document.querySelector('[data-testid="date-form"] .date-trigger')||{}).textContent || ''
    // lead select value
    const lead = document.querySelector('[data-testid="date-lead"]')
    out.leadValue = lead ? lead.value : null
    out.leadOptions = lead ? [...lead.options].map(o => ({ v: o.value, t: o.textContent })) : null
    out.save = click('[data-testid="date-save"]')
    await sleep(2000)
    out.trace = (window.__trace||[]).slice(-12)
    out.errorBanner = (document.querySelector('.toast, .snack, [role="alert"]')||{}).textContent || null
    out.rows = (window.__anjamDates.list ? window.__anjamDates.list() : []).filter(r=>!r.deleted)
      .map(r => ({ title: r.title, system: r.system, month: r.month, day: r.day,
                   lead: r.remind_days, time: r.remind_time }))
    out.planned = window.__anjamAlarms.planned().filter(([k])=>k.startsWith('date:'))
      .map(([k,v]) => ({ kind: v.kind, at: v.at, leftDays: v.at? Math.round((v.at-Date.now())/86400000*10)/10 : null }))
    out.notifs = (window.__notifLog||[]).map(n=>n.title)
    out.longTimeouts = (window.__setTimeoutEarly||[]).map(x=>({delay:x.delay, drift:x.drift}))
    return out
  })()`)
  console.log('PROBE_A2_UI ' + JSON.stringify(ui))
  const a2row = (ui.rows || []).find(r => r.title === 'شروع سال 2027')
  const a2ok = !!(a2row && a2row.system === 'gregorian' && a2row.month === 1 && a2row.day === 1
    && ui.submitsAfterSeg === 0 && ui.day1 === true)
  console.log('PROBE_A2_VERDICT ' + (a2ok
    ? 'GREEN — 1 Jan 2027 stored as gregorian 1/1, no premature submit'
    : 'RED — ' + JSON.stringify({ row: a2row, submitsAfterSeg: ui.submitsAfterSeg, day1: ui.day1, navTitle: ui.navTitle, titles: ui.titles, noNext: ui.noNext })))

  /* ------------------------------------------------------------------ *
   * BUG A3 — DECISIVE TEST: does a malformed important-date row make the
   * engine ring on the spot? `at` must be finite; if `remind_days` is not a
   * number the arithmetic yields NaN, every guard comparing NaN is false,
   * and `setTimeout(fn, NaN)` fires immediately -> instant notification.
   * ------------------------------------------------------------------ */
  const bad = await evalJs(`(async () => {
    const out = { oscBefore: 0 }
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    window.__anjamTimer.stopBeep()          // silence the leftover ring from C2
    await new Promise(r => setTimeout(r, 300))
    out.oscBefore = window.__oscCount
    const make = async (title, patch) => {
      const r = await window.__anjamDates.add({ title, system: 'gregorian', month: 1, day: 1,
        remind_days: 10, remind_time: '09:00' })
      if (patch) await window.__anjamDates.update(r.id, patch)
      return r.id
    }
    out.ids = {}
    out.ids.undefinedLead = await make('BAD-UNDEF', { remind_days: undefined })
    out.ids.garbageLead   = await make('BAD-GARBAGE', { remind_days: 'abc' })
    out.ids.nullLead      = await make('BAD-NULL', { remind_days: null })
    out.ids.emptyTime     = await make('BAD-TIME', { remind_time: '' })
    // a control row with sane values, far future
    out.ids.control       = await make('CONTROL-OK', null)

    out.rows = window.__anjamDates.state().dates.filter(r => !r.deleted).map(r => ({
      t: r.title, lead: r.remind_days, leadType: typeof r.remind_days,
      leadFinite: Number.isFinite(r.remind_days), time: r.remind_time }))
    out.desired = window.__anjamAlarms.desired().map(d => ({
      id: d.id.replace('date:', ''), title: d.title.slice(0, 22),
      at: d.at, finite: Number.isFinite(d.at),
      days: Number.isFinite(d.at) ? Math.round((d.at - Date.now()) / 86400000 * 10) / 10 : null }))
    await window.__anjamAlarms.sync()
    await sleep(3000)
    out.planned = window.__anjamAlarms.planned().map(([k, v]) => ({
      id: k.replace('date:', ''), kind: v.kind, at: v.at, finite: Number.isFinite(v.at),
      days: Number.isFinite(v.at) ? Math.round((v.at - Date.now()) / 86400000 * 10) / 10 : null }))
    out.pill = (document.querySelector('.timer-pill')||{}).textContent || null
    out.oscAfter = window.__oscCount
    out.beeped = out.oscAfter > out.oscBefore
    out.notifs = (window.__notifLog || []).map(n => n.title)
    out.trace = (window.__trace || []).slice(-8)
    return out
  })()`)
  console.log('PROBE_A3_BADROWS ' + JSON.stringify(bad))

  /* ------------------------------------------------------------------ *
   * BUG A — setTimeout 32-bit overflow: delays > 2^31-1 ms (24.8 days)
   * fire immediately in Chromium. Any alarm scheduled that far out with
   * the timeout path rings on the spot.
   * ------------------------------------------------------------------ */
  // What matters is not what the PLATFORM does with a 88-day delay (it fires
  // instantly, by spec) but what the APP asks for. So: assert the app never
  // hands window.setTimeout a delay above the 32-bit cap. The long-timeout
  // tracer already recorded every >1h delay at schedule time.
  const t = await evalJs(`(async () => {
    const MAX = 2147483647
    const raw = (window.__scheduled || []).map(s => s.delay)
    const over = raw.filter(d => d > MAX)
    return {
      scheduled: raw.length,
      maxDelayAsked: raw.length ? Math.max(...raw) : 0,
      overCap: over.length,
      cap: MAX
    }
  })()`)
  console.log('PROBE_A_TIMEOUT ' + JSON.stringify(t))
  // Also require the assertion to have actually been exercised: an app that
  // scheduled zero long timeouts would otherwise pass this for free.
  const exercised = t.scheduled > 0
  console.log(
    t.overCap === 0 && exercised
      ? 'PROBE_A_VERDICT GREEN — app asked max ' + t.maxDelayAsked + ' ms, under the ' + t.cap + ' cap (' + t.scheduled + ' long timeouts)'
      : t.overCap === 0
        ? 'PROBE_A_VERDICT RED — no long timeout was scheduled, so this check proved nothing (run the far-date case first)'
        : 'PROBE_A_VERDICT RED — the app passed a ' + t.maxDelayAsked + ' ms delay to setTimeout (32-bit overflow, fires instantly)'
  )

  const farTimer = (bad.planned || []).filter(p => p.kind === 'timer' && (p.days === null || p.days >= 1))
  const a3ok = bad.beeped === false
    && (bad.desired || []).every(d => d.finite === true)
    && farTimer.length === 0
    && !/\d{4,}:/.test(bad.pill || '')
  console.log('PROBE_A3_VERDICT ' + (a3ok
    ? 'GREEN — finite at=87.6d, no instant ring, no far alarm in countdown (pill=' + bad.pill + ')'
    : 'RED — ' + JSON.stringify({ beeped: bad.beeped, badDesired: (bad.desired||[]).filter(d=>!d.finite), farTimer, pill: bad.pill })))

  /* ------------------------------------------------------------------ *
   * BUG C3 — the pill must COUNT DOWN each second. The engine emits every
   * 400ms tick, but the header re-renders only when React state changes;
   * a stale memo / missing subscription shows a frozen value.
   * ------------------------------------------------------------------ */
  const tick3 = await evalJs(`(async () => {
    const out = {}
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const pill = () => (document.querySelector('.timer-btn .timer-pill') || {}).textContent || null
    out.subsBefore = window.__anjamTimer.subCount()
    let seen = []
    const un = window.__anjamTimer.on(s => seen.push({ r: s.running, left: s.leftMs }))
    out.subsAfter = window.__anjamTimer.subCount()
    await window.__anjamTimer.start(8000, { title: 'TICK', body: 'b', dismiss: 'd', snooze: 's' })
    const samples = []
    for (let i = 0; i < 5; i++) { samples.push({ i, pill: pill() }); await sleep(1000) }
    out.samples = samples
    out.distinct = [...new Set(samples.map(s => s.pill))]
    out.emits = seen.length
    out.engSeen = seen.length
    un()
    // countdown accuracy: engine time vs wall clock
    const s1 = window.__anjamTimer.get()
    await sleep(2000)
    const s2 = window.__anjamTimer.get()
    out.driftMs = (s1.endsAt - s2.endsAt) - 2000
    await window.__anjamTimer.cancel()
    return out
  })()`)
  console.log('PROBE_C3_TICK ' + JSON.stringify(tick3))
  const c3ok = (tick3.distinct || []).filter(Boolean).length >= 3
  console.log('PROBE_C3_VERDICT ' + (c3ok
    ? 'GREEN — header pill counts down (' + tick3.distinct.join(' -> ') + ')'
    : 'RED — pill frozen: ' + JSON.stringify(tick3.distinct)))

  await evalJs(`(() => { const e = document.getElementById('probe-tall'); if (e) e.remove(); return 1 })()`)
  close()
}

main().catch((e) => { console.error('PROBE_ERROR', e); process.exit(1) })
