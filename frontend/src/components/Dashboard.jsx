import React, { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Edit2, Trash2 } from 'lucide-react'

const API_BASE = 'https://birk-fx-api.onrender.com'
const NAVY     = '#1A2744'
const NAVY2    = '#243560'
const GOLD     = '#C9A86C'

const CURRENCY_FLAGS = {
  'EUR': '🇪🇺', 'USD': '🇺🇸', 'GBP': '🇬🇧', 'JPY': '🇯🇵', 'CHF': '🇨🇭',
  'CNY': '🇨🇳', 'INR': '🇮🇳', 'KRW': '🇰🇷', 'SGD': '🇸🇬', 'HKD': '🇭🇰',
  'MXN': '🇲🇽', 'CAD': '🇨🇦', 'BRL': '🇧🇷', 'AUD': '🇦🇺', 'NZD': '🇳🇿',
  'ZAR': '🇿🇦', 'THB': '🇹🇭', 'MYR': '🇲🇾', 'IDR': '🇮🇩', 'PHP': '🇵🇭'
}

const CHART_COLORS = [GOLD, '#2E86AB', '#27AE60', '#E74C3C', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

function Dashboard({ exposures: propsExposures, loading: propsLoading }) {
  const [companies, setCompanies]               = useState([])
  const [selectedCompany, setSelectedCompany]   = useState(null)
  const [exposures, setExposures]               = useState([])
  const [loading, setLoading]                   = useState(false)
  const [refreshing, setRefreshing]             = useState(false)
  const [lastUpdated, setLastUpdated]           = useState(null)
const [error, setError]                       = useState(null)
  const [policy, setPolicy]                     = useState(null)
  const [editingExposure, setEditingExposure]   = useState(null)
  const [deletingExposure, setDeletingExposure] = useState(null)
  const [showEditModal, setShowEditModal]       = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [filterCurrency, setFilterCurrency]     = useState('')
  const [filterStartDate, setFilterStartDate]   = useState('')
  const [filterEndDate, setFilterEndDate]       = useState('')
  const [filterMinAmount, setFilterMinAmount]   = useState('')
  const [filterMaxAmount, setFilterMaxAmount]   = useState('')
  const [searchText, setSearchText]             = useState('')

  useEffect(() => { fetchCompanies() }, [])

  useEffect(() => {
    if (propsExposures && propsExposures.length > 0) {
      setExposures(propsExposures)
    } else if (selectedCompany) {
      fetchExposures(selectedCompany.id)
    }
    fetchPolicy()
  }, [selectedCompany, propsExposures])

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API_BASE}/companies`)
      const data = await response.json()
      setCompanies(data)
      if (data.length > 0) setSelectedCompany(data[0])
    } catch { setError('Failed to fetch companies') }
  }

  const fetchPolicy = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/policies/1`)
      if (response.ok) setPolicy(await response.json())
    } catch { /* silent */ }
  }

  const fetchExposures = async (companyId) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/exposures?company_id=${companyId}`)
      const data = await response.json()
      setExposures(Array.isArray(data) ? data : [])
      setLastUpdated(new Date())
    } catch { setError('Failed to fetch exposures') }
    finally { setLoading(false) }
  }

  const refreshRates = async () => {
    if (!selectedCompany) return
    setRefreshing(true)
    try {
      await fetch(`${API_BASE}/companies/${selectedCompany.id}/refresh-rates`, { method: 'POST' })
      await fetchExposures(selectedCompany.id)
    } catch { setError('Failed to refresh rates') }
    finally { setRefreshing(false) }
  }

  const filteredExposures = exposures.filter(exp => {
    if (filterCurrency && `${exp.from_currency} / ${exp.to_currency}` !== filterCurrency) return false
    if (filterStartDate && exp.start_date < filterStartDate) return false
    if (filterEndDate && exp.end_date > filterEndDate) return false
    if (filterMinAmount && exp.amount < parseFloat(filterMinAmount)) return false
    if (filterMaxAmount && exp.amount > parseFloat(filterMaxAmount)) return false
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!exp.reference?.toLowerCase().includes(s) && !exp.description?.toLowerCase().includes(s)) return false
    }
    return true
  })

  const clearFilters = () => {
    setFilterCurrency(''); setFilterStartDate(''); setFilterEndDate('')
    setFilterMinAmount(''); setFilterMaxAmount(''); setSearchText('')
  }

  const handleEditSave = async (updatedExposure) => {
    try {
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${updatedExposure.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedExposure)
      })
      if (response.ok) {
        setShowEditModal(false); setEditingExposure(null)
        fetchExposures(selectedCompany.id)
      } else { alert('Failed to update exposure') }
    } catch { alert('Error updating exposure') }
  }

  const handleDeleteConfirm = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${deletingExposure.id}`, { method: 'DELETE' })
      if (response.ok) {
        setShowDeleteConfirm(false); setDeletingExposure(null)
        fetchExposures(selectedCompany.id)
      } else { alert('Failed to delete exposure') }
    } catch { alert('Error deleting exposure') }
  }

  const exportToCSV = () => {
    const headers = ['Currency Pair', 'Amount', 'Budget Rate', 'Current Rate', 'P&L', 'Status', 'Hedge %', 'Description']
    const rows = filteredExposures.map(exp => [
      `${exp.from_currency} / ${exp.to_currency}`,
      `${exp.amount} ${exp.from_currency}`,
      exp.budget_rate || 'N/A', exp.current_rate || 'N/A',
      exp.current_pnl || 0, exp.pnl_status || 'N/A',
      `${((exp.hedge_ratio_policy || 1) * 100).toFixed(0)}%`,
      exp.description || ''
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedCompany?.name || 'exposures'}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const currencyDistribution = exposures.reduce((acc, exp) => {
    const existing = acc.find(i => i.currency === exp.from_currency)
    const value = Math.abs(exp.amount * (exp.current_rate || 1))
    if (existing) { existing.value += value }
    else { acc.push({ currency: exp.from_currency, value, flag: CURRENCY_FLAGS[exp.from_currency] || '🏳️' }) }
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
      const days = Math.ceil((new Date(exp.end_date) - new Date()) / 86400000)
      return { currency: `${CURRENCY_FLAGS[exp.from_currency] || '🏳️'} ${exp.from_currency}`, days: Math.max(0, days) }
    })
    .sort((a, b) => a.days - b.days)

  const totalPnl = filteredExposures.reduce((sum, exp) => sum + (exp.current_pnl || 0), 0)

  return (
    <div>
      {!loading && exposures.length > 0 && (
        <>
          {/* Portfolio header */}
          <div className="rounded-xl shadow-lg p-6 mb-6" style={{ background: NAVY }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Portfolio Overview</h2>
                <p className="mt-1 text-sm" style={{ color: '#8DA4C4' }}>
                  {selectedCompany?.name} — Real-time P&amp;L monitoring
                </p>
                {policy && (
                  <span
                    className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(201,168,108,0.15)', color: GOLD, border: `1px solid ${GOLD}` }}
                  >
                    Active Policy: {policy.policy_name} ({Math.round(policy.hedge_ratio_over_5m * 100)}% hedge)
                  </span>
                )}
              </div>
              {lastUpdated && (
                <p className="text-xs" style={{ color: '#8DA4C4' }}>
                  Updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
            {[
              { title: 'Currency Mix', icon: '📊', content: (
                <PieChart>
                  <Pie data={currencyDistribution} dataKey="value" nameKey="currency"
                    cx="50%" cy="50%" outerRadius={70}
                    label={(e) => `${e.flag} ${e.currency}`}>
                    {currencyDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                </PieChart>
              )},
              { title: 'Rate vs Budget', icon: '📈', content: (
                <LineChart data={rateChanges}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="currency" style={{ fontSize: '10px' }} />
                  <YAxis style={{ fontSize: '10px' }} />
                  <Tooltip formatter={(v) => `${v.toFixed(2)}%`} />
                  <Line type="monotone" dataKey="change" stroke={GOLD} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              )},
              { title: 'Settlement Timeline', icon: '📅', content: (
                <BarChart data={settlementTimeline.slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="currency" style={{ fontSize: '10px' }} angle={-45} textAnchor="end" height={60} />
                  <YAxis style={{ fontSize: '10px' }} />
                  <Tooltip formatter={(v) => `${v} days`} />
                  <Bar dataKey="days" radius={[6, 6, 0, 0]} fill={NAVY2} />
                </BarChart>
              )},
            ].map(({ title, icon, content }) => (
              <div key={title} className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-sm font-semibold mb-3 flex items-center" style={{ color: NAVY }}>
                  <span className="mr-2">{icon}</span>{title}
                </h3>
                <ResponsiveContainer width="100%" height={250}>{content}</ResponsiveContainer>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Controls */}
      <div className="bg-white rounded-xl shadow p-4 mb-6 flex items-center gap-3">
        <button onClick={exportToCSV} disabled={exposures.length === 0}
          className="px-5 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: NAVY }}>
          📥 Export CSV
        </button>
        <button onClick={refreshRates} disabled={refreshing}
          className="px-5 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: GOLD }}>
          {refreshing ? 'Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: GOLD }}></div>
          <p className="mt-4 text-gray-500">Loading exposures...</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: NAVY }}>Filter Exposures</h3>
              <button onClick={clearFilters} className="text-sm" style={{ color: GOLD }}>Clear All</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
                <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Reference or description..."
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2"
                  style={{ focusRingColor: GOLD }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Currency Pair</label>
                <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">All Currencies</option>
                  <option value="EUR / USD">EUR / USD</option>
                  <option value="GBP / USD">GBP / USD</option>
                  <option value="JPY / USD">JPY / USD</option>
                </select>
              </div>
              <div className="flex items-end">
                <p className="text-sm text-gray-500">
                  Showing <span className="font-semibold" style={{ color: NAVY }}>{filteredExposures.length}</span> of {exposures.length}
                </p>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              {
                label: 'Total P&L',
                value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'always', maximumFractionDigits: 0 }).format(totalPnl),
                color: totalPnl >= 0 ? '#27AE60' : '#E74C3C'
              },
              {
                label: 'Breaches',
                value: `${filteredExposures.filter(e => e.pnl_status === 'BREACH').length} exposures`,
                color: '#E74C3C'
              },
              {
                label: 'Warnings',
                value: `${filteredExposures.filter(e => e.pnl_status === 'WARNING').length} exposures`,
                color: '#F59E0B'
              },
              {
                label: 'At Risk (Unhedged)',
                value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(filteredExposures.reduce((s, e) => s + (e.unhedged_amount || 0), 0)),
                color: '#F97316'
              }
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Exposures table */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="px-6 py-4" style={{ background: NAVY }}>
              <h3 className="font-semibold text-white">Exposure Register</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead style={{ background: '#F4F6FA' }}>
                  <tr>
                    {['Instrument','Currency','Amount','Budget','Current','P&L','Status','Hedge %','Description','Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: NAVY }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredExposures.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-700">{exp.instrument_type || 'Spot'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="mr-1">{CURRENCY_FLAGS[exp.from_currency] || '🏳️'}</span>
                        <span className="font-medium text-sm" style={{ color: NAVY }}>
                          {exp.from_currency} / {exp.to_currency}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {exp.amount.toLocaleString()} {exp.from_currency}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {exp.budget_rate ? exp.budget_rate.toFixed(4) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {exp.current_rate ? exp.current_rate.toFixed(4) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold`}
                        style={{ color: !exp.current_pnl && exp.current_pnl !== 0 ? '#9CA3AF' : exp.current_pnl > 0 ? '#27AE60' : '#E74C3C' }}>
                        {exp.current_pnl !== null && exp.current_pnl !== undefined
                          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'always' }).format(exp.current_pnl)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {exp.pnl_status === 'BREACH'     && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">🔴 BREACH</span>}
                        {exp.pnl_status === 'WARNING'    && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">🟡 WARNING</span>}
                        {exp.pnl_status === 'TARGET_MET' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">🎯 TARGET</span>}
                        {exp.pnl_status === 'OK'         && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">🟢 OK</span>}
                        {!exp.pnl_status                 && <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: NAVY }}>
                        {exp.hedge_ratio_policy ? `${(exp.hedge_ratio_policy * 100).toFixed(0)}%` : '100%'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{exp.description}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button onClick={() => { setEditingExposure(exp); setShowEditModal(true) }}
                          className="mr-3 hover:opacity-70" style={{ color: NAVY }}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => { setDeletingExposure(exp); setShowDeleteConfirm(true) }}
                          className="hover:opacity-70 text-red-500">
                          <Trash2 size={16} />
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
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
            <h2 className="text-xl font-bold mb-6" style={{ color: NAVY }}>Edit Exposure</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Amount</label>
                <input type="number" value={editingExposure.amount}
                  onChange={(e) => setEditingExposure({ ...editingExposure, amount: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Description</label>
                <textarea value={editingExposure.description || ''}
                  onChange={(e) => setEditingExposure({ ...editingExposure, description: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg" rows="3" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowEditModal(false); setEditingExposure(null) }}
                className="px-5 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleEditSave(editingExposure)}
                className="px-5 py-2 text-white rounded-lg"
                style={{ background: NAVY }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && deletingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-xl font-bold mb-3" style={{ color: NAVY }}>Delete Exposure?</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete<br />
              <span className="font-semibold">{deletingExposure.from_currency} / {deletingExposure.to_currency}</span>
              {' '}— {deletingExposure.amount?.toLocaleString()} {deletingExposure.from_currency}?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeletingExposure(null) }}
                className="px-5 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteConfirm}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
