import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  DollarSign
} from 'lucide-react';

const HedgingRecommendations = ({ companyId, currencyPair, exposure }) => {
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRatio, setSelectedRatio] = useState(null);
  const [riskTolerance, setRiskTolerance] = useState('moderate');

  useEffect(() => {
    fetchRecommendations();
  }, [companyId, currencyPair, riskTolerance]);

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/hedging/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exposure_amount: exposure.amount,
          currency_pair: currencyPair,
          current_rate: exposure.currentRate,
          historical_volatility: exposure.volatility || 0.08,
          time_horizon_days: exposure.daysToPayment || 90,
          risk_tolerance: riskTolerance
        })
      });
      
      const data = await response.json();
      setRecommendations(data);
      setSelectedRatio(data.recommended_ratio);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (tolerance) => {
    switch (tolerance) {
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      case 'moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'high': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
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

  const formatPercent = (value) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!recommendations) {
    return (
      <div className="text-center text-gray-500 py-8">
        Unable to load recommendations
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Hedging Recommendations
        </h2>
        <p className="text-blue-100">
          {currencyPair} • Exposure: {formatCurrency(exposure.amount)}
        </p>
      </div>

      {/* Risk Tolerance Selector */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Risk Tolerance Profile
        </label>
        <div className="grid grid-cols-3 gap-3">
          {['low', 'moderate', 'high'].map((tolerance) => (
            <button
              key={tolerance}
              onClick={() => setRiskTolerance(tolerance)}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                riskTolerance === tolerance
                  ? getRiskColor(tolerance) + ' font-semibold'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {tolerance.charAt(0).toUpperCase() + tolerance.slice(1)} Risk
            </button>
          ))}
        </div>
      </div>

      {/* Main Recommendation Card */}
      <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-600">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Recommended Strategy
            </h3>
            <p className="text-gray-600">{recommendations.rationale}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">
              {formatPercent(recommendations.recommended_ratio)}
            </div>
            <div className="text-sm text-gray-600">Hedge Ratio</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div>
            <div className="text-sm text-gray-600 mb-1">Confidence Level</div>
            <div className="text-lg font-semibold">{recommendations.confidence_level}%</div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">Time Horizon</div>
            <div className="text-lg font-semibold">{recommendations.time_horizon_days} days</div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">Volatility</div>
            <div className="text-lg font-semibold">{formatPercent(recommendations.adjusted_volatility)}</div>
          </div>
        </div>
      </div>

      {/* Hedge Ratio Comparison */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Compare Hedge Ratios
        </h3>
        <div className="space-y-4">
          {recommendations.hedge_analysis.map((analysis) => (
            <div
              key={analysis.ratio}
              onClick={() => setSelectedRatio(analysis.ratio)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selectedRatio === analysis.ratio
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {analysis.ratio === recommendations.recommended_ratio && (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                  <span className="font-bold text-lg">{analysis.ratio_pct}</span>
                  <span className="text-gray-600">Hedge</span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Hedged Amount</div>
                  <div className="font-semibold">{formatCurrency(analysis.hedged_amount)}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Best Case</div>
                  <div className={`font-semibold ${
                    analysis.best_case_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(analysis.best_case_pnl)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Worst Case</div>
                  <div className={`font-semibold ${
                    analysis.worst_case_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(analysis.worst_case_pnl)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Expected P&L</div>
                  <div className={`font-semibold ${
                    analysis.expected_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(analysis.expected_pnl)}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Downside Protection</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${analysis.downside_protection}%` }}
                      ></div>
                    </div>
                    <span className="font-semibold">{analysis.downside_protection}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <h4 className="font-semibold text-gray-900">Value at Risk</h4>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">95% Confidence</span>
              <span className="font-bold text-orange-600">
                {formatCurrency(recommendations.var_95 * exposure.amount)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">99% Confidence</span>
              <span className="font-bold text-red-600">
                {formatCurrency(recommendations.var_99 * exposure.amount)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-gray-900">Market Conditions</h4>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Current Rate</span>
              <span className="font-bold">{exposure.currentRate.toFixed(6)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Volatility (Ann.)</span>
              <span className="font-bold">{formatPercent(exposure.volatility || 0.08)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6 border border-green-200">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-900 mb-1">Ready to hedge?</h4>
            <p className="text-sm text-gray-600">
              Lock in protection with the recommended {formatPercent(recommendations.recommended_ratio)} hedge ratio
            </p>
          </div>
          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Create Hedge Contract
          </button>
        </div>
      </div>
    </div>
  );
};

export default HedgingRecommendations;
