// ExposureRegister.jsx
// Drop-in replacement for the register table inside Dashboard.jsx
// Shows: Total | Hedged | Open | Locked P&L | Floating P&L | Combined P&L | Corridor | Status

import React, { useState, useEffect } from 'react'
import { Edit2, Trash2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

const API_BASE = 'https://birk-fx-api.onrender.com'
const NAVY    = '#1A2744'
const GOLD    = '#C9A86C'
const SUCCESS = '#10B981'
const DANGER  = '#EF4444'
const WARNING = '#F59E0B'

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

const fmtAmount = (n, ccy = '') =>
  `${ccy} ${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`.trim()

const fmtPnl = (n) => {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const pnlColor = (n) => n == null ? '#9CA3AF' : n >= 0 ? SUCCESS : DANGER

function StatusBadge({ status }) {
  const map = {
    BREACH:      'bg-red-100 text-red-700',
    OPEN:        'bg-gray-100 text-gray-600',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    WELL_HEDGED: 'bg-green-100 text-green-700',
    NO_BUDGET:   'bg-gray-100 text-gray-400',
  }
  const labels = {
    BREACH: 'BREACH', OPEN: 'OPEN', IN_PROGRESS: 'IN PROGRESS',
    WELL_HEDGED: 'HEDGED', NO_BUDGET: 'NO BUDGET'
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || map.OPEN}`}>
      {labels[status] || status}
    </span>
  )
}

function HedgeBar({ pct }) {
  const color = pct >= 70 ? SUCCESS : pct >= 40 ? WARNING : DANGER
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-0.5">
        <span style={{ color: NAVY }} className="font-semibold">{pct.toFixed(0)}%</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ background: '#E5E7EB', height: 5 }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  )
}

function TrancheRow({ tranche, ccy }) {
  const statusColor = tranche.status === 'confirmed' ? SUCCESS : tranche.status === 'executed' ? GOLD : '#9CA3AF'
  return (
    <tr className="text-xs border-t border-gray-100">
      <td className="px-3 py-2 text-gray-400">{tranche.instrument || 'Forward'}</td>
      <td className="px-3 py-2 font-mono text-gray-600">{fmtAmount(tranche.amount, ccy)}</td>
      <td className="px-3 py-2 font-mono text-gray-600">{tranche.rate ? parseFloat(tranche.rate).toFixed(4) : '—'}</td>
      <td className="px-3 py-2 text-gray-500">{tranche.value_date || '—'}</td>
      <td className="px-3 py-2">
        <span className="font-semibold" style={{ color: statusColor }}>
          {tranche.status?.toUpperCase()}
        </span>
      </td>
      <td className="px-3 py-2 text-gray-400">{tranche.executed_by || '—'}</td>
      <td className="px-3 py-2 text-gray-400">
        {tranche.executed_at ? new Date(tranche.executed_at).toLocaleDateString('en-GB') : '—'}
      </td>
    </tr>
  )
}

function CorridorResetModal({ exposure, onClose, onReset }) {
  const [reason, setReason]           = useState('')
  const [tpPct, setTpPct]   = useState('2')
  const [slPct, setSlPct]   = useState('3')
  const [saving, setSaving] = useState(false)

  const spot       = exposure.current_spot
  const tp         = parseFloat(tpPct) / 100
  const sl         = parseFloat(slPct) / 100
  const takeProfit = spot ? (spot * (1 + tp)).toFixed(4) : '—'
  const stopLoss   = spot ? (spot * (1 - sl)).toFixed(4) : '—'

  async function handleReset() {
    if (!reason.trim()) { alert('Please provide a reason for the corridor reset.'); return }
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/exposures/${exposure.id}/reset-corridor`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          current_spot:    spot,
          take_profit_pct: tp,
          stop_loss_pct:   sl,
          reason
        })
      })
      const data = await res.json()
      onReset(data)
      onClose()
    } catch (e) { alert('Failed to reset corridor') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5" style={{ background: NAVY }}>
          <h2 className="text-base font-bold text-white">Reset Hedge Corridor</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>
            {exposure.currency_pair} · Open: {fmtAmount(exposure.open_amount, exposure.from_currency)}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: '#F4F6FA' }}>
            <div className="flex justify-between">
              <span className="text-gray-500">Today's Spot</span>
              <span className="font-semibold" style={{ color: NAVY }}>{spot?.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Original Budget Rate</span>
              <span className="font-mono text-gray-600">{exposure.budget_rate?.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Open Amount</span>
              <span className="font-mono text-gray-600">{fmtAmount(exposure.open_amount, exposure.from_currency)}</span>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Take Profit (%)</label>
                <input type="number" value={tpPct} min="0.5" max="20" step="0.5"
                  onChange={e => setTpPct(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Stop Loss (%)</label>
                <input type="number" value={slPct} min="0.5" max="20" step="0.5"
                  onChange={e => setSlPct(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-3 text-center" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
              <p className="text-xs text-gray-500 mb-1">Take Profit</p>
              <p className="font-bold text-green-700">{takeProfit}</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="text-xs text-gray-500 mb-1">Stop Loss</p>
              <p className="font-bold text-red-700">{stopLoss}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: '#92660A' }}>Reason for reset *</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Market moved favourably, resetting corridor on remaining open position"
              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-amber-50" />
            <p className="text-xs text-amber-600 mt-1">Logged to audit trail with timestamp.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-500">
              Cancel
            </button>
            <button onClick={handleReset} disabled={saving || !reason.trim()}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: NAVY, color: 'white' }}>
              {saving ? 'Saving...' : 'Reset Corridor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ExposureRegister({ companyId, onEdit, onDelete }) {
  const [exposures, setExposures]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [expanded, setExpanded]           = useState({})
  const [corridorModal, setCorridorModal] = useState(null)
  const [searchText, setSearchText]       = useState('')
  const [filterCcy, setFilterCcy]         = useState('')
  const [page, setPage]                   = useState(1)
  const PAGE_SIZE = 10

  useEffect(() => { if (companyId) load() }, [companyId])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${API_BASE}/api/exposures/enriched?company_id=${companyId}`,
        { headers: authHeaders() }
      )
      if (!res.ok) throw new Error('Failed to load')
      setExposures(await res.json())
    } catch (e) {
      setError('Failed to load exposure register')
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const filtered = exposures.filter(e => {
    if (filterCcy && e.currency_pair !== filterCcy) return false
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!e.description?.toLowerCase().includes(s) && !e.reference?.toLowerCase().includes(s)) return false
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Portfolio totals (across all filtered rows, not just current page)
  const totalLockedPnl   = filtered.reduce((s, e) => s + (e.locked_pnl || 0), 0)
  const totalFloatingPnl = filtered.reduce((s, e) => s + (e.floating_pnl || 0), 0)
  const totalCombinedPnl = filtered.reduce((s, e) => s + (e.combined_pnl || 0), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: GOLD }} />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
  )

  return (
    <div className="space-y-4">

      {/* Portfolio P&L Summary */}
      <div className="rounded-xl p-5 grid grid-cols-3 gap-4" style={{ background: NAVY }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#8DA4C4' }}>
            Locked P&L
          </p>
          <p className="text-xl font-bold" style={{ color: pnlColor(totalLockedPnl) }}>
            {fmtPnl(totalLockedPnl)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>Crystallised from executed hedges</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#8DA4C4' }}>
            Floating P&L
          </p>
          <p className="text-xl font-bold" style={{ color: pnlColor(totalFloatingPnl) }}>
            {fmtPnl(totalFloatingPnl)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>Open portion vs today's spot</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#8DA4C4' }}>
            Combined P&L
          </p>
          <p className="text-xl font-bold" style={{ color: pnlColor(totalCombinedPnl) }}>
            {fmtPnl(totalCombinedPnl)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>Total portfolio position</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-wrap items-center gap-3">
        <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
          placeholder="Search description or reference..."
          className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        <select value={filterCcy} onChange={e => setFilterCcy(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">All Currencies</option>
          {[...new Set(exposures.map(e => e.currency_pair))].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: NAVY, color: 'white' }}>
          <RefreshCw size={13} /> Refresh
        </button>
        <span className="text-sm text-gray-400">
          {filtered.length} exposures · Page {page} of {totalPages || 1}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded border border-gray-200 text-sm disabled:opacity-40">
            ← Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className="px-3 py-1.5 rounded border text-sm font-semibold"
              style={{
                background: p === page ? NAVY : 'white',
                color: p === page ? 'white' : '#6B7280',
                borderColor: p === page ? NAVY : '#E5E7EB'
              }}>
              {p}
            </button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}
            className="px-3 py-1.5 rounded border border-gray-200 text-sm disabled:opacity-40">
            Next →
          </button>
        </div>
      </div>

      {/* Register */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4" style={{ background: NAVY }}>
          <h3 className="font-semibold text-white text-sm">Exposure Register</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead style={{ background: '#F4F6FA' }}>
              <tr>
                {[
                  'Pair', 'Description', 'Total', 'Hedged', 'Open', 'Hedge %',
                  'Locked P&L', 'Floating P&L', 'Combined P&L',
                  'Corridor', 'Status', 'Actions'
                ].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: NAVY, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(exp => (
                <React.Fragment key={exp.id}>
                  <tr className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(exp.id)}>

                    {/* Pair */}
                    <td className="px-3 py-3 font-semibold whitespace-nowrap" style={{ color: NAVY }}>
                      <div className="flex items-center gap-1.5">
                        {expanded[exp.id]
                          ? <ChevronUp size={13} className="text-gray-400" />
                          : <ChevronDown size={13} className="text-gray-400" />}
                        {exp.currency_pair}
                      </div>
                    </td>

                    {/* Description */}
                    <td className="px-3 py-3 text-gray-500 max-w-xs truncate">
                      {exp.description || '—'}
                    </td>

                    {/* Total */}
                    <td className="px-3 py-3 font-mono text-right text-gray-700 whitespace-nowrap">
                      {fmtAmount(exp.total_amount, exp.from_currency)}
                    </td>

                    {/* Hedged */}
                    <td className="px-3 py-3 font-mono text-right whitespace-nowrap"
                      style={{ color: exp.hedged_amount > 0 ? SUCCESS : '#9CA3AF' }}>
                      {exp.hedged_amount > 0 ? fmtAmount(exp.hedged_amount, exp.from_currency) : '—'}
                      {exp.tranche_count > 0 && (
                        <span className="ml-1 text-xs text-gray-400">({exp.tranche_count})</span>
                      )}
                    </td>

                    {/* Open */}
                    <td className="px-3 py-3 font-mono text-right whitespace-nowrap"
                      style={{ color: exp.open_amount > 0 ? WARNING : '#9CA3AF' }}>
                      {fmtAmount(exp.open_amount, exp.from_currency)}
                    </td>

                    {/* Hedge % bar */}
                    <td className="px-3 py-3" style={{ minWidth: 100 }}>
                      <HedgeBar pct={exp.hedge_pct} />
                    </td>

                    {/* Locked P&L */}
                    <td className="px-3 py-3 font-semibold text-right whitespace-nowrap"
                      style={{ color: pnlColor(exp.locked_pnl) }}>
                      {fmtPnl(exp.locked_pnl)}
                    </td>

                    {/* Floating P&L */}
                    <td className="px-3 py-3 font-semibold text-right whitespace-nowrap"
                      style={{ color: pnlColor(exp.floating_pnl) }}>
                      {exp.open_amount > 0 ? fmtPnl(exp.floating_pnl) : '—'}
                    </td>

                    {/* Combined P&L */}
                    <td className="px-3 py-3 font-bold text-right whitespace-nowrap"
                      style={{ color: pnlColor(exp.combined_pnl) }}>
                      {fmtPnl(exp.combined_pnl)}
                    </td>

                    {/* Corridor */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {exp.corridor ? (
                        <div className="text-xs space-y-0.5">
                          <div style={{ color: SUCCESS }}>▲ {exp.corridor.take_profit_rate?.toFixed(4)}</div>
                          <div style={{ color: DANGER }}>▼ {exp.corridor.stop_loss_rate?.toFixed(4)}</div>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setCorridorModal(exp) }}
                          className="text-xs px-2 py-1 rounded border text-gray-500 border-gray-300 hover:border-gray-400">
                          Set
                        </button>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3">
                      <StatusBadge status={exp.status} />
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {exp.corridor && (
                          <button onClick={() => setCorridorModal(exp)}
                            title="Reset corridor"
                            className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50">
                            ↺
                          </button>
                        )}
                        {onEdit && (
                          <button onClick={() => onEdit(exp)} style={{ color: NAVY }}>
                            <Edit2 size={14} />
                          </button>
                        )}
                        {onDelete && (
                          <button onClick={() => onDelete(exp)} className="text-red-400">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded tranche detail */}
                  {expanded[exp.id] && (
                    <tr>
                      <td colSpan={12} className="px-6 py-0 bg-gray-50">
                        <div className="py-3">
                          {exp.tranches?.length > 0 ? (
                            <>
                              <p className="text-xs font-semibold uppercase tracking-wider mb-2"
                                style={{ color: NAVY }}>Hedge Tranches</p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-400">
                                    <th className="px-3 py-1.5 text-left">Instrument</th>
                                    <th className="px-3 py-1.5 text-left">Amount</th>
                                    <th className="px-3 py-1.5 text-left">Rate</th>
                                    <th className="px-3 py-1.5 text-left">Value Date</th>
                                    <th className="px-3 py-1.5 text-left">Status</th>
                                    <th className="px-3 py-1.5 text-left">By</th>
                                    <th className="px-3 py-1.5 text-left">Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {exp.tranches.map(t => (
                                    <TrancheRow key={t.id} tranche={t} ccy={exp.from_currency} />
                                  ))}
                                </tbody>
                              </table>
                            </>
                          ) : (
                            <p className="text-xs text-gray-400 py-2">
                              No hedges recorded yet. Use "Execute with Bank" on the Hedging tab to place orders.
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">
              No exposures found.
            </div>
          )}
        </div>
      </div>

      {corridorModal && (
        <CorridorResetModal
          exposure={corridorModal}
          onClose={() => setCorridorModal(null)}
          onReset={() => load()}
        />
      )}
    </div>
  )
}
