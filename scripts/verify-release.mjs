// Verify the published v1.2.0 release against local artifacts.
// usage: node verify-release.mjs <release.json> <repoRoot>
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const [, , jsonPath, root] = process.argv
const rel = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
if (!rel.id) {
  console.log('API_ERROR:', String(rel.message || rel).slice(0, 120))
  process.exit(1)
}
console.log('RID:', rel.id, '| tag:', rel.tag_name, '| draft:', rel.draft, '| published:', !!rel.published_at)
const remote = Object.fromEntries(rel.assets.map((a) => [a.name, a.size]))
console.log('remote assets:', JSON.stringify(remote))
const locals = {
  'Anjam-1.2.0.apk': path.join(root, 'releases', 'Anjam-1.2.0.apk'),
  'Anjam-Setup-1.2.0.exe': path.join(root, 'release', 'Anjam-Setup-1.2.0.exe'),
  'Anjam-Portable-1.2.0.exe': path.join(root, 'release', 'Anjam-Portable-1.2.0.exe'),
}
let ok = Object.keys(remote).length === 3
for (const [name, p] of Object.entries(locals)) {
  const size = fs.statSync(p).size
  const match = remote[name] === size
  ok = ok && match
  const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  console.log(`${name}: local=${size} remote=${remote[name] ?? 'MISSING'} ${match ? 'OK' : 'MISMATCH'} sha256=${h.slice(0, 16)}…`)
}
console.log('ALL_MATCH:', ok)
process.exit(ok ? 0 : 1)
