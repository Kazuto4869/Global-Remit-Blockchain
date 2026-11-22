import { useEffect, useState } from 'react'
import Admin from './pages/Admin.jsx'
import Auth from './pages/Auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Kyc from './pages/Kyc.jsx'
import TestnetTransfer from './pages/TestnetTransfer.jsx'
import { api } from './api.js'
import { BrandMark } from './components/ui.jsx'

const checks = [
  ['Backend', '/api/health'],
  ['Database', '/api/db/status'],
  ['Stellar', '/api/stellar/status'],
]

function ConnectionStatus() {
  const [results, setResults] = useState({})

  useEffect(() => {
    const controller = new AbortController()
    for (const [name, path] of checks) {
      fetch(path, { signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Connection failed')
          const result = await response.json()
          setResults((previous) => ({ ...previous, [name]: result }))
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setResults((previous) => ({ ...previous, [name]: { status: 'error' } }))
        })
    }
    return () => controller.abort()
  }, [])

  return (
    <dl className="connection-status" aria-live="polite" aria-label="Trạng thái kết nối">
      {checks.map(([name]) => {
        const result = results[name]
        const state = !result ? 'checking' : result.status === 'ok' ? 'ok' : 'error'
        return (
          <div key={name}>
            <dt>{name}</dt>
            <dd data-state={state}>
              {state === 'checking' ? 'Checking…' : state === 'ok' ? 'Connected' : 'Unavailable'}
              {result?.ledger !== undefined && ` · Ledger ${result.ledger}`}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

const sessionKey = 'globalremit:session'
const pages = [
  ['dashboard', 'Dashboard'],
  ['profile', 'Hồ sơ & KYC'],
  ['transfer', 'Chuyển tiền'],
]

function CustomerPages({ token }) {
  const [page, setPage] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api('/kyc', { token, signal: controller.signal })
      .then((profile) => setProfile(profile))
      .catch((error) => {
        if (!controller.signal.aborted) setProfileError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [token, revision])

  const activePage = page ?? (profile?.wallet ? 'dashboard' : 'profile')

  function reloadProfile() {
    setLoading(true)
    setProfileError('')
    setRevision((previous) => previous + 1)
  }

  function openPage(next) {
    setPage(next)
    if (next !== activePage) reloadProfile()
  }

  function updateProfile(next) {
    setPage((previous) => previous ?? 'profile')
    setProfile(next)
  }

  return (
    <>
      <nav className="page-nav" aria-label="Màn hình customer">
        {pages.map(([id, label]) => (
          <button key={id} type="button" aria-current={activePage === id ? 'page' : undefined}
            onClick={() => openPage(id)}>{label}</button>
        ))}
      </nav>
      {!profile && (
        <section className="card">
          {loading ? <p className="loading" role="status">Đang tải hồ sơ…</p> : (
            <>
              <p role="alert">{profileError}</p>
              <button type="button" className="secondary" onClick={reloadProfile}>Thử lại</button>
            </>
          )}
        </section>
      )}
      {profile && (
        <>
          {profileError && <p role="alert">{profileError}</p>}
          {activePage === 'profile' && (
            <Kyc token={token} profile={profile} onUpdate={updateProfile} refreshing={loading} onRefresh={reloadProfile} />
          )}
          {activePage === 'dashboard' && <Dashboard token={token} wallet={profile.wallet} openProfile={() => openPage('profile')} />}
          {activePage === 'transfer' && (
            <TestnetTransfer key={profile.wallet?.publicKey} token={token} publicKey={profile.wallet?.publicKey}
              approved={!loading && !profileError && profile.submission?.status === 'APPROVED'}
              refreshing={loading} openProfile={() => openPage('profile')} />
          )}
        </>
      )}
    </>
  )
}

function updateStoredSession(session) {
  if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session))
  else sessionStorage.removeItem(sessionKey)
}

function App() {
  const [session, setSession] = useState(() => JSON.parse(sessionStorage.getItem(sessionKey)))
  const [expired, setExpired] = useState(false)

  function updateSession(next) {
    updateStoredSession(next)
    setSession(next)
    setExpired(false)
  }

  useEffect(() => {
    function expire(event) {
      if (event.detail !== session?.token) return
      updateStoredSession(null)
      setSession(null)
      setExpired(true)
    }
    window.addEventListener('globalremit:session-expired', expire)
    return () => window.removeEventListener('globalremit:session-expired', expire)
  }, [session?.token])

  return (
    <>
      <header className="topnav">
        <div className="container topnav-inner">
          <div className="brand">
            <BrandMark />
            <h1 className="brand-name">GlobalRemit</h1>
            <span className="badge role">Testnet</span>
          </div>
          {session && (
            <div className="session">
              <span className="session-email">{session.user.email}</span>
              <span className="badge role">{session.user.role}</span>
              <button type="button" className="secondary" onClick={() => updateSession(null)}>Đăng xuất</button>
            </div>
          )}
        </div>
      </header>
      <main className="workspace">
        <div className="container">
          {!session && <Auth onLogin={updateSession} expired={expired} />}
          {session?.user.role === 'ADMIN' && <Admin key={session.user.id} token={session.token} />}
          {session?.user.role === 'CUSTOMER' && <CustomerPages key={session.user.id} token={session.token} />}
        </div>
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <div className="brand"><BrandMark size={24} /><span className="brand-name">GlobalRemit</span></div>
            <p>Dự án học tập mô phỏng chuyển tiền Việt Nam → Mỹ trên Stellar Testnet. Dữ liệu giả, tài sản không có giá trị thật.</p>
          </div>
          <ConnectionStatus />
        </div>
      </footer>
    </>
  )
}

export default App
