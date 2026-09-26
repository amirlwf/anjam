// UX QA over CDP for the packaged Anjam build:
// font, timer panel, jalali/gregorian datepicker, offline main app, mobile viewport.
// Run: node scripts/cdp-ux-check.mjs  (app up with --remote-debugging-port=9333)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'release', 'qa')
fs.mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const toAscii = (s) => String(s).replace(/[۰-۹]/g, (d) => String('\u06f0۱۲۳۴۵۶۷۸۹'.indexOf(d) + 48 * 0).replace(/^$/, () => '0123456789'[['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'].indexOf(d)]))
const results = []
const check = (name, ok, info = '') => {
  results.push({ name, ok, info })
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : ''))
}

async function main() {
  const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')) })

  let id = 0
  const pending = new Map()
  const consoleErrs = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params?.exceptionDetails
      consoleErrs.push(String(d?.exception?.description || d?.text || 'exception').slice(0, 220))
    }
    if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') {
      consoleErrs.push(String(m.params.entry.text).slice(0, 220))
    }
  }
  ws.onclose = () => { console.error('CDP_WS_CLOSED_BY_BROWSER'); process.exit(3) }
  ws.onerror = () => { /* surfaced via onclose */ }
  const send = (method, params = {}, ms = 90000) => new Promise((res, rej) => {
    const i = ++id
    const to = setTimeout(() => { pending.delete(i); rej(new Error('CDP_TIMEOUT ' + method)) }, ms)
    pending.set(i, (m) => { clearTimeout(to); res(m) })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
    return r.result?.result?.value
  }
  // Screenshots are evidence, not the gate: if the compositor capture wedges
  // (occluded window), retry via the renderer path, then skip instead of failing.
  const shot = async (name) => {
    const p = path.join(OUT, name)
    try {
      const r = await send('Page.captureScreenshot', { format: 'png' }, 30000)
      fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'))
      return p
    } catch (e) {
      try {
        const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: false }, 25000)
        fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'))
        return p + ' [surfaceless]'
      } catch (e2) {
        console.log('SHOT_SKIPPED ' + name + ' — ' + String(e2.message || e2))
        return '(skipped)'
      }
    }
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable').catch(() => undefined)

  // --- enter the main app offline: fake config + fake (unexpired) local session ---
  // idempotent boot: log out, clear the origin (tasks/settings from prior runs),
  // then seed. Clearing needs no open IndexedDB connection, hence the logout first.
  await evalJs(`(() => { localStorage.removeItem('anjam.auth'); localStorage.removeItem('anjam.auth-user'); return 'out' })()`)
  await send('Page.reload', { ignoreCache: true })
  await sleep(1000)
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
    localStorage.setItem('anjam.theme', 'dark')
    localStorage.setItem('anjam.supabase.url', 'https://fake-project.supabase.co')
    localStorage.setItem('anjam.supabase.key', 'eyJfake-anon-key-for-offline-qa')
    localStorage.setItem('anjam.auth', JSON.stringify(session))
    localStorage.setItem('anjam.auth-user', JSON.stringify({ user }))
    return 'seeded'
  })()`)
  await send('Page.reload', { ignoreCache: true })
  let mainOk = false
  let bootText = ''
  for (let i = 0; i < 24; i++) {
    await sleep(500)
    mainOk = await evalJs(`!!document.getElementById('quickadd-input')`)
    if (mainOk) break
    bootText = await evalJs(`(document.body.innerText || '').slice(0, 140)`)
  }
  check('offline main app reached', mainOk, mainOk ? '' : 'stuck: ' + bootText)
  if (!mainOk) { console.log('UX_QA_BOOT_STUCK'); process.exit(3) }
  console.log('MAIN_FILE:', await shot('10-main-fa-dark.png'))

  // --- font: Vazirmatn loaded and applied ---
  const font = await evalJs(`JSON.stringify({
    loaded: document.fonts.check('16px Vazirmatn'),
    body: getComputedStyle(document.body).fontFamily,
    dir: document.documentElement.dir
  })`)
  const f = JSON.parse(font)
  check('Vazirmatn loaded', f.loaded === true, f.body.slice(0, 80))
  check('RTL direction', f.dir === 'rtl', f.dir)

  const fabD = await evalJs(`(() => { const f = document.querySelector('.fab'); return f ? f.getBoundingClientRect().width : -1 })()`)
  check('fab hidden on desktop', fabD <= 0, String(fabD))

  // --- timer panel ---
  await evalJs(`document.querySelector('.timer-btn').click(); 'ok'`)
  await sleep(600)
  const timerDom = await evalJs(`JSON.stringify({
    modal: !!document.querySelector('.timer-modal'),
    digits: document.querySelector('.timer-digits')?.textContent || '',
    presets: document.querySelectorAll('.timer-preset').length,
    hint: document.querySelector('.timer-hint')?.textContent || ''
  })`)
  const td = JSON.parse(timerDom)
  check('timer modal opens', td.modal)
  check('timer shows 25:00', /^25:00/.test(toAscii(td.digits)), td.digits)
  check('timer presets present', td.presets >= 5, String(td.presets))
  check('timer hint text', td.hint.length > 10, td.hint.slice(0, 60))
  console.log('TIMER_FILE:', await shot('11-timer-panel.png'))

  // start the countdown, confirm the pill appears and ticks
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.timer-actions .btn')].find(x => /شروع|start/i.test(x.textContent))
    b && b.click(); return b ? b.textContent.trim() : 'no-start'
  })()`)
  await sleep(1600)
  const running = await evalJs(`JSON.stringify({
    pill: document.querySelector('.timer-pill')?.textContent || '',
    digits: document.querySelector('.timer-digits')?.textContent || ''
  })`)
  const rn = JSON.parse(running)
  const pill = toAscii(rn.pill).trim()
  const dig = toAscii(rn.digits).trim()
  check('timer running pill appears', /^\d{1,2}:\d\d$/.test(pill), pill || '(empty)')
  check('timer counting', dig !== '25:00' && /^\d{1,2}:\d\d$/.test(dig), rn.digits)
  // stop it, close the panel (button reads لغو / cancel)
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.timer-actions .btn')].find(x => /لغو|توقف|cancel|stop/i.test(x.textContent))
    b && b.click(); return 'stopped'
  })()`)
  await sleep(300)
  await evalJs(`window.__anjamTimer.cancel(); 'hard-reset'`)
  await sleep(200)
  await evalJs(`document.querySelector('.timer-modal .icon-btn')?.click(); 'closed'`)
  await sleep(300)

  // --- pomodoro mode ---
  await evalJs(`window.__anjamTimer.cancel(); 'idle'`)
  await evalJs(`document.querySelector('.timer-btn').click(); 'ok'`)
  await sleep(500)
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.timer-mode .seg-btn')].find(x => /پومودورو|Pomodoro/.test(x.textContent))
    b && b.click(); return b ? 'ok' : 'no-mode-btn'
  })()`)
  await sleep(400)
  const pomIdle = await evalJs(`JSON.stringify({
    cfg: !!document.querySelector('.pom-cfg'),
    hint: document.querySelector('.pom-cfg-hint')?.textContent || '',
    actions: [...document.querySelectorAll('.timer-actions .btn')].map(b => b.textContent.trim()).join('|')
  })`)
  const pi = JSON.parse(pomIdle)
  check('pomodoro config view', pi.cfg && /تمرکز|focus/i.test(pi.actions), pi.actions.slice(0, 60))
  check('pomodoro hint', pi.hint.length > 10, pi.hint.slice(0, 60))
  console.log('POM_CFG_FILE:', await shot('19-pomodoro-cfg.png'))
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.timer-actions .btn')].find(x => /شروع تمرکز|Start focus/.test(x.textContent))
    b && b.click(); return b ? 'ok' : 'no-start'
  })()`)
  await sleep(2600)
  const pomRun = await evalJs(`JSON.stringify({
    phase: document.querySelector('.pom-phase')?.textContent || '',
    round: document.querySelector('.pom-round')?.textContent || '',
    digits: document.querySelector('.timer-digits')?.textContent || '',
    st: window.__anjamTimer.get()
  })`)
  const pr = JSON.parse(pomRun)
  check('pomodoro running: focus badge', pr.phase.length > 2, pr.phase)
  check('pomodoro round 1/4', /1|۱/.test(toAscii(pr.round)) && /4|۴/.test(toAscii(pr.round)), pr.round)
  check('pomodoro engine kind', pr.st.kind === 'pomodoro' && pr.st.phase === 'work', pr.st.kind + '/' + pr.st.phase)
  check('pomodoro counting', toAscii(pr.digits).trim() !== '25:00' && /^\d{1,2}:\d\d/.test(toAscii(pr.digits)), pr.digits)
  console.log('POM_RUN_FILE:', await shot('20-pomodoro-run.png'))
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.timer-actions .btn')].find(x => /لغو|توقف|cancel|stop/i.test(x.textContent))
    b && b.click(); return 'stopped'
  })()`)
  await sleep(300)
  await evalJs(`window.__anjamTimer.cancel(); 'hard-reset'`)
  await sleep(200)
  await evalJs(`document.querySelector('.timer-modal .icon-btn')?.click(); 'closed'`)
  await sleep(300)

  // --- quickadd a task, open detail, datepicker ---
  // trusted input via CDP (React onChange ignores synthetic value sets reliably)
  await evalJs(`document.getElementById('quickadd-input').focus(); 'focused'`)
  await send('Input.insertText', { text: 'QA task — calendar check' })
  await sleep(500)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await sleep(1500)
  // make sure the new task is visible: switch to Inbox
  await evalJs(`(() => {
    const nav = [...document.querySelectorAll('.nav-item, aside button, aside a')].find(n => /صندوق ورودی|Inbox/i.test(n.textContent))
    if (nav) nav.click()
    return nav ? 'inbox' : 'no-inbox'
  })()`)
  await sleep(700)
  console.log('QUICKADD_DEBUG:', await evalJs(`JSON.stringify({
    rows: document.querySelectorAll('.task-row').length,
    texts: [...document.querySelectorAll('.task-row')].map(r => r.textContent.slice(0, 40)),
    val: document.getElementById('quickadd-input')?.value || ''
  })`))
  const rowOk = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('.task-row')]
    const hit = rows.find(r => /calendar check/.test(r.textContent)) || rows[0]
    if (hit) hit.click()
    return !!hit
  })()`)
  check('task row created + opened', rowOk)
  await sleep(700)
  const detailOk = await evalJs(`!!document.querySelector('.detail') && !!document.querySelector('.date-trigger')`)
  check('detail + date trigger present', detailOk)

  const triggerClicked = await evalJs(`(() => {
    const d = document.querySelector('.date-trigger')
    if (d) d.click()
    return !!d
  })()`)
  check('date trigger clicked', triggerClicked)
  await sleep(500)
  const cal = await evalJs(`JSON.stringify({
    pop: !!document.querySelector('.cal-pop'),
    cells: document.querySelectorAll('.cal-day').length,
    head0: document.querySelectorAll('.cal-weekdays span')[0]?.textContent || '',
    title: document.querySelector('.cal-title')?.textContent || '',
    today: !!document.querySelector('.cal-day.today'),
    segs: [...document.querySelectorAll('.cal-seg .seg-btn')].map(b => b.textContent.trim())
  })`)
  const cd = JSON.parse(cal)
  check('calendar popover opens', cd.pop)
  check('42 day cells', cd.cells === 42, String(cd.cells))
  check('jalali week starts ش', cd.head0 === 'ش', cd.head0)
  check('jalali month title (مهر)', /مهر/.test(cd.title), cd.title)
  check('today cell marked', cd.today)
  check('has jalali/gregorian toggle', cd.segs.length === 2, cd.segs.join('|'))
  console.log('CAL_JALALI_FILE:', await shot('12-cal-jalali.png'))

  // switch to gregorian
  await evalJs(`(() => {
    const segs = [...document.querySelectorAll('.cal-seg .seg-btn')]
    const g = segs.find(s => /میلادی|Greg/.test(s.textContent))
    g && g.click(); return g ? 'clicked' : 'no-seg'
  })()`)
  await sleep(400)
  const cal2 = await evalJs(`JSON.stringify({
    cells: document.querySelectorAll('.cal-day').length,
    head0: document.querySelectorAll('.cal-weekdays span')[0]?.textContent || '',
    title: document.querySelector('.cal-title')?.textContent || '',
    pref: localStorage.getItem('anjam.cal')
  })`)
  const cd2 = JSON.parse(cal2)
  check('switched to gregorian (ی first in fa)', cd2.head0 === 'ی', cd2.head0)
  check('gregorian title (سپتامبر ۲۰۲۶)', /سپتامبر|September/.test(cd2.title) && /۲۰۲۶|2026/.test(cd2.title), cd2.title)
  check('calendar pref persisted', cd2.pref === 'gregorian', String(cd2.pref))
  console.log('CAL_GREG_FILE:', await shot('13-cal-gregorian.png'))

  // pick a date -> popover closes, trigger shows it
  // The fixture needs a datetime that is (a) still in the future when the
  // scheduler runs and (b) inside the 24 h window a countdown is promoted
  // from. So decide the clock first, then pick whichever date makes that
  // clock valid: 90 minutes from now, on today, unless that crosses
  // midnight — then the wrapped time on tomorrow.
  const RING = (() => {
    const now = new Date()
    const d = new Date(now.getTime() + 90 * 60000)
    const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
    return { time, wraps: d.getDate() !== now.getDate() }
  })()
  await evalJs(`(() => {
    const cells = [...document.querySelectorAll('.cal-day')]
    const i = cells.findIndex(c => c.classList.contains('today'))
    const target = ${JSON.stringify(RING.wraps)} ? cells[i + 1] : cells[i]
    if (target) target.click()
    return 'picked:' + (i >= 0 ? i : 'none') + ' wraps=' + ${JSON.stringify(RING.wraps)}
  })()`)
  await sleep(400)
  const picked = await evalJs(`JSON.stringify({
    pop: !!document.querySelector('.cal-pop'),
    trigger: document.querySelector('.date-trigger')?.textContent.trim() || ''
  })`)
  const pk = JSON.parse(picked)
  check('date picked, popover closed', !pk.pop)
  check('trigger shows picked date', pk.trigger.length > 3, pk.trigger)
  await evalJs(`(() => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }); window.dispatchEvent(e); return 'esc' })()`)
  await sleep(300)

  // --- task alarm: exact clock time + bell + scheduler ---
  await evalJs(`(() => {
    const rows = [...document.querySelectorAll('.task-row')]
    const hit = rows.find(r => /calendar check/.test(r.textContent)) || rows[0]
    if (hit) hit.click(); return !!hit
  })()`)
  await sleep(700)
  const segDom = await evalJs(`JSON.stringify({
    seg: !!document.querySelector('.time-seg'),
    segs: [...document.querySelectorAll('.time-seg .seg-btn')].map(b => b.textContent.trim()),
    detail: !!document.querySelector('.detail')
  })`)
  const sg = JSON.parse(segDom)
  check('detail time segments present', sg.seg && sg.segs.length === 2, sg.segs.join('|'))
  // switch to "with time" (timed) if not already
  await evalJs(`(() => {
    const active = document.querySelector('.time-seg .seg-btn.active')
    if (active && /با ساعت|With time/.test(active.textContent)) return 'already'
    const b = [...document.querySelectorAll('.time-seg .seg-btn')].find(x => /با ساعت|With time/.test(x.textContent))
    b && b.click(); return b ? 'clicked' : 'no-btn'
  })()`)
  await sleep(500)
  const timeVal0 = await evalJs(`document.querySelector('[data-testid=time-input]')?.value || ''`)
  check('time input visible', timeVal0.length === 5, timeVal0)
  // The task is dated tomorrow, so any clock time is in the future and the
  // scheduler will plan it. The fixture still types the digits with trusted
  // key events — that is what is under test, not `input.value = …`.
  const ringTime = RING.time
  await evalJs(`(() => { const el = document.querySelector('[data-testid=time-input]'); if (el) el.focus(); return !!el })()`)
  for (const ch of ringTime.replace(':', '').split('')) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: 'Digit' + ch, text: ch, windowsVirtualKeyCode: 48 + Number(ch) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Digit' + ch, windowsVirtualKeyCode: 48 + Number(ch) })
    await sleep(80)
  }
  await sleep(500)
  const typedVal = await evalJs(`document.querySelector('[data-testid=time-input]')?.value || ''`)
  // What the typing proves: the field takes trusted key events at all.
  check('time input accepts typed digits', typedVal !== timeVal0 && typedVal.length === 5, typedVal + ' from ' + timeVal0)

  // What it cannot prove: an arbitrary clock time. Chrome's native control is
  // segmented and, on a synthetic keypress, completes the HOUR segment after a
  // single digit — so a blind four-digit sequence lands as 02:13 instead of
  // 21:35 (measured digit by digit: 2 -> 02:00, 1 -> 02:01, 3 -> 02:13, 5 ignored).
  // Put the intended time in through the same React `input` path a completed
  // edit takes, then assert everything downstream against it.
  await evalJs(`(() => {
    const el = document.querySelector('[data-testid=time-input]')
    if (!el) return 'no-input'
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, ${JSON.stringify(RING.time)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return el.value
  })()`)
  await sleep(700)
  const timeVal = await evalJs(`document.querySelector('[data-testid=time-input]')?.value || ''`)
  check('ring time set', timeVal === ringTime, timeVal + ' want ' + ringTime)
  await sleep(300)
  const bellDom = await evalJs(`JSON.stringify({
    bell: !!document.querySelector('[data-testid=bell-btn]'),
    text: document.querySelector('[data-testid=bell-btn]')?.textContent.trim() || ''
  })`)
  const bd = JSON.parse(bellDom)
  check('bell shows rings-at',
    bd.bell && /زنگ/.test(bd.text) && toAscii(bd.text).includes(ringTime),
    bd.text + ' want ' + ringTime)
  console.log('TASK_ALARM_FILE:', await shot('15-task-alarm.png'))
  // bell toggle off/on
  await evalJs(`(() => { const b = document.querySelector('[data-testid=bell-btn]'); b && b.click(); return 'off' })()`)
  await sleep(400)
  const bellOff = await evalJs(`document.querySelector('[data-testid=bell-btn]')?.textContent.trim() || ''`)
  check('bell muted state', /بی‌زنگ|Muted/.test(bellOff), bellOff)
  await evalJs(`(() => { const b = document.querySelector('[data-testid=bell-btn]'); b && b.click(); return 'on' })()`)
  await sleep(300)
  // scheduler registration on desktop = countdown hand-off (timer must be idle)
  await evalJs(`window.__anjamTimer.cancel(); 'idle'`)
  await evalJs(`window.__anjamAlarms.sync(); 'sync'`)
  await sleep(700)
  const planned = await evalJs(`JSON.stringify({ p: window.__anjamAlarms.planned(), owner: window.__anjamTimer.get().owner })`)
  const pl = JSON.parse(planned)
  check('task alarm registered', pl.p.length >= 1, JSON.stringify(pl.p.map(x => x[0] + ':' + x[1].kind)))
  check('countdown handed the task', pl.owner !== null && pl.p.some(x => x[1].kind === 'timer'), String(pl.owner) + '/' + JSON.stringify(pl.p.map(x => x[1].kind)))
  // cleanup: mute (cancels registration), close detail
  await evalJs(`(() => { const b = document.querySelector('[data-testid=bell-btn]'); b && b.click(); return 'muted' })()`)
  await sleep(500)
  const planned2 = await evalJs(`JSON.stringify(window.__anjamAlarms.planned())`)
  check('mute cancels registration', JSON.parse(planned2).length === 0, planned2)

  // --- routine view: habit heatmap calendar ---
  await evalJs(`(() => { const n = [...document.querySelectorAll('.nav-item')].find(x => /روتين|Routine/.test(x.textContent)); n && n.click(); return !!n })()`)
  await sleep(500)
  const rt = JSON.parse(await evalJs(`JSON.stringify({
    wrap: !!document.querySelector('[data-testid=routine-wrap]'),
    cells: document.querySelectorAll('.rh-cell').length,
    weekdays: document.querySelectorAll('.rh-weekdays span').length,
    title: document.querySelector('.rh-title')?.textContent || ''
  })`))
  check('routine view + heatmap 42 cells', rt.wrap && rt.cells === 42, JSON.stringify(rt))
  check('routine weekday headers = 7', rt.weekdays === 7, String(rt.weekdays))
  check('routine month title rendered', rt.title.length > 3, rt.title)

  const segLabels = await evalJs(`[...document.querySelectorAll('.rh-head .cal-seg .seg-btn')].map(b => b.textContent.trim())`)
  check('routine jalali/gregorian toggle present', segLabels.length === 2, segLabels.join('|'))
  const t0 = await evalJs(`(() => {
    const segs = [...document.querySelectorAll('.rh-head .cal-seg .seg-btn')];
    const other = segs.find(s => !s.classList.contains('active'));
    if (!other) return 'none';
    other.click();
    return document.querySelector('.rh-title')?.textContent || '';
  })()`)
  await sleep(500)
  const t1 = await evalJs(`document.querySelector('.rh-title')?.textContent || ''`)
  check('routine calendar system switches', t0 !== 'none' && t1 !== t0, t1 + ' (was ' + t0 + ')')
  const t2 = await evalJs(`(() => {
    const segs = [...document.querySelectorAll('.rh-head .cal-seg .seg-btn')];
    const back = segs.find(s => !s.classList.contains('active'));
    if (!back) return 'none';
    back.click();
    return 'back';
  })()`)
  await sleep(500)
  const t3 = await evalJs(`document.querySelector('.rh-title')?.textContent || ''`)
  check('routine calendar system restored', t2 !== 'none' && t3 !== t1 && t3 !== '', t3 + ' (back from ' + t1 + ', was ' + t0 + ')')
  // land on the current month so today's cell is in-month for the day-detail test
  await evalJs(`(() => { const b = [...document.querySelectorAll('.rh-head .btn')].find(x => /امروز|Today/.test(x.textContent)); b && b.click(); return !!b })()`)
  await sleep(500)

  // add a habit
  await evalJs(`(() => {
    const i = document.querySelector('[data-testid=habit-input]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(i, 'ورزش');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed'
  })()`)
  await sleep(250)
  await evalJs(`document.querySelector('.habit-add .btn')?.click(); 'added'`)
  await sleep(450)
  const hr = JSON.parse(await evalJs(`JSON.stringify({
    rows: document.querySelectorAll('[data-testid=habit-row]').length,
    score: document.querySelector('[data-testid=r-today-score]')?.textContent || ''
  })`))
  check('habit added + empty-day score', hr.rows === 1 && hr.score.includes('/'), JSON.stringify(hr))

  // check it off today -> score, streak, heatmap cell
  await evalJs(`document.querySelector('[data-testid=habit-row] .check-btn')?.click(); 'toggled'`)
  await sleep(450)
  const ht = JSON.parse(await evalJs(`JSON.stringify({
    score: (document.querySelector('[data-testid=r-today-score]')?.textContent || '').replace(/\s/g, ''),
    streak: document.querySelector('[data-testid=r-streak]')?.textContent || '',
    cellFull: (document.querySelector('[data-testid=rh-today]')?.className || '').includes('rh-full')
  })`))
  check('habit check -> score 1/1', ht.score === '1/1', JSON.stringify(ht))
  check('streak = 1 after checking today', /^\s*1\s*$/.test(ht.streak), ht.streak)
  check('today cell fills in heatmap', ht.cellFull, JSON.stringify(ht))

  // day detail popover
  await evalJs(`document.querySelector('[data-testid=rh-today]')?.click(); 'sel'`)
  await sleep(700)
  const dd = await evalJs(`!!document.querySelector('[data-testid=day-detail] .day-habit')`)
  check('day detail opens with habit chips', dd === true, String(dd))

  // cleanup: delete the habit, back to empty state, then return to task list
  await evalJs(`(() => { window.confirm = () => true; document.querySelector('[data-testid=habit-row] .icon-btn')?.click(); return 'del' })()`)
  await sleep(450)
  const cleaned = await evalJs(`document.querySelectorAll('[data-testid=habit-row]').length === 0 && !!document.querySelector('.habit-empty')`)
  check('habit deleted -> empty state', cleaned === true, String(cleaned))
  await evalJs(`(() => { const n = [...document.querySelectorAll('.nav-item')].find(x => /صندوق ورودی|Inbox/.test(x.textContent)); n && n.click(); return !!n })()`)
  await sleep(450)
  const backToList = await evalJs(`!!document.querySelector('.task-list')`)
  check('returned to task list after routine', backToList === true, String(backToList))
  await evalJs(`(() => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }); window.dispatchEvent(e); return 'esc' })()`)
  await sleep(300)

  // --- important dates view: catalog suggestions + lead-time reminders ---
  await evalJs(`(() => { const n = [...document.querySelectorAll('.nav-item')].find(x => /روزهای مهم|Key dates/.test(x.textContent)); n && n.click(); return !!n })()`)
  await sleep(500)
  const dv = await evalJs(`!!document.querySelector('[data-testid=dates-view]')`)
  check('dates view opens', dv === true, String(dv))
  const suggN = await evalJs(`document.querySelectorAll('[data-testid=sugg-card]').length`)
  check('suggestions catalog present', suggN >= 10, String(suggN))
  const emptyD = await evalJs(`!!document.querySelector('[data-testid=dates-empty]')`)
  check('dates empty state first run', emptyD === true, String(emptyD))
  // seed through the QA hook; the row must render with countdown + lead chip
  await evalJs(`window.__anjamDates.add({ title: 'تولد آزمایشی', system: 'gregorian', month: 12, day: 25, remind_days: 10, remind_time: '09:00' }).then(() => 'ok')`)
  await sleep(550)
  const rowInfo = await evalJs(`(() => {
    const r = document.querySelector('[data-testid=date-row]')
    if (!r) return JSON.stringify({ none: true })
    return JSON.stringify({
      hasRow: true,
      lead: !!r.querySelector('[data-testid=date-lead-chip]'),
      leadText: (r.querySelector('[data-testid=date-lead-chip]')?.textContent || '').slice(0, 40),
      count: document.querySelectorAll('[data-testid=date-row]').length
    })
  })()`)
  const ri = JSON.parse(rowInfo)
  check('important date row renders', !!ri.hasRow && ri.count === 1 && !!ri.lead, rowInfo)
  check('lead chip shows 10 days before', /۱۰|10/.test(String(ri.leadText)), String(ri.leadText))
  // the alarm engine must plan a 'date:' ring while enabled…
  await evalJs(`window.__anjamAlarms.sync(); 'sync'`)
  await sleep(700)
  const dp1 = await evalJs(`JSON.stringify(window.__anjamAlarms.planned().filter(x => String(x[0]).startsWith('date:')).map(x => x[0]))`)
  check('date reminder planned', JSON.parse(dp1).length === 1, dp1)
  // …and cancel it when the bell is muted
  await evalJs(`(() => { const b = document.querySelector('[data-testid=date-row] .icon-btn[aria-pressed]'); b && b.click(); return !!b })()`)
  await sleep(450)
  const offTxt = await evalJs(`document.querySelector('[data-testid=date-lead-chip]')?.textContent || ''`)
  check('date reminder toggles off', /خاموش|off/i.test(offTxt), offTxt.slice(0, 30))
  await evalJs(`window.__anjamAlarms.sync(); 'sync'`)
  await sleep(600)
  const dp2 = await evalJs(`JSON.stringify(window.__anjamAlarms.planned().filter(x => String(x[0]).startsWith('date:')))`)
  check('muted date cancels planned ring', JSON.parse(dp2).length === 0, dp2)
  // keep a suggestion: it must move out of the catalog into "my dates"
  const beforeS = await evalJs(`document.querySelectorAll('[data-testid=sugg-card]').length`)
  await evalJs(`(() => { const b = document.querySelector('[data-testid=sugg-add]'); b && b.click(); return !!b })()`)
  await sleep(500)
  const afterS = await evalJs(`document.querySelectorAll('[data-testid=sugg-card]').length`)
  const keptN = await evalJs(`document.querySelectorAll('[data-testid=date-row]').length`)
  check('suggestion kept -> moves to my dates', afterS === beforeS - 1 && keptN === 2, beforeS + '->' + afterS + ' rows=' + keptN)
  // cleanup both rows (confirm pre-overridden below per-click)
  for (let i = 0; i < 2; i++) {
    await evalJs(`(() => { window.confirm = () => true; document.querySelector('[data-testid=date-row] .icon-btn.danger')?.click(); return 'del' })()`)
    await sleep(450)
  }
  const datesClean = await evalJs(`document.querySelectorAll('[data-testid=date-row]').length === 0`)
  check('dates cleaned up', datesClean === true, String(datesClean))
  await evalJs(`(() => { const n = [...document.querySelectorAll('.nav-item')].find(x => /صندوق ورودی|Inbox/.test(x.textContent)); n && n.click(); return !!n })()`)
  await sleep(450)

  // --- optional sections (study / workout): hidden by default, opt-in in settings ---
  const navHas = (re) => evalJs(`([...document.querySelectorAll('.nav-item')]).some(x => ${re}.test(x.textContent))`)
  check('study nav hidden by default', (await navHas('/درس|Study/')) === false)
  check('workout nav hidden by default', (await navHas('/ورزش|Workout/')) === false)
  const setReact = (sel, v, ev = 'input', idx = 0) => evalJs(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(sel)})[${idx}]
    if (!el) return 'no-el'
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)})
    el.dispatchEvent(new Event(${JSON.stringify(ev)}, { bubbles: true }))
    return 'ok'
  })()`)
  const pressEnter = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  }
  // enable both sections in Settings → Sections
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.topbar-actions button')].find(x => /تنظیمات|Settings/i.test(x.title || ''))
    b && b.click(); return b ? 'ok' : 'no-gear'
  })()`)
  await sleep(500)
  const secStudyBtn = await evalJs(`(() => { const b = document.querySelector('[data-testid=sec-study-on]'); b && b.click(); return !!b })()`)
  const secWorkoutBtn = await evalJs(`(() => { const b = document.querySelector('[data-testid=sec-workout-on]'); b && b.click(); return !!b })()`)
  check('settings sections toggles', secStudyBtn === true && secWorkoutBtn === true, String(secStudyBtn) + '/' + String(secWorkoutBtn))
  await sleep(250)
  await evalJs(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'esc' })()`)
  await sleep(450)
  check('study nav appears after enable', (await navHas('/درس|Study/')) === true)
  check('workout nav appears after enable', (await navHas('/ورزش|Workout/')) === true)

  // ---- study view ----
  await evalJs(`(() => { const n = [...document.querySelectorAll('.nav-item')].find(x => /درس|Study/.test(x.textContent)); n && n.click(); return !!n })()`)
  await sleep(500)
  check('study view opens', await evalJs(`!!document.querySelector('[data-testid=study-view]')`) === true)
  const studyTabs = await evalJs(`['tt','hw','log'].every(k => !!document.querySelector('[data-testid=study-tab-' + k + ']'))`)
  check('study tabs present', studyTabs === true, String(studyTabs))
  // subject
  await evalJs(`document.querySelector('[data-testid=subj-input]').focus(); 'ok'`)
  await send('Input.insertText', { text: 'ریاضی' })
  await sleep(250)
  await pressEnter()
  await sleep(450)
  check('study subject added', await evalJs(`document.querySelectorAll('.subj-chip').length >= 1`) === true)
  // ---- US3 / FR-08: the timetable is rings, not a clock ----
  await setReact('[data-testid=study-tt] .slot-form select', await evalJs(`document.querySelectorAll('[data-testid=study-tt] .slot-form select')[0]?.options[1]?.value || ''`), 'change')
  await sleep(250)
  await evalJs(`(() => { const b = document.querySelector('[data-testid=slot-add]'); b && b.click(); return !!b })()`)
  await sleep(500)
  check('timetable ring added', await evalJs(`document.querySelectorAll('[data-testid=slot-row]').length >= 1`) === true)

  /* T025 — N rings must render N cells, in order, each labelled with its
   * ring number. Driving the day's own count control is what makes this a
   * real check of the grid rather than of whatever happened to be stored. */
  await setReact('[data-testid=day-count-0]', '5', 'change')
  await sleep(600)
  const mondayRings = JSON.parse(await evalJs(`JSON.stringify({
    count: document.querySelector('[data-testid=day-count-0]')?.value ?? null,
    periods: [...document.querySelectorAll('[data-testid^="period-subject-0-"]')]
      .map((el) => Number(el.dataset.testid.split('-').pop())),
    labels: [...document.querySelectorAll('[data-testid=period-label]')].map((el) => el.textContent.trim()),
    subjects: [...document.querySelectorAll('[data-testid^="period-subject-0-"]')].map((el) => el.value),
  })`))
  check('period grid renders N cells for N rings', mondayRings.count === '5' && mondayRings.periods.length === 5, JSON.stringify(mondayRings.periods))
  check('period cells are in ring order', JSON.stringify(mondayRings.periods) === JSON.stringify([1, 2, 3, 4, 5]), JSON.stringify(mondayRings.periods))
  check('every ring carries a ring label', mondayRings.labels.length >= 5 && mondayRings.labels.every((l) => /زنگ|Period/.test(l)), JSON.stringify(mondayRings.labels.slice(0, 5)))
  check('the picked subject landed in ring 1', mondayRings.subjects[0] !== '', JSON.stringify(mondayRings.subjects))

  /* T026 — FR-09: no clock anywhere in the Study tab. Checked against the
   * rendered text as well as the inputs, because a raw HH:MM string in the
   * markup would still be a timer the student never asked for. */
  const studyClock = JSON.parse(await evalJs(`JSON.stringify({
    timeInputs: document.querySelectorAll('[data-testid=study-view] input[type=time]').length,
    hhmm: (document.querySelector('[data-testid=study-view]')?.innerText || '').match(/\\d{1,2}:\\d{2}/g) || [],
    dayCounters: document.querySelectorAll('[data-testid=study-view] .tt-count select').length,
  })`))
  check('study tab has zero clock inputs', studyClock.timeInputs === 0, String(studyClock.timeInputs))
  check('study tab renders no HH:MM text', studyClock.hhmm.length === 0, JSON.stringify(studyClock.hhmm))
  check('every school day exposes a ring count', studyClock.dayCounters === 7, String(studyClock.dayCounters))
  await shot('22-study-timetable-desktop.png')

  // ---- homework tab ----
  await evalJs(`(() => { const b = document.querySelector('[data-testid=study-tab-hw]'); b && b.click(); return !!b })()`)
  await sleep(350)
  await evalJs(`document.querySelector('[data-testid=hw-input]').focus(); 'ok'`)
  await send('Input.insertText', { text: 'تمرین فصل سوم' })
  await sleep(250)
  await evalJs(`(() => { const b = document.querySelector('[data-testid=hw-add]'); b && b.click(); return !!b })()`)
  await sleep(500)
  check('homework row added', await evalJs(`document.querySelectorAll('[data-testid=hw-row]').length >= 1`) === true)
  const hwDone = await evalJs(`(() => { const b = document.querySelector('[data-testid=hw-row] .hw-check'); b && b.click(); return !!b })()`)
  await sleep(400)
  check('homework check-off', hwDone === true && await evalJs(`!!document.querySelector('[data-testid=hw-row].done')`) === true)

  // ---- study time tab ----
  await evalJs(`(() => { const b = document.querySelector('[data-testid=study-tab-log]'); b && b.click(); return !!b })()`)
  await sleep(350)
  await evalJs(`(() => { const b = document.querySelector('[data-testid=log-add]'); b && b.click(); return !!b })()`)
  await sleep(500)
  check('study log row added', await evalJs(`document.querySelectorAll('[data-testid=log-row]').length >= 1`) === true)
  check('study stat + week bars', await evalJs(`document.querySelectorAll('.stat-num').length >= 2 && document.querySelectorAll('.wb-bar').length === 7`) === true)

  // ---- workout view ----
  await evalJs(`(() => { const n = [...document.querySelectorAll('.nav-item')].find(x => /ورزش|Workout/.test(x.textContent)); n && n.click(); return !!n })()`)
  await sleep(500)
  check('workout view opens', await evalJs(`!!document.querySelector('[data-testid=workout-view]')`) === true)
  // pin the plan to TODAY so the today-tab check-off below has a real target
  await setReact('[data-testid=wp-day-form] select', String((new Date().getDay() + 1) % 7), 'change')
  await sleep(200)
  await evalJs(`(() => { const b = document.querySelector('[data-testid=wp-day-add]'); b && b.click(); return !!b })()`)
  await sleep(500)
  check('workout day plan added', await evalJs(`document.querySelectorAll('[data-testid=wp-day]').length >= 1`) === true)
  await evalJs(`document.querySelectorAll('.ex-form input')[0].focus(); 'ok'`)
  await send('Input.insertText', { text: 'شنا سوئدی' })
  await sleep(250)
  await evalJs(`(() => { const b = document.querySelector('[data-testid=wp-ex-add]'); b && b.click(); return !!b })()`)
  await sleep(500)
  check('workout exercise added', await evalJs(`document.querySelectorAll('[data-testid=wp-ex]').length >= 1`) === true)
  await shot('23-workout-desktop.png')
  // today tab: check-off → completion
  await evalJs(`(() => { const b = document.querySelector('[data-testid=wp-tab-today]'); b && b.click(); return !!b })()`)
  await sleep(400)
  const wpCheck = await evalJs(`(() => { const b = document.querySelector('[data-testid=wp-check]'); b && b.click(); return !!b })()`)
  await sleep(500)
  check('workout today check-off + complete', wpCheck === true && await evalJs(`!!document.querySelector('[data-testid=wp-complete]')`) === true)
  // back to the task list: later checks (detail @390 etc.) expect task rows
  await evalJs(`(() => { const n = [...document.querySelectorAll('.nav-item')].find(x => /صندوق ورودی|Inbox/.test(x.textContent)); n && n.click(); return !!n })()`)
  await sleep(500)

  // --- weather chip (network-tolerant: offline shows a placeholder) ---
  const wc = await evalJs(`(() => {
    const b = document.querySelector('[data-testid=weather-chip]')
    if (!b) return JSON.stringify({ has: false })
    return JSON.stringify({ has: true, temp: (b.querySelector('.wc-temp')?.textContent || '').trim() })
  })()`)
  const wj = JSON.parse(wc)
  check('weather chip present', wj.has === true, wc)
  await evalJs(`(() => { const b = document.querySelector('[data-testid=weather-chip]'); b && b.click(); return 'open' })()`)
  await sleep(3000)
  const wp = await evalJs(`(() => {
    const p = document.querySelector('[data-testid=weather-pop]')
    if (!p) return JSON.stringify({ open: false })
    return JSON.stringify({
      open: true,
      temp: (p.querySelector('.wp-temp')?.textContent || '').trim(),
      cond: (p.querySelector('.wp-cond')?.textContent || '').trim(),
      place: (p.querySelector('.wp-place b')?.textContent || '').trim()
    })
  })()`)
  const wpj = JSON.parse(wp)
  check('weather popover opens', wpj.open === true, wp)
  check('weather data or offline placeholder', !!wpj.open && (!wpj.temp || /[0-9۰-۹]/.test(wpj.temp)), wp)
  await evalJs(`(() => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }); window.dispatchEvent(e); return 'esc' })()`)
  await sleep(300)

  // --- mobile viewport ---
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  })
  await sleep(700)
  const mob = await evalJs(`JSON.stringify({
    hOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
    navBtn: !!document.querySelector('.nav-btn, .menu-btn, [class*=nav-toggle], [class*=hamburger]'),
    searchVisible: !!document.getElementById('search-input'),
    w: window.innerWidth
  })`)
  const mb = JSON.parse(mob)
  check('no horizontal overflow @390px', mb.hOverflow, 'w=' + mb.w)

  // scroll sanity: the view is the only scroller (document-level scroll is
  // exactly the "broken scroll on Android" symptom), and it actually moves
  // when there is content to scroll.
  const sc = await evalJs(`(() => {
    const v = document.querySelector('.view')
    if (!v) return JSON.stringify({ none: true })
    const scrollable = v.scrollHeight - v.clientHeight > 4
    const before = v.scrollTop
    v.scrollTop = 480
    const moved = v.scrollTop > before
    const docScrollable = document.documentElement.scrollHeight - document.documentElement.clientHeight > 2
    v.scrollTop = before
    return JSON.stringify({ scrollable, moved, docScrollable })
  })()`)
  const scj = JSON.parse(sc)
  check(
    'view scrolls, document does not @390',
    scj.docScrollable === false && (scj.scrollable ? scj.moved === true : true),
    sc
  )
  check('layout viewport is 390', mb.w === 390, String(mb.w))

  const fabM = await evalJs(`(() => { const f = document.querySelector('.fab'); return f ? f.getBoundingClientRect().width : -1 })()`)
  check('fab visible @390', fabM > 40, String(fabM))
  console.log('MOBILE_FILE:', await shot('14-mobile-390.png'))

  // topbar wraps: search gets its own second row, lang toggle hidden (Settings keeps it)
  const tb = await evalJs(`(() => {
    const sb = document.querySelector('.searchbox'); const bar = document.querySelector('.topbar')
    const lg = document.querySelector('.lang-btn')
    if (!sb || !bar) return JSON.stringify({ err: true })
    const s = sb.getBoundingClientRect(); const t = bar.getBoundingClientRect()
    return JSON.stringify({
      wrapped: s.width > 250 && s.top > t.top + 18,
      langHidden: lg ? getComputedStyle(lg).display === 'none' : false,
      sw: Math.round(s.width)
    })
  })()`)
  const tbj = JSON.parse(tb)
  check('topbar search on its own row @390', !!tbj.wrapped, 'w=' + tbj.sw)
  check('lang button hidden @390', !!tbj.langHidden)

  // detail opens full-screen
  await evalJs(`(() => {
    const rows = [...document.querySelectorAll('.task-row')]
    const hit = rows.find(r => /calendar check/.test(r.textContent)) || rows[0]
    if (hit) hit.click(); return !!hit
  })()`)
  await sleep(700)
  const det = await evalJs(`(() => {
    const d = document.querySelector('.detail')
    if (!d) return JSON.stringify({ none: true })
    const r = d.getBoundingClientRect()
    return JSON.stringify({ w: Math.round(r.width), x: Math.round(r.left) })
  })()`)
  const dj = JSON.parse(det)
  check('detail full-width @390', dj.w === 390 && dj.x === 0, JSON.stringify(dj))
  console.log('DETAIL_MOBILE_FILE:', await shot('16-detail-mobile.png'))
  await evalJs(`(() => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }); window.dispatchEvent(e); return 'esc' })()`)
  await sleep(400)

  // settings modal becomes a bottom sheet
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.topbar-actions button')].find(x => /تنظیمات|Settings/i.test(x.title || ''))
    b && b.click(); return b ? 'ok' : 'no-gear'
  })()`)
  await sleep(600)
  const sheet = await evalJs(`(() => {
    const m = document.querySelector('.modal')
    if (!m) return JSON.stringify({ none: true })
    const r = m.getBoundingClientRect()
    return JSON.stringify({ w: Math.round(r.width), bottomGap: Math.round(window.innerHeight - r.bottom) })
  })()`)
  const sh = JSON.parse(sheet)
  check('settings bottom-sheet @390', sh.w === 390 && sh.bottomGap >= -2 && sh.bottomGap < 44, JSON.stringify(sh))
  const alarmSecSeen = await evalJs(
    `[...document.querySelectorAll('.settings-section h3')].some(h => /زنگ و اعلان|Alarms/.test(h.textContent))`
  )
  check('alarm diagnostics section hidden on web', !alarmSecSeen, String(alarmSecSeen))

  const ap = await evalJs(`(() => {
    const sec = [...document.querySelectorAll('.settings-section h3')].some(h => /ظاهر|Appearance/.test(h.textContent));
    return { sec, sw: document.querySelectorAll('.accent-swatch').length };
  })()`)
  check('appearance section + 6 accent swatches', ap.sec && ap.sw >= 6, JSON.stringify(ap))
  /* ---------------------------------------------------------------
   * US4 — brand themes (T034 matrix, T035 static audit, variable layer)
   * The picker is the feature; a swatch that only changes the swatch is
   * not the feature, so each brand is asserted on the tokens the whole
   * app reads.
   * --------------------------------------------------------------- */

  /* T035 — colour belongs to the theme modules, not to components. */
  {
    const bad = []
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, ent.name)
        if (ent.isDirectory()) walk(fp)
        else if (ent.name.endsWith('.tsx')) {
          fs.readFileSync(fp, 'utf8').split(/\r?\n/).forEach((ln, i) => {
            if (/(#[0-9a-f]{3,8}\b)|\brgba?\(|\bhsla?\(/i.test(ln)) bad.push(`${ent.name}:${i + 1}`)
          })
        }
      }
    }
    walk(path.join(__dirname, '..', 'src'))
    check('T035 no hardcoded colour outside the theme modules', bad.length === 0, bad.slice(0, 6).join(', '))
  }

  /* T034 — every brand paints its own tokens. */
  const SKINS = ['indigo', 'graphite', 'sunset', 'forest', 'ocean', 'rose']
  const skinAccents = []
  for (const id of SKINS) {
    const r = await evalJs(`(() => {
      const b = document.querySelector('[data-testid="skin-${id}"]');
      if (!b) return JSON.stringify({ missing: true });
      b.click();
      const e = document.documentElement;
      const st = document.getElementById('anjam-theme-tokens');
      const css = (st && st.textContent) || '';
      return JSON.stringify({
        brand: e.dataset.brand,
        accent: getComputedStyle(e).getPropertyValue('--accent').trim(),
        bg: getComputedStyle(e).getPropertyValue('--bg').trim(),
        inCss: css.indexOf("data-brand='" + "${id}" + "'") >= 0
      })
    })()`)
    const sk = JSON.parse(r)
    skinAccents.push(sk.accent || '')
    check(`T034 ${id} brand applied`, sk.brand === id && !!sk.accent && !!sk.bg && sk.inCss, r)
  }
  check('T034 brands do not share one accent',
    new Set(skinAccents.filter(Boolean)).size >= 4,
    `${new Set(skinAccents.filter(Boolean)).size}/${SKINS.length}`)

  /* The variable layer is the same pseudo-theme with a weather accent. */
  await evalJs(`(() => {
    const w = { temp: 12, hi: 15, lo: 9, code: 0, wind: 10, place: 'Tehran',
                at: Date.now(), loc: { lat: 35.7, lon: 51.4 }, night: null };
    localStorage.setItem('anjam.weather', JSON.stringify({ w, loc: { lat: 35.7, lon: 51.4, place: 'Tehran' } }));
    const b = document.querySelector('[data-testid="skin-variable"]');
    if (b) b.click();
    return 1
  })()`)
  await sleep(400)
  const varSt = await evalJs(`(() => {
    const e = document.documentElement;
    const st = document.getElementById('anjam-weather-theme');
    return JSON.stringify({
      variable: e.dataset.variable || '',
      css: (st && st.textContent) || '',
      accent: getComputedStyle(e).getPropertyValue('--accent').trim(),
      // the override must OUTRANK the brand block, not merely sit beside it
      important: !!(st && /!important/.test(st.textContent)),
      brand: e.dataset.brand || ''
    })
  })()`)
  {
    const v = JSON.parse(varSt)
    const installs = v.css.indexOf('--accent:') >= 0
    check('T034 variable (weather) layer applies',
      v.variable === 'on' && installs && !!v.accent && v.important,
      JSON.stringify({ variable: v.variable, installs, accent: v.accent, brand: v.brand }))
  }
  // back to a static brand so the rest of the run is deterministic
  await evalJs(`(() => { const b = document.querySelector('[data-testid="skin-indigo"]'); if (b) b.click(); return 1 })()`)
  await sleep(300)

  const motionOk = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('.settings-section .seg-btn')];
    const off = btns.find(b => /^(غیرفعال|Off)$/.test(b.textContent.trim()));
    if (!off) return 'no-off-btn';
    off.click();
    const gone = document.documentElement.dataset.motion === 'off';
    const on = btns.find(b => /^(فعال|On)$/.test(b.textContent.trim()));
    on && on.click();
    return gone && document.documentElement.dataset.motion !== 'off';
  })()`)
  check('motion toggle works', motionOk === true, String(motionOk))

  const fsOk = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('.settings-section .seg-btn')];
    const lg = btns.find(b => /^(بزرگ|Large)$/.test(b.textContent.trim()));
    if (!lg) return 'no-lg-btn';
    lg.click();
    const set = document.documentElement.dataset.fs === 'lg';
    const md = btns.find(b => /^(متوسط|Medium)$/.test(b.textContent.trim()));
    md && md.click();
    return set && document.documentElement.dataset.fs !== 'lg';
  })()`)
  check('font-size toggle works', fsOk === true, String(fsOk))

  const accOk = await evalJs(`(() => {
    const sw = [...document.querySelectorAll('.accent-swatch')];
    if (sw.length < 6) return 'few:' + sw.length;
    const before = document.documentElement.style.getPropertyValue('--accent');
    sw[4].click();
    const after = document.documentElement.style.getPropertyValue('--accent');
    if (before) document.documentElement.style.setProperty('--accent', before);
    else document.documentElement.style.removeProperty('--accent');
    localStorage.removeItem('anjam.accent');
    return !!after && after !== before;
  })()`)
  check('accent swatch applies', accOk === true, String(accOk))
  console.log('SHEET_MOBILE_FILE:', await shot('17-settings-sheet.png'))
  await evalJs(`(() => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }); window.dispatchEvent(e); return 'esc' })()`)
  await sleep(300)

  // landscape
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true })
  await sleep(600)
  const land = await evalJs(`JSON.stringify({ ok: document.documentElement.scrollWidth <= window.innerWidth + 2, w: window.innerWidth })`)
  const ld = JSON.parse(land)
  check('landscape 844x390 no overflow', ld.ok, 'w=' + ld.w)
  console.log('LANDSCAPE_FILE:', await shot('18-landscape.png'))

  // narrow 360
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true })
  await sleep(600)
  const nar = await evalJs(`JSON.stringify({ ok: document.documentElement.scrollWidth <= window.innerWidth + 2, w: window.innerWidth })`)
  const nr = JSON.parse(nar)
  check('narrow 360 no overflow', nr.ok, 'w=' + nr.w)
  console.log('NARROW_FILE:', await shot('19-mobile-360.png'))
  await send('Emulation.clearDeviceMetricsOverride')

  /* ---------------------------------------------------------------
   * US1 / FR-01 — the FAB must produce a usable composer on EVERY view.
   *
   * The original defect: on non-task views there is no #quickadd-input,
   * so focus() and scrollIntoView() silently did nothing and the button
   * was dead. This walks every nav item and clicks the FAB for real.
   * --------------------------------------------------------------- */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await sleep(500)
  {
    const names = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll('.nav-item')].map(n => n.textContent.trim()))`))
    const dead = []
    const opened = []
    for (const name of names) {
      await evalJs(`(() => { const n = [...document.querySelectorAll('.nav-item')].find(x => x.textContent.trim() === ${JSON.stringify(name)}); if (n) n.click(); return 1 })()`)
      await sleep(350)
      const hasFab = await evalJs(`(() => { const f = document.querySelector('.fab'); if (!f) return false; const r = f.getBoundingClientRect(); return r.width > 0 && r.height > 0 })()`)
      if (!hasFab) continue
      await evalJs(`(() => { document.querySelector('.fab').click(); return 1 })()`)
      await sleep(400)
      const after = JSON.parse(await evalJs(`JSON.stringify({ modal: !!document.querySelector('[data-testid=quickadd-modal]'), focused: document.activeElement && document.activeElement.id === 'quickadd-input' })`))
      if (after.modal || after.focused) opened.push(name)
      else dead.push(name)
      await evalJs(`(() => { const b = document.querySelector('[data-testid=quickadd-modal] .modal-head .icon-btn'); if (b) b.click(); return 1 })()`)
      await sleep(200)
    }
    check('FAB opens a composer on every view', dead.length === 0 && opened.length > 0, `ok=${opened.length} dead=${dead.join(',')}`)
  }
  await send('Emulation.clearDeviceMetricsOverride')
  await sleep(500)

  /* ---------------------------------------------------------------
   * US2 / FR-04-06 — the 21:00-08:00 night advisory.
   *
   * Five properties, each its own check, because "it showed a popup"
   * is not the feature: the RIGHT popup, ONLY inside the window,
   * ONLY when the night is worth mentioning, and NOTHING when the
   * weather or the network is unavailable (FR-19), at most once an
   * hour (FR-04). Clocks are built as local Date objects so the
   * check holds in any timezone.
   * --------------------------------------------------------------- */
  const seedNight = (night) => `(() => {
    const w = { temp: 12, hi: 15, lo: 9, code: 95, wind: 40, place: 'Tehran', at: Date.now(), loc: { lat: 35.7, lon: 51.4 }, night: ${JSON.stringify(night)} };
    localStorage.setItem('anjam.weather', JSON.stringify({ w, loc: { lat: 35.7, lon: 51.4, place: 'Tehran' } }));
    localStorage.removeItem('anjam.advisory.lastRun');
    localStorage.removeItem('anjam.advisory.lastKey');
    return 1 })()`
  const runAt = (h, m) => `window.__anjamAdvisory.run(new Date(2026, 8, 25, ${h}, ${m || 0}).getTime())`
  const advisoryVisible = async () => {
    await sleep(450)
    return JSON.parse(await evalJs(`JSON.stringify({ shown: !!document.querySelector('[data-testid=advisory]'), sev: document.querySelector('[data-testid=advisory]')?.dataset.sev || null, text: document.querySelector('[data-testid=advisory-text]')?.textContent || '' })`))
  }

  const STORM = { tempMin: 9, tempMax: 15, precipProb: 95, precipMm: 8, windMax: 70, humidity: 96, uvIndex: 0, isDay: false, nightCode: 95 }
  const CALM = { tempMin: 16, tempMax: 21, precipProb: 0, precipMm: 0, windMax: 8, humidity: 55, uvIndex: 0, isDay: false, nightCode: 0 }

  await evalJs(seedNight(STORM))
  await evalJs(runAt(21, 5))
  const inWindow = await advisoryVisible()
  check('advisory speaks at 21:05 with a storm', inWindow.shown === true, JSON.stringify(inWindow))
  check('advisory marks the storm as top severity', inWindow.sev === '1', inWindow.sev)
  check('advisory carries prose, not a key', inWindow.text.length > 6 && !/^adv[A-Z]/.test(inWindow.text), inWindow.text)
  console.log('ADVISORY_FILE:', await shot('20-advisory.png'))

  await evalJs(`(() => { window.__anjamAdvisory.hide(); localStorage.removeItem('anjam.advisory.lastRun'); return 1 })()`)
  await evalJs(runAt(12, 0))
  const noon = await advisoryVisible()
  check('advisory silent at 12:00', noon.shown === false, JSON.stringify(noon))

  await evalJs(`(() => { window.__anjamAdvisory.hide(); localStorage.removeItem('anjam.advisory.lastRun'); return 1 })()`)
  await evalJs(runAt(20, 55))
  const before = await advisoryVisible()
  check('advisory silent at 20:55', before.shown === false, JSON.stringify(before))

  await evalJs(seedNight(CALM))
  await evalJs(runAt(22, 0))
  const calm = await advisoryVisible()
  check('advisory silent on a calm night', calm.shown === false, JSON.stringify(calm))

  await evalJs(`(() => { localStorage.removeItem('anjam.weather'); localStorage.removeItem('anjam.advisory.lastRun'); localStorage.removeItem('anjam.advisory.lastKey'); window.__anjamAdvisory.hide(); return 1 })()`)
  await evalJs(runAt(21, 30))
  const noWeather = await advisoryVisible()
  check('advisory silent without weather data', noWeather.shown === false, JSON.stringify(noWeather))

  await evalJs(seedNight(STORM))
  await evalJs(`(() => { localStorage.removeItem('anjam.advisory.lastRun'); window.__anjamAdvisory.hide(); return 1 })()`)
  await evalJs(runAt(21, 10))
  const first = await advisoryVisible()
  await evalJs(`(() => { window.__anjamAdvisory.hide(); return 1 })()`)
  await evalJs(runAt(21, 40))
  const second = await advisoryVisible()
  check('advisory throttles to once an hour', first.shown === true && second.shown === false, JSON.stringify({ first: first.shown, second: second.shown }))
  await evalJs(`(() => { window.__anjamAdvisory.hide(); localStorage.removeItem('anjam.advisory.lastRun'); return 1 })()`)

  /* ---------------------------------------------------------------
   * US6 / FR-17 / FR-19 — the 21:00 school-closure alert.
   *
   * The interesting half of this feature is what must NOT happen: an empty
   * feed, a blocked network and a different province all have to produce
   * silence. A 21:00 popup cannot be dismissed as a nuisance and cannot be
   * an error message, so each of those is asserted on its own.
   * --------------------------------------------------------------- */
  await evalJs(`(() => {
    window.__notifLog = []
    window.Notification = function (title, opts) {
      window.__notifLog.push({ title, body: opts && opts.body })
      this.close = () => {}
    }
    Object.defineProperty(window.Notification, 'permission', { value: 'granted', configurable: true })
    return 1
  })()`)
  const newsReset = (region) => `(() => {
    localStorage.setItem('anjam.news.region', ${JSON.stringify(region)})
    localStorage.removeItem('anjam.news.lastCheck')
    localStorage.removeItem('anjam.news.lastIds')
    window.__anjamNews.hide()
    window.__notifLog = []
    window.fetch = window.__origFetch || window.fetch
    return 1 })()`
  // `isFresh` drops anything dated after the clock we hand the engine, so
  // the fixture must be aged against THAT clock, not against Date.now().
  // Pegging it to now() only worked while the machine happened to sit on the
  // fixture's date — which is exactly why this test turned red at midnight.
  const newsItem = (title, atMs) => [{
    title,
    link: 'https://example.com/n1',
    pubDate: new Date(atMs - 3600e3).toISOString(),
    source: 'bing.com',
  }]
  const newsState = async () => {
    await sleep(500)
    return JSON.parse(await evalJs(`JSON.stringify({
      shown: !!document.querySelector('[data-testid=news-alert]'),
      text: (document.querySelector('[data-testid=news-alert-text]')?.textContent || '').trim(),
      link: document.querySelector('[data-testid=news-link]')?.getAttribute('href') || '',
      source: (document.querySelector('[data-testid=news-source]')?.textContent || '').trim(),
      notifs: window.__notifLog || [],
    })`))
  }
  await evalJs(`(() => { window.__origFetch = window.fetch; return 1 })()`)

  /* T047 — a real, in-region, fresh closure at 21:00 must speak */
  await evalJs(newsReset('هشتگرد'))
  await evalJs(`window.__anjamNews.run(new Date(2026, 8, 25, 21, 0).getTime(), ${JSON.stringify(newsItem('تعطیلی مدارس البرز در روز شنبه', new Date(2026, 8, 25, 21, 0).getTime()))}).then(() => 1)`)
  const n47 = await newsState()
  check('news: 21:00 in-region closure pops up', n47.shown === true, JSON.stringify(n47))
  check('news: popup shows the headline, not a key', n47.text.length > 8 && !/^news/.test(n47.text), n47.text)
  check('news: popup links out to the publisher', /^https?:\/\//.test(n47.link), n47.link)
  check('news: popup names its source', n47.source.length > 0, n47.source)
  check('news: a native notification is raised too', n47.notifs.length >= 1, JSON.stringify(n47.notifs))
  console.log('NEWS_FILE:', await shot('21-news-alert.png'))

  /* acknowledge once, and the same headline must not nag again */
  await evalJs(`(() => { const b = document.querySelector('[data-testid=news-ack]'); if (b) b.click(); return 1 })()`)
  await sleep(400)
  await evalJs(`window.__anjamNews.run(new Date(2026, 8, 25, 21, 30).getTime(), ${JSON.stringify(newsItem('تعطیلی مدارس البرز در روز شنبه', new Date(2026, 8, 25, 21, 30).getTime()))}).then(() => 1)`)
  const nAck = await newsState()
  check('news: an acknowledged headline stays silent', nAck.shown === false, JSON.stringify(nAck))

  /* T048 — an empty feed is silence, not an error */
  await evalJs(newsReset('هشتگرد'))
  await evalJs(`window.__anjamNews.run(new Date(2026, 8, 25, 21, 0).getTime(), []).then(() => 1)`)
  const nEmpty = await newsState()
  check('news: an empty feed is silent', nEmpty.shown === false && nEmpty.notifs.length === 0, JSON.stringify(nEmpty))

  /* T048 — a dead network is silence, not an error */
  await evalJs(newsReset('هشتگرد'))
  await evalJs(`(() => { window.fetch = () => Promise.reject(new Error('blocked')); return 1 })()`)
  await evalJs(`window.__anjamNews.run(new Date(2026, 8, 25, 21, 0).getTime()).then(() => 1)`)
  const nDead = await newsState()
  check('news: a blocked network is silent', nDead.shown === false && nDead.notifs.length === 0, JSON.stringify(nDead))
  await evalJs(`(() => { window.fetch = window.__origFetch || window.fetch; return 1 })()`)

  /* T049 — an Alborz headline must not alert a Tehran phone */
  await evalJs(newsReset('تهران'))
  await evalJs(`window.__anjamNews.run(new Date(2026, 8, 25, 21, 0).getTime(), ${JSON.stringify(newsItem('تعطیلی مدارس البرز در روز شنبه', new Date(2026, 8, 25, 21, 0).getTime()))}).then(() => 1)`)
  const nWrong = await newsState()
  check('news: region mismatch stays silent', nWrong.shown === false && nWrong.notifs.length === 0, JSON.stringify(nWrong))

  /* the check must be impossible outside the night window */
  await evalJs(newsReset('هشتگرد'))
  await evalJs(`window.__anjamNews.run(new Date(2026, 8, 25, 12, 0).getTime(), ${JSON.stringify(newsItem('تعطیلی مدارس البرز در روز شنبه', new Date(2026, 8, 25, 12, 0).getTime()))}).then(() => 1)`)
  const nNoon = await newsState()
  check('news: silent at noon whatever the feed says', nNoon.shown === false, JSON.stringify(nNoon))

  await evalJs(newsReset(''))
  await evalJs(`(() => { window.fetch = window.__origFetch || window.fetch; return 1 })()`)
  /* ---------------------------------------------------------------
   * US4 — T033 (logo scale, 6 placements) and the T034 persistence half.
   * The reload goes last on purpose: after it there is no test left that
   * depends on where the app was in the DOM.
   * --------------------------------------------------------------- */

  /* T033 — the box as rendered, sidebar at desktop width. */
  await send('Emulation.clearDeviceMetricsOverride')
  await sleep(500)
  const logoDesk = await evalJs(`(() => {
    const el = document.querySelector('.sidebar .brand-mark.is-logo');
    if (!el) return JSON.stringify({ missing: true });
    const r = el.getBoundingClientRect();
    return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) })
  })()`)
  {
    const l = JSON.parse(logoDesk)
    check('T033 sidebar logo >= 48px as rendered', !l.missing && Math.max(l.w, l.h) >= 48, logoDesk)
  }

  /* T033 — the placements that are not mounted during the run (auth, setup,
   * boot splash, alarm ring) are asserted on the rule that feeds them,
   * rather than by tearing the app down to reach each screen. */
  {
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8')
    const rule = (sel) => {
      const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'))
      if (!m) return null
      const w = (m[1].match(/\bwidth:\s*(\d+(?:\.\d+)?)px/) || [])[1]
      const h = (m[1].match(/\bheight:\s*(\d+(?:\.\d+)?)px/) || [])[1]
      return w && h ? Math.max(Number(w), Number(h)) : null
    }
    const need = [
      ['.brand.mini .brand-mark.is-logo', 'sidebar / drawer'],
      ['.auth-card .brand .brand-mark.is-logo', 'auth + setup'],
      ['.boot-mark', 'boot splash'],
      ['.alarm-logo', 'alarm ring'],
    ]
    for (const [sel, where] of need) {
      const px = rule(sel)
      check(`T033 ${where} logo rule >= 48px`, px !== null && px >= 48, `${sel} = ${px}`)
    }
  }

  /* T034 — "chosen" means it is still your theme after a restart. */
  // The news block may have left a different view on screen, so open the
  // picker again first: a click that never landed is not evidence about
  // persistence either way.
  await evalJs(`(() => {
    if (!document.querySelector('[data-testid="skin-ocean"]')) {
      const b = [...document.querySelectorAll('.topbar-actions button')]
        .find(x => /تنظیمات|Settings/i.test(x.title || ''))
      if (b) b.click()
    }
    return 1
  })()`)
  await sleep(800)
  await evalJs(`(() => { const b = document.querySelector('[data-testid="skin-ocean"]'); if (b) b.click(); return !!b })()`)
  await sleep(400)
  const chosen = await evalJs(`document.documentElement.dataset.brand || ''`)
  check('T034 ocean brand picked before reload', chosen === 'ocean', chosen)
  await sleep(300)
  await send('Page.reload', {}, 90000)
  await sleep(2500)
  const afterReload = await evalJs(`(() => {
    const e = document.documentElement;
    return JSON.stringify({
      brand: e.dataset.brand || '',
      accent: getComputedStyle(e).getPropertyValue('--accent').trim(),
      phase: e.dataset.phase || ''
    })
  })()`)
  {
    const a = JSON.parse(afterReload)
    check('T034 brand survives a reload', a.brand === 'ocean' && !!a.accent, afterReload)
  }
  /* ---------------------------------------------------------------
   * US7 — T056 (collapsible card, 4 analyses, BYOK block), T057 (free-model
   * list), T058 (key never rendered back) and the T063 determinism half on
   * the real UI.
   *
   * FR-19 is the assertion that matters: with no key configured the card
   * must still produce an answer, labelled as local.
   * --------------------------------------------------------------- */
  const panel0 = await evalJs(`(() => {
    const p = document.querySelector('[data-testid="ai-panel"]')
    if (!p) return JSON.stringify({ missing: true })
    return JSON.stringify({ open: p.dataset.open, head: !!document.querySelector('[data-testid="ai-header"]') })
  })()`)
  const p0 = JSON.parse(panel0)
  check('T056 AI card renders collapsed', p0.head === true && p0.open === 'false', panel0)

  await evalJs(`document.querySelector('[data-testid="ai-header"]').click()`)
  await sleep(400)
  const tabs0 = await evalJs(`(() => {
    const t = [...document.querySelectorAll('[data-testid="ai-tabs"] .ai-tab')]
    return JSON.stringify({ n: t.length, labels: t.map(x => (x.textContent || '').trim()) })
  })()`)
  const tj = JSON.parse(tabs0)
  check('T056 exposes exactly four analyses', tj.n === 4, tabs0)
  check('T056 tabs are labelled in Persian', tj.labels.join(' ').length > 4, tj.labels.join(' | '))

  const readResult = `(() => {
    const r = document.querySelector('[data-testid="ai-result"]')
    const lines = [...document.querySelectorAll('[data-testid="ai-lines"] .ai-line')].map(x => (x.textContent || '').trim())
    const note = (document.querySelector('[data-testid="ai-source"]') || {}).textContent || ''
    return JSON.stringify({ source: r ? r.dataset.source : '', note: note.trim(), lines })
  })()`
  const r0 = JSON.parse(await evalJs(readResult))
  check('T056 answers with no key configured', r0.source === 'local' && r0.lines.length > 0, JSON.stringify(r0).slice(0, 240))
  check('FR-19 the answer says it was computed locally', /محلی|local/i.test(r0.note), r0.note)
  const chat0 = await evalJs(`JSON.stringify(!!document.querySelector('.ai-input, [data-testid="ai-chat"]'))`)
  check('T056 no chat input exists', JSON.parse(chat0) === false, chat0)

  // Determinism on the real UI: leaving a tab and coming back must reproduce
  // the same lines, because the same data can only have one answer.
  await evalJs(`document.querySelector('[data-testid="ai-tab-timetable"]').click()`)
  await sleep(400)
  await evalJs(`document.querySelector('[data-testid="ai-tab-day"]').click()`)
  await sleep(400)
  const r1 = JSON.parse(await evalJs(readResult))
  check('T063 rerunning an analysis reproduces it exactly',
    JSON.stringify(r1.lines) === JSON.stringify(r0.lines) && r1.source === r0.source,
    JSON.stringify(r0.lines).slice(0, 160) + ' vs ' + JSON.stringify(r1.lines).slice(0, 160))

  // FR-19 on the failure path: an empty key means no request is even made.
  const reqProbe = await evalJs(`(() => {
    window.__anjamReqs = []
    const f = window.fetch
    window.fetch = function (...a) { window.__anjamReqs.push(String(a[0])); return f.apply(this, a) }
    const b = document.querySelector('[data-testid="ai-run"]')
    if (b) b.click()
    return b ? 'clicked' : 'no-run-button'
  })()`)
  await sleep(900)
  const reqs = JSON.parse(await evalJs(`JSON.stringify(window.__anjamReqs || [])`))
  check('FR-19 no OpenRouter request without a key',
    reqs.filter(u => /chat\/completions/.test(u)).length === 0,
    String(reqProbe) + ' -> ' + reqs.join(', '))

  // --- the BYOK block in Settings ---
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.topbar-actions button')].find(x => /تنظیمات|Settings/i.test(x.title || ''))
    b && b.click(); return b ? 'ok' : 'no-gear'
  })()`)
  await sleep(700)
  const aiSec = await evalJs(`(() => {
    const s = document.querySelector('[data-testid="ai-settings"]')
    if (!s) return JSON.stringify({ missing: true })
    const sel = s.querySelector('[data-testid="ai-model-select"]')
    const opts = sel ? [...sel.options].map(o => o.value).filter(Boolean) : []
    const privacy = (s.querySelector('[data-testid="ai-privacy"]') || {}).textContent || ''
    const input = s.querySelector('[data-testid="ai-key-input"]')
    return JSON.stringify({
      hasInput: !!input,
      inputType: input ? input.type : '',
      modelOptions: opts.length,
      hasEmptyHint: !!s.querySelector('[data-testid="ai-model-empty"]'),
      hasRefresh: !!s.querySelector('[data-testid="ai-model-refresh"]'),
      privacy: privacy.trim(),
      langBtns: s.querySelectorAll('[data-testid="ai-lang-fa"], [data-testid="ai-lang-en"]').length
    })
  })()`)
  const ai = JSON.parse(aiSec)
  check('T056 BYOK block has a key field', ai.hasInput === true && ai.inputType === 'password', aiSec)
  check('T057 model picker offers free models or says why not', ai.modelOptions >= 1 || ai.hasEmptyHint, aiSec)
  check('T057 model list can be refreshed', ai.hasRefresh === true, aiSec)
  check('acceptance 4 privacy sentence is shown', /no notes|بدون یادداشت/i.test(ai.privacy), ai.privacy.slice(0, 80))
  check('T056 answer language is choosable', ai.langBtns === 2, aiSec)

  // T058 — the key is stored, but never rendered back as text anywhere.
  const keyField = await evalJs(`(() => {
    const i = document.querySelector('[data-testid="ai-key-input"]')
    if (!i) return JSON.stringify({ missing: true })
    // React tracks the input's value through a prototype setter, so assigning
    // the value property directly is invisible to it: the component state
    // stays empty and "save" would clear the key instead of storing it. Go
    // through the native setter (the same trick React itself uses).
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(i, 'sk-or-v1-probe-not-a-real-key')
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return JSON.stringify({ len: i.value.length })
  })()`)
  await sleep(200)
  await evalJs(`document.querySelector('[data-testid="ai-key-save"]').click()`)
  await sleep(300)
  const keyShown = await evalJs(`JSON.stringify({
    text: document.body.innerText.includes('sk-or-v1-probe-not-a-real-key'),
    stored: (localStorage.getItem('anjam.ai.key') || '').slice(0, 8),
    msg: (document.querySelector('[data-testid="ai-msg"]') || {}).textContent || ''
  })`)
  const ks = JSON.parse(keyShown)
  check('T058 the key is persisted locally', ks.stored === 'sk-or-v1', keyShown)
  check('T058 the key is never rendered as text', ks.text === false, keyShown)
  check('T058 saving the key confirms it', /ذخیره|saved/i.test(ks.msg), ks.msg)

  // clearing must remove it entirely, not merely empty the field
  await evalJs(`document.querySelector('[data-testid="ai-key-clear"]').click()`)
  await sleep(250)
  const cleared = await evalJs(`JSON.stringify({ stored: localStorage.getItem('anjam.ai.key'), field: document.querySelector('[data-testid="ai-key-input"]').value })`)
  check('T058 clearing removes the key from storage', JSON.parse(cleared).stored === null, cleared)

  // the answer language is a real preference, not a dead control
  await evalJs(`document.querySelector('[data-testid="ai-lang-en"]').click()`)
  await sleep(250)
  const langPref = await evalJs(`localStorage.getItem('anjam.ai.lang')`)
  check('T056 answer language persists', String(langPref).replace(/"/g, '') === 'en', String(langPref))
  await evalJs(`document.querySelector('[data-testid="ai-lang-fa"]').click()`)
  await sleep(200)

  // close settings again so nothing after this depends on the modal
  await evalJs(`(() => { const b = document.querySelector('.modal .close, .modal [aria-label*="بست"], .modal [aria-label*="Close"]'); if (b) b.click(); return 'closed' })()`)
  await sleep(500)
  // --- no unexpected console errors (offline noise excluded) ---
  const noise = /Failed to fetch|NetworkError|net::ERR|Load failed|Failed to load resource|AbortError|navigator\.vibrate|supabase|open-meteo|geolocation|Geolocation|weather|favicon/i
  const realErrs = consoleErrs.filter((e) => !noise.test(e))
  check('no console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | ').slice(0, 300))

  const failed = results.filter((r) => !r.ok)

  console.log('UX_QA_SUMMARY:', JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }))
  console.log(failed.length === 0 ? 'UX_QA_ALL_PASS' : 'UX_QA_HAS_FAILURES')

  ws.close()
  process.exit(failed.length === 0 ? 0 : 2)
}

main().catch((e) => { console.error('UX_QA_ERR', e.message || e); process.exit(1) })
