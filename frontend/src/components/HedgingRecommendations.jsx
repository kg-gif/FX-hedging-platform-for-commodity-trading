import React, { useState, useEffect } from 'react'

const API_BASE = 'https://birk-fx-api.onrender.com'

function HedgingRecommendations() {
  const [recommendations, setRecommendations] = useState([])
  const [policy, setPolicy] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/recommendations?company_id=1`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setRecommendations(data.recommendations)
          setPolicy(data.policy)
        }
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load recommendations')
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500 text-lg">Loading recommendations...</p>
    </div>
  )

  if (error) return (
    <div className="bg-red-50 rounded-lg p-6 border border-red-200">
      <p className="text-red-700">⚠️ {error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md p-6 border border-indigo-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">📋 Hedge Recommendations</h2>
        <p className="text-gray-600">Based on your {policy} policy</p>
      </div>

      {/* Empty state */}
      {recommendations.length === 0 && (
        <div className="bg-green-50 rounded-lg p-6 border border-green-200">
          <p className="text-green-700 font-semibold">✅ All exposures are within policy targets. No action required.</p>
        </div>
      )}

      {/* Recommendations */}
      <div className="space-y-4">
        {recommendations.map((rec) => (
          <div
            key={rec.exposure_id}
            className="bg-white rounded-lg shadow-md p-6 border-l-4 hover:shadow-lg transition-shadow"
            style={{
              borderLeftColor: rec.urgency === 'HIGH' ? '#ef4444' : rec.urgency === 'MEDIUM' ? '#f59e0b' : '#10b981'
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xl font-bold text-gray-800">{rec.action}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    rec.urgency === 'HIGH' ? 'bg-red-100 text-red-800' :
                    rec.urgency === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {rec.urgency} PRIORITY
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Currency Pair</p>
                    <p className="font-semibold text-gray-800">{rec.currency_pair}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Target Hedge</p>
                    <p className="font-semibold text-blue-600">{rec.target_ratio}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Instrument</p>
                    <p className="font-semibold text-gray-800">{rec.instrument}</p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-sm text-gray-700">{rec.reason}</p>
                </div>

                <div className="flex items-center justify-end">
                  
                    href="https://wise.com/send/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Execute with Bank →
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <p className="text-sm text-gray-700">
          💡 <strong>Note:</strong> These recommendations are based on your active {policy} policy.
          Actual execution should be confirmed with your bank or FX provider.
        </p>
      </div>
    </div>
  )
}

export default HedgingRecommendations