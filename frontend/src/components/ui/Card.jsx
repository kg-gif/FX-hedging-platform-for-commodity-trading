// Card.jsx — content surface
//
// Brand rules (SNH_BRAND_GUIDE.md v1.2 + design system):
//   - White surface, 1px hairline border, 6px radius, --shadow-1
//   - 24px inset padding
//   - Header slot can carry an eyebrow label and an H3 title
//   - Hover state: border-1 -> border-2 + shadow-1 -> shadow-2 (no lift, no scale)

import EyebrowLabel from './EyebrowLabel'

export default function Card({
  eyebrow,
  title,
  action,
  children,
  hover = false,
  padding = '24px',
  className = '',
  style = {},
}) {
  const baseStyle = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-1)',
    borderRadius: 'var(--radius-3)',
    boxShadow: 'var(--shadow-1)',
    padding,
    transition: hover ? `box-shadow var(--dur-base) var(--ease-standard), border-color var(--dur-base) var(--ease-standard)` : undefined,
    ...style,
  }

  return (
    <div
      className={className}
      style={baseStyle}
      onMouseEnter={hover ? (e) => {
        e.currentTarget.style.borderColor = 'var(--border-2)'
        e.currentTarget.style.boxShadow = 'var(--shadow-2)'
      } : undefined}
      onMouseLeave={hover ? (e) => {
        e.currentTarget.style.borderColor = 'var(--border-1)'
        e.currentTarget.style.boxShadow = 'var(--shadow-1)'
      } : undefined}
    >
      {(eyebrow || title || action) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            {eyebrow && <EyebrowLabel style={{ marginBottom: '6px' }}>{eyebrow}</EyebrowLabel>}
            {title && <h3 className="h3">{title}</h3>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
