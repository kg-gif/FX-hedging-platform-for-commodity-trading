// FXReportVisuals.jsx
// Source: Pixel (Design) · 28 April 2026 — integrated by Axel
// All charts use custom SVG — no Recharts dependency required.

import { useMemo } from "react";
import { NAVY, GOLD, DANGER, WARNING, SUCCESS } from "../brand";

// ── Brand tokens (maps platform palette + chart-specific slate) ────────────
const C = {
  navy:    NAVY,
  gold:    GOLD,
  slate:   '#8DA4C4',
  danger:  DANGER,
  warning: WARNING,
  success: SUCCESS,
};
const MONO = "'Menlo','Consolas','Courier New',monospace";

// ── Formatters ─────────────────────────────────────────────────────────────
const fmtEur = (n, noSign = false) => {
  const s = !noSign && n > 0 ? '+' : !noSign && n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return `${s}EUR ${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}EUR ${(a / 1e3).toFixed(0)}k`;
  return `${s}EUR ${a.toLocaleString('en-GB')}`;
};

// ── Shared card ────────────────────────────────────────────────────────────
const Card = ({ label, children, style = {} }) => (
  <div style={{
    background: 'var(--color-background-primary, #fff)',
    borderRadius: 12,
    border: '0.5px solid var(--color-border-tertiary)',
    padding: '16px 18px',
    ...style,
  }}>
    <span style={{
      display: 'block',
      color: C.slate,
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 14,
    }}>{label}</span>
    {children}
  </div>
);

// ── P1: Portfolio P&L bar chart ────────────────────────────────────────────
// Props: data = [{ pair: string, pl: number }] — sorted by |pl| descending
const PLBarChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <p style={{ color: C.slate, fontSize: 12, margin: 0 }}>No position data available.</p>;
  }
  const max = Math.max(...data.map(d => Math.abs(d.pl)));
  if (max === 0) return <p style={{ color: C.slate, fontSize: 12, margin: 0 }}>All P&amp;L at zero.</p>;
  return (
    <div>
      {data.map((d, i) => {
        const pct = ((Math.abs(d.pl) / max) * 44).toFixed(2);
        const pos = d.pl >= 0;
        const col = pos ? C.success : C.danger;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ width: 68, textAlign: 'right', paddingRight: 9, color: C.slate, fontSize: 11, fontFamily: MONO, flexShrink: 0 }}>
              {d.pair}
            </span>
            <div style={{ flex: 1, position: 'relative', height: 17 }}>
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: C.slate, opacity: 0.3, transform: 'translateX(-0.5px)' }} />
              <div style={{
                position: 'absolute', height: '100%', width: `${pct}%`,
                ...(pos ? { left: '50%', borderRadius: '0 3px 3px 0' } : { right: '50%', borderRadius: '3px 0 0 3px' }),
                background: col, opacity: 0.85,
              }} />
            </div>
            <span style={{ width: 88, paddingLeft: 9, color: col, fontSize: 11, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {fmtEur(d.pl)}
            </span>
          </div>
        );
      })}
      <div style={{ padding: '3px 88px 0 68px', textAlign: 'center', fontSize: 10, color: C.slate, letterSpacing: '0.08em' }}>
        BUDGET
      </div>
    </div>
  );
};

