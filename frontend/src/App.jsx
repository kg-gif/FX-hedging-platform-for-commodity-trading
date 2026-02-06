import React, { useState } from 'react'
import { CompanyProvider } from './contexts/CompanyContext'
import CompanySelector from './components/CompanySelector'
import Dashboard from './components/Dashboard.jsx'
import HedgingRecommendations from './components/HedgingRecommendations'
import ScenarioAnalysis from './components/ScenarioAnalysis'
import HedgeTracker from './components/HedgeTracker'
import DataImportDashboard from './components/DataImportDashboard'
import MonteCarloTab from './components/MonteCarloTab'

function AppContent() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  
  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: '📊' },
    { id: 'monte-carlo', name: 'Monte Carlo', icon: '🎲' },
    { id: 'hedging', name: 'Hedging', icon: '🛡️' },
    { id: 'data-import', name: 'Data Import', icon: '📥' }
  ]
  
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />
      case 'monte-carlo':
        return <MonteCarloTab exposures={[]} />
      case 'hedging':
        return (
          <div className="space-y-6">
            <HedgingRecommendations />
            <ScenarioAnalysis />
            <HedgeTracker />
          </div>
        )
      case 'data-import':
        return <DataImportDashboard />
      default:
        return <Dashboard />
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">BIRK FX Risk Management</h1>
              <p className="text-gray-600 mt-1">Real-time currency exposure monitoring & hedging</p>
            </div>
            
            {/* Global Company Selector */}
            <CompanySelector />
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="border-t border-gray-200">
          <div className="container mx-auto px-4">
            <nav className="flex space-x-8">
              {navigation.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`
                    flex items-center px-3 py-4 text-sm font-medium border-b-2 transition-colors
                    ${currentPage === item.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <span className="text-xl mr-2">{item.icon}</span>
                  {item.name}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
      
      {/* Page Content */}
      <div className="container mx-auto px-4 py-8">
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