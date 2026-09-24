import { useEffect, useState } from 'react'
import type { Lang } from '../types'
import { t } from '../lib/i18n'
import { loadConfig, saveConfig } from '../lib/config'
import { createClient } from '@supabase/supabase-js'
import { Alert, CheckCircle } from './Icons'
import logo from '../assets/logo.png'

type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' } | { kind: 'fail'; msg: string }

export default function Setup({ lang, onSaved }: { lang: Lang; onSaved: () => void }) {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [test, setTest] = useState<TestState>({ kind: 'idle' })

  useEffect(() => {
    void loadConfig().then((c) => {
      setUrl(c.url)
      setKey(c.key)
    })
  }, [])

  const tt = (k: string) => t(lang, k)

  async function handleTest() {
    if (!url.trim() || !key.trim()) return
    setTest({ kind: 'testing' })
    try {
      const sb = createClient(url.trim().replace(/\/+$/, ''), key.trim())
      const { error } = await sb.from('lists').select('id').limit(1)
      if (error) setTest({ kind: 'fail', msg: error.message })
      else setTest({ kind: 'ok' })
    } catch (e) {
      setTest({ kind: 'fail', msg: String((e as Error).message || e) })
    }
  }

  function handleSave() {
    if (!url.trim() || !key.trim()) return
    saveConfig(url, key)
    onSaved()
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <img className="brand-mark is-logo" src={logo} alt="" />
          <div>
            <h1>{tt('appName')}</h1>
            <p className="muted">{tt('tagline')}</p>
          </div>
        </div>
        <h2 className="section-title">{tt('setupTitle')}</h2>
        <p className="muted small">{tt('setupDesc')}</p>
        <label className="field">
          <span>{tt('supabaseUrl')}</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co"
            dir="ltr"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>{tt('anonKey')}</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi..." dir="ltr" spellCheck={false} />
        </label>
        <div className="auth-actions">
          <button className="btn ghost" onClick={handleTest} disabled={test.kind === 'testing'}>
            {tt('testConnection')}
          </button>
          <button className="btn primary" onClick={handleSave}>
            {tt('connect')}
          </button>
        </div>
        {test.kind === 'ok' && (
          <p className="msg ok">
            <CheckCircle width={15} height={15} /> {tt('connectionOk')}
          </p>
        )}
        {test.kind === 'fail' && (
          <p className="msg fail">
            <Alert width={15} height={15} /> {tt('connectionFail')}: {test.msg}
          </p>
        )}
        <p className="muted small">
          schema: <code>supabase/schema.sql</code> — docs: <code>docs/SUPABASE_SETUP.md</code>
        </p>
      </div>
    </div>
  )
}
