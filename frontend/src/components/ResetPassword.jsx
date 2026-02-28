import { useState, useEffect } from 'react'

const NAVY = '#1A2744'
const GOLD = '#C9A86C'
const API_URL = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'

export default function ResetPassword({ onDone }) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [success, setSuccess]     = useState(false)
  const [error, setError]         = useState('')
  const [token, setToken]         = useState('')

  useEffect(() => {
    // Extract token from URL: /reset-password?token=xxx
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (!t) setError('Invalid reset link. Please request a new one.')
    else setToken(t)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `${API_URL}/api/auth/reset-password?token=${encodeURIComponent(token)}&new_password=${encodeURIComponent(password)}`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Reset failed. Please request a new link.')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: NAVY }}>

      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="w-20 h-20 rounded-lg flex items-center justify-center mx-auto mb-4"
          style={{ border: `1px solid ${GOLD}`, background: 'rgba(201,168,108,0.08)' }}>
          <span className="text-sm font-bold leading-tight text-center"
            style={{ color: GOLD, letterSpacing: '0.05em' }}>
            sum +<br />no &nbsp;−<br />how =
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-widest uppercase"
          style={{ color: GOLD, letterSpacing: '0.15em' }}>
          sumnohow
        </h1>
      </div>

      <div className="w-full max-w-md rounded-2xl p-8 shadow-2xl mx-4"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,108,0.2)' }}>

        {success ? (
          <div className="text-center">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-xl font-semibold text-white mb-2">Password updated</h2>
            <p className="text-sm mb-6" style={{ color: '#8DA4C4' }}>
              Your password has been changed successfully.
            </p>
            <button onClick={onDone}
              className="w-full py-3 rounded-lg font-semibold text-sm"
              style={{ background: GOLD, color: NAVY }}>
              Back to login
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-white mb-1">Set new password</h2>
            <p className="text-sm mb-6" style={{ color: '#8DA4C4' }}>
              Choose a strong password for your account.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                  style={{ color: '#8DA4C4' }}>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Min. 8 characters"
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white'
                  }}
                  onFocus={e => e.target.style.borderColor = GOLD}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
                />
              </div>

              <div className="mb-6">
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                  style={{ color: '#8DA4C4' }}>Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="Repeat password"
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white'
                  }}
                  onFocus={e => e.target.style.borderColor = GOLD}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
                />
              </div>

              {error && (
                <div className="mb-5 px-4 py-3 rounded-lg text-sm"
                  style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#FCA5A5' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !token}
                className="w-full py-3 rounded-lg font-semibold text-sm"
                style={{ background: loading ? 'rgba(201,168,108,0.5)' : GOLD, color: NAVY }}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
