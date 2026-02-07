import React from 'react';
import { TrendingDown, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react';

export default function RiskMetricsCard({ metrics }) {
  if (!metrics) return null;

  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (absValue >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Expected P&L */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Expected P&L</span>
          <DollarSign className="w-5 h-5 text-blue-500" />
        </div>
        <div className={`text-2xl font-bold ${
          (typeof metrics.expected_pnl === 'number' && metrics.expected_pnl >= 0) ? 'text-green-600' : 'text-red-600'
        }`}>
          {formatCurrency(metrics.expected_pnl)}
        </div>
      </div>

      {/* Downside Risk (VaR 95) */}
      <div className="bg-white p-4 rounded-lg shadow border border-red-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Downside Risk (95%)</span>
          <TrendingDown className="w-5 h-5 text-red-500" />
        </div>
        <div className="text-2xl font-bold text-red-600">
          {formatCurrency(metrics.var_95)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          5% chance of losing more
        </div>
      </div>

      {/* Upside Potential */}
      <div className="bg-white p-4 rounded-lg shadow border border-green-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Max Gain (95%)</span>
          <TrendingUp className="w-5 h-5 text-green-500" />
        </div>
        <div className="text-2xl font-bold text-green-600">
          {formatCurrency(metrics.max_gain != null ? metrics.max_gain * 0.95 : null)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          95th percentile outcome
        </div>
      </div>

      {/* Probability of Loss */}
      <div className="bg-white p-4 rounded-lg shadow border border-yellow-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Loss Probability</span>
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
        </div>
        <div className="text-2xl font-bold text-yellow-600">
          {formatPercent(metrics.probability_of_loss)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Chance of any loss
        </div>
      </div>
    </div>
  );
}
