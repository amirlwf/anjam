import type { SectionKey } from '../types'

/** Optional sections the user switches on from Settings. Defaults are off so
 *  the sidebar stays clean until they opt in. */
export type Sections = Record<SectionKey, boolean>

const KEY = 'anjam.sections.v1'
const DEFAULTS: Sections = { study: false, workout: false }

function load(): Sections {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Sections>) }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

let state: Sections = load()
const subs = new Set<() => void>()

export function getSections(): Sections {
  return state
}

export function subscribeSections(fn: () => void): () => void {
  subs.add(fn)
  fn()
  return () => void subs.delete(fn)
}

export function setSection(key: SectionKey, on: boolean): void {
  state = { ...state, [key]: on }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch { /* ignore */ }
  subs.forEach((f) => f())
}
