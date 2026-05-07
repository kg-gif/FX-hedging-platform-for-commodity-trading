// App.jsx — top-level routing and auth gate
//
// DEPLOYMENT NOTE: Render must have a wildcard rewrite rule:
//   Source: /*   Destination: /index.html   Action: Rewrite
// Without this, direct URL access and page refresh breaks on all routes.

import { useState, useEffect } from 'react'
import { useCompany } from './contexts/CompanyContext'
import {
  BrowserRouter, Routes, Route, Navigate, Link, useLocation
} from 'react-router-dom'
import { CompanyProvider } from './contexts/CompanyContext'
import CompanySelector from './components/CompanySelector'
import RateTicker from './components/RateTicker'
import Dashboard from './components/Dashboard.jsx'
import HedgingPage from './components/HedgingPage'
import RiskEngine from './components/RiskEngine'
import Reports from './components/Reports'
import Settings from './components/Settings'
import Glossary from './components/Glossary'
import Login from './components/Login'
import ResetPassword from './components/ResetPassword'

const NAVY = '#1A2744'
const GOLD = '#C9A86C'
const API_URL = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'

function getStoredAuth() {
  try {
    const token = localStorage.getItem('auth_token')
    const user = JSON.parse(localStorage.getItem('auth_user') || 'null')
    if (token && user) return { token, user }
  } catch (_) {}
  return null
}

function clearAuth() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
}

// ── Shell: sticky header + tab nav ──────────────────────────────────────────

