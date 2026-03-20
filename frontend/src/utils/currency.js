// ============================================================
// SHARED CURRENCY UTILITIES
// Import from here — never define CURRENCY_FLAGS or flag
// helpers inline anywhere in the codebase.
// ============================================================

export const CURRENCY_FLAGS = {
  GBP: '🇬🇧', EUR: '🇪🇺', USD: '🇺🇸',
  JPY: '🇯🇵', CHF: '🇨🇭', NOK: '🇳🇴',
  SEK: '🇸🇪', DKK: '🇩🇰', AUD: '🇦🇺',
  NZD: '🇳🇿', CAD: '🇨🇦', SGD: '🇸🇬',
}

// "🇬🇧 GBP"
export const flagCurrency = (ccy) =>
  `${CURRENCY_FLAGS[ccy] || ''} ${ccy}`.trim()

// "🇬🇧🇺🇸 GBP/USD"
export const flagPair = (pair) => {
  if (!pair) return pair
  const [from, to] = pair.split('/')
  return `${CURRENCY_FLAGS[from] || ''}${CURRENCY_FLAGS[to] || ''} ${pair}`.trim()
}
