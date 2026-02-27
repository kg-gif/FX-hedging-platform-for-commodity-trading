import React, { useState, useEffect } from 'react'

const API_BASE = 'https://birk-fx-api.onrender.com'
const NAVY = '#1A2744'
const GOLD = '#C9A86C'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

function HedgingRecommendations() {
  const [recommendations, setRecommendations] = useState([])
  const [policy, setPolicy]                   = useState('')
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState(null)
  const [downloading, setDownloading]         = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/recommendations?company_id=1`, { headers: authHeaders() })
      .then(res => res.json())
      .then(data => {
        if (data.error) { setError(data.error) }
        else { setRecommendations(data.recommendations); setPolicy(data.policy) }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load recommendations'); setLoading(false) })
  }, [])

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const response = await fetch(`${API_BASE}/api/reports/currency-plan?company_id=1`, { headers: authHeaders() })
      if (!response.ok) throw new Error('Failed to generate report')
      const blob = await response.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `currency-plan-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Failed to generate report. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: GOLD }}></div>
    </div>
  )

  if (error) return (
    <div className="bg-red-50 rounded-xl p-6 border border-red-200">
      <p className="text-red-700 text-sm">Error: {error}</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl shadow-md p-6" style={{ background: NAVY }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Hedge Recommendations</h2>
            <p className="text-sm mt-1" style={{ color: '#8DA4C4' }}>
              Based on your {policy} policy
            </p>
          </div>
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-60"
            style={{ background: GOLD, color: NAVY }}
          >
            {downloading ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
                Generating...
              </>
            ) : 'Download Currency Plan'}
          </button>
        </div>
      </div>

      {recommendations.length === 0 && (
        <div className="bg-green-50 rounded-xl p-6 border border-green-200">
          <p className="text-green-700 font-semibold text-sm">
            All exposures are within policy targets. No action required.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {recommendations.map((rec) => (
          <div
            key={rec.exposure_id}
            className="bg-white rounded-xl shadow-sm p-6 border-l-4 hover:shadow-md transition-shadow"
            style={{ borderLeftColor: rec.urgency === 'HIGH' ? '#EF4444' : rec.urgency === 'MEDIUM' ? '#F59E0B' : '#10B981' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-bold" style={{ color: NAVY }}>{rec.action}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                rec.urgency === 'HIGH'   ? 'bg-red-100 text-red-800' :
                rec.urgency === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'
              }`}>
                {rec.urgency} PRIORITY
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Currency Pair', value: rec.currency_pair, highlight: false },
                { label: 'Target Hedge',  value: rec.target_ratio,  highlight: true  },
                { label: 'Instrument',    value: rec.instrument,    highlight: false },
              ].map(({ label, value, highlight }) => (
                <div key={label}>
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="font-semibold text-sm" style={{ color: highlight ? GOLD : NAVY }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600">{rec.reason}</p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => window.open('https://wise.com/send/', '_blank')}
                className="px-5 py-2 text-white rounded-lg text-sm font-semibold"
                style={{ background: NAVY }}
              >
                Execute with Bank
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg p-4 text-sm text-gray-500"
        style={{ background: 'rgba(26,39,68,0.04)', border: '1px solid rgba(26,39,68,0.1)' }}>
        Recommendations are based on your active {policy} policy. Confirm execution with your bank or FX provider.
      </div>
    </div>
  )
}

export default HedgingRecommendations