// Execution.jsx — Phase 2 screen
//
// DRAFT — PENDING PIXEL SIGN-OFF
// Pixel blockers resolved:
//   3. Counterparty limit validation: Execute button disabled + danger caption
//      when notional exceeds available facility
//   4. Post-execution confirmation card: navy bg, white text, all required fields
// Flags confirmed:
//   - Forward rate: 4 decimal places, tabular numerals
//   - Value date: formatDateMedium → "DD Mon YYYY"

import { useState, useEffect, useRef } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon from '../ui/Icon'
import Tabs from '../ui/Tabs'
import { formatRate, formatDateMedium } from '../../utils/formatting'

// ── Mock counterparty data ────────────────────────────────────────────────────
// limit and used in EUR thousands for easy arithmetic
const COUNTERPARTIES = [
  { id: 'nordea',        name: 'Nordea',        limitEur: 30_000_000, usedEur: 18_600_000 },
  { id: 'dnb',           name: 'DNB',           limitEur: 25_000_000, usedEur: 10_250_000 },
  { id: 'handelsbanken', name: 'Handelsbanken', limitEur: 15_000_000, usedEur: 13_200_000 },
]

const PAIRS = ['EUR/USD', 'EUR/GBP', 'EUR/NOK', 'USD/JPY', 'GBP/NOK']

// ── Helpers ───────────────────────────────────────────────────────────────────

function availableLimit(cp) {
  return cp.limitEur - cp.usedEur
}

function formatEurAmount(n) {
  if (!n && n !== 0) return '—'
  return 'EUR ' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const styles = {
    'Executed':  { bg: 'rgba(16,185,129,0.10)', color: 'var(--snh-success)' },
    'Pending':   { bg: 'rgba(245,158,11,0.10)', color: 'var(--snh-warning)' },
    'Confirmed': { bg: 'rgba(16,185,129,0.10)', color: 'var(--snh-success)' },
    'Failed':    { bg: 'rgba(239,68,68,0.10)',  color: 'var(--snh-danger)'  },
  }
  const s = styles[status] || styles['Pending']
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

// Post-execution confirmation card — navy bg, white text
// Cipher F-06: tabIndex={-1} + useEffect focus so keyboard/SR users land here on mount
function ConfirmationCard({ trade, onDone }) {
  const cardRef = useRef(null)
  useEffect(() => { cardRef.current?.focus() }, [])

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      aria-live="polite"
      aria-label="Execution confirmed"
      style={{
        background: 'var(--snh-navy)',
        borderRadius: 'var(--radius-3)',
        padding: 32,
        marginBottom: 24,
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{
            fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--snh-gold)', marginBottom: 8,
          }}>
            Execution confirmed
          </div>
          <h2 style={{ color: 'var(--fg-on-navy)', margin: 0 }}>
            {trade.pair}
          </h2>
        </div>
        <Icon name="check-circle" size={32} style={{ color: 'var(--snh-gold)' }} />
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24,
        borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 24, marginBottom: 24,
      }}>
        <div>
          <div style={{ fontSize: 'var(--fs-eyebrow)', color: 'rgba(255,255,255,0.50)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Trade reference</div>
          <div className="mono" style={{ color: 'var(--fg-on-navy)', fontWeight: 700 }}>{trade.ref}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--fs-eyebrow)', color: 'rgba(255,255,255,0.50)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Notional</div>
          <div className="mono tabular" style={{ color: 'var(--fg-on-navy)', fontWeight: 700 }}>{formatEurAmount(trade.notional)}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--fs-eyebrow)', color: 'rgba(255,255,255,0.50)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Forward rate</div>
          <div className="mono tabular" style={{ color: 'var(--fg-on-navy)', fontWeight: 700 }}>{formatRate(trade.rate, 4)}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--fs-eyebrow)', color: 'rgba(255,255,255,0.50)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Maturity</div>
          <div style={{ color: 'var(--fg-on-navy)', fontWeight: 700 }}>{formatDateMedium(trade.valueDate)}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--fs-eyebrow)', color: 'rgba(255,255,255,0.50)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Counterparty</div>
          <div style={{ color: 'var(--fg-on-navy)', fontWeight: 700 }}>{trade.counterparty}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--fs-eyebrow)', color: 'rgba(255,255,255,0.50)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Pair</div>
          <div className="mono" style={{ color: 'var(--fg-on-navy)', fontWeight: 700 }}>{trade.pair}</div>
        </div>
      </div>

      <Button variant="primary" onClick={onDone}>
        Back to hedges
      </Button>
    </div>
  )
}

