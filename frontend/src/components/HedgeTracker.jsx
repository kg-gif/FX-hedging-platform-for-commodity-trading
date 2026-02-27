import React, { useState, useEffect } from 'react';
import {
  Shield,
  Calendar,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  MoreVertical,
  RefreshCw
} from 'lucide-react';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
});

const HedgeTracker = ({ companyId }) => {
  const [hedges, setHedges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [selectedHedge, setSelectedHedge] = useState(null);
  const [showMenu, setShowMenu] = useState(null);

  useEffect(() => {
    fetchHedges();
  }, [companyId, filter]);

  const fetchHedges = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/hedging/active-hedges/${companyId}?status=${filter}`,
        { headers: authHeaders() }
      );
      const data = await response.json();
      setHedges(data.hedges || []);
    } catch (error) {
      console.error('Error fetching hedges:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-800 border-green-300',
      matured: 'bg-gray-100 text-gray-800 border-gray-300',
      cancelled: 'bg-red-100 text-red-800 border-red-300'
    };
    
    const icons = {
      active: <CheckCircle className="w-4 h-4" />,
      matured: <Clock className="w-4 h-4" />,
      cancelled: <XCircle className="w-4 h-4" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getUrgencyBadge = (daysToMaturity) => {
    if (daysToMaturity <= 7) {
      return <span className="text-red-600 font-semibold">⚠️ Urgent</span>;
    } else if (daysToMaturity <= 30) {
      return <span className="text-yellow-600 font-semibold">⚡ Soon</span>;
    }
    return <span className="text-green-600">✓ Good</span>;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const calculateTotalExposure = () => {
    return hedges.reduce((sum, hedge) => sum + (hedge.notional_amount || 0), 0);
  };

  const calculateTotalPnL = () => {
    return hedges.reduce((sum, hedge) => sum + (hedge.unrealized_pnl || 0), 0);
  };

  const handleRollover = async (hedgeId) => {
    try {
      const response = await fetch(`/api/hedging/rollover-recommendation/${hedgeId}`, { headers: authHeaders() });
      const data = await response.json();
      alert(`Recommendation: ${data.recommendation}\nAction: ${data.action}`);
    } catch (error) {
      console.error('Error getting rollover recommendation:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Active Hedge Portfolio
        </h2>
        <p className="text-green-100">
          Track and manage your currency hedge positions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-600">Active Hedges</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {hedges.filter(h => h.status === 'active').length}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-600">Total Notional</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(calculateTotalExposure())}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-600">Unrealized P&L</span>
          </div>
          <div className={`text-2xl font-bold ${
            calculateTotalPnL() >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {formatCurrency(calculateTotalPnL())}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <span className="text-sm text-gray-600">Maturing Soon</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {hedges.filter(h => h.days_to_maturity <= 30).length}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          {['active', 'matured', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg transition-all ${
                filter === status
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
          <button
            onClick={fetchHedges}
            className="ml-auto px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Hedges List */}
      {hedges.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No {filter} hedges found
          </h3>
          <p className="text-gray-600">
            Create a new hedge contract to get started
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {hedges.map((hedge) => (
            <div
              key={hedge.id}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">
                        {hedge.currency_pair}
                      </h3>
                      {getStatusBadge(hedge.status)}
                      {hedge.status === 'active' && getUrgencyBadge(hedge.days_to_maturity)}
                    </div>
                    <p className="text-sm text-gray-600">
                      {hedge.hedge_type.charAt(0).toUpperCase() + hedge.hedge_type.slice(1)} Contract • 
                      ID: {hedge.id}
                    </p>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => setShowMenu(showMenu === hedge.id ? null : hedge.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <MoreVertical className="w-5 h-5 text-gray-600" />
                    </button>
                    
                    {showMenu === hedge.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                        <button
                          onClick={() => setSelectedHedge(hedge)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleRollover(hedge.id)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                        >
                          Rollover Recommendation
                        </button>
                        <button className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-red-600">
                          Cancel Hedge
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Notional Amount</div>
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(hedge.notional_amount)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-600 mb-1">Hedge Ratio</div>
                    <div className="font-semibold text-gray-900">
                      {(hedge.hedge_ratio * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-600 mb-1">Contract Rate</div>
                    <div className="font-semibold text-gray-900">
                      {hedge.contract_rate.toFixed(6)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-600 mb-1">Current Rate</div>
                    <div className="font-semibold text-gray-900">
                      {hedge.current_rate.toFixed(6)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-600 mb-1">Unrealized P&L</div>
                    <div className={`font-semibold ${
                      hedge.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(hedge.unrealized_pnl)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-6 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>Start: {formatDate(hedge.start_date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>Maturity: {formatDate(hedge.maturity_date)}</span>
                    </div>
                    {hedge.status === 'active' && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{hedge.days_to_maturity} days to maturity</span>
                      </div>
                    )}
                  </div>

                  {hedge.status === 'active' && hedge.days_to_maturity <= 30 && (
                    <button
                      onClick={() => handleRollover(hedge.id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      Consider Rollover
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar for time to maturity */}
              {hedge.status === 'active' && (
                <div className="px-6 pb-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        hedge.days_to_maturity <= 7 ? 'bg-red-600' :
                        hedge.days_to_maturity <= 30 ? 'bg-yellow-600' : 'bg-green-600'
                      }`}
                      style={{
                        width: `${Math.max(0, Math.min(100, (hedge.days_to_maturity / 90) * 100))}%`
                      }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detailed View Modal */}
      {selectedHedge && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">
                  Hedge Details
                </h3>
                <button
                  onClick={() => setSelectedHedge(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <XCircle className="w-6 h-6 text-gray-600" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Currency Pair</div>
                    <div className="text-lg font-bold">{selectedHedge.currency_pair}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Hedge Type</div>
                    <div className="text-lg font-bold capitalize">{selectedHedge.hedge_type}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Notional Amount</div>
                    <div className="text-lg font-bold">{formatCurrency(selectedHedge.notional_amount)}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Hedge Ratio</div>
                    <div className="text-lg font-bold">{(selectedHedge.hedge_ratio * 100).toFixed(0)}%</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Contract Rate</div>
                    <div className="text-lg font-bold">{selectedHedge.contract_rate.toFixed(6)}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Current Market Rate</div>
                    <div className="text-lg font-bold">{selectedHedge.current_rate.toFixed(6)}</div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Unrealized P&L</span>
                    <span className={`text-2xl font-bold ${
                      selectedHedge.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(selectedHedge.unrealized_pnl)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HedgeTracker;
