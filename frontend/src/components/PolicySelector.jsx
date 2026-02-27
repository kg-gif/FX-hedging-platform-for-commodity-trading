import React, { useState, useEffect } from 'react'

const API_BASE = 'https://birk-fx-api.onrender.com'
const NAVY = '#1A2744'
const GOLD = '#C9A86C'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

const POLICY_DESCRIPTIONS = {
  CONSERVATIVE:  'Maximum protection. Hedge 85% of large exposures. Best for tight margin businesses.',
  BALANCED:      'Moderate protection. Hedge 65% of large exposures. Balance between cost and coverage.',
  OPPORTUNISTIC: 'Minimal hedging. Hedge 40% of large exposures. Best when rates are moving in your favour.'
}

function PolicySelector({ onPolicyChange }) {
  const [policies, setPolicies]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [activating, setActivating] = useState(null)
  const [error, setError]           = useState(null)

  useEffect(() => { loadPolicies() }, [])

  function loadPolicies() {
    fetch(`${API_BASE}/api/policies?company_id=1`, { headers: authHeaders() })
      .then(res => res.json())
      .then(data => { setPolicies(data.policies); setLoading(false) })
      .catch(() => { setError('Failed to load policies'); setLoading(false) })
  }

  function activatePolicy(policyId) {
    setActivating(policyId)
    fetch(`${API_BASE}/api/policies/${policyId}/activate?company_id=1`, { method: 'POST', headers: authHeaders() })
      .then(res => res.json())
      .then(() => {
        loadPolicies()
        setActivating(null)
        if (onPolicyChange) onPolicyChange()
      })
      .catch(() => { setError('Failed to activate policy'); setActivating(null) })
  }

  if (loading) return <p className="text-gray-400 p-6">Loading policies...</p>
  if (error)   return <p className="text-red-600 p-6">{error}</p>

  const activePolicy = policies.find(p => p.is_active)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl shadow-md p-6" style={{ background: NAVY }}>
        <h2 className="text-2xl font-bold text-white">Hedging Policy</h2>
        <p className="text-sm mt-1" style={{ color: '#8DA4C4' }}>
          Active policy: <span style={{ color: GOLD, fontWeight: 600 }}>
            {activePolicy ? activePolicy.policy_name : 'None'}
          </span>
        </p>
      </div>

      {/* Policy cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {policies.map((policy) => {
          const isActive     = policy.is_active
          const isActivating = activating === policy.id

          return (
            <div
              key={policy.id}
              className="bg-white rounded-xl shadow-md p-6 border-2 transition-all"
              style={{
                borderColor: isActive ? GOLD : '#E5E7EB',
                boxShadow: isActive ? `0 0 0 1px ${GOLD}` : undefined
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ color: NAVY }}>
                  {policy.policy_name}
                </h3>
                {isActive && (
                  <span className="px-2 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(201,168,108,0.15)', color: GOLD, border: `1px solid ${GOLD}` }}>
                    ACTIVE
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-4">
                {[
                  { label: 'Large exposures (>$5M)',  value: Math.round(policy.hedge_ratio_over_5m * 100) },
                  { label: 'Mid exposures ($1-5M)',   value: Math.round(policy.hedge_ratio_1m_to_5m * 100) },
                  { label: 'Small exposures (<$1M)',  value: Math.round(policy.hedge_ratio_under_1m * 100) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-semibold" style={{ color: NAVY }}>{value}%</span>
                  </div>
                ))}
              </div>

              {/* Coverage bar */}
              <div className="h-1.5 rounded-full bg-gray-100 mb-4">
                <div className="h-1.5 rounded-full"
                  style={{
                    width: `${Math.round(policy.hedge_ratio_over_5m * 100)}%`,
                    background: isActive ? GOLD : '#CBD5E1'
                  }} />
              </div>

              <p className="text-xs text-gray-400 mb-4">
                {POLICY_DESCRIPTIONS[policy.policy_type]}
              </p>

              <button
                onClick={() => activatePolicy(policy.id)}
                disabled={isActive || isActivating}
                className="w-full py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: isActive ? 'rgba(201,168,108,0.1)' : NAVY,
                  color:      isActive ? GOLD : 'white',
                  cursor:     isActive ? 'default' : 'pointer',
                  border:     isActive ? `1px solid ${GOLD}` : 'none'
                }}
              >
                {isActivating ? 'Activating...' : isActive ? 'Current Policy' : 'Activate'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PolicySelector