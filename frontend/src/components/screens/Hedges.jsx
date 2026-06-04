// Hedges.jsx — Phase 2 screen
//
// DRAFT — PENDING PIXEL SIGN-OFF
// Pixel blockers resolved:
//   1. ThinkingIndicator used for load state (not a spinner)
//   2. formatDateMedium wired for all maturity dates ("6 Aug 2026" format)
// Flags confirmed:
//   - Intent dropdown: four options in correct case
//   - Tab count badges: className="tabular" (tabular-nums via design-system CSS)

import { useState, useEffect } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon from '../ui/Icon'
import Tabs from '../ui/Tabs'
import ThinkingIndicator from '../ui/ThinkingIndicator'
import FanChart from '../ui/charts/FanChart'
import { formatDateMedium, formatRate } from '../../utils/formatting'

// ── Mock data ─────────────────────────────────────────────────────────────────
// Dates stored as ISO strings — rendered via formatDateMedium
const POSITIONS = [
  { ref: 'TRN-00112', pair: 'EUR/USD', notional: 'EUR 4,200,000',  rate: 1.0815, maturity: '2026-06-22', cover: '50%',  pnl: '+ EUR 12,400', pnlDir: 'up',   status: 'On track', intent: 'Plan to hedge with forward' },
  { ref: 'TRN-00111', pair: 'EUR/GBP', notional: 'EUR 3,000,000',  rate: 0.8480, maturity: '2026-07-14', cover: '92%',  pnl: '+ EUR 18,200', pnlDir: 'up',   status: 'On track', intent: 'Plan to hedge with forward' },
  { ref: 'TRN-00110', pair: 'USD/JPY', notional: 'USD 500,000',    rate: 148.20, maturity: '2026-07-28', cover: '12%',  pnl: '− EUR 8,910',  pnlDir: 'down', status: 'Breach',   intent: 'Not yet decided'            },
  { ref: 'TRN-00109', pair: 'EUR/USD', notional: 'EUR 2,000,000',  rate: 1.0790, maturity: '2026-06-22', cover: '60%',  pnl: '+ EUR 4,500',  pnlDir: 'up',   status: 'Elevated', intent: 'Will buy spot'               },
]

const INTENT_OPTIONS = [
  'Not yet decided',
  'Will buy spot',
  'Plan to hedge with forward',
  'Urgent',
]

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const styles = {
    'On track': { bg: 'rgba(16,185,129,0.10)', color: 'var(--snh-success)' },
    'Elevated': { bg: 'rgba(245,158,11,0.10)', color: 'var(--snh-warning)' },
    'Breach':   { bg: 'rgba(239,68,68,0.10)',  color: 'var(--snh-danger)'  },
  }
  const s = styles[status] || styles['On track']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 'var(--radius-pill)',
      background: s.bg, color: s.color,
      fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {status}
    </span>
  )
}

