// ============================================================
// SHARED CONSTANTS
// Status badges, colours, zones, labels — all defined here.
// Import from here — never define status colours inline.
// ============================================================

// ── Exposure status ──────────────────────────────────────────
export const EXPOSURE_STATUS = {
  HEDGED:      { label: 'Hedged',               colour: '#10B981', bg: '#D1FAE5' },
  IN_PROGRESS: { label: 'In Progress',           colour: '#F59E0B', bg: '#FEF3C7' },
  OPEN:        { label: 'Open',                  colour: '#9CA3AF', bg: '#F3F4F6' },
  BREACH:      { label: 'Breach',                colour: '#EF4444', bg: '#FEE2E2' },
  AWAITING_SETTLEMENT: {
    label: 'Awaiting Settlement',                colour: '#F59E0B', bg: '#FEF3C7'
  },
}

// ── Tranche status ───────────────────────────────────────────
export const TRANCHE_STATUS = {
  PENDING:   { label: 'Pending',   colour: '#9CA3AF' },
  EXECUTED:  { label: 'Executed',  colour: '#10B981' },
  CONFIRMED: { label: 'Confirmed', colour: '#3B82F6' },
  ARCHIVED:  { label: 'Archived',  colour: '#6B7280' },
}

// ── Policy zones ─────────────────────────────────────────────
export const ZONES = {
  DEFENSIVE:     { label: 'Defensive',     colour: '#EF4444', bg: '#FEE2E2' },
  BASE:          { label: 'Base',          colour: '#1A2744', bg: '#E8EDF5' },
  OPPORTUNISTIC: { label: 'Opportunistic', colour: '#10B981', bg: '#D1FAE5' },
}

// ── Facility utilisation ─────────────────────────────────────
export const getFacilityStatus = (pct) => {
  if (pct < 70) return { label: 'Normal',   colour: '#10B981' }
  if (pct < 90) return { label: 'Warning',  colour: '#F59E0B' }
  return           { label: 'Critical', colour: '#EF4444' }
}

// ── Instrument types ─────────────────────────────────────────
export const INSTRUMENTS = ['Forward', 'Spot', 'Option']
