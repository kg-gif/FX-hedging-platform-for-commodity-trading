// CoverageGauge.jsx — 180° gauge for hedge coverage / utilisation
//
// Brand rules (design system charts spec):
//   - Three coloured zones: danger (0-25%), gold (25-75%), success (75-100%)
//   - Navy needle, 3px filled disc at the value
//   - Big figure at gauge centre in KaTeX_Main 700
//   - Tabular numerals

import EyebrowLabel from '../EyebrowLabel'

export default function CoverageGauge({
  value = 68,
  label = 'Hedge coverage',
  caption = 'Across portfolio',
  colour = null,
}) {
  const VB = 240
  const VBh = 160
  const cx = VB / 2
  const cy = VBh - 30
  const r = 80
  const strokeW = 14

  const arc = (startPct, endPct) => {
    const start = Math.PI + Math.PI * startPct
    const end = Math.PI + Math.PI * endPct
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end)
    const y2 = cy + r * Math.sin(end)
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }

  const angle = Math.PI + Math.PI * (Math.max(0, Math.min(100, value)) / 100)
  const nx = cx + r * Math.cos(angle)
  const ny = cy + r * Math.sin(angle)

  return (
    <div>
      <EyebrowLabel style={{ marginBottom: '8px' }}>{label}</EyebrowLabel>
      <svg
        viewBox={`0 0 ${VB} ${VBh}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${label}: ${value}%`}
        style={{ maxWidth: 260 }}
      >
        <path d={arc(0, 0.25)}    fill="none" stroke="var(--snh-danger)"  strokeWidth={strokeW} strokeLinecap="butt" />
        <path d={arc(0.25, 0.75)} fill="none" stroke="var(--snh-gold)"    strokeWidth={strokeW} strokeLinecap="butt" />
        <path d={arc(0.75, 1)}    fill="none" stroke="var(--snh-success)" strokeWidth={strokeW} strokeLinecap="butt" />

        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={colour || 'var(--snh-navy)'} strokeWidth="2" strokeLinecap="square" />
        <circle cx={cx} cy={cy} r="6" fill={colour || 'var(--snh-navy)'} />
        <circle cx={nx} cy={ny} r="5" fill={colour || 'var(--snh-navy)'} />

        <text x={cx} y={cy - 26} textAnchor="middle" dominantBaseline="middle"
          fontSize="34" fontFamily="var(--font-display)" fontWeight="700" fill="var(--snh-navy)"
          style={{ fontVariantNumeric: 'tabular-nums' }}>
          {value}%
        </text>

        <text
          x={cx + (r + strokeW) * Math.cos(Math.PI + Math.PI * 0.25)}
          y={cy + (r + strokeW) * Math.sin(Math.PI + Math.PI * 0.25) - 4}
          textAnchor="middle" fontSize="10" fill="var(--snh-slate)" fontFamily="var(--font-mono)">
          25
        </text>
        <text
          x={cx + (r + strokeW) * Math.cos(Math.PI + Math.PI * 0.75)}
          y={cy + (r + strokeW) * Math.sin(Math.PI + Math.PI * 0.75) - 4}
          textAnchor="middle" fontSize="10" fill="var(--snh-slate)" fontFamily="var(--font-mono)">
          75
        </text>
      </svg>
      <div className="caption" style={{ textAlign: 'center', marginTop: '4px', color: 'var(--fg-2)' }}>{caption}</div>
    </div>
  )
}
