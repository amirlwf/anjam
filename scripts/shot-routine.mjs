// One-off: seed a rich routine history in the QA profile and screenshot it.
// Run: node scripts/shot-routine.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'release', 'qa')
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
    return r.result?.result?.value
  }
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    const p = path.join(OUT, name)
    fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'))
    return p
  }

  await send('Page.enable')
  await send('Runtime.enable')

  // seed 3 habits with 40 days of scattered logs straight into IndexedDB
  const seeded = await evalJs(`(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('anjam', 2)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const pad = (n) => String(n).padStart(2, '0')
    const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    const now = new Date()
    const created = new Date(now); created.setDate(created.getDate() - 45)
    const defs = [
      { name: 'ورزش', color: '#10b981', miss: [7, 8, 21, 33, 34, 35] },
      { name: 'مطالعه', color: '#f59e0b', miss: [3, 4, 5, 6, 7, 8, 19, 20, 21, 33, 34, 35] },
      { name: 'نوشتن', color: '#8b5cf6', miss: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 19, 20, 21, 27, 33, 34, 35, 40] },
    ]
    const rows = defs.map((d, i) => {
      const logs = []
      for (let k = 1; k <= 44; k++) {
        const dt = new Date(now); dt.setDate(dt.getDate() - k)
        if (!d.miss.includes(k)) logs.push(isoOf(dt))
      }
      return {
        id: crypto.randomUUID(), user_id: '11111111-1111-1111-1111-111111111111',
        name: d.name, color: d.color, logs, sort_order: i + 1,
        created_at: created.toISOString(), updated_at: now.toISOString(), deleted: false,
      }
    })
    await new Promise((res, rej) => {
      const tx = db.transaction('habits', 'readwrite')
      for (const r of rows) tx.objectStore('habits').put(r)
      tx.oncomplete = () => res(true)
      tx.onerror = () => rej(tx.error)
    })
    return rows.length
  })()`)
  console.log('seeded habits:', seeded)

  await send('Page.reload', { ignoreCache: true })
  for (let i = 0; i < 24; i++) {
    await sleep(500)
    if (await evalJs(`!!document.getElementById('quickadd-input')`)) break
  }
  await evalJs(`(() => { const n = [...document.querySelectorAll('.nav-item')].find(x => /روتين|Routine/.test(x.textContent)); n && n.click(); return 'ok' })()`)
  await sleep(900)

  // desktop shot
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(500)
  console.log('DESKTOP:', await shot('20-routine-desktop.png'))

  // mobile shot
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await sleep(600)
  console.log('MOBILE:', await shot('21-routine-mobile.png'))

  ws.close()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
