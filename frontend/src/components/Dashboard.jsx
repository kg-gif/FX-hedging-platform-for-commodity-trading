import React, { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Edit2, Trash2 } from 'lucide-react';

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

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function Dashboard() {
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [exposures, setExposures] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
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
// Filter exposures based on criteria
const filteredExposures = exposures.filter(exp => {
  // Currency filter
  if (filterCurrency && exp.currency_pair !== filterCurrency) return false
  
  // Date range filter
  if (filterStartDate && exp.start_date < filterStartDate) return false
  if (filterEndDate && exp.end_date > filterEndDate) return false
  
  // Amount range filter
  if (filterMinAmount && exp.amount < parseFloat(filterMinAmount)) return false
  if (filterMaxAmount && exp.amount > parseFloat(filterMaxAmount)) return false
  
  // Search text filter (reference number or description)
  if (searchText) {
    const search = searchText.toLowerCase()
    const matchRef = exp.reference_number?.toLowerCase().includes(search)
    const matchDesc = exp.description?.toLowerCase().includes(search)
    if (!matchRef && !matchDesc) return false
  }
  
  return true
})

// Clear all filters
const clearFilters = () => {
  setFilterCurrency('')
  setFilterStartDate('')
  setFilterEndDate('')
  setFilterMinAmount('')
  setFilterMaxAmount('')
  setSearchText('')
}

// Handle edit exposure
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
      fetchExposures(selectedCompany.id) // Refresh the list
    } else {
      alert('Failed to update exposure')
    }
  } catch (error) {
    console.error('Error updating exposure:', error)
    alert('Error updating exposure')
  }
}

