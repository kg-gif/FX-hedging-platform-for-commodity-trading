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
// Hover: vertical crosshair across full chart. Historical section shows date + rate.
//        Forward section shows +Nd, P50, P25–P75, P10–P90.
// Trendline: optional linear regression over historical points (toggle in legend).
//   Historical section only — NOT extrapolated forward.
//   Disclosure: descriptive (shows where rate has been drifting), not a forecast.
//   Lex sign-off required on disclosure copy before production deploy.
//
// Usage (Phase 3 — pre-computed paths from Monte Carlo API):
//   <FanChart pair="EUR/USD" spot={1.0847} budget={1.0700} days={90}
//             forwardPath={[{ day: 0, rate: 1.0847 }, ...]}
//             confidenceBands={[{ day: 0, p10, p25, p75, p90 }, ...]}
//             history={[{ day: -90, rate: 1.0650 }, ...]} histDays={90} />

import { useState, useRef, useCallback } from 'react'
import EyebrowLabel from '../EyebrowLabel'

// ── Helpers ───────────────────────────────────────────────────────────────────

function linearRegression(points) {
  if (!points || points.length < 2) return null
  const n    = points.length
  const sumX  = points.reduce((s, p) => s + p.day,  0)
  const sumY  = points.reduce((s, p) => s + p.rate, 0)
  const sumXY = points.reduce((s, p) => s + p.day * p.rate, 0)
  const sumX2 = points.reduce((s, p) => s + p.day * p.day,  0)
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return null
  const m = (n * sumXY - sumX * sumY) / denom
  const b = (sumY - m * sumX) / n
  return { m, b }
}

