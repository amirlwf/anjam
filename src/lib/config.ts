const K_URL = 'anjam.supabase.url'
const K_KEY = 'anjam.supabase.key'

export interface AppConfig {
  url: string
  key: string
  source: 'storage' | 'env' | 'host' | 'none'
}

let cached: AppConfig | null = null
let hostDefaults: { url?: string; key?: string } | null | undefined

async function loadHostDefaults(): Promise<{ url?: string; key?: string } | null> {
  if (hostDefaults !== undefined) return hostDefaults
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch('api/config', { signal: ctrl.signal })
    clearTimeout(timer)
    hostDefaults = res.ok ? ((await res.json()) as { url?: string; key?: string }) : null
  } catch {
    hostDefaults = null
  }
  return hostDefaults
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached
  const sUrl = (localStorage.getItem(K_URL) || '').trim()
  const sKey = (localStorage.getItem(K_KEY) || '').trim()
  if (sUrl && sKey) {
    cached = { url: sUrl, key: sKey, source: 'storage' }
    return cached
  }
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || ''
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || ''
  if (envUrl && envKey) {
    cached = { url: envUrl, key: envKey, source: 'env' }
    return cached
  }
  const host = await loadHostDefaults()
  if (host?.url && host?.key) {
    cached = { url: host.url, key: host.key, source: 'host' }
    return cached
  }
  cached = { url: '', key: '', source: 'none' }
  return cached
}

export function saveConfig(url: string, key: string): void {
  localStorage.setItem(K_URL, url.trim().replace(/\/+$/, ''))
  localStorage.setItem(K_KEY, key.trim())
  cached = null
}

export function clearConfig(): void {
  localStorage.removeItem(K_URL)
  localStorage.removeItem(K_KEY)
  cached = null
}

// --- v1.4.0 pref keys -------------------------------------------------
// One small typed helper per feature so no component hand-rolls a
// localStorage string and typos cannot silently create a second key.
const V14 = {
  theme: 'anjam.theme',
  themeMode: 'anjam.themeMode',
  variableTheme: 'anjam.variableTheme',
  newsRegion: 'anjam.news.region',
  newsLastCheck: 'anjam.news.lastCheck',
  newsLastIds: 'anjam.news.lastIds',
  advisoryLastRun: 'anjam.advisory.lastRun',
  advisoryLastKey: 'anjam.advisory.lastKey',
  backupLastExport: 'anjam.backup.lastExport',
  aiKey: 'anjam.ai.key',
  aiModel: 'anjam.ai.model',
  aiLang: 'anjam.ai.lang'
} as const

export const PREF_KEYS = V14

const getStr = (k: string): string => (localStorage.getItem(k) || '').trim()
const setStr = (k: string, v: string): void => {
  if (v) localStorage.setItem(k, v)
  else localStorage.removeItem(k)
}
const getNum = (k: string): number | null => {
  const v = Number(getStr(k))
  return Number.isFinite(v) && v > 0 ? v : null
}
const setNum = (k: string, v: number | null): void => setStr(k, v == null ? '' : String(v))
const getBool = (k: string, dflt: boolean): boolean => {
  const v = getStr(k)
  return v === '' ? dflt : v === '1'
}
const setBool = (k: string, v: boolean): void => setStr(k, v ? '1' : '0')

/** All v1.4.0 prefs, so backup export can include them wholesale. */
export function collectV14Prefs(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.values(V14)) {
    const v = localStorage.getItem(k)
    if (v != null) out[k] = v
  }
  return out
}

export const prefs = {
  getTheme: () => getStr(V14.theme),
  setTheme: (v: string) => setStr(V14.theme, v),
  getThemeMode: () => getStr(V14.themeMode) || 'system',
  setThemeMode: (v: string) => setStr(V14.themeMode, v),
  getVariableTheme: () => getBool(V14.variableTheme, false),
  setVariableTheme: (v: boolean) => setBool(V14.variableTheme, v),

  getNewsRegion: () => getStr(V14.newsRegion),
  setNewsRegion: (v: string) => setStr(V14.newsRegion, v),
  getNewsLastCheck: () => getNum(V14.newsLastCheck),
  setNewsLastCheck: (v: number | null) => setNum(V14.newsLastCheck, v),
  getNewsLastIds: () => getStr(V14.newsLastIds),
  setNewsLastIds: (v: string) => setStr(V14.newsLastIds, v),

  getAdvisoryLastRun: () => getNum(V14.advisoryLastRun),
  setAdvisoryLastRun: (v: number | null) => setNum(V14.advisoryLastRun, v),
  getAdvisoryLastKey: () => getStr(V14.advisoryLastKey),
  setAdvisoryLastKey: (v: string) => setStr(V14.advisoryLastKey, v),

  getBackupLastExport: () => getNum(V14.backupLastExport),
  setBackupLastExport: (v: number | null) => setNum(V14.backupLastExport, v),

  getAiKey: () => getStr(V14.aiKey),
  setAiKey: (v: string) => setStr(V14.aiKey, v),
  getAiModel: () => getStr(V14.aiModel),
  setAiModel: (v: string) => setStr(V14.aiModel, v),
  getAiLang: () => (getStr(V14.aiLang) || 'fa') as 'fa' | 'en',
  setAiLang: (v: string) => setStr(V14.aiLang, v)
}
