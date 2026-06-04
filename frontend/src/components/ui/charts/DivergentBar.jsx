// DivergentBar.jsx — P&L vs budget per currency pair
//
// Brand rules:
//   - Flat fills, no rounded corners, no gradients
//   - Signed colour: positive = success, negative = danger
//   - Hairline baseline at zero
//   - Tabular numerals on all value labels
//   - Most adverse sorts first (risk gets the top of the list)

import EyebrowLabel from '../EyebrowLabel'

export default function DivergentBar({
  data,
  width = 640,
  height = 220,
  unit = 'EUR',
}) {
  const sorted = [...data].sort((a, b) => a.value - b.value)

  const M = { top: 16, right: 24, bottom: 24, left: 110 }
  const W = width - M.left - M.right
  const H = height - M.top - M.bottom

  const maxAbs = Math.max(...sorted.map(d => Math.abs(d.value))) * 1.3
  const rowH = H / sorted.length
  const barH = Math.min(20, rowH * 0.55)

  const centreX = M.left + W / 2
  const xScale = (v) => centreX + (v / maxAbs) * (W / 2)

  const fmt = (v) => {
    const sign = v >= 0 ? '+' : '−'
    return `${sign}${Math.abs(v).toLocaleString('en-GB')}`
  }

  return (
    <div>
      <EyebrowLabel style={{ marginBottom: '8px' }}>P&L vs budget · per pair ({unit})</EyebrowLabel>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Divergent bar chart of P&L vs budget per currency pair"
      >
        <line x1={centreX} x2={centreX} y1={M.top} y2={height - M.bottom} stroke="var(--border-2)" strokeWidth="1" />

        {sorted.map((d, i) => {
          const y = M.top + i * rowH + (rowH - barH) / 2
          const barEnd = xScale(d.value)
          const x0 = d.value < 0 ? barEnd : centreX
          const w = Math.abs(barEnd - centreX)
          const colour = d.value >= 0 ? 'var(--snh-success)' : 'var(--snh-danger)'

          const labelInside = w > 70
          const labelX = labelInside
            ? (d.value < 0 ? barEnd + 6 : barEnd - 6)
            : (d.value < 0 ? barEnd - 6 : barEnd + 6)
          const labelAnchor = labelInside
            ? (d.value < 0 ? 'start' : 'end')
            : (d.value < 0 ? 'end' : 'start')
          const labelFill = labelInside ? '#FFFFFF' : colour

          return (
            <g key={d.pair}>
              <text x={M.left - 12} y={y + barH / 2} textAnchor="end" dominantBaseline="middle"
                fontSize="13" fill="var(--snh-navy)" fontFamily="var(--font-body)" fontWeight="700">
                {d.pair}
              </text>
              <rect x={x0} y={y} width={w} height={barH} fill={colour} />
              <text x={labelX} y={y + barH / 2} textAnchor={labelAnchor} dominantBaseline="middle"
                fontSize="11" fill={labelFill} fontFamily="var(--font-mono)" fontWeight="700"
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(d.value)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