// Cipher F-05: ariaLabel prop gives each row's select a unique accessible name
function IntentSelect({ value, onChange, ariaLabel }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--fs-body-sm)',
        color: 'var(--snh-navy)',
        background: 'var(--snh-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-2)',
        padding: '4px 8px',
        cursor: 'pointer',
        minWidth: 180,
      }}
    >
      {INTENT_OPTIONS.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <Card>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '48px 0', gap: 16,
      }}>
        <ThinkingIndicator size={14} />
        <p className="caption" style={{ color: 'var(--fg-2)', marginTop: 8 }}>
          Loading positions…
        </p>
      </div>
    </Card>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Hedges() {
  const [filter, setFilter]   = useState('requires-action')
  const [loading, setLoading] = useState(true)
  const [intents, setIntents] = useState(
    Object.fromEntries(POSITIONS.map(p => [p.ref, p.intent]))
  )

  // Simulate async data fetch
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1400)
    return () => clearTimeout(t)
  }, [])

  const updateIntent = (ref, val) =>
    setIntents(prev => ({ ...prev, [ref]: val }))

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <EyebrowLabel>Treasury console</EyebrowLabel>
          <h2 style={{ marginTop: 8 }}>Hedges</h2>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="caption" style={{ color: 'var(--fg-2)' }}>
              9 active hedges · EUR 21,633,500 covered · 3 recommendations
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="ghost">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="download" size={16} /> Export plan
            </span>
          </Button>
          <Button variant="primary">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="plus" size={16} /> New hedge
            </span>
          </Button>
        </div>
      </div>

      {/* Sub-filter */}
      <div style={{ marginBottom: 16 }}>
        <Tabs variant="pill" active={filter} onChange={setFilter} items={[
          { id: 'requires-action', label: 'Requires action', count: 3  },
          { id: 'in-progress',     label: 'In progress',     count: 6  },
          { id: 'hedged',          label: 'Hedged',          count: 12 },
          { id: 'settled',         label: 'Settled',         count: 8  },
          { id: 'forecast',        label: 'Forecast',        count: 3  },
        ]} />
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Total hedged</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>EUR 21,633,500</div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Across three pairs</div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Average cover</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-gold)', fontVariantNumeric: 'tabular-nums' }}>68%</div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Vs policy target 75%</div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Maturing · 30 days</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>EUR 4,200,000</div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Two settlements due</div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Locked P&L</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-success)', fontVariantNumeric: 'tabular-nums' }}>+ EUR 67,800</div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Crystallised from executed hedges</div>
        </Card>
      </div>

      {/* Fan chart */}
      <Card eyebrow="Forward rate context" title="EUR/USD · top recommendation" style={{ marginBottom: 16 }}>
        <FanChart pair="EUR/USD" spot={1.0847} budget={1.0700} forwardTo={1.0900} days={90} />
      </Card>

      {/* Positions table — ThinkingIndicator during load */}
      {loading ? (
        <LoadingState />
      ) : (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <EyebrowLabel>Active hedges</EyebrowLabel>
              <h3 style={{ marginTop: 8 }}>9 open positions</h3>
            </div>
            <button style={{
              background: 'transparent', border: 'none', color: 'var(--snh-navy)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-bold)',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              View audit log <Icon name="arrow-right" size={14} />
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                {['Ref', 'Pair', 'Notional', 'Rate', 'Maturity', 'Cover', 'P&L', 'Intent', 'Status'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '12px 8px',
                    fontSize: 'var(--fs-eyebrow)', fontWeight: 700,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: 'var(--snh-gold)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POSITIONS.map((row) => (
                <tr key={row.ref} style={{ borderBottom: '1px solid var(--border-1)' }}>
                  <td className="mono" style={{ padding: '14px 8px', color: 'var(--snh-slate)', fontSize: 'var(--fs-body-sm)' }}>{row.ref}</td>
                  <td style={{ padding: '14px 8px' }}>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--snh-navy)' }}>{row.pair}</span>
                  </td>
                  <td className="mono tabular" style={{ padding: '14px 8px' }}>{row.notional}</td>
                  <td className="mono tabular" style={{ padding: '14px 8px' }}>{formatRate(row.rate, 4)}</td>
                  <td style={{ padding: '14px 8px', color: 'var(--fg-2)' }}>{formatDateMedium(row.maturity)}</td>
                  <td className="mono tabular" style={{ padding: '14px 8px' }}>{row.cover}</td>
                  <td className="mono tabular" style={{
                    padding: '14px 8px',
                    color: row.pnlDir === 'up' ? 'var(--snh-success)' : 'var(--snh-danger)',
                  }}>{row.pnl}</td>
                  <td style={{ padding: '14px 8px' }}>
                    <IntentSelect
                      value={intents[row.ref]}
                      onChange={val => updateIntent(row.ref, val)}
                      ariaLabel={`Intent for ${row.ref}`}
                    />
                  </td>
                  <td style={{ padding: '14px 8px' }}><StatusPill status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