function lerp(arr, day, key) {
  if (!arr || arr.length === 0) return null
  const before = arr.filter(p => p.day <= day)
  const after  = arr.filter(p => p.day >  day)
  if (before.length === 0) return arr[0][key]
  if (after.length  === 0) return arr[arr.length - 1][key]
  const p0 = before[before.length - 1]
  const p1 = after[0]
  const t  = (day - p0.day) / (p1.day - p0.day)
  return p0[key] + t * (p1[key] - p0[key])
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FanChart({
  pair      = 'EUR/USD',
  spot      = 1.0847,
  budget    = 1.0700,
  forwardTo = 1.0900,
  days      = 90,
  width     = 640,
  height    = 280,
  history   = null,
  histDays  = 90,
  forwardPath      = null,
  confidenceBands  = null,
  showHeader       = true,
}) {
  const [hover,         setHover]         = useState(null)
  const [showTrend,     setShowTrend]     = useState(false)
  const [showTrendInfo, setShowTrendInfo] = useState(false)
  const svgRef = useRef(null)

  const usePrecomputed = forwardPath != null && confidenceBands != null

  // ── Layout ─────────────────────────────────────────────────────────────────
  const M = { top: 20, right: 16, bottom: 28, left: 100 }
  const W = width  - M.left - M.right
  const H = height - M.top  - M.bottom

  // ── Coordinate system ──────────────────────────────────────────────────────
  const totalDays = history ? histDays + days : days
  const dayOffset = history ? histDays : 0

  const xScaleDay = (day) => M.left + ((day + dayOffset) / totalDays) * W
  const xScale    = (t)   => xScaleDay(t * days)
  const yScale    = (v, lo, hi) => M.top + (1 - (v - lo) / (hi - lo)) * H

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
    yMin = Math.min(budget, ...histRates, ...forwardPath.map(p => p.rate), ...confidenceBands.map(b => b.p10)) - 0.005
    yMax = Math.max(budget, ...histRates, ...forwardPath.map(p => p.rate), ...confidenceBands.map(b => b.p90)) + 0.005
  } else {
    yMin = Math.min(budget, ...histRates, ...path.map(p => p.central - p.outerHalf)) - 0.005
    yMax = Math.max(budget, ...histRates, ...path.map(p => p.central + p.outerHalf)) + 0.005
  }
  const ys = (v) => yScale(v, yMin, yMax)

  // ── Band polygons ──────────────────────────────────────────────────────────
  let upperTailPolygon, iqrPolygon, lowerTailPolygon
  if (usePrecomputed) {
    upperTailPolygon = [
      ...confidenceBands.map(b => `${xScaleDay(b.day)},${ys(b.p90)}`),
      ...[...confidenceBands].reverse().map(b => `${xScaleDay(b.day)},${ys(b.p75)}`),
    ].join(' ')
    iqrPolygon = [
      ...confidenceBands.map(b => `${xScaleDay(b.day)},${ys(b.p75)}`),
      ...[...confidenceBands].reverse().map(b => `${xScaleDay(b.day)},${ys(b.p25)}`),
    ].join(' ')
    lowerTailPolygon = [
      ...confidenceBands.map(b => `${xScaleDay(b.day)},${ys(b.p25)}`),
      ...[...confidenceBands].reverse().map(b => `${xScaleDay(b.day)},${ys(b.p10)}`),
    ].join(' ')
  } else {
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
  const centralPath = usePrecomputed
    ? forwardPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScaleDay(p.day)} ${ys(p.rate)}`).join(' ')
    : path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t)} ${ys(p.central)}`).join(' ')

  // ── Historical rate line ───────────────────────────────────────────────────
  const historicalPath = history
    ? history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xScaleDay(h.day)} ${ys(h.rate)}`).join(' ')
        + ` L ${xScaleDay(0)} ${ys(spot)}`
    : null

  // ── Trendline (historical section only) ───────────────────────────────────
  const trendReg = history ? linearRegression(history) : null
  const trendLinePath = (showTrend && trendReg && history && history.length >= 2)
    ? (() => {
        const x0 = history[0].day
        const y0 = trendReg.m * x0 + trendReg.b
        const y1 = trendReg.m * 0  + trendReg.b  // at Today (day 0)
        return `M ${xScaleDay(x0)} ${ys(y0)} L ${xScaleDay(0)} ${ys(y1)}`
      })()
    : null

  // ── Y-axis ticks ───────────────────────────────────────────────────────────
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + (yMax - yMin) * (i / 4))

  // ── X-axis labels ──────────────────────────────────────────────────────────
  const xLabels = history
    ? [
        { day: -histDays,                 label: `-${histDays}d`                  },
        { day: -Math.round(histDays / 2), label: `-${Math.round(histDays / 2)}d`  },
        { day: 0,                         label: 'Today'                           },
        { day: Math.round(days / 2),      label: `+${Math.round(days / 2)}d`      },
        { day: days,                      label: `+${days}d`                       },
      ]
    : [
        { day: 0,                    label: 'Today'                      },
        { day: Math.round(days / 2), label: `+${Math.round(days / 2)}d` },
        { day: days,                 label: `+${days}d`                  },
      ]

  // ── Hover handler ──────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current) return
    const rect  = svgRef.current.getBoundingClientRect()
    const svgX  = ((e.clientX - rect.left) / rect.width) * width
    const rawDay = ((svgX - M.left) / W) * totalDays - dayOffset

    if (svgX < M.left || svgX > width - M.right) { setHover(null); return }

    const dayInt = Math.round(rawDay)
    const clampedDay = Math.max(-histDays, Math.min(days, dayInt))

    if (clampedDay <= 0 && history) {
      // Historical section — snap to nearest point
      const nearest = history.reduce((best, p) =>
        Math.abs(p.day - clampedDay) < Math.abs(best.day - clampedDay) ? p : best
      , history[0])
      setHover({
        svgX:      xScaleDay(nearest.day),
        day:       nearest.day,
        isForward: false,
        rate:      nearest.rate,
      })
    } else {
      // Forward section — interpolate
      setHover({
        svgX:      xScaleDay(clampedDay),
        day:       clampedDay,
        isForward: true,
        p50: usePrecomputed ? lerp(forwardPath,     clampedDay, 'rate') : null,
        p10: usePrecomputed ? lerp(confidenceBands, clampedDay, 'p10')  : null,
        p25: usePrecomputed ? lerp(confidenceBands, clampedDay, 'p25')  : null,
        p75: usePrecomputed ? lerp(confidenceBands, clampedDay, 'p75')  : null,
        p90: usePrecomputed ? lerp(confidenceBands, clampedDay, 'p90')  : null,
      })
    }
  }, [history, histDays, days, totalDays, dayOffset, width, W, usePrecomputed, forwardPath, confidenceBands]) // eslint-disable-line

  const handleMouseLeave = useCallback(() => setHover(null), [])

  // ── Tooltip position (percentage of div width) ────────────────────────────
  const tooltipLeft  = hover ? (hover.svgX / width) * 100 : 0
  const flipToLeft   = hover && hover.svgX > width * 0.62

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      {showHeader && (
        <>
          <EyebrowLabel style={{ marginBottom: '8px' }}>Forward rate · {pair}</EyebrowLabel>
          <div className="caption" style={{ marginBottom: '12px', color: 'var(--fg-2)' }}>
            Spot {spot.toFixed(4)} · Budget {budget.toFixed(4)} · {days}-day forward projection with confidence bands
          </div>
        </>
      )}

      {/* ── SVG chart ──────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Fan chart of ${pair} forward rate — three confidence zones: tail (P10–P25), IQR (P25–P75), tail (P75–P90)`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'crosshair', display: 'block' }}
      >
        {/* Band zones */}
        <polygon points={lowerTailPolygon} fill="var(--snh-slate)" fillOpacity="0.07" />
        <polygon points={upperTailPolygon} fill="var(--snh-slate)" fillOpacity="0.07" />
        <polygon points={iqrPolygon}       fill="var(--snh-slate)" fillOpacity="0.16" />

        {/* Budget reference */}
        <line
          x1={M.left} x2={width - M.right}
          y1={ys(budget)} y2={ys(budget)}
          stroke="var(--snh-gold)" strokeWidth="1.5"
          strokeDasharray="3 3" strokeLinecap="square"
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

        {/* Today divider */}
        {history && (
          <line
            x1={xScaleDay(0)} x2={xScaleDay(0)}
            y1={M.top} y2={height - M.bottom}
            stroke="var(--border-1)" strokeWidth="1" strokeDasharray="2 3"
          />
        )}

        {/* Historical rate line */}
        {historicalPath && (
          <path
            d={historicalPath}
            fill="none" stroke="var(--snh-slate)"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          />
        )}

        {/* Trendline — historical section only, not extrapolated */}
        {trendLinePath && (
          <path
            d={trendLinePath}
            fill="none"
            stroke="var(--snh-slate)"
            strokeWidth="1"
            strokeDasharray="4 3"
            strokeLinecap="round"
            opacity="0.55"
          />
        )}

        {/* Central forward path */}
        <path
          d={centralPath}
          fill="none" stroke="var(--snh-navy)"
          strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter"
        />

        {/* Today's spot disc */}
        <circle cx={xScaleDay(0)} cy={ys(spot)} r="4" fill="var(--snh-gold)" />
        <text
          x={xScaleDay(0) + 8} y={ys(spot) - 8}
          textAnchor="start" fontSize="11"
          fill="var(--snh-navy)" fontFamily="var(--font-mono)" fontWeight="700"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {spot.toFixed(4)}
        </text>

        {/* Y-axis ticks */}
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
            textAnchor="middle" fontSize="11"
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

        {/* Hover crosshair */}
        {hover && (
          <line
            x1={hover.svgX} x2={hover.svgX}
            y1={M.top} y2={height - M.bottom}
            stroke="var(--snh-navy)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.4"
            pointerEvents="none"
          />
        )}
      </svg>

      {/* ── Hover tooltip (DOM, positioned over SVG) ───────────────────────── */}
      {hover && (
        <div
          style={{
            position:    'absolute',
            top:         `${(M.top / height) * 100}%`,
            left:        `${tooltipLeft}%`,
            transform:   flipToLeft ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            background:  'var(--surface-1, #fff)',
            border:      '1px solid var(--border-1)',
            borderRadius: 'var(--radius-2, 6px)',
            padding:     '8px 12px',
            boxShadow:   '0 2px 8px rgba(0,0,0,0.10)',
            fontSize:    'var(--fs-caption, 11px)',
            fontFamily:  'var(--font-mono)',
            color:       'var(--snh-navy)',
            lineHeight:  '1.6',
            pointerEvents: 'none',
            whiteSpace:  'nowrap',
            zIndex:      10,
          }}
        >
          {hover.isForward ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                +{hover.day}d
              </div>
              {hover.p50 != null && (
                <div>P50 (median) <span style={{ float: 'right', paddingLeft: 16 }}>{hover.p50.toFixed(4)}</span></div>
              )}
              {hover.p25 != null && hover.p75 != null && (
                <div style={{ color: 'var(--fg-2)' }}>
                  IQR P25–P75 <span style={{ float: 'right', paddingLeft: 16 }}>{hover.p25.toFixed(4)}–{hover.p75.toFixed(4)}</span>
                </div>
              )}
              {hover.p10 != null && hover.p90 != null && (
                <div style={{ color: 'var(--fg-3)' }}>
                  Tail P10–P90 <span style={{ float: 'right', paddingLeft: 16 }}>{hover.p10.toFixed(4)}–{hover.p90.toFixed(4)}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {hover.day === 0 ? 'Today' : `${hover.day}d`}
              </div>
              {hover.rate != null && (
                <div>Rate <span style={{ float: 'right', paddingLeft: 16 }}>{hover.rate.toFixed(4)}</span></div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Legend + trendline toggle ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {history && <Legend swatch="slate-line" label="Historical rate" />}
        <Legend swatch="navy-line"   label="Forward path (P50)"              />
        <Legend swatch="slate-fill"  label="IQR (P25–P75)"                   />
        <Legend swatch="slate-faint" label="Tail zones (P10–P25 · P75–P90)" />
        <Legend swatch="gold-dot"    label="Today's spot"                    />
        <Legend swatch="gold-dash"   label="Budget rate"                     />

        {/* Trendline toggle — only shown when history data is available */}
        {history && trendReg && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: 'var(--fs-caption)', color: 'var(--fg-2)', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={showTrend}
                onChange={e => setShowTrend(e.target.checked)}
                style={{ accentColor: 'var(--snh-slate)', cursor: 'pointer', width: 12, height: 12 }}
              />
              {/* Trendline swatch — faint dashed */}
              <svg width="20" height="6" style={{ opacity: 0.55 }}>
                <line x1="0" y1="3" x2="20" y2="3" stroke="var(--snh-slate)" strokeWidth="1" strokeDasharray="4 3" />
              </svg>
              Historical trend
            </label>

            {/* Info icon — shows Finn's disclosure */}
            <button
              onClick={() => setShowTrendInfo(v => !v)}
              onBlur={() => setShowTrendInfo(false)}
              aria-label="About the historical trend line"
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', color: 'var(--fg-3)',
                fontSize: '11px', lineHeight: 1,
              }}
            >
              ⓘ
            </button>

            {/* Disclosure popover — Lex sign-off required on this copy */}
            {showTrendInfo && (
              <div style={{
                position:     'absolute',
                bottom:       '24px',
                left:         0,
                width:        '260px',
                background:   'var(--surface-1, #fff)',
                border:       '1px solid var(--border-1)',
                borderRadius: 'var(--radius-2, 6px)',
                padding:      '10px 12px',
                boxShadow:    '0 2px 8px rgba(0,0,0,0.10)',
                fontSize:     'var(--fs-caption, 11px)',
                color:        'var(--fg-2)',
                lineHeight:   '1.5',
                zIndex:       20,
              }}>
                <strong style={{ color: 'var(--snh-navy)', display: 'block', marginBottom: 4 }}>
                  Historical trend — descriptive only
                </strong>
                This line shows the direction the rate has been drifting over the historical period shown.
                It is a simple linear fit to past closing rates and is{' '}
                <strong>not a forecast</strong>. Past rate movements are not indicative of future rates.
                This tool is for information only and does not constitute financial advice.
              </div>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Legend swatch ─────────────────────────────────────────────────────────────

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