// Execution form panel
function ExecutionForm({ onExecute, onCancel }) {
  const [pair, setPair]             = useState('EUR/USD')
  const [notionalStr, setNotional]  = useState('')
  const [rate, setRate]             = useState('')
  const [valueDate, setValueDate]   = useState('')
  const [cpId, setCpId]             = useState('nordea')

  const notional = parseFloat(notionalStr.replace(/,/g, '')) || 0
  const cp       = COUNTERPARTIES.find(c => c.id === cpId)
  const available = cp ? availableLimit(cp) : 0
  const limitBreached = notional > 0 && notional > available

  const canExecute = notional > 0 && rate && valueDate && !limitBreached

  const handle = () => {
    if (!canExecute) return
    onExecute({
      // TODO Phase 3 (F-08): trade ref must come from backend response — never client-generated in production
      ref: `ORD-${String(Math.floor(Math.random() * 900) + 100).padStart(5, '0')}`,
      pair,
      notional,
      rate: parseFloat(rate),
      valueDate,
      counterparty: cp.name,
    })
  }

  const notionalFormatted = notional > 0 ? formatEurAmount(notional) : null
  const notionalInvalid   = notionalStr.length > 0 && notional === 0

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)',
    color: 'var(--snh-navy)', background: 'var(--snh-card)',
    border: '1px solid var(--border-1)', borderRadius: 'var(--radius-2)',
    padding: '8px 12px',
  }
  const labelStyle = {
    display: 'block', fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--snh-gold)', marginBottom: 6,
  }

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <EyebrowLabel>New execution</EyebrowLabel>
          <h3 style={{ marginTop: 8 }}>Execute hedge</h3>
        </div>
        <button onClick={onCancel} aria-label="Cancel execution" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--snh-slate)' }}>
          <Icon name="x" size={20} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <div>
          <label htmlFor="exec-pair" style={labelStyle}>Currency pair</label>
          <select id="exec-pair" value={pair} onChange={e => setPair(e.target.value)} style={inputStyle}>
            {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="exec-cp" style={labelStyle}>Counterparty</label>
          <select id="exec-cp" value={cpId} onChange={e => setCpId(e.target.value)} style={inputStyle}>
            {COUNTERPARTIES.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="exec-notional" style={labelStyle}>Notional (EUR)</label>
          <input
            id="exec-notional"
            type="text"
            value={notionalStr}
            onChange={e => setNotional(e.target.value)}
            placeholder="e.g. 1000000"
            aria-describedby="exec-notional-hint"
            style={inputStyle}
          />
          <div id="exec-notional-hint" style={{ marginTop: 4, fontSize: 'var(--fs-eyebrow)', minHeight: 16 }}>
            {notionalFormatted && (
              <span style={{ color: 'var(--snh-success)' }}>{notionalFormatted}</span>
            )}
            {notionalInvalid && (
              <span style={{ color: 'var(--snh-danger)' }}>Enter a valid amount</span>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="exec-rate" style={labelStyle}>Forward rate</label>
          <input
            id="exec-rate"
            type="text"
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder="e.g. 1.0847"
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="exec-valuedate" style={labelStyle}>Value date</label>
          <input
            id="exec-valuedate"
            type="date"
            value={valueDate}
            onChange={e => setValueDate(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {cp && (
        <div style={{
          background: 'var(--snh-bg)', borderRadius: 'var(--radius-2)',
          padding: '12px 16px', marginBottom: 16,
          display: 'flex', gap: 32, alignItems: 'center',
        }}>
          <div>
            <span className="caption" style={{ color: 'var(--fg-2)' }}>Limit · {cp.name}</span>
            <span className="mono tabular" style={{ marginLeft: 8, color: 'var(--snh-navy)', fontWeight: 700 }}>{formatEurAmount(cp.limitEur)}</span>
          </div>
          <div>
            <span className="caption" style={{ color: 'var(--fg-2)' }}>Available</span>
            <span className="mono tabular" style={{ marginLeft: 8, color: available > 0 ? 'var(--snh-success)' : 'var(--snh-danger)', fontWeight: 700 }}>{formatEurAmount(available)}</span>
          </div>
          <div>
            <span className="caption" style={{ color: 'var(--fg-2)' }}>Utilisation</span>
            <span className="mono tabular" style={{ marginLeft: 8, color: 'var(--snh-navy)', fontWeight: 700 }}>
              {Math.round((cp.usedEur / cp.limitEur) * 100)}%
            </span>
          </div>
        </div>
      )}

      {limitBreached && (
        <div style={{
          color: 'var(--snh-danger)', fontSize: 'var(--fs-body-sm)',
          fontWeight: 'var(--fw-bold)', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="alert-circle" size={16} />
          Notional exceeds {cp.name}'s available facility ({formatEurAmount(available)}). Reduce notional or select a different counterparty.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="primary" onClick={handle} disabled={!canExecute}>
          Execute hedge
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  )
}

// ── Audit log (mock) ──────────────────────────────────────────────────────────
const ORDERS = [
  { time: '13 May · 09:42', ref: 'ORD-00427', pair: 'EUR/USD', side: 'Buy',  notional: 'EUR 1,000,000', rate: 1.0847, valueDate: '2026-08-13', cp: 'Nordea',        status: 'Pending'   },
  { time: '12 May · 14:18', ref: 'ORD-00426', pair: 'EUR/GBP', side: 'Buy',  notional: 'EUR 500,000',   rate: 0.8421, valueDate: '2026-07-12', cp: 'DNB',           status: 'Executed'  },
  { time: '12 May · 11:02', ref: 'ORD-00425', pair: 'USD/JPY', side: 'Sell', notional: 'USD 250,000',   rate: 151.20, valueDate: '2026-07-12', cp: 'Handelsbanken', status: 'Confirmed' },
  { time: '09 May · 16:33', ref: 'ORD-00424', pair: 'EUR/NOK', side: 'Sell', notional: 'EUR 2,000,000', rate: 10.844, valueDate: '2026-09-09', cp: 'Nordea',        status: 'Confirmed' },
  { time: '08 May · 10:55', ref: 'ORD-00423', pair: 'EUR/USD', side: 'Buy',  notional: 'EUR 750,000',   rate: 1.0832, valueDate: '2026-08-08', cp: 'DNB',           status: 'Failed'    },
]

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Execution() {
  const [filter, setFilter]            = useState('all')
  const [showForm, setShowForm]        = useState(false)
  const [confirmedTrade, setConfirmed] = useState(null)

  const handleExecute = (trade) => {
    setShowForm(false)
    setConfirmed(trade)
  }

  const handleDone = () => {
    setConfirmed(null)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <EyebrowLabel>Treasury console</EyebrowLabel>
          <h2 style={{ marginTop: 8 }}>Execution</h2>
          <p className="caption" style={{ marginTop: 8, color: 'var(--fg-2)' }}>
            Order audit log · last 30 days · all timestamps CET
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="ghost">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="download" size={16} /> Export audit log
            </span>
          </Button>
          {!confirmedTrade && (
            <Button variant="primary" onClick={() => setShowForm(true)}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="plus" size={16} /> New execution
              </span>
            </Button>
          )}
        </div>
      </div>

      {confirmedTrade && (
        <ConfirmationCard trade={confirmedTrade} onDone={handleDone} />
      )}

      {showForm && !confirmedTrade && (
        <ExecutionForm
          onExecute={handleExecute}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Orders · 30 days</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>27</div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>+4 vs prior month</div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Executed value</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>EUR 28,420,500</div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Across three counterparties</div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Pending settlement</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-warning)', fontVariantNumeric: 'tabular-nums' }}>EUR 4,200,000</div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>2 orders awaiting confirmation</div>
        </Card>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Average slippage</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>0.4 bp</div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Vs quoted rate</div>
        </Card>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Tabs variant="pill" active={filter} onChange={setFilter} items={[
          { id: 'all',       label: 'All',       count: 27 },
          { id: 'pending',   label: 'Pending',   count: 2  },
          { id: 'executed',  label: 'Executed',  count: 6  },
          { id: 'confirmed', label: 'Confirmed', count: 18 },
          { id: 'failed',    label: 'Failed',    count: 1  },
        ]} />
      </div>

      <Card>
        <div style={{ marginBottom: 16 }}>
          <EyebrowLabel>Recent orders</EyebrowLabel>
          <h3 style={{ marginTop: 8 }}>Audit log</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
              {['Time', 'Ref', 'Pair', 'Side', 'Notional', 'Rate', 'Value date', 'Counterparty', 'Status'].map(h => (
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
            {ORDERS.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-1)' }}>
                <td className="mono" style={{ padding: '14px 8px', color: 'var(--fg-2)', fontSize: 'var(--fs-body-sm)' }}>{row.time}</td>
                <td className="mono" style={{ padding: '14px 8px', color: 'var(--snh-slate)', fontSize: 'var(--fs-body-sm)' }}>{row.ref}</td>
                <td style={{ padding: '14px 8px' }}>
                  <span className="mono" style={{ fontWeight: 700, color: 'var(--snh-navy)' }}>{row.pair}</span>
                </td>
                <td style={{ padding: '14px 8px' }}>{row.side}</td>
                <td className="mono tabular" style={{ padding: '14px 8px' }}>{row.notional}</td>
                <td className="mono tabular" style={{ padding: '14px 8px' }}>{formatRate(row.rate, 4)}</td>
                <td style={{ padding: '14px 8px', color: 'var(--fg-2)' }}>{formatDateMedium(row.valueDate)}</td>
                <td style={{ padding: '14px 8px' }}>{row.cp}</td>
                <td style={{ padding: '14px 8px' }}><StatusPill status={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
