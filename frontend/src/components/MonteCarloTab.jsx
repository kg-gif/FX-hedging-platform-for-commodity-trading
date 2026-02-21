import React, { useState, useEffect } from 'react';
import { Play, RefreshCw, TrendingUp } from 'lucide-react';
import { monteCarloService } from '../services/monteCarloService';
import RiskMetricsCard from './RiskMetricsCard';
import PnLHistogram from './PnLHistogram';

const NAVY = '#1A2744';
const GOLD = '#C9A86C';

export default function MonteCarloTab({ exposures, loading }) {
  const [selectedExposureId, setSelectedExposureId] = useState(null);
  const [horizonDays, setHorizonDays]               = useState(90);
  const [simulationLoading, setSimulationLoading]   = useState(false);
  const [error, setError]                           = useState(null);
  const [simulationResult, setSimulationResult]     = useState(null);

  useEffect(() => {
    console.log('MonteCarloTab received exposures:', exposures)
  }, [exposures])

  if (!exposures || exposures.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: NAVY }}>Risk Analysis</h2>
        <p className="text-gray-400">Loading exposures...</p>
      </div>
    );
  }

  const handleRunSimulation = async () => {
    if (!selectedExposureId) { setError('Please select an exposure first'); return; }
    setSimulationLoading(true);
    setError(null);
    try {
      const result = await monteCarloService.runSimulation(selectedExposureId, horizonDays);
      setSimulationResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSimulationLoading(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl shadow-md p-6" style={{ background: NAVY }}>
        <div className="flex items-center gap-3">
          <TrendingUp className="text-white" size={24} />
          <div>
            <h2 className="text-2xl font-bold text-white">Risk Simulation</h2>
            <p className="text-sm mt-0.5" style={{ color: '#8DA4C4' }}>
              Project future P&L scenarios and understand your downside risk
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

          {/* Exposure selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: NAVY }}>Select Exposure</label>
            <select
              value={selectedExposureId || ''}
              onChange={(e) => setSelectedExposureId(Number(e.target.value))}
              disabled={loading}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none"
            >
              <option value="">{loading ? 'Loading...' : 'Choose exposure...'}</option>
              {exposures.map(exp => (
                <option key={exp.id} value={exp.id}>
                  {exp.currency_pair} - {exp.amount?.toLocaleString()} @ {exp.current_rate}
                </option>
              ))}
            </select>
          </div>

          {/* Time horizon */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: NAVY }}>Time Horizon</label>
            <div className="flex gap-2">
              {[30, 60, 90].map(days => (
                <button
                  key={days}
                  onClick={() => setHorizonDays(days)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: horizonDays === days ? NAVY : '#F4F6FA',
                    color:      horizonDays === days ? 'white' : '#6B7280',
                  }}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>

          {/* Run button */}
          <div className="flex items-end">
            <button
              onClick={handleRunSimulation}
              disabled={simulationLoading || !selectedExposureId}
              className="w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: GOLD, color: NAVY }}
            >
              {simulationLoading ? (
                <><RefreshCw size={16} className="animate-spin" /> Running...</>
              ) : (
                <><Play size={16} /> Run Simulation</>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {typeof error === 'string' ? error : error.message || JSON.stringify(error)}
          </div>
        )}
      </div>

      {/* Results */}
      {simulationResult && simulationResult.simulation && (
        <>
          <div className="rounded-xl p-4 border"
            style={{ background: 'rgba(26,39,68,0.04)', borderColor: 'rgba(26,39,68,0.1)' }}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold" style={{ color: NAVY }}>
                  {simulationResult.currency_pair || 'N/A'}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {simulationResult.amount?.toLocaleString()} units @ {simulationResult.current_rate}
                </p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>{simulationResult.simulation?.simulation_params?.num_scenarios?.toLocaleString()} scenarios</p>
                <p>{horizonDays}-day projection</p>
              </div>
            </div>
          </div>

          {simulationResult.simulation?.risk_metrics && (
            <RiskMetricsCard metrics={simulationResult.simulation.risk_metrics} />
          )}

          {simulationResult.simulation?.outcomes?.simulated_pnl && (
            <PnLHistogram
              pnlData={simulationResult.simulation.outcomes.simulated_pnl}
              riskMetrics={simulationResult.simulation.risk_metrics}
            />
          )}

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-base font-semibold mb-4" style={{ color: NAVY }}>Simulation Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Volatility', value: simulationResult.simulation?.simulation_params?.volatility
                    ? (simulationResult.simulation.simulation_params.volatility * 100).toFixed(1) + '%' : 'N/A',
                  color: NAVY },
                { label: 'Max Loss', value: simulationResult.simulation?.risk_metrics?.max_loss
                    ? '$' + Math.abs(simulationResult.simulation.risk_metrics.max_loss).toLocaleString() : 'N/A',
                  color: '#EF4444' },
                { label: 'Max Gain', value: simulationResult.simulation?.risk_metrics?.max_gain
                    ? '$' + simulationResult.simulation.risk_metrics.max_gain.toLocaleString() : 'N/A',
                  color: '#10B981' },
                { label: 'Simulation ID', value: '#' + (simulationResult.simulation_id || 'N/A'),
                  color: NAVY },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-lg font-semibold" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!simulationResult && !simulationLoading && (
        <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
          <TrendingUp className="mx-auto mb-4 text-gray-300" size={40} />
          <p className="text-gray-500 font-medium">No simulation results yet</p>
          <p className="text-sm text-gray-400 mt-1">Select an exposure and run a simulation</p>
        </div>
      )}
    </div>
  );
}