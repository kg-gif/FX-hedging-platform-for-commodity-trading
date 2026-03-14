/**
 * LoadingAnimation.jsx
 *
 * Reusable loading indicator using the brand's + → - → = cycling symbol.
 * Replaces ad-hoc spinners across the app for a consistent look.
 *
 * Props:
 *   text  — label displayed below the symbol  (default: 'Loading…')
 *   size  — 'small' | 'medium' | 'large'      (default: 'medium')
 */

import React, { useState, useEffect, useRef } from 'react'
import { GOLD } from '../brand'

const SIZE_MAP = {
  small:  { symbol: 20, text: 12 },
  medium: { symbol: 32, text: 14 },
  large:  { symbol: 48, text: 16 },
}

export default function LoadingAnimation({ text = 'Loading…', size = 'medium' }) {
  const { symbol: symbolPx, text: textPx } = SIZE_MAP[size] || SIZE_MAP.medium

  const symbols              = ['+', '-', '=']
  const [idx, setIdx]        = useState(0)
  const [visible, setVisible] = useState(true)
  const symIdxRef            = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out, swap symbol, fade in
      setVisible(false)
      setTimeout(() => {
        symIdxRef.current = (symIdxRef.current + 1) % 3
        setIdx(symIdxRef.current)
        setVisible(true)
      }, 150)
    }, 400)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <span style={{
        color:      GOLD,
        fontWeight: 700,
        fontSize:   symbolPx,
        lineHeight: 1,
        opacity:    visible ? 1 : 0,
        transition: 'opacity 150ms ease',
        display:    'block',
        textAlign:  'center',
        userSelect: 'none',
      }}>
        {symbols[idx]}
      </span>
      {text && (
        <span style={{ fontSize: textPx, color: '#6B7280', fontWeight: 500 }}>
          {text}
        </span>
      )}
    </div>
  )
}
