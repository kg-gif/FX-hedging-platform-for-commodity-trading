// RiskEngine.jsx
// Risk Engine tab — Scenario Analysis + Coming Soon modules.
// Forecasting has moved to the Hedging tab (HedgingPage.jsx).

import React, { useState, useRef } from 'react'
import { NAVY, GOLD } from '../brand'
import Simulator from './Simulator'

const MODULES = [
  { id: 'scenario',     label: 'Scenario Analysis',   live: true  },
  { id: 'sensitivity',  label: 'Sensitivity Analysis', icon: '📉', desc: 'See which exposures are most vulnerable to rate moves.' },
  { id: 'cfar',         label: 'Cash Flow-at-Risk',    icon: '💸', desc: 'Model worst-case cash positions under stress scenarios.' },
  { id: 'var',          label: 'VaR',                  icon: '📊', desc: 'Calculate Value-at-Risk across your portfolio for board reporting.' },
  { id: 'revenue',      label: 'Revenue Impact',       icon: '📈', desc: 'Quantify FX effect on revenues and import/export costs.' },
  { id: 'optimisation', label: 'Hedge Optimisation',   icon: '🤖', desc: 'AI-generated hedge strategy recommendations across your full portfolio.' },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function RiskEngine() {
  const [active, setActive] = useState('scenario')
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
        <h2 className="text-xl font-bold text-white">Risk Engine</h2>
        <p className="text-xs mt-1" style={{ color: '#8DA4C4' }}>
          Scenario modelling, sensitivity analysis, and AI-driven hedge optimisation
        </p>
      </div>

      {/* Jump nav — pill bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-5 flex flex-wrap gap-2 sticky top-[73px] z-30">
        {MODULES.map(m => {
          const isActive = active === m.id
          return (
            <button
              key={m.id}
              onClick={() => scrollTo(m.id)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all border"
              style={isActive
                ? { background: GOLD,    color: NAVY,      borderColor: GOLD      }
                : { background: 'white', color: '#6B7280', borderColor: '#E5E7EB' }
              }
            >
              {m.label}
              {!m.live && (
                <span className="ml-1.5 text-xs font-normal opacity-70">· soon</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Sections */}
      {MODULES.map(m => (
        <div
          key={m.id}
          ref={el => { sectionRefs.current[m.id] = el }}
          className="scroll-mt-32"
        >
          {m.id === 'scenario' ? (
            <Simulator />
          ) : (
            // Coming soon
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-5">
              <div className="px-5 py-3 flex items-center gap-3" style={{ background: NAVY }}>
                <h3 className="font-semibold text-white text-sm">{m.label}</h3>
              </div>
              <div className="flex items-center justify-between py-5 px-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: 'rgba(26,39,68,0.06)' }}>
                    {m.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: NAVY }}>{m.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
                  </div>
                </div>
                <span className="text-xs px-3 py-1.5 rounded-full font-semibold shrink-0 ml-6"
                  style={{ background: 'rgba(201,168,108,0.12)', color: GOLD }}>
                  Coming soon
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
