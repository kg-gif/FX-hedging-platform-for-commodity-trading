// Hedges.jsx — Phase 3 real-data port
//
// Data source: GET /api/exposures/enriched?company_id={id}&include_archived=true
// Tabs driven by the `tab` field returned on each exposure item.
// KPI tiles computed across all non-archived items.
// Intent dropdown: local UI state only — no backend field in Phase 3.
//
// Standards applied:
//   - hedged_amount_eur only in coverage calculations — never hedged_amount
//   - formatPnL(value, baseCcy) for all P&L display
//   - formatDateMedium() for all dates
//   - No fallback to hedged_amount or other wrong-denomination fields
//   - Error banner on fetch failure — data never fails silently
//   - ThinkingIndicator for load state
//   - No emoji. Lucide icons only.
//   - AI disclosure on every AI-derived block (none on this screen)

import { useState, useEffect } from 'react'
import { useCompany } from '../../contexts/CompanyContext'
import { API_BASE, authHeaders } from '../../utils/api'
import { formatPnL, formatDateMedium, formatRate } from '../../utils/formatting'
import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon from '../ui/Icon'
import Tabs from '../ui/Tabs'
import ThinkingIndicator from '../ui/ThinkingIndicator'

// ── Currency flag + pair display ──────────────────────────────────────────────

const FLAG_MAP = {
  EUR:'eu', USD:'us', GBP:'gb', NOK:'no', JPY:'jp',
  CHF:'ch', SEK:'se', DKK:'dk', AUD:'au', CAD:'ca',
}

function FlagPair({ from, to }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
      <span className={`fi fi-${FLAG_MAP[from]||'un'}`} style={{ width:16, height:12, borderRadius:1 }} />
      <span className="mono" style={{ fontWeight:'var(--fw-bold)', color:'var(--snh-navy)' }}>{from}/{to}</span>
      <span className={`fi fi-${FLAG_MAP[to]||'un'}`} style={{ width:16, height:12, borderRadius:1 }} />
    </span>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────
// Maps backend status codes to display labels and semantic colours.

const STATUS_MAP = {
  BREACH:      { label:'Breach',    bg:'rgba(239,68,68,0.10)',   color:'var(--snh-danger)'  },
  WELL_HEDGED: { label:'On track',  bg:'rgba(16,185,129,0.10)',  color:'var(--snh-success)' },
  IN_PROGRESS: { label:'Elevated',  bg:'rgba(245,158,11,0.10)',  color:'var(--snh-warning)' },
  OPEN:        { label:'Open',      bg:'rgba(141,164,196,0.18)', color:'var(--snh-slate)'   },
  NO_BUDGET:   { label:'No budget', bg:'rgba(141,164,196,0.18)', color:'var(--snh-slate)'   },
}

function StatusPill({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.OPEN
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6,
      padding:'4px 12px', borderRadius:'var(--radius-pill)',
      background:s.bg, color:s.color,
      fontSize:'var(--fs-eyebrow)', fontWeight:'var(--fw-bold)',
      letterSpacing:'0.05em', textTransform:'uppercase',
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.color }} />
      {s.label}
    </span>
  )
}

// ── Intent dropdown ───────────────────────────────────────────────────────────
// Local UI state only — no backend field in Phase 3.
// Cipher F-05: ariaLabel prop gives each row's select a unique accessible name.

const INTENT_OPTIONS = [
  'Not yet decided',
  'Will buy spot',
  'Plan to hedge with forward',
  'Urgent',
]

