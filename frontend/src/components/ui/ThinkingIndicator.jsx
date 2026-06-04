// ThinkingIndicator.jsx — the SNH "thinking" mode
//
// Brand application (Pixel sign-off, 13 May 2026):
//   - Replaces every generic spinner in the rebuild.
//   - Cycles the brand operators: + → − → =. Each glyph pulses gold for
//     ~600ms then mutes to slate. 1.8 second loop total.
//   - Motion follows brand rules — no bounce, no rotation, crossfade only.

import { useEffect, useRef } from 'react'

export default function ThinkingIndicator({ label, size = 14 }) {
  const ref = useRef(null)

  useEffect(() => {
    const id = 'snh-thinking-keyframes'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @keyframes snh-thinking-pulse {
        0%, 100%  { color: var(--snh-slate); }
        15%, 30%  { color: var(--snh-gold); }
      }
      .snh-thinking-glyph {
        font-family: var(--font-display);
        font-weight: var(--fw-bold);
        color: var(--snh-slate);
        animation: snh-thinking-pulse 1.8s cubic-bezier(0.2, 0, 0, 1) infinite;
        display: inline-block;
        min-width: 0.6em;
        text-align: center;
      }
      .snh-thinking-glyph:nth-child(1) { animation-delay: 0s; }
      .snh-thinking-glyph:nth-child(2) { animation-delay: 0.6s; }
      .snh-thinking-glyph:nth-child(3) { animation-delay: 1.2s; }
      @media (prefers-reduced-motion: reduce) {
        .snh-thinking-glyph { animation: none; color: var(--snh-gold); }
      }
    `
    document.head.appendChild(style)
  }, [])

  return (
    <span
      ref={ref}
      role="status"
      aria-live="polite"
      aria-label={label || 'Calculating'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: size, letterSpacing: '0.05em' }}>
        <span className="snh-thinking-glyph">+</span>
        <span className="snh-thinking-glyph">−</span>
        <span className="snh-thinking-glyph">=</span>
      </span>
      {label && (
        <span className="caption" style={{ color: 'var(--fg-2)', fontStyle: 'italic' }}>
          {label}
        </span>
      )}
    </span>
  )
}
