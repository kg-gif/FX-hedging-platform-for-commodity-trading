import React, { useState, useEffect } from 'react';
import './index.css';

const API_BASE = 'https://birk-fx-api.onrender.com';

function App() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [exposures, setExposures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  // Fetch companies on mount
  useEffect(() => {
    fetchCompanies();
  }, []);

  // Fetch exposures when company changes
  useEffect(() => {
    if (selectedCompany) {
      fetchExposures(selectedCompany.id);
    }
  }, [selectedCompany]);

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API_BASE}/companies`);
      const data = await response.json();
      setCompanies(data);
      if (data.length > 0) {
        setSelectedCompany(data[0]);
      }
    } catch (err) {
      setError('Failed to load companies');
      console.error(err);
    }
  };

  const fetchExposures = async (companyId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/companies/${companyId}/exposures`);
      const data = await response.json();
      setExposures(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load exposures');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const refreshRates = async () => {
    if (!selectedCompany) return;
    
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/companies/${selectedCompany.id}/refresh-rates`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Rates refreshed:', data);
        // Re-fetch exposures to get updated data
        await fetchExposures(selectedCompany.id);
      } else {
        throw new Error('Failed to refresh rates');
      }
    } catch (err) {
      setError('Failed to refresh rates');
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  const formatCurrency = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${value.toLocaleString()}`;
  };

  const formatRate = (rate) => {
    return rate ? rate.toFixed(4) : 'N/A';
  };

  const calculateRateChange = (exposure) => {
    if (!exposure.initial_rate || !exposure.current_rate) return null;
    const change = ((exposure.current_rate - exposure.initial_rate) / exposure.initial_rate) * 100;
    return change;
  };

  const getRateChangeColor = (change) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getRateChangeIcon = (change) => {
    if (change > 0) return '↑';
    if (change < 0) return '↓';
    return '→';
  };

  const getTimeAgo = (date) => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  const getRiskBadgeColor = (risk) => {
    switch (risk?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const totalExposure = exposures.reduce((sum, exp) => sum + (exp.current_value_usd || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🌍 BIRK FX Risk Management</h1>
              <p className="text-sm text-gray-600 mt-1">Real-time Currency Exposure Dashboard</p>
            </div>
            {selectedCompany && (
              <div className="text-right">
                <p className="text-sm text-gray-600">Total Exposure</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalExposure)}</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Company Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Company
          </label>
          <select
            value={selectedCompany?.id || ''}
            onChange={(e) => {
              const company = companies.find(c => c.id === parseInt(e.target.value));
              setSelectedCompany(company);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {/* Exposures Section */}
        {selectedCompany && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Section Header with Refresh Button */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  FX Exposures ({exposures.length})
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Last updated: {getTimeAgo(lastUpdated)}
                </p>
              </div>
              <button
                onClick={refreshRates}
                disabled={refreshing || loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {refreshing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Refreshing...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Refresh Rates</span>
                  </>
                )}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Loading State */}
            {loading ? (
              <div className="px-6 py-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600">Loading exposures...</p>
              </div>
            ) : exposures.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-gray-600">No exposures found for this company.</p>
              </div>
            ) : (
              /* Exposures Table */
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Currency Pair
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Rate
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rate Change
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        USD Value
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Settlement
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Risk Level
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {exposures.map((exposure) => {
                      const rateChange = calculateRateChange(exposure);
                      return (
                        <tr key={exposure.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="text-lg mr-2">💱</span>
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {exposure.from_currency}/{exposure.to_currency}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {exposure.description}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(exposure.amount)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {exposure.from_currency}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatRate(exposure.current_rate)}
                            </div>
                            <div className="text-xs text-gray-500">
                              Initial: {formatRate(exposure.initial_rate)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {rateChange !== null ? (
                              <div className={`flex items-center gap-1 text-sm font-medium ${getRateChangeColor(rateChange)}`}>
                                <span className="text-lg">{getRateChangeIcon(rateChange)}</span>
                                <span>{Math.abs(rateChange).toFixed(2)}%</span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(exposure.current_value_usd)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {exposure.settlement_period}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRiskBadgeColor(exposure.risk_level)}`}>
                              {exposure.risk_level || 'Unknown'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Summary Footer */}
            {exposures.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">{exposures.length}</span> active exposure{exposures.length !== 1 ? 's' : ''}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Total Portfolio Value</p>
                    <p className="text-lg font-bold text-blue-600">{formatCurrency(totalExposure)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
