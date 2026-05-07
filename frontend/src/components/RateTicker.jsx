/**
 * RateTicker
 *
 * Full-width 40 px banner that streams live FX rates into the sticky header.
 *
 * Layout
 * ------
 * [status dot] [pair  rate  ▲/▼ pct%] | [pair  rate  ▲/▼ pct%] | …
 *
 * Up to 20 pairs: static horizontal strip (scrollable, no auto-scroll).
 * 21+ pairs:      continuous CSS marquee so all pairs stay visible.
 *
 * Price-change animation
 * ----------------------
 * When a rate changes (up or down) the rate number briefly scales up then
 * returns to normal — a 300 ms CSS transform triggered by a React key change.
 *
 * Colors  Navy #1A2744  |  Gold #C9A86C  |  Green #10B981  |  Red #EF4444
 */
import { memo, useEffect, useRef, useState } from 'react'
import { useRateTicker } from '../hooks/useRateTicker'

const NAVY    = '#1A2744'
const GOLD    = '#C9A86C'
const GREEN   = '#10B981'
const RED     = '#EF4444'
const GREY    = '#8DA4C4'

const MARQUEE_THRESHOLD = 20
const FLASH_DURATION_MS = 300

/* ── CSS injected once ─────────────────────────────────────────────────────── */
const STYLE_ID = 'rate-ticker-styles'
const CSS = `
  @keyframes tickerFlash {
    0%   { transform: scale(1);    color: inherit; }
    40%  { transform: scale(1.12); }
    100% { transform: scale(1);    color: inherit; }
  }
  @keyframes tickerMarquee {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  .ticker-flash {
    display: inline-block;
    animation: tickerFlash ${FLASH_DURATION_MS}ms ease;
  }
  .ticker-track-scroll::-webkit-scrollbar { display: none; }
  .ticker-track-scroll { -ms-overflow-style: none; scrollbar-width: none; }
`

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id          = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

/* ── Single pair cell ─────────────────────────────────────────────────────── */
const PairCell = memo(function PairCell({ pair, info }) {
  const [flashKey, setFlashKey]   = useState(0)
  const [flashing, setFlashing]   = useState(false)
  const prevRateRef               = useRef(null)

  useEffect(() => {
    if (!info) return
    if (prevRateRef.current !== null && prevRateRef.current !== info.rate) {
      setFlashKey(k => k + 1)
      setFlashing(true)
      const t = setTimeout(() => setFlashing(false), FLASH_DURATION_MS)
      return () => clearTimeout(t)
    }
    prevRateRef.current = info.rate
  }, [info?.rate])

  const dir      = info?.direction ?? 'flat'
  const arrow    = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—'
  const clrArrow = dir === 'up' ? GREEN : dir === 'down' ? RED : GREY
  const absPct   = info ? Math.abs(info.change_pct).toFixed(2) : '0.00'
  const rateStr  = info ? info.rate.toFixed(5) : '—'

  return (
    <div
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         '6px',
        padding:     '0 8px',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        height:      '40px',
        flexShrink:  0,
        minWidth:    'max-content',
      }}
    >
      {/* Pair name */}
      <span style={{ color: GOLD, fontSize: 14, letterSpacing: '0.03em', fontWeight: 600 }}>
        {pair}
      </span>

      {/* Rate — animates on change */}
      <span
        key={flashKey}
        className={flashing ? 'ticker-flash' : undefined}
        style={{
          color:      'white',
          fontFamily: 'monospace',
          fontSize:   14,
          lineHeight: '16px',
        }}
      >
        {rateStr}
      </span>

      {/* Direction arrow + change % */}
      <span
        style={{
          color:      clrArrow,
          fontFamily: 'monospace',
          fontSize:   12,
          lineHeight: '16px',
          minWidth:   52,
        }}
      >
        {arrow} {absPct}%
      </span>
    </div>
  )
})

/* ── Status dot (connected / fallback / disconnected) ─────────────────────── */
function StatusDot({ connected, fallback }) {
  const bg    = connected ? GREEN : fallback ? '#F59E0B' : RED
  const title = connected ? 'Live (WebSocket)' : fallback ? 'Polling' : 'Reconnecting…'
  return (
    <div
      title={title}
      style={{
        width:        6,
        height:       6,
        borderRadius: '50%',
        background:   bg,
        flexShrink:   0,
        marginLeft:   10,
        marginRight:  4,
        boxShadow:    connected ? `0 0 4px ${GREEN}` : 'none',
      }}
    />
  )
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function RateTicker({ companyId }) {
  useEffect(() => { injectStyles() }, [])

  const { rates, connected, fallback } = useRateTicker(companyId)
  const pairs                          = Object.keys(rates)
  const useMarquee                     = pairs.length > MARQUEE_THRESHOLD

  if (pairs.length === 0) {
    return (
      <div
        style={{
          background:  NAVY,
          height:      40,
          width:       '100%',
          display:     'flex',
          alignItems:  'center',
          borderBottom: '1px solid rgba(201,168,108,0.15)',
        }}
      >
        <StatusDot connected={connected} fallback={fallback} />
        <span style={{ color: GREY, fontSize: 13, paddingLeft: 8 }}>
          Loading rates…
        </span>
      </div>
    )
  }

  const cells = pairs.map(pair => (
    <PairCell key={pair} pair={pair} info={rates[pair]} />
  ))

  /* Marquee: duplicate cells so the loop is seamless */
  const marqueeContent = useMarquee ? [...cells, ...cells] : null
  /* Scroll duration scales with pair count: ~1.5 s per pair */
  const marqueeDuration = `${pairs.length * 1.5}s`

  return (
    <div
      style={{
        background:   NAVY,
        height:       40,
        width:        '100%',
        display:      'flex',
        alignItems:   'center',
        borderBottom: '1px solid rgba(201,168,108,0.15)',
        overflow:     'hidden',
      }}
    >
      <StatusDot connected={connected} fallback={fallback} />

      {useMarquee ? (
        /* ── Auto-scrolling marquee for 21+ pairs ───────────────────── */
        <div style={{ flex: 1, overflow: 'hidden', height: 40 }}>
          <div
            style={{
              display:   'flex',
              width:     '200%',
              animation: `tickerMarquee ${marqueeDuration} linear infinite`,
            }}
          >
            {marqueeContent}
          </div>
        </div>
      ) : (
        /* ── Static scrollable strip for ≤20 pairs ──────────────────── */
        <div
          className="ticker-track-scroll"
          style={{
            flex:       1,
            display:    'flex',
            alignItems: 'center',
            overflowX:  'auto',
            height:     40,
            padding:    '0 8px',
            gap:        0,
          }}
        >
          {cells}
        </div>
      )}
    </div>
  )
}
