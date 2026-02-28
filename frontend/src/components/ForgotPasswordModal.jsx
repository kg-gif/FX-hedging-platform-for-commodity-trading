import { useState } from 'react'

const NAVY = '#1A2744'
const GOLD = '#C9A86C'
const API_URL = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'

export default function ForgotPasswordModal({ onClose }) {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await fetch(`${API_URL}/api/auth/forgot-password?email=${encodeURIComponent(email.trim())}`, {
        method: 'POST'
      })
      setSent(true)
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-8 shadow-2xl mx-4"
        style={{ background: '#1A2744', border: '1px solid rgba(201,168,108,0.2)' }}>

        {sent ? (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">📬</div>
              <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
              <p className="text-sm" style={{ color: '#8DA4C4' }}>
                If that email exists in our system, a reset link has been sent.
                The link expires in <strong style={{ color: GOLD }}>1 hour</strong>.
              </p>
            </div>
            <button onClick={onClose}
              className="w-full py-3 rounded-lg font-semibold text-sm"
              style={{ background: GOLD, color: NAVY }}>
              Back to login
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-white mb-1">Reset password</h2>
            <p className="text-sm mb-6" style={{ color: '#8DA4C4' }}>
              Enter your email and we'll send you a reset link.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="mb-5">
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                  style={{ color: '#8DA4C4' }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
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
                <div className="mb-4 px-4 py-3 rounded-lg text-sm"
                  style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#FCA5A5' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-lg font-semibold text-sm mb-3"
                style={{ background: loading ? 'rgba(201,168,108,0.5)' : GOLD, color: NAVY }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <button type="button" onClick={onClose}
                className="w-full py-3 rounded-lg text-sm"
                style={{ background: 'transparent', color: '#8DA4C4', border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancel
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
