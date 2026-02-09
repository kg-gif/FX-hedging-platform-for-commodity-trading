import React, { useState, useEffect } from 'react';
import { Play, RefreshCw, TrendingUp } from 'lucide-react';
import { monteCarloService } from '../services/monteCarloService';
import RiskMetricsCard from './RiskMetricsCard';
import PnLHistogram from './PnLHistogram';

export default function MonteCarloTab({ exposures, loading }) {
  const [selectedExposureId, setSelectedExposureId] = useState(null);
  const [horizonDays, setHorizonDays] = useState(90);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [error, setError] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);

  useEffect(() => {
    console.log('MonteCarloTab received exposures:', exposures)
  }, [exposures])

  // Early return AFTER all hooks
  if (!exposures || exposures.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Risk Analysis</h2>
        <p>Loading exposures...</p>
      </div>
    );
  }

  const handleRunSimulation = async () => {
    if (!selectedExposureId) {
      setError('Please select an exposure first');
      return;
    }

    setSimulationLoading(true);
    setError(null);

    try {
      const result = await monteCarloService.runSimulation(
        selectedExposureId,
        horizonDays
      );
      console.log('Simulation result:', result);
      setSimulationResult(result);
    } catch (err) {
      console.error('Simulation error:', err);
      setError(err.message);
    } finally {
      setSimulationLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center">
          <TrendingUp className="mr-2" />
          Risk Analysis - Monte Carlo Simulation
        </h2>
        <p className="text-gray-600">
          Project future P&L scenarios and understand your downside risk
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white p-6 rounded-lg shadow mb-6 border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Exposure Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Exposure
            </label>
            <select
              value={selectedExposureId || ''}
              onChange={(e) => setSelectedExposureId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="">
                {loading ? '⏳ Loading exposures...' : 'Choose exposure...'}
              </option>
              {exposures && exposures.map(exp => (
                <option key={exp.id} value={exp.id}>
                  {exp.currency_pair} - {exp.amount?.toLocaleString()} @ {exp.current_rate}
                </option>
              ))}
            </select>
          </div>

          {/* Time Horizon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time Horizon
            </label>
            <div className="flex gap-2">
              {[30, 60, 90].map(days => (
                <button
                  key={days}
                  onClick={() => setHorizonDays(days)}
                  className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                    horizonDays === days
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>

          {/* Run Button */}
          <div className="flex items-end">
            <button
              onClick={handleRunSimulation}
              disabled={simulationLoading || !selectedExposureId}
              className="w-full bg-blue-600 text-white px-6 py-2 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {simulationLoading ? (
                <>
                  <RefreshCw className="mr-2 w-5 h-5 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 w-5 h-5" />
                  Run Monte Carlo
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
            <strong>Error:</strong> {typeof error === 'string' ? error : error.message || JSON.stringify(error)}
          </div>
        )}
      </div>

      {/* Results - WITH DOUBLE NULL CHECK */}
      {simulationResult && simulationResult.simulation && (
        <>
          {/* Exposure Info */}
          <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-lg">
                  {simulationResult.currency_pair || 'N/A'}
                </h3>
                <p className="text-sm text-gray-600">
                  Exposure: {simulationResult.amount?.toLocaleString() || 'N/A'} units @{' '}
                  {simulationResult.current_rate || 'N/A'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">
                  {simulationResult.simulation?.simulation_params?.num_scenarios?.toLocaleString() || 'N/A'} scenarios
                </p>
                <p className="text-sm text-gray-600">
                  {horizonDays}-day projection
                </p>
              </div>
            </div>
          </div>

          {/* Risk Metrics */}
          {simulationResult.simulation?.risk_metrics && (
            <RiskMetricsCard metrics={simulationResult.simulation.risk_metrics} />
          )}

          {/* Histogram */}
          {simulationResult.simulation?.outcomes?.simulated_pnl && (
            <PnLHistogram 
              pnlData={simulationResult.simulation.outcomes.simulated_pnl}
              riskMetrics={simulationResult.simulation.risk_metrics}
            />
          )}

          {/* Summary Stats */}
          <div className="mt-6 bg-white p-6 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Simulation Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Volatility Used</p>
                <p className="text-lg font-semibold">
                  {simulationResult.simulation?.simulation_params?.volatility 
                    ? (simulationResult.simulation.simulation_params.volatility * 100).toFixed(1) + '%'
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Max Loss</p>
                <p className="text-lg font-semibold text-red-600">
                  {simulationResult.simulation?.risk_metrics?.max_loss 
                    ? '$' + Math.abs(simulationResult.simulation.risk_metrics.max_loss).toLocaleString()
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Max Gain</p>
                <p className="text-lg font-semibold text-green-600">
                  {simulationResult.simulation?.risk_metrics?.max_gain 
                    ? '$' + simulationResult.simulation.risk_metrics.max_gain.toLocaleString()
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Simulation ID</p>
                <p className="text-lg font-semibold">
                  #{simulationResult.simulation_id || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty State - NO .simulation ACCESS */}
      {!simulationResult && !simulationLoading && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <TrendingUp className="mx-auto w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2">No simulation results yet</p>
          <p className="text-sm text-gray-500">
            Select an exposure and run a simulation to see risk projections
          </p>
        </div>
      )}
    </div>
  );
}
