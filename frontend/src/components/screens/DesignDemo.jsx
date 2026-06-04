// DesignDemo.jsx — SNH rebuild design system + component library demo
//
// Purpose:
//   - Visible at /rebuild while the legacy app continues to run normally
//   - Demonstrates SNH tokens (colours, typography, spacing, shadows)
//   - Demonstrates foundational components (EyebrowLabel, Card, Button, StatTile)
//   - Includes a dense-data table row for Pixel's two-weight hierarchy review
//
// What Pixel reviews here (week 2–3 sign-off gate):
//   - KaTeX serif + sans-serif rendering
//   - Two-weight rule (400 + 700 only) reading well on dense data
//   - One gold accent per view rule
//   - Sentence case throughout
//   - Tabular numerals on all financial figures
//   - Currency format "EUR 1,234,567" code-first, full digits
//   - Flag + 3-letter code pattern (institutional, per founder decision)

import '../../styles/snh-tokens.css'
import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import StatTile from '../ui/StatTile'
import Icon from '../ui/Icon'
import FanChart from '../ui/charts/FanChart'
import DivergentBar from '../ui/charts/DivergentBar'
import CoverageGauge from '../ui/charts/CoverageGauge'
import Sparkline from '../ui/charts/Sparkline'
import Tabs from '../ui/Tabs'
import ThemePicker, { useTheme } from '../ui/ThemePicker'
import ThinkingIndicator from '../ui/ThinkingIndicator'
import { useState } from 'react'

// Currency flag + code pair — per founder decision, institutional treatment
function FlagPair({ from, to }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span className={`fi fi-${flagCode(from)}`} style={{ width: 16, height: 12, borderRadius: 1 }} />
      <span className="mono" style={{ fontWeight: 'var(--fw-bold)', color: 'var(--snh-navy)' }}>
        {from}/{to}
      </span>
      <span className={`fi fi-${flagCode(to)}`} style={{ width: 16, height: 12, borderRadius: 1 }} />
    </span>
  )
}

function flagCode(ccy) {
  const map = { EUR: 'eu', USD: 'us', GBP: 'gb', NOK: 'no', JPY: 'jp', CHF: 'ch' }
  return map[ccy] || 'eu'
}

// Status pill — restricted to risk states only per brand rule
function StatusPill({ status }) {
  const styles = {
    'On track':  { bg: 'rgba(16,185,129,0.10)',  color: 'var(--snh-success)' },
    'Elevated':  { bg: 'rgba(245,158,11,0.10)',  color: 'var(--snh-warning)' },
    'Breach':    { bg: 'rgba(239,68,68,0.10)',   color: 'var(--snh-danger)' },
  }
  const s = styles[status] || styles['On track']
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 'var(--radius-pill)',
        background: s.bg,
        color: s.color,
        fontSize: 'var(--fs-eyebrow)',
        fontWeight: 'var(--fw-bold)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      {status}
    </span>
  )
}

