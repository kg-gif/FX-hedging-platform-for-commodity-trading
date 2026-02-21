// ─────────────────────────────────────────────
// SUMNOHOW BRAND TOKENS
// All UI components must import from this file.
// Do not hardcode colours, fonts, or spacing.
// ─────────────────────────────────────────────

// Colours
export const NAVY        = '#1A2744'   // Primary background, headers, buttons
export const NAVY_LIGHT  = '#243560'   // Hover states, secondary backgrounds
export const GOLD        = '#C9A86C'   // Accents, active states, highlights
export const GOLD_MUTED  = 'rgba(201,168,108,0.15)' // Badge backgrounds
export const SLATE       = '#8DA4C4'   // Subtext on dark backgrounds
export const PAGE_BG     = '#F0F2F7'   // App background
export const CARD_BG     = '#FFFFFF'   // Card/panel background
export const BORDER      = '#E5E7EB'   // Default border colour
export const DANGER      = '#EF4444'   // Errors, breaches, delete
export const WARNING     = '#F59E0B'   // Warnings
export const SUCCESS     = '#10B981'   // OK, positive P&L

// Typography
export const FONT_SIZE = {
  xs:   '0.75rem',   // 12px — labels, badges
  sm:   '0.875rem',  // 14px — body, table cells
  base: '1rem',      // 16px — default
  lg:   '1.125rem',  // 18px — card titles
  xl:   '1.25rem',   // 20px — section headers
  '2xl':'1.5rem',    // 24px — page titles
}

// Spacing (for inline styles when Tailwind isn't enough)
export const RADIUS = {
  sm: '0.5rem',    // 8px  — badges, inputs
  md: '0.75rem',   // 12px — cards, buttons
  lg: '1rem',      // 16px — panels, modals
}

// ─────────────────────────────────────────────
// COMPONENT PATTERNS
// Copy these style objects directly into JSX
// ─────────────────────────────────────────────

// Page section header (dark navy bar)
export const STYLES = {

  pageHeader: {
    background: NAVY,
    borderRadius: RADIUS.lg,
    padding: '1.5rem',
    marginBottom: '1.5rem',
  },

  // Primary button — navy background
  btnPrimary: {
    background: NAVY,
    color: '#FFFFFF',
    padding: '0.5rem 1.25rem',
    borderRadius: RADIUS.md,
    fontSize: FONT_SIZE.sm,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  },

  // Secondary button — gold background
  btnGold: {
    background: GOLD,
    color: NAVY,
    padding: '0.5rem 1.25rem',
    borderRadius: RADIUS.md,
    fontSize: FONT_SIZE.sm,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  },

  // Ghost button — outlined
  btnGhost: {
    background: 'transparent',
    color: NAVY,
    padding: '0.5rem 1.25rem',
    borderRadius: RADIUS.md,
    fontSize: FONT_SIZE.sm,
    fontWeight: 600,
    border: `1px solid ${NAVY}`,
    cursor: 'pointer',
  },

  // Standard white card
  card: {
    background: CARD_BG,
    borderRadius: RADIUS.lg,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    border: `1px solid ${BORDER}`,
  },

  // Active nav tab indicator
  navActive: {
    color: GOLD,
    borderBottom: `2px solid ${GOLD}`,
  },

  navInactive: {
    color: SLATE,
    borderBottom: '2px solid transparent',
  },

  // Badge — active/selected state
  badgeActive: {
    background: GOLD_MUTED,
    color: GOLD,
    border: `1px solid ${GOLD}`,
    padding: '0.125rem 0.625rem',
    borderRadius: '9999px',
    fontSize: FONT_SIZE.xs,
    fontWeight: 600,
  },

  // Table header row
  tableHeader: {
    background: '#F4F6FA',
    color: NAVY,
    fontSize: FONT_SIZE.xs,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
}