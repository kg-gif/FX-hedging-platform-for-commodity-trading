// HedgingPage.jsx
// Hedging tab — jump nav for Hedge Recommendations and Exposure Register sections.

import React, { useState, useRef } from 'react'
import { useCompany } from '../contexts/CompanyContext'
import { NAVY, GOLD } from '../brand'
import HedgingRecommendations from './HedgingRecommendations'
import ExposureRegister from './ExposureRegister'

const SECTIONS = [
  { id: 'recommendations', label: 'Hedge Recommendations' },
  { id: 'register',        label: 'Exposure Register'     },
]

export default function HedgingPage({ focusExposure, onFocusConsumed, onNavigate }) {
  const { selectedCompanyId } = useCompany()
  const companyId = selectedCompanyId || 1

  const [active, setActive] = useState('recommendations')
  const sectionRefs = useRef({})

  function scrollTo(id) {
    setActive(id)
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

      {/* Jump nav — two items, underline active */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 mb-5 flex gap-1 sticky top-[73px] z-30">
        {SECTIONS.map(s => {
          const isActive = active === s.id
          return (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="px-4 py-3.5 text-sm font-semibold transition-all"
              style={{
                color:        isActive ? GOLD : '#6B7280',
                borderBottom: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
                background:   'transparent',
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Hedge Recommendations section */}
      <div
        ref={el => { sectionRefs.current['recommendations'] = el }}
        className="scroll-mt-32"
      >
        <HedgingRecommendations
          focusExposure={focusExposure}
          onFocusConsumed={onFocusConsumed}
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
            // Scroll back up to recommendations with focus
            if (onNavigate) onNavigate('hedging', { focusExposure: exp })
            scrollTo('recommendations')
          }}
        />
      </div>
    </div>
  )
}
