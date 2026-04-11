// Dashboard.jsx — Executive view only.
// No exposure register — that lives in Hedging → Exposure Register.
// A CFO should understand the full portfolio position in 30 seconds.

import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, ShieldCheck, TrendingDown, TrendingUp, RefreshCw, X } from 'lucide-react'
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from '../brand'
import { flagPair, flagCurrency } from '../utils/currency'
import { CurrencyPairFlags, CURRENCY_TO_COUNTRY } from './CurrencyFlag'
import { useCompany } from '../contexts/CompanyContext'
import LoadingAnimation from './LoadingAnimation'

const API_BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

const CHART_COLORS = [GOLD, '#2E86AB', '#27AE60', '#E74C3C', '#8B5CF6', '#EC4899']

// Currency symbol map shared by tooltip components (no backend import needed here)
const CCY_SYM = { EUR: '€', GBP: '£', USD: '$', NOK: 'kr', SEK: 'kr', DKK: 'kr', CHF: 'CHF ', JPY: '¥', AUD: 'A$', CAD: 'C$', NZD: 'NZ$', SGD: 'S$' }

// ── CSS flag helper ──────────────────────────────────────────────────────────
// Emoji Regional Indicator characters decompose to letters in SVG <text>.
// flag-icons uses CSS background-image flags (fi fi-xx class), which render
// correctly in HTML context — including inside SVG <foreignObject>.
function CssFlagSpan({ code }) {
  if (!code) return null
  return (
    <span
      xmlns="http://www.w3.org/1999/xhtml"
      className={`fi fi-${code}`}
      style={{ display: 'inline-block', width: 14, height: 11, borderRadius: 1, flexShrink: 0 }}
    />
  )
}

// ── Bar chart XAxis tick ─────────────────────────────────────────────────────
function FlagPairXTick({ x, y, payload }) {
  if (!payload?.value) return null
  const [from, to] = payload.value.split('/')
  const fc = CURRENCY_TO_COUNTRY[from]
  const tc = CURRENCY_TO_COUNTRY[to]
  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-40} y={2} width={80} height={28}>
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                   gap: 2, fontSize: 10, color: '#6B7280', whiteSpace: 'nowrap' }}>
          {fc && <CssFlagSpan code={fc} />}
          {tc && <CssFlagSpan code={tc} />}
          <span style={{ marginLeft: 2 }}>{payload.value}</span>
        </div>
      </foreignObject>
    </g>
  )
}

// ── Pie chart label ──────────────────────────────────────────────────────────
function PieCurrencyLabel({ x, y, currency, percent }) {
  const pct = Math.round((percent || 0) * 100)
  if (!currency) return null
  const cc = CURRENCY_TO_COUNTRY[currency]
  return (
    <g>
      <foreignObject x={x - 40} y={y - 12} width={80} height={28}>
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                   gap: 3, fontSize: 11, color: '#374151', whiteSpace: 'nowrap' }}>
          {cc && <CssFlagSpan code={cc} />}
          <span>{currency} ({pct}%)</span>
        </div>
      </foreignObject>
    </g>
  )
}

