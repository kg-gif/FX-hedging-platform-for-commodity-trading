// CurrencyFlag.jsx
// Renders a CSS flag icon for a given currency code using the flag-icons library.
// Usage: <CurrencyFlag currency="GBP" /> or <CurrencyFlag currency="EUR" size="lg" />

// Maps ISO 4217 currency codes → ISO 3166-1 alpha-2 country codes (lowercase)
// Exported so chart tick components can derive CSS flag classes without duplicating this map.
export const CURRENCY_TO_COUNTRY = {
  USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', CHF: 'ch',
  NOK: 'no', SEK: 'se', DKK: 'dk', AUD: 'au', CAD: 'ca',
  NZD: 'nz', SGD: 'sg', HKD: 'hk', CNY: 'cn', MXN: 'mx',
  BRL: 'br', ZAR: 'za', INR: 'in', KRW: 'kr', THB: 'th',
  PLN: 'pl', CZK: 'cz', HUF: 'hu', RON: 'ro', TRY: 'tr',
  RUB: 'ru', AED: 'ae', SAR: 'sa', QAR: 'qa', KWD: 'kw',
  ILS: 'il', NGN: 'ng', KES: 'ke', EGP: 'eg', MAD: 'ma',
}

// Size variants: sm = 14px, md = 16px (default), lg = 20px
const SIZE = { sm: '0.875em', md: '1em', lg: '1.25em' }

export default function CurrencyFlag({ currency, size = 'md', className = '' }) {
  if (!currency) return null
  const code = CURRENCY_TO_COUNTRY[currency.toUpperCase()]
  if (!code) return <span className={`text-xs text-gray-400 ${className}`}>{currency}</span>

  return (
    <span
      className={`fi fi-${code} ${className}`}
      style={{
        fontSize: SIZE[size] || SIZE.md,
        borderRadius: '2px',
        flexShrink: 0,
      }}
      title={currency}
    />
  )
}

// Convenience: renders FLAG PAIR/PAIR with both flags
export function CurrencyPairFlags({ pair, size = 'md' }) {
  if (!pair) return null
  const [from, to] = pair.split('/')
  return (
    <span className="inline-flex items-center gap-1">
      <CurrencyFlag currency={from} size={size} />
      <CurrencyFlag currency={to} size={size} />
    </span>
  )
}