// ── P2: Hedge coverage gauge ───────────────────────────────────────────────
// Props: value (0–100), policyMin (default 40), policyTarget (default 75)
// Uses stroke-dasharray on overlapping circles (more reliable than arc paths).
// Circumference = 2π×68 ≈ 427.26; semicircle arc = 213.63.
// Each zone dash = (zone_pct / 100) × 213.63.
// Rotating -180° on each circle moves the stroke start to 9 o'clock (left).
const HedgeGauge = ({ value, policyMin = 40, policyTarget = 75 }) => {
  const W = 200, H = 116, cx = 100, cy = 108, r = 68, sw = 11;
  const circ = 2 * Math.PI * r;        // ≈ 427.26 — full circumference
  const semi  = circ / 2;              // ≈ 213.63 — semicircle arc length
  const cl    = (v) => Math.max(0, Math.min(100, v));

  // Arc dash lengths for each coloured zone
  const redLen   = cl(policyMin)                       / 100 * semi;
  const amberLen = (cl(policyTarget) - cl(policyMin))  / 100 * semi;
  const greenLen = (100 - cl(policyTarget))            / 100 * semi;

  // Starting rotation for amber and green zones.
  // -180° = 9 o'clock (0%), each additional 1% = +1.8°
  const amberRot = -180 + cl(policyMin)    / 100 * 180;
  const greenRot = -180 + cl(policyTarget) / 100 * 180;

  // Needle tip — same polar formula, independent of arc implementation
  const na = Math.PI * (1 - cl(value) / 100);
  const nx = cx + (r - 8) * Math.cos(na);
  const ny = cy - (r - 8) * Math.sin(na);

  // Policy target tick — white hairline crossing the arc at the target boundary
  const tA  = Math.PI * (1 - cl(policyTarget) / 100);
  const t1x = cx + (r - 2)      * Math.cos(tA);
  const t1y = cy - (r - 2)      * Math.sin(tA);
  const t2x = cx + (r + sw + 2) * Math.cos(tA);
  const t2y = cy - (r + sw + 2) * Math.sin(tA);

  const arc = (len, color, rotDeg) => (
    <circle
      cx={cx} cy={cy} r={r}
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeDasharray={`${len} ${circ - len}`}
      strokeLinecap="butt"
      transform={`rotate(${rotDeg} ${cx} ${cy})`}
    />
  );

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        role="img" aria-label={`Hedge coverage gauge: ${value}%, policy minimum ${policyMin}%, target ${policyTarget}%`}
        style={{ overflow: 'visible' }}>

        {/* Track — full semicircle, light navy */}
        {arc(semi, 'rgba(26,39,68,.1)', -180)}

        {/* Coloured zone arcs — layered on top of track */}
        {redLen   > 0 && arc(redLen,   C.danger,  -180)}
        {amberLen > 0 && arc(amberLen, C.warning, amberRot)}
        {greenLen > 0 && arc(greenLen, C.success, greenRot)}

        {/* Policy target tick */}
        <line x1={t1x} y1={t1y} x2={t2x} y2={t2y} stroke="#fff" strokeWidth="2.5" />

        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.navy} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={C.navy} />
        <circle cx={cx} cy={cy} r="2.5" style={{ fill: 'var(--color-background-primary, #fff)' }} />

        {/* Value + label */}
        <text x={cx} y={cy - 19} textAnchor="middle" fontSize="24" fontWeight="600" fill={C.navy} fontFamily={MONO}>{value}%</text>
        <text x={cx} y={cy - 5}  textAnchor="middle" fontSize="10"  fill={C.slate} letterSpacing=".08em">COVERAGE</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '2px 6px 0', color: C.slate }}>
        <span style={{ color: C.danger }}>▪ &lt;{policyMin}%</span>
        <span style={{ color: C.warning }}>▪ Defensive</span>
        <span style={{ color: C.success }}>▪ Target</span>
      </div>
    </div>
  );
};

