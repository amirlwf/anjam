import { useState } from 'react'
import type { Lang } from '../types'
import { t } from '../lib/i18n'
import { getClient } from '../lib/supabaseClient'
import { Gear, Alert } from './Icons'

export default function Auth({
  lang,
  onAuthed,
  onOpenSetup,
}: {
  lang: Lang
  onAuthed: () => void
  onOpenSetup: () => void
}) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const tt = (k: string) => t(lang, k)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setNotice(null)
    try {
      const sb = await getClient()
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw new Error(error.message)
        onAuthed()
      } else {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password })
        if (error) throw new Error(error.message)
        if (data.session) onAuthed()
        else setNotice(tt('signupOk'))
      }
    } catch (e) {
      const msg = String((e as Error).message || e)
      setErr(/invalid login credentials/i.test(msg) ? tt('invalidLogin') : msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <button className="icon-btn corner" onClick={onOpenSetup} title={tt('settings')}>
          <Gear />
        </button>
        <div className="brand">
          <span className="brand-mark">✓</span>
          <div>
            <h1>{tt('appName')}</h1>
            <p className="muted">{tt('tagline')}</p>
          </div>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            <span>{tt('email')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              dir="ltr"
            />
          </label>
          <label className="field">
            <span>{tt('password')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              dir="ltr"
            />
          </label>
          <button className="btn primary block" type="submit" disabled={busy}>
            {busy ? '…' : mode === 'in' ? tt('signIn') : tt('signUp')}
          </button>
        </form>
        {err && (
          <p className="msg fail">
            <Alert width={15} height={15} /> {err}
          </p>
        )}
        {notice && <p className="msg ok">{notice}</p>}
        <button
          className="link-btn"
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setErr(null)
            setNotice(null)
          }}
        >
          {mode === 'in' ? tt('noAccountYet') + ' ' + tt('signUp') : tt('haveAccount') + ' ' + tt('signIn')}
        </button>
      </div>
    </div>
  )
}
