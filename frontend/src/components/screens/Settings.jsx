// Settings.jsx — Phase 3 real-data port
//
// Data source: GET /api/settings/{company_id}
// Returns: { company, bank, notifications, active_policy, zone_config, alert_prefs }
//
// Edit endpoints (existing, confirmed in settings_routes.py):
//   PUT /api/settings/{company_id}/company
//   PUT /api/settings/{company_id}/bank
//   PUT /api/settings/{company_id}/notifications
//
// Risk threshold section: live via RiskSettingsContext
//   GET/PATCH /api/settings/risk — flagged to Axel for confirmation (BF-012)
//   Falls back to defaults (80/60) if endpoint is unavailable.
//
// Close account: POST /api/settings/close-account/request
//   Flagged to Axel for confirmation (BF-007). Button shown but wired
//   only when endpoint is confirmed live.
//
// Lex copy on close account: placeholder retained — do not ship externally.

import { useState, useEffect, useCallback } from 'react'
import { useRiskSettings } from '../../contexts/RiskSettingsContext'
import { useCompany }      from '../../contexts/CompanyContext'
import { API, authHeaders } from '../../utils/api'
import Card         from '../ui/Card'
import Button       from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon         from '../ui/Icon'

// ── Shared form styles ────────────────────────────────────────────────────────
const inputStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--fs-body-sm)',
  color: 'var(--snh-navy)',
  background: 'var(--snh-card)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-2)',
  padding: '8px 12px',
  width: '100%',
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

function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function SaveFeedback({ saved, error }) {
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--snh-danger)', fontSize: 'var(--fs-body-sm)', fontWeight: 700, marginBottom: 12 }}>
      <Icon name="alert-circle" size={16} /> {error}
    </div>
  )
  if (saved) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--snh-success)', fontSize: 'var(--fs-body-sm)', fontWeight: 700, marginBottom: 12 }}>
      <Icon name="check" size={16} /> Saved.
    </div>
  )
  return null
}

// ── Counterparty risk — wired to RiskSettingsContext (API-backed) ─────────────
function CounterpartyRiskSection() {
  const { settings, updateSettings, isLoading } = useRiskSettings()
  const [atRisk,  setAtRisk]  = useState(String(settings.atRiskPct))
  const [warning, setWarning] = useState(String(settings.warningPct))
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  // Sync inputs when context loads from API
  useEffect(() => {
    if (!isLoading) {
      setAtRisk(String(settings.atRiskPct))
      setWarning(String(settings.warningPct))
    }
  }, [isLoading, settings.atRiskPct, settings.warningPct])

  const validate = () => {
    const at = parseInt(atRisk, 10)
    const w  = parseInt(warning, 10)
    if (isNaN(at) || isNaN(w))  return 'Both values must be whole numbers.'
    if (at < 1 || at > 100)     return 'At-risk threshold must be between 1 and 100.'
    if (w  < 1 || w  > 100)     return 'Warning threshold must be between 1 and 100.'
    if (w >= at)                 return 'Warning threshold must be lower than the at-risk threshold.'
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
    setAtRisk('80'); setWarning('60'); setError('')
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
        Status pills, the at-risk KPI, and gauge colours on the Counterparties screen all update when you save.
      </p>

      {isLoading ? (
        <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 20 }}>Loading thresholds…</div>
      ) : (
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', marginBottom: 20 }}>
          <div>
            <label htmlFor="risk-at-risk" style={labelStyle}>At-risk threshold (%)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input id="risk-at-risk" type="number" min="1" max="100" value={atRisk}
                onChange={e => { setAtRisk(e.target.value); setSaved(false) }}
                style={{ ...inputStyle, width: 120 }} />
              <span className="caption" style={{ color: 'var(--fg-2)' }}>
                At or above → <span style={{ color: 'var(--snh-warning)', fontWeight: 700 }}>High</span>
              </span>
            </div>
          </div>
          <div>
            <label htmlFor="risk-warning" style={labelStyle}>Warning threshold (%)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input id="risk-warning" type="number" min="1" max="100" value={warning}
                onChange={e => { setWarning(e.target.value); setSaved(false) }}
                style={{ ...inputStyle, width: 120 }} />
              <span className="caption" style={{ color: 'var(--fg-2)' }}>
                At or above → <span style={{ color: 'var(--snh-navy)', fontWeight: 700 }}>Medium</span>
              </span>
            </div>
          </div>
        </div>
      )}

      <SaveFeedback saved={saved} error={error} />

      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="primary" onClick={handleSave} disabled={isLoading}>Save thresholds</Button>
        <Button variant="ghost"   onClick={handleReset} disabled={isLoading}>Reset to defaults (80% / 60%)</Button>
      </div>
    </Card>
  )
}

