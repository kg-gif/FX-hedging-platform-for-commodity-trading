// HedgingPage.jsx
// Hedging tab — 6-tab lifecycle view: Requires Action / In Progress / Hedged /
// Awaiting Settlement / Settled / Forecast
// P&L strip sits above the tabs; Hedge Recommendations shown inside action tabs.
// focusExposure is passed via router location state (navigate('/hedging', { state: { focusExposure } }))

import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { useCompany } from '../contexts/CompanyContext'
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from '../brand'
import { formatEUR } from '../utils/formatting'
import { flagCurrency, CURRENCY_FLAGS } from '../utils/currency'
import { CONFIDENCE_LABELS, CONFIDENCE_STYLE } from '../utils/constants'
import HedgingRecommendations from './HedgingRecommendations'
import ExposureRegister from './ExposureRegister'
import ScrollToTop from './ScrollToTop'

const API_BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
})

// ── Page-level tab definitions (mirrors ExposureRegister TABS + Forecast) ────
const PAGE_TABS = [
  { id: 'requires_action',     label: 'Requires Action',     emoji: '⚠️', badgeColor: DANGER  },
  { id: 'in_progress',         label: 'In Progress',         emoji: '🔄', badgeColor: WARNING },
  { id: 'hedged',              label: 'Hedged',              emoji: '✅', badgeColor: SUCCESS },
  { id: 'awaiting_settlement', label: 'Awaiting Settlement', emoji: '🕐', badgeColor: WARNING },
  { id: 'settled',             label: 'Settled',             emoji: '📁', badgeColor: null    },
  { id: 'forecast',            label: 'Forecast',            emoji: '📊', badgeColor: null    },
]

// Tabs that include Hedge Recommendations above the register table
const RECS_TABS = new Set(['requires_action', 'in_progress'])

// ── P&L formatters ────────────────────────────────────────────────────────────

