import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadConfig } from './config'

let client: SupabaseClient | null = null
let clientKey = ''

export async function getClient(): Promise<SupabaseClient> {
  const cfg = await loadConfig()
  if (!cfg.url || !cfg.key) throw new Error('supabase-not-configured')
  const k = cfg.url + '|' + cfg.key
  if (!client || clientKey !== k) {
    client = createClient(cfg.url, cfg.key, {
      auth: {
        persistSession: true,
        storage: window.localStorage,
        storageKey: 'anjam.auth',
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
    clientKey = k
  }
  return client
}

export function resetClient(): void {
  client = null
  clientKey = ''
}
