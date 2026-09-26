// Reload the QA tab — CDP's HTTP API has no navigate endpoint, so this goes
// over the websocket. Run: node scripts/qa-reload.mjs [url]
const url = process.argv[2] || 'http://127.0.0.1:4173/'

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const page = list.find((t) => t.type === 'page')
if (!page) throw new Error('no page target')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')) })

const id = 1
ws.send(JSON.stringify({ id, method: 'Page.navigate', params: { url } }))

await new Promise((resolve) => {
  const to = setTimeout(() => resolve('timeout'), 20000)
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id === id) { clearTimeout(to); resolve('ok') }
  }
})

await new Promise((r) => setTimeout(r, 2500))
const list2 = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const p2 = list2.find((t) => t.type === 'page')
console.log('NOW:', p2?.url)
ws.close()
process.exit(0)
