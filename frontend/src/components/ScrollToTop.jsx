// ScrollToTop.jsx
// Floating "↑ Top" button — appears after scrolling 300 px, fixed bottom-right.
// Drop into any page that needs it; no props required.

import { useState, useEffect } from 'react'
import { NAVY, GOLD } from '../brand'

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 300)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg font-bold transition-opacity"
      style={{ background: NAVY, color: GOLD, border: `1px solid ${GOLD}` }}
      title="Back to top"
    >
      ↑
    </button>
  )
}
