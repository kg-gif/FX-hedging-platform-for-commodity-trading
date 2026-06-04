// Legal.jsx — platform notice page
//
// Carries the full counsel-confirmed platform disclaimer.
// Source: DRAFT_PLATFORM_DISCLAIMER.md, confirmed by qualified counsel 27 May 2026.
//
// IMPORTANT: Do not modify the disclaimer copy without Lex approval.

import '../../styles/snh-tokens.css'

export default function Legal() {
  return (
    <div
      className="snh-rebuild"
      style={{
        minHeight: '100vh',
        background: 'var(--bg-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header style={{
        padding: '16px 48px',
        borderBottom: '1px solid var(--border-1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--snh-navy)',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'var(--fs-h4)',
          color: 'var(--fg-on-navy)',
          letterSpacing: '0.02em',
        }}>
          Sum No How
        </span>
        <a
          href="/rebuild"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--fs-body-sm)',
            color: 'var(--snh-gold)',
            textDecoration: 'none',
          }}
        >
          ← Back to console
        </a>
      </header>

      <main style={{
        flex: 1,
        maxWidth: 760,
        margin: '0 auto',
        padding: '48px 32px',
        width: '100%',
      }}>
        <div style={{
          fontSize: 'var(--fs-eyebrow)',
          fontWeight: 'var(--fw-bold)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--snh-gold)',
          marginBottom: 16,
        }}>
          Platform notice
        </div>

        <h1 style={{ marginBottom: 32 }}>
          Important notice — Sum No How platform
        </h1>

        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--fs-body)',
          lineHeight: 1.7,
          color: 'var(--fg-1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          <p>
            Sum No How is a software platform for corporate treasurers and finance teams.
            It is decision-support software, not a regulated financial service.
          </p>
          <p>
            The platform identifies and monitors a corporate user's foreign exchange exposure,
            and surfaces market signals and risk simulations against a hedging policy that the
            user has itself defined. The user sets the rules. The platform enforces those rules
            and presents information so that the user can make its own decisions.
          </p>
          <p>
            The platform does not provide investment advice or personal recommendations. Nothing
            presented through the platform is an offer or a solicitation to enter into any foreign
            exchange transaction, whether through partners or otherwise.
          </p>
          <p>
            Sum No How does not hold or move client funds. Where the platform enables execution,
            it does so through integrations with regulated brokers or banks under those parties'
            own authorisation, client onboarding, and regulatory responsibility. The corporate
            user remains the principal in any transaction they choose to enter into.
          </p>
          <p>
            Sum No How is currently pre-authorisation and is not authorised by any financial
            supervisory authority. It does not claim any current regulatory status. The intended
            regulatory pathway is authorisation within the European Economic Area; the specific
            member state and regulator are not yet decided.
          </p>
          <p>
            The platform is intended for use by professional and corporate clients only. It is
            not made available to retail clients, nor to persons in jurisdictions where such use
            would require an authorisation Sum No How does not hold.
          </p>
          <p>
            This notice is provided in good faith. It is subject to confirmation by qualified
            legal counsel and may be amended as the regulatory position develops. Users are
            responsible for their own compliance with applicable laws and regulations, and for
            the suitability of any transaction they choose to execute.
          </p>
          <p>
            For questions, contact{' '}
            <a href="mailto:kg@sumnohow.com" style={{ color: 'var(--snh-gold)', textDecoration: 'underline' }}>
              kg@sumnohow.com
            </a>.
          </p>
        </div>

        <div style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: '1px solid var(--border-1)',
          fontSize: 'var(--fs-eyebrow)',
          color: 'var(--fg-3)',
        }}>
          Sum No How · Pre-authorisation · Norway
        </div>
      </main>
    </div>
  )
}
