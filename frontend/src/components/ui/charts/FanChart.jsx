// FanChart.jsx — forward-rate projection with probability bands
//
// Brand rules (sum-no-how-design-system README "Charts and data visualisation"):
//   - Three non-overlapping confidence zones:
//       · Tail zones (P10–P25 and P75–P90): slate at 7% opacity
//       · IQR core (P25–P75):               slate at 16% opacity
//   - Forward path: 1.5px navy line, square joins, straight segments only
//   - Historical path: 1.5px slate line, same weight as forward (spec v0.4)
//   - Today's value: 4px filled gold disc at the join point
//   - Budget reference: dashed gold horizontal (stroke-dasharray 3 3)
//   - Axis labels: 11px slate, tabular numerals
//   - Units always inline with the number
//   - No gridlines except the budget line
//
// Usage (forward only — Hedges screen):
//   <FanChart pair="EUR/USD" spot={1.0847} budget={1.0700} forwardTo={1.0900} days={90} />
//
// Usage (with history — Risk engine, spec v0.4):
//   <FanChart pair="EUR/USD" spot={1.0847} budget={1.0700} forwardTo={1.0900} days={90}
//             history={[{ day: -90, rate: 1.0650 }, ...]} histDays={90} />
//
// Usage (Phase 3 — pre-computed paths from Monte Carlo API):
//   <FanChart pair="EUR/USD" spot={1.0847} budget={1.0700} days={90}
//             forwardPath={[{ day: 0, rate: 1.0847 }, { day: 10, rate: 1.0862 }, ...]}
//             confidenceBands={[{ day: 0, p10, p25, p75, p90 }, ...]}
//             history={[{ day: -90, rate: 1.0650 }, ...]} histDays={90} />
//
// When forwardPath + confidenceBands are supplied, the chart renders the actual GBM
// output from the backend. When omitted, it falls back to the internal √t-scaled
// approximation (used on the Hedges screen and Phase 2 mock). Both modes are supported
// simultaneously — no breaking change for existing call sites.

import EyebrowLabel from '../EyebrowLabel'

