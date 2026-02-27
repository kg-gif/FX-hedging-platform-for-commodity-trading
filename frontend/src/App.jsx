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
import Admin from './components/Admin'
import Login from './components/Login'

const NAVY = '#1A2744'
const GOLD = '#C9A86C'
const API_URL = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'

function getStoredAuth() {
  try {
    const token = localStorage.getItem('auth_token')
    const user = JSON.parse(localStorage.getItem('auth_user') || 'null')
    if (token && user) return { token, user }
  } catch (_) {}
  return null
}

function clearAuth() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
}

function AppContent({ authUser, onLogout }) {
  const { selectedCompanyId } = useCompany()
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [exposures, setExposures] = useState([])
  const [loadingExposures, setLoadingExposures] = useState(true)

  const isAdmin = authUser?.role === 'admin'

  const fetchExposures = async () => {
    try {
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

  const cfoNav = [
    { id: 'dashboard', name: 'Dashboard' },
    { id: 'hedging',   name: 'Hedging'   },
    { id: 'reports',   name: 'Reports'   },
    { id: 'settings',  name: 'Settings'  },
    ...(isAdmin ? [{ id: 'admin', name: '⚙ Admin' }] : [])
  ]

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
              onClick={() => window.open(`${API_URL}/api/reports/currency-plan?company_id=1`, '_blank')}
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
      case 'admin':
        return isAdmin ? <Admin authUser={authUser} /> : <Dashboard exposures={exposures} loading={loadingExposures} />
      default:
        return <Dashboard exposures={exposures} loading={loadingExposures} />
    }
  }

  const allNav = showAdvanced ? [...cfoNav, ...advancedNav] : cfoNav

  return (
    <div className="min-h-screen" style={{ background: '#F0F2F7' }}>
      <div style={{ background: NAVY }} className="shadow-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded flex items-center justify-center"
                style={{ border: `1px solid ${GOLD}`, background: 'rgba(201,168,108,0.08)' }}>
                <span className="text-xs font-bold leading-tight text-center"
                  style={{ color: GOLD, letterSpacing: '0.05em' }}>
                  sum +<br/>no &nbsp;−<br/>how =
                </span>
              </div>
              <div>
                <span className="text-2xl font-bold tracking-widest uppercase block"
                  style={{ color: GOLD, letterSpacing: '0.15em' }}>sumnohow</span>
                <p className="text-xs mt-0.5 italic" style={{ color: '#8DA4C4' }}>
                  Know your FX position. Before it costs you.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <CompanySelector />
              <div className="flex items-center gap-3 pl-4"
                style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-medium text-white">{authUser.email}</p>
                  <p className="text-xs capitalize" style={{ color: '#8DA4C4' }}>{authUser.role}</p>
                </div>
                <button
                  onClick={onLogout}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{ color: '#8DA4C4', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent' }}
                  onMouseEnter={e => { e.target.style.color = 'white'; e.target.style.borderColor = 'rgba(255,255,255,0.4)' }}
                  onMouseLeave={e => { e.target.style.color = '#8DA4C4'; e.target.style.borderColor = 'rgba(255,255,255,0.15)' }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="container mx-auto px-6 flex items-center justify-between">
            <nav className="flex space-x-1">
              {allNav.map((item) => {
                const active = currentPage === item.id
                return (
                  <button key={item.id} onClick={() => setCurrentPage(item.id)}
                    className="flex items-center px-4 py-4 text-sm font-medium transition-all"
                    style={{
                      color: active ? GOLD : '#8DA4C4',
                      borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
                      background: 'transparent',
                    }}>
                    {item.name}
                  </button>
                )
              })}
            </nav>
            <button
              onClick={() => {
                setShowAdvanced(!showAdvanced)
                if (showAdvanced && advancedNav.find(n => n.id === currentPage)) setCurrentPage('dashboard')
              }}
              className="text-xs px-3 py-1 rounded-full transition-all"
              style={{
                color: showAdvanced ? NAVY : '#8DA4C4',
                background: showAdvanced ? GOLD : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)'
              }}>
              {showAdvanced ? 'Hide Advanced' : 'Advanced'}
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {renderPage()}
      </div>
    </div>
  )
}

function App() {
  const [authData, setAuthData] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const stored = getStoredAuth()
    if (stored) {
      fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${stored.token}` }
      })
        .then(r => { if (r.ok) setAuthData(stored); else clearAuth() })
        .catch(() => setAuthData(stored))
        .finally(() => setChecking(false))
    } else {
      setChecking(false)
    }
  }, [])

  const handleLoginSuccess = (data) => {
    setAuthData({
      token: data.access_token,
      user: { user_id: data.user_id, email: data.email, company_id: data.company_id, role: data.role }
    })
  }

  const handleLogout = () => { clearAuth(); setAuthData(null) }

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: NAVY }}>
      <p className="text-sm" style={{ color: '#8DA4C4' }}>Loading…</p>
    </div>
  )

  if (!authData) return <Login onLoginSuccess={handleLoginSuccess} />

  return (
    <CompanyProvider>
      <AppContent authUser={authData.user} onLogout={handleLogout} />
    </CompanyProvider>
  )
}

export default App