function AppShell({ authUser, onLogout, children }) {
  const location = useLocation()
  const isAdmin = ['superadmin', 'company_admin', 'admin'].includes(authUser?.role)

  const navItems = [
    { path: '/dashboard',   name: 'Dashboard'   },
    { path: '/hedging',     name: 'Hedging'     },
    { path: '/reports',     name: 'Reports'     },
    { path: '/settings',    name: 'Settings'    },
    { path: '/risk-engine', name: 'Risk Engine' },
    ...(isAdmin ? [{ path: '/settings/admin', name: '⚙ Admin' }] : []),
  ]

  // A tab is active when the URL starts with its path.
  // /settings/admin is a sub-path of /settings so both would match —
  // but admin is listed separately and we want settings to remain active for all /settings/* routes.
  function isActive(path) {
    if (path === '/settings') return location.pathname.startsWith('/settings')
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <div className="min-h-screen" style={{ background: '#F0F2F7' }}>
      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <div style={{ background: NAVY }} className="shadow-xl sticky top-0 z-50">
        {/* Live rate ticker */}
        <RateTicker companyId={selectedCompanyId} />
        {/* Logo + user row */}
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded flex items-center justify-center"
                style={{ border: `1px solid ${GOLD}`, background: 'rgba(201,168,108,0.08)' }}>
                <span className="text-xs font-bold leading-tight text-center"
                  style={{ color: GOLD, letterSpacing: '0.05em' }}>
                  sum +<br />no &nbsp;−<br />how =
                </span>
              </div>
              <div>
                <span className="text-2xl font-bold tracking-widest uppercase block"
                  style={{ color: GOLD, letterSpacing: '0.15em' }}>sumnohow</span>
                <p className="text-xs mt-0.5 italic" style={{ color: '#8DA4C4' }}>
                  Protecting margins.
                </p>
              </div>
            </div>

            {/* User controls */}
            <div className="flex items-center gap-4">
              <CompanySelector authUser={authUser} />
              <div className="flex items-center gap-3 pl-4"
                style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-medium text-white">{authUser.email}</p>
                  <p className="text-xs capitalize" style={{ color: '#8DA4C4' }}>{authUser.role}</p>
                </div>
                <button
                  onClick={onLogout}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{ color: '#8DA4C4', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent' }}
                  onMouseEnter={e => { e.target.style.color = 'white'; e.target.style.borderColor = 'rgba(255,255,255,0.4)' }}
                  onMouseLeave={e => { e.target.style.color = '#8DA4C4'; e.target.style.borderColor = 'rgba(255,255,255,0.15)' }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="container mx-auto px-6">
            <nav className="flex space-x-1">
              {navItems.map(item => {
                const active = isActive(item.path)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="flex items-center px-4 py-4 text-sm font-medium transition-all"
                    style={{
                      color:           active ? GOLD : '#8DA4C4',
                      borderBottom:    active ? `2px solid ${GOLD}` : '2px solid transparent',
                      textDecoration:  'none',
                    }}
                  >
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* ── Page content ───────────────────────────────────────────────── */}
      <div className="container mx-auto px-6 py-8">
        {children}
      </div>
    </div>
  )
}

// ── Authenticated route tree ─────────────────────────────────────────────────

function AuthenticatedApp({ authUser, onLogout }) {
  const { companyLoading, selectedCompanyId } = useCompany()

  // Block rendering until CompanyContext has resolved from the API.
  // The sync localStorage init means selectedCompanyId is usually set immediately,
  // but companyLoading guards the edge case where localStorage had no saved ID.
  if (companyLoading && !selectedCompanyId) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#F3F4F6' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: '#1A2744', borderTopColor: 'transparent' }} />
          <p className="text-sm text-gray-500">Loading your portfolio…</p>
        </div>
      </div>
    )
  }

  return (
    <AppShell authUser={authUser} onLogout={onLogout}>
      <Routes>
        {/* Default — redirect / to /dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={<Dashboard />} />

        {/* Hedging — wildcard keeps same component instance for sub-paths */}
        <Route path="/hedging/*" element={<HedgingPage />} />

        {/* Reports — wildcard so sub-path changes don't remount */}
        <Route path="/reports/*" element={<Reports />} />

        {/* Settings — wildcard; section driven by URL inside the component */}
        <Route path="/settings/*" element={
          <Settings authUser={authUser} />
        } />

        <Route path="/risk-engine" element={<RiskEngine />} />

        <Route path="/glossary" element={<Glossary />} />

        {/* Legacy redirects */}
        <Route path="/admin"       element={<Navigate to="/settings/admin" replace />} />
        <Route path="/monte-carlo" element={<Navigate to="/risk-engine"    replace />} />
        <Route path="/data-import" element={<Navigate to="/settings/import" replace />} />
        <Route path="/policy"      element={<Navigate to="/settings/policy" replace />} />

        {/* Catch-all — unknown paths go to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  )
}

// ── Root App ─────────────────────────────────────────────────────────────────

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000 // 60 minutes

function App() {
  const [authData, setAuthData] = useState(null)
  const [checking, setChecking] = useState(true)
  const [inactivityMessage, setInactivityMessage] = useState('')

  useEffect(() => {
    const stored = getStoredAuth()
    if (stored) {
      fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${stored.token}` }
      })
        .then(r => { if (r.ok) setAuthData(stored); else clearAuth() })
        .catch(() => setAuthData(stored))
        .finally(() => setChecking(false))
    } else {
      setChecking(false)
    }
  }, [])

  // ── Inactivity timeout — auto-logout after 60 minutes of no interaction ──
  useEffect(() => {
    if (!authData) return // only active when logged in

    let timer

    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        clearAuth()
        setAuthData(null)
        setInactivityMessage("You've been logged out due to inactivity.")
      }, INACTIVITY_TIMEOUT_MS)
    }

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer() // start the clock

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [authData])

  const handleLoginSuccess = (data) => {
    setInactivityMessage('')
    setAuthData({
      token: data.access_token,
      user: { user_id: data.user_id, email: data.email, company_id: data.company_id, role: data.role }
    })
  }

  const handleLogout = () => { clearAuth(); setAuthData(null); setInactivityMessage('') }

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: NAVY }}>
      <p className="text-sm" style={{ color: '#8DA4C4' }}>Loading…</p>
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        {/* Password reset — public, no auth required */}
        <Route path="/reset-password" element={
          <ResetPassword onDone={() => window.location.href = '/'} />
        } />

        {/* All other routes — gated by auth */}
        {!authData ? (
          <Route path="*" element={
            <Login onLoginSuccess={handleLoginSuccess} notice={inactivityMessage} />
          } />
        ) : (
          <Route path="*" element={
            <CompanyProvider>
              <AuthenticatedApp authUser={authData.user} onLogout={handleLogout} />
            </CompanyProvider>
          } />
        )}
      </Routes>
    </BrowserRouter>
  )
}

export default App