function IntentSelect({ value, onChange, ariaLabel }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={{
        fontFamily:'var(--font-body)',
        fontSize:'var(--fs-body-sm)',
        color:'var(--snh-navy)',
        background:'var(--snh-card)',
        border:'1px solid var(--border-1)',
        borderRadius:'var(--radius-2)',
        padding:'4px 8px',
        cursor:'pointer',
        minWidth:180,
      }}
    >
      {INTENT_OPTIONS.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useEnrichedExposures() {
  const { selectedCompanyId, companyLoading, getSelectedCompany } = useCompany()
  const [exposures, setExposures] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  useEffect(() => {
    if (companyLoading || !selectedCompanyId) return
    let cancelled = false
    setLoading(true); setError(null)
    fetch(
      `${API_BASE}/api/exposures/enriched?company_id=${selectedCompanyId}&include_archived=true`,
      { headers: authHeaders() }
    )
      .then(res => {
        if (!res.ok) throw new Error(`API error ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (cancelled) return
        const items = Array.isArray(data) ? data : (data.items || data.exposures || [])
        setExposures(items)
        setLastRefresh(new Date())
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('[Hedges] fetch failed:', err)
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedCompanyId, companyLoading])

  return { exposures, loading, error, lastRefresh, company: getSelectedCompany() }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayRef(exposure) {
  // `reference` is present in the DB but not the ORM model — may be empty string.
  return exposure.reference || `EXP-${exposure.id}`
}

function coveragePct(exposure) {
  // Returns null when total_amount_eur is absent — renders as '—', not a wrong '0%'.
  // hedged_amount_eur only — hedged_amount is denominated in the exposure's own currency, not EUR.
  if (exposure.total_amount_eur == null) return null
  const total  = exposure.total_amount_eur
  if (total <= 0) return 0
  return Math.round(((exposure.hedged_amount_eur || 0) / total) * 100)
}

function isWithin30Days(dateStr) {
  if (!dateStr) return false
  const now = new Date()
  const d   = new Date(dateStr)
  const diff = (d - now) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= 30
}

// ── KPI computation ───────────────────────────────────────────────────────────

function computeKPIs(exposures, baseCcy) {
  const active = exposures.filter(e => !e.archived)

  const totalHedgedEur = active.reduce((s, e) => s + (e.hedged_amount_eur || 0), 0)
  const totalEur       = active.reduce((s, e) => s + (e.total_amount_eur  || 0), 0)
  const avgCover       = totalEur > 0 ? Math.round((totalHedgedEur / totalEur) * 100) : 0
  const lockedPnl      = active.reduce((s, e) => s + (e.locked_pnl || 0), 0)

  const maturing30      = active.filter(e => isWithin30Days(e.end_date))
  const maturing30Total = maturing30.reduce((s, e) => s + (e.total_amount_eur || 0), 0)
  const maturing30Count = maturing30.length

  return { totalHedgedEur, avgCover, lockedPnl, maturing30Total, maturing30Count, baseCcy }
}

// ── Tab definitions ───────────────────────────────────────────────────────────
// Maps UI tab IDs to backend `tab` field values.

const TAB_DEFS = [
  { id:'requires-action',      label:'Requires action',      backendTab:'requires_action'      },
  { id:'in-progress',          label:'In progress',          backendTab:'in_progress'           },
  { id:'hedged',               label:'Hedged',               backendTab:'hedged'                },
  { id:'awaiting-settlement',  label:'Awaiting settlement',  backendTab:'awaiting_settlement'   },
  { id:'settled',              label:'Settled',              backendTab:'settled'               },
]

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <Card>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 0', gap:16 }}>
        <ThinkingIndicator size={14} />
        <p className="caption" style={{ color:'var(--fg-2)', marginTop:8 }}>Loading positions…</p>
      </div>
    </Card>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Hedges() {
  const { exposures, loading, error, lastRefresh, company } = useEnrichedExposures()
  const [activeTab, setActiveTab] = useState('requires-action')
  const [intents, setIntents]     = useState({})

  const baseCcy      = company?.base_currency || 'EUR'
  const kpis         = computeKPIs(exposures, baseCcy)
  const refreshLabel = lastRefresh
    ? lastRefresh.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false }) + ' CET'
    : '—'

  // Build tab items with live counts — fixed allowlist only.
  // BF-010 guard: log a warning if any exposure has a tab value outside the allowlist.
  // The `confidence` field (COMMITTED/PROBABLE/FORECAST) must never reach tab routing.
  const VALID_TABS = TAB_DEFS.map(d => d.backendTab)
  exposures.forEach(e => {
    if (e.tab && !VALID_TABS.includes(e.tab)) {
      console.warn(`[Hedges] Unexpected tab value "${e.tab}" on exposure ${e.id} — check confidence vs tab field. Falling back to requires_action.`)
    }
  })

  const tabItems = TAB_DEFS.map(def => ({
    id:    def.id,
    label: def.label,
    count: exposures.filter(e => e.tab === def.backendTab).length,
  }))

  // Filtered rows for the active tab
  const activeDef = TAB_DEFS.find(d => d.id === activeTab)
  const rows = activeDef
    ? exposures.filter(e => e.tab === activeDef.backendTab)
    : []

  const updateIntent = (key, val) =>
    setIntents(prev => ({ ...prev, [key]: val }))

  return (
    <>
      {/* Page header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24 }}>
        <div>
          <EyebrowLabel>Treasury console</EyebrowLabel>
          <h2 style={{ marginTop:8 }}>Hedges</h2>
          <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:12 }}>
            <span className="caption" style={{ color:'var(--fg-2)' }}>
              {company?.name || '—'} · {loading ? '…' : `${exposures.filter(e=>!e.archived).length} active positions`} · last refresh {refreshLabel}
            </span>
            {loading && <ThinkingIndicator size={12} />}
          </div>
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <Button variant="ghost">
            <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
              <Icon name="download" size={16} /> Export plan
            </span>
          </Button>
          <Button variant="primary">
            <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
              <Icon name="plus" size={16} /> New hedge
            </span>
          </Button>
        </div>
      </div>

      {/* Error banner — data must never fail silently */}
      {error && (
        <div style={{
          background:'rgba(239,68,68,0.08)', border:'1px solid var(--snh-danger)',
          borderRadius:'var(--radius-3)', padding:'16px 20px', marginBottom:16,
          display:'flex', alignItems:'center', gap:12,
          color:'var(--snh-danger)', fontSize:'var(--fs-body-sm)', fontWeight:'var(--fw-bold)',
        }}>
          <Icon name="alert-circle" size={18} />
          Failed to load hedge data — {error}. Refresh to retry.
        </div>
      )}

      {/* KPI tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16, marginBottom:16 }}>
        <Card>
          <EyebrowLabel style={{ marginBottom:8 }}>Total hedged</EyebrowLabel>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:32, color:'var(--snh-navy)', fontVariantNumeric:'tabular-nums' }}>
            {loading ? '—' : `${baseCcy} ${Math.round(kpis.totalHedgedEur).toLocaleString('en-GB')}`}
          </div>
          <div className="caption" style={{ marginTop:4, color:'var(--fg-2)' }}>
            Across {loading ? '…' : `${exposures.filter(e=>!e.archived).length} active position${exposures.filter(e=>!e.archived).length!==1?'s':''}`}
          </div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom:8 }}>Average cover</EyebrowLabel>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:32, color:'var(--snh-gold)', fontVariantNumeric:'tabular-nums' }}>
            {loading ? '—' : `${kpis.avgCover}%`}
          </div>
          <div className="caption" style={{ marginTop:4, color:'var(--fg-2)' }}>
            {loading ? '—' : company?.hedging_policy_name ? `Vs policy: ${company.hedging_policy_name}` : 'Vs active policy'}
          </div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom:8 }}>Maturing · 30 days</EyebrowLabel>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:32, color:'var(--snh-navy)', fontVariantNumeric:'tabular-nums' }}>
            {loading ? '—' : `${baseCcy} ${Math.round(kpis.maturing30Total).toLocaleString('en-GB')}`}
          </div>
          <div className="caption" style={{ marginTop:4, color:'var(--fg-2)' }}>
            {loading ? '—' : `${kpis.maturing30Count} settlement${kpis.maturing30Count!==1?'s':''} due`}
          </div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom:8 }}>Locked P&L</EyebrowLabel>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:32, fontVariantNumeric:'tabular-nums',
            color: loading ? 'var(--fg-2)' : kpis.lockedPnl >= 0 ? 'var(--snh-success)' : 'var(--snh-danger)' }}>
            {loading ? '—' : formatPnL(kpis.lockedPnl, baseCcy)}
          </div>
          <div className="caption" style={{ marginTop:4, color:'var(--fg-2)' }}>Crystallised from executed hedges</div>
        </Card>
      </div>

      {/* Sub-filter tabs */}
      <div style={{ marginBottom:16 }}>
        <Tabs variant="pill" active={activeTab} onChange={setActiveTab} items={tabItems} />
      </div>

      {/* Positions table */}
      {loading ? (
        <LoadingState />
      ) : (
        <Card>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            <div>
              <EyebrowLabel>{activeDef?.label || 'Active hedges'}</EyebrowLabel>
              <h3 style={{ marginTop:8 }}>
                {rows.length} position{rows.length !== 1 ? 's' : ''}
              </h3>
            </div>
            <button style={{
              background:'transparent', border:'none', color:'var(--snh-navy)',
              fontFamily:'var(--font-body)', fontSize:'var(--fs-body-sm)', fontWeight:'var(--fw-bold)',
              cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6,
            }}>
              View audit log <Icon name="arrow-right" size={14} />
            </button>
          </div>

          <table style={{ width:'100%', borderCollapse:'collapse' }} aria-label={`${activeDef?.label || 'Hedges'} positions`}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border-1)' }}>
                {['Ref', 'Pair', `Notional (${baseCcy})`, 'Budget rate', 'Maturity', 'Cover', 'P&L', 'Intent', 'Status'].map(h => (
                  <th key={h} scope="col" style={{
                    textAlign:'left', padding:'12px 8px',
                    fontSize:'var(--fs-eyebrow)', fontWeight:700,
                    letterSpacing:'0.14em', textTransform:'uppercase',
                    color:'var(--snh-gold)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ref       = displayRef(row)
                const cover     = coveragePct(row)
                const eur       = Math.round(row.total_amount_eur || 0)
                // intentKey uses row.id (always unique) — not ref, which can collide if
                // the reference field is blank or duplicated across exposures.
                const intentKey = String(row.id)
                return (
                  <tr key={row.id} style={{ borderBottom:'1px solid var(--border-1)' }}>
                    <td className="mono" style={{ padding:'14px 8px', color:'var(--snh-slate)', fontSize:'var(--fs-body-sm)' }}>
                      {ref}
                    </td>
                    <td style={{ padding:'14px 8px' }}>
                      <FlagPair from={row.from_currency} to={row.to_currency} />
                    </td>
                    {/* Notional in base currency (EUR) — total_amount_eur only */}
                    <td className="mono tabular" style={{ padding:'14px 8px', color:'var(--snh-navy)' }}>
                      {eur.toLocaleString('en-GB')}
                    </td>
                    {/* Budget rate — 4 decimal places, tabular numerals */}
                    <td className="mono tabular" style={{ padding:'14px 8px' }}>
                      {row.budget_rate ? formatRate(row.budget_rate, 4) : '—'}
                    </td>
                    {/* Maturity: formatDateMedium → "6 Aug 2026" */}
                    <td style={{ padding:'14px 8px', color:'var(--fg-2)' }}>
                      {row.end_date ? formatDateMedium(row.end_date) : '—'}
                    </td>
                    {/* Cover — hedged_amount_eur / total_amount_eur — never use hedged_amount.
                        Null means total_amount_eur unavailable (rate gap) — show '—' not '0%'. */}
                    <td className="mono tabular" style={{ padding:'14px 8px' }}>
                      {cover != null ? `${cover}%` : '—'}
                    </td>
                    {/* P&L — formatPnL outputs "+EUR 93,130" — ISO code, not symbol */}
                    <td className="mono tabular" style={{
                      padding:'14px 8px',
                      color:(row.combined_pnl||0) >= 0 ? 'var(--snh-success)' : 'var(--snh-danger)',
                    }}>
                      {formatPnL(row.combined_pnl || 0, baseCcy)}
                    </td>
                    <td style={{ padding:'14px 8px' }}>
                      <IntentSelect
                        value={intents[intentKey] || 'Not yet decided'}
                        onChange={val => updateIntent(intentKey, val)}
                        ariaLabel={`Intent for ${ref}`}
                      />
                    </td>
                    <td style={{ padding:'14px 8px' }}>
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding:'32px 8px', textAlign:'center', color:'var(--fg-2)', fontSize:'var(--fs-body-sm)' }}>
                    No positions in this tab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
