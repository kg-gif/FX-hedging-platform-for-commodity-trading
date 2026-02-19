import React, { useState, useEffect } from 'react'

const API_BASE = 'https://birk-fx-api.onrender.com'

const POLICY_DESCRIPTIONS = {
  CONSERVATIVE: 'Maximum protection. Hedge 85% of large exposures. Best for tight margin businesses.',
  BALANCED: 'Moderate protection. Hedge 65% of large exposures. Balance between cost and coverage.',
  OPPORTUNISTIC: 'Minimal hedging. Hedge 40% of large exposures. Best when rates are moving in your favour.'
}

const POLICY_COLORS = {
  CONSERVATIVE: { border: '#3b82f6', bg: '#eff6ff', badge: 'bg-blue-100 text-blue-800' },
  BALANCED: { border: '#10b981', bg: '#f0fdf4', badge: 'bg-green-100 text-green-800' },
  OPPORTUNISTIC: { border: '#f59e0b', bg: '#fffbeb', badge: 'bg-yellow-100 text-yellow-800' }
}

function PolicySelector({ onPolicyChange }) {
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadPolicies()
  }, [])

  function loadPolicies() {
    fetch(`${API_BASE}/api/policies?company_id=1`)
      .then(res => res.json())
      .then(data => {
        setPolicies(data.policies)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load policies')
        setLoading(false)
      })
  }

  function activatePolicy(policyId) {
    setActivating(policyId)
    fetch(`${API_BASE}/api/policies/${policyId}/activate?company_id=1`, { method: 'POST' })
      .then(res => res.json())
      .then(() => {
        loadPolicies()
        setActivating(null)
        if (onPolicyChange) onPolicyChange()
      })
      .catch(() => {
        setError('Failed to activate policy')
        setActivating(null)
      })
  }

  if (loading) return <p className="text-gray-500">Loading policies...</p>
  if (error) return <p className="text-red-600">{error}</p>

  const activePolicy = policies.find(p => p.is_active)

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md p-6 border border-indigo-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Hedging Policy</h2>
        <p className="text-gray-600">
          Active policy: <strong>{activePolicy ? activePolicy.policy_name : 'None'}</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {policies.map((policy) => {
          const colors = POLICY_COLORS[policy.policy_type] || POLICY_COLORS.BALANCED
          const isActive = policy.is_active
          const isActivating = activating === policy.id

          return (
            <div
              key={policy.id}
              className="bg-white rounded-lg shadow-md p-6 border-2 transition-all"
              style={{ borderColor: isActive ? colors.border : '#e5e7eb', backgroundColor: isActive ? colors.bg : 'white' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800">{policy.policy_name}</h3>
                {isActive && (
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors.badge}`}>
                    ACTIVE
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Large exposures (&gt;$5M)</span>
                  <span className="font-semibold">{Math.round(policy.hedge_ratio_over_5m * 100)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Mid exposures ($1-5M)</span>
                  <span className="font-semibold">{Math.round(policy.hedge_ratio_1m_to_5m * 100)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Small exposures (&lt;$1M)</span>
                  <span className="font-semibold">{Math.round(policy.hedge_ratio_under_1m * 100)}%</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-4">
                {POLICY_DESCRIPTIONS[policy.policy_type]}
              </p>

              <button
                onClick={() => activatePolicy(policy.id)}
                disabled={isActive || isActivating}
                className={`w-full py-2 rounded-lg font-semibold text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
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