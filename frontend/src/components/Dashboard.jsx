import React, { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Edit2, Trash2, AlertTriangle, ShieldCheck, TrendingDown, TrendingUp, RefreshCw } from 'lucide-react'
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from '../brand'

const API_BASE = 'https://birk-fx-api.onrender.com'

const CURRENCY_FLAGS = {
  'EUR':'🇪🇺','USD':'🇺🇸','GBP':'🇬🇧','JPY':'🇯🇵','CHF':'🇨🇭',
  'CNY':'🇨🇳','INR':'🇮🇳','MXN':'🇲🇽','CAD':'🇨🇦','BRL':'🇧🇷',
  'AUD':'🇦🇺','NZD':'🇳🇿','ZAR':'🇿🇦'
}
const CHART_COLORS = [GOLD, '#2E86AB', '#27AE60', '#E74C3C', '#8B5CF6', '#EC4899']

const fmt = (n, opts = {}) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, ...opts }).format(n)
const fmtSign = (n) => fmt(n, { signDisplay: 'always' })

function Dashboard({ exposures: propsExposures, loading: propsLoading }) {
  const [companies, setCompanies]                 = useState([])
  const [selectedCompany, setSelectedCompany]     = useState(null)
  const [exposures, setExposures]                 = useState([])
  const [loading, setLoading]                     = useState(false)
  const [refreshing, setRefreshing]               = useState(false)
  const [lastUpdated, setLastUpdated]             = useState(null)
  const [error, setError]                         = useState(null)
  const [policy, setPolicy]                       = useState(null)
  const [editingExposure, setEditingExposure]     = useState(null)
  const [deletingExposure, setDeletingExposure]   = useState(null)
  const [showEditModal, setShowEditModal]         = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [searchText, setSearchText]               = useState('')
  const [filterCurrency, setFilterCurrency]       = useState('')

  useEffect(() => { fetchCompanies() }, [])
  useEffect(() => {
    if (propsExposures?.length > 0) setExposures(propsExposures)
    else if (selectedCompany) fetchExposures(selectedCompany.id)
    fetchPolicy()
  }, [selectedCompany, propsExposures])

  const fetchCompanies = async () => {
    try {
      const data = await fetch(`${API_BASE}/companies`).then(r => r.json())
      setCompanies(data)
      if (data.length > 0) setSelectedCompany(data[0])
    } catch { setError('Failed to fetch companies') }
  }

  const fetchPolicy = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/policies/1`)
      if (r.ok) setPolicy(await r.json())
    } catch {}
  }

  const fetchExposures = async (companyId) => {
    setLoading(true)
    try {
      const data = await fetch(`${API_BASE}/exposures?company_id=${companyId}`).then(r => r.json())
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

  const handleEditSave = async (updated) => {
    try {
      const r = await fetch(`${API_BASE}/api/exposure-data/exposures/${updated.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
      })
      if (r.ok) { setShowEditModal(false); setEditingExposure(null); fetchExposures(selectedCompany.id) }
      else alert('Failed to update')
    } catch { alert('Error updating') }
  }

  const handleDeleteConfirm = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/exposure-data/exposures/${deletingExposure.id}`, { method: 'DELETE' })
      if (r.ok) { setShowDeleteConfirm(false); setDeletingExposure(null); fetchExposures(selectedCompany.id) }
      else alert('Failed to delete')
    } catch { alert('Error deleting') }
  }

  const exportToCSV = () => {
    const headers = ['Instrument','Currency','Amount','Budget Rate','Current Rate','P&L','Status','Hedge %','Description']
    const rows = filteredExposures.map(e => [
      e.instrument_type || 'Spot',
      `${e.from_currency}/${e.to_currency}`,
      `${e.amount} ${e.from_currency}`,
      e.budget_rate || 'N/A', e.current_rate || 'N/A',
      e.current_pnl || 0, e.pnl_status || 'N/A',
      `${((e.hedge_ratio_policy || 1) * 100).toFixed(0)}%`,
      e.description || ''
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = window.URL.createObjectURL(blob)
    a.download = `${selectedCompany?.name || 'exposures'}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const filteredExposures = exposures.filter(exp => {
    if (filterCurrency && `${exp.from_currency}/${exp.to_currency}` !== filterCurrency) return false
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!exp.reference?.toLowerCase().includes(s) && !exp.description?.toLowerCase().includes(s)) return false
    }
    return true
  })

  // ── Derived numbers for CFO story ──
  const totalExposure   = exposures.reduce((s, e) => s + Math.abs(e.amount * (e.current_rate || 1)), 0)
  const totalPnl        = filteredExposures.reduce((s, e) => s + (e.current_pnl || 0), 0)
  const hedgedValue     = exposures.reduce((s, e) => s + (e.hedged_amount || 0), 0)
  const unhedgedValue   = exposures.reduce((s, e) => s + (e.unhedged_amount || 0), 0)
  const breaches        = filteredExposures.filter(e => e.pnl_status === 'BREACH')
  const warnings        = filteredExposures.filter(e => e.pnl_status === 'WARNING')
  const hedgePct        = totalExposure > 0 ? (hedgedValue / totalExposure) * 100 : 0

  const currencyDist = exposures.reduce((acc, e) => {
    const v = Math.abs(e.amount * (e.current_rate || 1))
    const x = acc.find(i => i.currency === e.from_currency)
    if (x) x.value += v
    else acc.push({ currency: e.from_currency, value: v, flag: CURRENCY_FLAGS[e.from_currency] || '🏳️' })
    return acc
  }, [])

  const rateChanges = exposures
    .filter(e => e.budget_rate && e.current_rate)
    .map(e => ({
      currency: e.from_currency,
      change: ((e.current_rate - e.budget_rate) / e.budget_rate) * 100,
      flag: CURRENCY_FLAGS[e.from_currency] || '🏳️'
    }))
    .sort((a, b) => b.change - a.change)

  if (loading) return (
    <div className="text-center py-24">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: GOLD }}></div>
      <p className="mt-4 text-gray-400 text-sm">Loading your portfolio...</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── BREACH ALERT BANNER ── */}
      {breaches.length > 0 && (
        <div className="rounded-xl px-5 py-4 flex items-center gap-3"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertTriangle size={20} color={DANGER} />
          <div>
            <span className="font-bold text-sm" style={{ color: DANGER }}>
              {breaches.length} breach{breaches.length > 1 ? 'es' : ''} require attention —{' '}
            </span>
            <span className="text-sm text-gray-600">
              {breaches.map(e => `${e.from_currency}/${e.to_currency}`).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* ── CFO HERO — 3 answers in 5 seconds ── */}
      {exposures.length > 0 && (
        <div className="rounded-xl p-6" style={{ background: NAVY }}>

          {/* Top row: company + policy + refresh */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">{selectedCompany?.name}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>
                {lastUpdated ? `Rates as of ${lastUpdated.toLocaleTimeString()}` : 'Live portfolio'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {policy && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(201,168,108,0.15)', color: GOLD, border: `1px solid ${GOLD}` }}>
                  {policy.policy_name} Policy
                </span>
              )}
              <button onClick={refreshRates} disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Updating...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* 3 hero numbers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* 1. Total P&L vs budget */}
            <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#8DA4C4' }}>
                Total P&L vs Budget
              </p>
              <div className="flex items-end gap-2">
                {totalPnl >= 0
                  ? <TrendingUp size={28} color={SUCCESS} />
                  : <TrendingDown size={28} color={DANGER} />}
                <span className="text-3xl font-bold" style={{ color: totalPnl >= 0 ? SUCCESS : DANGER }}>
                  {fmtSign(totalPnl)}
                </span>
              </div>
              <p className="text-xs mt-2" style={{ color: '#8DA4C4' }}>
                Across {exposures.length} exposures · {fmt(totalExposure)} total
              </p>
            </div>

            {/* 2. Protection status */}
            <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#8DA4C4' }}>
                Protection Status
              </p>
              <div className="flex items-end gap-2">
                <ShieldCheck size={28} color={hedgePct >= 60 ? SUCCESS : WARNING} />
                <span className="text-3xl font-bold text-white">{hedgePct.toFixed(0)}%</span>
              </div>
              <div className="mt-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)', height: 6 }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(hedgePct, 100)}%`, background: hedgePct >= 60 ? SUCCESS : WARNING }} />
              </div>
              <p className="text-xs mt-2" style={{ color: '#8DA4C4' }}>
                {fmt(hedgedValue)} hedged · {fmt(unhedgedValue)} open
              </p>
            </div>

            {/* 3. Attention required */}
            <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#8DA4C4' }}>
                Requires Attention
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: breaches.length > 0 ? DANGER : '#8DA4C4' }}>
                    Breaches
                  </span>
                  <span className="text-2xl font-bold" style={{ color: breaches.length > 0 ? DANGER : '#8DA4C4' }}>
                    {breaches.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: warnings.length > 0 ? WARNING : '#8DA4C4' }}>
                    Warnings
                  </span>
                  <span className="text-2xl font-bold" style={{ color: warnings.length > 0 ? WARNING : '#8DA4C4' }}>
                    {warnings.length}
                  </span>
                </div>
                {breaches.length === 0 && warnings.length === 0 && (
                  <p className="text-xs pt-1" style={{ color: SUCCESS }}>All exposures within policy</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CHARTS ── */}
      {exposures.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-semibold mb-4" style={{ color: NAVY }}>Currency Mix</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={currencyDist} dataKey="value" nameKey="currency"
                  cx="50%" cy="50%" outerRadius={75}
                  label={(e) => `${e.flag} ${e.currency}`}>
                  {currencyDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-semibold mb-4" style={{ color: NAVY }}>Rate vs Budget (%)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rateChanges}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="currency" style={{ fontSize: '11px' }} />
                <YAxis style={{ fontSize: '11px' }} />
                <Tooltip formatter={(v) => `${v.toFixed(2)}%`} />
                <Bar dataKey="change" radius={[4, 4, 0, 0]}>
                  {rateChanges.map((e, i) => (
                    <Cell key={i} fill={e.change >= 0 ? SUCCESS : DANGER} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── CONTROLS ── */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-wrap items-center gap-3">
        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search reference or description..."
          className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
        <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">All Currencies</option>
          {[...new Set(exposures.map(e => `${e.from_currency}/${e.to_currency}`))].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400">
          {filteredExposures.length} of {exposures.length}
        </span>
        <button onClick={exportToCSV} disabled={!exposures.length}
          className="px-4 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: NAVY }}>
          Export CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* ── EXPOSURE REGISTER ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4" style={{ background: NAVY }}>
          <h3 className="font-semibold text-white text-sm">Exposure Register</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead style={{ background: '#F4F6FA' }}>
              <tr>
                {['Instrument','Currency','Amount','Budget','Current','P&L','Status','Hedge %','Description','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: NAVY }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {filteredExposures.map((exp) => {
                const isBreached = exp.pnl_status === 'BREACH'
                return (
                  <tr key={exp.id} className="hover:bg-gray-50 transition-colors"
                    style={ isBreached ? { background: 'rgba(239,68,68,0.03)' } : {}}>
                    <td className="px-4 py-3 text-sm text-gray-600">{exp.instrument_type || 'Spot'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="mr-1">{CURRENCY_FLAGS[exp.from_currency] || '🏳️'}</span>
                      <span className="font-medium text-sm" style={{ color: NAVY }}>
                        {exp.from_currency} / {exp.to_currency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                      {exp.amount.toLocaleString()} {exp.from_currency}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-500">
                      {exp.budget_rate ? exp.budget_rate.toFixed(4) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                      {exp.current_rate ? exp.current_rate.toFixed(4) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold"
                      style={{ color: exp.current_pnl >= 0 ? SUCCESS : DANGER }}>
                      {exp.current_pnl != null ? fmtSign(exp.current_pnl) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {exp.pnl_status === 'BREACH'     && <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">BREACH</span>}
                      {exp.pnl_status === 'WARNING'    && <span className="px-2 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-700">WARNING</span>}
                      {exp.pnl_status === 'TARGET_MET' && <span className="px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-700">TARGET</span>}
                      {exp.pnl_status === 'OK'         && <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">OK</span>}
                      {!exp.pnl_status                 && <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-semibold" style={{ color: NAVY }}>
                      {exp.hedge_ratio_policy ? `${(exp.hedge_ratio_policy * 100).toFixed(0)}%` : '100%'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate">{exp.description}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <button onClick={() => { setEditingExposure(exp); setShowEditModal(true) }}
                        className="mr-3 hover:opacity-60" style={{ color: NAVY }}>
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => { setDeletingExposure(exp); setShowDeleteConfirm(true) }}
                        className="hover:opacity-60 text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filteredExposures.length === 0 && !loading && (
            <div className="text-center py-16 text-gray-400 text-sm">
              No exposures found. Add one via Data Import.
            </div>
          )}
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      {showEditModal && editingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
            <h2 className="text-lg font-bold mb-6" style={{ color: NAVY }}>Edit Exposure</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Amount</label>
                <input type="number" value={editingExposure.amount}
                  onChange={(e) => setEditingExposure({ ...editingExposure, amount: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Description</label>
                <textarea value={editingExposure.description || ''}
                  onChange={(e) => setEditingExposure({ ...editingExposure, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" rows="3" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowEditModal(false); setEditingExposure(null) }}
                className="px-5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => handleEditSave(editingExposure)}
                className="px-5 py-2 text-white rounded-lg text-sm font-semibold"
                style={{ background: NAVY }}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE MODAL ── */}
      {showDeleteConfirm && deletingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-lg font-bold mb-2" style={{ color: NAVY }}>Delete Exposure?</h2>
            <p className="text-gray-500 text-sm mb-6">
              {deletingExposure.from_currency}/{deletingExposure.to_currency} — {deletingExposure.amount?.toLocaleString()} {deletingExposure.from_currency}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeletingExposure(null) }}
                className="px-5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                Cancel
              </button>
              <button onClick={handleDeleteConfirm}
                className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">
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