// Button.jsx — primary / gold / ghost / danger
//
// Brand rules (SNH_BRAND_GUIDE.md v1.2):
//   - Sentence case labels
//   - Two weights only (400, 700) — button label is 400 (regular)
//   - Hover: navy -> navy-light (no scale, no shadow change)
//   - Press: brief 80ms darken
//   - Focus: gold focus ring (handled globally in snh-tokens.css)
//   - One gold button per view (gold = emphasis, not decoration)

const VARIANTS = {
  primary: {
    background: 'var(--snh-navy)',
    color: 'var(--fg-on-navy)',
    border: '1px solid var(--snh-navy)',
    hoverBg: 'var(--snh-navy-light)',
  },
  gold: {
    background: 'var(--snh-gold)',
    color: 'var(--fg-on-gold)',
    border: '1px solid var(--snh-gold)',
    hoverBg: 'var(--snh-gold)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--snh-navy)',
    border: '1px solid var(--snh-navy)',
    hoverBg: 'rgba(26, 39, 68, 0.04)',
  },
  danger: {
    background: 'var(--snh-danger)',
    color: 'var(--fg-on-navy)',
    border: '1px solid var(--snh-danger)',
    hoverBg: 'var(--snh-danger-dark)',
  },
}

const SIZES = {
  sm: { padding: '6px 12px', fontSize: 'var(--fs-body-sm)' },
  md: { padding: '8px 16px', fontSize: 'var(--fs-body)' },
  lg: { padding: '10px 20px', fontSize: 'var(--fs-body)' },
}

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  children,
  onClick,
  className = '',
  style = {},
  ...rest
}) {
  const v = VARIANTS[variant] || VARIANTS.primary
  const s = SIZES[size] || SIZES.md
  const baseBg = v.background

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={{
        background: baseBg,
        color: v.color,
        border: v.border,
        borderRadius: 'var(--radius-3)',
        padding: s.padding,
        fontSize: s.fontSize,
        fontFamily: 'var(--font-body)',
        fontWeight: 'var(--fw-regular)',
        lineHeight: 1.4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--dur-fast) var(--ease-standard)',
        ...style,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = v.hoverBg }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = baseBg }}
      {...rest}
    >
      {children}
    </button>
  )
}