export default function FanChart({
  pair      = 'EUR/USD',
  spot      = 1.0847,
  budget    = 1.0700,
  forwardTo = 1.0900,   // used only when forwardPath is not supplied
  days      = 90,
  width     = 640,
  height    = 280,
  history   = null,     // [{ day: -90, rate: 1.065 }, ...] — optional historical line
  histDays  = 90,       // span of historical data shown left of Today
  // Phase 3 pre-computed props — when both are supplied the internal σ-approximation
  // is bypassed and the actual GBM percentile output is used instead.
  forwardPath      = null, // [{ day: 0, rate }, { day: 10, rate }, ...] — P50 central path
  confidenceBands  = null, // [{ day: 0, p10, p25, p75, p90 }, ...] — percentile fan
  // Set false when the parent card already provides context (e.g. Risk Engine).
  // Suppresses the internal eyebrow and caption to avoid 4 header lines before the chart.
  showHeader       = true,
}) {
  // Whether to use pre-computed paths (Phase 3) or internal σ approximation (Phase 2 / Hedges)
  const usePrecomputed = forwardPath != null && confidenceBands != null

  // Layout
  const M = { top: 20, right: 16, bottom: 28, left: 100 }
  const W = width - M.left - M.right
  const H = height - M.top - M.bottom

  // ── Coordinate system ──────────────────────────────────────────────────────
  // x-axis spans (-histDays → +days) when history is present; (0 → days) otherwise.
  // "Today" sits at day 0.
  const totalDays = history ? histDays + days : days
  const dayOffset = history ? histDays : 0

  const xScaleDay = (day) => M.left + ((day + dayOffset) / totalDays) * W
  const xScale    = (t)   => xScaleDay(t * days)   // t ∈ [0,1] → day ∈ [0, days]

  const yScale = (v, yMin, yMax) => M.top + (1 - (v - yMin) / (yMax - yMin)) * H

  // ── Internal σ approximation — used when forwardPath/confidenceBands not supplied ──
  const sigmaInner = 0.012
  const sigmaOuter = 0.024
  const N    = 18
  const path = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N
    return {
      t,
      central:   spot + (forwardTo - spot) * t,
      innerHalf: sigmaInner * Math.sqrt(t),
      outerHalf: sigmaOuter * Math.sqrt(t),
    }
  })

  // ── Y-axis range ───────────────────────────────────────────────────────────
  const histRates = history ? history.map(h => h.rate) : []

  let yMin, yMax
  if (usePrecomputed) {
    const fwdRates   = forwardPath.map(p => p.rate)
    const bandLow    = confidenceBands.map(b => b.p10)
    const bandHigh   = confidenceBands.map(b => b.p90)
    yMin = Math.min(budget, ...histRates, ...fwdRates, ...bandLow)  - 0.005
    yMax = Math.max(budget, ...histRates, ...fwdRates, ...bandHigh) + 0.005
  } else {
    yMin = Math.min(budget, ...histRates, ...path.map(p => p.central - p.outerHalf)) - 0.005
    yMax = Math.max(budget, ...histRates, ...path.map(p => p.central + p.outerHalf)) + 0.005
  }

  const ys = (v) => yScale(v, yMin, yMax)

  // ── Band polygons — three non-overlapping zones ────────────────────────────
  // Each polygon is a closed shape: traverse top edge L→R, bottom edge R→L.
  // Rendering order: tail zones first (bottom layer), IQR core on top.
  let upperTailPolygon, iqrPolygon, lowerTailPolygon
  if (usePrecomputed) {
    // Upper tail P75–P90
    upperTailPolygon = [
      ...confidenceBands.map(b => `${xScaleDay(b.day)},${ys(b.p90)}`),
      ...[...confidenceBands].reverse().map(b => `${xScaleDay(b.day)},${ys(b.p75)}`),
    ].join(' ')
    // IQR core P25–P75
    iqrPolygon = [
      ...confidenceBands.map(b => `${xScaleDay(b.day)},${ys(b.p75)}`),
      ...[...confidenceBands].reverse().map(b => `${xScaleDay(b.day)},${ys(b.p25)}`),
    ].join(' ')
    // Lower tail P10–P25
    lowerTailPolygon = [
      ...confidenceBands.map(b => `${xScaleDay(b.day)},${ys(b.p25)}`),
      ...[...confidenceBands].reverse().map(b => `${xScaleDay(b.day)},${ys(b.p10)}`),
    ].join(' ')
  } else {
    // σ-approximation fallback (Hedges screen) — split into equivalent three zones
    upperTailPolygon = [
      ...path.map(p => `${xScale(p.t)},${ys(p.central + p.outerHalf)}`),
      ...[...path].reverse().map(p => `${xScale(p.t)},${ys(p.central + p.innerHalf)}`),
    ].join(' ')
    iqrPolygon = [
      ...path.map(p => `${xScale(p.t)},${ys(p.central + p.innerHalf)}`),
      ...[...path].reverse().map(p => `${xScale(p.t)},${ys(p.central - p.innerHalf)}`),
    ].join(' ')
    lowerTailPolygon = [
      ...path.map(p => `${xScale(p.t)},${ys(p.central - p.innerHalf)}`),
      ...[...path].reverse().map(p => `${xScale(p.t)},${ys(p.central - p.outerHalf)}`),
    ].join(' ')
  }

  // ── Central forward path ───────────────────────────────────────────────────
  let centralPath
  if (usePrecomputed) {
    centralPath = forwardPath
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScaleDay(p.day)} ${ys(p.rate)}`)
      .join(' ')
  } else {
    centralPath = path
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t)} ${ys(p.central)}`)
      .join(' ')
  }

  // ── Historical rate line ───────────────────────────────────────────────────
  const historicalPath = history
    ? history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xScaleDay(h.day)} ${ys(h.rate)}`).join(' ')
        + ` L ${xScaleDay(0)} ${ys(spot)}`  // connect final history point to Today's spot
    : null

  // ── Y-axis ticks ───────────────────────────────────────────────────────────
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + (yMax - yMin) * (i / 4))

  // ── X-axis labels ──────────────────────────────────────────────────────────
  const xLabels = history
    ? [
        { day: -histDays,                  label: `-${histDays}d`                   },
        { day: -Math.round(histDays / 2),  label: `-${Math.round(histDays / 2)}d`   },
        { day: 0,                          label: 'Today'                            },
        { day: Math.round(days / 2),       label: `+${Math.round(days / 2)}d`       },
        { day: days,                       label: `+${days}d`                        },
      ]
    : [
        { day: 0,                    label: 'Today'                      },
        { day: Math.round(days / 2), label: `+${Math.round(days / 2)}d` },
        { day: days,                 label: `+${days}d`                  },
      ]

  return (
    <div>
      {showHeader && (
        <>
          <EyebrowLabel style={{ marginBottom: '8px' }}>Forward rate · {pair}</EyebrowLabel>
          <div className="caption" style={{ marginBottom: '12px', color: 'var(--fg-2)' }}>
            Spot {spot.toFixed(4)} · Budget {budget.toFixed(4)} · {days}-day forward projection with confidence bands
          </div>
        </>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Fan chart of ${pair} forward rate — three confidence zones: tail (P10–P25), IQR (P25–P75), tail (P75–P90)`}
      >
        {/* Lower tail — P10–P25 (or σ lower tail). Drawn first, below IQR. */}
        <polygon
          points={lowerTailPolygon}
          fill="var(--snh-slate)"
          fillOpacity="0.07"
        />
        {/* Upper tail — P75–P90 (or σ upper tail). Drawn first, below IQR. */}
        <polygon
          points={upperTailPolygon}
          fill="var(--snh-slate)"
          fillOpacity="0.07"
        />
        {/* IQR core — P25–P75 (or σ inner). Drawn on top of tail zones. */}
        <polygon
          points={iqrPolygon}
          fill="var(--snh-slate)"
          fillOpacity="0.16"
        />

        {/* Budget reference — dashed gold horizontal */}
        <line
          x1={M.left} x2={width - M.right}
          y1={ys(budget)} y2={ys(budget)}
          stroke="var(--snh-gold)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeLinecap="square"
        />
        <text
          x={M.left - 8} y={ys(budget)}
          textAnchor="end" dominantBaseline="middle"
          fontSize="11" fill="var(--snh-gold)"
          fontFamily="var(--font-mono)" fontWeight="700"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          Budget {budget.toFixed(4)}
        </text>

        {/* Today divider — subtle vertical when history is shown */}
        {history && (
          <line
            x1={xScaleDay(0)} x2={xScaleDay(0)}
            y1={M.top} y2={height - M.bottom}
            stroke="var(--border-1)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        )}

        {/* Historical rate line — slate, drawn under forward path */}
        {historicalPath && (
          <path
            d={historicalPath}
            fill="none"
            stroke="var(--snh-slate)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Central forward path — navy */}
        <path
          d={centralPath}
          fill="none"
          stroke="var(--snh-navy)"
          strokeWidth="1.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />

        {/* Today's value — gold disc at join point */}
        <circle cx={xScaleDay(0)} cy={ys(spot)} r="4" fill="var(--snh-gold)" />
        <text
          x={xScaleDay(0) + 8} y={ys(spot) - 8}
          textAnchor="start"
          fontSize="11" fill="var(--snh-navy)"
          fontFamily="var(--font-mono)" fontWeight="700"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {spot.toFixed(4)}
        </text>

        {/* Y-axis tick labels */}
        {ticks.map((v, i) => {
          if (Math.abs(ys(v) - ys(budget)) < 14) return null
          return (
            <text
              key={i}
              x={M.left - 8} y={ys(v)}
              textAnchor="end" dominantBaseline="middle"
              fontSize="11" fill="var(--snh-slate)"
              fontFamily="var(--font-mono)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {v.toFixed(4)}
            </text>
          )
        })}

        {/* X-axis labels */}
        {xLabels.map((x, i) => (
          <text
            key={i}
            x={xScaleDay(x.day)} y={height - M.bottom + 18}
            textAnchor="middle"
            fontSize="11"
            fill={x.label === 'Today' ? 'var(--snh-navy)' : 'var(--snh-slate)'}
            fontFamily="var(--font-body)"
            fontWeight={x.label === 'Today' ? '700' : '400'}
          >
            {x.label}
          </text>
        ))}

        {/* X baseline */}
        <line
          x1={M.left} x2={width - M.right}
          y1={height - M.bottom} y2={height - M.bottom}
          stroke="var(--border-1)" strokeWidth="1"
        />
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap' }}>
        {history && <Legend swatch="slate-line"  label="Historical rate"          />}
        <Legend swatch="navy-line"   label="Forward path (P50)"                   />
        <Legend swatch="slate-fill"  label="IQR (P25–P75)"                        />
        <Legend swatch="slate-faint" label="Tail zones (P10–P25 · P75–P90)"      />
        <Legend swatch="gold-dot"    label="Today's spot"                         />
        <Legend swatch="gold-dash"   label="Budget rate"                          />
      </div>
    </div>
  )
}

function Legend({ swatch, label }) {
  const renderSwatch = () => {
    switch (swatch) {
      case 'slate-line':
        return <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="var(--snh-slate)" strokeWidth="1.5" /></svg>
      case 'navy-line':
        return <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="var(--snh-navy)" strokeWidth="1.5" /></svg>
      case 'slate-fill':
        return <span style={{ display: 'inline-block', width: 14, height: 8, background: 'var(--snh-slate)', opacity: 0.14 }} />
      case 'slate-faint':
        return <span style={{ display: 'inline-block', width: 14, height: 8, background: 'var(--snh-slate)', opacity: 0.06 }} />
      case 'gold-dot':
        return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--snh-gold)' }} />
      case 'gold-dash':
        return <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="var(--snh-gold)" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
      default:
        return null
    }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-caption)', color: 'var(--fg-2)' }}>
      {renderSwatch()}
      {label}
    </span>
  )
}
