#!/usr/bin/env node
/**
 * FR-18: every string key must exist in BOTH the en and the fa dictionary.
 * Parses src/lib/i18n.ts directly (it is plain object literals, no imports
 * needed) and diffs the two key sets. Exit 1 + a list of the offending keys
 * when they diverge — run it before every build.
 *
 *   node scripts/i18n-parity.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2] || resolve(root, 'src/lib/i18n.ts')
// the file is CRLF on Windows; normalise so the boundaries below are plain \n
const src = readFileSync(target, 'utf8').replace(/\r\n/g, '\n')

function blockKeys(from, to) {
  const a = src.indexOf(from)
  const b = src.indexOf(to, a)
  if (a < 0 || b < 0) throw new Error(`dictionary boundary not found: ${from} -> ${to}`)
  const body = src.slice(a, b)
  const keys = []
  const re = /^\s{4}([A-Za-z_$][\w$]*)\s*:/gm
  let m
  while ((m = re.exec(body))) keys.push(m[1])
  return keys
}

const enKeys = blockKeys('  en: {', '  fa: {')
const faKeys = blockKeys('  fa: {', '\n}\n')

const dupes = ks => ks.filter((k, i) => ks.indexOf(k) !== i)
const enOnly = enKeys.filter(k => !faKeys.includes(k))
const faOnly = faKeys.filter(k => !enKeys.includes(k))

const problems = []
if (dupes(enKeys).length) problems.push(`duplicate keys in en: ${dupes(enKeys).join(', ')}`)
if (dupes(faKeys).length) problems.push(`duplicate keys in fa: ${dupes(faKeys).join(', ')}`)
if (enOnly.length) problems.push(`missing in fa: ${enOnly.join(', ')}`)
if (faOnly.length) problems.push(`missing in en: ${faOnly.join(', ')}`)

const count = new Set([...enKeys, ...faKeys]).size
if (problems.length) {
  console.error('I18N_PARITY_FAIL')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log(`I18N_PARITY_OK ${count} keys, fa == en`)