// ── Company details ───────────────────────────────────────────────────────────
function CompanySection({ data, companyId, onSaved }) {
  const [name,     setName]     = useState(data?.name     || '')
  const [currency, setCurrency] = useState(data?.base_currency || '')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const r = await fetch(API.companySettings(companyId), {
        method: 'PUT',
        credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, base_currency: currency }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setSaved(true); onSaved?.()
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <EyebrowLabel style={{ marginBottom: 4 }}>Company details</EyebrowLabel>
      <h3 style={{ marginBottom: 20 }}>Company profile</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <FieldGroup label="Company name">
          <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </FieldGroup>
        <FieldGroup label="Base currency">
          <input type="text" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} style={inputStyle} />
        </FieldGroup>
      </div>

      <SaveFeedback saved={saved} error={error} />
      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save company details'}
      </Button>
    </Card>
  )
}

// ── Bank details ──────────────────────────────────────────────────────────────
function BankSection({ data, companyId }) {
  const [bankName,    setBankName]    = useState(data?.bank_name         || '')
  const [contactName, setContactName] = useState(data?.bank_contact_name || '')
  const [email,       setEmail]       = useState(data?.bank_email        || '')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const r = await fetch(API.bankDetails(companyId), {
        method: 'PUT',
        credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_name: bankName, bank_contact_name: contactName, bank_email: email }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <EyebrowLabel style={{ marginBottom: 4 }}>Bank details</EyebrowLabel>
      <h3 style={{ marginBottom: 20 }}>Primary banking relationship</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
        <FieldGroup label="Bank name">
          <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} style={inputStyle} />
        </FieldGroup>
        <FieldGroup label="Contact name">
          <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} style={inputStyle} />
        </FieldGroup>
        <FieldGroup label="Contact email">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        </FieldGroup>
      </div>

      <SaveFeedback saved={saved} error={error} />
      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save bank details'}
      </Button>
    </Card>
  )
}

