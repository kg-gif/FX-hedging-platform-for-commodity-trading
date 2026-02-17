import React, { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Edit2, Trash2 } from 'lucide-react'

const API_BASE = 'https://birk-fx-api.onrender.com'

const CURRENCY_FLAGS = {
  'EUR': '🇪🇺', 'USD': '🇺🇸', 'GBP': '🇬🇧', 'JPY': '🇯🇵', 'CHF': '🇨🇭',
  'CNY': '🇨🇳', 'INR': '🇮🇳', 'KRW': '🇰🇷', 'SGD': '🇸🇬', 'HKD': '🇭🇰',
  'MXN': '🇲🇽', 'CAD': '🇨🇦', 'BRL': '🇧🇷', 'AUD': '🇦🇺', 'NZD': '🇳🇿',
  'ZAR': '🇿🇦', 'THB': '🇹🇭', 'MYR': '🇲🇾', 'IDR': '🇮🇩', 'PHP': '🇵🇭'
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function Dashboard({ exposures: propsExposures, loading: propsLoading }) {
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [exposures, setExposures] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [lastRateUpdate, setLastRateUpdate] = useState(null)
  const [error, setError] = useState(null)
  const [policy, setPolicy] = useState(null);
  const [editingExposure, setEditingExposure] = useState(null)
  const [deletingExposure, setDeletingExposure] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [filterCurrency, setFilterCurrency] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterMinAmount, setFilterMinAmount] = useState('')
  const [filterMaxAmount, setFilterMaxAmount] = useState('')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    fetchCompanies()
  }, [])

  useEffect(() => {
    // Use exposures from parent (App.jsx) if provided
    if (propsExposures && propsExposures.length > 0) {
      setExposures(propsExposures)
      console.log('📊 Dashboard using exposures from App.jsx')
    } else if (selectedCompany) {
      // Fallback: fetch if not provided from parent
      fetchExposures(selectedCompany.id)
      fetchExposures()
fetchPolicy();
    }
  }, [selectedCompany, propsExposures])


  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API_BASE}/companies`)
      const data = await response.json()
      setCompanies(data)
      setError(null)
      if (data.length > 0) {
        setSelectedCompany(data[0])
      }
    } catch (err) {
      setError('Failed to fetch companies')
    }
  }

const fetchPolicy = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/policies/1`);
    const data = await response.json();
    setPolicy(data);
  } catch (err) {
    console.error('Failed to fetch policy:', err);
  }
};  

  const fetchExposures = async (companyId) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/exposures?company_id=${companyId}`)
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
      const data = await response.json()
      if (data && data.timestamp) {
        setLastRateUpdate(new Date(data.timestamp))
      }
      await fetchExposures(selectedCompany.id)
    } catch (err) {
      setError('Failed to refresh rates')
    } finally {
      setRefreshing(false)
    }
  }

  const filteredExposures = exposures.filter(exp => {
    if (filterCurrency && `${exp.from_currency} → ${exp.to_currency}` !== filterCurrency) return false
    if (filterStartDate && exp.start_date < filterStartDate) return false
    if (filterEndDate && exp.end_date > filterEndDate) return false
    if (filterMinAmount && exp.amount < parseFloat(filterMinAmount)) return false
    if (filterMaxAmount && exp.amount > parseFloat(filterMaxAmount)) return false
    if (searchText) {
      const search = searchText.toLowerCase()
      const matchRef = exp.reference?.toLowerCase().includes(search)
      const matchDesc = exp.description?.toLowerCase().includes(search)
      if (!matchRef && !matchDesc) return false
    }
    return true
  })

  const clearFilters = () => {
    setFilterCurrency('')
    setFilterStartDate('')
    setFilterEndDate('')
    setFilterMinAmount('')
    setFilterMaxAmount('')
    setSearchText('')
  }

  const handleEditSave = async (updatedExposure) => {
    try {
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${updatedExposure.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedExposure)
      })
      if (response.ok) {
        setShowEditModal(false)
        setEditingExposure(null)
        fetchExposures(selectedCompany.id)
      } else {
        alert('Failed to update exposure')
      }
    } catch (error) {
      console.error('Error updating exposure:', error)
      alert('Error updating exposure')
    }
  }

  const handleDeleteConfirm = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${deletingExposure.id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setShowDeleteConfirm(false)
        setDeletingExposure(null)
        fetchExposures(selectedCompany.id)
      } else {
        alert('Failed to delete exposure')
      }
    } catch (error) {
      console.error('Error deleting exposure:', error)
      alert('Error deleting exposure')
    }
  }

  const exportToCSV = () => {
    const headers = ['Currency Pair', 'Amount', 'Budget Rate', 'Current Rate', 'P&L', 'Status', 'Hedge %', 'Description']
    const rows = filteredExposures.map(exp => [
      `${exp.from_currency} → ${exp.to_currency}`,
      `${exp.amount} ${exp.from_currency}`,
      exp.budget_rate || 'N/A',
      exp.current_rate || 'N/A',
      exp.current_pnl || 0,
      exp.pnl_status || 'N/A',
      `${((exp.hedge_ratio_policy || 1) * 100).toFixed(0)}%`,
      exp.description || ''
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

  const totalValue = exposures.reduce((sum, exp) => sum + (exp.amount * (exp.current_rate || 0)), 0)

  const currencyDistribution = exposures.reduce((acc, exp) => {
    const existing = acc.find(item => item.currency === exp.from_currency)
    const value = Math.abs(exp.amount * (exp.current_rate || 1))
    if (existing) {
      existing.value += value
    } else {
      acc.push({
        currency: exp.from_currency,
        value: value,
        flag: CURRENCY_FLAGS[exp.from_currency] || '🏳️'
      })
    }
    return acc
  }, [])

  const rateChanges = exposures
    .filter(exp => exp.budget_rate && exp.current_rate)
    .map(exp => ({
      currency: exp.from_currency,
      change: ((exp.current_rate - exp.budget_rate) / exp.budget_rate) * 100,
      flag: CURRENCY_FLAGS[exp.from_currency] || '🏳️'
    }))
    .sort((a, b) => b.change - a.change)

  const settlementTimeline = exposures
    .filter(exp => exp.start_date && exp.end_date)
    .map(exp => {
      const end = new Date(exp.end_date)
      const daysRemaining = Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24))
      return {
        currency: `${CURRENCY_FLAGS[exp.from_currency] || '🏳️'} ${exp.from_currency}`,
        days: Math.max(0, daysRemaining),
        value: exp.amount * (exp.current_rate || 1)
      }
    })
    .sort((a, b) => a.days - b.days)

  return (
    <div>
      {!loading && exposures.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Portfolio Overview</h2>
                <p className="text-gray-600 mt-1">{selectedCompany?.name} - Real-time P&L monitoring</p>
               {policy && (
  <span className="inline-block mt-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
    📋 Active Policy: {policy.policy_name} ({Math.round(policy.hedge_ratio_over_5m * 100)}% hedge)
  </span>
)}
              </div>
              {lastUpdated && (
                <div className="text-sm text-gray-500">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center">
                <span className="text-xl mr-2">📊</span>
                Currency Mix
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={currencyDistribution}
                    dataKey="value"
                    nameKey="currency"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={(entry) => `${entry.flag} ${entry.currency}`}
                  >
                    {currencyDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${(value / 1000000).toFixed(1)}M`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center">
                <span className="text-xl mr-2">📈</span>
                Rate vs Budget
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={rateChanges}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="currency" style={{ fontSize: '10px' }} />
                  <YAxis style={{ fontSize: '10px' }} />
                  <Tooltip formatter={(value) => `${value.toFixed(2)}%`} />
                  <Line type="monotone" dataKey="change" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center">
                <span className="text-xl mr-2">📅</span>
                Settlement Timeline
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={settlementTimeline.slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="currency" style={{ fontSize: '10px' }} angle={-45} textAnchor="end" height={60} />
                  <YAxis style={{ fontSize: '10px' }} />
                  <Tooltip formatter={(value) => `${value} days`} />
                  <Bar dataKey="days" radius={[6, 6, 0, 0]} fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 flex items-center justify-between">
        <div className="flex gap-3">
          <button
            onClick={exportToCSV}
            disabled={exposures.length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            📥 Export CSV
          </button>
          <button
            onClick={refreshRates}
            disabled={refreshing}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing...' : '🔄 Refresh Dashboard'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading exposures...</p>
        </div>
      ) : (
        <>
          {/* Filter Panel */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Filter Exposures</h3>
              <button onClick={clearFilters} className="text-sm text-blue-600 hover:text-blue-800">
                Clear All Filters
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Reference or description..."
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Currency Pair</label>
                <select
                  value={filterCurrency}
                  onChange={(e) => setFilterCurrency(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Currencies</option>
                  <option value="EUR/USD">EUR/USD</option>
                  <option value="GBP/USD">GBP/USD</option>
                  <option value="CNY/USD">CNY/USD</option>
                </select>
              </div>
              <div className="flex items-end">
                <div className="text-sm text-gray-600">
                  Showing <span className="font-semibold">{filteredExposures.length}</span> of {exposures.length} exposures
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio Summary */}
          <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md p-6 border border-indigo-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">📊 Portfolio Summary</h3>
            {lastRateUpdate && (
              <div className="text-sm text-gray-500 mb-3">Rates last updated: {lastRateUpdate.toLocaleString()}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-600 mb-1">Total P&L</p>
                <p className={`text-2xl font-bold ${
                  filteredExposures.reduce((sum, exp) => sum + (exp.current_pnl || 0), 0) >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}>
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    signDisplay: 'always',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                  }).format(filteredExposures.reduce((sum, exp) => sum + (exp.current_pnl || 0), 0))}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-600 mb-1">Breaches</p>
                <p className="text-2xl font-bold text-red-600">
                  {filteredExposures.filter(exp => exp.pnl_status === 'BREACH').length}
                  <span className="text-sm text-gray-500 ml-1">exposures</span>
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-600 mb-1">Warnings</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {filteredExposures.filter(exp => exp.pnl_status === 'WARNING').length}
                  <span className="text-sm text-gray-500 ml-1">exposures</span>
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-sm text-gray-600 mb-1">At Risk (Unhedged)</p>
                <p className="text-2xl font-bold text-orange-600">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                  }).format(filteredExposures.reduce((sum, exp) => sum + (exp.unhedged_amount || 0), 0))}
                </p>
              </div>
            </div>
          </div>

          {/* Exposures Table */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Instrument</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hedge %</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredExposures.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {exp.instrument_type || 'Spot'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-lg mr-2">{CURRENCY_FLAGS[exp.from_currency] || '🏳️'}</span>
                        <span className="font-medium">{exp.from_currency} → {exp.to_currency}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {exp.amount.toLocaleString()} {exp.from_currency}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono">
                        {exp.budget_rate ? exp.budget_rate.toFixed(4) : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono">
                        {exp.current_rate ? exp.current_rate.toFixed(4) : '—'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-right font-semibold ${
                        !exp.current_pnl && exp.current_pnl !== 0 ? 'text-gray-500' :
                        exp.current_pnl > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {exp.current_pnl !== null && exp.current_pnl !== undefined
                          ? new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                              signDisplay: 'always'
                            }).format(exp.current_pnl)
                          : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {exp.pnl_status === 'BREACH' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">🔴 BREACH</span>}
                        {exp.pnl_status === 'WARNING' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">🟡 WARNING</span>}
                        {exp.pnl_status === 'TARGET_MET' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">🎯 TARGET</span>}
                        {exp.pnl_status === 'OK' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">🟢 OK</span>}
                        {!exp.pnl_status && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">—</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center font-medium">
                        {exp.hedge_ratio_policy ? `${(exp.hedge_ratio_policy * 100).toFixed(0)}%` : '100%'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{exp.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => { setEditingExposure(exp); setShowEditModal(true); }}
                          className="text-blue-600 hover:text-blue-800 mr-3"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => { setDeletingExposure(exp); setShowDeleteConfirm(true); }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {showEditModal && editingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
            <h2 className="text-2xl font-bold mb-6">Edit Exposure</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Amount</label>
                <input
                  type="number"
                  value={editingExposure.amount}
                  onChange={(e) => setEditingExposure({...editingExposure, amount: parseFloat(e.target.value)})}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={editingExposure.description || ''}
                  onChange={(e) => setEditingExposure({...editingExposure, description: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg"
                  rows="3"
                />
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => { setShowEditModal(false); setEditingExposure(null); }}
                className="px-6 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleEditSave(editingExposure)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && deletingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Delete Exposure?</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this exposure?<br />
              <span className="font-semibold">{deletingExposure.from_currency} → {deletingExposure.to_currency}</span><br />
              Amount: {deletingExposure.amount?.toLocaleString()} {deletingExposure.from_currency}
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeletingExposure(null); }}
                className="px-6 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard