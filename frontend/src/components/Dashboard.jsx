import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ExposureRegister from './ExposureRegister'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, ShieldCheck, TrendingDown, TrendingUp, RefreshCw, X } from 'lucide-react'
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from '../brand'
import { flagCurrency as ccyLabel, flagPair } from '../utils/currency'
import { CurrencyPairFlags } from './CurrencyFlag'
import { useCompany } from '../contexts/CompanyContext'
import LoadingAnimation from './LoadingAnimation'

const API_BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})


const CHART_COLORS = [GOLD, '#2E86AB', '#27AE60', '#E74C3C', '#8B5CF6', '#EC4899']


const fmt     = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
const fmtM    = (n) => `${(Math.abs(n) / 1_000_000).toFixed(1)}M`
const fmtSign = (n) => (n >= 0 ? '+' : '') + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

// ── Portfolio Summary Strip ───────────────────────────────────────────────────

function PortfolioSummaryStrip({ summary, loading }) {
  // Format a EUR amount compactly: ±€1.2M  or  ±€842K
  const fmtEur = (v) => {
    if (v == null) return '—'
    const n = Number(v)
    if (isNaN(n)) return '—'
    const sign = n >= 0 ? '+' : '-'
    const abs  = Math.abs(n)
    if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sign}€${(abs / 1_000).toFixed(0)}K`
    return `${sign}€${abs.toFixed(0)}`
  }
  const fmtEurPlain = (v) => {
    if (v == null) return '—'
    const abs = Math.abs(Number(v))
    if (isNaN(abs)) return '—'
    if (abs >= 1_000_000) return `€${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `€${(abs / 1_000).toFixed(0)}K`
    return `€${abs.toFixed(0)}`
  }
  const pnlColor = (v) => {
    if (v == null) return 'white'
    return Number(v) >= 0 ? '#10B981' : '#EF4444'
  }

  // Format next maturity notional
  const fmtNotional = (n, ccy) => {
    if (n == null) return '—'
    const abs = Math.abs(Number(n))
    if (abs >= 1_000_000) return `${ccy} ${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${ccy} ${(abs / 1_000).toFixed(0)}K`
    return `${ccy} ${abs.toFixed(0)}`
  }
  const fmtValueDate = (s) => {
    if (!s) return '—'
    const d = new Date(s)
    if (isNaN(d)) return s
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const fmtTranchId = (id) => `TRN-${String(id).padStart(5, '0')}`

  // Skeleton shimmer card
  const Skeleton = () => (
    <div className="flex-1 min-w-0 animate-pulse" style={{ minWidth: 100 }}>
      <div className="h-2.5 w-16 rounded mb-3" style={{ background: 'rgba(255,255,255,0.15)' }} />
      <div className="h-6 w-24 rounded mb-1.5" style={{ background: 'rgba(255,255,255,0.2)' }} />
      <div className="h-2 w-12 rounded" style={{ background: 'rgba(255,255,255,0.1)' }} />
    </div>
  )

  const nm = summary?.next_maturity

  const cards = loading ? null : [
    {
      label: 'Total Exposure',
      value: fmtEurPlain(summary?.total_exposure_eur),
      color: 'white',
      sub:   'All active exposures',
    },
    {
      label: 'Hedged',
      value: fmtEurPlain(summary?.hedged_eur),
      color: 'white',
      sub:   'Executed + confirmed',
    },
    {
      label: 'Open / Unhedged',
      value: fmtEurPlain(summary?.open_eur),
      color: 'white',
      sub:   'Not yet hedged',
    },
    {
      label: 'Locked P&L',
      value: fmtEur(summary?.locked_pnl_eur),
      color: pnlColor(summary?.locked_pnl_eur),
      sub:   'Crystallised from hedges',
    },
    {
      label: 'Floating P&L',
      value: fmtEur(summary?.floating_pnl_eur),
      color: pnlColor(summary?.floating_pnl_eur),
      sub:   'Open positions vs spot',
    },
    {
      label: 'Portfolio P&L',
      value: fmtEur(summary?.portfolio_pnl_eur),
      color: pnlColor(summary?.portfolio_pnl_eur),
      sub:   'Locked + floating',
    },
  ]

  return (
    <div
      className="rounded-xl flex items-stretch overflow-hidden"
      style={{ background: NAVY, height: 88, minHeight: 88 }}
    >
      {loading ? (
        // Skeleton shimmer — 7 equal slots
        <div className="flex w-full">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col justify-center px-5 py-0"
              style={{ borderRight: i < 6 ? '1px solid rgba(255,255,255,0.12)' : 'none' }}>
              <Skeleton />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex w-full">
          {/* KPI cards 1-6 */}
          {cards.map((card, i) => (
            <div key={i} className="flex-1 flex flex-col justify-center px-5 py-0"
              style={{ borderRight: '1px solid rgba(255,255,255,0.12)', minWidth: 0 }}>
              <p className="truncate uppercase tracking-wider font-semibold"
                style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                {card.label}
              </p>
              <p className="truncate font-bold leading-none"
                style={{ fontSize: 20, color: card.color }}>
                {card.value}
              </p>
              <p className="truncate mt-1" style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                {card.sub}
              </p>
            </div>
          ))}

          {/* Next Maturity card — wider, 3-line value */}
          <div className="flex flex-col justify-center px-5 py-0" style={{ minWidth: 160, maxWidth: 200 }}>
            <p className="uppercase tracking-wider font-semibold"
              style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
              Next Maturity
            </p>
            {nm ? (
              <>
                <p className="font-bold leading-tight"
                  style={{ fontSize: 16, color: 'white' }}>
                  {fmtValueDate(nm.value_date)}
                </p>
                <p className="leading-tight mt-0.5"
                  style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  {nm.pair} · {fmtNotional(nm.notional, nm.currency)}
                </p>
                <p className="leading-tight"
                  style={{ fontSize: 11, color: GOLD }}>
                  {fmtTranchId(nm.tranche_id)}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>—</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Dashboard() {
  // Use the shared CompanyContext so the navbar CompanySelector drives which company is shown
  const { selectedCompanyId, getSelectedCompany } = useCompany()
  const navigate = useNavigate()
  const selectedCompany = getSelectedCompany()

  const [exposures,         setExposures]         = useState([])
  const [enrichedExposures, setEnrichedExposures] = useState([])
  const [portfolioStats, setPortfolioStats]       = useState(null)
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
  const [summary,           setSummary]           = useState(null)
  const [summaryLoading,    setSummaryLoading]    = useState(true)
  const [mcRisk,            setMcRisk]            = useState(null)
  const [facilities,        setFacilities]        = useState(null)   // utilisation data per bank

  // When selected company changes — load everything
  useEffect(() => {
    if (!selectedCompanyId) return
    fetchExposures(selectedCompanyId)
    fetchEnriched(selectedCompanyId)
    fetchPolicy(selectedCompanyId)
    fetchSummary(selectedCompanyId)
    fetchMcRisk(selectedCompanyId)
    fetchFacilities(selectedCompanyId)
  }, [selectedCompanyId])

  // Refresh dashboard when an execution happens on the Hedging tab
  useEffect(() => {
    function handlePortfolioUpdated() {
      if (!selectedCompanyId) return
      fetchExposures(selectedCompanyId)
      fetchEnriched(selectedCompanyId)
      fetchSummary(selectedCompanyId)
      fetchMcRisk(selectedCompanyId)
    }
    window.addEventListener('portfolio-updated', handlePortfolioUpdated)
    return () => window.removeEventListener('portfolio-updated', handlePortfolioUpdated)
  }, [selectedCompanyId])

  const fetchFacilities = async (companyId) => {
    try {
      const res = await fetch(`${API_BASE}/api/facilities/utilisation/${companyId}`, { headers: authHeaders() })
      if (res.ok) setFacilities(await res.json())
    } catch (e) { console.error('[facilities] fetch error:', e) }
  }

  const fetchMcRisk = async (companyId) => {
    try {
      const res = await fetch(`${API_BASE}/api/margin-call/status/${companyId}`, { headers: authHeaders() })
      if (res.ok) setMcRisk(await res.json())
    } catch (e) { console.error('[mc-risk] fetch error:', e) }
  }

  const fetchSummary = async (companyId) => {
    setSummaryLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/summary?company_id=${companyId}`, { headers: authHeaders() })
      if (res.ok) {
        setSummary(await res.json())
      } else {
        const body = await res.text().catch(() => '')
        console.error(`[dashboard/summary] HTTP ${res.status}:`, body)
      }
    } catch (e) {
      console.error('[dashboard/summary] fetch error:', e)
    } finally {
      setSummaryLoading(false)
    }
  }

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
        if (Array.isArray(data)) {
          setEnrichedExposures(data)
          setPortfolioStats(null)
        } else {
          setEnrichedExposures(data.items || [])
          setPortfolioStats(data.portfolio || null)
        }
      }
    } catch (e) { console.error('Enriched fetch failed:', e) }
  }

  const refreshRates = async () => {
    if (!selectedCompanyId) return
    setRefreshing(true)
    await Promise.all([
      fetchExposures(selectedCompanyId),
      fetchEnriched(selectedCompanyId),
      fetchSummary(selectedCompanyId),
    ])
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
  // All EUR totals come from the enriched endpoint which runs proper currency conversion
  // (USD pivot cross-rate). Never use raw amounts × cross-rate for EUR aggregation.
  //
  // totalExposure: portfolioStats.total_base is already EUR-converted (preferred).
  //               Fall back to summing total_amount_eur from enriched items if portfolioStats
  //               hasn't arrived yet.
  // totalPnl:     combined_pnl on each enriched item is EUR-converted by the backend
  //               via pnl_factor = from_base_rate / current_spot.
  // currencyDist: uses total_amount_eur per item so pie slices reflect EUR values,
  //               not raw JPY/NOK notionals.
  const activeEnriched = enrichedExposures.filter(e => !e.archived)
  const totalExposure  = portfolioStats?.total_base
    ?? activeEnriched.reduce((s, e) => s + (e.total_amount_eur || 0), 0)
  const totalPnl = activeEnriched.length > 0
    ? activeEnriched.reduce((s, e) => s + (e.combined_pnl || 0), 0)
    : exposures.reduce((s, e) => s + (e.current_pnl_eur || 0), 0)  // EUR-converted fallback (basic endpoint)
  const hedgedValue   = exposures.reduce((s, e) => s + (e.hedged_amount || 0), 0)
  const unhedgedValue = exposures.reduce((s, e) => s + (e.unhedged_amount || 0), 0)
  const breaches      = exposures.filter(e => e.pnl_status === 'BREACH')
  const warnings      = exposures.filter(e => e.pnl_status === 'WARNING')
  const hedgePct      = totalExposure > 0 ? (hedgedValue / totalExposure) * 100 : 0

  // Zone alert pairs — derived from enriched endpoint (has budget_rate + live spot)
  const defensivePairs     = [...new Set(enrichedExposures.filter(e => e.current_zone === 'defensive').map(e => e.currency_pair))]
  const opportunisticPairs = [...new Set(enrichedExposures.filter(e => e.current_zone === 'opportunistic').map(e => e.currency_pair))]

  // Currency mix pie — use EUR-converted notionals so JPY 500M doesn't dominate the chart
  const currencyDist = activeEnriched.length > 0
    ? activeEnriched.reduce((acc, e) => {
        const v = e.total_amount_eur || 0
        const x = acc.find(i => i.currency === e.from_currency)
        if (x) x.value += v
        else acc.push({ currency: e.from_currency, value: v })
        return acc
      }, [])
    : exposures.reduce((acc, e) => {
        const v = e.total_amount_eur ?? Math.abs(e.amount)  // prefer EUR-converted; raw only if unavailable
        const x = acc.find(i => i.currency === e.from_currency)
        if (x) x.value += v
        else acc.push({ currency: e.from_currency, value: v })
        return acc
      }, [])

  // Rate vs Budget — one bar per unique pair, labelled with both flags
  // Deduplicate by pair first so GBP/USD and GBP/NOK each get their own bar
  const rateChanges = [...new Map(
    exposures
      .filter(e => e.budget_rate && e.current_rate)
      .map(e => [`${e.from_currency}/${e.to_currency}`, e])
  ).values()]
    .map(e => ({
      pair:   `${e.from_currency}/${e.to_currency}`,
      label:  flagPair(`${e.from_currency}/${e.to_currency}`),
      change: ((e.current_rate - e.budget_rate) / e.budget_rate) * 100,
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
    <div className="flex items-center justify-center py-24">
      <LoadingAnimation text="Loading your portfolio…" size="large" />
    </div>
  )

  return (
    <div className="space-y-4">

      {/* ── Portfolio Summary Strip ──────────────────────────────────────── */}
      <PortfolioSummaryStrip summary={summary} loading={summaryLoading} />

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

      {/* Margin call risk banner */}
      {mcRisk && mcRisk.at_risk_count > 0 && (
        <div className="rounded-xl px-5 py-4 flex items-center gap-3"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.5)' }}>
          <AlertTriangle size={20} color={DANGER} />
          <div>
            <span className="font-bold text-sm" style={{ color: DANGER }}>
              Margin Call Risk — {mcRisk.at_risk_count} tranche{mcRisk.at_risk_count > 1 ? 's' : ''} at risk
              {' '}(€{(mcRisk.total_exposure_at_risk_eur / 1000).toFixed(0)}K exposure){' '}
            </span>
            <span className="text-sm text-gray-600">
              MTM loss exceeds {mcRisk.threshold_pct}% threshold. Review in MTM Report.
            </span>
          </div>
        </div>
      )}

      {/* Facility utilisation cards — only shown when facilities exist */}
      {facilities && facilities.facilities && facilities.facilities.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-3">
            {facilities.facilities.map(fac => {
              const barColor = fac.utilisation_pct > 90 ? '#EF4444'
                             : fac.utilisation_pct >= 70 ? '#F59E0B'
                             : '#10B981'
              const fmtM = (n) => {
                if (n >= 1_000_000) return `EUR ${(n / 1_000_000).toFixed(1)}M`
                if (n >= 1_000)     return `EUR ${(n / 1_000).toFixed(0)}K`
                return `EUR ${n.toFixed(0)}`
              }
              const fmtDate = (s) => {
                if (!s) return null
                const d = new Date(s)
                return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
              }
              return (
                <div key={fac.id} className="rounded-xl border p-4"
                  style={{ background: 'white', borderColor: '#E5E7EB', minWidth: 200, flex: '1 1 200px', maxWidth: 280 }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{fac.bank_name}</span>
                    <span className="text-sm font-bold" style={{ color: barColor }}>{fac.utilisation_pct.toFixed(0)}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="rounded-full overflow-hidden mb-2" style={{ background: '#E5E7EB', height: 6 }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(fac.utilisation_pct, 100)}%`, background: barColor }} />
                  </div>
                  <p className="text-xs text-gray-500">{fmtM(fac.utilised_eur)} used of {fmtM(fac.facility_limit_eur)}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: barColor }}>{fmtM(fac.available_eur)} available</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {fac.tranche_count} forward{fac.tranche_count !== 1 ? 's' : ''}
                    {fac.next_maturity ? ` · Next: ${fmtDate(fac.next_maturity)}` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Facility critical banner — shown when any facility exceeds 90% */}
      {facilities && facilities.facilities && facilities.facilities.some(f => f.status === 'CRITICAL') && (
        facilities.facilities.filter(f => f.status === 'CRITICAL').map(fac => (
          <div key={fac.id} className="rounded-xl px-5 py-4 flex items-center justify-between gap-3"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} color={WARNING} />
              <span className="text-sm" style={{ color: WARNING }}>
                <span className="font-bold">{fac.bank_name}</span> facility at{' '}
                <span className="font-bold">{fac.utilisation_pct.toFixed(0)}%</span> utilisation —{' '}
                EUR {(fac.available_eur / 1000).toFixed(0)}K remaining headroom
              </span>
            </div>
            {(
              <button
                onClick={() => navigate('/settings/bank')}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0"
                style={{ background: WARNING, color: 'white' }}>
                Review →
              </button>
            )}
          </div>
        ))
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
            <button
              onClick={() => navigate('/hedging')}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: WARNING, color: 'white' }}>
              Review
            </button>
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
            <button
              onClick={() => navigate('/hedging')}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: SUCCESS, color: 'white' }}>
              Review
            </button>
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
                {lastUpdated ? `Rates as of ${lastUpdated.toLocaleTimeString()} · Updates every 5 min` : 'Loading portfolio…'}
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
                <ShieldCheck size={28} color={(portfolioStats?.protection_pct ?? hedgePct) >= 60 ? SUCCESS : WARNING} />
                <span className="text-3xl font-bold text-white">
                  {(portfolioStats?.protection_pct ?? hedgePct).toFixed(0)}%
                </span>
              </div>
              <div className="mt-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)', height: 6 }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(portfolioStats?.protection_pct ?? hedgePct, 100)}%`, background: (portfolioStats?.protection_pct ?? hedgePct) >= 60 ? SUCCESS : WARNING }} />
              </div>
              <p className="text-xs mt-2" style={{ color: '#8DA4C4' }}>
                {portfolioStats
                  ? `${portfolioStats.base_currency} ${fmtM(portfolioStats.hedged_base)} hedged · ${portfolioStats.base_currency} ${fmtM(portfolioStats.open_base)} open`
                  : `${fmt(hedgedValue)} hedged · ${fmt(unhedgedValue)} open`}
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
                  label={(e) => ccyLabel(e.currency)}>
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
                <XAxis dataKey="label" style={{ fontSize: '11px' }} />
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
              <h3 className="text-sm font-semibold text-white">Rates</h3>
              <p className="text-xs" style={{ color: '#8DA4C4' }}>
                {lastUpdated ? `As of ${lastUpdated.toLocaleTimeString()}` : 'Cached · 5 min intervals'}
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
        onHedgeNow={(exp) => navigate('/hedging', { state: { focusExposure: exp } })}
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
