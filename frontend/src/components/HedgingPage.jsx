// HedgingPage.jsx
// Hedging tab — jump nav for Hedge Recommendations, Exposure Register, and Exposure Forecast.
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
import HedgingRecommendations from './HedgingRecommendations'
import ExposureRegister from './ExposureRegister'
import JumpNav from './JumpNav'
import ScrollToTop from './ScrollToTop'

const API_BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
})

const SECTIONS = [
  { id: 'recommendations', label: 'Hedge Recommendations' },
  { id: 'register',        label: 'Exposure Register'     },
  { id: 'forecast',        label: 'Exposure Forecast'     },
]

// ── Confidence badge ──────────────────────────────────────────────────────────

const CONFIDENCE_STYLE = {
  COMMITTED: { bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
  PROBABLE:  { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
  ESTIMATED: { bg: 'rgba(156,163,175,0.12)', color: '#9CA3AF' },
}

function ConfidenceBadge({ value }) {
  const s = CONFIDENCE_STYLE[value] || CONFIDENCE_STYLE.COMMITTED
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}>
      {value}
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
      {/* Section header + summary strip */}
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

        {/* Stacked bar chart — always 12 months */}
        <div className="px-5 pb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-2">
            12-month exposure timeline — click a bar to expand
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="30%"
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

      {/* Expandable month detail tables — only months with actual data */}
      {chartData.filter(cd => (cd.hedged_eur + cd.open_eur) > 0).map(cd => {
        const m = timelineMap[cd.month]
        if (!m) return null
        return (
          <div key={m.month} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              onClick={() => toggleMonth(m.month)}
            >
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm" style={{ color: NAVY }}>{m.label}</span>
                <span className="text-xs text-gray-400">
                  {m.exposures.length} exposure{m.exposures.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span style={{ color: SUCCESS }}>Hedged {ccy} {formatEUR(m.total_hedged_eur)}</span>
                <span style={{ color: WARNING }}>Open {ccy} {formatEUR(m.total_open_eur)}</span>
                <span className="text-gray-400">{expandedMonth === m.month ? '▲' : '▼'}</span>
              </div>
            </button>

            {expandedMonth === m.month && (
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
            )}
          </div>
        )
      })}

      {/* No-date bucket */}
      {timeline.find(m => m.month === 'no-date') && (() => {
        const m = timeline.find(x => x.month === 'no-date')
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden opacity-70">
            <button
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50"
              onClick={() => toggleMonth('no-date')}
            >
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm text-gray-400">No maturity date</span>
                <span className="text-xs text-gray-400">
                  {m.exposures.length} exposure{m.exposures.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="text-gray-400 text-xs">{expandedMonth === 'no-date' ? '▲' : '▼'}</span>
            </button>
            {expandedMonth === 'no-date' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'rgba(26,39,68,0.04)' }}>
                      {['Pair', 'Description', 'Amount', 'Hedge %', 'Confidence', 'Source'].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.exposures.map(e => (
                      <tr key={e.id} className="border-t border-gray-50">
                        <td className="px-4 py-2.5 font-semibold" style={{ color: NAVY }}>{e.pair}</td>
                        <td className="px-4 py-2.5 text-gray-600">{e.description || e.reference || '—'}</td>
                        <td className="px-4 py-2.5 font-mono">{ccy} {formatEUR(e.amount_eur)}</td>
                        <td className="px-4 py-2.5">{e.hedge_pct.toFixed(0)}%</td>
                        <td className="px-4 py-2.5"><ConfidenceBadge value={e.confidence} /></td>
                        <td className="px-4 py-2.5">{DATA_SOURCE_ICON[e.data_source] || '📋'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}
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

  const [active, setActive] = useState('recommendations')
  const sectionRefs = useRef({})

  function scrollTo(id) {
    setActive(id)
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // When arriving at /hedging/register scroll to the register section on mount
  useEffect(() => {
    if (location.pathname === '/hedging/register') {
      scrollTo('register')
    }
  }, [location.pathname])

  // After focusExposure is consumed, clear router state so a refresh doesn't re-trigger it
  function handleFocusConsumed() {
    navigate('/hedging', { replace: true, state: {} })
  }

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="rounded-xl p-6 mb-4" style={{ background: NAVY }}>
        <h2 className="text-xl font-bold text-white">Hedging</h2>
        <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>
          Recommendations, execution, your full exposure register, and upcoming pipeline
        </p>
      </div>

      {/* Jump nav */}
      <div className="mb-5">
        <JumpNav sections={SECTIONS} active={active} onNavigate={scrollTo} variant="tab" />
      </div>

      <ScrollToTop />

      {/* Hedge Recommendations section */}
      <div
        ref={el => { sectionRefs.current['recommendations'] = el }}
        className="scroll-mt-32"
      >
        <HedgingRecommendations
          focusExposure={focusExposure}
          onFocusConsumed={handleFocusConsumed}
        />
      </div>

      {/* Exposure Register section */}
      <div
        ref={el => { sectionRefs.current['register'] = el }}
        className="scroll-mt-32 mt-6"
      >
        <ExposureRegister
          companyId={companyId}
          onHedgeNow={(exp) => {
            navigate('/hedging', { state: { focusExposure: exp } })
            scrollTo('recommendations')
          }}
        />
      </div>

      {/* Exposure Forecast section */}
      <div
        ref={el => { sectionRefs.current['forecast'] = el }}
        className="scroll-mt-32 mt-6"
      >
        <ForecastingSection companyId={companyId} />
      </div>
    </div>
  )
}