// Handle delete exposure
const handleDeleteConfirm = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${deletingExposure.id}`, {
      method: 'DELETE'
    })
    
    if (response.ok) {
      setShowDeleteConfirm(false)
      setDeletingExposure(null)
      fetchExposures(selectedCompany.id) // Refresh the list
    } else {
      alert('Failed to delete exposure')
    }
  } catch (error) {
    console.error('Error deleting exposure:', error)
    alert('Error deleting exposure')
  }
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

  const totalValue = exposures.reduce((sum, exp) => sum + (exp.current_value_usd || 0), 0)

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

  const currencyDistribution = exposures.reduce((acc, exp) => {
    const existing = acc.find(item => item.currency === exp.from_currency)
    if (existing) {
      existing.value += exp.current_value_usd
    } else {
      acc.push({
        currency: exp.from_currency,
        value: exp.current_value_usd,
        flag: CURRENCY_FLAGS[exp.from_currency] || '🏳️'
      })
    }
    return acc
  }, [])

  const riskDistribution = [
    { risk: 'High', count: exposures.filter(e => e.risk_level === 'High').length, color: '#ef4444' },
    { risk: 'Medium', count: exposures.filter(e => e.risk_level === 'Medium').length, color: '#eab308' },
    { risk: 'Low', count: exposures.filter(e => e.risk_level === 'Low').length, color: '#22c55e' }
  ].filter(item => item.count > 0)

  const rateChanges = exposures.map(exp => ({
    currency: exp.from_currency,
    change: exp.rate_change_pct || 0,
    flag: CURRENCY_FLAGS[exp.from_currency] || '🏳️'
  })).sort((a, b) => b.change - a.change)

  const settlementTimeline = exposures.map(exp => ({
    currency: `${CURRENCY_FLAGS[exp.from_currency] || '🏳️'} ${exp.from_currency}`,
    days: exp.settlement_period,
    value: exp.current_value_usd,
    risk: exp.risk_level
  })).sort((a, b) => a.days - b.days)

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

  return (
    <div>
      {/* Stats Cards */}
      {!loading && exposures.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Portfolio Overview</h2>
                <p className="text-gray-600 mt-1">
                  {selectedCompany?.name} - Real-time exposure analytics
                </p>
              </div>
              {lastUpdated && (
                <div className="text-sm text-gray-500">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

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

          {/* Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center">
                <span className="text-xl mr-2">📊</span>
                Currency Mix
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={currencyDistribution}
                    dataKey="value"
                    nameKey="currency"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry) => `${entry.flag} ${entry.currency}`}
                    labelLine={false}
                  >
                    {currencyDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${(value / 1000000).toFixed(1)}M`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-xs text-gray-600 text-center mt-2">
                ${(totalValue / 1000000).toFixed(1)}M Total
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center">
                <span className="text-xl mr-2">⚠️</span>
                Risk Levels
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={riskDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="risk" style={{ fontSize: '12px' }} />
                  <YAxis allowDecimals={false} style={{ fontSize: '12px' }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="text-xs text-gray-600 text-center mt-2">
                {exposures.length} Total Exposures
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center">
                <span className="text-xl mr-2">📈</span>
                Rate Changes
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={rateChanges}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="currency" style={{ fontSize: '10px' }} />
                  <YAxis style={{ fontSize: '10px' }} />
                  <Tooltip formatter={(value) => `${value.toFixed(2)}%`} />
                  <Line 
                    type="monotone" 
                    dataKey="change" 
                    stroke="#3b82f6" 
                    strokeWidth={2} 
                    dot={{ r: 4, fill: '#3b82f6' }} 
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-xs text-gray-600 text-center mt-2">
                Avg: {stats.avgRate >= 0 ? '↑' : '↓'} {Math.abs(stats.avgRate).toFixed(2)}%
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center">
                <span className="text-xl mr-2">📅</span>
                Settlement Days
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={settlementTimeline.slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="currency" style={{ fontSize: '10px' }} angle={-45} textAnchor="end" height={80} />
                  <YAxis style={{ fontSize: '10px' }} />
                  <Tooltip formatter={(value) => `${value} days`} />
                  <Bar dataKey="days" radius={[6, 6, 0, 0]}>
                    {settlementTimeline.slice(0, 6).map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.risk === 'High' ? '#ef4444' : entry.risk === 'Medium' ? '#eab308' : '#22c55e'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="text-xs text-gray-600 text-center mt-2">
                {Math.min(...settlementTimeline.map(s => s.days))}-{Math.max(...settlementTimeline.map(s => s.days))} day range
              </div>
            </div>
          </div>
        </>
      )}

      {/* Controls */}
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
            {refreshing ? 'Refreshing...' : '🔄 Refresh Rates'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Loading State */}
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
    <button
      onClick={clearFilters}
      className="text-sm text-blue-600 hover:text-blue-800"
    >
      Clear All Filters
    </button>
  </div>
  
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {/* Search Box */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Search
      </label>
      <input
        type="text"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Reference number or description..."
        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
      />
    </div>
    
    {/* Currency Filter */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Currency Pair
      </label>
      <select
        value={filterCurrency}
        onChange={(e) => setFilterCurrency(e.target.value)}
        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Currencies</option>
        <option value="EUR/USD">EUR/USD</option>
        <option value="GBP/USD">GBP/USD</option>
        <option value="USD/JPY">USD/JPY</option>
        <option value="USD/CNY">USD/CNY</option>
        <option value="USD/MXN">USD/MXN</option>
        <option value="USD/CAD">USD/CAD</option>
      </select>
    </div>
    
    {/* Amount Range */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Amount Range
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          value={filterMinAmount}
          onChange={(e) => setFilterMinAmount(e.target.value)}
          placeholder="Min"
          className="w-1/2 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          value={filterMaxAmount}
          onChange={(e) => setFilterMaxAmount(e.target.value)}
          placeholder="Max"
          className="w-1/2 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
    
    {/* Date Range */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Start Date (From)
      </label>
      <input
        type="date"
        value={filterStartDate}
        onChange={(e) => setFilterStartDate(e.target.value)}
        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
      />
    </div>
    
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        End Date (To)
      </label>
      <input
        type="date"
        value={filterEndDate}
        onChange={(e) => setFilterEndDate(e.target.value)}
        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
      />
    </div>
    
    {/* Results Count */}
    <div className="flex items-end">
      <div className="text-sm text-gray-600">
        Showing <span className="font-semibold">{filteredExposures.length}</span> of {exposures.length} exposures
      </div>
    </div>
  </div>
</div>

{/* Exposures Table */}
<table className="...">

        /* Exposures Table */
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
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredExposures.map((exp) => (
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
<td className="px-6 py-4 whitespace-nowrap text-center">
  <button
    onClick={() => {
      setEditingExposure(exp);
      setShowEditModal(true);
    }}
    className="text-blue-600 hover:text-blue-800 mr-3"
    title="Edit exposure"
  >
    <Edit2 size={18} />
  </button>
  <button
    onClick={() => {
      setDeletingExposure(exp);
      setShowDeleteConfirm(true);
    }}
    className="text-red-600 hover:text-red-800"
    title="Delete exposure"
  >
    <Trash2 size={18} />
  </button>
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
              onClick={() => {
                setShowEditModal(false)
                setEditingExposure(null)
              }}
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
            Are you sure you want to delete this exposure?
            <br />
            <span className="font-semibold">{deletingExposure.from_currency}/{deletingExposure.to_currency}</span>
            <br />
            Amount: ${deletingExposure.amount?.toLocaleString()}
          </p>
          
          <div className="flex justify-end gap-4">
            <button
              onClick={() => {
                setShowDeleteConfirm(false)
                setDeletingExposure(null)
              }}
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
