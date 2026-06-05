// TopBar.jsx — breadcrumb + search + date + user avatar
//
// Brand rules:
//   - Breadcrumb in slate, separators in even paler slate
//   - Search input is unornamented — hairline border, no shadow
//   - Date right-aligned, tabular mono
//   - User avatar is a 32px circle with two-letter initials in navy

import Icon from '../ui/Icon'

export default function TopBar({ breadcrumb, date, userInitials = 'EH' }) {
  return (
    <div style={{
      height: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 32px',
      background: 'var(--bg-page)',
      borderBottom: '1px solid var(--border-1)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-body-sm)' }}>
        {breadcrumb.map((b, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: i === breadcrumb.length - 1 ? 'var(--snh-navy)' : 'var(--snh-slate)', fontWeight: i === breadcrumb.length - 1 ? 700 : 400 }}>{b}</span>
            {i < breadcrumb.length - 1 && <Icon name="chevron-right" size={14} style={{ color: 'var(--snh-ink-5)' }} />}
          </span>
        ))}
      </div>

      {/* Right cluster: search, date, user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px',
          background: 'var(--snh-card)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius-3)',
          width: 280,
        }}>
          <Icon name="search" size={16} style={{ color: 'var(--snh-slate)' }} />
          <input
            type="text"
            placeholder="Search exposures, counterparties…"
            style={{
              border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)',
              color: 'var(--snh-navy)', width: '100%',
            }}
          />
        </div>

        <span className="mono" style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--snh-slate)', fontVariantNumeric: 'tabular-nums' }}>{date}</span>

        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--snh-navy)',
          color: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-bold)',
          letterSpacing: '0.05em',
        }}>
          {userInitials}
        </div>
      </div>
    </div>
  )
}
