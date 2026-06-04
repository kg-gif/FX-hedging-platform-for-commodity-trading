// Sparkline.jsx — small spot-vs-budget series with min/max rate labels
//
// Brand rules:
//   - 1.5px stroke, square joins, no curves
//   - Today's value: 3px filled disc
//   - Dashed gold budget line
//   - Rate labels in tabular mono — min and max bracket the line

export default function Sparkline({
  values,
  budget,
  width = 180,
  height = 56,
  label,
  current,
}) {
  const M = { top: 8, right: 8, bottom: 8, left: 4 }
  const W = width - M.left - M.right
  const H = height - M.top - M.bottom

  const yMin = Math.min(...values, budget) - 0.002
  const yMax = Math.max(...values, budget) + 0.002

  const xs = values.map((_, i) => M.left + (i / (values.length - 1)) * W)
  const ys = values.map(v => M.top + (1 - (v - yMin) / (yMax - yMin)) * H)

  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ')
  const last = { x: xs[xs.length - 1], y: ys[ys.length - 1] }
  const direction = values[values.length - 1] >= values[0] ? 'up' : 'down'
  const seriesColour = direction === 'up' ? 'var(--snh-success)' : 'var(--snh-danger)'

  const valMin = Math.min(...values)
  const valMax = Math.max(...values)
  const fmt = (v) => v.toFixed(v < 10 ? 4 : 2)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div
        className="mono"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: `${height}px`,
          fontSize: 10,
          color: 'var(--snh-slate)',
          textAlign: 'right',
          minWidth: 44,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{fmt(valMax)}</span>
        <span>{fmt(valMin)}</span>
      </div>

      <svg width={width} height={height}>
        <line
          x1={M.left} x2={width - M.right}
          y1={M.top + (1 - (budget - yMin) / (yMax - yMin)) * H}
          y2={M.top + (1 - (budget - yMin) / (yMax - yMin)) * H}
          stroke="var(--snh-gold)" strokeWidth="1" strokeDasharray="3 3"
        />
        <path d={path} fill="none" stroke={seriesColour} strokeWidth="1.5" strokeLinejoin="miter" strokeLinecap="square" />
        <circle cx={last.x} cy={last.y} r="3" fill={seriesColour} />
      </svg>

      <div>
        <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--snh-navy)', fontWeight: 'var(--fw-bold)' }}>{label}</div>
        <div className="mono caption" style={{ color: 'var(--fg-2)' }}>{current}</div>
        <div className="mono caption" style={{ color: 'var(--snh-gold)', fontSize: 10 }}>budget {fmt(budget)}</div>
      </div>
    </div>
  )
}
