// RebuildShell.jsx — top-level shell for the /rebuild route
//
// Wraps ConsoleLayout and RiskSettingsProvider around the active screen.
// Section content is rendered at call time (not pre-instantiated as static JSX)
// so all screens correctly consume React context.

import { useState } from 'react'
import ConsoleLayout from '../layout/ConsoleLayout'
import { RiskSettingsProvider } from '../../contexts/RiskSettingsContext'
import FxOverview, { FxOverviewRightColumn } from './FxOverview'
import Hedges from './Hedges'
import Execution from './Execution'
import Counterparties from './Counterparties'
import Documents from './Documents'
import Settings from './Settings'
import RiskEngine from './RiskEngine'
import DesignDemo from './DesignDemo'

// ── Section registry ──────────────────────────────────────────────────────────
// render() is called at render time so components receive current context.
// right() is optional — returns the right-column content for two-column layouts.
const SECTIONS = {
  exposure: {
    breadcrumb: ['Console', 'Exposure', 'Overview'],
    render: () => <FxOverview />,
    right:  () => <FxOverviewRightColumn />,
  },
  hedges: {
    breadcrumb: ['Console', 'Hedges'],
    render: () => <Hedges />,
  },
  execution: {
    breadcrumb: ['Console', 'Execution'],
    render: () => <Execution />,
  },
  counterparties: {
    breadcrumb: ['Console', 'Counterparties'],
    render: () => <Counterparties />,
  },
  documents: {
    breadcrumb: ['Console', 'Documents'],
    render: () => <Documents />,
  },
  'risk-engine': {
    breadcrumb: ['Console', 'Risk engine'],
    render: () => <RiskEngine />,
  },
  settings: {
    breadcrumb: ['Console', 'Settings'],
    render: () => <Settings />,
  },
  'design-system': {
    breadcrumb: ['Console', 'Design system'],
    render: () => <DesignDemo />,
  },
}

function Placeholder({ section, note }) {
  return (
    <div style={{
      background: 'var(--snh-card)',
      border: '1px dashed var(--border-2)',
      borderRadius: 'var(--radius-3)',
      padding: 48,
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 'var(--fs-eyebrow)', letterSpacing: '0.14em', textTransform: 'uppercase',
        fontWeight: 'var(--fw-bold)', color: 'var(--snh-slate)', marginBottom: 12,
      }}>
        DRAFT — PENDING REVIEW
      </div>
      <h2 style={{ marginBottom: 8 }}>{section}</h2>
      <p className="caption" style={{ color: 'var(--fg-2)' }}>{note}</p>
    </div>
  )
}

const TODAY_LABEL = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function RebuildShell({ authUser, onLogout }) {
  const [active, setActive] = useState('exposure')
  const section = SECTIONS[active] || SECTIONS.exposure

  return (
    // RiskSettingsProvider wraps the entire shell so all screens share one
    // settings instance. In Phase 3 this is where the API fetch will live.
    <RiskSettingsProvider>
      <ConsoleLayout
        active={active}
        onChangeSection={setActive}
        breadcrumb={section.breadcrumb}
        date={TODAY_LABEL}
        rightColumn={section.right ? section.right() : null}
        authUser={authUser}
        onLogout={onLogout}
      >
        {section.render()}
      </ConsoleLayout>
    </RiskSettingsProvider>
  )
}
