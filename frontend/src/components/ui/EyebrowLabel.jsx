// EyebrowLabel.jsx — small UPPERCASE label sitting above headings
//
// Brand rules (SNH_BRAND_GUIDE.md v1.2):
//   - 11px, UPPERCASE, 0.14em tracking, gold colour
//   - Used as the section label above an H3 (Card header) or above a stat tile
//   - This is the only place UPPERCASE is allowed in SNH UI

export default function EyebrowLabel({ children, className = '', style = {} }) {
  return (
    <div
      className={className}
      style={{
        fontSize: 'var(--fs-eyebrow)',
        lineHeight: 1.20,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 'var(--fw-bold)',
        color: 'var(--snh-gold)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
