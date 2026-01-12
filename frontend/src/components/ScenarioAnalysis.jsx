import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Activity,
  AlertCircle
} from 'lucide-react';

const ScenarioAnalysis = ({ companyId, currencyPair, exposure }) => {
  const [scenarios, setScenarios] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hedgeRatio, setHedgeRatio] = useState(0.5);
  const [scenarioType, setScenarioType] = useState('moderate');
  const [selectedScenario, setSelectedScenario] = useState(null);

  useEffect(() => {
    fetchScenarios();
  }, [companyId, currencyPair, hedgeRatio, scenarioType]);

  const fetchScenarios = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/hedging/scenarios/${companyId}?currency_pair=${currencyPair}&hedge_ratio=${hedgeRatio}&scenario_type=${scenarioType}`
      );
      const data = await response.json();
      setScenarios(data);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getScenarioIcon = (scenario) => {
    if (scenario.includes('Adverse')) return <TrendingDown className="w-5 h-5" />;
    if (scenario.includes('Favorable')) return <TrendingUp className="w-5 h-5" />;
    return <Minus className="w-5 h-5" />;
  };

  const getScenarioColor = (scenario) => {
    if (scenario.includes('Severe Adverse')) return 'bg-red-100 text-red-800 border-red-300';
    if (scenario.includes('Moderate Adverse')) return 'bg-orange-100 text-orange-800 border-orange-300';
    if (scenario.includes('Mild Adverse')) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (scenario === 'No Change') return 'bg-gray-100 text-gray-800 border-gray-300';
    if (scenario.includes('Mild Favorable')) return 'bg-green-100 text-green-800 border-green-300';
    if (scenario.includes('Moderate Favorable')) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (scenario.includes('Severe Favorable')) return 'bg-teal-100 text-teal-800 border-teal-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getPnLColor = (pnl) => {
    if (pnl > 0) return 'text-green-600';
    if (pnl < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!scenarios) {
    return (
      <div className="text-center text-gray-500 py-8">
        Unable to load scenario analysis
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Scenario Analysis
        </h2>
        <p className="text-blue-100">
          What-if modeling for {currencyPair} • {formatCurrency(scenarios.exposure_amount)} exposure
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Hedge Ratio Slider */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Hedge Ratio: {(hedgeRatio * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={hedgeRatio}
            onChange={(e) => setHedgeRatio(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-2">
            <span>No Hedge (0%)</span>
            <span>Partial (50%)</span>
            <span>Full (100%)</span>
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">Hedged:</span> {formatCurrency(scenarios.exposure_amount * hedgeRatio)}
              <br />
              <span className="font-semibold">Unhedged:</span> {formatCurrency(scenarios.exposure_amount * (1 - hedgeRatio))}
            </div>
          </div>
        </div>

        {/* Scenario Type Selector */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Scenario Severity
          </label>
          <div className="space-y-2">
            {[
              { value: 'conservative', label: 'Conservative', range: '±5%' },
              { value: 'moderate', label: 'Moderate', range: '±10%' },
              { value: 'aggressive', label: 'Aggressive', range: '±15%' }
            ].map((type) => (
              <button
                key={type.value}
                onClick={() => setScenarioType(type.value)}
                className={`w-full px-4 py-3 rounded-lg border-2 transition-all text-left ${
                  scenarioType === type.value
                    ? 'border-purple-600 bg-purple-50 font-semibold'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>{type.label}</span>
                  <span className="text-sm text-gray-600">{type.range}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-xs text-gray-600 mb-1">Worst Case (Hedged)</div>
          <div className={`text-lg font-bold ${getPnLColor(scenarios.summary.worst_case_hedged)}`}>
            {formatCurrency(scenarios.summary.worst_case_hedged)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-xs text-gray-600 mb-1">Best Case (Hedged)</div>
          <div className={`text-lg font-bold ${getPnLColor(scenarios.summary.best_case_hedged)}`}>
            {formatCurrency(scenarios.summary.best_case_hedged)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-xs text-gray-600 mb-1">Worst Case (No Hedge)</div>
          <div className={`text-lg font-bold ${getPnLColor(scenarios.summary.worst_case_unhedged)}`}>
            {formatCurrency(scenarios.summary.worst_case_unhedged)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-xs text-gray-600 mb-1">Best Case (No Hedge)</div>
          <div className={`text-lg font-bold ${getPnLColor(scenarios.summary.best_case_unhedged)}`}>
            {formatCurrency(scenarios.summary.best_case_unhedged)}
          </div>
        </div>
      </div>

      {/* Scenario List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Scenario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rate Change
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  New Rate
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unhedged P&L
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hedged P&L
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hedge Benefit
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {scenarios.scenarios.map((scenario, index) => (
                <tr
                  key={index}
                  onClick={() => setSelectedScenario(scenario)}
                  className={`cursor-pointer transition-colors ${
                    selectedScenario === scenario ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded ${getScenarioColor(scenario.scenario)}`}>
                        {getScenarioIcon(scenario.scenario)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {scenario.scenario}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-semibold ${
                      scenario.rate_change_pct > 0 ? 'text-green-600' : 
                      scenario.rate_change_pct < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {scenario.rate_change_pct > 0 ? '+' : ''}{scenario.rate_change_pct}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {scenario.new_rate.toFixed(6)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold ${getPnLColor(scenario.unhedged_pnl)}`}>
                    {formatCurrency(scenario.unhedged_pnl)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold ${getPnLColor(scenario.hedged_pnl)}`}>
                    {formatCurrency(scenario.hedged_pnl)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold ${getPnLColor(scenario.hedge_benefit)}`}>
                    {formatCurrency(scenario.hedge_benefit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visualization */}
      {selectedScenario && (
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-600">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Detailed View: {selectedScenario.scenario}
          </h3>
          
          <div className="grid grid-cols-2 gap-6">
            {/* Hedged vs Unhedged Comparison */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-3">P&L Comparison</div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-600">Unhedged Position</span>
                    <span className={`font-semibold ${getPnLColor(selectedScenario.unhedged_pnl)}`}>
                      {formatCurrency(selectedScenario.unhedged_pnl)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        selectedScenario.unhedged_pnl >= 0 ? 'bg-green-600' : 'bg-red-600'
                      }`}
                      style={{
                        width: `${Math.min(Math.abs(selectedScenario.unhedged_pnl / scenarios.exposure_amount) * 100, 100)}%`
                      }}
                    ></div>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-600">Hedged Position ({scenarios.hedge_ratio_pct})</span>
                    <span className={`font-semibold ${getPnLColor(selectedScenario.hedged_pnl)}`}>
                      {formatCurrency(selectedScenario.hedged_pnl)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        selectedScenario.hedged_pnl >= 0 ? 'bg-green-600' : 'bg-red-600'
                      }`}
                      style={{
                        width: `${Math.min(Math.abs(selectedScenario.hedged_pnl / scenarios.exposure_amount) * 100, 100)}%`
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-3">Key Metrics</div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Rate Movement</span>
                  <span className="font-semibold">
                    {selectedScenario.rate_change_pct > 0 ? '+' : ''}{selectedScenario.rate_change_pct}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">New FX Rate</span>
                  <span className="font-semibold">{selectedScenario.new_rate.toFixed(6)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-sm text-gray-600">Hedge Benefit</span>
                  <span className={`font-bold ${getPnLColor(selectedScenario.hedge_benefit)}`}>
                    {formatCurrency(selectedScenario.hedge_benefit)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-6 border border-yellow-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Analysis Insights</h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Current hedge ratio of {scenarios.hedge_ratio_pct} provides protection against adverse moves</li>
              <li>• In the worst case scenario, hedging saves {formatCurrency(Math.abs(scenarios.summary.worst_case_unhedged - scenarios.summary.worst_case_hedged))}</li>
              <li>• Consider your risk tolerance and market outlook when adjusting hedge ratio</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScenarioAnalysis;
