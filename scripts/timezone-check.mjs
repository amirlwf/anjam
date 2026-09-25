#!/usr/bin/env node
/**
 * Cross-timezone check for the 21:00 → 08:00 night window (US2, FR-04).
 *
 * Why this file exists: on Windows Node ignores `TZ` from the shell, so a
 * `TZ=UTC node unit.mjs` matrix silently runs every case in the local zone and
 * reports green regardless of whether the logic holds elsewhere. Setting
 * `process.env.TZ` *inside* the process before any Date is built does bust the
 * local-zone cache, so each zone runs as its own child process here.
 *
 * What it asserts: for every zone, at a fixed UTC instant, `isNightWindow`
 * agrees with the zone's own wall clock. A zone offset bug means one zone says
 * "night" while another says "afternoon" for the same instant — that is
 * exactly the class of bug that made the original important-date alarm fire
 * early.
 *
 *   node scripts/timezone-check.mjs
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// One instant, five offsets: 19:00 UTC = 21:30 Tehran (inside),
// 15:00 New York (outside), 00:45 Kathmandu (inside), 19:00 UTC itself.
const INSTANT = Date.UTC(2026, 8, 25, 19, 0, 0)

const CASES = [
  { tz: 'Asia/Tehran', utcHour: 19, want: true },   // 21:30 local
  { tz: 'Europe/London', utcHour: 19, want: false }, // 19:00 local
  { tz: 'America/New_York', utcHour: 19, want: false }, // 15:00 local
  { tz: 'Asia/Kathmandu', utcHour: 19, want: true },  // 00:45 local (+1d)
  { tz: 'Pacific/Auckland', utcHour: 19, want: false }, // 07:00 local (+1d) -> inside? see below
  { tz: 'Asia/Shanghai', utcHour: 19, want: false }   // 03:00 local (+1d) -> inside
]

// The runner is written to a temp file so no shell quoting can mangle it.
const runner = resolve(tmpdir(), 'anjam-tz-runner.mjs')
const advisoryUrl = pathToFileURL(resolve(root, 'src/lib/advisory.ts')).href
writeFileSync(runner, `
process.env.TZ = process.env.__TZ__ || 'UTC'
const { isNightWindow } = await import(${JSON.stringify(advisoryUrl)})
const instant = ${INSTANT}
const d = new Date(instant)
process.stdout.write(JSON.stringify({
  zone: Intl.DateTimeFormat('en-US', { timeZone: process.env.TZ, hour: '2-digit', hour12: false }).format(d),
  inside: isNightWindow(d)
}))
`)

const now = new Date()
const localHours = `${String(now.getHours()).padStart(2, '0')}:00 local now -> `
console.log(
  `TZ_CHECK: current local time ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` +
  `, instant under test ${new Date(INSTANT).toISOString()}`
)

let pass = 0
const failures = []

// The assertion is: the *zone's own wall clock* decides, not the machine's.
// So we assert `inside` against the zone's local hour directly.
for (const c of CASES) {
  let out
  try {
    out = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', runner], {
      env: { ...process.env, __TZ__: c.tz },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000
    }))
  } catch (e) {
    failures.push(`${c.tz}: runner failed — ${e.message.split('\n')[0]}`)
    continue
  }
  const hour = Number(out.zone)
  // window: >= 21 or < 8
  const shouldSay = hour >= 21 || hour < 8
  if (out.inside === shouldSay) pass++
  else failures.push(`${c.tz}: wall clock ${out.zone} (want inside=${shouldSay}) but isNightWindow said ${out.inside}`)
}

console.log(localHours)
if (failures.length) {
  console.error(`TZ_CHECK_FAIL ${pass}/${CASES.length}`)
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(`TZ_CHECK_OK ${pass}/${CASES.length} zones agree on the 21:00-08:00 window`)
