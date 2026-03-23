// ============================================================
// SHARED NUMBER & DATE FORMATTING
// European format throughout — dd/mm/yyyy, 24-hour time.
// Import from here — never define formatters inline.
// ============================================================

// ── Currency symbols ─────────────────────────────────────────

export const CURRENCY_SYMBOLS = {
  EUR: '€', GBP: '£', USD: '$',
  NOK: 'kr', SEK: 'kr', DKK: 'kr',
  CHF: 'CHF ', JPY: '¥', AUD: 'A$', CAD: 'C$',
  NZD: 'NZ$', SGD: 'S$',
}

// "+£1,234,567" / "-€124,529" — use company.base_currency
// compact=true → "+€1.2M"
export const formatPnL = (value, baseCurrency = 'EUR', compact = false) => {
  if (value === null || value === undefined) return '—'
  const symbol = CURRENCY_SYMBOLS[baseCurrency] || baseCurrency + ' '
  const abs  = Math.abs(value)
  const sign = value >= 0 ? '+' : '-'
  if (compact) {
    if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`
  }
  return `${sign}${symbol}${abs.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
}

// ── Numbers ──────────────────────────────────────────────────

// "+€1,234,567" or "-€1,234,567"
// compact=true → "+€1.2M" / "+€842K"
export const formatEUR = (value, compact = false) => {
  if (value === null || value === undefined) return '—'
  const abs  = Math.abs(value)
  const sign = value >= 0 ? '+' : '-'
  if (compact) {
    if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sign}€${(abs / 1_000).toFixed(0)}K`
  }
  return `${sign}€${abs.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
}

// "GBP 1,500,000"
export const formatNotional = (amount, currency) => {
  if (!amount) return '—'
  return `${currency} ${Math.abs(amount).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
}

// "63.5%"
export const formatPct = (value, decimals = 1) => {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(decimals)}%`
}

// "1.3245"
export const formatRate = (value, decimals = 4) => {
  if (!value && value !== 0) return '—'
  return Number(value).toFixed(decimals)
}

// P&L colour — returns hex string for use in style props
export const pnlColour = (value) => {
  if (value === null || value === undefined) return '#9CA3AF'
  return Number(value) >= 0 ? '#10B981' : '#EF4444'
}

// ── Dates — European format dd/mm/yyyy ───────────────────────

// "19/03/2026"
export const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// "19 Mar 2026"
export const formatDateMedium = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// "19 March 2026"
export const formatDateLong = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// "19/03/2026 08:41"
export const formatDateTime = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d)) return '—'
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// "Mon 19 Mar"
export const formatDateShort = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

// "in 45 days" / "3 days ago" / "Today"
export const formatDaysUntil = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d)) return '—'
  const diff = Math.round((d - new Date()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Today'
  return diff > 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`
}
