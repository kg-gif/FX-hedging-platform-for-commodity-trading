// ConsoleLayout.jsx — page shell
//
// Structure (Pixel-approved layout pattern, 13 May 2026):
//   [ Sidebar (240px) | TopBar + main content + right context column ]
//
// The right column is optional — pass children only and the layout uses
// the full content width. Pass `rightColumn` for the two-column treatment.

import '../../styles/snh-tokens.css'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function ConsoleLayout({
  active,
  onChangeSection,
  breadcrumb,
  date,
  children,
  rightColumn,
  authUser,
  onLogout,
}) {
  return (
    <div className="snh-rebuild" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active={active} onChange={onChangeSection} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar breadcrumb={breadcrumb} date={date} authUser={authUser} onLogout={onLogout} />
        <div style={{ display: 'grid', gridTemplateColumns: rightColumn ? '1fr 320px' : '1fr', gap: 24, padding: '24px 32px', flex: 1 }}>
          <main style={{ minWidth: 0 }}>
            {children}
          </main>
          {rightColumn && (
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {rightColumn}
            </aside>
          )}
        </div>

        {/* Platform disclaimer footer — counsel-confirmed 27 May 2026
            Short version per DRAFT_PLATFORM_DISCLAIMER.md. Required on every page.
            Full version at /legal. Do not remove or shorten without Lex approval. */}
        <footer style={{
          borderTop: '1px solid var(--border-1)',
          padding: '12px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 24,
        }}>
          <p style={{
            fontSize: 'var(--fs-eyebrow)',
            color: 'var(--fg-3)',
            lineHeight: 1.5,
            margin: 0,
            maxWidth: 760,
          }}>
            Sum No How is decision-support software for corporate treasurers. It is not investment
            advice and not a solicitation to transact. The user sets its own hedging policy; the
            platform enforces it and surfaces signals and simulations against it. Sum No How does
            not hold client funds and is pre-authorisation.{' '}
            <a href="/legal" style={{ color: 'var(--snh-gold)', textDecoration: 'underline', fontWeight: 'var(--fw-bold)' }}>
              Read the full notice.
            </a>
          </p>
          <p style={{ fontSize: 'var(--fs-eyebrow)', color: 'var(--fg-3)', margin: 0, whiteSpace: 'nowrap' }}>
            Sum No How · Pre-authorisation · Norway
          </p>
        </footer>
      </div>
    </div>
  )
}