export default function DesignDemo() {
  const [primary, setPrimary] = useState('dashboard')
  const [filter, setFilter] = useState('requires-action')
  const { themeId, setThemeId, vars } = useTheme()
  return (
    <div className="snh-rebuild" style={{ minHeight: '100vh', padding: '40px 24px', ...vars }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ marginBottom: '24px' }}>
          <EyebrowLabel>SNH design system — preview</EyebrowLabel>
          <h1 style={{ marginTop: '8px' }}>Component library demo</h1>
          <p className="caption" style={{ marginTop: '8px', maxWidth: 640 }}>
            DRAFT — PENDING REVIEW. For Pixel sign-off on the two-weight hierarchy and the component scope
            before any screen porting begins. Tokens sourced from sum-no-how-design-system v1.2.
          </p>
        </div>

        {/* Theme picker — preview only, not a brand commitment */}
        <ThemePicker themeId={themeId} onChange={setThemeId} />

        {/* Section 1 — typography */}
        <Card eyebrow="Typography" title="KaTeX family, two weights" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            <div>
              <p className="caption" style={{ marginBottom: '8px' }}>Display (KaTeX_Main 700)</p>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 40, color: 'var(--snh-navy)' }}>
                FX exposure, settled.
              </div>
              <h2 style={{ marginTop: '16px' }}>Total FX exposure · 90-day forward</h2>
              <h3 style={{ marginTop: '12px' }}>Recommended hedge — EUR / USD</h3>
              <h4 style={{ marginTop: '12px' }}>Open positions</h4>
            </div>
            <div>
              <p className="caption" style={{ marginBottom: '8px' }}>Body (KaTeX_SansSerif 400)</p>
              <p>Cover ratio fell below the 25% floor. The USD/JPY position is now 12% covered against a 25% floor in your risk framework. We recommend partial protection on the next maturity cycle.</p>
              <p className="caption" style={{ marginTop: '16px' }}>Caption — Last refresh 09:42 CET.</p>
              <div className="mono" style={{ marginTop: '16px', color: 'var(--snh-navy)' }}>
                EUR 1,247,000 · 1.0847 · 6 Aug 2026
              </div>
            </div>
          </div>
        </Card>

        {/* Section 2 — colour and meaning */}
        <Card eyebrow="Colour" title="One gold accent per view" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <Swatch token="--snh-navy"     label="Navy — authority" />
            <Swatch token="--snh-gold"     label="Gold — emphasis" emphasised />
            <Swatch token="--snh-slate"    label="Slate — support" />
            <Swatch token="--snh-ink-7"    label="Page background" border />
          </div>
          <p className="caption" style={{ marginTop: '16px' }}>
            Semantic colours (danger, warning, success) appear only on risk-state surfaces, never decoratively.
          </p>
        </Card>

        {/* Section 3 — stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <Card>
            <StatTile
              eyebrow="FX exposure"
              value="EUR 31,812,500"
              caption="Across three pairs · 90-day forward window"
              emphasised
            />
          </Card>
          <Card>
            <StatTile
              eyebrow="Hedged"
              value="68%"
              caption="EUR 21,633,500 covered"
            />
          </Card>
          <Card>
            <StatTile
              eyebrow="Open / unhedged"
              value="EUR 10,179,000"
              caption="Not yet hedged"
            />
          </Card>
          <Card>
            <StatTile
              eyebrow="Combined P&L"
              value="+ EUR 68,201"
              caption="Locked + floating vs budget"
              delta={{ value: '+ 0.24%', direction: 'up', neutral: false }}
            />
          </Card>
        </div>

        {/* Section 4 — dense table (Pixel's two-weight hierarchy review surface) */}
        <Card eyebrow="Open positions" title="Dense data — two-weight hierarchy" action={<Button variant="ghost" size="sm">View all</Button>} style={{ marginBottom: '24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                {['Pair', 'Notional (EUR)', 'Δ 24h', 'Cover', 'Maturity', 'Status'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left',
                    padding: '12px 8px',
                    fontSize: 'var(--fs-eyebrow)',
                    fontWeight: 'var(--fw-bold)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--snh-gold)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { from: 'EUR', to: 'USD', notional: '18,432,000', delta: '+0.42%', deltaDir: 'up', cover: '68%', maturity: '6 Aug 2026', status: 'Elevated' },
                { from: 'EUR', to: 'GBP', notional: '9,120,500',  delta: '−0.18%', deltaDir: 'down', cover: '92%', maturity: '14 Jul 2026', status: 'On track' },
                { from: 'USD', to: 'JPY', notional: '4,260,000',  delta: '+0.61%', deltaDir: 'up', cover: '12%', maturity: '28 Jul 2026', status: 'Breach' },
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-1)' }}>
                  <td style={{ padding: '14px 8px' }}><FlagPair from={row.from} to={row.to} /></td>
                  <td className="mono tabular" style={{ padding: '14px 8px', color: 'var(--snh-navy)' }}>{row.notional}</td>
                  <td className="mono tabular" style={{ padding: '14px 8px', color: row.deltaDir === 'up' ? 'var(--snh-success)' : 'var(--snh-danger)' }}>{row.delta}</td>
                  <td className="mono tabular" style={{ padding: '14px 8px' }}>{row.cover}</td>
                  <td style={{ padding: '14px 8px', color: 'var(--fg-2)' }}>{row.maturity}</td>
                  <td style={{ padding: '14px 8px' }}><StatusPill status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Section 4.5 — charts */}
        <Card eyebrow="Charts" title="Fan chart — forward rate with confidence bands" style={{ marginBottom: '24px' }}>
          <FanChart pair="EUR/USD" spot={1.0847} budget={1.0700} forwardTo={1.0900} days={90} />
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <Card eyebrow="P&L vs budget" title="Divergent bar · per pair">
            <DivergentBar
              data={[
                { pair: 'EUR/USD', value: -196506 },
                { pair: 'GBP/USD', value: -128775 },
                { pair: 'CHF/USD', value: -114175 },
                { pair: 'GBP/NOK', value:  +51851 },
                { pair: 'EUR/NOK', value: +182279 },
              ]}
              width={520}
              height={220}
            />
          </Card>
          <Card eyebrow="Coverage" title="Hedge utilisation">
            <CoverageGauge value={68} label="Portfolio coverage" caption="EUR 21.6M of EUR 31.8M" />
          </Card>
        </div>

        <Card eyebrow="Spot vs budget" title="Sparklines · live pairs" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
            <Sparkline label="EUR/USD" current="1.0847" budget={1.0700} values={[1.0815, 1.0822, 1.0809, 1.0830, 1.0841, 1.0856, 1.0838, 1.0847]} />
            <Sparkline label="EUR/GBP" current="0.8421" budget={0.8500} values={[0.8470, 0.8458, 0.8442, 0.8430, 0.8418, 0.8409, 0.8415, 0.8421]} />
            <Sparkline label="USD/JPY" current="151.20" budget={148.00} values={[148.5, 149.1, 149.8, 150.2, 150.7, 151.0, 151.3, 151.2]} />
          </div>
        </Card>

        {/* Section 5.7 — thinking indicator (SNH motion identity) */}
        <Card eyebrow="Motion" title="Thinking indicator · + − = vocabulary" style={{ marginBottom: '24px' }}>
          <p className="caption" style={{ marginBottom: 24, color: 'var(--fg-2)', maxWidth: 640 }}>
            Replaces every generic spinner in the rebuild. The brand operators (sum + / no − / how =) play out in time —
            each glyph pulses gold for 600ms then mutes to slate, on a 1.8 second loop. Respects "reduce motion" OS preference.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>

            {/* Small inline — chrome use */}
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Small · inline</div>
              <div style={{
                padding: '20px 16px',
                background: 'var(--bg-page)',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 72,
              }}>
                <ThinkingIndicator size={12} />
              </div>
              <p className="caption" style={{ marginTop: 8, color: 'var(--fg-2)' }}>
                Used in chrome — beside live-rate timestamps, sticky-header refresh stamps. No label.
              </p>
            </div>

            {/* Default with caption — AI / model call */}
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Default · with caption</div>
              <div style={{
                padding: '20px 16px',
                background: 'var(--bg-page)',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 72,
              }}>
                <ThinkingIndicator label="Calculating recommendation..." />
              </div>
              <p className="caption" style={{ marginTop: 8, color: 'var(--fg-2)' }}>
                Default. Used inside cards during AI rationale generation, rate refresh, P&amp;L recalculation.
              </p>
            </div>

            {/* Large display — heavy calculation */}
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Large · display</div>
              <div style={{
                padding: '20px 16px',
                background: 'var(--bg-page)',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 72,
              }}>
                <ThinkingIndicator label="Running Monte Carlo · 10,000 paths" size={24} />
              </div>
              <p className="caption" style={{ marginTop: 8, color: 'var(--fg-2)' }}>
                Used for heavy calculations — Monte Carlo, scenario analysis, full P&amp;L rebuild. Centre of an empty card.
              </p>
            </div>

          </div>

          {/* Full-card "loading state" demonstration */}
          <div style={{ marginTop: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Full-card state · empty surface</div>
            <div style={{
              padding: '48px 24px',
              background: 'var(--bg-page)',
              border: '1px dashed var(--border-2)',
              borderRadius: 'var(--radius-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ThinkingIndicator label="Generating quarterly exposure brief..." size={20} />
            </div>
            <p className="caption" style={{ marginTop: 8, color: 'var(--fg-2)' }}>
              Used when an entire card or screen section is being computed. Centred, on a sunken background.
            </p>
          </div>
        </Card>

        {/* Section 6 — tabs */}
        <Card eyebrow="Navigation" title="Tabs · primary nav and sub-filters" style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '24px' }}>
            <div className="caption" style={{ marginBottom: '8px', color: 'var(--fg-2)' }}>
              Primary navigation — underline variant. Sentence case. Gold underline on active.
            </div>
            <Tabs
              variant="underline"
              active={primary}
              onChange={setPrimary}
              items={[
                { id: 'dashboard', label: 'Dashboard' },
                { id: 'hedging',   label: 'Hedging' },
                { id: 'reports',   label: 'Reports' },
                { id: 'settings',  label: 'Settings' },
                { id: 'risk',      label: 'Risk engine' },
              ]}
            />
          </div>
          <div>
            <div className="caption" style={{ marginBottom: '8px', color: 'var(--fg-2)' }}>
              Sub-filter — pill variant. Used inside Hedging to filter status. Counts in tabular.
            </div>
            <Tabs
              variant="pill"
              active={filter}
              onChange={setFilter}
              items={[
                { id: 'requires-action', label: 'Requires action', count: 4 },
                { id: 'in-progress',     label: 'In progress',     count: 6 },
                { id: 'hedged',          label: 'Hedged',          count: 12 },
                { id: 'settled',         label: 'Settled',         count: 8 },
                { id: 'forecast',        label: 'Forecast',        count: 3 },
              ]}
            />
          </div>
        </Card>

        {/* Section 5 — buttons and icons */}
        <Card eyebrow="Buttons and icons" title="Sentence case · Lucide 1.5px stroke" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <Button variant="primary">Execute hedge</Button>
            <Button variant="gold">Review framework</Button>
            <Button variant="ghost">Decline</Button>
            <Button variant="danger">Cancel order</Button>
            <Button variant="primary" disabled>Disabled state</Button>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', color: 'var(--snh-navy)' }}>
            <Icon name="trending-up" size={24} />
            <Icon name="trending-down" size={24} />
            <Icon name="alert-triangle" size={24} />
            <Icon name="check-circle" size={24} />
            <Icon name="circle-dot" size={24} />
            <Icon name="arrow-right" size={24} />
            <span className="caption">Lucide, 1.5px stroke, currentColor, 24px box.</span>
          </div>
        </Card>

        {/* Footer */}
        <div style={{
          marginTop: '40px',
          paddingTop: '24px',
          borderTop: '1px solid var(--border-1)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--fg-2)',
          textAlign: 'center',
        }}>
          Sum No How · Pre-authorisation · Norway
        </div>
      </div>
    </div>
  )
}

function Swatch({ token, label, emphasised = false, border = false }) {
  return (
    <div>
      <div style={{
        background: `var(${token})`,
        border: border ? '1px solid var(--border-1)' : `1px solid var(${token})`,
        height: 56,
        borderRadius: 'var(--radius-3)',
        boxShadow: emphasised ? '0 0 0 3px rgba(201,168,108,0.20)' : undefined,
      }} />
      <div className="caption" style={{ marginTop: '8px', color: 'var(--fg-1)' }}>{label}</div>
      <div className="mono caption" style={{ color: 'var(--fg-2)' }}>{token}</div>
    </div>
  )
}
