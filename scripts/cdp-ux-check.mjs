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
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
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
  await evalJs(`(() => {
    const days = [...document.querySelectorAll('.cal-day:not(.faded)')]
    days[25] && days[25].click(); return 'picked'
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
  // type 17:30 with trusted key events
  await evalJs(`(() => { const el = document.querySelector('[data-testid=time-input]'); if (el) el.focus(); return !!el })()`)
  for (const ch of ['1', '7', '3', '0']) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: 'Digit' + ch, text: ch, windowsVirtualKeyCode: 48 + Number(ch) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Digit' + ch, windowsVirtualKeyCode: 48 + Number(ch) })
    await sleep(80)
  }
  await sleep(500)
  const timeVal = await evalJs(`document.querySelector('[data-testid=time-input]')?.value || ''`)
  check('time typed 17:30', timeVal === '17:30', timeVal)
  await sleep(300)
  const bellDom = await evalJs(`JSON.stringify({
    bell: !!document.querySelector('[data-testid=bell-btn]'),
    text: document.querySelector('[data-testid=bell-btn]')?.textContent.trim() || ''
  })`)
  const bd = JSON.parse(bellDom)
  check('bell shows rings-at', bd.bell && /زنگ/.test(bd.text) && /17/.test(toAscii(bd.text)), bd.text)
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

  const motionOk = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('.settings-section .seg-btn')];
    const off = btns.find(b => /^(کم|Minimal)$/.test(b.textContent.trim()));
    if (!off) return 'no-off-btn';
    off.click();
    const gone = document.documentElement.dataset.motion === 'off';
    const on = btns.find(b => /^(نرم|Smooth)$/.test(b.textContent.trim()));
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

  const failed = results.filter((r) => !r.ok)
  console.log('UX_QA_SUMMARY:', JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }))
  console.log(failed.length === 0 ? 'UX_QA_ALL_PASS' : 'UX_QA_HAS_FAILURES')

  ws.close()
  process.exit(failed.length === 0 ? 0 : 2)
}

main().catch((e) => { console.error('UX_QA_ERR', e.message || e); process.exit(1) })
