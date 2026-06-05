// Sidebar.jsx — left vertical primary nav
//
// Brand rules:
//   - Sentence case labels
//   - Gold accent on the active item (left-bar marker + gold label)
//   - Slate for inactive labels
//   - Lucide icons at 20px in the nav (denser than 24px on body)
//   - Logo and product name top, items mid, environment block bottom

import Icon from '../ui/Icon'

// Sidebar IA — founder decision 13 May 2026 ("Axel's proposal"):
//   Risk engine is its own item. Settings is its own item with Admin nested
//   inside the Settings screen. Glossary is a help affordance, not primary nav.
const ITEMS = [
  { id: 'exposure',      label: 'Exposure',      icon: 'gauge' },
  { id: 'hedges',        label: 'Hedges',        icon: 'shield' },
  { id: 'execution',     label: 'Execution',     icon: 'arrow-right-circle' },
  { id: 'counterparties',label: 'Counterparties',icon: 'users' },
  { id: 'documents',     label: 'Documents',     icon: 'file-text' },
  { id: 'risk-engine',   label: 'Risk engine',   icon: 'activity' },
]

// Secondary items — sit below a divider, separated from the workflow nav.
const SECONDARY_ITEMS = [
  { id: 'settings',      label: 'Settings',      icon: 'settings' },
  { id: 'design-system', label: 'Design system', icon: 'palette' },
]

export default function Sidebar({ active, onChange }) {
  return (
    <aside style={{
      width: 240,
      flexShrink: 0,
      background: 'var(--snh-card)',
      borderRight: '1px solid var(--border-1)',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      height: '100vh',
    }}>
      {/* Brand block —
          Pixel sign-off 13 May 2026: math card removed from the sidebar.
          Monogram reserved for places it can render at proper size
          (login, document covers, favicon, marketing). Wordmark plus
          tagline carries the brand in the chrome. */}
      <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border-1)' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 'var(--fw-bold)',
          color: 'var(--snh-navy)',
          letterSpacing: '0.01em',
          lineHeight: 1.1,
        }}>
          Sum<span style={{ color: 'var(--snh-gold)' }}>·</span>No<span style={{ color: 'var(--snh-gold)' }}>·</span>How
        </div>
        <div style={{
          marginTop: 6,
          fontSize: 'var(--fs-caption)',
          fontStyle: 'italic',
          color: 'var(--snh-slate)',
          fontFamily: 'var(--font-display)',
        }}>
          Protecting margins.
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ITEMS.map(it => (
          <NavItem key={it.id} item={it} active={it.id === active} onChange={onChange} />
        ))}

        {/* Divider before secondary items */}
        <div style={{ borderTop: '1px solid var(--border-1)', margin: '12px 14px' }} />

        {SECONDARY_ITEMS.map(it => (
          <NavItem key={it.id} item={it} active={it.id === active} onChange={onChange} />
        ))}
      </nav>

      {/* Environment block */}
      <SidebarEnvironment />
    </aside>
  )
}

// Single nav item — shared by the primary and secondary lists.
function NavItem({ item, active, onChange }) {
  return (
    <button
      onClick={() => onChange(item.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        background: active ? 'var(--snh-gold-muted)' : 'transparent',
        border: 'none',
        borderLeft: active ? '2px solid var(--snh-gold)' : '2px solid transparent',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--fs-body-sm)',
        fontWeight: active ? 'var(--fw-bold)' : 'var(--fw-regular)',
        color: active ? 'var(--snh-navy)' : 'var(--snh-slate)',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: '0 4px 4px 0',
      }}
    >
      <Icon name={item.icon} size={20} />
      {item.label}
    </button>
  )
}

function SidebarEnvironment() {
  return (
    <div style={{ padding: '20px', borderTop: '1px solid var(--border-1)' }}>
        <div style={{ fontSize: 'var(--fs-eyebrow)', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 'var(--fw-bold)', color: 'var(--snh-slate)', marginBottom: 8 }}>
          Environment
        </div>
        <div style={{
          display: 'inline-block',
          padding: '4px 10px',
          background: 'var(--snh-navy)',
          color: '#FFFFFF',
          borderRadius: 'var(--radius-pill)',
          fontSize: 'var(--fs-eyebrow)',
          fontWeight: 'var(--fw-bold)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          Pre-authorisation · NO
        </div>
        {/* Lex finding 13 May 2026 — "Sum No How AS" not yet incorporated.
            Interim wording is the trading name only, no "AS" suffix. */}
        <div className="caption" style={{ color: 'var(--fg-2)' }}>Sum No How</div>
    </div>
  )
}
