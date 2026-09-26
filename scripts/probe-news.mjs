// Why is the 21:00 closure gate silent? Replays T047 and prints each gate.
// Run: node scripts/probe-news.mjs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
const send = (method, params = {}, ms = 30000) => new Promise((res, rej) => {
  const i = ++id
  const to = setTimeout(() => { pending.delete(i); rej(new Error('CDP_TIMEOUT ' + method)) }, ms)
  pending.set(i, (m) => { clearTimeout(to); res(m) })
  ws.send(JSON.stringify({ id: i, method, params }))
})
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return { ERROR: JSON.stringify(r.result.exceptionDetails).slice(0, 500) }
  return r.result?.result?.value
}

const item = [{
  title: 'تعطیلی مدارس البرز در روز شنبه',
  link: 'https://example.com/n1',
  pubDate: new Date(Date.now() - 3600e3).toISOString(),
  source: 'bing.com',
}]

await evalJs(`(() => {
  localStorage.setItem('anjam.news.region', 'هشتگرد');
  localStorage.removeItem('anjam.news.lastCheck');
  localStorage.removeItem('anjam.news.lastIds');
  window.__anjamNews.hide();
  window.__notifLog = [];
  window.fetch = window.__origFetch || window.fetch;
  return 1
})()`)

const before = await evalJs(`JSON.stringify({
  region: localStorage.getItem('anjam.news.region'),
  lastCheck: localStorage.getItem('anjam.news.lastCheck'),
  lastIds: localStorage.getItem('anjam.news.lastIds'),
  hasRun: !!window.__anjamNews,
  state: window.__anjamNews && window.__anjamNews.state()
})`)
console.log('BEFORE:', before)

await evalJs(`window.__anjamNews.run(new Date(2026, 8, 25, 21, 0).getTime(), ${JSON.stringify(item)}).then(() => 1)`)
await sleep(700)

// Round 2: same gate, but `at` moved forward so the injected item is no
// longer dated "after" the clock we hand the engine — isolates the
// freshness window from the night window.
await evalJs(`(() => {
  localStorage.setItem('anjam.news.region', 'هشتگرد');
  localStorage.removeItem('anjam.news.lastCheck');
  localStorage.removeItem('anjam.news.lastIds');
  window.__anjamNews.hide();
  return 1
})()`)
await evalJs(`window.__anjamNews.run(new Date(2026, 8, 26, 21, 0).getTime(), ${JSON.stringify(item)}).then(() => 1)`)
await sleep(700)
const round2 = await evalJs(`JSON.stringify({
  shown: !!document.querySelector('[data-testid=news-alert]'),
  state: window.__anjamNews && window.__anjamNews.state(),
  notifs: window.__notifLog || []
})`)
console.log('ROUND2 (at=Sep 26 21:00):', round2)

// Round 3: back to Sep 25, but a title that names the region itself.
await evalJs(`(() => {
  localStorage.setItem('anjam.news.region', 'هشتگرد');
  localStorage.removeItem('anjam.news.lastCheck');
  localStorage.removeItem('anjam.news.lastIds');
  window.__anjamNews.hide();
  return 1
})()`)
await evalJs(`window.__anjamNews.run(new Date(2026, 8, 25, 21, 0).getTime(), ${JSON.stringify([{ ...item[0], title: 'تعطیلی مدارس هشتگرد در روز شنبه' }])}).then(() => 1)`)
await sleep(700)
const round3 = await evalJs(`JSON.stringify({
  shown: !!document.querySelector('[data-testid=news-alert]'),
  state: window.__anjamNews && window.__anjamNews.state()
})`)
console.log('ROUND3 (title names هشتگرد):', round3)

const after = await evalJs(`JSON.stringify({
  shown: !!document.querySelector('[data-testid=news-alert]'),
  state: window.__anjamNews && window.__anjamNews.state(),
  notifs: window.__notifLog || [],
  lastCheck: localStorage.getItem('anjam.news.lastCheck'),
  lastIds: localStorage.getItem('anjam.news.lastIds'),
  ack: localStorage.getItem('anjam.news.ack')
})`)
console.log('AFTER :', after)

ws.close()
process.exit(0)
