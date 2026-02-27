import React, { useState } from 'react'

const NAVY = '#1A2744'
const GOLD = '#C9A86C'
const API_URL = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Login failed')
      }
      const data = await response.json()
      localStorage.setItem('auth_token', data.access_token)
      localStorage.setItem('auth_email', data.email)
      localStorage.setItem('auth_company_id', String(data.company_id))
      localStorage.setItem('auth_role', data.role)
      onLogin(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F2F7' }}>
      <div className="w-full max-w-md px-4">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div
              className="w-12 h-12 rounded flex items-center justify-center"
              style={{ border: `1px solid ${GOLD}`, background: NAVY }}
            >
              <span
                className="text-xs font-bold leading-tight text-center"
                style={{ color: GOLD, letterSpacing: '0.05em' }}
              >
                sum +<br />
                no &nbsp;−<br />
                how =
              </span>
            </div>
            <span
              className="text-2xl font-bold tracking-widest uppercase"
              style={{ color: NAVY, letterSpacing: '0.15em' }}
            >
              sumnohow
            </span>
          </div>
          <p className="text-sm italic" style={{ color: '#8DA4C4' }}>
            Know your FX position. Before it costs you.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-bold mb-6" style={{ color: NAVY }}>
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none"
                style={{ borderColor: '#D1D9E6' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: NAVY }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none"
                style={{ borderColor: '#D1D9E6' }}
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-white font-semibold rounded-lg transition-opacity"
              style={{ background: NAVY, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
