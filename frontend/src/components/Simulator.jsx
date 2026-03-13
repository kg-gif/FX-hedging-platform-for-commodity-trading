/**
 * Simulator.jsx
 *
 * FX Scenario Simulator — shows P&L impact across 7 rate shock scenarios.
 * Compares hedged vs unhedged positions for the company's full exposure portfolio.
 *
 * API: GET /api/simulator?company_id={id}
 * Response: { base_currency, current_spot_rates, scenarios[], current_scenario }
 */

import React, { useState, useEffect, useRef } from 'react'
import { useCompany } from '../contexts/CompanyContext'
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from '../brand'

const API_BASE = 'https://birk-fx-api.onrender.com'

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

// ── Tooltip component ─────────────────────────────────────────────────────────
// Uses position:fixed so the tooltip escapes any overflow:hidden/auto parent
// (tables with overflow-x:auto would clip a position:absolute tooltip).
// onMouseEnter reads the trigger's getBoundingClientRect() to anchor the box.
function Tip({ text }) {
  const [pos, setPos] = useState(null)
  const triggerRef    = useRef(null)

  function show() {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 8 })
  }

  return (
    <span style={{ display: 'inline-block', marginLeft: 4, verticalAlign: 'middle' }}>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          borderRadius: '50%',
          fontSize: 10,
          fontWeight: 700,
          cursor: 'default',
          color: '#9CA3AF',
          border: '1px solid #D1D5DB',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        i
      </span>
      {pos && (
        <span style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          transform: 'translate(-50%, -100%)',
          background: NAVY,
          color: 'white',
          fontSize: 11,
          lineHeight: 1.5,
          padding: '7px 10px',
          borderRadius: 6,
          maxWidth: 280,
          width: 'max-content',
          whiteSpace: 'normal',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          pointerEvents: 'none',
        }}>
          {text}
          <span style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            border: '5px solid transparent',
            borderTopColor: NAVY,
          }} />
        </span>
      )}
    </span>
  )
}

// ── Helper: label + tooltip ───────────────────────────────────────────────────
function TipLabel({ children, tip }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {children}<Tip text={tip} />
    </span>
  )
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtPnl(n, ccy) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : '+'
  if (abs >= 1_000_000) return `${sign}${ccy} ${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}${ccy} ${(abs / 1_000).toFixed(1)}K`
  return `${sign}${ccy} ${abs.toFixed(0)}`
}

function fmtRate(n) {
  if (n == null) return '—'
  return n.toFixed(4)
}

function pnlColor(n) {
  if (n == null) return '#6B7280'
  if (n > 0) return SUCCESS
  if (n < 0) return DANGER
  return '#6B7280'
}

// ── PnlBar ────────────────────────────────────────────────────────────────────
// Horizontal bar showing P&L magnitude, centred at zero
function PnlBar({ value, maxAbs }) {
  if (!maxAbs || value == null) return null
  const pct = Math.min(Math.abs(value) / maxAbs * 50, 50)
  const isPos = value >= 0
  return (
    <div className="flex items-center h-4 w-24 mx-auto">
      <div className="flex-1 flex justify-end">
        {!isPos && (
          <div style={{ width: `${pct * 2}%`, background: DANGER, height: 8, borderRadius: '4px 0 0 4px', minWidth: 2 }} />
        )}
      </div>
      <div style={{ width: 1, height: 12, background: '#D1D5DB', flexShrink: 0 }} />
      <div className="flex-1">
        {isPos && value !== 0 && (
          <div style={{ width: `${pct * 2}%`, background: SUCCESS, height: 8, borderRadius: '0 4px 4px 0', minWidth: 2 }} />
        )}
      </div>
    </div>
  )
}

