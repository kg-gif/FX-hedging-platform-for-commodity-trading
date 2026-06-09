// Execution.jsx — Phase 3 real-data port
//
// Data sources:
//   GET /api/audit/orders?company_id={id}               — order audit log
//   GET /api/facilities/utilisation/{company_id}        — counterparties + limits
//   GET /api/exposures/enriched?company_id={id}         — exposure selector + company data
//
// Execute flow (Lex Condition 8 — cleared 5 Jun 2026, SIGNOFF_LEX_EXECUTION_FLOW.md):
//   1. POST /api/audit/order-sent  — log order atomically
//   2. Open mailto: via user's own email client (Lex Impl-1 — SNH must not send directly)
//   3. Show confirmation card
//   Counterparties sourced from facilities endpoint only (Lex Impl-2).
//   No auto-created executed tranche on button press (Lex Impl-3).
//
// Condition 9 (BF-001 tranche-ID gap): PATCH /api/tranches/{id}/value-date is for
// existing tranches. Value-date overrides at order-send time are captured in the
// email body and in order_audit_log — no separate audit call required here.
//
// Standards applied:
//   - formatPnL / formatDateMedium / formatRate from utils/formatting.js
//   - authHeaders() / API_BASE from utils/api.js
//   - Error banners on every fetch — never fail silently
//   - ThinkingIndicator for load state
//   - No emoji. Lucide icons only.

import { useState, useEffect, useRef } from 'react'
import { useCompany } from '../../contexts/CompanyContext'
import { API_BASE, authHeaders } from '../../utils/api'
import { formatDateMedium, formatRate, formatPnL } from '../../utils/formatting'
import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon from '../ui/Icon'
import Tabs from '../ui/Tabs'
import ThinkingIndicator from '../ui/ThinkingIndicator'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNotionalEur(n, baseCcy = 'EUR') {
  if (!n && n !== 0) return '—'
  return `${baseCcy} ${Math.round(Number(n)).toLocaleString('en-GB')}`
}

// order_audit_log.id → display ref
function orderRef(order) {
  return `ORD-${String(order.id).padStart(5, '0')}`
}