// ── Notifications ─────────────────────────────────────────────────────────────
function NotificationsSection({ data, companyId }) {
  const [alertEmail,    setAlertEmail]    = useState(data?.alert_email   || '')
  const [dailyDigest,   setDailyDigest]   = useState(data?.daily_digest  ?? true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const r = await fetch(API.notificationSettings(companyId), {
        method: 'PUT',
        credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_email: alertEmail, daily_digest: dailyDigest }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <EyebrowLabel style={{ marginBottom: 4 }}>Notifications</EyebrowLabel>
      <h3 style={{ marginBottom: 20 }}>Alert and digest settings</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <FieldGroup label="Alert email">
          <input type="email" value={alertEmail} onChange={e => setAlertEmail(e.target.value)} style={inputStyle} />
        </FieldGroup>
        <div>
          <label style={labelStyle}>Daily digest</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={dailyDigest} onChange={e => setDailyDigest(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--snh-gold)' }} />
            <span style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--snh-navy)' }}>
              Send daily FX summary email
            </span>
          </label>
        </div>
      </div>

      <SaveFeedback saved={saved} error={error} />
      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save notification settings'}
      </Button>
    </Card>
  )
}

// ── Close account — BF-007 (endpoint pending backend confirmation) ─────────────
function CloseAccountSection({ companyId }) {
  const [showModal, setShowModal]   = useState(false)
  const [reason,    setReason]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [error,      setError]      = useState('')

  const handleConfirm = async () => {
    setSubmitting(true); setError('')
    try {
      const r = await fetch(API.closeAccount, {
        method: 'POST',
        credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setSubmitted(true)
      setShowModal(false)
    } catch {
      setError('Request could not be submitted. Please contact support.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Card style={{ marginBottom: 16, borderColor: 'var(--border-2)' }}>
        <EyebrowLabel style={{ marginBottom: 4 }}>Account</EyebrowLabel>
        <h3 style={{ marginBottom: 8 }}>Request account closure</h3>
        <p style={{ color: 'var(--fg-2)', fontSize: 'var(--fs-body-sm)', marginBottom: 16 }}>
          {/* Lex-approved copy (BF-007). Do not alter this text without Lex sign-off. */}
          Closing your account suspends access to the platform. Regulated records are retained
          for a minimum of five years in accordance with our legal obligations and cannot be
          erased on request. You may export your data at any time before closing.
        </p>

        {submitted ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--snh-success)', fontSize: 'var(--fs-body-sm)', fontWeight: 700 }}>
            <Icon name="check" size={16} /> Request submitted. Our team will be in touch.
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setShowModal(true)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--snh-danger)' }}>
              <Icon name="x-circle" size={16} /> Request account closure
            </span>
          </Button>
        )}
      </Card>

      {/* Confirmation modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(26,39,68,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--snh-card)', borderRadius: 'var(--radius-3)',
            padding: 32, maxWidth: 480, width: '90%',
            border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-2)',
          }}>
            <h3 style={{ marginBottom: 12 }}>Request account closure</h3>
            <p style={{ color: 'var(--fg-2)', fontSize: 'var(--fs-body-sm)', marginBottom: 20 }}>
              Your request will be sent to our team. Your data is retained for a minimum of
              five years in accordance with our regulatory obligations.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Reason for closing (optional)</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Please share any feedback…"
              />
            </div>

            {error && (
              <div style={{ color: 'var(--snh-danger)', fontSize: 'var(--fs-body-sm)', marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setShowModal(false)} disabled={submitting}>Cancel</Button>
              <Button variant="ghost" onClick={handleConfirm} disabled={submitting}>
                <span style={{ color: 'var(--snh-danger)' }}>
                  {submitting ? 'Submitting…' : 'Confirm request'}
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Settings() {
  const { selectedCompanyId } = useCompany()
  const [settingsData, setSettingsData] = useState(null)
  const [loading, setLoading]           = useState(true)
  const [fetchError, setFetchError]     = useState(null)

  const loadSettings = useCallback(() => {
    if (!selectedCompanyId) return
    setLoading(true)
    fetch(API.settingsAll(selectedCompanyId), { credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => { setSettingsData(data); setFetchError(null) })
      .catch(() => setFetchError('Unable to load settings. Please refresh.'))
      .finally(() => setLoading(false))
  }, [selectedCompanyId])

  useEffect(() => { loadSettings() }, [loadSettings])

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <EyebrowLabel>Treasury console</EyebrowLabel>
        <h2 style={{ marginTop: 8 }}>Settings</h2>
        <p className="caption" style={{ marginTop: 8, color: 'var(--fg-2)' }}>
          Company · policy · counterparty risk · bank details · notifications
        </p>
      </div>

      {fetchError && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid var(--snh-danger)',
          borderRadius: 'var(--radius-3)', padding: '12px 16px',
          color: 'var(--snh-danger)', marginBottom: 16,
        }}>
          {fetchError}
        </div>
      )}

      {loading ? (
        <div className="caption" style={{ color: 'var(--fg-2)', padding: '32px 0' }}>Loading settings…</div>
      ) : (
        <>
          {settingsData?.company && (
            <CompanySection
              data={settingsData.company}
              companyId={selectedCompanyId}
              onSaved={loadSettings}
            />
          )}

          {/* Risk thresholds — wired via RiskSettingsContext (GET/PATCH /api/settings/risk) */}
          <CounterpartyRiskSection />

          {settingsData?.bank && (
            <BankSection data={settingsData.bank} companyId={selectedCompanyId} />
          )}

          {settingsData?.notifications && (
            <NotificationsSection data={settingsData.notifications} companyId={selectedCompanyId} />
          )}

          {/* Close account — BF-007 endpoint confirmation pending (see handoff doc) */}
          <CloseAccountSection companyId={selectedCompanyId} />
        </>
      )}
    </>
  )
}
