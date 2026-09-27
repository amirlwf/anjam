// Verify a published GitHub release against the local artifacts.
// The version comes from package.json — never hardcoded.
// usage: node verify-release.mjs <release.json> [repoRoot]
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const [, , jsonPath, rootArg] = process.argv
const root = rootArg || process.cwd()
const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version

const rel = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
if (!rel.id) {
  console.log('API_ERROR:', String(rel.message || rel).slice(0, 120))
  process.exit(1)
}
console.log('RID:', rel.id, '| tag:', rel.tag_name, '| draft:', rel.draft, '| published:', !!rel.published_at)

const locals = {
  [`Anjam-${ver}.apk`]: path.join(root, 'releases', `Anjam-${ver}.apk`),
  [`Anjam-Setup-${ver}.exe`]: path.join(root, 'release', `Anjam-Setup-${ver}.exe`),
  [`Anjam-Portable-${ver}.exe`]: path.join(root, 'release', `Anjam-Portable-${ver}.exe`),
}

const remote = Object.fromEntries(rel.assets.map((a) => [a.name, a.size]))
console.log('remote assets:', JSON.stringify(remote))

let ok = Object.keys(remote).length === Object.keys(locals).length
if (rel.tag_name !== `v${ver}`) {
  console.log(`TAG_MISMATCH: local v${ver} vs remote ${rel.tag_name}`)
  ok = false
}

for (const [name, p] of Object.entries(locals)) {
  if (!fs.existsSync(p)) {
    console.log(`${name}: MISSING LOCALLY at ${p}`)
    ok = false
    continue
  }
  const size = fs.statSync(p).size
  const match = remote[name] === size
  ok = ok && match
  const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  console.log(`${name}: local=${size} remote=${remote[name] ?? 'MISSING'} ${match ? 'OK' : 'MISMATCH'} sha256=${h.slice(0, 16)}…`)
}

console.log('ALL_MATCH:', ok)
process.exit(ok ? 0 : 1)
