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

const API_BASE        = 'https://birk-fx-api.onrender.com'
const CALC_DELAY_MS   = 2500

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
})

// ── CSS keyframes injected once ───────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes sim-fade-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sim-border-flash {
    0%   { border-color: ${GOLD}; box-shadow: 0 0 0 2px rgba(201,168,108,0.3); }
    100% { border-color: #E5E7EB; box-shadow: none; }
  }
  @keyframes sim-pulse-bg {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }
`

// ── Tooltip ───────────────────────────────────────────────────────────────────
// position:fixed escapes overflow:hidden table containers.
function Tip({ text }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  function show() {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 8 })
  }
  return (
    <span style={{ display: 'inline-block', marginLeft: 4, verticalAlign: 'middle' }}>
      <span ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%', fontSize: 10, fontWeight: 700,
          cursor: 'default', color: '#9CA3AF', border: '1px solid #D1D5DB',
          lineHeight: 1, userSelect: 'none' }}>
        i
      </span>
      {pos && (
        <span style={{ position: 'fixed', left: pos.x, top: pos.y,
          transform: 'translate(-50%, -100%)', background: NAVY, color: 'white',
          fontSize: 11, lineHeight: 1.5, padding: '7px 10px', borderRadius: 6,
          maxWidth: 280, width: 'max-content', whiteSpace: 'normal',
          zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', pointerEvents: 'none' }}>
          {text}
          <span style={{ position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)', border: '5px solid transparent',
            borderTopColor: NAVY }} />
        </span>
      )}
    </span>
  )
}

function TipLabel({ children, tip }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {children}<Tip text={tip} />
    </span>
  )
}

// ── CalcSymbol ────────────────────────────────────────────────────────────────
// Cycles + → - → = using brand symbols from the Sumnohow logo.
// Each symbol holds for 400ms total:
//   0ms   → fade out (opacity 1→0, CSS transition 150ms)
//   150ms → swap symbol + fade in (opacity 0→1, CSS transition 150ms)
// clearInterval fires automatically on unmount when calculating ends.
function CalcSymbol() {
  const symbols              = ['+', '-', '=']
  const [idx, setIdx]        = useState(0)
  const [visible, setVisible] = useState(true)
  const symIdxRef            = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      setVisible(false)
      // After 150ms: swap symbol and fade back in
      setTimeout(() => {
        symIdxRef.current = (symIdxRef.current + 1) % 3
        setIdx(symIdxRef.current)
        setVisible(true)
      }, 150)
    }, 400)

    return () => clearInterval(interval)
  }, [])

  return (
    <span style={{
      color:      GOLD,
      fontWeight: 700,
      fontSize:   20,
      marginLeft: 8,
      display:    'inline-block',
      width:      18,
      textAlign:  'center',
      verticalAlign: 'middle',
      opacity:    visible ? 1 : 0,
      transition: 'opacity 150ms ease',
    }}>
      {symbols[idx]}
    </span>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonBlock({ h = 20, w = '100%', mb = 8 }) {
  return (
    <div style={{ height: h, width: w, background: '#E5E7EB', borderRadius: 6,
      marginBottom: mb, animation: 'sim-pulse-bg 1.5s ease-in-out infinite' }} />
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="rounded-xl p-6" style={{ background: NAVY }}>
        <SkeletonBlock h={28} w="40%" mb={8} />
        <SkeletonBlock h={14} w="55%" mb={0} />
      </div>
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1,2,3].map(i => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <SkeletonBlock h={12} w="60%" mb={12} />
            <SkeletonBlock h={28} w="70%" mb={8} />
            <SkeletonBlock h={10} w="80%" mb={0} />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        {[1,2,3,4,5,6].map(i => (
          <SkeletonBlock key={i} h={36} mb={0} />
        ))}
      </div>
    </div>
  )
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtPnl(n, ccy) {
  if (n == null) return '—'
  const abs  = Math.abs(n)
  const sign = n < 0 ? '-' : '+'
  if (abs >= 1_000_000) return `${sign}${ccy} ${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}${ccy} ${(abs / 1_000).toFixed(1)}K`
  return `${sign}${ccy} ${abs.toFixed(0)}`
}

function fmtRate(n) { return n == null ? '—' : n.toFixed(4) }

function pnlColor(n) {
  if (n == null) return '#6B7280'
  if (n > 0)  return SUCCESS
  if (n < 0)  return DANGER
  return '#6B7280'
}

// ── PnlBar ────────────────────────────────────────────────────────────────────
function PnlBar({ value, maxAbs }) {
  if (!maxAbs || value == null) return null
  const pct   = Math.min(Math.abs(value) / maxAbs * 50, 50)
  const isPos = value >= 0
  return (
    <div className="flex items-center h-4 w-24 mx-auto">
      <div className="flex-1 flex justify-end">
        {!isPos && <div style={{ width: `${pct * 2}%`, background: DANGER, height: 8, borderRadius: '4px 0 0 4px', minWidth: 2 }} />}
      </div>
      <div style={{ width: 1, height: 12, background: '#D1D5DB', flexShrink: 0 }} />
      <div className="flex-1">
        {isPos && value !== 0 && <div style={{ width: `${pct * 2}%`, background: SUCCESS, height: 8, borderRadius: '0 4px 4px 0', minWidth: 2 }} />}
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
    'Your total portfolio P&L in this scenario vs budget rates, including locked gains from executed hedges and floating P&L on open positions. Negative means rates have moved against your budget.',
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

// ── Print report ──────────────────────────────────────────────────────────────
function openPrintReport(data, selectedScenario) {
  const { base_currency: ccy, scenarios, current_spot_rates } = data
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  const fmtNum = n => n != null ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) : '—'
  const fmtP   = (n, c) => {
    if (n == null) return '—'
    const abs = Math.abs(n), sign = n < 0 ? '-' : '+'
    if (abs >= 1_000_000) return `${sign}${c} ${(abs/1_000_000).toFixed(2)}M`
    if (abs >= 1_000)     return `${sign}${c} ${(abs/1_000).toFixed(1)}K`
    return `${sign}${c} ${abs.toFixed(0)}`
  }
  const color = n => n > 0 ? '#10B981' : n < 0 ? '#EF4444' : '#6B7280'

  const shockScenarios = scenarios.filter(s => s.shock_pct !== 0)

  const ratesHtml = Object.entries(current_spot_rates)
    .map(([pair, rate]) => `<span style="margin-right:24px"><span style="color:#6B7280">${pair}</span> <strong>${rate.toFixed(4)}</strong></span>`)
    .join('')

  const scenarioRows = shockScenarios.map(s => `
    <tr style="background:${s.shock_pct === selectedScenario?.shock_pct ? 'rgba(201,168,108,0.08)' : 'white'}">
      <td style="padding:8px 12px;font-weight:600;color:#1A2744;border-bottom:1px solid #F0F2F7">${s.label}${s.shock_pct === selectedScenario?.shock_pct ? ' ★' : ''}</td>
      <td style="padding:8px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #F0F2F7;color:${color(s.total_unhedged_pnl)}">${fmtP(s.total_unhedged_pnl, ccy)}</td>
      <td style="padding:8px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #F0F2F7;color:${color(s.total_hedged_pnl)}">${fmtP(s.total_hedged_pnl, ccy)}</td>
      <td style="padding:8px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #F0F2F7;color:${color(s.protection_value)}">${fmtP(s.protection_value, ccy)}</td>
      <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #F0F2F7;color:#6B7280">${s.protection_pct?.toFixed(1)}%</td>
    </tr>`).join('')

  const pairRows = (selectedScenario?.per_pair || []).map(p => `
    <tr>
      <td style="padding:8px 12px;font-weight:600;color:#1A2744;border-bottom:1px solid #F0F2F7">${p.pair}</td>
      <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #F0F2F7;color:#6B7280">${p.hedge_ratio?.toFixed(1)}%</td>
      <td style="padding:8px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #F0F2F7;color:#374151">${fmtNum(p.total_amount)}</td>
      <td style="padding:8px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #F0F2F7;color:#10B981">${fmtNum(p.hedged_amount)}</td>
      <td style="padding:8px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #F0F2F7;color:${color(p.unhedged_pnl)}">${fmtP(p.unhedged_pnl, '')}</td>
      <td style="padding:8px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #F0F2F7;color:${color(p.hedged_pnl)}">${fmtP(p.hedged_pnl, '')}</td>
      <td style="padding:8px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #F0F2F7;color:${color(p.protection_value)}">${fmtP(p.protection_value, '')}</td>
    </tr>`).join('')

  const thStyle = 'padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#1A2744;background:#F4F6FA;white-space:nowrap'
  const thR     = thStyle + ';text-align:right'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FX Scenario Analysis — ${today}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1F2937; background: white; }
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    h2 { font-size: 20px; color: #1A2744; margin-bottom: 4px; }
    h3 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1A2744; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .section { margin-bottom: 32px; }
    .badge { display: inline-block; background: rgba(201,168,108,0.15); color: #C9A86C; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="background:#1A2744;padding:24px 32px;margin-bottom:32px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="color:#C9A86C;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">Sumnohow FX Risk Platform</div>
        <h2 style="color:white;font-size:22px;margin-bottom:4px">FX Scenario Analysis</h2>
        <p style="color:#8DA4C4;font-size:13px">All values in ${ccy} · Generated ${today}</p>
      </div>
      <div style="text-align:right">
        <p style="color:#8DA4C4;font-size:11px;margin-bottom:2px">Selected Scenario</p>
        <p style="color:#C9A86C;font-weight:700;font-size:14px">${selectedScenario?.label || '—'}</p>
      </div>
    </div>
  </div>

  <div style="padding:0 32px">

    <!-- Live Rates -->
    <div class="section">
      <h3>Live Spot Rates at Time of Report</h3>
      <div style="font-size:13px;line-height:2">${ratesHtml}</div>
    </div>

    <!-- All Scenarios -->
    <div class="section">
      <h3>Scenario Summary — All Shock Levels</h3>
      <p style="font-size:12px;color:#6B7280;margin-bottom:12px">★ = currently selected scenario for per-pair breakdown below</p>
      <table>
        <thead>
          <tr>
            <th style="${thStyle}">Scenario</th>
            <th style="${thR}">Unhedged P&amp;L (${ccy})</th>
            <th style="${thR}">Hedged P&amp;L (${ccy})</th>
            <th style="${thR}">Hedge Saving (${ccy})</th>
            <th style="${thR}">Coverage %</th>
          </tr>
        </thead>
        <tbody>${scenarioRows}</tbody>
      </table>
    </div>

    <!-- Per-Pair Breakdown -->
    ${selectedScenario ? `
    <div class="section">
      <h3>Per-Pair Breakdown — <span style="color:#C9A86C">${selectedScenario.label}</span></h3>
      <table>
        <thead>
          <tr>
            <th style="${thStyle}">Pair</th>
            <th style="${thR}">Hedge %</th>
            <th style="${thR}">Total Exposure</th>
            <th style="${thR}">Hedged Amount</th>
            <th style="${thR}">Unhedged P&amp;L</th>
            <th style="${thR}">Hedged P&amp;L</th>
            <th style="${thR}">Hedge Saving</th>
          </tr>
        </thead>
        <tbody>${pairRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Methodology -->
    <div style="border-top:1px solid #E5E7EB;padding-top:20px;margin-bottom:24px">
      <h3 style="margin-bottom:8px">Methodology</h3>
      <p style="font-size:12px;color:#6B7280;line-height:1.7">
        Scenarios apply a uniform % shock to each pair's current spot rate simultaneously.
        Locked P&L from executed hedges is scenario-independent (already crystallised at the forward rate).
        Floating P&L on open amounts is recalculated at the shocked rate vs budget rate.
        Portfolio totals are converted to ${ccy} using live spot rates.
        This report is for internal management information only and does not constitute financial advice.
      </p>
    </div>

    <!-- Print hint -->
    <div class="no-print" style="background:#F4F6FA;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:12px;color:#6B7280">
      Use your browser's <strong>File → Print</strong> (or Ctrl+P / Cmd+P) to save as PDF.
    </div>

  </div>

  <!-- Footer -->
  <div style="background:#F4F6FA;padding:16px 32px;margin-top:32px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:11px;color:#9CA3AF">Generated by Sumnohow · Confidential · Not for distribution</span>
    <span style="font-size:11px;color:#9CA3AF">${today}</span>
  </div>

</body>
</html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Simulator() {
  const { selectedCompanyId: companyId } = useCompany()

  const [data, setData]                   = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [selectedShock, setSelectedShock] = useState(-5)
  // calculating: true while the 2500ms "thinking" delay is running
  const [calculating, setCalculating]     = useState(false)
  // revealKey increments each time calculating ends → re-mounts rows for fade-in
  const [revealKey, setRevealKey]         = useState(0)
  const calcTimerRef                      = useRef(null)

  useEffect(() => {
    setData(null)
    setError(null)
    setSelectedShock(-5)
    setCalculating(false)
    load()
    return () => clearTimeout(calcTimerRef.current)
  }, [companyId])

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/api/simulator?company_id=${companyId}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e.message || 'Failed to load simulator')
    } finally {
      setLoading(false)
    }
  }

  // Selecting a scenario: summary cards update immediately; per-pair shows thinking animation
  function handleSelect(shock) {
    if (shock === selectedShock) return
    setSelectedShock(shock)
    setCalculating(true)
    clearTimeout(calcTimerRef.current)
    calcTimerRef.current = setTimeout(() => {
      setCalculating(false)
      setRevealKey(k => k + 1)
    }, CALC_DELAY_MS)
  }

  // ── Loading / Error / Empty ───────────────────────────────────────
  if (loading) return (
    <>
      <style>{KEYFRAMES}</style>
      <LoadingSkeleton />
    </>
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
    <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
      <p style={{ fontSize: 40, marginBottom: 12 }}>📊</p>
      <h3 className="text-base font-bold mb-2" style={{ color: NAVY }}>No Active Exposures Found</h3>
      <p className="text-sm text-gray-400 mb-6">
        Add exposures in the Admin panel to run scenario analysis.
      </p>
      <button
        onClick={() => window.location.hash = '#admin'}
        className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
        style={{ background: NAVY }}>
        Go to Admin
      </button>
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
    <>
      <style>{KEYFRAMES}</style>
      <div className="space-y-6">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="rounded-xl shadow-md p-6" style={{ background: NAVY }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">FX Scenario Simulator</h2>
              <p className="text-sm mt-1" style={{ color: '#8DA4C4' }}>
                Portfolio P&amp;L impact across rate shock scenarios — all values in {ccy}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                onClick={() => openPrintReport(data, selectedScenario)}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: GOLD, color: NAVY }}>
                Download Scenario Report
              </button>
              <p style={{ color: '#8DA4C4', fontSize: 11 }}>
                Use browser print to save as PDF
              </p>
            </div>
          </div>
        </div>

        {/* ── Summary Cards — driven by SELECTED scenario ──────────── */}
        {selectedScenario && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              label="Hedged P&L"
              tooltip={TIPS.hedgedPnl}
              value={fmtPnl(selectedScenario.total_hedged_pnl, ccy)}
              sub={`in ${selectedScenario.label} scenario`}
              accent={pnlColor(selectedScenario.total_hedged_pnl)}
            />
            <SummaryCard
              label="Hedge Saving"
              tooltip={TIPS.protectionValue}
              value={fmtPnl(selectedScenario.protection_value, ccy)}
              sub="vs fully unhedged position"
              accent={pnlColor(selectedScenario.protection_value)}
            />
            <SummaryCard
              label="Coverage"
              tooltip={TIPS.protectionCoverage}
              value={`${selectedScenario.protection_pct?.toFixed(1) ?? '—'}%`}
              sub="of unhedged exposure protected"
              accent={
                selectedScenario.protection_pct >= 60 ? SUCCESS
                : selectedScenario.protection_pct >= 30 ? WARNING
                : DANGER
              }
            />
          </div>
        )}

        {/* ── Live Spot Rates ──────────────────────────────────────── */}
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

        {/* ── Scenario Table ───────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3" style={{ background: NAVY }}>
            <h3 className="font-semibold text-white text-sm">Scenario Analysis</h3>
          </div>

          {/* Instruction label */}
          <div className="px-5 py-2" style={{ background: 'rgba(201,168,108,0.06)', borderBottom: '1px solid rgba(201,168,108,0.15)' }}>
            <p style={{ fontSize: 11, color: GOLD, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Select a scenario to model its impact on your portfolio
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead style={{ background: '#F4F6FA' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <TipLabel tip={TIPS.scenario}>Scenario</TipLabel>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <TipLabel tip={TIPS.unhedgedPnl}>Unhedged P&amp;L ({ccy})</TipLabel>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <TipLabel tip={TIPS.hedgedPnlCol}>Hedged P&amp;L ({ccy})</TipLabel>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                    <TipLabel tip={TIPS.protection}>Hedge Saving ({ccy})</TipLabel>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
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
                      onClick={() => handleSelect(s.shock_pct)}
                      className="cursor-pointer transition-colors"
                      style={{
                        background:  isSelected ? `rgba(26,39,68,0.06)` : 'white',
                        borderLeft:  isSelected ? `3px solid ${GOLD}` : '3px solid transparent',
                        boxShadow:   isSelected ? `inset 0 0 0 0 transparent` : 'none',
                      }}>
                      <td className="px-4 py-3 whitespace-nowrap" style={{
                        color: isSelected ? GOLD : NAVY,
                        fontWeight: isSelected ? 700 : 600,
                        fontSize: isSelected ? 13 : 13,
                      }}>
                        {s.label}
                        {isSelected && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600,
                            background: NAVY, color: GOLD, padding: '1px 6px', borderRadius: 4 }}>
                            selected
                          </span>
                        )}
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

        {/* ── Per-Pair Breakdown ───────────────────────────────────── */}
        {selectedScenario && selectedScenario.per_pair?.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden"
            style={{
              borderColor: '#E5E7EB',
              animation: !calculating && revealKey > 0
                ? 'sim-border-flash 1.2s ease-out forwards' : 'none'
            }}>

            {/* Label above breakdown — always shows scenario name */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#F4F6FA', borderBottom: '1px solid #E5E7EB' }}>
              <h3 className="font-semibold text-sm" style={{ color: NAVY }}>
                <span style={{ color: GOLD, marginRight: 6 }}>↓</span>
                Showing breakdown for:{' '}
                <span style={{ color: GOLD }}>{selectedScenario.label}</span>
              </h3>
              <span className="text-xs" style={{ color: '#9CA3AF' }}>
                {selectedScenario.per_pair.length} pair{selectedScenario.per_pair.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Table body wrapper — relative so the overlay can be centred inside it */}
            <div style={{ position: 'relative' }}>

              {/* Calculating overlay — centred over the table rows */}
              {calculating && (
                <div style={{
                  position:   'absolute',
                  inset:      0,
                  display:    'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex:     10,
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    background:   'rgba(255,255,255,0.85)',
                    borderRadius: 10,
                    padding:      '12px 24px',
                    display:      'flex',
                    alignItems:   'center',
                    boxShadow:    '0 2px 12px rgba(26,39,68,0.10)',
                    border:       `1px solid rgba(201,168,108,0.25)`,
                  }}>
                    <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>
                      Calculating scenario impact
                    </span>
                    <CalcSymbol />
                  </div>
                </div>
              )}

            <div className="overflow-x-auto" style={{ opacity: calculating ? 0.25 : 1, filter: calculating ? 'blur(1.5px)' : 'none', transition: 'opacity 0.3s, filter 0.3s' }}>
              <table className="min-w-full text-sm">
                <thead style={{ background: '#F4F6FA' }}>
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>Pair</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                      <TipLabel tip={TIPS.hedgePct}>Hedge %</TipLabel>
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>Total Exposure</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>Hedged Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                      <TipLabel tip={TIPS.pairUnhedgedPnl}>Unhedged P&amp;L</TipLabel>
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                      <TipLabel tip={TIPS.pairHedgedPnl}>Hedged P&amp;L</TipLabel>
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY, whiteSpace: 'nowrap' }}>
                      <TipLabel tip={TIPS.pairProtection}>Hedge Saving</TipLabel>
                    </th>
                  </tr>
                </thead>
                <tbody key={revealKey} className="divide-y divide-gray-50">
                  {selectedScenario.per_pair.map((p, i) => {
                    const fmt = n => n != null ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) : '—'
                    return (
                      <tr key={p.pair} className="hover:bg-gray-50"
                        style={{
                          animation: !calculating && revealKey > 0
                            ? `sim-fade-in 0.35s ease-out ${i * 50}ms both` : 'none'
                        }}>
                        <td className="px-4 py-2.5 font-semibold" style={{ color: NAVY }}>{p.pair}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{p.hedge_ratio?.toFixed(1)}%</td>
                        <td className="px-4 py-2.5 font-mono text-right text-gray-700">{fmt(p.total_amount)}</td>
                        <td className="px-4 py-2.5 font-mono text-right" style={{ color: SUCCESS }}>{fmt(p.hedged_amount)}</td>
                        <td className="px-4 py-2.5 font-mono text-right" style={{ color: pnlColor(p.unhedged_pnl) }}>{fmtPnl(p.unhedged_pnl, '')}</td>
                        <td className="px-4 py-2.5 font-mono text-right" style={{ color: pnlColor(p.hedged_pnl) }}>{fmtPnl(p.hedged_pnl, '')}</td>
                        <td className="px-4 py-2.5 font-mono text-right" style={{ color: pnlColor(p.protection_value) }}>{fmtPnl(p.protection_value, '')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </div>{/* end position:relative wrapper */}
          </div>
        )}

        {/* ── Disclaimer ───────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16, color: '#6B7280', fontSize: 12, lineHeight: 1.7 }}>
          <strong style={{ color: '#9CA3AF', fontWeight: 600 }}>Methodology: </strong>
          Scenarios apply a uniform % shock to each pair's current spot rate simultaneously.
          Locked P&amp;L from executed hedges is scenario-independent (already crystallised at the forward rate).
          Floating P&amp;L on open amounts is recalculated at the shocked rate vs your budget rate.
          Portfolio totals are converted to {ccy} using live spot rates.
          This tool is for indicative purposes only and does not constitute financial advice.
        </div>

      </div>
    </>
  )
}