// ── P3: Sparkline grid ─────────────────────────────────────────────────────
// Props: data = [{ pair, budget, rates: number[], favorable: bool }]
// favorable = true means rate above budget is good (e.g. selling foreign CCY)
const SparklineGrid = ({ data }) => {
  if (!data || data.length === 0) return null;
  const W = 158, H = 44, pd = 1;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
      {data.map((s, i) => {
        const allV = [...s.rates, s.budget];
        const mn = Math.min(...allV), mx = Math.max(...allV), rng = mx - mn || 1;
        const X = (idx) => (pd + (idx / (s.rates.length - 1)) * (W - pd * 2)).toFixed(1);
        const Y = (v)   => (H - pd - ((v - mn) / rng) * (H - pd * 2)).toFixed(1);
        const bY = Y(s.budget);
        const col = s.favorable ? C.success : C.danger;
        const fillCol = s.favorable ? 'rgba(16,185,129,.18)' : 'rgba(239,68,68,.18)';
        const dev = ((s.rates[s.rates.length - 1] - s.budget) / s.budget * 100);
        const devStr = `${dev > 0 ? '+' : ''}${dev.toFixed(1)}%`;
        const pts = s.rates.map((v, idx) => `${X(idx)},${Y(v)}`).join(' ');
        const areaD = `M${X(0)},${Y(s.rates[0])} ${s.rates.slice(1).map((v, idx) => `L${X(idx + 1)},${Y(v)}`).join(' ')} L${X(s.rates.length - 1)},${bY} L${X(0)},${bY}Z`;

        return (
          <div key={i} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: C.navy, fontSize: 11, fontWeight: 500, fontFamily: MONO }}>{s.pair}</span>
              <span style={{ color: col, fontSize: 11, fontFamily: MONO }}>{devStr}</span>
            </div>
            <svg width="100%" viewBox={`0 0 ${W} ${H}`}
              role="img" aria-label={`${s.pair} 30-day spot rate vs budget, ${devStr}`}
              style={{ display: 'block' }}>
              <path d={areaD} fill={fillCol} />
              <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" />
              <line x1={pd} y1={bY} x2={W - pd} y2={bY} stroke={C.gold} strokeWidth="1.5" />
            </svg>
          </div>
        );
      })}
    </div>
  );
};

// ── P4: Week-on-week P&L movement ─────────────────────────────────────────
// Props: data = [{ pair: string, delta: number }]
const WoWMovement = ({ data }) => {
  if (!data || data.length === 0) return null;
  return (
    <div>
      {data.map((d, i) => {
        const pos = d.delta >= 0;
        const col = pos ? C.success : C.danger;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', padding: '6px 0',
            borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none',
          }}>
            <span style={{ flex: 1, color: 'var(--color-text-primary)', fontSize: 12, fontFamily: MONO, fontWeight: 500 }}>{d.pair}</span>
            <span style={{ color: col, fontSize: 11, marginRight: 8 }}>{pos ? '▲' : '▼'}</span>
            <span style={{ color: col, fontSize: 12, fontFamily: MONO, fontWeight: 600, minWidth: 104, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {fmtEur(d.delta)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── P5: Exposure coverage heatmap ──────────────────────────────────────────
// Props: data = [{ pair: string, coverage: number (0–100) }]
const CoverageHeatmap = ({ data }) => {
  if (!data || data.length === 0) return null;
  const bg = (c) => c >= 80 ? C.navy : c >= 50 ? C.gold : C.danger;
  const tc = (c) => (c >= 50 && c < 80) ? C.navy : '#fff';
  const sc = (c) => (c >= 50 && c < 80) ? 'rgba(26,39,68,.5)' : 'rgba(255,255,255,.6)';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ background: bg(d.coverage), borderRadius: 6, padding: '10px 6px', textAlign: 'center' }}>
          <div style={{ color: sc(d.coverage), fontSize: 10, fontWeight: 500, letterSpacing: '.06em', marginBottom: 3 }}>{d.pair}</div>
          <div style={{ color: tc(d.coverage), fontSize: 19, fontWeight: 700, fontFamily: MONO }}>{d.coverage}%</div>
        </div>
      ))}
    </div>
  );
};

