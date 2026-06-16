// Counterparties.jsx — Phase 3 real-data port
//
// Endpoint: GET /api/facilities/utilisation/{company_id}
// Response: { facilities: [{id, bank_name, facility_limit_eur, utilised_eur,
//             available_eur, utilisation_pct, status, contact_email, contact_name}],
//             total_limit_eur, total_utilised_eur, total_available_eur }
//
// "Request limit review" follows Lex Impl-1: mailto: only — SNH never sends directly.
//
// Status (Low/Medium/High) is derived at render time from RiskSettingsContext,
// using the company's configured thresholds, not the backend `status` field.
// RiskSettingsContext.isLoading is exposed but not consumed here — the screen
// renders with threshold defaults until the fetch resolves (imperceptible lag).

import { useState, useEffect } from 'react'
import { useRiskSettings }  from '../../contexts/RiskSettingsContext'
import { useCompany }       from '../../contexts/CompanyContext'
import { API, authHeaders } from '../../utils/api'
import { formatEUR, formatDate } from '../../utils/formatting'
import Card         from '../ui/Card'
import Button       from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon         from '../ui/Icon'
import CoverageGauge from '../ui/charts/CoverageGauge'

// ── Status pill — colours driven by risk state, not decoration ────────────────
function StatusPill({ status }) {
  const styles = {
    'Low':    { bg: 'rgba(16,185,129,0.10)',  color: 'var(--snh-success)' },
    'Medium': { bg: 'rgba(141,164,196,0.18)', color: 'var(--snh-navy)'   },
    'High':   { bg: 'rgba(245,158,11,0.10)',  color: 'var(--snh-warning)' },
  }
  const s = styles[status] || styles['Medium']
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

// ── Counterparty card ─────────────────────────────────────────────────────────
function CounterpartyCard({ facility, status, atRiskPct }) {
  const utilisationPct = Math.round(facility.utilisation_pct)

  // Gauge colour — warning at atRiskPct threshold, danger at 100%
  const gaugeColour = utilisationPct >= 100
    ? 'var(--snh-danger)'
    : utilisationPct >= atRiskPct
    ? 'var(--snh-warning)'
    : 'var(--snh-success)'

  // "Request limit review" — Lex Impl-1: mailto: only, no server send
  function handleRequestReview() {
    const subject = encodeURIComponent(`Limit review request — ${facility.bank_name}`)
    const body = encodeURIComponent(
      `Dear ${facility.contact_name || 'Treasury team'},\n\n` +
      `We would like to request a review of our credit facility limit with ${facility.bank_name}.\n\n` +
      `Current limit: ${formatEUR(facility.facility_limit_eur)}\n` +
      `Current utilisation: ${utilisationPct}%\n\n` +
      `Please contact us to discuss.\n\nKind regards`
    )
    window.location.href = `mailto:${facility.contact_email}?subject=${subject}&body=${body}`
  }

  return (
    <div style={{
      background: 'var(--snh-card)',
      border: `1px solid ${status === 'High' ? 'var(--snh-warning)' : 'var(--border-1)'}`,
      borderRadius: 'var(--radius-3)',
      boxShadow: 'var(--shadow-1)',
      padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3>{facility.bank_name}</h3>
          {facility.contact_name && (
            <p className="caption" style={{ marginTop: 2, color: 'var(--fg-2)' }}>{facility.contact_name}</p>
          )}
          <p className="caption" style={{ marginTop: 2, color: 'var(--fg-2)' }}>{facility.contact_email}</p>
        </div>
        <StatusPill status={status} />
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <div style={{ flex: '0 0 160px' }}>
          <CoverageGauge
            value={utilisationPct}
            label="Limit utilisation"
            caption={`${formatEUR(facility.utilised_eur)} of ${formatEUR(facility.facility_limit_eur)}`}
            colour={gaugeColour}
          />
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 16 }}>
          <div>
            <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 4 }}>Limit</div>
            <div className="mono tabular" style={{ fontSize: 'var(--fs-h4)', color: 'var(--snh-navy)' }}>
              {formatEUR(facility.facility_limit_eur)}
            </div>
          </div>
          <div>
            <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 4 }}>Used</div>
            <div className="mono tabular" style={{ fontSize: 'var(--fs-h4)', color: 'var(--snh-navy)' }}>
              {formatEUR(facility.utilised_eur)}
            </div>
          </div>
          <div>
            <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 4 }}>Available</div>
            <div className="mono tabular" style={{ fontSize: 'var(--fs-h4)', color: 'var(--snh-success)' }}>
              {formatEUR(facility.available_eur)}
            </div>
          </div>
          <div>
            <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 4 }}>Open forwards</div>
            <div className="tabular" style={{ fontSize: 'var(--fs-h4)', color: 'var(--snh-navy)' }}>
              {facility.tranche_count ?? '—'}
            </div>
          </div>
          <div>
            <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 4 }}>Next maturity</div>
            <div style={{ fontSize: 'var(--fs-h4)', color: 'var(--snh-navy)' }}>
              {facility.next_maturity ? formatDate(facility.next_maturity) : '—'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Button variant="ghost" size="sm">View statements</Button>
        <Button variant="ghost" size="sm" onClick={handleRequestReview}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="mail" size={14} /> Request limit review
          </span>
        </Button>
      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          background: 'var(--snh-card)', border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius-3)', padding: 20, height: 160,
          opacity: 0.5,
        }} />
      ))}
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Counterparties() {
  const { settings, cpStatus } = useRiskSettings()
  const { atRiskPct } = settings
  const { selectedCompanyId } = useCompany()

  const [facilities, setFacilities]         = useState([])
  const [totals, setTotals]                 = useState(null)
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)

  useEffect(() => {
    if (!selectedCompanyId) return
    setLoading(true)
    setError(null)

    fetch(API.facilityUtilisation(selectedCompanyId), { credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setFacilities(data.facilities ?? [])
        setTotals({
          limit:     data.total_limit_eur,
          utilised:  data.total_utilised_eur,
          available: data.total_available_eur,
        })
      })
      .catch(err => {
        console.error('[Counterparties] fetch failed:', err)
        setError('Unable to load counterparty data. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [selectedCompanyId])

  // Derive status for each facility at render time using configurable thresholds
  const facilitiesWithStatus = facilities.map(f => ({
    ...f,
    status: cpStatus(Math.round(f.utilisation_pct)),
  }))

  const atRiskCount = facilitiesWithStatus.filter(f => f.status === 'High').length

  const aggUtil = totals && totals.limit > 0
    ? Math.round((totals.utilised / totals.limit) * 100)
    : 0

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <EyebrowLabel>Treasury console</EyebrowLabel>
          <h2 style={{ marginTop: 8 }}>Counterparties</h2>
          <p className="caption" style={{ marginTop: 8, color: 'var(--fg-2)' }}>
            Bank relationships · limit utilisation · contact
          </p>
        </div>
        <Button variant="primary">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="plus" size={16} /> Add counterparty
          </span>
        </Button>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Total limit</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>
            {totals ? formatEUR(totals.limit) : '—'}
          </div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>
            Across {facilities.length} counterpart{facilities.length === 1 ? 'y' : 'ies'}
          </div>
        </Card>

        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Aggregate utilisation</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-gold)', fontVariantNumeric: 'tabular-nums' }}>
            {totals ? `${aggUtil}%` : '—'}
          </div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>
            {totals ? `${formatEUR(totals.utilised)} of ${formatEUR(totals.limit)}` : ''}
          </div>
        </Card>

        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>At-risk counterparties</EyebrowLabel>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32,
            fontVariantNumeric: 'tabular-nums',
            color: atRiskCount > 0 ? 'var(--snh-warning)' : 'var(--snh-navy)',
          }}>
            {loading ? '—' : atRiskCount}
          </div>
          {/* Caption reads from live threshold — updates when Settings changes */}
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>
            Above {atRiskPct}% utilisation · <a href="#settings" style={{ color: 'var(--snh-gold)' }}>edit threshold</a>
          </div>
        </Card>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid var(--snh-danger)',
          borderRadius: 'var(--radius-3)', padding: '12px 16px',
          color: 'var(--snh-danger)', marginBottom: 16,
          fontSize: 'var(--fs-body)',
        }}>
          {error}
        </div>
      )}

      {/* Counterparty cards */}
      {loading ? (
        <LoadingSkeleton />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {facilitiesWithStatus.length === 0 && !error && (
            <div className="caption" style={{ color: 'var(--fg-2)', padding: '32px 0', textAlign: 'center' }}>
              No counterparties configured.
            </div>
          )}
          {facilitiesWithStatus.map(f => (
            <CounterpartyCard
              key={f.id}
              facility={f}
              status={f.status}
              atRiskPct={atRiskPct}
            />
          ))}
        </div>
      )}
    </>
  )
}
