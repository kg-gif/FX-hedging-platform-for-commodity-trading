// Settings.jsx — Phase 2 rebuild screen
//
// DRAFT — PENDING PIXEL SIGN-OFF
// Scope for Phase 2: Counterparty risk threshold section (live, wired to
//   RiskSettingsContext). Remaining sections are clearly labelled placeholders
//   for Phase 3 real-data port.

import { useState } from 'react'
import { useRiskSettings } from '../../contexts/RiskSettingsContext'
import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon from '../ui/Icon'

const inputStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--fs-body-sm)',
  color: 'var(--snh-navy)',
  background: 'var(--snh-card)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-2)',
  padding: '8px 12px',
  width: 120,
  fontVariantNumeric: 'tabular-nums',
}

const labelStyle = {
  display: 'block',
  fontSize: 'var(--fs-eyebrow)',
  fontWeight: 'var(--fw-bold)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--snh-gold)',
  marginBottom: 6,
}

function PlaceholderSection({ title, note }) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <EyebrowLabel>{title}</EyebrowLabel>
        <span style={{
          fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--snh-warning)',
        }}>Phase 3</span>
      </div>
      <p className="caption" style={{ color: 'var(--fg-2)' }}>{note}</p>
    </Card>
  )
}

function CounterpartyRiskSection() {
  const { settings, updateSettings } = useRiskSettings()

  const [atRisk, setAtRisk]   = useState(String(settings.atRiskPct))
  const [warning, setWarning] = useState(String(settings.warningPct))
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  const validate = () => {
    const at = parseInt(atRisk, 10)
    const w  = parseInt(warning, 10)
    if (isNaN(at) || isNaN(w)) return 'Both values must be whole numbers.'
    if (at < 1 || at > 100)   return 'At-risk threshold must be between 1 and 100.'
    if (w < 1 || w > 100)     return 'Warning threshold must be between 1 and 100.'
    if (w >= at)               return 'Warning threshold must be lower than the at-risk threshold.'
    return ''
  }

  const handleSave = () => {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    updateSettings({ atRiskPct: parseInt(atRisk, 10), warningPct: parseInt(warning, 10) })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleReset = () => {
    setAtRisk('80')
    setWarning('60')
    setError('')
    updateSettings({ atRiskPct: 80, warningPct: 60 })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <EyebrowLabel style={{ marginBottom: 4 }}>Counterparty risk</EyebrowLabel>
      <h3 style={{ marginBottom: 4 }}>Utilisation thresholds</h3>
      <p style={{ color: 'var(--fg-2)', fontSize: 'var(--fs-body-sm)', marginBottom: 24 }}>
        Set the utilisation percentages at which a counterparty is flagged as Medium or High risk.
        These thresholds apply across the Counterparties screen — status pills, the at-risk KPI, and
        gauge colours all update when you save.
      </p>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <label htmlFor="risk-at-risk" style={labelStyle}>At-risk threshold (%)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="risk-at-risk"
              type="number"
              min="1"
              max="100"
              value={atRisk}
              onChange={e => { setAtRisk(e.target.value); setSaved(false) }}
              aria-describedby="risk-at-risk-hint"
              style={inputStyle}
            />
            <span id="risk-at-risk-hint" className="caption" style={{ color: 'var(--fg-2)' }}>
              At or above → <span style={{ color: 'var(--snh-warning)', fontWeight: 700 }}>High</span>
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="risk-warning" style={labelStyle}>Warning threshold (%)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="risk-warning"
              type="number"
              min="1"
              max="100"
              value={warning}
              onChange={e => { setWarning(e.target.value); setSaved(false) }}
              aria-describedby="risk-warning-hint"
              style={inputStyle}
            />
            <span id="risk-warning-hint" className="caption" style={{ color: 'var(--fg-2)' }}>
              At or above → <span style={{ color: 'var(--snh-navy)', fontWeight: 700 }}>Medium</span>
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--snh-danger)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-bold)', marginBottom: 16 }}>
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}

      {saved && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--snh-success)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-bold)', marginBottom: 16 }}>
          <Icon name="check" size={16} /> Thresholds saved. Counterparties screen updated.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="primary" onClick={handleSave}>Save thresholds</Button>
        <Button variant="ghost" onClick={handleReset}>Reset to defaults (80% / 60%)</Button>
      </div>
    </Card>
  )
}

export default function Settings() {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <EyebrowLabel>Treasury console</EyebrowLabel>
        <h2 style={{ marginTop: 8 }}>Settings</h2>
        <p className="caption" style={{ marginTop: 8, color: 'var(--fg-2)' }}>
          Company · policy · counterparty risk · bank details · notifications
        </p>
      </div>

      <CounterpartyRiskSection />

      <PlaceholderSection title="Company details" note="Company name, base currency, financial year end, registered address. Phase 3 — real-data port." />
      <PlaceholderSection title="Hedging policy" note="Policy target ratios, corridor widths, instrument preferences. Sources from the hedging_policies table. Phase 3." />
      <PlaceholderSection title="Bank details" note="Payment accounts, SWIFT/IBAN, settlement instructions. Phase 3." />
      <PlaceholderSection title="Notifications" note="Email alerts, execution confirmation toggle, breach notifications. Phase 3." />

      <Card style={{ marginBottom: 16, borderColor: 'var(--border-2)' }}>
        <EyebrowLabel style={{ marginBottom: 4 }}>Account</EyebrowLabel>
        <h3 style={{ marginBottom: 4 }}>Close account</h3>
        <p style={{ color: 'var(--fg-2)', fontSize: 'var(--fs-body-sm)', marginBottom: 16 }}>
          {/* TODO: Replace with Lex-approved production copy before this section goes live. */}
          Closing your account suspends access to the platform. Regulated records are retained
          in accordance with our legal obligations and cannot be erased on request.
          You may export your data at any time before closing.{' '}
          <span style={{ color: 'var(--snh-warning)', fontWeight: 700 }}>
            [Lex copy pending — do not ship externally]
          </span>
        </p>
        <Button variant="ghost">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--snh-danger)' }}>
            <Icon name="x-circle" size={16} /> Close account
          </span>
        </Button>
      </Card>
    </>
  )
}
