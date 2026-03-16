import React, { useState, useEffect, useCallback } from 'react'
import { useCompany } from '../contexts/CompanyContext'
import { Download, FileText, Clock, CheckCircle, AlertTriangle, Calendar, TrendingUp, Filter, X } from 'lucide-react'
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from '../brand'
import LoadingAnimation from './LoadingAnimation'

const API_BASE = 'https://birk-fx-api.onrender.com'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

const fmt = (n) => n != null ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) : '—'
const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const fmtDateOnly = (s) => {
  if (!s) return '—'
  return String(s).split('T')[0]
}

const EVENT_LABELS = {
  tranche:           { label: 'Tranche',           bg: 'bg-blue-100',   text: 'text-blue-700'   },
  order:             { label: 'Order Sent',         bg: 'bg-purple-100', text: 'text-purple-700' },
  value_date_change: { label: 'Value Date Changed', bg: 'bg-amber-100',  text: 'text-amber-700'  },
}
const TRANCHE_STATUS_STYLE = {
  executed:  'bg-green-100 text-green-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  pending:   'bg-gray-100 text-gray-500',
  sent:      'bg-purple-100 text-purple-700',
}

function EventBadge({ type }) {
  const s = EVENT_LABELS[type] || { label: type, bg: 'bg-gray-100', text: 'text-gray-600' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>{s.label}</span>
}
function StatusBadge({ status }) {
  const c = TRANCHE_STATUS_STYLE[status] || 'bg-gray-100 text-gray-500'
  return status ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c}`}>{status}</span> : null
}

export default function Reports() {
  const { selectedCompanyId } = useCompany()
  const companyId = selectedCompanyId || 1

  const [downloading, setDownloading]         = useState(false)
  const [csvLoading, setCsvLoading]           = useState(false)
  const [pnlCsvLoading, setPnlCsvLoading]     = useState(false)
  const [compCsvLoading, setCompCsvLoading]   = useState(false)
  const [events, setEvents]                   = useState([])
  const [loading, setLoading]                 = useState(true)
  const [pairs, setPairs]                     = useState([])
  const [enrichedItems, setEnrichedItems]     = useState([])
  const [enrichedLoading, setEnrichedLoading] = useState(true)
  const [toast, setToast]                     = useState(null)

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  // Filters
  const [filterPair,        setFilterPair]        = useState('')
  const [filterEventType,   setFilterEventType]   = useState('')
  const [filterFromDate,    setFilterFromDate]     = useState('')
  const [filterToDate,      setFilterToDate]       = useState('')
  const [showDeleted,       setShowDeleted]        = useState(true)

  useEffect(() => {
    if (companyId) {
      loadTrail()
      loadEnriched()
    }
  }, [companyId, filterPair, filterFromDate, filterToDate, showDeleted])

  const loadEnriched = async () => {
    setEnrichedLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/exposures/enriched?company_id=${companyId}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setEnrichedItems(Array.isArray(data) ? data : (data.items || []))
      }
    } catch (e) { console.error('Failed to load enriched exposures', e) }
    finally { setEnrichedLoading(false) }
  }

  const loadTrail = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ company_id: companyId, include_deleted: showDeleted })
      if (filterPair)     params.set('currency_pair', filterPair)
      if (filterFromDate) params.set('from_date', filterFromDate)
      if (filterToDate)   params.set('to_date', filterToDate)

      const res = await fetch(`${API_BASE}/api/audit/hedge-trail?${params}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
        // Build pair list for filter dropdown from loaded events
        const seenPairs = [...new Set((data.events || []).map(e => e.currency_pair).filter(Boolean))]
        setPairs(seenPairs.sort())
      }
    } catch (e) { console.error('Failed to load trail', e) }
    finally { setLoading(false) }
  }

  const handleDownloadPDF = async () => {
    setDownloading(true)
    showToast('Your export is being prepared. It will download automatically.')
    try {
      const res = await fetch(`${API_BASE}/api/reports/currency-plan?company_id=${companyId}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url
      a.download = `currency-plan-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch { alert('Failed to generate report.') }
    finally { setDownloading(false) }
  }

  const handleDownloadCSV = async () => {
    setCsvLoading(true)
    showToast('Your export is being prepared. It will download automatically.')
    try {
      const params = new URLSearchParams({ company_id: companyId, include_deleted: showDeleted })
      if (filterPair)     params.set('currency_pair', filterPair)
      if (filterFromDate) params.set('from_date', filterFromDate)
      if (filterToDate)   params.set('to_date', filterToDate)
      const res = await fetch(`${API_BASE}/api/audit/hedge-trail/csv?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url
      a.download = `hedge-audit-trail-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch { alert('Failed to download CSV.') }
    finally { setCsvLoading(false) }
  }

  const downloadCsv = (filename, headers, rows) => {
    const lines = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = filename; document.body.appendChild(a); a.click(); a.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleDownloadPnlCsv = () => {
    setPnlCsvLoading(true)
    try {
      const hdrs = ['Pair', 'Total Amount', 'Hedge %', 'Budget Rate', 'Current Rate', 'Locked P&L', 'Floating P&L', 'Combined P&L']
      const rows = enrichedItems.map(e => [
        e.currency_pair,
        e.total_amount,
        (e.hedge_pct ?? 0).toFixed(1) + '%',
        (e.budget_rate ?? 0).toFixed(4),
        (e.current_spot ?? 0).toFixed(4),
        (e.locked_pnl ?? 0).toFixed(2),
        (e.floating_pnl ?? 0).toFixed(2),
        (e.combined_pnl ?? 0).toFixed(2),
      ])
      downloadCsv(`pnl-summary-${new Date().toISOString().split('T')[0]}.csv`, hdrs, rows)
    } finally { setPnlCsvLoading(false) }
  }

  const handleDownloadComplianceCsv = () => {
    setCompCsvLoading(true)
    try {
      const hdrs = ['Pair', 'Policy Target %', 'Actual Hedge %', 'Status']
      const rows = enrichedItems.map(e => {
        const target = (e.target_ratio ?? 0) * 100
        const actual = e.hedge_pct ?? 0
        const diff   = actual - target
        const status = Math.abs(diff) <= 5 ? 'ON TARGET' : diff < 0 ? 'UNDER' : 'OVER'
        return [e.currency_pair, target.toFixed(0) + '%', actual.toFixed(1) + '%', status]
      })
      downloadCsv(`policy-compliance-${new Date().toISOString().split('T')[0]}.csv`, hdrs, rows)
    } finally { setCompCsvLoading(false) }
  }

  const clearFilters = () => {
    setFilterPair(''); setFilterEventType(''); setFilterFromDate(''); setFilterToDate(''); setShowDeleted(true)
  }

  const displayed = filterEventType
    ? events.filter(e => e.event_type === filterEventType)
    : events

  const hasFilters = filterPair || filterEventType || filterFromDate || filterToDate || !showDeleted

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="rounded-xl p-6" style={{ background: NAVY }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Reports & Audit Trail</h2>
            <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>
              Full execution history, value date changes, and hedge trail — filterable and downloadable
            </p>
          </div>
          <button onClick={handleDownloadPDF} disabled={downloading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: GOLD, color: NAVY, minWidth: 170 }}>
            {downloading
              ? <LoadingAnimation text="Generating report" size="small" />
              : <><FileText size={14} /> Currency Plan PDF</>
            }
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={14} className="text-gray-400 shrink-0" />

          <select value={filterPair} onChange={e => setFilterPair(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Currencies</option>
            {pairs.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={filterEventType} onChange={e => setFilterEventType(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Event Types</option>
            <option value="tranche">Tranches</option>
            <option value="order">Orders Sent</option>
            <option value="value_date_change">Value Date Changes</option>
          </select>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">From</label>
            <input type="date" value={filterFromDate} onChange={e => setFilterFromDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">To</label>
            <input type="date" value={filterToDate} onChange={e => setFilterToDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </div>

          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)}
              className="rounded" />
            Include deleted
          </label>

          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700">
              <X size={12} /> Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">{displayed.length} events</span>
            <button onClick={handleDownloadCSV} disabled={csvLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: NAVY, color: 'white', minWidth: 110 }}>
              {csvLoading
                ? <LoadingAnimation text="Generating report" size="small" />
                : <><Download size={12} /> Export CSV</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* Trail Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3" style={{ background: NAVY }}>
          <CheckCircle size={15} color={GOLD} />
          <h3 className="font-semibold text-white text-sm">Hedge Audit Trail</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <LoadingAnimation text="Loading audit trail…" size="medium" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">No events found matching your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead style={{ background: '#F4F6FA' }}>
                <tr>
                  {['Date / Time', 'Event', 'Currency', 'Description', 'Amount', 'Rate', 'Instrument', 'Value Date', 'Status', 'User', 'Notes'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: NAVY }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map((ev, i) => (
                  <tr key={i} className={`hover:bg-gray-50 ${ev.is_active === false ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500">{fmtDate(ev.event_at)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <EventBadge type={ev.event_type} />
                        {ev.is_active === false && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-400">deleted</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: NAVY }}>{ev.currency_pair || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-xs">
                      <div className="truncate">{ev.description || '—'}</div>
                      {ev.reference && <div className="text-xs text-gray-400">{ev.reference}</div>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right whitespace-nowrap">
                      {ev.amount ? fmt(ev.amount) : '—'}
                      {ev.amount_currency && (
                        <div className="text-xs text-gray-400">{ev.amount_currency}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right whitespace-nowrap">
                      <div>{ev.execution_rate ? ev.execution_rate.toFixed(4) : '—'}</div>
                      {ev.budget_rate && (
                        <div className="text-xs text-gray-400">Budget: {Number(ev.budget_rate).toFixed(4)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{ev.instrument || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{fmtDateOnly(ev.value_date)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <StatusBadge status={ev.tranche_status} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{ev.created_by || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 max-w-xs">
                      <div className="truncate" title={ev.notes || ev.reason || ''}>
                        {ev.reason || ev.notes || '—'}
                      </div>
                      {ev.limit_rate && <div>TP: {Number(ev.limit_rate).toFixed(4)} / SL: {Number(ev.stop_rate).toFixed(4)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* P&L Summary Report */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: NAVY }}>
          <div className="flex items-center gap-3">
            <TrendingUp size={15} color={GOLD} />
            <h3 className="font-semibold text-white text-sm">P&L Summary Report</h3>
          </div>
          <button onClick={handleDownloadPnlCsv} disabled={pnlCsvLoading || enrichedLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: GOLD, color: NAVY, minWidth: 110 }}>
            {pnlCsvLoading
              ? <LoadingAnimation text="Generating report" size="small" />
              : <><Download size={12} /> Export CSV</>
            }
          </button>
        </div>
        {enrichedLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingAnimation text="Loading P&L data…" size="medium" />
          </div>
        ) : enrichedItems.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">No active exposures found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead style={{ background: '#F4F6FA' }}>
                <tr>
                  {['Pair', 'Total Amount', 'Hedge %', 'Budget Rate', 'Current Rate', 'Locked P&L', 'Floating P&L', 'Combined P&L'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: NAVY }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {enrichedItems.map((e, i) => {
                  const combined = e.combined_pnl ?? 0
                  const pnlColor = combined >= 0 ? SUCCESS : DANGER
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: NAVY }}>{e.currency_pair}</td>
                      <td className="px-3 py-2.5 font-mono text-right whitespace-nowrap">{fmt(e.total_amount)} {e.from_currency}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{(e.hedge_pct ?? 0).toFixed(1)}%</td>
                      <td className="px-3 py-2.5 font-mono text-right whitespace-nowrap">{(e.budget_rate ?? 0).toFixed(4)}</td>
                      <td className="px-3 py-2.5 font-mono text-right whitespace-nowrap">{(e.current_spot ?? 0).toFixed(4)}</td>
                      <td className="px-3 py-2.5 font-mono text-right whitespace-nowrap"
                        style={{ color: (e.locked_pnl ?? 0) >= 0 ? SUCCESS : DANGER }}>
                        {(e.locked_pnl ?? 0) >= 0 ? '+' : ''}{fmt(e.locked_pnl)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-right whitespace-nowrap"
                        style={{ color: (e.floating_pnl ?? 0) >= 0 ? SUCCESS : DANGER }}>
                        {(e.floating_pnl ?? 0) >= 0 ? '+' : ''}{fmt(e.floating_pnl)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-right font-bold whitespace-nowrap"
                        style={{ color: pnlColor }}>
                        {combined >= 0 ? '+' : ''}{fmt(combined)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Policy Compliance Report */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: NAVY }}>
          <div className="flex items-center gap-3">
            <CheckCircle size={15} color={GOLD} />
            <h3 className="font-semibold text-white text-sm">Policy Compliance Report</h3>
          </div>
          <button onClick={handleDownloadComplianceCsv} disabled={compCsvLoading || enrichedLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: GOLD, color: NAVY, minWidth: 110 }}>
            {compCsvLoading
              ? <LoadingAnimation text="Generating report" size="small" />
              : <><Download size={12} /> Export CSV</>
            }
          </button>
        </div>
        {enrichedLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingAnimation text="Loading compliance data…" size="medium" />
          </div>
        ) : enrichedItems.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">No active exposures found.</div>
        ) : (() => {
          const onTarget = enrichedItems.filter(e => {
            const target = (e.target_ratio ?? 0) * 100
            return Math.abs((e.hedge_pct ?? 0) - target) <= 5
          }).length
          return (
            <div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm divide-y divide-gray-100">
                  <thead style={{ background: '#F4F6FA' }}>
                    <tr>
                      {['Pair', 'Policy Target %', 'Actual Hedge %', 'Gap', 'Status'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                          style={{ color: NAVY }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {enrichedItems.map((e, i) => {
                      const target = (e.target_ratio ?? 0) * 100
                      const actual = e.hedge_pct ?? 0
                      const diff   = actual - target
                      const isBreached = e.status === 'BREACH'
                      let statusLabel, statusStyle
                      if (isBreached) {
                        statusLabel = 'BREACH'; statusStyle = { background: '#FEE2E2', color: DANGER }
                      } else if (Math.abs(diff) <= 5) {
                        statusLabel = 'ON TARGET'; statusStyle = { background: '#D1FAE5', color: SUCCESS }
                      } else if (diff < 0) {
                        statusLabel = 'UNDER'; statusStyle = { background: '#FEF3C7', color: '#92400E' }
                      } else {
                        statusLabel = 'OVER'; statusStyle = { background: '#EDE9FE', color: '#5B21B6' }
                      }
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: NAVY }}>{e.currency_pair}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{target.toFixed(0)}%</td>
                          <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{actual.toFixed(1)}%</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap"
                            style={{ color: diff >= 0 ? SUCCESS : DANGER }}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={statusStyle}>
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span className="font-semibold" style={{ color: NAVY }}>{onTarget}</span> of{' '}
                <span className="font-semibold" style={{ color: NAVY }}>{enrichedItems.length}</span> exposures within policy target
              </div>
            </div>
          )
        })()}
      </div>

      {/* Coming Soon */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3" style={{ background: NAVY }}>
          <Clock size={15} color={GOLD} />
          <h3 className="font-semibold text-white text-sm">Coming Soon</h3>
        </div>
        <div className="p-5 space-y-3">
          {[
            { icon: Calendar, title: 'Maturity Schedule',      desc: 'All upcoming hedge maturities with renewal recommendations' },
            { icon: Clock,    title: 'Mark-to-Market Report',  desc: 'Daily MTM valuation of all open hedge positions' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-center justify-between py-3 px-4 border border-dashed border-gray-200 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(26,39,68,0.06)' }}>
                  <Icon size={14} color={NAVY} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>{title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
              </div>
              <span className="text-xs px-3 py-1 rounded-full font-semibold shrink-0"
                style={{ background: 'rgba(201,168,108,0.12)', color: GOLD }}>
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: NAVY, color: 'white', borderRadius: 10,
          padding: '12px 20px', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
          borderLeft: `4px solid ${GOLD}`,
        }}>
          <Download size={14} color={GOLD} style={{ flexShrink: 0 }} />
          {toast}
        </div>
      )}

    </div>
  )
}
