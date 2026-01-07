import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const API_BASE = 'https://birk-fx-api.onrender.com'

const CURRENCY_FLAGS = {
  'EUR': '🇪🇺', 'USD': '🇺🇸', 'GBP': '🇬🇧', 'JPY': '🇯🇵', 'CHF': '🇨🇭',
  'CNY': '🇨🇳', 'INR': '🇮🇳', 'KRW': '🇰🇷', 'SGD': '🇸🇬', 'HKD': '🇭🇰',
  'MXN': '🇲🇽', 'CAD': '🇨🇦', 'BRL': '🇧🇷', 'AUD': '🇦🇺', 'NZD': '🇳🇿',
  'ZAR': '🇿🇦', 'THB': '🇹🇭', 'MYR': '🇲🇾', 'IDR': '🇮🇩', 'PHP': '🇵🇭',
  'VND': '🇻🇳', 'RUB': '🇷🇺', 'TRY': '🇹🇷', 'PLN': '🇵🇱', 'SEK': '🇸🇪',
  'NOK': '🇳🇴', 'DKK': '🇩🇰', 'CZK': '🇨🇿', 'HUF': '🇭🇺', 'ILS': '🇮🇱',
  'CLP': '🇨🇱', 'ARS': '🇦🇷', 'COP': '🇨🇴', 'PEN': '🇵🇪', 'EGP': '🇪🇬',
  'SAR': '🇸🇦', 'AED': '🇦🇪', 'KWD': '🇰🇼', 'QAR': '🇶🇦', 'NGN': '🇳🇬'
}
function App() {
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [exposures, setExposures] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)

  // Fetch companies on mount
  useEffect(() => {
    fetchCompanies()
  }, [])

  // Fetch exposures when company changes
  useEffect(() => {
    if (selectedCompany) {
      fetchExposures(selectedCompany.id)
    }
  }, [selectedCompany])

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API_BASE}/companies`)
      const data = await response.json()
      setCompanies(data)
      if (data.length > 0) {
        setSelectedCompany(data[0])
      }
    } catch (err) {
      setError('Failed to fetch companies')
    }
  }

  const fetchExposures = async (companyId) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/companies/${companyId}/exposures`)
      const data = await response.json()
      setExposures(data)
      setLastUpdated(new Date())
    } catch (err) {
      setError('Failed to fetch exposures')
    } finally {
      setLoading(false)
    }
  }

  const refreshRates = async () => {
    if (!selectedCompany) return
    setRefreshing(true)
    try {
      const response = await fetch(`${API_BASE}/companies/${selectedCompany.id}/refresh-rates`, {
        method: 'POST'
      })
      await response.json()
      await fetchExposures(selectedCompany.id)
    } catch (err) {
      setError('Failed to refresh rates')
    } finally {
      setRefreshing(false)
    }
  }

  const totalValue = exposures.reduce((sum, exp) => sum + (exp.current_value_usd || 0), 0)

// Calculate summary statistics
  const stats = {
    totalExposures: exposures.length,
    highRiskCount: exposures.filter(e => e.risk_level === 'High').length,
    avgRate: exposures.length > 0 
      ? exposures.reduce((sum, e) => sum + (e.rate_change_pct || 0), 0) / exposures.length 
      : 0,
    largestExposure: exposures.length > 0
      ? Math.max(...exposures.map(e => e.current_value_usd))
      : 0
  }

  const getRiskBadgeColor = (risk) => {
    if (risk === 'High') return 'bg-red-100 text-red-800'
    if (risk === 'Medium') return 'bg-yellow-100 text-yellow-800'
    return 'bg-green-100 text-green-800'
  }

  const getRateChangeDisplay = (exp) => {
    const pct = exp.rate_change_pct || 0
    const dir = exp.rate_change_direction || 'neutral'
    
    if (dir === 'neutral') return <span className="text-gray-500">→ {pct.toFixed(2)}%</span>
    if (dir === 'up') return <span className="text-green-600">↑ +{pct.toFixed(2)}%</span>
    return <span className="text-red-600">↓ {pct.toFixed(2)}%</span>
  }

const exportToCSV = () => {
    const headers = ['Currency Pair', 'Amount', 'Rate', 'Change %', 'USD Value', 'Period', 'Risk', 'Description']
    const rows = exposures.map(exp => [
      `${exp.from_currency}/${exp.to_currency}`,
      `${exp.amount} ${exp.from_currency}`,
      exp.current_rate.toFixed(4),
      (exp.rate_change_pct || 0).toFixed(2) + '%',
      exp.current_value_usd.toFixed(2),
      `${exp.settlement_period} days`,
      exp.risk_level,
      exp.description
    ])
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedCompany?.name || 'exposures'}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">BIRK FX Risk Management</h1>
              <p className="text-gray-600 mt-1">Real-time currency exposure monitoring</p>
            </div>
            {lastUpdated && (
              <div className="text-sm text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
{/* Summary Cards */}
        {!loading && exposures.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Total Portfolio</div>
              <div className="text-2xl font-bold text-blue-600">
                ${totalValue.toLocaleString()}
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Exposures</div>
              <div className="text-2xl font-bold text-gray-800">
                {stats.totalExposures}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {stats.highRiskCount} High Risk
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Avg Rate Change</div>
              <div className={`text-2xl font-bold ${stats.avgRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.avgRate >= 0 ? '↑' : '↓'} {Math.abs(stats.avgRate).toFixed(2)}%
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Largest Exposure</div>
              <div className="text-2xl font-bold text-purple-600">
                ${stats.largestExposure.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Company Selector & Actions */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Company:</label>
            <select 
              value={selectedCompany?.id || ''}
              onChange={(e) => setSelectedCompany(companies.find(c => c.id === parseInt(e.target.value)))}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
  

<div className="flex gap-3">
            <button
              onClick={exportToCSV}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              📥 Export CSV
            </button>
            <button
              onClick={refreshRates}
              disabled={refreshing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : '🔄 Refresh Rates'}
            </button>
          </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Exposures Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading exposures...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency Pair</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Change</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">USD Value</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Period</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Risk</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {exposures.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-lg mr-2">{CURRENCY_FLAGS[exp.from_currency] || '🏳️'}</span>
                        <span className="font-medium">{exp.from_currency}/{exp.to_currency}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {exp.amount.toLocaleString()} {exp.from_currency}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono">
                        {exp.current_rate.toFixed(4)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getRateChangeDisplay(exp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-semibold">
                        ${exp.current_value_usd.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {exp.settlement_period} days
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRiskBadgeColor(exp.risk_level)}`}>
                          {exp.risk_level}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {exp.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-right font-bold text-gray-700">
                      Total Portfolio Value:
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-lg text-blue-600">
                      ${totalValue.toLocaleString()}
                    </td>
                    <td colSpan="3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)