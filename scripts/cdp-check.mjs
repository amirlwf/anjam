// Drives the packaged Anjam Electron build over CDP: reads the real DOM,
// exercises the error path, toggles FA/dark, captures screenshots.
// Run: node scripts/cdp-check.mjs   (app must be up with --remote-debugging-port=9333)
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
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error')) })

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
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
    return r.result?.result?.value
  }
  const snapshot = async () => evalJs(`JSON.stringify({
    title: document.title,
    rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1,
    dir: document.documentElement.dir,
    lang: document.documentElement.lang,
    theme: document.documentElement.dataset.theme,
    url: location.href,
    buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).slice(0, 12),
    inputs: [...document.querySelectorAll('input')].map((i, idx) => ({ idx, id: i.id, ph: i.placeholder, type: i.type })),
    text: document.body.innerText.slice(0, 500)
  })`)
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    const p = path.join(OUT, name)
    fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'))
    return p
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await sleep(1500)

  // 1) initial state (fresh profile -> EN + light + setup gate)
  const s1 = await snapshot()
  console.log('SHOT1_DOM:', s1)
  console.log('SHOT1_FILE:', await shot('01-initial.png'))

  // 2) error path: fake creds -> press the primary action -> expect a graceful error
  const clicked = await evalJs(`(() => {
    const inputs = [...document.querySelectorAll('input')];
    if (inputs.length < 2) return 'inputs-not-found';
    const set = (el, v) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      desc.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(inputs[0], 'https://fake-project.supabase.co');
    set(inputs[1], 'fake-anon-key-123');
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => /test|connect|تست|اتصال/i.test(x.textContent));
    if (!b) return 'button-not-found';
    b.click();
    return b.textContent.trim();
  })()`)
  console.log('CLICKED:', clicked)
  await sleep(4000)
  const s2 = await evalJs(`JSON.stringify({ text: document.body.innerText.slice(0, 600) })`)
  console.log('AFTER_ERROR_PATH:', s2)
  console.log('SHOT2_FILE:', await shot('02-error-path.png'))

  // 3) switch to Persian + dark, reload, verify RTL
  await evalJs(`localStorage.setItem('anjam.lang', 'fa'); localStorage.setItem('anjam.theme', 'dark'); 'ok'`)
  await send('Page.reload', { ignoreCache: true })
  await sleep(2500)
  const s3 = await snapshot()
  console.log('SHOT3_FA_DARK:', s3)
  console.log('SHOT3_FILE:', await shot('03-fa-dark.png'))

  ws.close()
  console.log('CDP_QA_DONE')
}

main().catch((e) => { console.error('CDP_QA_ERR', e.message || e); process.exit(1) })
