// FanChart.jsx — forward-rate projection with probability bands
//
// Brand rules (sum-no-how-design-system README "Charts and data visualisation"):
//   - Series colour at 12% opacity for the inner band, 6% for the outer band
//   - Forward path: 1.5px navy line, square joins, straight segments only
//   - Historical path: 1.5px slate line, same weight as forward (spec v0.4)
//   - Today's value: 3px filled gold disc at the join point
//   - Budget reference: dashed gold horizontal (stroke-dasharray 3 3)
//   - Axis labels: 11px slate, tabular numerals
//   - No gridlines except the budget line
//
// Usage (forward only — Hedges screen):
//   <FanChart pair="EUR/USD" spot={1.0847} budget={1.0700} forwardTo={1.0900} days={90} />
//
// Usage (with history — Risk engine, spec v0.4):
//   <FanChart pair="EUR/USD" spot={1.0847} budget={1.0700} forwardTo={1.0900} days={90}
//             history={[{ day: -90, rate: 1.0650 }, ...]} histDays={90} />

import EyebrowLabel from '../EyebrowLabel'

export default function FanChart({
  pair = 'EUR/USD',
  spot = 1.0847,
  budget = 1.0700,
  forwardTo = 1.0900,
  days = 90,
  width = 640,
  height = 280,
  history = null,
  histDays = 90,
}) {
  const M = { top: 28, right: 16, bottom: 32, left: 100 }
  const W = width - M.left - M.right
  const H = height - M.top - M.bottom

  const totalDays = history ? histDays + days : days
  const dayOffset = history ? histDays : 0
  const xScaleDay = (day) => M.left + ((day + dayOffset) / totalDays) * W
  const xScale = (t) => xScaleDay(t * days)
  const yScale = (v, yMin, yMax) => M.top + (1 - (v - yMin) / (yMax - yMin)) * H

  const sigmaInner = 0.012
  const sigmaOuter = 0.024

  const N = 18
  const path = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N
    return {
      t,
      central: spot + (forwardTo - spot) * t,
      innerHalf: sigmaInner * Math.sqrt(t),
      outerHalf: sigmaOuter * Math.sqrt(t),
    }
  })

  const histRates = history ? history.map(h => h.rate) : []
  const yMin = Math.min(budget, ...histRates, ...path.map(p => p.central - p.outerHalf)) - 0.005
  const yMax = Math.max(budget, ...histRates, ...path.map(p => p.central + p.outerHalf)) + 0.005
  const ys = (v) => yScale(v, yMin, yMax)

  const outerPath = [
    ...path.map(p => `${xScale(p.t)},${ys(p.central + p.outerHalf)}`),
    ...[...path].reverse().map(p => `${xScale(p.t)},${ys(p.central - p.outerHalf)}`),
  ].join(' ')
  const innerPath = [
    ...path.map(p => `${xScale(p.t)},${ys(p.central + p.innerHalf)}`),
    ...[...path].reverse().map(p => `${xScale(p.t)},${ys(p.central - p.innerHalf)}`),
  ].join(' ')
  const centralPath = path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t)} ${ys(p.central)}`).join(' ')

  const historicalPath = history
    ? history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xScaleDay(h.day)} ${ys(h.rate)}`).join(' ')
      + ` L ${xScaleDay(0)} ${ys(spot)}`
    : null

  const ticks = Array.from({ length: 5 }, (_, i) => yMin + (yMax - yMin) * (i / 4))

  const xLabels = history
    ? [
        { day: -histDays, label: `-${histDays}d` },
        { day: -Math.round(histDays / 2), label: `-${Math.round(histDays / 2)}d` },
        { day: 0,          label: 'Today' },
        { day: Math.round(days / 2), label: `+${Math.round(days / 2)}d` },
        { day: days,       label: `+${days}d` },
      ]
    : [
        { day: 0,    label: 'Today' },
        { day: Math.round(days / 2), label: `+${Math.round(days / 2)}d` },
        { day: days, label: `+${days}d` },
      ]

  return (
    <div>
      <EyebrowLabel style={{ marginBottom: '8px' }}>Forward rate · {pair}</EyebrowLabel>
      <div className="caption" style={{ marginBottom: '12px', color: 'var(--fg-2)' }}>
        Spot {spot.toFixed(4)} · Budget {budget.toFixed(4)} · {days}-day forward projection with confidence bands
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Fan chart of ${pair} forward rate with 10-90 and 25-75 confidence bands`}
      >
        <polygon points={outerPath} fill="var(--snh-slate)" fillOpacity="0.06" />
        <polygon points={innerPath} fill="var(--snh-slate)" fillOpacity="0.14" />

        <line
          x1={M.left} x2={width - M.right}
          y1={ys(budget)} y2={ys(budget)}
          stroke="var(--snh-gold)" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="square"
        />
        <text
          x={M.left - 8} y={ys(budget)}
          textAnchor="end" dominantBaseline="middle"
          fontSize="11" fill="var(--snh-gold)" fontFamily="var(--font-mono)" fontWeight="700"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          Budget {budget.toFixed(4)}
        </text>

        {history && (
          <line
            x1={xScaleDay(0)} x2={xScaleDay(0)}
            y1={M.top} y2={height - M.bottom}
            stroke="var(--border-1)" strokeWidth="1" strokeDasharray="2 3"
          />
        )}

        {historicalPath && (
          <path d={historicalPath} fill="none" stroke="var(--snh-slate)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        )}

        <path d={centralPath} fill="none" stroke="var(--snh-navy)" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" />

        <circle cx={xScaleDay(0)} cy={ys(spot)} r="4" fill="var(--snh-gold)" />
        <text
          x={xScaleDay(0) + 8} y={ys(spot) - 8}
          textAnchor="start" fontSize="11" fill="var(--snh-navy)"
          fontFamily="var(--font-mono)" fontWeight="700"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {spot.toFixed(4)}
        </text>

        {ticks.map((v, i) => {
          const tooClose = Math.abs(ys(v) - ys(budget)) < 14
          if (tooClose) return null
          return (
            <text key={i} x={M.left - 8} y={ys(v)} textAnchor="end" dominantBaseline="middle"
              fontSize="11" fill="var(--snh-slate)" fontFamily="var(--font-mono)"
              style={{ fontVariantNumeric: 'tabular-nums' }}>
              {v.toFixed(4)}
            </text>
          )
        })}

        {xLabels.map((x, i) => (
          <text key={i} x={xScaleDay(x.day)} y={height - M.bottom + 18}
            textAnchor="middle" fontSize="11"
            fill={x.label === 'Today' ? 'var(--snh-navy)' : 'var(--snh-slate)'}
            fontFamily="var(--font-body)"
            fontWeight={x.label === 'Today' ? '700' : '400'}>
            {x.label}
          </text>
        ))}

        <line x1={M.left} x2={width - M.right} y1={height - M.bottom} y2={height - M.bottom} stroke="var(--border-1)" strokeWidth="1" />
      </svg>

      <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap' }}>
        {history && <Legend swatch="slate-line" label="Historical rate" />}
        <Legend swatch="navy-line"   label="Forward path"     />
        <Legend swatch="slate-fill"  label="25–75 percentile" />
        <Legend swatch="slate-faint" label="10–90 percentile" />
        <Legend swatch="gold-dot"    label="Today's spot"     />
        <Legend swatch="gold-dash"   label="Budget rate"      />
      </div>
    </div>
  )
}

function Legend({ swatch, label }) {
  const renderSwatch = () => {
    switch (swatch) {
      case 'slate-line':  return <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="var(--snh-slate)" strokeWidth="1.5" /></svg>
      case 'navy-line':   return <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="var(--snh-navy)" strokeWidth="1.5" /></svg>
      case 'slate-fill':  return <span style={{ display: 'inline-block', width: 14, height: 8, background: 'var(--snh-slate)', opacity: 0.14 }} />
      case 'slate-faint': return <span style={{ display: 'inline-block', width: 14, height: 8, background: 'var(--snh-slate)', opacity: 0.06 }} />
      case 'gold-dot':    return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--snh-gold)' }} />
      case 'gold-dash':   return <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="var(--snh-gold)" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
      default:            return null
    }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-caption)', color: 'var(--fg-2)' }}>
      {renderSwatch()}
      {label}
    </span>
  )
}
