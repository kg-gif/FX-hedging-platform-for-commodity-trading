import React, { useState, useEffect } from 'react'
import { CompanyProvider, useCompany } from './contexts/CompanyContext'
import CompanySelector from './components/CompanySelector'
import Dashboard from './components/Dashboard.jsx'
import HedgingRecommendations from './components/HedgingRecommendations'
import PolicySelector from './components/PolicySelector'
import ScenarioAnalysis from './components/ScenarioAnalysis'
import HedgeTracker from './components/HedgeTracker'
import DataImportDashboard from './components/DataImportDashboard'
import MonteCarloTab from './components/MonteCarloTab'
import Settings from './components/Settings'

const NAVY = '#1A2744'
const GOLD = '#C9A86C'

function AppContent() {
  const { selectedCompanyId } = useCompany()
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [exposures, setExposures] = useState([])
  const [loadingExposures, setLoadingExposures] = useState(true)

  const fetchExposures = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'
      const response = await fetch(`${API_URL}/exposures?company_id=${selectedCompanyId}`)
      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()
      setExposures(data.map(exp => ({
        ...exp,
        currency_pair: `${exp.from_currency} / ${exp.to_currency}`
      })))
    } catch (error) {
      console.error('Error fetching exposures:', error)
    } finally {
      setLoadingExposures(false)
    }
  }

  useEffect(() => {
    if (selectedCompanyId) fetchExposures()
  }, [selectedCompanyId])

  // CFO-facing navigation
  const cfoNav = [
    { id: 'dashboard', name: 'Dashboard' },
    { id: 'hedging',   name: 'Hedging'   },
    { id: 'reports',   name: 'Reports'   },
    { id: 'settings',  name: 'Settings'  },
  ]

  // Advanced / analyst navigation
  const advancedNav = [
    { id: 'policy',      name: 'Policy'      },
    { id: 'monte-carlo', name: 'Risk Sim'    },
    { id: 'data-import', name: 'Data Import' },
  ]

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard exposures={exposures} loading={loadingExposures} />
      case 'hedging':
        return (
          <div className="space-y-6">
            <HedgingRecommendations />
            <ScenarioAnalysis />
            <HedgeTracker />
          </div>
        )
      case 'reports':
        return (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <p className="text-4xl mb-4">📄</p>
            <h2 className="text-xl font-bold mb-2" style={{ color: NAVY }}>Reports</h2>
            <p className="text-gray-500 mb-6">
              Download your Automated Currency Plan or view historical reports.
            </p>
            <button
              onClick={() => {
                window.open('https://birk-fx-api.onrender.com/api/reports/currency-plan?company_id=1', '_blank')
              }}
              className="px-8 py-3 text-white rounded-lg font-semibold"
              style={{ background: NAVY }}
            >
              Download Currency Plan
            </button>
          </div>
        )
      case 'policy':
        return <PolicySelector onPolicyChange={() => {}} />
      case 'monte-carlo':
        return <MonteCarloTab exposures={exposures} loading={loadingExposures} />
      case 'data-import':
        return <DataImportDashboard />
      case 'settings':
        return <Settings />
      default:
        return <Dashboard exposures={exposures} loading={loadingExposures} />
    }
  }

  const allNav = showAdvanced ? [...cfoNav, ...advancedNav] : cfoNav

  return (
    <div className="min-h-screen" style={{ background: '#F0F2F7' }}>

      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div style={{ background: NAVY }} className="shadow-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">

            {/* Logo + brand */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded flex items-center justify-center"
                style={{ border: `1px solid ${GOLD}`, background: 'rgba(201,168,108,0.08)' }}>
                <span className="text-xs font-bold leading-tight text-center"
                  style={{ color: GOLD, letterSpacing: '0.05em' }}>
                  sum +<br/>
                  no &nbsp;−<br/>
                  how =
                </span>
              </div>
              <div>
                <span className="text-2xl font-bold tracking-widest uppercase block"
                  style={{ color: GOLD, letterSpacing: '0.15em' }}>
                  sumnohow
                </span>
                <p className="text-xs mt-0.5 italic" style={{ color: '#8DA4C4' }}>
                  Know your FX position. Before it costs you.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <CompanySelector />
            </div>
          </div>
        </div>

        {/* ── NAV ───────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="container mx-auto px-6 flex items-center justify-between">
            <nav className="flex space-x-1">
              {allNav.map((item) => {
                const active = currentPage === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentPage(item.id)}
                    className="flex items-center px-4 py-4 text-sm font-medium transition-all"
                    style={{
                      color:        active ? GOLD : '#8DA4C4',
                      borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
                      background:   'transparent',
                    }}
                  >
                    {item.name}
                  </button>
                )
              })}
            </nav>

            {/* Advanced toggle */}
            <button
              onClick={() => {
                setShowAdvanced(!showAdvanced)
                if (showAdvanced && advancedNav.find(n => n.id === currentPage)) {
                  setCurrentPage('dashboard')
                }
              }}
              className="text-xs px-3 py-1 rounded-full transition-all"
              style={{
                color:   showAdvanced ? NAVY : '#8DA4C4',
                background: showAdvanced ? GOLD : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)'
              }}
            >
              {showAdvanced ? 'Hide Advanced' : 'Advanced'}
            </button>
          </div>
        </div>
      </div>

      {/* ── CONTENT ───────────────────────────────────────────────── */}
      <div className="container mx-auto px-6 py-8">
        {renderPage()}
      </div>
    </div>
  )
}

function App() {
  return (
    <CompanyProvider>
      <AppContent />
    </CompanyProvider>
  )
}

export default App