// HedgingPage.jsx
// Hedging tab — jump nav for Hedge Recommendations and Exposure Register sections.
// focusExposure is passed via router location state (navigate('/hedging', { state: { focusExposure } }))

import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCompany } from '../contexts/CompanyContext'
import { NAVY } from '../brand'
import HedgingRecommendations from './HedgingRecommendations'
import ExposureRegister from './ExposureRegister'
import JumpNav from './JumpNav'
import ScrollToTop from './ScrollToTop'

const SECTIONS = [
  { id: 'recommendations', label: 'Hedge Recommendations' },
  { id: 'register',        label: 'Exposure Register'     },
]

export default function HedgingPage() {
  const { selectedCompanyId } = useCompany()
  const companyId = selectedCompanyId || 1
  const location  = useLocation()
  const navigate  = useNavigate()

  // focusExposure arrives via router state from Dashboard "Hedge Now" button
  const focusExposure = location.state?.focusExposure || null

  const [active, setActive] = useState('recommendations')
  const sectionRefs = useRef({})

  function scrollTo(id) {
    setActive(id)
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // When arriving at /hedging/register scroll to the register section on mount
  useEffect(() => {
    if (location.pathname === '/hedging/register') {
      scrollTo('register')
    }
  }, [location.pathname])

  // After focusExposure is consumed, clear router state so a refresh doesn't re-trigger it
  function handleFocusConsumed() {
    navigate('/hedging', { replace: true, state: {} })
  }

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="rounded-xl p-6 mb-4" style={{ background: NAVY }}>
        <h2 className="text-xl font-bold text-white">Hedging</h2>
        <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>
          Recommendations, execution, and your full exposure register
        </p>
      </div>

      {/* Jump nav */}
      <div className="mb-5">
        <JumpNav sections={SECTIONS} active={active} onNavigate={scrollTo} variant="tab" />
      </div>

      <ScrollToTop />

      {/* Hedge Recommendations section */}
      <div
        ref={el => { sectionRefs.current['recommendations'] = el }}
        className="scroll-mt-32"
      >
        <HedgingRecommendations
          focusExposure={focusExposure}
          onFocusConsumed={handleFocusConsumed}
        />
      </div>

      {/* Exposure Register section */}
      <div
        ref={el => { sectionRefs.current['register'] = el }}
        className="scroll-mt-32 mt-6"
      >
        <ExposureRegister
          companyId={companyId}
          onHedgeNow={(exp) => {
            // Store focusExposure in router state and scroll up to recommendations
            navigate('/hedging', { state: { focusExposure: exp } })
            scrollTo('recommendations')
          }}
        />
      </div>
    </div>
  )
}
