// Documents.jsx — Phase 2 screen
//
// DRAFT — PENDING PIXEL SIGN-OFF
// Pixel flags resolved:
//   - AI disclosure: "full disclosure." links to /legal (Lex-approved two-tier pattern)
//   - AI fallback caption: "Static content. AI service unavailable." in slate

import Card from '../ui/Card'
import Button from '../ui/Button'
import EyebrowLabel from '../ui/EyebrowLabel'
import Icon from '../ui/Icon'
import Tabs from '../ui/Tabs'
import { useState } from 'react'

const DOCS = [
  { title: 'Q2 2026 exposure brief',      type: 'Brief',      date: '12 May 2026', author: 'Aria',   status: 'DRAFT — PENDING REVIEW', aiGenerated: true,  aiAvailable: true  },
  { title: 'Hedge framework v4.2',         type: 'Framework',  date: '02 May 2026', author: 'Kevin',  status: 'Approved',               aiGenerated: false, aiAvailable: false },
  { title: 'Currency plan · EUR/USD',      type: 'Plan',       date: '28 Apr 2026', author: 'Axel',   status: 'Approved',               aiGenerated: true,  aiAvailable: false },
  { title: 'Order audit log · April',      type: 'Audit',      date: '01 May 2026', author: 'System', status: 'Final',                  aiGenerated: false, aiAvailable: false },
  { title: 'Q1 2026 exposure brief',       type: 'Brief',      date: '15 Apr 2026', author: 'Aria',   status: 'Approved',               aiGenerated: true,  aiAvailable: true  },
  { title: 'Counterparty review · Nordea', type: 'Review',     date: '08 Apr 2026', author: 'Cipher', status: 'Approved',               aiGenerated: false, aiAvailable: false },
  { title: 'GDPR compliance log',          type: 'Compliance', date: '01 Apr 2026', author: 'Lex',    status: 'Final',                  aiGenerated: false, aiAvailable: false },
]

const TYPE_COLOURS = {
  Brief:      'var(--snh-navy)',
  Framework:  'var(--snh-gold)',
  Plan:       'var(--snh-navy)',
  Audit:      'var(--snh-slate)',
  Review:     'var(--snh-navy)',
  Compliance: 'var(--snh-slate)',
}

function TypeBadge({ type }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px',
      borderRadius: 'var(--radius-pill)', background: 'transparent',
      border: `1px solid ${TYPE_COLOURS[type] || 'var(--snh-slate)'}`,
      color: TYPE_COLOURS[type] || 'var(--snh-slate)',
      fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      {type}
    </span>
  )
}

function StatusLabel({ status }) {
  const isDraft = status.toLowerCase().includes('draft')
  return (
    <span style={{
      fontSize: 'var(--fs-eyebrow)', fontWeight: 'var(--fw-bold)',
      letterSpacing: '0.05em', textTransform: 'uppercase',
      color: isDraft ? 'var(--snh-warning)' : 'var(--snh-slate)',
    }}>
      {status}
    </span>
  )
}

// AI disclosure tag — Lex two-tier pattern
function AIDisclosureTag({ aiAvailable }) {
  if (!aiAvailable) {
    return (
      <span style={{ fontSize: 'var(--fs-eyebrow)', color: 'var(--snh-slate)', fontStyle: 'italic' }}>
        Static content. AI service unavailable.
      </span>
    )
  }
  return (
    <span style={{ fontSize: 'var(--fs-eyebrow)', color: 'var(--snh-slate)' }}>
      AI-generated decision support —{' '}
      <a href="/legal" style={{ color: 'var(--snh-gold)', textDecoration: 'underline', fontWeight: 'var(--fw-bold)' }}>
        full disclosure.
      </a>
    </span>
  )
}

export default function Documents() {
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all'
    ? DOCS
    : DOCS.filter(d => d.type.toLowerCase() === filter)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <EyebrowLabel>Treasury console</EyebrowLabel>
          <h2 style={{ marginTop: 8 }}>Documents</h2>
          <p className="caption" style={{ marginTop: 8, color: 'var(--fg-2)' }}>
            Briefs · frameworks · plans · audit logs · compliance
          </p>
        </div>
        <Button variant="primary">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="plus" size={16} /> New document
          </span>
        </Button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Tabs variant="pill" active={filter} onChange={setFilter} items={[
          { id: 'all',        label: 'All',        count: DOCS.length },
          { id: 'brief',      label: 'Briefs',     count: DOCS.filter(d => d.type === 'Brief').length },
          { id: 'framework',  label: 'Frameworks', count: DOCS.filter(d => d.type === 'Framework').length },
          { id: 'plan',       label: 'Plans',      count: DOCS.filter(d => d.type === 'Plan').length },
          { id: 'audit',      label: 'Audit',      count: DOCS.filter(d => d.type === 'Audit').length },
          { id: 'compliance', label: 'Compliance', count: DOCS.filter(d => d.type === 'Compliance').length },
        ]} />
      </div>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
              {['Title', 'Type', 'Date', 'Author', 'Status', ''].map(h => (
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
            {filtered.map((d, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-1)' }}>
                <td style={{ padding: '14px 8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                      <Icon name="file-text" size={18} style={{ color: 'var(--snh-slate)', flexShrink: 0 }} />
                      <span style={{ color: 'var(--snh-navy)', fontWeight: 700 }}>{d.title}</span>
                    </div>
                    {d.aiGenerated && (
                      <div style={{ paddingLeft: 30 }}>
                        <AIDisclosureTag aiAvailable={d.aiAvailable} />
                      </div>
                    )}
                  </div>
                </td>
                <td style={{ padding: '14px 8px' }}><TypeBadge type={d.type} /></td>
                <td style={{ padding: '14px 8px', color: 'var(--fg-2)' }}>{d.date}</td>
                <td style={{ padding: '14px 8px', color: 'var(--fg-2)' }}>{d.author}</td>
                <td style={{ padding: '14px 8px' }}><StatusLabel status={d.status} /></td>
                <td style={{ padding: '14px 8px', textAlign: 'right' }}>
                  <button
                    aria-label={`Download ${d.title}`}
                    style={{ background: 'transparent', border: 'none', color: 'var(--snh-navy)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Icon name="download" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