// Timestamp → "5 Jun · 14:32"
function formatOrderTime(sentAt) {
  if (!sentAt) return '—'
  const d = new Date(sentAt)
  if (isNaN(d)) return '—'
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time}`
}

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  sent:      { label: 'Sent',      bg: 'rgba(245,158,11,0.10)', color: 'var(--snh-warning)' },
  executed:  { label: 'Executed',  bg: 'rgba(16,185,129,0.10)', color: 'var(--snh-success)' },
  confirmed: { label: 'Confirmed', bg: 'rgba(16,185,129,0.10)', color: 'var(--snh-success)' },
  failed:    { label: 'Failed',    bg: 'rgba(239,68,68,0.10)',  color: 'var(--snh-danger)'  },
}

function StatusPill({ status }) {
  const s = STATUS_STYLES[status?.toLowerCase()] || STATUS_STYLES.sent
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 'var(--radius-pill)',
      background: s.bg, color: s.color,
      fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  )
}

// ── Post-execution confirmation card ─────────────────────────────────────────
// Pixel spec: navy bg, white text, required fields: ref, pair, notional, rate, maturity, counterparty.
// Cipher F-06: focus on mount for keyboard/SR users.

function ConfirmationCard({ trade, onDone, baseCcy }) {
  const cardRef = useRef(null)
  useEffect(() => { cardRef.current?.focus() }, [])

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      aria-live="polite"
      aria-label="Order logged and email draft opened"
      style={{ background: 'var(--snh-navy)', borderRadius: 'var(--radius-3)', padding: 32, marginBottom: 24, outline: 'none' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--snh-gold)', marginBottom: 8 }}>
            Order logged
          </div>
          <h2 style={{ color: 'var(--fg-on-navy)', margin: 0 }}>{trade.pair}</h2>
          <p style={{ color: 'rgba(255,255,255,0.60)', fontSize: 'var(--fs-body-sm)', marginTop: 8 }}>
            Your email client has opened with a pre-filled order instruction. Send the email to confirm with your bank.
          </p>
        </div>
        <Icon name="check-circle" size={32} style={{ color: 'var(--snh-gold)' }} />
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24,
        borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 24, marginBottom: 24,
      }}>
        {[
          { label: 'Order reference', value: trade.ref,                           mono: true  },
          { label: 'Notional',        value: formatNotionalEur(trade.notional, baseCcy), mono: true  },
          { label: 'Forward rate',    value: formatRate(trade.rate, 4),             mono: true  },
          { label: 'Maturity',        value: formatDateMedium(trade.valueDate),     mono: false },
          { label: 'Counterparty',    value: trade.counterparty,                   mono: false },
          { label: 'Direction',       value: trade.action?.toUpperCase() || '—',   mono: true  },
        ].map(({ label, value, mono }) => (
          <div key={label}>
            <div style={{ fontSize: 'var(--fs-eyebrow)', color: 'rgba(255,255,255,0.50)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div className={mono ? 'mono tabular' : undefined} style={{ color: 'var(--fg-on-navy)', fontWeight: 700 }}>{value || '—'}</div>
          </div>
        ))}
      </div>

      <Button variant="primary" onClick={onDone}>Back to hedges</Button>
    </div>
  )
}

// ── Execution form ────────────────────────────────────────────────────────────

const DIRECTION_OPTIONS = [
  { value: 'buy',  label: 'Buy (receivable — sell foreign, buy base)' },
  { value: 'sell', label: 'Sell (payable — buy foreign, sell base)'   },
]

function ExecutionForm({ exposures, facilities, company, user, onExecute, onCancel, baseCcy }) {
  const [exposureId, setExposureId] = useState('')
  const [pair, setPair]             = useState('')
  const [action, setAction]         = useState('buy')
  const [notionalStr, setNotional]  = useState('')
  const [rate, setRate]             = useState('')
  const [valueDate, setValueDate]   = useState('')
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ? String(facilities[0].id) : '')
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState(null)

  // When user picks an exposure, pre-fill pair and direction
  const handleExposureChange = (id) => {
    setExposureId(id)
    const exp = exposures.find(e => String(e.id) === id)
    if (exp) {
      setPair(`${exp.from_currency}/${exp.to_currency}`)
      // Direction: exposure_type 'payable' → sell, 'receivable' → buy
      setAction(exp.exposure_type === 'receivable' ? 'buy' : 'sell')
    }
  }

  const notional  = parseFloat(notionalStr.replace(/,/g, '').replace(/\s/g, '')) || 0
  const facility  = facilities.find(f => String(f.id) === facilityId)
  const available = facility?.available_eur ?? 0
  const limitBreached = notional > 0 && notional > available

  const canExecute = notional > 0 && rate && valueDate && !limitBreached && !saving && pair

  const bankEmail = facility?.contact_email || company?.bank_email || ''
  const bankName  = facility?.bank_name || company?.bank_name || 'FX Desk'

  const handleExecute = async () => {
    if (!canExecute) return
    setSaving(true); setSaveError(null)

    // 1. Log order to audit trail — POST /api/audit/order-sent
    //    This is the only server-side call on button press. No tranche created here (Lex Impl-3).
    const selectedExp = exposures.find(e => String(e.id) === exposureId)
    try {
      const res = await fetch(`${API_BASE}/api/audit/order-sent`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id:    company?.id,
          exposure_id:   exposureId ? Number(exposureId) : null,
          currency_pair: pair,
          order_type:    'immediate',
          action,
          value_date:    valueDate,
          instrument:    'Forward',
          sent_by:       user?.email || 'unknown',
          sent_at:       new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error(`Audit log failed — API error ${res.status}`)
      const data = await res.json()

      // 2. Open email client (Lex Impl-1 — SNH must not send directly)
      const subject = `FX Forward Request — ${action.toUpperCase()} ${pair}`
      const expRef   = selectedExp?.reference || (exposureId ? `EXP-${exposureId}` : null)
      const body = [
        `Dear ${bankName},`,
        '',
        'Please execute the following FX transaction:',
        '',
        `Direction:     ${action.toUpperCase() === 'BUY' ? `Buy ${pair.split('/')[1]} / Sell ${pair.split('/')[0]}` : `Sell ${pair.split('/')[1]} / Buy ${pair.split('/')[0]}`}`,
        `Amount:        ${baseCcy} ${Math.round(notional).toLocaleString('en-GB')}`,
        `Currency pair: ${pair}`,
        `Instrument:    Forward`,
        `Forward rate:  ${Number(rate).toFixed(4)}`,
        `Value date:    ${formatDateMedium(valueDate)}`,
        expRef ? `Reference:     ${expRef}` : null,
        '',
        'Please confirm execution by return.',
        '',
        'Kind regards',
      ].filter(l => l !== null).join('\n')

      const mailto = `mailto:${encodeURIComponent(bankEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      const a = document.createElement('a')
      a.href = mailto
      a.click()

      // 3. Show confirmation card
      onExecute({
        ref:          `ORD-${String(data.id || 0).padStart(5, '0')}`,
        pair,
        notional,
        rate:         parseFloat(rate),
        valueDate,
        counterparty: bankName,
        action,
      })
    } catch (err) {
      console.error('[Execution] order-sent failed:', err)
      setSaveError(err.message)
      setSaving(false)
    }
  }

  const labelStyle = {
    display: 'block', fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
    letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--snh-gold)', marginBottom: 6,
  }
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)',
    color: 'var(--snh-navy)', background: 'var(--snh-card)',
    border: '1px solid var(--border-1)', borderRadius: 'var(--radius-2)', padding: '8px 12px',
  }

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <EyebrowLabel>New execution</EyebrowLabel>
          <h3 style={{ marginTop: 8 }}>Execute hedge</h3>
        </div>
        <button onClick={onCancel} aria-label="Cancel execution"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--snh-slate)' }}>
          <Icon name="x" size={20} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>

        {/* Exposure selector — pre-fills pair and direction */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="exec-exposure" style={labelStyle}>Exposure (optional — leave blank for ad-hoc)</label>
          <select id="exec-exposure" value={exposureId} onChange={e => handleExposureChange(e.target.value)} style={inputStyle}>
            <option value="">— Select exposure —</option>
            {exposures.filter(e => !e.archived && e.status !== 'WELL_HEDGED').map(e => (
              <option key={e.id} value={String(e.id)}>
                {e.from_currency}/{e.to_currency} · {e.reference || `EXP-${e.id}`}{e.description ? ` · ${e.description}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="exec-pair" style={labelStyle}>Currency pair</label>
          <input id="exec-pair" type="text" value={pair}
            onChange={e => setPair(e.target.value.toUpperCase())}
            placeholder="e.g. EUR/USD" style={inputStyle} />
        </div>

        <div>
          <label htmlFor="exec-direction" style={labelStyle}>Direction</label>
          <select id="exec-direction" value={action} onChange={e => setAction(e.target.value)} style={inputStyle}>
            {DIRECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          {/* Cipher F-01: htmlFor matches input id */}
          <label htmlFor="exec-cp" style={labelStyle}>Counterparty</label>
          <select id="exec-cp" value={facilityId} onChange={e => setFacilityId(e.target.value)} style={inputStyle}>
            {facilities.map(f => (
              <option key={f.id} value={String(f.id)}>{f.bank_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="exec-notional" style={labelStyle}>Notional ({baseCcy})</label>
          <input id="exec-notional" type="text" value={notionalStr}
            onChange={e => setNotional(e.target.value)}
            placeholder="e.g. 1000000"
            aria-describedby="exec-notional-hint"
            style={inputStyle} />
          <div id="exec-notional-hint" style={{ marginTop: 4, fontSize: 'var(--fs-eyebrow)', minHeight: 16 }}>
            {notional > 0 && !limitBreached && (
              <span style={{ color: 'var(--snh-success)' }}>{formatNotionalEur(notional, baseCcy)}</span>
            )}
            {notionalStr && notional === 0 && (
              <span style={{ color: 'var(--snh-danger)' }}>Enter a valid amount</span>
            )}
          </div>
        </div>

        <div>
          {/* Rate: always 4 decimal places per Pixel spec */}
          <label htmlFor="exec-rate" style={labelStyle}>Forward rate</label>
          <input id="exec-rate" type="text" value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder="e.g. 1.0847" style={inputStyle} />
        </div>

        <div>
          {/* Value date: renders as DD Mon YYYY via formatDateMedium per Pixel spec */}
          <label htmlFor="exec-valuedate" style={labelStyle}>Value date</label>
          <input id="exec-valuedate" type="date" value={valueDate}
            onChange={e => setValueDate(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {/* Counterparty facility summary — real data from utilisation endpoint */}
      {facility && (
        <div style={{
          background: 'var(--snh-bg)', borderRadius: 'var(--radius-2)',
          padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 32, flexWrap: 'wrap',
        }}>
          <div>
            <span className="caption" style={{ color: 'var(--fg-2)' }}>Limit · {facility.bank_name}</span>
            <span className="mono tabular" style={{ marginLeft: 8, color: 'var(--snh-navy)', fontWeight: 700 }}>
              {formatNotionalEur(facility.facility_limit_eur, baseCcy)}
            </span>
          </div>
          <div>
            <span className="caption" style={{ color: 'var(--fg-2)' }}>Available</span>
            <span className="mono tabular" style={{
              marginLeft: 8, fontWeight: 700,
              color: facility.available_eur > 0 ? 'var(--snh-success)' : 'var(--snh-danger)',
            }}>
              {formatNotionalEur(facility.available_eur, baseCcy)}
            </span>
          </div>
          <div>
            <span className="caption" style={{ color: 'var(--fg-2)' }}>Utilisation</span>
            <span className="mono tabular" style={{
              marginLeft: 8, fontWeight: 700,
              color: facility.status === 'CRITICAL' ? 'var(--snh-danger)'
                   : facility.status === 'WARNING'  ? 'var(--snh-warning)'
                   : 'var(--snh-navy)',
            }}>
              {facility.utilisation_pct?.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Pixel Condition 3: limit breach — disables execute, shows danger caption */}
      {limitBreached && (
        <div style={{
          color: 'var(--snh-danger)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-bold)',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="alert-circle" size={16} />
          Notional exceeds {facility?.bank_name}&apos;s available facility ({formatNotionalEur(available, baseCcy)}). Reduce notional or select a different counterparty.
        </div>
      )}

      {saveError && (
        <div style={{
          color: 'var(--snh-danger)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-bold)',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="alert-circle" size={16} />
          {saveError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="primary" onClick={handleExecute} disabled={!canExecute}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {saving ? <ThinkingIndicator size={12} /> : <Icon name="send" size={16} />}
            {saving ? 'Logging order…' : 'Execute hedge'}
          </span>
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <span style={{ fontSize: 'var(--fs-eyebrow)', color: 'var(--snh-slate)', marginLeft: 4 }}>
          This will open your email client with a pre-filled order instruction for {facility?.bank_name || 'your bank'}.
        </span>
      </div>
    </Card>
  )
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useExecutionData() {
  const { selectedCompanyId, companyLoading, getSelectedCompany } = useCompany()
  const [orders, setOrders]         = useState([])
  const [facilities, setFacilities] = useState([])
  const [exposures, setExposures]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [errors, setErrors]         = useState({})
  const [lastRefresh, setLastRefresh] = useState(null)

  useEffect(() => {
    if (companyLoading || !selectedCompanyId) return
    let cancelled = false
    setLoading(true); setErrors({})

    // Fetch independently — one failure must not kill the others.
    // Each fetch sets its own state; a shared counter triggers loading=false after all three settle.
    let settled = 0
    const done = () => { if (++settled === 3 && !cancelled) { setLoading(false); setLastRefresh(new Date()) } }

    fetch(`${API_BASE}/api/audit/orders?company_id=${selectedCompanyId}`, { headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json() })
      .then(d => { if (!cancelled) setOrders(d.orders || []) })
      .catch(e => { if (!cancelled) setErrors(prev => ({ ...prev, orders: e.message })) })
      .finally(done)

    fetch(`${API_BASE}/api/facilities/utilisation/${selectedCompanyId}`, { headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json() })
      .then(d => { if (!cancelled) setFacilities(d.facilities || []) })
      .catch(e => { if (!cancelled) setErrors(prev => ({ ...prev, facilities: e.message })) })
      .finally(done)

    fetch(
      `${API_BASE}/api/exposures/enriched?company_id=${selectedCompanyId}&include_archived=false`,
      { headers: authHeaders() }
    )
      .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json() })
      .then(d => {
        if (!cancelled) setExposures(Array.isArray(d) ? d : (d.items || d.exposures || []))
      })
      .catch(e => { if (!cancelled) setErrors(prev => ({ ...prev, exposures: e.message })) })
      .finally(done)

    return () => { cancelled = true }
  }, [selectedCompanyId, companyLoading])

  return { orders, facilities, exposures, loading, errors, lastRefresh, company: getSelectedCompany() }
}

// ── Main screen ───────────────────────────────────────────────────────────────

const TAB_DEFS = [
  { id: 'all',       label: 'All',       filterFn: () => true                                },
  { id: 'sent',      label: 'Sent',      filterFn: o => o.status?.toLowerCase() === 'sent'      },
  { id: 'executed',  label: 'Executed',  filterFn: o => o.status?.toLowerCase() === 'executed'  },
  { id: 'confirmed', label: 'Confirmed', filterFn: o => o.status?.toLowerCase() === 'confirmed' },
  { id: 'failed',    label: 'Failed',    filterFn: o => o.status?.toLowerCase() === 'failed'    },
]

export default function Execution() {
  const { orders, facilities, exposures, loading, errors, lastRefresh, company } = useExecutionData()
  const [filter, setFilter]           = useState('all')
  const [showForm, setShowForm]       = useState(false)
  const [confirmedTrade, setConfirmed] = useState(null)

  // Auth user for sent_by
  const user = JSON.parse(localStorage.getItem('auth_user') || '{}')

  const baseCcy      = company?.base_currency || 'EUR'
  const refreshLabel = lastRefresh
    ? lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' CET'
    : '—'

  // KPI computations
  const now         = new Date()
  const thirtyDays  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const recent      = orders.filter(o => o.sent_at && new Date(o.sent_at) >= thirtyDays)
  const pendingSent = orders.filter(o => o.status?.toLowerCase() === 'sent')
  const confirmed   = orders.filter(o => o.status?.toLowerCase() === 'confirmed')

  // Tabs with live counts
  const tabItems = TAB_DEFS.map(def => ({
    id: def.id, label: def.label,
    count: def.id === 'all' ? orders.length : orders.filter(def.filterFn).length,
  }))

  const activeDef = TAB_DEFS.find(d => d.id === filter)
  const visibleOrders = activeDef ? orders.filter(activeDef.filterFn) : orders

  const handleExecute = (trade) => { setShowForm(false); setConfirmed(trade) }
  const handleDone    = () => setConfirmed(null)

  const hasErrors = Object.keys(errors).length > 0

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <EyebrowLabel>Treasury console</EyebrowLabel>
          <h2 style={{ marginTop: 8 }}>Execution</h2>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="caption" style={{ color: 'var(--fg-2)' }}>
              {company?.name || '—'} · Order audit log · last refresh {refreshLabel}
            </span>
            {loading && <ThinkingIndicator size={12} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="ghost">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="download" size={16} /> Export audit log
            </span>
          </Button>
          {!confirmedTrade && !showForm && (
            <Button variant="primary" onClick={() => setShowForm(true)}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="plus" size={16} /> New execution
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Error banners — data must never fail silently */}
      {hasErrors && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid var(--snh-danger)',
          borderRadius: 'var(--radius-3)', padding: '16px 20px', marginBottom: 16,
          color: 'var(--snh-danger)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-bold)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="alert-circle" size={18} />
            <span>
              {[
                errors.orders     && 'Order log unavailable',
                errors.facilities && 'Facility data unavailable',
                errors.exposures  && 'Exposure data unavailable',
              ].filter(Boolean).join(' · ')} — refresh to retry.
            </span>
          </div>
        </div>
      )}

      {/* Confirmation card */}
      {confirmedTrade && (
        <ConfirmationCard trade={confirmedTrade} onDone={handleDone} baseCcy={baseCcy} />
      )}

      {/* Execution form */}
      {showForm && !confirmedTrade && (
        <ExecutionForm
          exposures={exposures}
          facilities={facilities}
          company={company}
          user={user}
          onExecute={handleExecute}
          onCancel={() => setShowForm(false)}
          baseCcy={baseCcy}
        />
      )}

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Orders · 30 days</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>
            {loading ? '—' : recent.length}
          </div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>
            {loading ? '—' : `${orders.length} total on record`}
          </div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Total hedged · portfolio</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>
            {loading ? '—' : formatNotionalEur(
              exposures.reduce((s, e) => s + (e.hedged_amount_eur || 0), 0), baseCcy
            )}
          </div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Executed and confirmed tranches</div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Awaiting bank confirmation</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: pendingSent.length > 0 ? 'var(--snh-warning)' : 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>
            {loading ? '—' : pendingSent.length}
          </div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Orders sent, not yet confirmed</div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Confirmed orders</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>
            {loading ? '—' : confirmed.length}
          </div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Bank confirmed on record</div>
        </Card>
      </div>

      {/* Tab filter */}
      <div style={{ marginBottom: 16 }}>
        <Tabs variant="pill" active={filter} onChange={setFilter} items={tabItems} />
      </div>

      {/* Audit log table */}
      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <EyebrowLabel>Recent orders</EyebrowLabel>
            <h3 style={{ marginTop: 8 }}>
              {activeDef?.label || 'All'} · {visibleOrders.length} order{visibleOrders.length !== 1 ? 's' : ''}
            </h3>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 12 }}>
            <ThinkingIndicator size={14} />
            <p className="caption" style={{ color: 'var(--fg-2)' }}>Loading order log…</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Order audit log">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                {['Time', 'Ref', 'Pair', 'Direction', 'Rate', 'Value date', 'Instrument', 'Sent by', 'Status'].map(h => (
                  <th key={h} scope="col" style={{
                    textAlign: 'left', padding: '12px 8px',
                    fontSize: 'var(--fs-eyebrow)', fontWeight: 700,
                    letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--snh-gold)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border-1)' }}>
                  <td className="mono" style={{ padding: '14px 8px', color: 'var(--fg-2)', fontSize: 'var(--fs-body-sm)' }}>
                    {formatOrderTime(row.sent_at)}
                  </td>
                  <td className="mono" style={{ padding: '14px 8px', color: 'var(--snh-slate)', fontSize: 'var(--fs-body-sm)' }}>
                    {orderRef(row)}
                  </td>
                  <td style={{ padding: '14px 8px' }}>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--snh-navy)' }}>
                      {row.currency_pair || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 8px', textTransform: 'uppercase', fontSize: 'var(--fs-body-sm)' }}>
                    {row.action || '—'}
                  </td>
                  {/* Rate: 4 decimal places, tabular numerals per Pixel spec */}
                  <td className="mono tabular" style={{ padding: '14px 8px' }}>
                    {row.limit_rate ? formatRate(row.limit_rate, 4) : '—'}
                  </td>
                  {/* Value date: DD Mon YYYY per Pixel spec */}
                  <td style={{ padding: '14px 8px', color: 'var(--fg-2)' }}>
                    {row.value_date ? formatDateMedium(row.value_date) : '—'}
                  </td>
                  <td style={{ padding: '14px 8px', color: 'var(--fg-2)', fontSize: 'var(--fs-body-sm)' }}>
                    {row.instrument || 'Forward'}
                  </td>
                  <td className="mono" style={{ padding: '14px 8px', color: 'var(--fg-2)', fontSize: 'var(--fs-body-sm)' }}>
                    {row.sent_by || '—'}
                  </td>
                  <td style={{ padding: '14px 8px' }}>
                    <StatusPill status={row.status || 'sent'} />
                  </td>
                </tr>
              ))}
              {visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--fg-2)', fontSize: 'var(--fs-body-sm)' }}>
                    No orders in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
