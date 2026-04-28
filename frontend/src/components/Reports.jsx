import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCompany } from '../contexts/CompanyContext'
import { Download, FileText, Clock, CheckCircle, AlertTriangle, Calendar, TrendingUp, Filter, X, ChevronUp, ChevronDown } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from '../brand'
import { CURRENCY_FLAGS } from '../utils/currency'
import { CurrencyPairFlags } from './CurrencyFlag'
import LoadingAnimation from './LoadingAnimation'
import JumpNav from './JumpNav'
import ScrollToTop from './ScrollToTop'

const API_BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'
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
  const parts = String(s).split('T')[0].split('-')
  if (parts.length !== 3) return s
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

const EVENT_LABELS = {
  tranche:           { label: 'Tranche',           bg: 'bg-blue-100',   text: 'text-blue-700'   },
  order:             { label: 'Order Sent',         bg: 'bg-purple-100', text: 'text-purple-700' },
  value_date_change: { label: 'Value Date Changed', bg: 'bg-amber-100',  text: 'text-amber-700'  },
}
const AUDIT_TRADING_TYPES = ['tranche', 'value_date_change']
const AUDIT_SYSTEM_TYPES  = ['order']
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

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtEur = (v) => {
  if (v == null) return '—'
  const n = Number(v)
  if (isNaN(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}€${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const mtmColor = (v) => {
  const n = Number(v)
  if (v == null || isNaN(n)) return '#9CA3AF'
  return n >= 0 ? SUCCESS : DANGER
}

// Sortable column header for MTM table
function SortTh({ col, label, sort, setSort, align = 'left' }) {
  const active = sort.col === col
  return (
    <th
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:opacity-80 text-${align}`}
      style={{ color: NAVY }}
      onClick={() => setSort({ col, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
          : <span style={{ width: 11, display: 'inline-block' }} />
        }
      </span>
    </th>
  )
}

// ── MTM Report component ───────────────────────────────────────────────────

function MtmReport({ rows, loading, filterPair, setFilterPair, filterStatus, setFilterStatus,
  filterFrom, setFilterFrom, filterTo, setFilterTo, page, setPage, sort, setSort, pageSize, mcRiskData = {} }) {

  // Unique pairs for filter dropdown
  const allPairs = useMemo(() => [...new Set(rows.map(r => r.currencyPair))].sort(), [rows])

  // at_risk tranche IDs from margin call data
  const atRiskIds = useMemo(() => {
    const ids = new Set((mcRiskData?.tranches || []).map(t => t.tranche_id))
    return ids
  }, [mcRiskData])

  // Apply filters
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterPair && r.currencyPair !== filterPair) return false
      if (filterStatus === 'at_risk') {
        if (!atRiskIds.has(r.trancheId)) return false
      } else if (filterStatus && r.status !== filterStatus) {
        return false
      }
      if (filterFrom && r.valueDate && r.valueDate < filterFrom) return false
      if (filterTo   && r.valueDate && r.valueDate > filterTo)   return false
      return true
    })
  }, [rows, filterPair, filterStatus, filterFrom, filterTo, atRiskIds])

  // Apply sort
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = a[sort.col] ?? ''
      const vb = b[sort.col] ?? ''
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [filtered, sort])

  // KPI totals (over ALL rows, not just current page)
  const totalMtmInception = rows.reduce((s, r) => s + (Number(r.mtmVsInception) || 0), 0)
  const totalMtmBudget    = rows.reduce((s, r) => s + (Number(r.mtmVsBudget)    || 0), 0)
  const forwardsAtRisk    = rows.filter(r => Number(r.mtmVsBudget) < 0).length
  const nextMaturity      = rows
    .map(r => r.valueDate)
    .filter(Boolean)
    .sort()[0] || null

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginated  = sorted.slice((page - 1) * pageSize, page * pageSize)

  const hasFilters = filterPair || filterStatus || filterFrom || filterTo
  const resetFilters = () => {
    setFilterPair(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); setPage(1)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 flex items-center gap-3" style={{ background: NAVY }}>
        <TrendingUp size={15} color={GOLD} />
        <h3 className="font-semibold text-white text-sm">Mark-to-Market Report</h3>
        <span className="text-xs ml-auto" style={{ color: '#8DA4C4' }}>
          Forward positions · Live spot rates · EUR equivalent
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <LoadingAnimation text="Loading MTM data…" size="medium" />
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-4 gap-0 border-b border-gray-100">
            {[
              {
                label: 'Total MTM vs Inception',
                value: fmtEur(totalMtmInception),
                color: mtmColor(totalMtmInception),
                sub: 'All forward positions'
              },
              {
                label: 'Total MTM vs Budget',
                value: fmtEur(totalMtmBudget),
                color: mtmColor(totalMtmBudget),
                sub: 'vs original budget rates'
              },
              {
                label: 'Forwards at Risk',
                value: forwardsAtRisk,
                color: forwardsAtRisk > 0 ? DANGER : SUCCESS,
                sub: 'MTM vs budget negative'
              },
              {
                label: 'Next Maturity',
                value: nextMaturity || '—',
                color: NAVY,
                sub: 'Earliest value date'
              },
            ].map((kpi, i) => (
              <div key={i} className="px-5 py-4 border-r border-gray-100 last:border-r-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{kpi.label}</p>
                <p className="text-lg font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3"
            style={{ background: '#F9FAFB' }}>
            <Filter size={13} className="text-gray-400 shrink-0" />

            <select value={filterPair} onChange={e => { setFilterPair(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs">
              <option value="">All Pairs</option>
              {allPairs.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs"
              style={filterStatus === 'at_risk' ? { borderColor: '#EF4444', color: '#EF4444' } : {}}>
              <option value="">All Statuses</option>
              <option value="executed">Executed</option>
              <option value="confirmed">Confirmed</option>
              {atRiskIds.size > 0 && <option value="at_risk">⚠ At Risk ({atRiskIds.size})</option>}
            </select>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">Maturity from</label>
              <input type="date" value={filterFrom}
                onChange={e => { setFilterFrom(e.target.value); setPage(1) }}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">to</label>
              <input type="date" value={filterTo}
                onChange={e => { setFilterTo(e.target.value); setPage(1) }}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
            </div>

            {hasFilters && (
              <button onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg">
                <X size={11} /> Reset filters
              </button>
            )}

            <span className="ml-auto text-xs text-gray-400">
              {sorted.length} forward{sorted.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              No executed forward tranches found.
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">No results match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-xs">
                <thead style={{ background: '#F4F6FA' }}>
                  <tr>
                    <SortTh col="currencyPair"  label="Pair"             sort={sort} setSort={setSort} />
                    <SortTh col="description"   label="Description"      sort={sort} setSort={setSort} />
                    <SortTh col="notional"      label="Notional"         sort={sort} setSort={setSort} align="right" />
                    <SortTh col="inceptionRate" label="Inception Rate"   sort={sort} setSort={setSort} align="right" />
                    <SortTh col="spotRate"      label="Spot Rate"        sort={sort} setSort={setSort} align="right" />
                    <SortTh col="mtmVsInception" label="MTM vs Inception" sort={sort} setSort={setSort} align="right" />
                    <SortTh col="mtmVsBudget"   label="MTM vs Budget"   sort={sort} setSort={setSort} align="right" />
                    <SortTh col="valueDate"     label="Value Date"       sort={sort} setSort={setSort} />
                    <SortTh col="status"        label="Status"           sort={sort} setSort={setSort} />
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">MC Risk</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Acknowledged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((r, i) => (
                    <tr key={`${r.exposureId}-${r.trancheId}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{ color: NAVY }}>{r.currencyPair}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-xs truncate">{r.description || '—'}</td>
                      <td className="px-3 py-2 font-mono text-right whitespace-nowrap text-gray-700">
                        {r.notional ? r.notional.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                        <span className="ml-1 text-gray-400">{r.fromCurrency}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-right whitespace-nowrap text-gray-600">
                        {r.inceptionRate != null ? Number(r.inceptionRate).toFixed(4) : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-right whitespace-nowrap text-gray-600">
                        {r.spotRate != null ? Number(r.spotRate).toFixed(4) : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-right whitespace-nowrap"
                        style={{ color: mtmColor(r.mtmVsInception) }}
                        title="Mark-to-market vs forward inception rate (EUR)">
                        {fmtEur(r.mtmVsInception)}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-right whitespace-nowrap"
                        style={{ color: mtmColor(r.mtmVsBudget) }}
                        title="Mark-to-market vs budget rate (EUR)">
                        {fmtEur(r.mtmVsBudget)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.valueDate || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                          ${r.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700'
                          : r.status === 'executed'  ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {mcRiskData[r.trancheId] && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700"
                            title="MTM loss exceeds margin call alert threshold">
                            AT RISK
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {mcRiskData[r.trancheId] ? (
                          mcRiskData[r.trancheId].acknowledgement ? (
                            <span className="text-xs text-green-700 font-semibold">
                              ✓ {new Date(mcRiskData[r.trancheId].acknowledgement.acknowledged_at)
                                  .toLocaleDateString('en-GB')}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              Pending
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 text-xs">
              <span className="text-gray-400">Page {page} of {totalPages}</span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2.5 py-1.5 rounded border border-gray-200 disabled:opacity-40">
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className="px-2.5 py-1.5 rounded border text-xs font-semibold"
                    style={{
                      background: p === page ? NAVY : 'white',
                      color: p === page ? 'white' : '#6B7280',
                      borderColor: p === page ? NAVY : '#E5E7EB'
                    }}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2.5 py-1.5 rounded border border-gray-200 disabled:opacity-40">
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Reports component ─────────────────────────────────────────────────

export default function Reports() {
  const { selectedCompanyId } = useCompany()
  const companyId = selectedCompanyId
  const location  = useLocation()
  const navigate  = useNavigate()

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

  // Audit trail pagination + page size
  const [auditPage, setAuditPage]         = useState(1)
  const [auditPageSize, setAuditPageSize] = useState(15)

  // P&L report filters + pagination
  const [pnlFilterPair,    setPnlFilterPair]    = useState('')
  const [pnlFilterStatus,  setPnlFilterStatus]  = useState('')
  const [pnlFilterPnlType, setPnlFilterPnlType] = useState('')
  const [pnlPage,          setPnlPage]          = useState(1)
  const [expandedPnlRows,  setExpandedPnlRows]  = useState(new Set())
  const togglePnlRow = (id) => setExpandedPnlRows(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const PNL_PAGE_SIZE = 15

  // Policy Compliance filters + pagination
  const [compFilterPair,   setCompFilterPair]   = useState('')
  const [compFilterStatus, setCompFilterStatus] = useState('')
  const [compPage,         setCompPage]         = useState(1)
  const COMP_PAGE_SIZE = 15

  // MTM Report state
  const [mtmRows, setMtmRows]         = useState([])   // flat list of all forward tranche MTM rows
  const [mtmLoading, setMtmLoading]   = useState(true)
  // Map of tranche_id → { status: 'AT_RISK', acknowledgement: null | {acknowledged_at, acknowledged_by} }
  const [mcRiskData, setMcRiskData]   = useState({})

  // Maturity Schedule report
  const [maturity,         setMaturity]         = useState(null)
  const [maturityLoading,  setMaturityLoading]  = useState(true)
  const [matExpanded,      setMatExpanded]       = useState({})   // { 'YYYY-MM': true }

  // Trading Facilities report
  const [facilityUtil,        setFacilityUtil]        = useState(null)
  const [facilityLoading,     setFacilityLoading]     = useState(true)
  const [facFilterBank,       setFacFilterBank]        = useState('')
  const [facFilterStatus,     setFacFilterStatus]      = useState('')
  const [mtmFilterPair,   setMtmFilterPair]   = useState('')
  const [mtmFilterStatus, setMtmFilterStatus] = useState('')
  const [mtmFilterFrom,   setMtmFilterFrom]   = useState('')
  const [mtmFilterTo,     setMtmFilterTo]     = useState('')
  const [mtmPage, setMtmPage]         = useState(1)
  const [mtmSort, setMtmSort]         = useState({ col: 'valueDate', dir: 'asc' })
  const MTM_PAGE_SIZE = 15

  // Market Reports state
  const [marketReport,        setMarketReport]        = useState(null)
  const [marketHistory,       setMarketHistory]       = useState([])
  const [marketLoading,       setMarketLoading]       = useState(true)
  const [marketGenerating,    setMarketGenerating]    = useState(false)
  const [marketGenMsg,        setMarketGenMsg]        = useState(null)
  const [marketExpandedId,    setMarketExpandedId]    = useState(null)

  const authUser = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || 'null') } catch { return null } })()
  const isSuperAdmin = ['superadmin', 'admin'].includes(authUser?.role)

  const GEN_MESSAGES = ['Analysing your portfolio…', 'Reviewing rate movements…', 'Writing your report…']

  // Jump nav
  const REPORT_SECTIONS = [
    { id: 'market-reports',      label: '📊 Market Reports'     },
    { id: 'audit-trail',         label: 'Hedge Audit Trail'     },
    { id: 'pnl-summary',         label: 'P&L Summary'           },
    { id: 'policy-compliance',   label: 'Policy Compliance'     },
    { id: 'mtm-report',          label: 'MTM Report'            },
    { id: 'trading-facilities',  label: 'Trading Facilities'    },
    { id: 'maturity-schedule',   label: 'Maturity Schedule'     },
  ]
  const [activeSection, setActiveSection] = useState('audit-trail')
  const sectionRefs = useRef({})
  function scrollToSection(id) {
    setActiveSection(id)
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  // Filters
  const [filterPair,        setFilterPair]        = useState('')
  const [filterEventType,   setFilterEventType]   = useState('trading')
  const [filterFromDate,    setFilterFromDate]     = useState('')
  const [filterToDate,      setFilterToDate]       = useState('')
  const [showDeleted,       setShowDeleted]        = useState(false)

  useEffect(() => {
    if (companyId) {
      loadTrail()
      loadEnriched()
      loadMcRisk()
      loadFacilities()
      loadMarketReport()
      loadMaturity()
    }
  }, [companyId, filterPair, filterFromDate, filterToDate, showDeleted])

  // Deep-link from Dashboard "Review affected tranches" button:
  // navigate('/reports', { state: { mtmFilter: 'at_risk' } })
  useEffect(() => {
    if (location.state?.mtmFilter === 'at_risk') {
      setMtmFilterStatus('at_risk')
      // Clear state so a page refresh doesn't re-apply the filter
      navigate(location.pathname, { replace: true, state: {} })
      // Allow the DOM to render before scrolling
      setTimeout(() => scrollToSection('mtm-report'), 150)
    }
  }, [location.state])

  const loadMaturity = async () => {
    setMaturityLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/reports/maturity/${companyId}`, { headers: authHeaders() })
      if (res.ok) setMaturity(await res.json())
    } catch (e) { console.error('[maturity] fetch error:', e) }
    finally { setMaturityLoading(false) }
  }

  const loadMarketReport = async () => {
    setMarketLoading(true)
    try {
      const [repRes, histRes] = await Promise.all([
        fetch(`${API_BASE}/api/reports/market/${companyId}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/reports/market/${companyId}/history`, { headers: authHeaders() }),
      ])
      if (repRes.ok)  { const d = await repRes.json();  setMarketReport(d.report || null) }
      if (histRes.ok) { const d = await histRes.json(); setMarketHistory(d.history || []) }
    } catch (e) { console.error('[market-report] fetch error:', e) }
    finally { setMarketLoading(false) }
  }

  const generateMarketReport = async () => {
    setMarketGenerating(true)
    let msgIdx = 0
    setMarketGenMsg(GEN_MESSAGES[0])
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % GEN_MESSAGES.length
      setMarketGenMsg(GEN_MESSAGES[msgIdx])
    }, 2000)
    try {
      const res = await fetch(`${API_BASE}/api/reports/market/generate/${companyId}`, {
        method: 'POST', headers: authHeaders(),
      })
      if (res.ok) {
        await loadMarketReport()
        showToast('Market report generated successfully')
      } else {
        const err = await res.text()
        showToast(`Generation failed: ${err.slice(0, 100)}`)
      }
    } catch (e) {
      showToast('Generation failed — check console')
      console.error('[market-report] generate error:', e)
    } finally {
      clearInterval(interval)
      setMarketGenerating(false)
      setMarketGenMsg(null)
    }
  }

  const downloadMarketReportPdf = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reports/market/${companyId}/pdf`, { headers: authHeaders() })
      if (!res.ok) { showToast('PDF generation failed'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `sumnohow-fx-report-${marketReport?.report_date || 'latest'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast('PDF download failed — check console')
      console.error('[market-report] pdf error:', e)
    }
  }

  const loadFacilities = async () => {
    setFacilityLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/facilities/utilisation/${companyId}`, { headers: authHeaders() })
      if (res.ok) setFacilityUtil(await res.json())
    } catch (e) { console.error('[facilities] fetch error:', e) }
    finally { setFacilityLoading(false) }
  }

  const loadMcRisk = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/margin-call/status/${companyId}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        // Build map: tranche_id → { status, acknowledgement }
        const map = {}
        ;(data.tranches || []).forEach(t => {
          map[t.tranche_id] = {
            status:          t.status,
            acknowledgement: t.acknowledgement || null,
          }
        })
        setMcRiskData(map)
      }
    } catch (e) { console.error('[mc-risk] fetch error:', e) }
  }

  const loadEnriched = async () => {
    setEnrichedLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/exposures/enriched?company_id=${companyId}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : (data.items || [])
        setEnrichedItems(items)
        // Kick off MTM load now that we have exposure IDs
        loadMtmReport(items)
      }
    } catch (e) { console.error('Failed to load enriched exposures', e) }
    finally { setEnrichedLoading(false) }
  }

  const loadMtmReport = async (exposures) => {
    setMtmLoading(true)
    setMtmRows([])
    try {
      // Fetch MTM data for each exposure in parallel; failures are silently skipped
      const results = await Promise.allSettled(
        exposures.map(exp =>
          fetch(`${API_BASE}/api/tranches/mtm/${exp.id}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
        )
      )

      const flat = []
      results.forEach((result, idx) => {
        if (result.status !== 'fulfilled' || !result.value) return
        const { tranches } = result.value
        if (!tranches?.length) return
        const exp = exposures[idx]
        tranches.forEach(t => {
          flat.push({
            exposureId:      exp.id,
            currencyPair:    exp.currency_pair,
            description:     exp.description || '',
            fromCurrency:    exp.from_currency,
            trancheId:       t.tranche_id,
            notional:        t.notional,
            inceptionRate:   t.inception_rate,
            budgetRate:      t.budget_rate,
            spotRate:        t.current_spot,
            mtmVsInception:  t.mtm_vs_inception_eur,
            mtmVsBudget:     t.mtm_vs_budget_eur,
            valueDate:       t.value_date,
            status:          t.status,
          })
        })
      })
      setMtmRows(flat)
    } catch (e) { console.error('Failed to load MTM report', e) }
    finally { setMtmLoading(false) }
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
        (Math.abs(e.floating_pnl ?? 0) < 0.005 ? 0 : (e.floating_pnl ?? 0)).toFixed(2),
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
        const target = (e.zone_target_ratio ?? 0) * 100
        const actual = e.hedge_pct ?? 0
        const diff   = actual - target
        const status = Math.abs(diff) <= 5 ? 'ON TARGET' : diff < 0 ? 'UNDER' : 'OVER'
        return [e.currency_pair, target.toFixed(0) + '%', actual.toFixed(1) + '%', status]
      })
      downloadCsv(`policy-compliance-${new Date().toISOString().split('T')[0]}.csv`, hdrs, rows)
    } finally { setCompCsvLoading(false) }
  }

  const clearFilters = () => {
    setFilterPair(''); setFilterEventType('trading'); setFilterFromDate(''); setFilterToDate('')
    setShowDeleted(false); setAuditPage(1)
  }

  const displayed = filterEventType === 'trading'
    ? events.filter(e => AUDIT_TRADING_TYPES.includes(e.event_type))
    : filterEventType === 'system'
      ? events.filter(e => AUDIT_SYSTEM_TYPES.includes(e.event_type))
      : events

  const auditPages   = Math.max(1, Math.ceil(displayed.length / auditPageSize))
  const auditPaged   = displayed.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize)

  const hasFilters = filterPair || filterEventType !== 'trading' || filterFromDate || filterToDate || showDeleted

  const auditSummary = (() => {
    const tradingEvts = displayed.filter(e => e.event_type === 'tranche')
    const totalExecuted = tradingEvts.length
    const totalNotional = tradingEvts.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const withRate   = tradingEvts.filter(e => e.execution_rate)
    const avgRate    = withRate.length > 0
      ? withRate.reduce((s, e) => s + Number(e.execution_rate), 0) / withRate.length
      : null
    const withBudget = tradingEvts.filter(e => e.budget_rate)
    const avgBudget  = withBudget.length > 0
      ? withBudget.reduce((s, e) => s + Number(e.budget_rate), 0) / withBudget.length
      : null
    const ccys     = [...new Set(tradingEvts.filter(e => e.amount_currency).map(e => e.amount_currency))]
    const currency = ccys.length === 1 ? ccys[0] : ccys.length > 1 ? 'mixed' : ''
    return { totalExecuted, totalNotional, avgRate, avgBudget, currency }
  })()

  // ── P&L derived data ────────────────────────────────────────────────────
  const activeItems = useMemo(() => enrichedItems.filter(e => !e.archived), [enrichedItems])
  const pnlPairs    = useMemo(() => [...new Set(activeItems.map(e => e.currency_pair))].sort(), [activeItems])

  const pnlFiltered = useMemo(() => activeItems.filter(e => {
    if (pnlFilterPair && e.currency_pair !== pnlFilterPair) return false
    if (pnlFilterStatus) {
      const s = e.status
      if (pnlFilterStatus === 'hedged'      && s !== 'WELL_HEDGED')  return false
      if (pnlFilterStatus === 'in_progress' && s !== 'IN_PROGRESS')  return false
      if (pnlFilterStatus === 'open'        && s !== 'OPEN')         return false
    }
    if (pnlFilterPnlType === 'locked'   && (e.locked_pnl   ?? 0) === 0) return false
    if (pnlFilterPnlType === 'floating' && (e.floating_pnl ?? 0) === 0) return false
    return true
  }), [activeItems, pnlFilterPair, pnlFilterStatus, pnlFilterPnlType])

  const pnlPages  = Math.max(1, Math.ceil(pnlFiltered.length / PNL_PAGE_SIZE))
  const pnlPaged  = pnlFiltered.slice((pnlPage - 1) * PNL_PAGE_SIZE, pnlPage * PNL_PAGE_SIZE)

  // KPI totals always over all active items regardless of filter
  const kpiLockedPnl   = activeItems.reduce((s, e) => s + (e.locked_pnl   ?? 0), 0)
  const kpiFloatingPnl = activeItems.reduce((s, e) => s + (e.floating_pnl ?? 0), 0)
  const kpiCombinedPnl = activeItems.reduce((s, e) => s + (e.combined_pnl ?? 0), 0)
  const kpiInLoss      = activeItems.filter(e => (e.combined_pnl ?? 0) < 0).length

  // ── Compliance derived data ─────────────────────────────────────────────
  const compPairs   = useMemo(() => [...new Set(activeItems.map(e => e.currency_pair))].sort(), [activeItems])

  const compFiltered = useMemo(() => activeItems.filter(e => {
    if (compFilterPair && e.currency_pair !== compFilterPair) return false
    if (compFilterStatus) {
      const target = (e.zone_target_ratio ?? 0) * 100
      const actual = e.hedge_pct ?? 0
      const diff   = actual - target
      const isBreached = e.status === 'BREACH'
      if (compFilterStatus === 'breach'    && !isBreached)              return false
      if (compFilterStatus === 'compliant' && (isBreached || Math.abs(diff) > 5)) return false
      if (compFilterStatus === 'under'     && (isBreached || diff >= -5))         return false
      if (compFilterStatus === 'over'      && diff <= 5)                          return false
    }
    return true
  }), [activeItems, compFilterPair, compFilterStatus])

  const compPages = Math.max(1, Math.ceil(compFiltered.length / COMP_PAGE_SIZE))
  const compPaged = compFiltered.slice((compPage - 1) * COMP_PAGE_SIZE, compPage * COMP_PAGE_SIZE)

  // KPI counts always over all active items
  const kpiBreaches   = activeItems.filter(e => e.status === 'BREACH').length
  const kpiUnder      = activeItems.filter(e => {
    const diff = (e.hedge_pct ?? 0) - (e.zone_target_ratio ?? 0) * 100
    return e.status !== 'BREACH' && diff < -5
  }).length
  const kpiCompliant  = activeItems.filter(e => {
    const diff = (e.hedge_pct ?? 0) - (e.zone_target_ratio ?? 0) * 100
    return e.status !== 'BREACH' && Math.abs(diff) <= 5
  }).length
  const kpiAvgHedge   = activeItems.length > 0
    ? activeItems.reduce((s, e) => s + (e.hedge_pct ?? 0), 0) / activeItems.length
    : 0

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

      {/* ── Jump nav ────────────────────────────────────────────────────── */}
      <JumpNav sections={REPORT_SECTIONS} active={activeSection} onNavigate={scrollToSection} />

      <ScrollToTop />

      {/* ── Market Reports ────────────────────────────────────────────── */}
      <div ref={el => { sectionRefs.current['market-reports'] = el }} className="scroll-mt-32">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: NAVY }}>
          <div className="flex items-center gap-3">
            <TrendingUp size={15} color={GOLD} />
            <h3 className="font-semibold text-white text-sm">Weekly FX Market Report</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(201,168,108,0.2)', color: GOLD }}>AI-generated</span>
          </div>
          <div className="flex items-center gap-2">
            {marketReport && (
              <button
                onClick={downloadMarketReportPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(201,168,108,0.15)', color: GOLD, border: `1px solid rgba(201,168,108,0.4)` }}>
                <Download size={12} /> Download PDF
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={generateMarketReport}
                disabled={marketGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                style={{ background: GOLD, color: NAVY, minWidth: 150 }}>
                {marketGenerating
                  ? <><span className="animate-pulse">●</span> {marketGenMsg}</>
                  : <><TrendingUp size={12} /> Generate Report</>
                }
              </button>
            )}
          </div>
        </div>

        <div className="p-5">
          {marketLoading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading market report…</p>
          ) : !marketReport ? (
            <div className="text-center py-8 text-gray-400">
              <TrendingUp size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No market report yet</p>
              <p className="text-xs mt-1">
                {isSuperAdmin ? 'Click "Generate Report" to create the first one.' : 'Reports are generated every Monday morning.'}
              </p>
            </div>
          ) : (() => {
            const c = marketReport.content || {}
            return (
              <div>
                {/* Headline */}
                <p className="text-base font-semibold mb-1" style={{ color: NAVY }}>{c.headline}</p>
                <p className="text-xs text-gray-400 mb-4">
                  Generated {marketReport.generated_at ? new Date(marketReport.generated_at).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' }) : ''}
                </p>

                {/* Portfolio impact */}
                <div className="mb-4 p-4 rounded-lg" style={{ background: '#F4F6FA' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: GOLD }}>Portfolio Impact</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{c.portfolio_impact}</p>
                </div>

                {/* Risk alert */}
                {c.risk_alert && (
                  <div className="mb-4 p-4 rounded-lg flex gap-3"
                    style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <AlertTriangle size={16} color="#EF4444" className="shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: '#EF4444' }}>Risk Alert</p>
                      <p className="text-sm text-gray-700">{c.risk_alert}</p>
                    </div>
                  </div>
                )}

                {/* Per-pair commentary with sparklines */}
                {(c.pair_commentary || []).length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: GOLD }}>
                      Your Currency Pairs This Week
                    </p>
                    <div className="space-y-3">
                      {c.pair_commentary.map((pc, i) => {
                        const sparkColor = pc.favourable === false ? DANGER : SUCCESS
                        const hasHistory = Array.isArray(pc.rate_history) && pc.rate_history.length >= 2
                        const histStart  = hasHistory ? pc.rate_history[0].rate : null
                        const histEnd    = hasHistory ? pc.rate_history[pc.rate_history.length - 1].rate : null
                        return (
                          <div key={i} className="rounded-lg border border-gray-100 overflow-hidden"
                            style={{ background: '#FAFBFC' }}>
                            {/* Pair header */}
                            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                              <span className="font-semibold text-sm" style={{ color: NAVY }}>{pc.pair}</span>
                              <span className="text-xs font-bold"
                                style={{ color: pc.favourable === false ? DANGER : SUCCESS }}>
                                {pc.movement}
                              </span>
                            </div>
                            {/* Sparkline */}
                            {hasHistory && (
                              <div className="relative px-0" style={{ height: 80 }}>
                                {/* Start rate label */}
                                <span className="absolute left-2 bottom-1 text-[10px] text-gray-400 z-10 font-mono">
                                  {histStart?.toFixed(4)}
                                </span>
                                {/* End rate label */}
                                <span className="absolute right-2 bottom-1 text-[10px] font-mono z-10"
                                  style={{ color: sparkColor }}>
                                  {histEnd?.toFixed(4)}
                                </span>
                                <ResponsiveContainer width="100%" height={80}>
                                  <LineChart data={pc.rate_history} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
                                    <Line
                                      type="monotone"
                                      dataKey="rate"
                                      stroke={sparkColor}
                                      strokeWidth={2}
                                      dot={false}
                                      isAnimationActive={false}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                            {/* Text content */}
                            <div className="px-4 pb-4 pt-2">
                              <p className="text-sm text-gray-600 mb-1">{pc.client_impact}</p>
                              <p className="text-xs text-gray-400">{pc.outlook}</p>
                              {pc.action && (
                                <div className="mt-2 px-3 py-2 rounded text-xs font-semibold"
                                  style={{ background: 'rgba(201,168,108,0.1)', color: '#92711A', borderLeft: `3px solid ${GOLD}` }}>
                                  Action: {pc.action}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Economic calendar */}
                {(c.key_events || []).length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: GOLD }}>
                      Key Events This Week
                    </p>
                    <div className="rounded-lg border border-gray-100 overflow-hidden">
                      {c.key_events.map((ev, i) => {
                        const impactColor = ev.impact === 'High' ? DANGER
                          : ev.impact === 'Medium' ? WARNING : '#9CA3AF'
                        const flag = CURRENCY_FLAGS[ev.currency] || '🌐'
                        let dateLabel = ev.date || ''
                        try {
                          dateLabel = new Date(ev.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                        } catch (_) {}
                        return (
                          <div key={i} className={`flex gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}
                            style={{ background: i % 2 === 0 ? 'white' : '#FAFBFC' }}>
                            {/* Date */}
                            <div className="w-24 shrink-0">
                              <p className="text-xs font-semibold text-gray-700">{dateLabel}</p>
                            </div>
                            {/* Flag + event */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-base leading-none">{flag}</span>
                                <span className="text-xs font-semibold text-gray-800">{ev.event}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                                  style={{ background: `${impactColor}18`, color: impactColor }}>
                                  {ev.impact}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400">{ev.description}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Week ahead */}
                {c.week_ahead && (
                  <div className="mb-4 p-4 rounded-lg" style={{ background: '#F4F6FA' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: GOLD }}>The Week Ahead</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{c.week_ahead}</p>
                  </div>
                )}

                {/* Disclaimer */}
                <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-100 pt-4 mt-4">
                  This report is generated by the Sumnohow AI engine for informational purposes only.
                  It does not constitute financial advice or a recommendation to execute any transaction.
                  All hedging decisions should be made in consultation with your treasury team and banking
                  partners. Rates shown are indicative only.
                </p>
              </div>
            )
          })()}

          {/* Report history */}
          {marketHistory.length > 1 && (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: GOLD }}>
                Report History
              </p>
              <div className="space-y-1">
                {marketHistory.slice(1).map(h => (
                  <div key={h.id}>
                    <button
                      onClick={() => setMarketExpandedId(marketExpandedId === h.id ? null : h.id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-gray-50 transition-all">
                      <span className="text-xs text-gray-500">
                        {h.report_date ? new Date(h.report_date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : ''}
                      </span>
                      <span className="text-xs text-gray-600 flex-1 mx-3 truncate">{h.headline}</span>
                      <ChevronDown size={13} className="text-gray-400 shrink-0"
                        style={{ transform: marketExpandedId === h.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>{/* /market-reports ref wrapper */}

      {/* ── Hedge Audit Trail ─────────────────────────────────────────── */}
      <div ref={el => { sectionRefs.current['audit-trail'] = el }} className="scroll-mt-32">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: NAVY }}>
          <div className="flex items-center gap-3">
            <CheckCircle size={15} color={GOLD} />
            <h3 className="font-semibold text-white text-sm">Hedge Audit Trail</h3>
          </div>
          <button onClick={handleDownloadCSV} disabled={csvLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: GOLD, color: NAVY, minWidth: 110 }}>
            {csvLoading
              ? <LoadingAnimation text="Generating report" size="small" />
              : <><Download size={12} /> Export CSV</>
            }
          </button>
        </div>

        {/* Filter bar */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3"
          style={{ background: '#F9FAFB' }}>
          <Filter size={13} className="text-gray-400 shrink-0" />

          <select value={filterPair} onChange={e => { setFilterPair(e.target.value); setAuditPage(1) }}
            className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs">
            <option value="">All Currencies</option>
            {pairs.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={filterEventType} onChange={e => { setFilterEventType(e.target.value); setAuditPage(1) }}
            className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs">
            <option value="trading">Trading Events</option>
            <option value="system">System Events</option>
            <option value="">All Events</option>
          </select>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">From</label>
            <input type="date" value={filterFromDate}
              onChange={e => { setFilterFromDate(e.target.value); setAuditPage(1) }}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">to</label>
            <input type="date" value={filterToDate}
              onChange={e => { setFilterToDate(e.target.value); setAuditPage(1) }}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)}
              className="rounded" />
            Include archived tranches
          </label>

          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg">
              <X size={11} /> Reset filters
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400">{displayed.length} events</span>
        </div>

        {/* Summary strip */}
        {!loading && auditSummary.totalExecuted > 0 && (
          <div className="grid grid-cols-3 gap-0 border-b border-gray-100">
            <div className="px-5 py-3 border-r border-gray-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Tranches Executed</p>
              <p className="text-base font-bold" style={{ color: NAVY }}>{auditSummary.totalExecuted}</p>
              <p className="text-xs text-gray-400">This period</p>
            </div>
            <div className="px-5 py-3 border-r border-gray-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Total Notional Hedged</p>
              <p className="text-base font-bold" style={{ color: NAVY }}>
                {auditSummary.totalNotional > 0
                  ? auditSummary.totalNotional.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : '—'}
                {auditSummary.currency && auditSummary.currency !== 'mixed' && (
                  <span className="text-sm font-normal text-gray-400 ml-1">{auditSummary.currency}</span>
                )}
              </p>
              <p className="text-xs text-gray-400">Sum of hedge amounts</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Avg Rate vs Budget</p>
              {filterPair ? (
                <p className="text-base font-bold" style={{ color: NAVY }}>
                  {auditSummary.avgRate != null ? auditSummary.avgRate.toFixed(4) : '—'}
                  {auditSummary.avgBudget != null && (
                    <span className="text-sm font-normal text-gray-400 ml-2">
                      vs {auditSummary.avgBudget.toFixed(4)}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">Multiple pairs — filter to view avg rate</p>
              )}
              <p className="text-xs text-gray-400">{filterPair ? `${filterPair} execution vs budget` : 'Execution vs budget rate'}</p>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <LoadingAnimation text="Loading audit trail…" size="medium" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No results match your filters.</div>
        ) : (
<>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs divide-y divide-gray-100">
                <thead style={{ background: '#F4F6FA' }}>
                  <tr>
                    {['Date / Time', 'Event', 'Currency', 'Description', 'Amount', 'Rate', 'Instrument', 'Value Date', 'Status', 'User', 'Notes'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                        style={{ color: NAVY }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(() => {
                    // Build flat list of date-header + row items for visual grouping
                    const items = []
                    let lastDate = null
                    auditPaged.forEach((ev, i) => {
                      const dateLabel = ev.event_at
                        ? new Date(ev.event_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                        : 'Unknown Date'
                      if (dateLabel !== lastDate) {
                        lastDate = dateLabel
                        items.push({ type: 'header', date: dateLabel, key: `hdr-${dateLabel}-${i}` })
                      }
                      items.push({ type: 'row', ev, key: `row-${i}` })
                    })

                    const naCell = <span className="text-gray-300 text-xs">N/A</span>

                    return items.map(item => {
                      if (item.type === 'header') {
                        return (
                          <tr key={item.key}>
                            <td colSpan={11} className="px-3 py-1.5 text-xs font-semibold tracking-wider text-gray-400 uppercase border-t border-b border-gray-200"
                              style={{ background: '#F4F6FA' }}>
                              {item.date}
                            </td>
                          </tr>
                        )
                      }

                      const { ev } = item
                      const isOrder = ev.event_type === 'order'
                      // Derive a readable notes string for orders: action text, with order_type as fallback
                      const orderNotes = ev.notes || (ev.order_type ? `${ev.order_type} order` : null)

                      return (
                        <tr key={item.key} className={`hover:bg-gray-50 ${ev.is_active === false ? 'opacity-60' : ''}`}>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtDate(ev.event_at)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <EventBadge type={ev.event_type} />
                              {ev.is_active === false && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-400">deleted</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{ color: NAVY }}>{ev.currency_pair || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-xs">
                            <div className="truncate">{ev.description || '—'}</div>
                            {ev.reference && <div className="text-gray-400">{ev.reference}</div>}
                          </td>
                          <td className="px-3 py-2 font-mono text-right whitespace-nowrap">
                            {isOrder ? naCell : ev.amount ? <>{fmt(ev.amount)}{ev.amount_currency && <div className="text-gray-400">{ev.amount_currency}</div>}</> : '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-right whitespace-nowrap">
                            {isOrder ? naCell : (
                              <>
                                <div>{ev.execution_rate ? ev.execution_rate.toFixed(4) : '—'}</div>
                                {ev.budget_rate && <div className="text-gray-400">Budget: {Number(ev.budget_rate).toFixed(4)}</div>}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{ev.instrument || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDateOnly(ev.value_date)}</td>
                          <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={ev.tranche_status} /></td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{ev.created_by || '—'}</td>
                          <td className="px-3 py-2 text-gray-400 max-w-xs">
                            <div className="truncate cursor-help" title={isOrder ? orderNotes || undefined : ev.reason || ev.notes || undefined}>
                              {isOrder ? (orderNotes || '—') : (ev.reason || ev.notes || '—')}
                            </div>
                            {ev.limit_rate && <div>TP: {Number(ev.limit_rate).toFixed(4)} / SL: {Number(ev.stop_rate).toFixed(4)}</div>}
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
            {/* Pagination + page size selector */}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 text-xs">
              {/* Page size selector — always visible */}
              <span className="text-gray-400 mr-1">Show:</span>
              {[15, 25, 50].map(n => (
                <button
                  key={n}
                  onClick={() => { setAuditPageSize(n); setAuditPage(1) }}
                  className="px-2 py-1 rounded border text-xs font-semibold"
                  style={{
                    background:  n === auditPageSize ? NAVY    : 'white',
                    color:       n === auditPageSize ? 'white' : '#6B7280',
                    borderColor: n === auditPageSize ? NAVY    : '#E5E7EB',
                  }}
                >
                  {n}
                </button>
              ))}

              {auditPages > 1 && (
                <>
                  <span className="text-gray-300 mx-1">|</span>
                  <span className="text-gray-400">Page {auditPage} of {auditPages}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage === 1}
                      className="px-2.5 py-1.5 rounded border border-gray-200 disabled:opacity-40">← Prev</button>
                    {Array.from({ length: auditPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setAuditPage(p)}
                        className="px-2.5 py-1.5 rounded border text-xs font-semibold"
                        style={{ background: p === auditPage ? NAVY : 'white', color: p === auditPage ? 'white' : '#6B7280', borderColor: p === auditPage ? NAVY : '#E5E7EB' }}>
                        {p}
                      </button>
                    ))}
                    <button onClick={() => setAuditPage(p => Math.min(auditPages, p + 1))} disabled={auditPage === auditPages}
                      className="px-2.5 py-1.5 rounded border border-gray-200 disabled:opacity-40">Next →</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
      </div>{/* /audit-trail ref wrapper */}

      {/* ── P&L Summary Report ───────────────────────────────────────── */}
      <div ref={el => { sectionRefs.current['pnl-summary'] = el }} className="scroll-mt-32">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
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
        ) : activeItems.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">No active exposures found.</div>
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-4 gap-0 border-b border-gray-100">
              {[
                { label: 'Total Locked P&L',   value: fmtEur(kpiLockedPnl),   color: mtmColor(kpiLockedPnl),   sub: 'Crystallised from hedges' },
                { label: 'Total Floating P&L',  value: fmtEur(kpiFloatingPnl),  color: mtmColor(kpiFloatingPnl),  sub: 'Open positions vs spot' },
                { label: 'Total Combined P&L',  value: fmtEur(kpiCombinedPnl),  color: mtmColor(kpiCombinedPnl),  sub: 'Full portfolio position' },
                { label: 'Exposures in Loss',   value: kpiInLoss,               color: kpiInLoss > 0 ? DANGER : SUCCESS, sub: 'Combined P&L negative' },
              ].map((kpi, i) => (
                <div key={i} className="px-5 py-4 border-r border-gray-100 last:border-r-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{kpi.label}</p>
                  <p className="text-lg font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Filter bar */}
            <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3"
              style={{ background: '#F9FAFB' }}>
              <Filter size={13} className="text-gray-400 shrink-0" />

              <select value={pnlFilterPair} onChange={e => { setPnlFilterPair(e.target.value); setPnlPage(1) }}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs">
                <option value="">All Pairs</option>
                {pnlPairs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <select value={pnlFilterPnlType} onChange={e => { setPnlFilterPnlType(e.target.value); setPnlPage(1) }}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs">
                <option value="">All P&L Types</option>
                <option value="locked">Has Locked P&L</option>
                <option value="floating">Has Floating P&L</option>
              </select>

              <select value={pnlFilterStatus} onChange={e => { setPnlFilterStatus(e.target.value); setPnlPage(1) }}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs">
                <option value="">All Statuses</option>
                <option value="hedged">Hedged</option>
                <option value="in_progress">In Progress</option>
                <option value="open">Open</option>
              </select>

              {(pnlFilterPair || pnlFilterStatus || pnlFilterPnlType) && (
                <button onClick={() => { setPnlFilterPair(''); setPnlFilterStatus(''); setPnlFilterPnlType(''); setPnlPage(1) }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg">
                  <X size={11} /> Reset filters
                </button>
              )}
              <span className="ml-auto text-xs text-gray-400">{pnlFiltered.length} exposures</span>
            </div>

            {/* Table */}
            {pnlFiltered.length === 0 ? (
              <div className="text-center py-10 text-sm text-gray-400">No results match your filters.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs divide-y divide-gray-100">
                    <thead style={{ background: '#F4F6FA' }}>
                      <tr>
                        {['', 'Pair', 'Total Amount', 'Hedge %', 'Avg Rate', 'Budget Rate', 'Current Rate', 'Locked P&L', 'Floating P&L', 'Combined P&L'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                            style={{ color: NAVY }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pnlPaged.map((e, i) => {
                        const combined  = e.combined_pnl ?? 0
                        const isExpanded = expandedPnlRows.has(e.id)
                        return (
                          <React.Fragment key={i}>
                            <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => togglePnlRow(e.id)}>
                              <td className="px-2 py-2 w-6 text-gray-400">
                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </td>
                              <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{ color: NAVY }}>{e.currency_pair}</td>
                              <td className="px-3 py-2 font-mono text-right whitespace-nowrap">{fmt(e.total_amount)} {e.from_currency}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">{(e.hedge_pct ?? 0).toFixed(1)}%</td>
                              <td className="px-3 py-2 font-mono text-right whitespace-nowrap text-gray-500">
                                {e.weighted_avg_rate != null ? e.weighted_avg_rate.toFixed(4) : '—'}
                              </td>
                              <td className="px-3 py-2 font-mono text-right whitespace-nowrap">{(e.budget_rate ?? 0).toFixed(4)}</td>
                              <td className="px-3 py-2 font-mono text-right whitespace-nowrap">{(e.current_spot ?? 0).toFixed(4)}</td>
                              <td className="px-3 py-2 font-mono text-right whitespace-nowrap"
                                style={{ color: (e.locked_pnl ?? 0) >= 0 ? SUCCESS : DANGER }}>
                                {(e.locked_pnl ?? 0) >= 0 ? '+' : ''}{fmt(e.locked_pnl)}
                              </td>
                              <td className="px-3 py-2 font-mono text-right whitespace-nowrap"
                                style={{ color: Math.abs(e.floating_pnl ?? 0) < 0.005 ? '#9CA3AF' : (e.floating_pnl ?? 0) > 0 ? SUCCESS : DANGER }}>
                                {Math.abs(e.floating_pnl ?? 0) < 0.005
                                  ? '—'
                                  : `${(e.floating_pnl ?? 0) > 0 ? '+' : ''}${fmt(e.floating_pnl)}`}
                              </td>
                              <td className="px-3 py-2 font-mono text-right font-bold whitespace-nowrap"
                                style={{ color: combined >= 0 ? SUCCESS : DANGER }}>
                                {combined >= 0 ? '+' : ''}{fmt(combined)}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr style={{ background: '#F9FAFB' }}>
                                <td colSpan={10} className="px-5 py-3">
                                  <div className="grid grid-cols-3 gap-4 text-xs">
                                    <div className="rounded-lg border border-gray-200 px-3 py-2.5">
                                      <p className="font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Hedged Portion</p>
                                      <p className="text-gray-700">{fmt(e.hedged_amount)} {e.from_currency} at avg rate <span className="font-mono font-semibold">{e.weighted_avg_rate != null ? e.weighted_avg_rate.toFixed(4) : '—'}</span></p>
                                      <p className="mt-1 font-semibold" style={{ color: (e.locked_pnl ?? 0) >= 0 ? SUCCESS : DANGER }}>
                                        Locked P&L: {(e.locked_pnl ?? 0) >= 0 ? '+' : ''}{fmtEur(e.locked_pnl)}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-gray-200 px-3 py-2.5">
                                      <p className="font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Open Portion</p>
                                      <p className="text-gray-700">{fmt(e.open_amount)} {e.from_currency} at spot <span className="font-mono font-semibold">{(e.current_spot ?? 0).toFixed(4)}</span> vs budget <span className="font-mono">{(e.budget_rate ?? 0).toFixed(4)}</span></p>
                                      <p className="mt-1 font-semibold" style={{ color: Math.abs(e.floating_pnl ?? 0) < 0.005 ? '#9CA3AF' : (e.floating_pnl ?? 0) >= 0 ? SUCCESS : DANGER }}>
                                        Floating P&L: {Math.abs(e.floating_pnl ?? 0) < 0.005 ? '—' : `${(e.floating_pnl ?? 0) >= 0 ? '+' : ''}${fmtEur(e.floating_pnl)}`}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-gray-200 px-3 py-2.5">
                                      <p className="font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Combined P&L</p>
                                      <p className="text-gray-700">Locked + floating on {fmt(e.total_amount)} {e.from_currency}</p>
                                      <p className="mt-1 font-bold text-sm" style={{ color: combined >= 0 ? SUCCESS : DANGER }}>
                                        {combined >= 0 ? '+' : ''}{fmtEur(combined)}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {pnlPages > 1 && (
                  <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Page {pnlPage} of {pnlPages}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => setPnlPage(p => Math.max(1, p - 1))} disabled={pnlPage === 1}
                        className="px-2.5 py-1.5 rounded border border-gray-200 disabled:opacity-40">← Prev</button>
                      {Array.from({ length: pnlPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setPnlPage(p)}
                          className="px-2.5 py-1.5 rounded border text-xs font-semibold"
                          style={{ background: p === pnlPage ? NAVY : 'white', color: p === pnlPage ? 'white' : '#6B7280', borderColor: p === pnlPage ? NAVY : '#E5E7EB' }}>
                          {p}
                        </button>
                      ))}
                      <button onClick={() => setPnlPage(p => Math.min(pnlPages, p + 1))} disabled={pnlPage === pnlPages}
                        className="px-2.5 py-1.5 rounded border border-gray-200 disabled:opacity-40">Next →</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      </div>{/* /pnl-summary ref wrapper */}

      {/* ── Policy Compliance Report ──────────────────────────────────── */}
      <div ref={el => { sectionRefs.current['policy-compliance'] = el }} className="scroll-mt-32">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
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
        ) : activeItems.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">No active exposures found.</div>
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-4 gap-0 border-b border-gray-100">
              {[
                { label: 'Exposures in Breach',    value: kpiBreaches,              color: kpiBreaches  > 0 ? DANGER  : SUCCESS, sub: 'Outside corridor' },
                { label: 'Under Target',           value: kpiUnder,                 color: kpiUnder     > 0 ? WARNING : SUCCESS, sub: 'Below policy minimum' },
                { label: 'Compliant',              value: kpiCompliant,             color: kpiCompliant > 0 ? SUCCESS : '#9CA3AF', sub: 'Within ±5% of target' },
                { label: 'Avg Hedge Coverage',     value: kpiAvgHedge.toFixed(1) + '%', color: NAVY,    sub: 'Across all exposures' },
              ].map((kpi, i) => (
                <div key={i} className="px-5 py-4 border-r border-gray-100 last:border-r-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{kpi.label}</p>
                  <p className="text-lg font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Filter bar */}
            <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3"
              style={{ background: '#F9FAFB' }}>
              <Filter size={13} className="text-gray-400 shrink-0" />

              <select value={compFilterPair} onChange={e => { setCompFilterPair(e.target.value); setCompPage(1) }}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs">
                <option value="">All Pairs</option>
                {compPairs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <select value={compFilterStatus} onChange={e => { setCompFilterStatus(e.target.value); setCompPage(1) }}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs">
                <option value="">All Statuses</option>
                <option value="breach">Breach</option>
                <option value="under">Under Target</option>
                <option value="compliant">Compliant</option>
                <option value="over">Over Target</option>
              </select>

              {(compFilterPair || compFilterStatus) && (
                <button onClick={() => { setCompFilterPair(''); setCompFilterStatus(''); setCompPage(1) }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg">
                  <X size={11} /> Reset filters
                </button>
              )}
              <span className="ml-auto text-xs text-gray-400">{compFiltered.length} exposures</span>
            </div>

            {/* Table */}
            {compFiltered.length === 0 ? (
              <div className="text-center py-10 text-sm text-gray-400">No results match your filters.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs divide-y divide-gray-100">
                    <thead style={{ background: '#F4F6FA' }}>
                      <tr>
                        {['Pair', 'Policy Target %', 'Actual Hedge %', 'Gap', 'Status'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                            style={{ color: NAVY }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {compPaged.map((e, i) => {
                        const target = (e.zone_target_ratio ?? 0) * 100
                        const actual = e.hedge_pct ?? 0
                        const diff   = actual - target
                        const isBreached = e.status === 'BREACH'
                        let statusLabel, statusStyle
                        if (isBreached) {
                          statusLabel = 'BREACH';    statusStyle = { background: '#FEE2E2', color: DANGER }
                        } else if (Math.abs(diff) <= 5) {
                          statusLabel = 'ON TARGET'; statusStyle = { background: '#D1FAE5', color: SUCCESS }
                        } else if (diff < 0) {
                          statusLabel = 'UNDER';     statusStyle = { background: '#FEF3C7', color: '#92400E' }
                        } else {
                          statusLabel = 'OVER';      statusStyle = { background: '#EDE9FE', color: '#5B21B6' }
                        }
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{ color: NAVY }}>{e.currency_pair}</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">{target.toFixed(0)}%</td>
                            <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{actual.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: diff >= 0 ? SUCCESS : DANGER }}>
                              {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
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
                {compPages > 1 && (
                  <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Page {compPage} of {compPages}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => setCompPage(p => Math.max(1, p - 1))} disabled={compPage === 1}
                        className="px-2.5 py-1.5 rounded border border-gray-200 disabled:opacity-40">← Prev</button>
                      {Array.from({ length: compPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setCompPage(p)}
                          className="px-2.5 py-1.5 rounded border text-xs font-semibold"
                          style={{ background: p === compPage ? NAVY : 'white', color: p === compPage ? 'white' : '#6B7280', borderColor: p === compPage ? NAVY : '#E5E7EB' }}>
                          {p}
                        </button>
                      ))}
                      <button onClick={() => setCompPage(p => Math.min(compPages, p + 1))} disabled={compPage === compPages}
                        className="px-2.5 py-1.5 rounded border border-gray-200 disabled:opacity-40">Next →</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      </div>{/* /policy-compliance ref wrapper */}

      {/* ── MTM Report ──────────────────────────────────────────────────── */}
      <div ref={el => { sectionRefs.current['mtm-report'] = el }} className="scroll-mt-32">
      <MtmReport
        rows={mtmRows}
        loading={mtmLoading}
        filterPair={mtmFilterPair}   setFilterPair={setMtmFilterPair}
        filterStatus={mtmFilterStatus} setFilterStatus={setMtmFilterStatus}
        filterFrom={mtmFilterFrom}   setFilterFrom={setMtmFilterFrom}
        filterTo={mtmFilterTo}       setFilterTo={setMtmFilterTo}
        page={mtmPage}               setPage={setMtmPage}
        sort={mtmSort}               setSort={setMtmSort}
        pageSize={MTM_PAGE_SIZE}
        mcRiskData={mcRiskData}
      />
      </div>{/* /mtm-report ref wrapper */}

      {/* ── Trading Facilities Report ────────────────────────────────── */}
      <div ref={el => { sectionRefs.current['trading-facilities'] = el }} className="scroll-mt-32">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: NAVY }}>
          <h3 className="font-semibold text-white text-sm">Trading Facilities</h3>
          {facilityUtil && (
            <span className="text-xs" style={{ color: '#8DA4C4' }}>
              {facilityUtil.facilities?.length || 0} facilit{facilityUtil.facilities?.length === 1 ? 'y' : 'ies'} ·
              Total: EUR {facilityUtil.total_limit_eur >= 1_000_000
                ? `${(facilityUtil.total_limit_eur / 1_000_000).toFixed(1)}M`
                : `${(facilityUtil.total_limit_eur / 1_000).toFixed(0)}K`}
            </span>
          )}
        </div>

        {facilityLoading ? (
          <div className="p-6"><LoadingAnimation text="Loading facilities…" size="small" /></div>
        ) : !facilityUtil || !facilityUtil.facilities?.length ? (
          <div className="p-6 text-sm text-gray-400">
            No trading facilities configured. Add them in Settings → Bank Details.
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <input
                type="text" placeholder="Filter by bank…"
                value={facFilterBank}
                onChange={e => setFacFilterBank(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-40"
              />
              <select
                value={facFilterStatus}
                onChange={e => setFacFilterStatus(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs">
                <option value="">All Statuses</option>
                <option value="NORMAL">Normal</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>

            {/* Summary totals */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Limit',     val: facilityUtil.total_limit_eur,     color: NAVY    },
                { label: 'Total Utilised',  val: facilityUtil.total_utilised_eur,  color: DANGER  },
                { label: 'Total Available', val: facilityUtil.total_available_eur, color: SUCCESS },
              ].map(({ label, val, color }) => (
                <div key={label} className="rounded-lg p-3 border border-gray-100 text-center">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className="text-base font-bold" style={{ color }}>
                    EUR {val >= 1_000_000
                      ? `${(val / 1_000_000).toFixed(1)}M`
                      : `${(val / 1_000).toFixed(0)}K`}
                  </p>
                </div>
              ))}
            </div>

            {/* Per-facility table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider border-b border-gray-100"
                    style={{ color: '#6B7280' }}>
                    <th className="pb-2 pr-4">Bank</th>
                    <th className="pb-2 pr-4 text-right">Limit</th>
                    <th className="pb-2 pr-4 text-right">Utilised</th>
                    <th className="pb-2 pr-4 text-right">Available</th>
                    <th className="pb-2 pr-4 text-right">Utilisation</th>
                    <th className="pb-2 pr-4 text-right">Forwards</th>
                    <th className="pb-2 pr-4">Next Maturity</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {facilityUtil.facilities
                    .filter(f => {
                      if (facFilterBank && !f.bank_name.toLowerCase().includes(facFilterBank.toLowerCase())) return false
                      if (facFilterStatus && f.status !== facFilterStatus) return false
                      return true
                    })
                    .map(fac => {
                      const barColor = fac.status === 'CRITICAL' ? DANGER
                                     : fac.status === 'WARNING'  ? WARNING
                                     : SUCCESS
                      const fmtEurM = (v) => v >= 1_000_000
                        ? `€${(v / 1_000_000).toFixed(1)}M`
                        : `€${(v / 1_000).toFixed(0)}K`
                      return (
                        <tr key={fac.id}>
                          <td className="py-3 pr-4">
                            <p className="font-semibold text-sm" style={{ color: NAVY }}>{fac.bank_name}</p>
                            {fac.contact_name && <p className="text-xs text-gray-400">{fac.contact_name}</p>}
                          </td>
                          <td className="py-3 pr-4 text-right text-sm">{fmtEurM(fac.facility_limit_eur)}</td>
                          <td className="py-3 pr-4 text-right text-sm" style={{ color: DANGER }}>{fmtEurM(fac.utilised_eur)}</td>
                          <td className="py-3 pr-4 text-right text-sm" style={{ color: SUCCESS }}>{fmtEurM(fac.available_eur)}</td>
                          <td className="py-3 pr-4 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-sm font-bold" style={{ color: barColor }}>
                                {fac.utilisation_pct.toFixed(1)}%
                              </span>
                              <div className="w-20 rounded-full overflow-hidden" style={{ background: '#E5E7EB', height: 4 }}>
                                <div className="h-full rounded-full"
                                  style={{ width: `${Math.min(fac.utilisation_pct, 100)}%`, background: barColor }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right text-sm text-gray-600">{fac.tranche_count}</td>
                          <td className="py-3 pr-4 text-sm text-gray-500">
                            {fac.next_maturity
                              ? new Date(fac.next_maturity).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—'}
                          </td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              fac.status === 'CRITICAL' ? 'bg-red-100 text-red-700'
                            : fac.status === 'WARNING'  ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                            }`}>{fac.status}</span>
                          </td>
                        </tr>
                      )
                    })
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </div>{/* /trading-facilities ref wrapper */}

      {/* Maturity Schedule */}
      <div ref={el => { sectionRefs.current['maturity-schedule'] = el }} className="scroll-mt-32">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3" style={{ background: NAVY }}>
          <Calendar size={15} color={GOLD} />
          <h3 className="font-semibold text-white text-sm">Maturity Schedule</h3>
          <span className="text-xs ml-auto" style={{ color: '#8DA4C4' }}>
            Upcoming executed &amp; confirmed forwards — sorted by value date
          </span>
        </div>

        {maturityLoading ? (
          <div className="p-8 flex justify-center">
            <p className="text-sm text-gray-400">Loading maturity schedule…</p>
          </div>
        ) : !maturity || maturity.summary.total_count === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No upcoming hedge maturities found.
          </div>
        ) : (() => {
          const s   = maturity.summary
          const sym = { EUR: '€', GBP: '£', USD: '$', NOK: 'kr', SEK: 'kr', DKK: 'kr', CHF: 'CHF ', JPY: '¥', AUD: 'A$', CAD: 'C$' }[s.base_currency] ?? s.base_currency + ' '
          const fmtBase = (v) => {
            if (!v) return '—'
            const abs = Math.abs(v)
            if (abs >= 1_000_000) return `${sym}${(abs / 1_000_000).toFixed(1)}M`
            if (abs >= 1_000)     return `${sym}${(abs / 1_000).toFixed(0)}K`
            return `${sym}${abs.toFixed(0)}`
          }
          const daysColor = (d) => d <= 7 ? DANGER : d <= 30 ? WARNING : SUCCESS
          const fmtVDate  = (s) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
          const urgencyBadge = (d) => {
            if (d == null) return null
            if (d <= 30) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">ACTION REQUIRED</span>
            if (d <= 60) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">REVIEW SOON</span>
            if (d <= 90) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">APPROACHING</span>
            return null
          }

          return (
            <>
              {/* Summary strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100 border-b border-gray-100">
                {[
                  { label: 'Total Tranches',  value: s.total_count,    isCount: true },
                  { label: 'Next 30 Days',    value: s.next_30_days,   isCount: false },
                  { label: 'Next 60 Days',    value: s.next_60_days,   isCount: false },
                  { label: 'Next 90 Days',    value: s.next_90_days,   isCount: false },
                ].map((card, i) => (
                  <div key={i} className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{card.label}</p>
                    <p className="text-xl font-bold" style={{ color: NAVY }}>
                      {card.isCount ? card.value : fmtBase(card.value)}
                    </p>
                    {!card.isCount && <p className="text-xs text-gray-400 mt-0.5">maturing</p>}
                  </div>
                ))}
              </div>

              {/* Month groups */}
              <div className="divide-y divide-gray-100">
                {maturity.by_month.map(group => {
                  const expanded = matExpanded[group.month] !== false // default open
                  return (
                    <div key={group.month}>
                      {/* Group header — clickable */}
                      <button
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                        onClick={() => setMatExpanded(prev => ({ ...prev, [group.month]: !expanded }))}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-sm" style={{ color: NAVY }}>{group.label}</span>
                          <span className="text-xs text-gray-400">
                            {group.count} tranche{group.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="font-semibold" style={{ color: NAVY }}>{fmtBase(group.total_base)}</span>
                          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {expanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ background: 'rgba(26,39,68,0.04)' }}>
                                {['Tranche', 'Pair', 'Description', 'Amount', `Notional (${s.base_currency})`, 'Rate', 'Value Date', 'Days', 'Status'].map(h => (
                                  <th key={h} className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {group.tranches.map(t => {
                                const showRollover = t.days_to_maturity != null && t.days_to_maturity <= 60
                                  && t.exposure_end_date && t.value_date
                                  && t.exposure_end_date > t.value_date
                                return (
                                  <React.Fragment key={t.tranche_id}>
                                    <tr className="border-t border-gray-50 hover:bg-gray-50">
                                      <td className="px-4 py-2.5 font-mono text-gray-500">
                                        TRN-{String(t.tranche_id).padStart(5, '0')}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: NAVY }}>
                                          <CurrencyPairFlags pair={t.currency_pair} />
                                          {t.currency_pair}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">
                                        {t.description || t.reference || '—'}
                                      </td>
                                      <td className="px-4 py-2.5 font-mono">
                                        {t.amount_currency} {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(t.amount)}
                                      </td>
                                      <td className="px-4 py-2.5 font-mono">
                                        {fmtBase(t.notional_base)}
                                      </td>
                                      <td className="px-4 py-2.5 font-mono">
                                        {t.rate ? t.rate.toFixed(4) : '—'}
                                      </td>
                                      <td className="px-4 py-2.5 whitespace-nowrap">
                                        {fmtVDate(t.value_date)}
                                      </td>
                                      <td className="px-4 py-2.5 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold"
                                            style={{ color: t.days_to_maturity != null ? daysColor(t.days_to_maturity) : '#9CA3AF' }}>
                                            {t.days_to_maturity != null ? `${t.days_to_maturity}d` : '—'}
                                          </span>
                                          {urgencyBadge(t.days_to_maturity)}
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-green-100 text-green-700'}`}>
                                          {t.status}
                                        </span>
                                      </td>
                                    </tr>
                                    {showRollover && (
                                      <tr className="border-t-0">
                                        <td colSpan={9} className="px-4 pb-2 pt-0">
                                          <p className="text-xs text-amber-700 italic">
                                            Consider rolling this position forward if the underlying exposure continues beyond value date.
                                          </p>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )
        })()}
      </div>
      </div>{/* /maturity-schedule ref wrapper */}

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
