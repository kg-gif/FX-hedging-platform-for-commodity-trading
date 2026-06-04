// Counterparties.jsx — Phase 2 screen
//
// DRAFT — PENDING PIXEL SIGN-OFF
// Pixel flag resolved:
//   - At-risk threshold now sourced from RiskSettingsContext (set in Settings).
//     Status (Low/Medium/High) and KPI tile caption derive from live threshold
//     values — no hardcoded 80%. Threshold editable in Settings > Counterparty risk.
//
// Phase 3: RiskSettingsContext will fetch from GET /api/settings/risk —
//   no changes needed here.

import { useRiskSettings } from '../../contexts/RiskSettingsContext'
import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon from '../ui/Icon'
import CoverageGauge from '../ui/charts/CoverageGauge'

// ── Mock data — status is NOT stored here; derived at render time ─────────────
const CPS = [
  { name: 'Nordea',        limitEur: 30_000_000, usedEur: 18_600_000, forwards: 6, nextMaturity: '6 Jun 2026',  contact: 'fx@nordea.no'           },
  { name: 'DNB',           limitEur: 25_000_000, usedEur: 10_250_000, forwards: 5, nextMaturity: '22 Jul 2026', contact: 'corp.fx@dnb.no'          },
  { name: 'Handelsbanken', limitEur: 15_000_000, usedEur: 13_200_000, forwards: 4, nextMaturity: '14 Jul 2026', contact: 'fx@handelsbanken.no'     },
]

function formatEur(n) {
  return 'EUR ' + n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

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

function CounterpartyCard({ cp, status, atRiskPct }) {
  const utilisationPct = Math.round((cp.usedEur / cp.limitEur) * 100)

  const gaugeColour = utilisationPct >= 100
    ? 'var(--snh-danger)'
    : utilisationPct >= atRiskPct
    ? 'var(--snh-warning)'
    : 'var(--snh-success)'

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
          <h3>{cp.name}</h3>
          <p className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>{cp.contact}</p>
        </div>
        <StatusPill status={status} />
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <div style={{ flex: '0 0 160px' }}>
          <CoverageGauge
            value={utilisationPct}
            label="Limit utilisation"
            caption={`${formatEur(cp.usedEur)} of ${formatEur(cp.limitEur)}`}
            colour={gaugeColour}
          />
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 4 }}>Limit</div>
            <div className="mono tabular" style={{ fontSize: 'var(--fs-h4)', color: 'var(--snh-navy)' }}>{formatEur(cp.limitEur)}</div>
          </div>
          <div>
            <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 4 }}>Used</div>
            <div className="mono tabular" style={{ fontSize: 'var(--fs-h4)', color: 'var(--snh-navy)' }}>{formatEur(cp.usedEur)}</div>
          </div>
          <div>
            <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 4 }}>Open forwards</div>
            <div className="tabular" style={{ fontSize: 'var(--fs-h4)', color: 'var(--snh-navy)' }}>{cp.forwards}</div>
          </div>
          <div>
            <div className="caption" style={{ color: 'var(--fg-2)', marginBottom: 4 }}>Next maturity</div>
            <div style={{ fontSize: 'var(--fs-h4)', color: 'var(--snh-navy)' }}>{cp.nextMaturity}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Button variant="ghost" size="sm">View statements</Button>
        <Button variant="ghost" size="sm">Adjust limit</Button>
      </div>
    </div>
  )
}

export default function Counterparties() {
  const { settings, cpStatus } = useRiskSettings()
  const { atRiskPct } = settings

  const cpsWithStatus = CPS.map(cp => ({
    ...cp,
    utilisationPct: Math.round((cp.usedEur / cp.limitEur) * 100),
    status: cpStatus(Math.round((cp.usedEur / cp.limitEur) * 100)),
  }))

  const totalLimit  = CPS.reduce((s, c) => s + c.limitEur, 0)
  const totalUsed   = CPS.reduce((s, c) => s + c.usedEur,  0)
  const aggUtil     = Math.round((totalUsed / totalLimit) * 100)
  const atRiskCount = cpsWithStatus.filter(c => c.status === 'High').length

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Total limit</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-navy)', fontVariantNumeric: 'tabular-nums' }}>
            {formatEur(totalLimit)}
          </div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>Across {CPS.length} counterparties</div>
        </Card>

        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>Aggregate utilisation</EyebrowLabel>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--snh-gold)', fontVariantNumeric: 'tabular-nums' }}>
            {aggUtil}%
          </div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>
            {formatEur(totalUsed)} of {formatEur(totalLimit)}
          </div>
        </Card>

        <Card>
          <EyebrowLabel style={{ marginBottom: 8 }}>At-risk counterparties</EyebrowLabel>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32,
            fontVariantNumeric: 'tabular-nums',
            color: atRiskCount > 0 ? 'var(--snh-warning)' : 'var(--snh-navy)',
          }}>
            {atRiskCount}
          </div>
          <div className="caption" style={{ marginTop: 4, color: 'var(--fg-2)' }}>
            Above {atRiskPct}% utilisation · <a href="#settings" style={{ color: 'var(--snh-gold)' }}>edit threshold</a>
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {cpsWithStatus.map(cp => (
          <CounterpartyCard
            key={cp.name}
            cp={cp}
            status={cp.status}
            atRiskPct={atRiskPct}
          />
        ))}
      </div>
    </>
  )
}
