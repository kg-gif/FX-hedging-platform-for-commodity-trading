import React, { useState, useEffect } from 'react'
import ExposureRegister from './ExposureRegister'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, ShieldCheck, TrendingDown, TrendingUp, RefreshCw, X } from 'lucide-react'
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from '../brand'
import { CurrencyPairFlags } from './CurrencyFlag'
import { useCompany } from '../contexts/CompanyContext'

const API_BASE = 'https://birk-fx-api.onrender.com'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})


const CHART_COLORS = [GOLD, '#2E86AB', '#27AE60', '#E74C3C', '#8B5CF6', '#EC4899']

const fmt     = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
const fmtSign = (n) => (n >= 0 ? '+' : '') + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

function Dashboard({ onNavigate }) {
  // Use the shared CompanyContext so the navbar CompanySelector drives which company is shown
  const { selectedCompanyId, getSelectedCompany } = useCompany()
  const selectedCompany = getSelectedCompany()

  const [exposures,         setExposures]         = useState([])
  const [enrichedExposures, setEnrichedExposures] = useState([])
  const [loading,           setLoading]           = useState(false)
  const [refreshing,        setRefreshing]        = useState(false)
  const [lastUpdated,       setLastUpdated]       = useState(null)
  const [error,             setError]             = useState(null)
  const [policy,            setPolicy]            = useState(null)
  const [editingExposure,   setEditingExposure]   = useState(null)
  const [deletingExposure,  setDeletingExposure]  = useState(null)
  const [showEditModal,     setShowEditModal]     = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [dismissedZones,    setDismissedZones]    = useState({ defensive: false, opportunistic: false })

  // When selected company changes — load everything
  useEffect(() => {
    if (!selectedCompanyId) return
    fetchExposures(selectedCompanyId)
    fetchEnriched(selectedCompanyId)
    fetchPolicy(selectedCompanyId)
  }, [selectedCompanyId])

  const fetchPolicy = async (companyId) => {
    try {
      const r = await fetch(`${API_BASE}/api/policies?company_id=${companyId}`, { headers: authHeaders() })
      if (r.ok) {
        const data = await r.json()
        const active = (data.policies || []).find(p => p.is_active)
        if (active) setPolicy(active)
      }
    } catch {}
  }

  const fetchExposures = async (companyId) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${API_BASE}/exposures?company_id=${companyId}`, { headers: authHeaders() })
      const data = await res.json()
      setExposures(Array.isArray(data) ? data : [])
      setLastUpdated(new Date())
    } catch { setError('Failed to fetch exposures') }
    finally { setLoading(false) }
  }

  const fetchEnriched = async (companyId) => {
    try {
      const res = await fetch(`${API_BASE}/api/exposures/enriched?company_id=${companyId}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setEnrichedExposures(Array.isArray(data) ? data : [])
      }
    } catch (e) { console.error('Enriched fetch failed:', e) }
  }

  const refreshRates = async () => {
    if (!selectedCompanyId) return
    setRefreshing(true)
    await fetchExposures(selectedCompanyId)
    await fetchEnriched(selectedCompanyId)
    setRefreshing(false)
  }

  const handleEditSave = async (updated) => {
    try {
      const r = await fetch(`${API_BASE}/api/exposure-data/exposures/${updated.id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(updated)
      })
      if (r.ok) {
        setShowEditModal(false)
        setEditingExposure(null)
        fetchExposures(selectedCompanyId)
        fetchEnriched(selectedCompanyId)
      } else { alert('Failed to update') }
    } catch { alert('Error updating') }
  }

  const handleDeleteConfirm = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/exposure-data/exposures/${deletingExposure.id}`, {
        method: 'DELETE', headers: authHeaders()
      })
      if (r.ok) {
        setShowDeleteConfirm(false)
        setDeletingExposure(null)
        fetchExposures(selectedCompanyId)
        fetchEnriched(selectedCompanyId)
      } else { alert('Failed to delete') }
    } catch { alert('Error deleting') }
  }

  // ── Derived values ────────────────────────────────────────────
  const totalExposure = exposures.reduce((s, e) => s + Math.abs(e.amount * (e.current_rate || 1)), 0)
  const totalPnl      = exposures.reduce((s, e) => s + (e.current_pnl || 0), 0)
  const hedgedValue   = exposures.reduce((s, e) => s + (e.hedged_amount || 0), 0)
  const unhedgedValue = exposures.reduce((s, e) => s + (e.unhedged_amount || 0), 0)
  const breaches      = exposures.filter(e => e.pnl_status === 'BREACH')
  const warnings      = exposures.filter(e => e.pnl_status === 'WARNING')
  const hedgePct      = totalExposure > 0 ? (hedgedValue / totalExposure) * 100 : 0

  // Zone alert pairs — derived from enriched endpoint (has budget_rate + live spot)
  const defensivePairs     = [...new Set(enrichedExposures.filter(e => e.current_zone === 'defensive').map(e => e.currency_pair))]
  const opportunisticPairs = [...new Set(enrichedExposures.filter(e => e.current_zone === 'opportunistic').map(e => e.currency_pair))]

  const currencyDist = exposures.reduce((acc, e) => {
    const v = Math.abs(e.amount * (e.current_rate || 1))
    const x = acc.find(i => i.currency === e.from_currency)
    if (x) x.value += v
    else acc.push({ currency: e.from_currency, value: v })
    return acc
  }, [])

  const rateChanges = exposures
    .filter(e => e.budget_rate && e.current_rate)
    .map(e => ({
      currency: e.from_currency,
      change: ((e.current_rate - e.budget_rate) / e.budget_rate) * 100
    }))
    .sort((a, b) => b.change - a.change)

  // ── Coverage card data ────────────────────────────────────────
  const coverageByPair = Object.entries(
    enrichedExposures.reduce((acc, e) => {
      const pair = e.currency_pair
      if (!acc[pair]) acc[pair] = { hedged: 0, total: 0 }
      acc[pair].hedged += e.hedged_amount || 0
      acc[pair].total  += Math.abs(e.total_amount || 0)
      return acc
    }, {})
  )

  if (loading) return (
    <div className="text-center py-24">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: GOLD }} />
      <p className="mt-4 text-gray-400 text-sm">Loading your portfolio...</p>
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Breach banner */}
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

      {/* Defensive zone banner */}
      {defensivePairs.length > 0 && !dismissedZones.defensive && (
        <div className="rounded-xl px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} color={WARNING} />
            <div>
              <span className="font-bold text-sm" style={{ color: WARNING }}>
                {defensivePairs.join(', ')}
              </span>
              <span className="text-sm text-gray-600 ml-1">
                {defensivePairs.length === 1 ? 'has' : 'have'} moved adversely vs budget rate.
                Defensive hedging recommended.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {onNavigate && (
              <button
                onClick={() => onNavigate('hedging')}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: WARNING, color: 'white' }}>
                Review
              </button>
            )}
            <button onClick={() => setDismissedZones(d => ({ ...d, defensive: true }))}>
              <X size={15} color={WARNING} />
            </button>
          </div>
        </div>
      )}

      {/* Opportunistic zone banner */}
      {opportunisticPairs.length > 0 && !dismissedZones.opportunistic && (
        <div className="rounded-xl px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <div className="flex items-center gap-3">
            <TrendingUp size={18} color={SUCCESS} />
            <div>
              <span className="font-bold text-sm" style={{ color: SUCCESS }}>
                {opportunisticPairs.join(', ')}
              </span>
              <span className="text-sm text-gray-600 ml-1">
                {opportunisticPairs.length === 1 ? 'is' : 'are'} trading favourably.
                Consider opportunistic hedging.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {onNavigate && (
              <button
                onClick={() => onNavigate('hedging')}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: SUCCESS, color: 'white' }}>
                Review
              </button>
            )}
            <button onClick={() => setDismissedZones(d => ({ ...d, opportunistic: true }))}>
              <X size={15} color={SUCCESS} />
            </button>
          </div>
        </div>
      )}

      {/* Portfolio summary */}
      {exposures.length > 0 && (
        <div className="rounded-xl p-6" style={{ background: NAVY }}>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total P&L */}
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

            {/* Protection status */}
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

            {/* Attention */}
            <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#8DA4C4' }}>
                Requires Attention
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: breaches.length > 0 ? DANGER : '#8DA4C4' }}>Breaches</span>
                  <span className="text-2xl font-bold" style={{ color: breaches.length > 0 ? DANGER : '#8DA4C4' }}>{breaches.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: warnings.length > 0 ? WARNING : '#8DA4C4' }}>Warnings</span>
                  <span className="text-2xl font-bold" style={{ color: warnings.length > 0 ? WARNING : '#8DA4C4' }}>{warnings.length}</span>
                </div>
                {breaches.length === 0 && warnings.length === 0 && (
                  <p className="text-xs pt-1" style={{ color: SUCCESS }}>All exposures within policy</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {exposures.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-semibold mb-4" style={{ color: NAVY }}>Currency Mix</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={currencyDist} dataKey="value" nameKey="currency" cx="50%" cy="50%" outerRadius={75}
                  label={(e) => e.currency}>
                  {currencyDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-semibold mb-4" style={{ color: NAVY }}>Rate vs Budget (%)</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={rateChanges}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="currency" style={{ fontSize: '11px' }} />
                <YAxis style={{ fontSize: '11px' }} />
                <Tooltip formatter={(v) => `${v.toFixed(2)}%`} />
                <Bar dataKey="change" radius={[4, 4, 0, 0]}>
                  {rateChanges.map((e, i) => <Cell key={i} fill={e.change >= 0 ? SUCCESS : DANGER} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Live Rates + Hedge Coverage */}
      {exposures.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Live Rates */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: NAVY }}>
              <h3 className="text-sm font-semibold text-white">Live Rates</h3>
              <p className="text-xs" style={{ color: '#8DA4C4' }}>
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Live'}
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              {[...new Map(exposures
                .filter(e => e.current_rate && e.budget_rate)
                .map(e => [`${e.from_currency}/${e.to_currency}`, e])
              ).values()].map(e => {
                const pair   = `${e.from_currency}/${e.to_currency}`
                const change = ((e.current_rate - e.budget_rate) / e.budget_rate) * 100
                const pos    = change >= 0
                return (
                  <div key={pair} className="flex items-center justify-between px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-bold" style={{ color: NAVY }}>
                      <CurrencyPairFlags pair={pair} />
                      {pair}
                    </span>
                    <div className="flex items-center gap-5 text-right">
                      <div>
                        <p className="text-xs text-gray-400">Budget</p>
                        <p className="text-xs font-mono" style={{ color: NAVY }}>{e.budget_rate.toFixed(4)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Spot</p>
                        <p className="text-xs font-mono font-bold" style={{ color: NAVY }}>{e.current_rate.toFixed(4)}</p>
                      </div>
                      <div className="w-16">
                        <p className="text-xs text-gray-400">vs Budget</p>
                        <p className="text-xs font-bold" style={{ color: pos ? SUCCESS : DANGER }}>
                          {pos ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hedge Coverage by Pair */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3" style={{ background: NAVY }}>
              <h3 className="text-sm font-semibold text-white">Hedge Coverage by Pair</h3>
            </div>
            <div className="divide-y divide-gray-50 px-4">
              {coverageByPair.length === 0 && (
                <p className="text-xs text-gray-400 py-4">Loading coverage data...</p>
              )}
              {coverageByPair.map(([pair, { hedged, total }]) => {
                const pct   = total > 0 ? Math.min((hedged / total) * 100, 100) : 0
                const color = pct >= 70 ? SUCCESS : pct >= 40 ? WARNING : DANGER
                return (
                  <div key={pair} className="py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-2 text-sm font-bold" style={{ color: NAVY }}>
                        <CurrencyPairFlags pair={pair} />
                        {pair}
                      </span>
                      <span className="text-xs font-bold" style={{ color }}>{pct.toFixed(0)}% hedged</span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ background: '#E5E7EB', height: 6 }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* Exposure Register */}
      <ExposureRegister
        companyId={selectedCompanyId}
        onEdit={(exp) => { setEditingExposure(exp); setShowEditModal(true) }}
        onDelete={(exp) => { setDeletingExposure(exp); setShowDeleteConfirm(true) }}
        onHedgeNow={onNavigate ? (exp) => onNavigate('hedging', { focusExposure: exp }) : null}
      />

      {/* Edit Modal */}
      {showEditModal && editingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
            <h2 className="text-lg font-bold mb-6" style={{ color: NAVY }}>Edit Exposure</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Reference</label>
                <input type="text" value={editingExposure.reference || ''}
                  onChange={(e) => setEditingExposure({ ...editingExposure, reference: e.target.value })}
                  placeholder="e.g. INV-2024-001"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Amount</label>
                <input type="number" value={editingExposure.amount}
                  onChange={(e) => setEditingExposure({ ...editingExposure, amount: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Direction</label>
                <select value={editingExposure.direction || 'Buy'}
                  onChange={(e) => setEditingExposure({ ...editingExposure, direction: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="Buy">Buy (Payable)</option>
                  <option value="Sell">Sell (Receivable)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Budget Rate</label>
                <input type="number" step="0.0001" value={editingExposure.budget_rate || ''}
                  onChange={(e) => setEditingExposure({ ...editingExposure, budget_rate: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Instrument</label>
                <select value={editingExposure.instrument_type || 'Spot'}
                  onChange={(e) => setEditingExposure({ ...editingExposure, instrument_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="Spot">Spot</option>
                  <option value="Forward">Forward</option>
                  <option value="NDF">NDF</option>
                  <option value="Option">Option</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Start Date</label>
                <input type="date" value={editingExposure.start_date || ''}
                  onChange={(e) => setEditingExposure({ ...editingExposure, start_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Due Date</label>
                <input type="date" value={editingExposure.due_date || ''}
                  onChange={(e) => setEditingExposure({ ...editingExposure, due_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>Description</label>
                <textarea value={editingExposure.description || ''}
                  onChange={(e) => setEditingExposure({ ...editingExposure, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" rows="2" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowEditModal(false); setEditingExposure(null) }}
                className="px-5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleEditSave(editingExposure)}
                className="px-5 py-2 text-white rounded-lg text-sm font-semibold" style={{ background: NAVY }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && deletingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-lg font-bold mb-2" style={{ color: NAVY }}>Delete Exposure?</h2>
            <p className="text-gray-500 text-sm mb-6">
              {deletingExposure.from_currency}/{deletingExposure.to_currency} — {deletingExposure.amount?.toLocaleString()} {deletingExposure.from_currency}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeletingExposure(null) }}
                className="px-5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">Cancel</button>
              <button onClick={handleDeleteConfirm}
                className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default Dashboard