// ── Rate vs Budget tooltip — renders as HTML so emoji always works ────────────
function RateVsBudgetTooltip({ active, payload, baseCurrency }) {
  if (!active || !payload?.length) return null
  const d   = payload[0].payload
  const sym = CCY_SYM[baseCurrency] ?? '€'
  const fmtExp = (n) => {
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `${baseCurrency} ${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${baseCurrency} ${(abs / 1_000).toFixed(0)}K`
    return `${baseCurrency} ${abs.toFixed(0)}`
  }
  const fmtPnl = (n) => {
    const sign = n >= 0 ? '+' : '-'
    const abs  = Math.abs(n)
    if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(0)}K`
    return `${sign}${sym}${abs.toFixed(0)}`
  }
  return (
    <div style={{
      background: 'white', border: '1px solid #E5E7EB',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)', lineHeight: 1.7,
    }}>
      <p style={{ fontWeight: 700, color: NAVY, marginBottom: 2 }}>{flagPair(d.pair)}</p>
      <p style={{ color: d.change >= 0 ? SUCCESS : DANGER }}>
        {d.change >= 0 ? '+' : ''}{d.change.toFixed(2)}% vs budget
      </p>
      {d.totalExposureEur > 0 && (
        <p style={{ color: '#6B7280' }}>{fmtExp(d.totalExposureEur)} exposure</p>
      )}
      {d.combinedPnl != null && (
        <p style={{ color: d.combinedPnl >= 0 ? SUCCESS : DANGER }}>{fmtPnl(d.combinedPnl)} P&L</p>
      )}
    </div>
  )
}

const fmt     = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
const fmtM    = (n) => `${(Math.abs(n) / 1_000_000).toFixed(1)}M`
const fmtSign = (n) => (n >= 0 ? '+' : '') + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

// ── InfoTooltip ──────────────────────────────────────────────────────────────
// Inline ⓘ icon that shows a portal tooltip on hover. Same pattern as
// ExposureRegister's ColHeader tooltip — portal so it's never clipped.

function InfoTooltip({ text }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos]         = useState({ top: 0, left: 0 })
  const ref                   = useRef(null)
  const timer                 = useRef(null)

  function show() {
    clearTimeout(timer.current)
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left + r.width / 2 })
    setVisible(true)
  }
  function hide() { timer.current = setTimeout(() => setVisible(false), 150) }
  function cancelHide() { clearTimeout(timer.current) }

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{ color: GOLD, cursor: 'default', fontSize: 11, userSelect: 'none', marginLeft: 4 }}
      >ⓘ</span>
      {visible && ReactDOM.createPortal(
        <div
          onMouseEnter={cancelHide}
          onMouseLeave={hide}
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            transform: 'translateX(-50%)',
            background: NAVY, color: '#fff',
            borderRadius: 8, padding: '8px 12px',
            fontSize: 12, lineHeight: 1.6,
            maxWidth: 260, whiteSpace: 'normal',
            zIndex: 9999,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  )
}

// ── Portfolio Summary Strip ───────────────────────────────────────────────────

// Currency symbol map for summary strip (frontend-only — no backend import needed)
const CCY_SYMBOLS = { EUR: '€', GBP: '£', USD: '$', NOK: 'kr', SEK: 'kr', DKK: 'kr', CHF: 'CHF ', JPY: '¥', AUD: 'A$', CAD: 'C$', NZD: 'NZ$', SGD: 'S$' }

function PortfolioSummaryStrip({ summary, loading, onNextMaturityClick }) {
  const sym = CCY_SYMBOLS[summary?.base_currency] ?? '€'
  const fmtEur = (v) => {
    if (v == null) return '—'
    const n = Number(v)
    if (isNaN(n)) return '—'
    const sign = n >= 0 ? '+' : '-'
    const abs  = Math.abs(n)
    if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(0)}K`
    return `${sign}${sym}${abs.toFixed(0)}`
  }
  const fmtEurPlain = (v) => {
    if (v == null) return '—'
    const abs = Math.abs(Number(v))
    if (isNaN(abs)) return '—'
    if (abs >= 1_000_000) return `${sym}${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sym}${(abs / 1_000).toFixed(0)}K`
    return `${sym}${abs.toFixed(0)}`
  }
  const pnlColor = (v) => {
    if (v == null) return 'white'
    return Number(v) >= 0 ? '#10B981' : '#EF4444'
  }
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

  const Skeleton = () => (
    <div className="flex-1 min-w-0 animate-pulse" style={{ minWidth: 100 }}>
      <div className="h-2.5 w-16 rounded mb-3" style={{ background: 'rgba(255,255,255,0.15)' }} />
      <div className="h-6 w-24 rounded mb-1.5" style={{ background: 'rgba(255,255,255,0.2)' }} />
      <div className="h-2 w-12 rounded" style={{ background: 'rgba(255,255,255,0.1)' }} />
    </div>
  )

  const nm = summary?.next_maturity

  const cards = loading ? null : [
    { label: 'Total Exposure',   value: fmtEurPlain(summary?.total_exposure_eur), color: 'white',               sub: 'All active exposures'     },
    { label: 'Hedged',           value: fmtEurPlain(summary?.hedged_eur),          color: 'white',               sub: 'Executed + confirmed'     },
    { label: 'Open / Unhedged',  value: fmtEurPlain(summary?.open_eur),            color: 'white',               sub: 'Not yet hedged'           },
    { label: 'Locked P&L',       value: fmtEur(summary?.locked_pnl_eur),           color: pnlColor(summary?.locked_pnl_eur),   sub: 'Crystallised from hedges' },
    { label: 'Floating P&L',     value: fmtEur(summary?.floating_pnl_eur),         color: pnlColor(summary?.floating_pnl_eur), sub: 'Open positions vs spot'   },
    { label: 'Portfolio P&L',    value: fmtEur(summary?.portfolio_pnl_eur),        color: pnlColor(summary?.portfolio_pnl_eur), sub: 'Locked + floating'       },
  ]

  return (
    <div className="rounded-xl flex items-stretch overflow-hidden"
      style={{ background: NAVY, height: 88, minHeight: 88 }}>
      {loading ? (
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

          {/* Next Maturity — clickable to hedging register sorted by value date */}
          <button
            className="flex flex-col justify-center px-5 py-0 text-left hover:bg-white/5 transition-colors"
            style={{ minWidth: 160, maxWidth: 200 }}
            onClick={onNextMaturityClick}
            title="View in Hedging → Exposure Register">
            <p className="uppercase tracking-wider font-semibold"
              style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
              Next Maturity
            </p>
            {nm ? (
              <>
                <p className="font-bold leading-tight" style={{ fontSize: 16, color: 'white' }}>
                  {fmtValueDate(nm.value_date)}
                </p>
                <p className="leading-tight mt-0.5" style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  {nm.pair} · {fmtNotional(nm.notional, nm.currency)}
                </p>
                <p className="leading-tight" style={{ fontSize: 11, color: GOLD }}>
                  {fmtTranchId(nm.tranche_id)}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>—</p>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Market Report Headline ────────────────────────────────────────────────────

function MarketReportCard({ report, navigate }) {
  if (!report) return null

  // Extract first sentence from the report body for the headline preview
  const getHeadline = () => {
    try {
      const content = typeof report.content_json === 'string'
        ? JSON.parse(report.content_json)
        : report.content_json
      const body = content?.body || content?.summary || content?.analysis || ''
      if (typeof body === 'string' && body.length > 0) {
        const firstSentence = body.split(/[.!?]/)[0]?.trim()
        return firstSentence && firstSentence.length > 20 ? firstSentence + '.' : body.slice(0, 140) + '…'
      }
      const title = content?.title || report.title || ''
      return title || null
    } catch {
      return null
    }
  }

  const fmtDate = (s) => {
    if (!s) return ''
    const d = new Date(s)
    if (isNaN(d)) return s
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const headline = getHeadline()
  if (!headline) return null

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm px-5 py-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-xl shrink-0 mt-0.5">📊</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">
            Weekly FX Report — {fmtDate(report.report_date)}
          </p>
          <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">
            {headline}
          </p>
        </div>
      </div>
      <button
        onClick={() => navigate('/reports')}
        className="text-xs font-semibold shrink-0 px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
        style={{ background: 'rgba(26,39,68,0.06)', color: NAVY }}>
        Read full report →
      </button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

function Dashboard() {
  const { selectedCompanyId, getSelectedCompany } = useCompany()
  const navigate = useNavigate()
  const selectedCompany = getSelectedCompany()

  const [exposures,         setExposures]         = useState([])
  const [enrichedExposures, setEnrichedExposures] = useState([])
  const [portfolioStats,    setPortfolioStats]    = useState(null)
  const [loading,           setLoading]           = useState(false)
  const [refreshing,        setRefreshing]        = useState(false)
  const [lastUpdated,       setLastUpdated]       = useState(null)
  const [error,             setError]             = useState(null)
  const [policy,            setPolicy]            = useState(null)
  const [dismissedZones,    setDismissedZones]    = useState({ defensive: false, opportunistic: false })
  const [summary,           setSummary]           = useState(null)
  const [summaryLoading,    setSummaryLoading]    = useState(true)
  const [mcRisk,            setMcRisk]            = useState(null)
  const [facilities,        setFacilities]        = useState(null)
  const [marketReport,      setMarketReport]      = useState(null)

  // Load all data when company changes
  useEffect(() => {
    if (!selectedCompanyId) return
    fetchExposures(selectedCompanyId)
    fetchEnriched(selectedCompanyId)
    fetchPolicy(selectedCompanyId)
    fetchSummary(selectedCompanyId)
    fetchMcRisk(selectedCompanyId)
    fetchFacilities(selectedCompanyId)
    fetchMarketReport(selectedCompanyId)
  }, [selectedCompanyId])

  // Refresh when an execution happens on the Hedging tab
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

  const fetchFacilities = async (cid) => {
    try {
      const res = await fetch(`${API_BASE}/api/facilities/utilisation/${cid}`, { headers: authHeaders() })
      if (res.ok) setFacilities(await res.json())
    } catch (e) { console.error('[facilities] fetch error:', e) }
  }

  const fetchMcRisk = async (cid) => {
    try {
      const res = await fetch(`${API_BASE}/api/margin-call/status/${cid}`, { headers: authHeaders() })
      if (res.ok) setMcRisk(await res.json())
    } catch (e) { console.error('[mc-risk] fetch error:', e) }
  }

  const fetchSummary = async (cid) => {
    setSummaryLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/summary?company_id=${cid}`, { headers: authHeaders() })
      if (res.ok) setSummary(await res.json())
      else console.error(`[dashboard/summary] HTTP ${res.status}`)
    } catch (e) { console.error('[dashboard/summary] fetch error:', e) }
    finally { setSummaryLoading(false) }
  }

  const fetchPolicy = async (cid) => {
    try {
      const r = await fetch(`${API_BASE}/api/policies?company_id=${cid}`, { headers: authHeaders() })
      if (r.ok) {
        const data = await r.json()
        const active = (data.policies || []).find(p => p.is_active)
        if (active) setPolicy(active)
      }
    } catch {}
  }

  const fetchExposures = async (cid) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${API_BASE}/exposures?company_id=${cid}`, { headers: authHeaders() })
      const data = await res.json()
      setExposures(Array.isArray(data) ? data : [])
      setLastUpdated(new Date())
    } catch { setError('Failed to fetch exposures') }
    finally { setLoading(false) }
  }

  const fetchEnriched = async (cid) => {
    try {
      const res = await fetch(`${API_BASE}/api/exposures/enriched?company_id=${cid}`, { headers: authHeaders() })
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

  const fetchMarketReport = async (cid) => {
    try {
      const res = await fetch(`${API_BASE}/api/reports/market/${cid}`, { headers: authHeaders() })
      if (res.ok) setMarketReport(await res.json())
    } catch {}
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

  // ── Derived values ────────────────────────────────────────────────────────
  const activeEnriched = enrichedExposures.filter(e => !e.archived)
  const totalExposure  = portfolioStats?.total_base
    ?? activeEnriched.reduce((s, e) => s + (e.total_amount_eur || 0), 0)
  const totalPnl = activeEnriched.length > 0
    ? activeEnriched.reduce((s, e) => s + (e.combined_pnl || 0), 0)
    : exposures.reduce((s, e) => s + (e.current_pnl_eur || 0), 0)
  const hedgedValue   = exposures.reduce((s, e) => s + (e.hedged_amount || 0), 0)
  const unhedgedValue = exposures.reduce((s, e) => s + (e.unhedged_amount || 0), 0)
  // Requires Attention counters — use enriched data so they match the Hedging tab exactly.
  // Breaches: hard limit violated — status BREACH (max_loss exceeded) or 0% hedged with budget set.
  // Warnings: defensive zone exposures (tab == requires_action but no hard breach).
  const breaches = activeEnriched.filter(e =>
    e.status === 'BREACH' || (e.hedge_pct === 0 && (e.budget_rate || 0) > 0)
  )
  const warnings = activeEnriched.filter(e =>
    e.tab === 'requires_action' && e.current_zone === 'defensive'
  )
  const hedgePct      = totalExposure > 0 ? (hedgedValue / totalExposure) * 100 : 0

  // Zone alert pairs — from enriched endpoint (has live spot + budget)
  const defensivePairs     = [...new Set(enrichedExposures.filter(e => e.current_zone === 'defensive').map(e => e.currency_pair))]
  const opportunisticPairs = [...new Set(enrichedExposures.filter(e => e.current_zone === 'opportunistic').map(e => e.currency_pair))]

  // Currency mix pie — group by from_currency, use EUR notional from enriched endpoint
  const currencyDist = activeEnriched.length > 0
    ? activeEnriched.reduce((acc, e) => {
        const v = e.total_amount_eur || 0
        const x = acc.find(i => i.currency === e.from_currency)
        if (x) x.value += v
        else acc.push({ currency: e.from_currency, value: v })
        return acc
      }, [])
    : exposures.reduce((acc, e) => {
        const v = e.total_amount_eur ?? Math.abs(e.amount)
        const x = acc.find(i => i.currency === e.from_currency)
        if (x) x.value += v
        else acc.push({ currency: e.from_currency, value: v })
        return acc
      }, [])

  // Rate vs Budget bar chart — one bar per unique pair, weighted avg % move
  // Uses enriched exposures (has pct_move_vs_budget + total_amount_eur for weighting)
  const rateChanges = (() => {
    const src = activeEnriched.length > 0 ? activeEnriched : []
    const pairMap = {}
    src.forEach(e => {
      const pair = e.currency_pair || `${e.from_currency}/${e.to_currency}`
      if (!e.budget_rate || !e.current_spot) return
      if (!pairMap[pair]) pairMap[pair] = { totalNotional: 0, weightedMove: 0, combinedPnl: 0 }
      const notional = e.total_amount_eur || 1
      const pct      = e.pct_move_vs_budget ?? ((e.current_spot - e.budget_rate) / e.budget_rate * 100)
      pairMap[pair].totalNotional += notional
      pairMap[pair].weightedMove  += pct * notional
      pairMap[pair].combinedPnl   += e.combined_pnl || 0
    })
    // Fallback to basic exposures if enriched isn't available yet
    if (Object.keys(pairMap).length === 0) {
      exposures.filter(e => e.budget_rate && e.current_rate).forEach(e => {
        const pair = `${e.from_currency}/${e.to_currency}`
        if (!pairMap[pair]) pairMap[pair] = { totalNotional: 0, weightedMove: 0, combinedPnl: 0 }
        pairMap[pair].totalNotional += 1
        pairMap[pair].weightedMove  += (e.current_rate - e.budget_rate) / e.budget_rate * 100
      })
    }
    return Object.entries(pairMap)
      .map(([pair, d]) => ({
        pair,
        label:           flagPair(pair),
        change:          d.totalNotional > 0 ? d.weightedMove / d.totalNotional : 0,
        totalExposureEur: d.totalNotional,
        combinedPnl:     d.combinedPnl,
      }))
      .sort((a, b) => b.change - a.change)
  })()

  // Hedge coverage by pair
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

      {/* 1 ── Portfolio Summary Strip */}
      <PortfolioSummaryStrip
        summary={summary}
        loading={summaryLoading}
        onNextMaturityClick={() => navigate('/hedging', {
          state: { section: 'register', sortBy: 'value_date' }
        })}
      />

      {/* 2 ── Breach banner — one per breaching pair, links to recommendations */}
      {breaches.length > 0 && (
        <div className="rounded-xl px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} color={DANGER} />
            <div>
              <span className="font-bold text-sm" style={{ color: DANGER }}>
                {breaches.length} breach{breaches.length > 1 ? 'es' : ''} require attention
              </span>
              <span className="text-sm text-gray-600 ml-1.5">
                {breaches.map(e => `${e.from_currency}/${e.to_currency}`).join(', ')}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate('/hedging', { state: { section: 'recommendations' } })}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0"
            style={{ background: DANGER, color: 'white' }}>
            Review recommendations →
          </button>
        </div>
      )}

      {/* 3 ── Margin call banner — links to MTM report */}
      {mcRisk && mcRisk.at_risk_count > 0 && (
        <div className="rounded-xl px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.5)' }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} color={DANGER} />
            <div>
              <span className="font-bold text-sm" style={{ color: DANGER }}>
                Margin Call Risk — {mcRisk.at_risk_count} tranche{mcRisk.at_risk_count > 1 ? 's' : ''} at risk
                {' '}(€{(mcRisk.total_exposure_at_risk_eur / 1000).toFixed(0)}K exposure)
              </span>
              <span className="text-sm text-gray-600 ml-1.5">
                MTM loss exceeds {mcRisk.threshold_pct}% threshold.
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate('/reports', { state: { mtmFilter: 'at_risk' } })}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0"
            style={{ background: DANGER, color: 'white' }}>
            Review in MTM Report →
          </button>
        </div>
      )}

      {/* 4 ── Facility utilisation cards — clickable to bank settings */}
      {facilities?.facilities?.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {facilities.facilities.map(fac => {
            const barColor = fac.utilisation_pct > 90 ? '#EF4444'
                           : fac.utilisation_pct >= 70 ? '#F59E0B'
                           : '#10B981'
            const fmtFac = (n) => {
              if (n >= 1_000_000) return `EUR ${(n / 1_000_000).toFixed(1)}M`
              if (n >= 1_000)     return `EUR ${(n / 1_000).toFixed(0)}K`
              return `EUR ${n.toFixed(0)}`
            }
            const fmtDate = (s) => {
              if (!s) return null
              return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            }
            return (
              <button key={fac.id}
                onClick={() => navigate('/settings/bank')}
                className="rounded-xl border p-4 text-left hover:shadow-md transition-shadow"
                style={{ background: 'white', borderColor: '#E5E7EB', minWidth: 200, flex: '1 1 200px', maxWidth: 280 }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold" style={{ color: NAVY }}>{fac.bank_name}</span>
                  <span className="text-sm font-bold" style={{ color: barColor }}>{fac.utilisation_pct.toFixed(0)}%</span>
                </div>
                <div className="rounded-full overflow-hidden mb-2" style={{ background: '#E5E7EB', height: 6 }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(fac.utilisation_pct, 100)}%`, background: barColor }} />
                </div>
                <p className="text-xs text-gray-500">{fmtFac(fac.utilised_eur)} used of {fmtFac(fac.facility_limit_eur)}</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color: barColor }}>{fmtFac(fac.available_eur)} available</p>
                <p className="text-xs text-gray-400 mt-1">
                  {fac.tranche_count} forward{fac.tranche_count !== 1 ? 's' : ''}
                  {fac.next_maturity ? ` · Next: ${fmtDate(fac.next_maturity)}` : ''}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {/* Facility critical banner */}
      {facilities?.facilities?.some(f => f.status === 'CRITICAL') &&
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
            <button
              onClick={() => navigate('/settings/bank')}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0"
              style={{ background: WARNING, color: 'white' }}>
              Review →
            </button>
          </div>
        ))
      }

      {/* 5a ── Defensive zone banners — per pair, links to register filtered */}
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
                {defensivePairs.length === 1 ? 'has' : 'have'} moved adversely vs budget. Defensive hedging recommended.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/hedging', {
                state: { section: 'register', focusPair: defensivePairs[0] }
              })}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: WARNING, color: 'white' }}>
              Review →
            </button>
            <button onClick={() => setDismissedZones(d => ({ ...d, defensive: true }))}>
              <X size={15} color={WARNING} />
            </button>
          </div>
        </div>
      )}

      {/* 5b ── Opportunistic zone banner */}
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
                {opportunisticPairs.length === 1 ? 'is' : 'are'} trading favourably. Consider opportunistic hedging.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/hedging', {
                state: { section: 'register', focusPair: opportunisticPairs[0] }
              })}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: SUCCESS, color: 'white' }}>
              Review →
            </button>
            <button onClick={() => setDismissedZones(d => ({ ...d, opportunistic: true }))}>
              <X size={15} color={SUCCESS} />
            </button>
          </div>
        </div>
      )}

      {/* 6 ── BIRK main panel */}
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
                  style={{
                    width: `${Math.min(portfolioStats?.protection_pct ?? hedgePct, 100)}%`,
                    background: (portfolioStats?.protection_pct ?? hedgePct) >= 60 ? SUCCESS : WARNING,
                  }} />
              </div>
              <p className="text-xs mt-2" style={{ color: '#8DA4C4' }}>
                {portfolioStats
                  ? `${portfolioStats.base_currency} ${fmtM(portfolioStats.hedged_base)} hedged · ${portfolioStats.base_currency} ${fmtM(portfolioStats.open_base)} open`
                  : `${fmt(hedgedValue)} hedged · ${fmt(unhedgedValue)} open`}
              </p>
            </div>

            {/* Requires attention */}
            <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center" style={{ color: '#8DA4C4' }}>
                Requires Attention
                <InfoTooltip text="Exposures that need your action. Click Hedging to review." />
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center" style={{ color: breaches.length > 0 ? DANGER : '#8DA4C4' }}>
                    Breaches
                    <InfoTooltip text="Hard limit violated: hedge coverage is below your policy minimum, or a maximum loss limit has been exceeded." />
                  </span>
                  <span className="text-2xl font-bold" style={{ color: breaches.length > 0 ? DANGER : '#8DA4C4' }}>{breaches.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center" style={{ color: warnings.length > 0 ? WARNING : '#8DA4C4' }}>
                    Warnings
                    <InfoTooltip text="Soft alert: one or more currency pairs have moved into the Defensive zone. Increased hedging is recommended." />
                  </span>
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

      {/* 7 ── Market report headline */}
      <MarketReportCard report={marketReport} navigate={navigate} />

      {/* 8 ── Currency Mix + Rate vs Budget charts */}
      {exposures.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-semibold mb-4" style={{ color: NAVY }}>Currency Mix</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                {/* PieCurrencyLabel is a named module-level component — Recharts renders it
                    as a proper React component, so <foreignObject> correctly embeds HTML
                    and emoji flags display without garbling. */}
                <Pie data={currencyDist} dataKey="value" nameKey="currency" cx="50%" cy="50%"
                  outerRadius={75} label={PieCurrencyLabel} labelLine={true}>
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
                {/* FlagPairXTick is a named module-level component — same reasoning as above */}
                <XAxis dataKey="pair" tick={FlagPairXTick} tickLine={false} height={28} />
                <YAxis style={{ fontSize: '11px' }} />
                {/* RateVsBudgetTooltip renders as HTML (not SVG), so emoji always works */}
                <Tooltip
                  content={(props) => (
                    <RateVsBudgetTooltip
                      {...props}
                      baseCurrency={selectedCompany?.base_currency || 'EUR'}
                    />
                  )}
                />
                {/* filter:none removes any browser default drop shadow on SVG rect elements */}
                <Bar dataKey="change" radius={[4, 4, 0, 0]} style={{ filter: 'none' }}>
                  {rateChanges.map((e, i) => <Cell key={i} fill={e.change >= 0 ? SUCCESS : DANGER} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 9 ── Live Rates + Hedge Coverage by Pair */}
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
                .filter(e => e.current_rate)
                .map(e => [`${e.from_currency}/${e.to_currency}`, e])
              ).values()].map(e => {
                const pair     = `${e.from_currency}/${e.to_currency}`
                const hasBudget = e.budget_rate && e.budget_rate > 0
                const change    = hasBudget ? ((e.current_rate - e.budget_rate) / e.budget_rate) * 100 : null
                const pos       = change !== null && change >= 0
                return (
                  <div key={pair} className="flex items-center justify-between px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-bold" style={{ color: NAVY }}>
                      <CurrencyPairFlags pair={pair} />
                      {pair}
                    </span>
                    <div className="flex items-center gap-5 text-right">
                      <div>
                        <p className="text-xs text-gray-400">Budget</p>
                        <p className="text-xs font-mono" style={{ color: NAVY }}>
                          {hasBudget ? e.budget_rate.toFixed(4) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Spot</p>
                        <p className="text-xs font-mono font-bold" style={{ color: NAVY }}>{e.current_rate.toFixed(4)}</p>
                      </div>
                      <div className="w-16">
                        <p className="text-xs text-gray-400">vs Budget</p>
                        {change !== null
                          ? <p className="text-xs font-bold" style={{ color: pos ? SUCCESS : DANGER }}>
                              {pos ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                            </p>
                          : <p className="text-xs text-gray-400">—</p>
                        }
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

    </div>
  )
}

export default Dashboard
