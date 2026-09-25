import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Lang, View } from './types'
import { getLang, applyLang, t } from './lib/i18n'
import { loadConfig } from './lib/config'
import { getClient } from './lib/supabaseClient'
import { store, updateList, destroyList } from './lib/store'
import { startSync, stopSync, syncNow } from './lib/sync'
import { startAlarmLoop, syncTaskAlarms } from './lib/alarms'
import { getSections, subscribeSections } from './lib/sections'
import Setup from './components/Setup'
import Auth from './components/Auth'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import QuickAdd from './components/QuickAdd'
import Routine from './components/Routine'
import Dates from './components/Dates'
import Study from './components/Study'
import Workout from './components/Workout'
import TaskList from './components/TaskList'
import TaskDetail from './components/TaskDetail'
import Settings from './components/Settings'
import { Plus, X } from './components/Icons'
import Advisory from './components/Advisory'
import NewsAlert from './components/NewsAlert'
import logo from './assets/logo.png'

type Phase = 'boot' | 'setup' | 'auth' | 'app'

function viewTitle(lang: Lang, view: View): string {
  const tt = (k: string) => t(lang, k)
  switch (view.kind) {
    case 'inbox':
      return tt('inbox')
    case 'today':
      return tt('today')
    case 'upcoming':
      return tt('upcoming')
    case 'all':
      return tt('all')
    case 'completed':
      return tt('completed')
    case 'priority':
      return tt('priorities')
    case 'label':
      return '#' + view.name
    case 'routine':
      return tt('routine')
    case 'dates':
      return tt('datesTitle')
    case 'list': {
      const list = store.getState().lists.find((l) => l.id === view.id)
      return list ? list.name : tt('projects')
    }
    case 'study':
      return tt('studyTitle')
    case 'workout':
      return tt('workoutTitle')
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot')
  const [lang, setLangState] = useState<Lang>(getLang())
  const [view, setView] = useState<View>({ kind: 'today' })
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [email, setEmail] = useState('')
  const [, setCalTick] = useState(0)

  const setLang = useCallback((l: Lang) => {
    applyLang(l)
    setLangState(l)
  }, [])

  const boot = useCallback(async () => {
    setPhase('boot')
    const cfg = await loadConfig()
    if (!cfg.url || !cfg.key) {
      setPhase('setup')
      return
    }
    try {
      const sb = await getClient()
      const {
        data: { session },
      } = await sb.auth.getSession()
      sb.auth.onAuthStateChange((_event, s) => {
        if (!s) {
          void stopSync()
          setEmail('')
          setSelected(null)
          setPhase('auth')
        }
      })
      if (!session) {
        setPhase('auth')
        return
      }
      setEmail(session.user.email || '')
      await store.load(session.user.id)
      setPhase('app')
      void startSync(session.user.id)
      // Reconcile alarms right after data lands (don't wait up to 15s for the
      // interval): future rings plan immediately, stale ones are swallowed by
      // the late-grace guard instead of surprising the user after login.
      void syncTaskAlarms()
    } catch {
      setPhase('auth')
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    const h = () => syncNow()
    window.addEventListener('anjam:sync-now', h)
    return () => window.removeEventListener('anjam:sync-now', h)
  }, [])

  // Task alarms: register exact clock-time rings for every task, keep them
  // reconciled with the store (15s + visibility).
  useEffect(() => {
    startAlarmLoop()
  }, [])

  useEffect(() => {
    if (phase !== 'app') return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (typing) {
        if (e.key === 'Escape') el!.blur()
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        document.getElementById('quickadd-input')?.focus()
      } else if (e.key === '/') {
        e.preventDefault()
        document.getElementById('search-input')?.focus()
      } else if (e.key === 'Escape') {
        if (selected) setSelected(null)
        else if (settingsOpen) setSettingsOpen(false)
        else if (navOpen) setNavOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, selected, settingsOpen, navOpen])

  useEffect(() => {
    const h = () => setCalTick((x) => x + 1)
    window.addEventListener('anjam:cal-changed', h)
    return () => window.removeEventListener('anjam:cal-changed', h)
  }, [])

  // Opt-in sections: if the open section gets switched off, land back on inbox.
  const sections = useSyncExternalStore(subscribeSections, getSections)
  useEffect(() => {
    if ((view.kind === 'study' && !sections.study) || (view.kind === 'workout' && !sections.workout)) {
      setView({ kind: 'inbox' })
    }
  }, [view, sections])

  async function signOut() {
    if (!window.confirm(t(lang, 'confirmSignOut'))) return
    try {
      const sb = await getClient()
      await sb.auth.signOut()
    } catch {}
    await stopSync()
    setEmail('')
    setPhase('auth')
  }

  if (phase === 'boot') {
    return (
      <div className="boot">
        <div className="boot-mark">
          <img className="boot-logo" src={logo} alt="" />
        </div>
        <p className="muted">{t(lang, 'loading')}</p>
      </div>
    )
  }

  if (phase === 'setup') {
    return <Setup lang={lang} onSaved={() => void boot()} />
  }

  if (phase === 'auth') {
    return <Auth lang={lang} onAuthed={() => void boot()} onOpenSetup={() => setPhase('setup')} />
  }

  const listId = view.kind === 'list' ? view.id : null

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar lang={lang} view={view} setView={setView} onClose={() => setNavOpen(false)} />
      <div className="nav-backdrop" onClick={() => setNavOpen(false)} />
      <div className="main-col">
        <Header
          lang={lang}
          setLang={setLang}
          query={query}
          setQuery={setQuery}
          onMenu={() => setNavOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          email={email}
          onSignOut={() => void signOut()}
        />
        <main className="view">
          <div className="view-head" key={JSON.stringify(view)}>
            <h2>{viewTitle(lang, view)}</h2>
            <div className="view-actions">
              {view.kind !== 'completed' && view.kind !== 'routine' && view.kind !== 'study' && view.kind !== 'workout' && (
                <button className="btn ghost small" onClick={() => setShowCompleted((v) => !v)}>
                  {showCompleted ? t(lang, 'hideCompleted') : t(lang, 'showCompleted')}
                </button>
              )}
              {view.kind === 'list' && (
                <>
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      const list = store.getState().lists.find((l) => l.id === view.id)
                      if (!list) return
                      const name = window.prompt(t(lang, 'rename'), list.name)
                      if (name && name.trim() && name.trim() !== list.name) void updateList(list.id, { name: name.trim() })
                    }}
                  >
                    {t(lang, 'rename')}
                  </button>
                  <button
                    className="btn danger small"
                    onClick={() => {
                      if (window.confirm(t(lang, 'delete') + '?')) {
                        void destroyList(view.id)
                        setView({ kind: 'inbox' })
                      }
                    }}
                  >
                    {t(lang, 'delete')}
                  </button>
                </>
              )}
            </div>
          </div>
          {view.kind === 'routine' ? (
            <Routine lang={lang} />
          ) : view.kind === 'dates' ? (
            <Dates lang={lang} />
          ) : view.kind === 'study' ? (
            <Study lang={lang} />
          ) : view.kind === 'workout' ? (
            <Workout lang={lang} />
          ) : (
            <>
              <QuickAdd lang={lang} defaultListId={listId} />
              <TaskList
                lang={lang}
                view={view}
                query={query}
                showCompleted={showCompleted}
                selected={selected}
                onOpen={setSelected}
              />
            </>
          )}
        </main>
        <button
          className="fab only-mobile"
          aria-label={t(lang, 'addTask')}
          onClick={() => {
            const el = document.getElementById('quickadd-input')
            if (el) {
              el.focus({ preventScroll: true })
              el.scrollIntoView({ block: 'center', behavior: 'smooth' })
            } else {
              // US1/FR-01: on views with no inline composer the button used to
              // do nothing at all (focus() on a missing node). Fall back to a
              // modal that reuses QuickAdd and its NLP parser.
              setComposerOpen(true)
            }
          }}
        >
          <Plus width={24} height={24} />
        </button>
      </div>
      {/* US2/FR-04-06: the 21:00-08:00 night advisory. Always mounted so its
          scheduler keeps running even while another modal is open. */}
      <Advisory lang={lang} />
      <NewsAlert lang={lang} />

      {/* US1/FR-01: composer for views that have no inline one (FAB). */}
      {composerOpen && (
        <div className="modal-overlay" onClick={() => setComposerOpen(false)}>
          <div className="modal quickadd-modal" onClick={(e) => e.stopPropagation()} data-testid="quickadd-modal">
            <div className="modal-head">
              <h2>{t(lang, 'addTask')}</h2>
              <button className="icon-btn" aria-label={t(lang, 'close')} onClick={() => setComposerOpen(false)}>
                <X />
              </button>
            </div>
            <QuickAdd lang={lang} defaultListId={listId} />
          </div>
        </div>
      )}
      {selected && <TaskDetail lang={lang} taskId={selected} onClose={() => setSelected(null)} />}
      {settingsOpen && (
        <Settings
          lang={lang}
          setLang={setLang}
          email={email}
          onClose={() => setSettingsOpen(false)}
          onSignOut={() => {
            setSettingsOpen(false)
            void signOut()
          }}
        />
      )}
    </div>
  )
}