// ── P6: Maturity timeline strip ────────────────────────────────────────────
// Props: data = [{ pair, notional, date }] — max 5 items recommended
const MaturityTimeline = ({ data }) => {
  if (!data || data.length < 2) {
    if (data && data.length === 1) {
      const d = data[0];
      return (
        <div style={{ padding: '8px 0', color: C.navy, fontSize: 12, fontFamily: MONO }}>
          {d.pair} — {d.date} — {fmtEur(d.notional, true)}
        </div>
      );
    }
    return <p style={{ color: C.slate, fontSize: 12, margin: 0 }}>No upcoming maturities.</p>;
  }

  const W = 356, H = 92, pad = 46, ty = 54;
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (W - pad * 2));
  const maxN = Math.max(...data.map(d => d.notional));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Maturity timeline: ${data.map(d => `${d.pair} ${d.date}`).join(', ')}`}
      style={{ overflow: 'visible' }}>
      <line x1={pad} y1={ty} x2={W - pad} y2={ty} stroke={C.slate} strokeWidth="1.5" strokeLinecap="round" />
      {data.map((d, i) => {
        const x = xs[i].toFixed(1);
        const rr = +(5 + (d.notional / (maxN || 1)) * 10).toFixed(1);
        const cY = (ty - rr - 6).toFixed(1);
        return (
          <g key={i}>
            <line x1={x} y1={ty} x2={x} y2={+cY + rr} stroke={C.slate} strokeWidth="1" />
            <circle cx={x} cy={cY} r={rr} fill={C.gold} opacity=".9" />
            <text x={x} y={+cY - rr - 5} textAnchor="middle" fontSize="10" fontWeight="500" fill={C.navy} fontFamily={MONO}>{d.pair}</text>
            <text x={x} y={ty + 14} textAnchor="middle" fontSize="10" fill={C.slate}>{d.date}</text>
            <text x={x} y={ty + 26} textAnchor="middle" fontSize="10" fill={C.gold} fontFamily={MONO}>{fmtEur(d.notional, true)}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Root component ─────────────────────────────────────────────────────────
// All props are required — pass live data from Reports.jsx.
// DEMO_ constants are kept as fallbacks for isolated development only.

const DEMO_PL = [
  { pair: 'EUR/USD', pl: 142500 }, { pair: 'GBP/NOK', pl: -98200 },
  { pair: 'USD/NOK', pl: 87300  }, { pair: 'EUR/GBP', pl: -61400 },
].sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl));

const DEMO_HEDGE = { value: 63, policyMin: 40, policyTarget: 75 };

const DEMO_SPARKLINES = [
  { pair: 'EUR/USD', budget: 1.0820, favorable: true,  rates: Array.from({length:30},(_,i)=>1.0820+Math.sin(i*.4)*.006+(i*.0003)) },
  { pair: 'GBP/NOK', budget: 13.45, favorable: false, rates: Array.from({length:30},(_,i)=>13.45-i*.012+Math.sin(i*.5)*.04) },
];

const DEMO_WOW = [
  { pair: 'EUR/USD', delta: 18400 }, { pair: 'GBP/NOK', delta: -23100 },
];

const DEMO_HEATMAP = [
  { pair: 'EUR/USD', coverage: 85 }, { pair: 'GBP/NOK', coverage: 62 },
];

const DEMO_MATURITIES = [
  { pair: 'EUR/USD', notional: 2400000, date: '09 May 2026' },
  { pair: 'GBP/NOK', notional: 1800000, date: '16 May 2026' },
];

const FXReportVisuals = ({
  plData        = DEMO_PL,
  hedgeData     = DEMO_HEDGE,
  sparklineData = DEMO_SPARKLINES,
  wowData       = DEMO_WOW,
  heatmapData   = DEMO_HEATMAP,
  maturities    = DEMO_MATURITIES,
}) => (
  <div style={{ fontFamily: 'var(--font-sans, -apple-system, sans-serif)', padding: 18 }}>

    {/* Row 1: P&L + Gauge — side by side on desktop, stacked on mobile */}
    <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
      <Card label="Portfolio P&L vs budget" style={{ flex: '1 1 295px' }}>
        <PLBarChart data={plData} />
      </Card>
      <Card label="Hedge coverage" style={{ flex: '1 1 175px' }}>
        <HedgeGauge {...hedgeData} />
      </Card>
    </div>

    {/* Row 2: 2-column grid */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))', gap: 14 }}>
      {sparklineData.length > 0 && (
        <Card label="Spot rate vs budget — 30 days">
          <SparklineGrid data={sparklineData} />
        </Card>
      )}
      {wowData.length > 0 && (
        <Card label="Week-on-week P&L movement">
          <WoWMovement data={wowData} />
        </Card>
      )}
      {heatmapData.length > 0 && (
        <Card label="Exposure coverage">
          <CoverageHeatmap data={heatmapData} />
        </Card>
      )}
      {maturities.length > 0 && (
        <Card label="Upcoming maturities">
          <MaturityTimeline data={maturities} />
        </Card>
      )}
    </div>

  </div>
);

export default FXReportVisuals;
export { PLBarChart, HedgeGauge, SparklineGrid, WoWMovement, CoverageHeatmap, MaturityTimeline };
