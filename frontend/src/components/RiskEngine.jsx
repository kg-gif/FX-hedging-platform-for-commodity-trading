// RiskEngine.jsx
// Risk Engine tab — Scenario Analysis + Forecasting (live) + Coming Soon modules.

import React, { useState, useRef, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from '../brand'
import { useCompany } from '../contexts/CompanyContext'
import { formatEUR } from '../utils/formatting'
import Simulator from './Simulator'

const API_BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
})

const MODULES = [
  { id: 'scenario',     label: 'Scenario Analysis', live: true  },
  { id: 'forecasting',  label: 'Forecasting',        live: true  },
  { id: 'sensitivity',  label: 'Sensitivity Analysis', icon: '📉', desc: 'See which exposures are most vulnerable to rate moves.' },
  { id: 'cfar',         label: 'Cash Flow-at-Risk',    icon: '💸', desc: 'Model worst-case cash positions under stress scenarios.' },
  { id: 'var',          label: 'VaR',                  icon: '📊', desc: 'Calculate Value-at-Risk across your portfolio for board reporting.' },
  { id: 'revenue',      label: 'Revenue Impact',       icon: '📈', desc: 'Quantify FX effect on revenues and import/export costs.' },
  { id: 'optimisation', label: 'Hedge Optimisation',   icon: '🤖', desc: 'AI-generated hedge strategy recommendations across your full portfolio.' },
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

// ── Data source icon ──────────────────────────────────────────────────────────

const DATA_SOURCE_ICON = {
  manual:     '📋',
  csv_import: '📤',
  erp:        '🔗',
  bank_feed:  '🏦',
  ai:         '🤖',
}

// ── Custom bar chart tooltip ──────────────────────────────────────────────────

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
      <p className="mt-1 opacity-60 text-xs">Click bar to see exposures</p>
    </div>
  )
}

// ── Forecasting section ───────────────────────────────────────────────────────

function ForecastingSection({ companyId }) {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [expandedMonth, setExpandedMonth] = useState(null)  // month key string

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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center mb-5">
        <p className="text-sm text-gray-400">Loading forecast data…</p>
      </div>
    )
  }

  if (!data || !data.timeline) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center mb-5">
        <p className="text-sm text-gray-400">No forecasting data available.</p>
      </div>
    )
  }

  const { summary, timeline } = data
  const ccy = summary.base_currency || 'EUR'

  // Summary strip cards
  const summaryCards = [
    { label: 'Next 30 days',   value: summary.next_30_days_eur,   sub: 'open exposure' },
    { label: 'Next 90 days',   value: summary.next_90_days_eur,   sub: 'open exposure' },
    { label: 'Next 12 months', value: summary.next_12_months_eur, sub: 'open exposure' },
    { label: 'Avg Coverage',   value: null, pct: summary.avg_hedge_coverage, sub: 'hedged' },
  ]

  // Chart data — only months with a date (exclude "no-date" bucket)
  const chartData = timeline
    .filter(m => m.month !== 'no-date')
    .map(m => ({
      label:      m.label,
      month:      m.month,
      hedged_eur: m.total_hedged_eur,
      open_eur:   m.total_open_eur,
    }))

  function toggleMonth(mk) {
    setExpandedMonth(prev => prev === mk ? null : mk)
  }

  return (
    <div className="space-y-4 mb-5">
      {/* Section header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3" style={{ background: NAVY }}>
          <h3 className="font-semibold text-white text-sm">Exposure Forecasting</h3>
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
                  <p className="text-2xl font-bold" style={{ color: NAVY }}>
                    {ccy} {formatEUR(c.value)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Stacked bar chart */}
        {chartData.length > 0 ? (
          <div className="px-5 pb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-2">
              Exposure timeline — click a bar to expand
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barCategoryGap="30%"
                onClick={e => { if (e?.activePayload) toggleMonth(e.activePayload[0]?.payload?.month) }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                <YAxis
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
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
        ) : (
          <div className="px-5 pb-5 pt-2">
            <p className="text-sm text-gray-400 text-center py-8">
              No exposures with maturity dates — add end dates to see the timeline.
            </p>
          </div>
        )}
      </div>

      {/* Expandable month detail tables */}
      {timeline.filter(m => m.month !== 'no-date').map(m => (
        <div key={m.month} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Month header — click to expand */}
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
      ))}

      {/* No-date bucket — shown collapsed at end if any exposures lack maturity dates */}
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
                <span className="text-xs text-gray-400">{m.exposures.length} exposure{m.exposures.length !== 1 ? 's' : ''}</span>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function RiskEngine() {
  const { selectedCompanyId } = useCompany()
  const companyId = selectedCompanyId || 1

  const [active, setActive] = useState('scenario')
  const sectionRefs = useRef({})

  function scrollTo(id) {
    setActive(id)
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="rounded-xl p-6 mb-4" style={{ background: NAVY }}>
        <h2 className="text-xl font-bold text-white">Risk Engine</h2>
        <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>
          Scenario modelling, forecasting, sensitivity analysis, and AI-driven hedge optimisation
        </p>
      </div>

      {/* Jump nav — pill bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-5 flex flex-wrap gap-2 sticky top-[73px] z-30">
        {MODULES.map(m => {
          const isActive = active === m.id
          return (
            <button
              key={m.id}
              onClick={() => scrollTo(m.id)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all border"
              style={isActive
                ? { background: GOLD,    color: NAVY,      borderColor: GOLD      }
                : { background: 'white', color: '#6B7280', borderColor: '#E5E7EB' }
              }
            >
              {m.label}
              {!m.live && (
                <span className="ml-1.5 text-xs font-normal opacity-70">· soon</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Sections */}
      {MODULES.map(m => (
        <div
          key={m.id}
          ref={el => { sectionRefs.current[m.id] = el }}
          className="scroll-mt-32"
        >
          {m.id === 'scenario' ? (
            <Simulator />
          ) : m.id === 'forecasting' ? (
            <ForecastingSection companyId={companyId} />
          ) : (
            // Coming soon
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-5">
              <div className="px-5 py-3 flex items-center gap-3" style={{ background: NAVY }}>
                <h3 className="font-semibold text-white text-sm">{m.label}</h3>
              </div>
              <div className="flex items-center justify-between py-5 px-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: 'rgba(26,39,68,0.06)' }}>
                    {m.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>{m.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
                  </div>
                </div>
                <span className="text-xs px-3 py-1.5 rounded-full font-semibold shrink-0 ml-6"
                  style={{ background: 'rgba(201,168,108,0.12)', color: GOLD }}>
                  Coming soon
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
