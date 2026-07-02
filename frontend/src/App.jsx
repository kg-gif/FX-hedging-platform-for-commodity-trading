// App.jsx — top-level routing for the SNH rebuild frontend
//
// DEPLOYMENT NOTE: Render must have a wildcard rewrite rule:
//   Source: /*   Destination: /index.html   Action: Rewrite
// Without this, direct URL access and page refresh breaks on all routes.
//
// This App serves only the rebuild routes. The legacy authenticated routes
// (Dashboard, Hedging, etc.) live in the old frontend build at root src/.
//
// Login Phase 3 (02 Jul 2026) — /rebuild is now gated. Auth pattern mirrors
// the already-live, already-approved legacy App.jsx (GET /api/auth/me on
// load, HttpOnly cookie via credentials:'include', POST /api/auth/logout).
// See CIPHER_REVIEW_LOGIN.md. NOT copied to MAIN automatically — this file
// needs Axel's explicit confirmation at deploy time (standing rule).
//
// Deliberately does NOT include the legacy app's inactivity auto-logout —
// out of scope for this build (scope-expansion rule); flagged as a follow-up.

import { useState, useEffect } from 'react'
import {
  BrowserRouter, Routes, Route, Navigate,
} from 'react-router-dom'
import { CompanyProvider } from './contexts/CompanyContext'
import DesignDemo from './components/screens/DesignDemo'
import RebuildShell from './components/screens/RebuildShell'
import Legal from './components/screens/Legal'
import Login from './components/screens/Login'
import { API_BASE } from './utils/api'

function clearAuth() {
  localStorage.removeItem('auth_user')
}

// ── Root App ──────────────────────────────────────────────────────────────────

function App() {
  const [authData, setAuthData]   = useState(null)
  const [checking, setChecking]   = useState(true)
  const [notice, setNotice]       = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
      .then(async r => {
        if (r.ok) {
          const me = await r.json()
          setAuthData({ user: { user_id: me.user_id, email: me.email, company_id: me.company_id, role: me.role } })
        } else {
          // Fail closed — unlike the legacy app, there's no prior verified
          // session to fall back to here. 401 or network error both mean
          // "show Login" (Cipher condition 3, CIPHER_REVIEW_LOGIN.md).
          clearAuth()
          setAuthData(null)
        }
      })
      .catch(() => { clearAuth(); setAuthData(null) })
      .finally(() => setChecking(false))
  }, [])

  function handleLoginSuccess(data) {
    setNotice('')
    setAuthData({
      user: { user_id: data.user_id, email: data.email, company_id: data.company_id, role: data.role },
    })
  }

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch (_) {
      // ignore — clear local state regardless
    }
    clearAuth()
    setAuthData(null)
    setNotice('')
  }

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--snh-navy, #1A2744)',
      }}>
        <p style={{ fontSize: 14, color: '#8DA4C4' }}>Loading…</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — no auth gate */}
        <Route path="/rebuild-demo" element={<DesignDemo />} />
        <Route path="/legal"        element={<Legal />} />

        {/* /rebuild — gated */}
        <Route path="/rebuild" element={
          authData
            ? <CompanyProvider><RebuildShell authUser={authData.user} onLogout={handleLogout} /></CompanyProvider>
            : <Login onLoginSuccess={handleLoginSuccess} notice={notice} />
        } />

        {/* All other paths — redirect to rebuild */}
        <Route path="*" element={<Navigate to="/rebuild" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
