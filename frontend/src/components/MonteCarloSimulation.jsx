import React, { useState, useEffect } from 'react'
import { useCompany } from '../contexts/CompanyContext'
import { TrendingUp, TrendingDown, AlertTriangle, Target, RefreshCw, BarChart3, Activity } from 'lucide-react'

const MonteCarloSimulation = () => {
  const { selectedCompanyId, API_BASE_URL, getSelectedCompany } = useCompany()
  
  const [exposures, setExposures] = useState([])
  const [selectedExposure, setSelectedExposure] = useState(null)
  const [simulationResult, setSimulationResult] = useState(null)
  const [portfolioResult, setPortfolioResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('single') // 'single' or 'portfolio'
  
  // Simulation parameters
  const [timeHorizon, setTimeHorizon] = useState(90)
  const [numScenarios, setNumScenarios] = useState(10000)
  const [confidence, setConfidence] = useState(0.95)

  useEffect(() => {
    if (selectedCompanyId) {
      fetchExposures()
    }
  }, [selectedCompanyId])

  const fetchExposures = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/companies/${selectedCompanyId}/exposures`)
      const data = await response.json()
      setExposures(data)
      
      // Auto-select first exposure
      if (data.length > 0 && !selectedExposure) {
        setSelectedExposure(data[0])
      }
    } catch (err) {
      console.error('Error fetching exposures:', err)
    }
  }

  const runSingleSimulation = async () => {
    if (!selectedExposure) return
    
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/monte-carlo/simulate/exposure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exposure_id: selectedExposure.id,
          time_horizon_days: timeHorizon,
          num_scenarios: numScenarios
        })
      })
      
      const data = await response.json()
      setSimulationResult(data.simulation)
    } catch (err) {
      console.error('Simulation error:', err)
    } finally {
      setLoading(false)
    }
  }

  const runPortfolioSimulation = async () => {
  setLoading(true)
  try {
    console.log('🎯 Calling portfolio simulation...', {
      url: `${API_BASE_URL}/api/monte-carlo/simulate/portfolio`,
      company_id: selectedCompanyId,
      time_horizon_days: timeHorizon,
      num_scenarios: numScenarios
    })
    
    const response = await fetch(`${API_BASE_URL}/api/monte-carlo/simulate/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: selectedCompanyId,
        time_horizon_days: timeHorizon,
        num_scenarios: numScenarios
      })
    })
    
    console.log('📡 Response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ API Error:', errorText)
      alert(`Portfolio simulation failed: ${response.status} - ${errorText}`)
      return
    }
    
    const data = await response.json()
    console.log('✅ Portfolio result:', data)
    setPortfolioResult(data.portfolio_simulation)
  } catch (err) {
    console.error('❌ Portfolio simulation error:', err)
    alert(`Error running portfolio simulation: ${err.message}`)
  } finally {
    setLoading(false)
  }
}

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatPercentage = (value) => {
    return `${(value * 100).toFixed(1)}%`
  }

  const RiskMetricCard = ({ title, value, subtitle, icon: Icon, color = 'blue' }) => {
    const colorClasses = {
      blue: 'bg-blue-50 border-blue-200 text-blue-900',
      red: 'bg-red-50 border-red-200 text-red-900',
      green: 'bg-green-50 border-green-200 text-green-900',
      yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900'
    }

    return (
      <div className={`border-2 rounded-lg p-4 ${colorClasses[color]}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-medium opacity-75">{title}</div>
            <div className="text-2xl font-bold mt-1">{value}</div>
            {subtitle && <div className="text-xs mt-1 opacity-75">{subtitle}</div>}
          </div>
          {Icon && <Icon className="w-6 h-6 opacity-50" />}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              🎲 Monte Carlo Risk Simulation
            </h2>
            <p className="text-purple-100">
              Probabilistic analysis of FX exposure outcomes using {numScenarios.toLocaleString()} scenarios
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{exposures.length}</div>
            <div className="text-purple-200 text-sm">Active Exposures</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveTab('single')}
              className={`px-6 py-4 font-semibold border-b-2 transition-colors ${
                activeTab === 'single'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Single Exposure
            </button>
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`px-6 py-4 font-semibold border-b-2 transition-colors ${
                activeTab === 'portfolio'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Portfolio Analysis
            </button>
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="p-6 bg-gray-50 border-b">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {activeTab === 'single' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Exposure
                </label>
                <select
                  value={selectedExposure?.id || ''}
                  onChange={(e) => {
                    const exp = exposures.find(ex => ex.id === parseInt(e.target.value))
                    setSelectedExposure(exp)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  {exposures.map(exp => (
                    <option key={exp.id} value={exp.id}>
                      {exp.from_currency} → {exp.to_currency} - {formatCurrency(exp.amount)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Horizon (days)
              </label>
              <input
                type="number"
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(parseInt(e.target.value))}
                min="1"
                max="365"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scenarios
              </label>
              <select
                value={numScenarios}
                onChange={(e) => setNumScenarios(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value={1000}>1,000</option>
                <option value={5000}>5,000</option>
                <option value={10000}>10,000</option>
                <option value={25000}>25,000</option>
                <option value={50000}>50,000</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={activeTab === 'single' ? runSingleSimulation : runPortfolioSimulation}
                disabled={loading || (activeTab === 'single' && !selectedExposure)}
                className="w-full px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4" />
                    Run Simulation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {activeTab === 'single' && simulationResult && (
          <div className="p-6 space-y-6">
            {/* Key Metrics */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Risk Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <RiskMetricCard
                  title="95% Value at Risk"
                  value={formatCurrency(simulationResult.risk_metrics.var_95)}
                  subtitle="5% worst case"
                  icon={TrendingDown}
                  color="red"
                />
                <RiskMetricCard
                  title="99% Value at Risk"
                  value={formatCurrency(simulationResult.risk_metrics.var_99)}
                  subtitle="1% worst case"
                  icon={AlertTriangle}
                  color="red"
                />
                <RiskMetricCard
                  title="Expected P&L"
                  value={formatCurrency(simulationResult.summary.expected_pnl)}
                  subtitle="Mean outcome"
                  icon={Target}
                  color="blue"
                />
                <RiskMetricCard
                  title="Probability of Loss"
                  value={formatPercentage(simulationResult.risk_metrics.probability_of_loss)}
                  subtitle={`${(simulationResult.risk_metrics.probability_of_loss * numScenarios).toFixed(0)} scenarios`}
                  icon={BarChart3}
                  color="yellow"
                />
              </div>
            </div>

            {/* Distribution Analysis */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Outcome Distribution</h3>
              <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
                <div className="grid grid-cols-5 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">5th Percentile</div>
                    <div className="text-lg font-bold text-gray-900">
                      {simulationResult.distribution.percentile_5.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">25th Percentile</div>
                    <div className="text-lg font-bold text-gray-900">
                      {simulationResult.distribution.percentile_25.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Median</div>
                    <div className="text-lg font-bold text-purple-600">
                      {simulationResult.distribution.percentile_50.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">75th Percentile</div>
                    <div className="text-lg font-bold text-gray-900">
                      {simulationResult.distribution.percentile_75.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">95th Percentile</div>
                    <div className="text-lg font-bold text-gray-900">
                      {simulationResult.distribution.percentile_95.toFixed(4)}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Best Case</div>
                      <div className="text-lg font-bold text-green-600">
                        {formatCurrency(simulationResult.risk_metrics.max_gain)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Expected Loss (if loss)</div>
                      <div className="text-lg font-bold text-orange-600">
                        {formatCurrency(simulationResult.risk_metrics.expected_loss)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Worst Case</div>
                      <div className="text-lg font-bold text-red-600">
                        {formatCurrency(simulationResult.risk_metrics.max_loss)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Simulation Parameters */}
            <div className="bg-gray-50 border rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-2">Simulation Parameters</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Current Rate:</span>
                  <span className="ml-2 font-semibold">{simulationResult.simulation_params.current_rate.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Amount:</span>
                  <span className="ml-2 font-semibold">{formatCurrency(simulationResult.simulation_params.amount)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Volatility:</span>
                  <span className="ml-2 font-semibold">{formatPercentage(simulationResult.simulation_params.volatility)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Time Horizon:</span>
                  <span className="ml-2 font-semibold">{simulationResult.simulation_params.time_horizon_days} days</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'portfolio' && portfolioResult && (
          <div className="p-6 space-y-6">
            {/* Portfolio Metrics */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Portfolio Risk Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <RiskMetricCard
                  title="Portfolio 95% VaR"
                  value={formatCurrency(portfolioResult.portfolio_metrics.var_95)}
                  subtitle="Aggregate risk"
                  icon={TrendingDown}
                  color="red"
                />
                <RiskMetricCard
                  title="Portfolio 99% VaR"
                  value={formatCurrency(portfolioResult.portfolio_metrics.var_99)}
                  subtitle="Extreme risk"
                  icon={AlertTriangle}
                  color="red"
                />
                <RiskMetricCard
                  title="Expected Portfolio P&L"
                  value={formatCurrency(portfolioResult.portfolio_metrics.expected_pnl)}
                  subtitle="Mean outcome"
                  icon={Target}
                  color="blue"
                />
                <RiskMetricCard
                  title="Portfolio Loss Probability"
                  value={formatPercentage(portfolioResult.portfolio_metrics.probability_of_loss)}
                  subtitle={`${portfolioResult.portfolio_metrics.total_exposures} exposures`}
                  icon={BarChart3}
                  color="yellow"
                />
              </div>
            </div>

            {/* Individual Exposure Breakdown */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Individual Exposure Contributions
              </h3>
              <div className="bg-white border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Currency Pair
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                        95% VaR
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                        Expected P&L
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                        Loss Probability
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {portfolioResult.individual_exposures.map((exp, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {exp.currency_pair}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600">
                          {formatCurrency(exp.result.risk_metrics.var_95)}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${
                          exp.result.summary.expected_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(exp.result.summary.expected_pnl)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatPercentage(exp.result.risk_metrics.probability_of_loss)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* No Results State */}
        {!simulationResult && !portfolioResult && (
          <div className="p-12 text-center text-gray-500">
            <Activity className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">No simulation results yet</p>
            <p className="text-sm mt-2">Configure parameters above and click "Run Simulation"</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default MonteCarloSimulation