const fmtPnl = (n) => {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : '-'
  return `${sign}€${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
const pnlColor = (n) => n == null ? '#9CA3AF' : n >= 0 ? SUCCESS : DANGER

// ── Confidence badge ──────────────────────────────────────────────────────────
// CONFIDENCE_LABELS and CONFIDENCE_STYLE imported from constants.js.
// DB value (e.g. COMMITTED) → display label (e.g. CONTRACTED).

function ConfidenceBadge({ value }) {
  const s = CONFIDENCE_STYLE[value] || CONFIDENCE_STYLE.COMMITTED
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}>
      {CONFIDENCE_LABELS[value] || value}
    </span>
  )
}

const DATA_SOURCE_ICON = {
  manual:     '📋',
  csv_import: '📤',
  erp:        '🔗',
  bank_feed:  '🏦',
  ai:         '🤖',
}

// ── Forecast tooltip ──────────────────────────────────────────────────────────

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const hedged = payload.find(p => p.dataKey === 'hedged_eur')?.value || 0
  const open   = payload.find(p => p.dataKey === 'open_eur')?.value || 0
  return (
    <div style={{
      background: NAVY, color: '#fff', borderRadius: 8,
      padding: '10px 14px', fontSize: 12, minWidth: 180,
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    }}>
      <p className="font-bold mb-1">{label}</p>
      <p style={{ color: SUCCESS }}>Hedged: {formatEUR(hedged)}</p>
      <p style={{ color: WARNING }}>Open:   {formatEUR(open)}</p>
      {(hedged + open) === 0
        ? <p className="mt-1 opacity-60 text-xs">No maturities this month</p>
        : <p className="mt-1 opacity-60 text-xs">Click bar to see exposures</p>
      }
    </div>
  )
}

// ── Generate 12-month skeleton from today ─────────────────────────────────────
// Returns array of { month: '2026-05', label: 'May 2026', hedged_eur: 0, open_eur: 0 }
// so the chart always shows a full 12-month window.

function build12MonthSkeleton() {
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const today = new Date()
  const months = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    const yr = d.getFullYear()
    const mo = d.getMonth() + 1
    months.push({
      month:      `${yr}-${String(mo).padStart(2,'0')}`,
      label:      `${MONTH_ABBR[mo - 1]} ${yr}`,
      hedged_eur: 0,
      open_eur:   0,
    })
  }
  return months
}

// ── Forecasting Section ───────────────────────────────────────────────────────

function ForecastingSection({ companyId }) {
  const [data,          setData]          = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [expandedMonth, setExpandedMonth] = useState(null)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    fetch(`${API_BASE}/api/forecasting/timeline/${companyId}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [companyId])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <p className="text-sm text-gray-400">Loading forecast data…</p>
      </div>
    )
  }

  if (!data || !data.timeline) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <p className="text-sm text-gray-400">No forecasting data available.</p>
      </div>
    )
  }

  const { summary, timeline } = data
  const ccy = summary.base_currency || 'EUR'

  // Summary strip — context-aware subtitles
  const summaryCards = [
    {
      label: 'Next 30 days',
      value: summary.next_30_days_eur,
      sub: summary.next_30_days_eur > 0 ? 'open exposure maturing' : 'No maturities in this period',
    },
    {
      label: 'Next 90 days',
      value: summary.next_90_days_eur,
      sub: summary.next_90_days_eur > 0 ? 'open exposure maturing' : 'No maturities in this period',
    },
    {
      label: 'Next 12 months',
      value: summary.next_12_months_eur,
      sub: summary.next_12_months_eur > 0 ? 'open exposure maturing' : 'No maturities in this period',
    },
    {
      label: 'Avg Coverage',
      pct: summary.avg_hedge_coverage,
      sub: 'of portfolio hedged',
    },
  ]

  // Build chart: 12-month skeleton merged with actual data
  const skeleton = build12MonthSkeleton()
  const dataMap  = {}
  timeline
    .filter(m => m.month !== 'no-date')
    .forEach(m => {
      dataMap[m.month] = { hedged_eur: m.total_hedged_eur, open_eur: m.total_open_eur }
    })
  const chartData = skeleton.map(s => ({
    ...s,
    ...(dataMap[s.month] || {}),
  }))

  // Currency breakdown — group all exposures by from_currency
  const allExposures = timeline
    .filter(m => m.month !== 'no-date')
    .flatMap(m => m.exposures)
  const ccyMap = {}
  allExposures.forEach(e => {
    const ccy2 = e.pair.split('/')[0]
    if (!ccyMap[ccy2]) ccyMap[ccy2] = { ccy: ccy2, amount_eur: 0, hedged_eur: 0, open_eur: 0, count: 0 }
    ccyMap[ccy2].amount_eur += e.amount_eur
    ccyMap[ccy2].hedged_eur += e.hedged_eur
    ccyMap[ccy2].open_eur   += e.open_eur
    ccyMap[ccy2].count      += 1
  })
  const ccyBreakdown = Object.values(ccyMap).sort((a, b) => b.amount_eur - a.amount_eur)

  function toggleMonth(mk) {
    setExpandedMonth(prev => prev === mk ? null : mk)
  }

  // Map month key → full timeline entry (for expandable rows)
  const timelineMap = {}
  timeline.filter(m => m.month !== 'no-date').forEach(m => { timelineMap[m.month] = m })

  return (
    <div className="space-y-4">
      {/* Single card: header · summary · chart · inline drilldown · currency breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3" style={{ background: NAVY }}>
          <h3 className="font-semibold text-white text-sm">Exposure Forecast</h3>
          <p className="text-xs mt-0.5" style={{ color: '#8DA4C4' }}>
            Maturity timeline · hedged vs open · confidence levels
          </p>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100">
          {summaryCards.map((c, i) => (
            <div key={i} className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{c.label}</p>
              {c.pct !== undefined ? (
                <>
                  <p className="text-2xl font-bold" style={{ color: c.pct >= 60 ? SUCCESS : WARNING }}>
                    {c.pct.toFixed(0)}%
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold" style={{ color: c.value > 0 ? NAVY : '#9CA3AF' }}>
                    {c.value > 0 ? `${ccy} ${formatEUR(c.value)}` : '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Stacked bar chart — always 12 months, click bar to drill down */}
        <div className="px-5 pb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-2">
            12-month exposure timeline — click a bar to expand
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="30%"
              style={{ cursor: 'pointer' }}
              onClick={e => {
                if (e?.activePayload) {
                  const mk = e.activePayload[0]?.payload?.month
                  if (timelineMap[mk]) toggleMonth(mk)
                }
              }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <YAxis
                tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}K` : v}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                width={50}
              />
              <RechartsTooltip content={<ForecastTooltip />} />
              <Legend
                iconType="rect" iconSize={10}
                formatter={v => v === 'hedged_eur' ? 'Hedged' : 'Open'}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="hedged_eur" stackId="a" fill={SUCCESS} radius={[0,0,0,0]} />
              <Bar dataKey="open_eur"   stackId="a" fill={WARNING} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Drilldown panel — inline below chart, shown when a bar is clicked */}
        {expandedMonth && timelineMap[expandedMonth] && (() => {
          const m = timelineMap[expandedMonth]
          return (
            <div className="mx-5 mb-5 rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                style={{ background: 'rgba(26,39,68,0.04)' }}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-sm" style={{ color: NAVY }}>{m.label}</span>
                  <span className="text-xs text-gray-400">
                    {m.exposures.length} exposure{m.exposures.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: SUCCESS }}>
                    Hedged {ccy} {formatEUR(m.total_hedged_eur)}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: WARNING }}>
                    Open {ccy} {formatEUR(m.total_open_eur)}
                  </span>
                </div>
                <button
                  onClick={() => setExpandedMonth(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                  ▲ close
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'rgba(26,39,68,0.04)' }}>
                      {['Pair', 'Description', 'Amount', 'Hedge %', 'Confidence', 'Source', 'Maturity'].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.exposures.map(e => (
                      <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-semibold" style={{ color: NAVY }}>{e.pair}</td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">
                          {e.description || e.reference || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono">{ccy} {formatEUR(e.amount_eur)}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold"
                            style={{ color: e.hedge_pct >= 60 ? SUCCESS : e.hedge_pct >= 20 ? WARNING : DANGER }}>
                            {e.hedge_pct.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5"><ConfidenceBadge value={e.confidence} /></td>
                        <td className="px-4 py-2.5">
                          <span title={`Data source: ${e.data_source}`}>
                            {DATA_SOURCE_ICON[e.data_source] || '📋'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{e.maturity_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* Currency breakdown */}
        {ccyBreakdown.length > 0 && (
          <div className="px-5 pb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Currency breakdown — next 12 months
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'rgba(26,39,68,0.04)' }}>
                    {['Currency', 'Total Exposure', 'Hedged', 'Open', 'Hedge %', 'Maturities'].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ccyBreakdown.map(row => {
                    const pct = row.amount_eur > 0 ? (row.hedged_eur / row.amount_eur * 100) : 0
                    return (
                      <tr key={row.ccy} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-semibold" style={{ color: NAVY }}>
                          {flagCurrency(row.ccy)}
                        </td>
                        <td className="px-4 py-2.5 font-mono">{ccy} {formatEUR(row.amount_eur)}</td>
                        <td className="px-4 py-2.5 font-mono" style={{ color: SUCCESS }}>
                          {ccy} {formatEUR(row.hedged_eur)}
                        </td>
                        <td className="px-4 py-2.5 font-mono" style={{ color: row.open_eur > 0 ? WARNING : '#9CA3AF' }}>
                          {row.open_eur > 0 ? `${ccy} ${formatEUR(row.open_eur)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold"
                            style={{ color: pct >= 60 ? SUCCESS : pct >= 20 ? WARNING : DANGER }}>
                            {pct.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {row.count} {row.count === 1 ? 'tranche' : 'tranches'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HedgingPage() {
  const { selectedCompanyId } = useCompany()
  const companyId = selectedCompanyId
  const location  = useLocation()
  const navigate  = useNavigate()

  // focusExposure arrives via router state from Dashboard "Hedge Now" button
  const focusExposure = location.state?.focusExposure || null

  const storageKey = `hedging_tab_${companyId}`
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem(storageKey) || 'forecast'
  )
  // Tab counts + P&L totals — populated by ExposureRegister's onTabDataLoaded callback
  const [tabCounts, setTabCounts]         = useState({})
  const [totalLockedPnl,   setLockedPnl]  = useState(null)
  const [totalFloatingPnl, setFloatPnl]   = useState(null)
  const [totalCombinedPnl, setCombinedPnl]= useState(null)

  function switchTab(tabId) {
    setActiveTab(tabId)
    localStorage.setItem(storageKey, tabId)
  }

  function handleTabDataLoaded(tabData) {
    // Extract counts for badge display
    const counts = {}
    PAGE_TABS.forEach(t => { counts[t.id] = tabData[t.id]?.count || 0 })
    setTabCounts(counts)
    // Compute portfolio P&L from active lifecycle tabs
    const activeTabIds = ['requires_action', 'in_progress', 'hedged']
    const allActive = activeTabIds.flatMap(t => tabData[t]?.exposures || [])
    setLockedPnl  (allActive.reduce((s, e) => s + (e.locked_pnl   || 0), 0))
    setFloatPnl   (allActive.reduce((s, e) => s + (e.floating_pnl || 0), 0))
    setCombinedPnl(allActive.reduce((s, e) => s + (e.combined_pnl || 0), 0))
  }

  // When Dashboard sends user here to hedge a specific exposure, switch to requires_action tab
  useEffect(() => {
    if (focusExposure) switchTab('requires_action')
  }, [focusExposure?.id])

  function handleFocusConsumed() {
    navigate('/hedging', { replace: true, state: {} })
  }

  const isLifecycleTab = activeTab !== 'forecast'

  return (
    <div className="space-y-4">
      <ScrollToTop />

      {/* Portfolio P&L strip — always visible above tabs */}
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

      {/* 6-tab nav */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-stretch border-b border-gray-100" style={{ background: '#F8FAFC' }}>
          {PAGE_TABS.map(tab => {
            const count    = tabCounts[tab.id] || 0
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className="flex-1 flex flex-col items-center py-3 px-2 text-xs font-semibold transition-all relative"
                style={{
                  background:   isActive ? 'white' : 'transparent',
                  color:        isActive ? NAVY : '#9CA3AF',
                  borderBottom: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
                }}
              >
                <span className="text-base mb-0.5">{tab.emoji}</span>
                <span className="whitespace-nowrap">{tab.label}</span>
                {count > 0 && tab.id !== 'forecast' && (
                  <span
                    className="absolute top-2 right-2 font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      fontSize:   10,
                      background: tab.badgeColor ? `${tab.badgeColor}22` : '#E5E7EB',
                      color:      tab.badgeColor || '#6B7280',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="p-0">
          {activeTab === 'forecast' ? (
            // ── Forecast tab ──────────────────────────────────────────────────
            <div className="p-4">
              <ForecastingSection companyId={companyId} />
            </div>
          ) : (
            // ── Lifecycle tabs (Requires Action / In Progress / Hedged / …) ──
            <div className="space-y-4 p-4">
              {/* Hedge Recommendations — only in action-oriented tabs */}
              {RECS_TABS.has(activeTab) && (
                <HedgingRecommendations
                  focusExposure={focusExposure}
                  onFocusConsumed={handleFocusConsumed}
                />
              )}

              {/* Exposure Register — tab driven externally, chrome suppressed */}
              <ExposureRegister
                companyId={companyId}
                externalTab={activeTab}
                hideChrome={true}
                onTabDataLoaded={handleTabDataLoaded}
                onHedgeNow={(exp) => {
                  navigate('/hedging', { state: { focusExposure: exp } })
                  switchTab('requires_action')
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
