// Login.jsx — Phase 3 real-data port for the /rebuild route
//
// Auth logic ported from the legacy (already-live, already-approved) Login.jsx —
// see CIPHER_REVIEW_LOGIN.md. Cookie-based: POST /api/auth/login with
// credentials: 'include', HttpOnly cookie set by the server. Only non-sensitive
// identity fields go to localStorage — never a token.
//
// Design: design-system tokens only, no raw hex (SNH_BRAND_GUIDE.md). Reuses
// Card/Button/EyebrowLabel rather than re-implementing form chrome.

import { useState } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import { API_BASE } from '../../utils/api'

// ── Password field with show/hide toggle ──────────────────────────────────────
function PasswordField({ value, onChange }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        required
        autoComplete="current-password"
        placeholder="••••••••"
        style={{
          width: '100%', padding: '12px 44px 12px 14px',
          borderRadius: 'var(--radius-3)',
          border: '1px solid var(--border-1)',
          background: 'var(--bg-surface)',
          color: 'var(--fg-1)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)',
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--fg-3)', fontSize: 'var(--fs-eyebrow)',
        }}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Login({ onLoginSuccess, notice = '' }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',   // cookie is set by the server on success — no JS token handling
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.detail || 'Login failed. Please check your credentials.')
        return
      }

      // Identity only — never the token. The HttpOnly cookie is the credential.
      localStorage.setItem('auth_user', JSON.stringify({
        user_id: data.user_id, email: data.email,
        company_id: data.company_id, role: data.role,
      }))

      onLoginSuccess(data)
    } catch (err) {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--snh-navy)', padding: 24,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 'var(--radius-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', border: '1px solid var(--snh-gold)',
          background: 'rgba(201,168,108,0.08)',
        }}>
          <span style={{
            fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-bold)',
            lineHeight: 1.3, textAlign: 'center', color: 'var(--snh-gold)',
            letterSpacing: '0.05em',
          }}>
            sum +<br />no &nbsp;−<br />how =
          </span>
        </div>
        <h1 style={{
          fontSize: 'var(--fs-h1)', fontWeight: 'var(--fw-bold)',
          textTransform: 'uppercase', letterSpacing: '0.15em',
          color: 'var(--snh-gold)', margin: 0,
        }}>
          sumnohow
        </h1>
        <p style={{ fontSize: 'var(--fs-body-sm)', fontStyle: 'italic', color: 'var(--snh-slate)', marginTop: 4 }}>
          Protecting margins.
        </p>
      </div>

      {/* Login card */}
      <Card style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.97)' }}>
        <h2 style={{ marginBottom: 4 }}>Sign in</h2>
        <p className="caption" style={{ color: 'var(--fg-2)', marginBottom: 24 }}>
          Access your FX risk dashboard
        </p>

        {notice && (
          <div style={{
            marginBottom: 20, padding: '12px 14px', borderRadius: 'var(--radius-2)',
            background: 'rgba(245,158,11,0.12)', border: '1px solid var(--snh-warning)',
            fontSize: 'var(--fs-body-sm)', color: 'var(--snh-warning)',
          }}>
            {notice}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 18 }}>
            <EyebrowLabel style={{ marginBottom: 8, color: 'var(--fg-3)' }}>Email address</EyebrowLabel>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              style={{
                width: '100%', padding: '12px 14px',
                borderRadius: 'var(--radius-3)',
                border: '1px solid var(--border-1)',
                background: 'var(--bg-surface)',
                color: 'var(--fg-1)',
                fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <EyebrowLabel style={{ marginBottom: 8, color: 'var(--fg-3)' }}>Password</EyebrowLabel>
            <PasswordField value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          {error && (
            <div style={{
              marginBottom: 18, padding: '12px 14px', borderRadius: 'var(--radius-2)',
              background: 'rgba(239,68,68,0.08)', border: '1px solid var(--snh-danger)',
              fontSize: 'var(--fs-body-sm)', color: 'var(--snh-danger)',
            }}>
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="gold"
            size="lg"
            disabled={loading}
            style={{ width: '100%', fontWeight: 'var(--fw-bold)' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 'var(--fs-body-sm)' }}>
          <a href="/reset-password" style={{ color: 'var(--snh-navy)', textDecoration: 'underline', fontWeight: 'var(--fw-bold)' }}>
            Forgot your password?
          </a>
        </p>
      </Card>

      <p style={{ fontSize: 'var(--fs-eyebrow)', color: 'rgba(255,255,255,0.35)', marginTop: 32 }}>
        © 2026 Sumnohow. All rights reserved.
      </p>
    </div>
  )
}
