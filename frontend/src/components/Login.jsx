import { useState } from 'react'
import ForgotPasswordModal from './ForgotPasswordModal'

const NAVY = '#1A2744'
const GOLD = '#C9A86C'
const API_URL = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForgot, setShowForgot] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.detail || 'Login failed. Please check your credentials.')
        return
      }

      // Store token and user info
      localStorage.setItem('auth_token', data.access_token)
      localStorage.setItem('auth_user', JSON.stringify({
        user_id: data.user_id,
        email: data.email,
        company_id: data.company_id,
        role: data.role
      }))

      onLoginSuccess(data)

    } catch (err) {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: NAVY }}
    >
      {/* Logo */}
      <div className="mb-10 text-center">
        <div
          className="w-20 h-20 rounded-lg flex items-center justify-center mx-auto mb-4"
          style={{ border: `1px solid ${GOLD}`, background: 'rgba(201,168,108,0.08)' }}
        >
          <span
            className="text-sm font-bold leading-tight text-center"
            style={{ color: GOLD, letterSpacing: '0.05em' }}
          >
            sum +<br />
            no &nbsp;−<br />
            how =
          </span>
        </div>
        <h1
          className="text-3xl font-bold tracking-widest uppercase"
          style={{ color: GOLD, letterSpacing: '0.15em' }}
        >
          sumnohow
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: '#8DA4C4' }}>
          Know your FX position. Before it costs you.
        </p>
      </div>

      {/* Login card */}
      <div
        className="w-full max-w-md rounded-2xl p-8 shadow-2xl"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,108,0.2)' }}
      >
        <h2 className="text-xl font-semibold mb-1 text-white">Sign in</h2>
        <p className="text-sm mb-8" style={{ color: '#8DA4C4' }}>
          Access your FX risk dashboard
        </p>

        <form onSubmit={handleLogin}>
          {/* Email */}
          <div className="mb-5">
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#8DA4C4' }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'white'
              }}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
            />
          </div>

          {/* Password */}
          <div className="mb-6">
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#8DA4C4' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'white'
              }}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              className="mb-5 px-4 py-3 rounded-lg text-sm"
              style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#FCA5A5' }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-sm transition-all"
            style={{
              background: loading ? 'rgba(201,168,108,0.5)' : GOLD,
              color: NAVY,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: '#8DA4C4' }}>
          <button onClick={() => setShowForgot(true)}
            style={{ color: GOLD, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Forgot your password?
          </button>
        </p>
        {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
      </div>

      <p className="text-xs mt-8" style={{ color: 'rgba(141,164,196,0.4)' }}>
        © 2024 Sumnohow. All rights reserved.
      </p>
    </div>
  )
}