// ── SummaryCard ───────────────────────────────────────────────────────────────
function SummaryCard({ label, tooltip, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
        <TipLabel tip={tooltip}>{label}</TipLabel>
      </p>
      <p className="text-2xl font-bold" style={{ color: accent || NAVY }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Tooltip copy ──────────────────────────────────────────────────────────────
const TIPS = {
  hedgedPnl:
    'Your total portfolio P&L today vs budget rates, including locked gains from executed hedges and floating P&L on open positions. Negative means rates have moved against your budget.',
  protectionValue:
    'The net impact of your current hedges vs being unhedged at today\'s rates. Positive means your hedges are currently working in your favour.',
  protectionCoverage:
    'What percentage of your downside is protected by current hedges. Higher is better in adverse scenarios.',
  liveRates:
    'Current mid-market rates fetched at page load. Used to calculate floating P&L on unhedged positions.',
  scenario:
    'A uniform % move applied to all spot rates simultaneously from today\'s levels.',
  unhedgedPnl:
    'What your total P&L would be if you had zero hedges in place. Shows your raw currency exposure.',
  hedgedPnlCol:
    'Your actual P&L with current hedges in place. Locked P&L from executed forwards is fixed regardless of scenario.',
  protection:
    'The value your hedges add or cost in this scenario. Positive = hedges reduced your loss or protected gains. Negative = rates moved in your favour and your locked hedges captured less upside than an unhedged position would have. This is the normal trade-off of hedging.',
  coveragePct:
    'How much of the scenario impact is absorbed by your hedges.',
  hedgePct:
    'Percentage of this exposure covered by executed or confirmed hedges.',
  pairUnhedgedPnl:
    'P&L on this pair if fully unhedged at the scenario rate.',
  pairHedgedPnl:
    'Actual P&L combining locked hedge gains and floating P&L on the open portion.',
  pairProtection:
    'The value your hedges add or cost on this pair in this scenario. Positive = hedges reduced your loss or protected gains. Negative = rates moved in your favour and locked hedges captured less upside than an unhedged position. This is the normal trade-off of hedging.',
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Simulator() {
  const { selectedCompanyId: companyId } = useCompany()

  const [data, setData]                   = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [selectedShock, setSelectedShock] = useState(-5)
  const [exporting, setExporting]         = useState(false)

  useEffect(() => {
    setData(null)
    setError(null)
    setSelectedShock(-5)
    load()
  }, [companyId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/simulator?company_id=${companyId}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e.message || 'Failed to load simulator')
    } finally {
      setLoading(false)
    }
  }

  function exportCsv() {
    if (!data?.scenarios?.length) return
    setExporting(true)
    const ccy = data.base_currency
    const rows = [
      ['Scenario', 'Shock %', `Unhedged P&L (${ccy})`, `Hedged P&L (${ccy})`, `Hedge Saving (${ccy})`, 'Coverage %']
    ]
    for (const s of data.scenarios) {
      rows.push([s.label, s.shock_pct, s.total_unhedged_pnl, s.total_hedged_pnl, s.protection_value, s.protection_pct])
    }
    rows.push([])
    rows.push(['--- Per-Pair Detail ---'])
    rows.push(['Scenario', 'Shock %', 'Pair', 'Hedge %', 'Total Amount', 'Hedged Amount', `Unhedged P&L (${ccy})`, `Hedged P&L (${ccy})`, `Hedge Saving (${ccy})`])
    for (const s of data.scenarios) {
      for (const p of s.per_pair) {
        rows.push([s.label, s.shock_pct, p.pair, p.hedge_ratio, p.total_amount, p.hedged_amount, p.unhedged_pnl, p.hedged_pnl, p.protection_value])
      }
    }
    const csv  = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `fx-scenario-simulator-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  // ── Loading / Error / Empty ───────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: GOLD }} />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 rounded-xl p-6 border border-red-200">
      <p className="text-red-700 font-semibold text-sm mb-1">Failed to load simulator</p>
      <p className="text-red-500 text-xs">{error}</p>
      <button onClick={load} className="mt-3 text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: NAVY }}>
        Retry
      </button>
    </div>
  )

  if (!data || !data.scenarios?.length) return (
    <div className="bg-white rounded-xl shadow-sm p-8 text-center border border-gray-100">
      <p className="text-4xl mb-3">📊</p>
      <h3 className="text-base font-bold mb-1" style={{ color: NAVY }}>No Data Available</h3>
      <p className="text-sm text-gray-400">Add exposures with budget rates to see scenario analysis.</p>
    </div>
  )

  const { base_currency: ccy, scenarios, current_spot_rates } = data
  const currentScenario  = scenarios.find(s => s.shock_pct === 0)
  const shockScenarios   = scenarios.filter(s => s.shock_pct !== 0)
  const selectedScenario = scenarios.find(s => s.shock_pct === selectedShock) || shockScenarios[0]

  const maxAbsPnl = Math.max(...scenarios.map(s => Math.max(
    Math.abs(s.total_unhedged_pnl || 0),
    Math.abs(s.total_hedged_pnl || 0)
  )))

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="rounded-xl shadow-md p-6" style={{ background: NAVY }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">FX Scenario Simulator</h2>
            <p className="text-sm mt-1" style={{ color: '#8DA4C4' }}>
              Portfolio P&amp;L impact across rate shock scenarios — all values in {ccy}
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
            style={{ background: GOLD, color: NAVY }}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────── */}
      {currentScenario && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="Current Hedged P&L"
            tooltip={TIPS.hedgedPnl}
            value={fmtPnl(currentScenario.total_hedged_pnl, ccy)}
            sub="Locked + floating at today's rates"
            accent={pnlColor(currentScenario.total_hedged_pnl)}
          />
          <SummaryCard
            label="Hedge Saving Today"
            tooltip={TIPS.protectionValue}
            value={fmtPnl(currentScenario.protection_value, ccy)}
            sub="vs fully unhedged position"
            accent={pnlColor(currentScenario.protection_value)}
          />
          <SummaryCard
            label="Protection Coverage"
            tooltip={TIPS.protectionCoverage}
            value={`${currentScenario.protection_pct?.toFixed(1) ?? '—'}%`}
            sub="of unhedged exposure protected"
            accent={
              currentScenario.protection_pct >= 60 ? SUCCESS
              : currentScenario.protection_pct >= 30 ? WARNING
              : DANGER
            }
          />
        </div>
      )}

      {/* ── Live Spot Rates ─────────────────────────────────────────── */}
      {Object.keys(current_spot_rates).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            <TipLabel tip={TIPS.liveRates}>Live Spot Rates</TipLabel>
          </p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(current_spot_rates).map(([pair, rate]) => (
              <div key={pair} className="text-sm">
                <span className="text-gray-500">{pair}</span>
                <span className="ml-2 font-mono font-semibold" style={{ color: NAVY }}>{fmtRate(rate)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Scenario Table ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: NAVY }}>
          <h3 className="font-semibold text-white text-sm">Scenario Analysis</h3>
          <span className="text-xs" style={{ color: '#8DA4C4' }}>Click a row to see per-pair breakdown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead style={{ background: '#F4F6FA' }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                  <TipLabel tip={TIPS.scenario}>Scenario</TipLabel>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                  <TipLabel tip={TIPS.unhedgedPnl}>Unhedged P&amp;L ({ccy})</TipLabel>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                  <TipLabel tip={TIPS.hedgedPnlCol}>Hedged P&amp;L ({ccy})</TipLabel>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                  <TipLabel tip={TIPS.protection}>Hedge Saving ({ccy})</TipLabel>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                  <TipLabel tip={TIPS.coveragePct}>Coverage %</TipLabel>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                  Visual
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shockScenarios.map(s => {
                const isSelected = s.shock_pct === selectedShock
                return (
                  <tr
                    key={s.shock_pct}
                    onClick={() => setSelectedShock(s.shock_pct)}
                    className="cursor-pointer transition-colors"
                    style={{
                      background: isSelected ? 'rgba(201,168,108,0.10)' : 'white',
                      borderLeft: isSelected ? `3px solid ${GOLD}` : '3px solid transparent',
                    }}>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: NAVY }}>
                      {s.label}
                    </td>
                    <td className="px-4 py-3 font-mono text-right whitespace-nowrap" style={{ color: pnlColor(s.total_unhedged_pnl) }}>
                      {fmtPnl(s.total_unhedged_pnl, ccy)}
                    </td>
                    <td className="px-4 py-3 font-mono text-right whitespace-nowrap" style={{ color: pnlColor(s.total_hedged_pnl) }}>
                      {fmtPnl(s.total_hedged_pnl, ccy)}
                    </td>
                    <td className="px-4 py-3 font-mono text-right whitespace-nowrap" style={{ color: pnlColor(s.protection_value) }}>
                      {fmtPnl(s.protection_value, ccy)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-gray-600">
                      {s.protection_pct?.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">
                      <PnlBar value={s.total_hedged_pnl} maxAbs={maxAbsPnl} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Per-Pair Breakdown ──────────────────────────────────────── */}
      {selectedScenario && selectedScenario.per_pair?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3" style={{ background: '#F4F6FA', borderBottom: '1px solid #E5E7EB' }}>
            <h3 className="font-semibold text-sm" style={{ color: NAVY }}>
              Per-Pair Breakdown —{' '}
              <span style={{ color: GOLD }}>{selectedScenario.label}</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead style={{ background: '#F4F6FA' }}>
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    Pair
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <TipLabel tip={TIPS.hedgePct}>Hedge %</TipLabel>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    Total Exposure
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    Hedged Amount
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <TipLabel tip={TIPS.pairUnhedgedPnl}>Unhedged P&amp;L</TipLabel>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <TipLabel tip={TIPS.pairHedgedPnl}>Hedged P&amp;L</TipLabel>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <TipLabel tip={TIPS.pairProtection}>Hedge Saving</TipLabel>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {selectedScenario.per_pair.map(p => {
                  const fmt = n => n != null ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) : '—'
                  return (
                    <tr key={p.pair} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-semibold" style={{ color: NAVY }}>{p.pair}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{p.hedge_ratio?.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 font-mono text-right text-gray-700">{fmt(p.total_amount)}</td>
                      <td className="px-4 py-2.5 font-mono text-right" style={{ color: SUCCESS }}>{fmt(p.hedged_amount)}</td>
                      <td className="px-4 py-2.5 font-mono text-right" style={{ color: pnlColor(p.unhedged_pnl) }}>
                        {fmtPnl(p.unhedged_pnl, '')}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-right" style={{ color: pnlColor(p.hedged_pnl) }}>
                        {fmtPnl(p.hedged_pnl, '')}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-right" style={{ color: pnlColor(p.protection_value) }}>
                        {fmtPnl(p.protection_value, '')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Disclaimer ─────────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid #E5E7EB',
        paddingTop: 16,
        color: '#6B7280',
        fontSize: 12,
        lineHeight: 1.7,
      }}>
        <strong style={{ color: '#9CA3AF', fontWeight: 600 }}>Methodology: </strong>
        Scenarios apply a uniform % shock to each pair's current spot rate simultaneously.
        Locked P&amp;L from executed hedges is scenario-independent (already crystallised at the forward rate).
        Floating P&amp;L on open amounts is recalculated at the shocked rate vs your budget rate.
        Portfolio totals are converted to {ccy} using live spot rates.
        This tool is for indicative purposes only and does not constitute financial advice.
      </div>

    </div>
  )
}
