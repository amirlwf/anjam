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
