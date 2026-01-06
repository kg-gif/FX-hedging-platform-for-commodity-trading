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
      console.error('Error fetching companies:', err);
      setError('Failed to load companies');
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
      console.error('Error fetching exposures:', err);
      setError('Failed to load exposures');
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
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Rates refreshed:', data);
        // Refresh the exposures list to show updated rates
        await fetchExposures(selectedCompany.id);
      } else {
        throw new Error('Failed to refresh rates');
      }
    } catch (err) {
      console.error('Error refreshing rates:', err);
      setError('Failed to refresh rates. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatRate = (rate) => {
    if (!rate) return '-';
    return rate.toFixed(4);
  };

  const formatRateChange = (exposure) => {
    if (!exposure.current_rate || !exposure.initial_rate) return null;
    
    const change = ((exposure.current_rate - exposure.initial_rate) / exposure.initial_rate) * 100;
    return change.toFixed(2);
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

  const totalExposure = exposures.reduce((sum, exp) => sum + (exp.current_value_usd || 0), 0);

  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Never';
    const now = new Date();
    const diff = Math.floor((now - lastUpdated) / 1000); // seconds
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return lastUpdated.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-lg">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center space-x-3">
            <div className="text-4xl">🌾</div>
            <div>
              <h1 className="text-3xl font-bold">Birk</h1>
              <p className="text-slate-300 text-sm">FX Risk Management Platform</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Company Selector */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Select Company:
          </label>
          <select
            value={selectedCompany?.id || ''}
            onChange={(e) => {
              const company = companies.find(c => c.id === parseInt(e.target.value));
              setSelectedCompany(company);
            }}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {selectedCompany && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Total Exposure</div>
                <div className="text-3xl font-bold text-slate-800">
                  {formatCurrency(totalExposure)}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Number of Positions</div>
                <div className="text-3xl font-bold text-slate-800">{exposures.length}</div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Base Currency</div>
                <div className="text-3xl font-bold text-slate-800">
                  {selectedCompany.base_currency}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Company Type</div>
                <div className="text-xl font-bold text-slate-800">
                  {selectedCompany.company_type.replace(/_/g, ' ').toUpperCase()}
                </div>
              </div>
            </div>

            {/* Exposures Table */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">FX Exposures</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Last updated: {formatLastUpdated()}
                  </p>
                </div>
                <button
                  onClick={refreshRates}
                  disabled={refreshing}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                    refreshing
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg'
                  }`}
                >
                  {refreshing ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Refreshing...
                    </span>
                  ) : (
                    '🔄 Refresh Rates'
                  )}
                </button>
              </div>

              {error && (
                <div className="mx-6 my-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                  <p>Loading exposures...</p>
                </div>
              ) : exposures.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <p className="text-lg">No exposures found for this company.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Currency Pair
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Current Rate
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Rate Change
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Settlement
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Risk Level
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {exposures.map((exposure) => {
                        const rateChange = formatRateChange(exposure);
                        const changeNum = parseFloat(rateChange);
                        
                        return (
                          <tr key={exposure.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-gray-900">
                                {exposure.from_currency}/{exposure.to_currency}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-700">
                              {formatCurrency(exposure.amount)}
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-mono text-gray-900">
                                {formatRate(exposure.current_rate)}
                              </div>
                              <div className="text-xs text-gray-500">
                                Initial: {formatRate(exposure.initial_rate)}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {rateChange ? (
                                <div className={`flex items-center font-semibold ${getRateChangeColor(changeNum)}`}>
                                  <span className="text-lg mr-1">{getRateChangeIcon(changeNum)}</span>
                                  <span>{Math.abs(changeNum).toFixed(2)}%</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-gray-700">
                              {exposure.settlement_period.replace(/_/g, ' ')}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                Low
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-600 text-sm">
                              {exposure.description || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer Info */}
            <div className="mt-6 text-center text-sm text-gray-500">
              <p className="flex items-center justify-center space-x-2">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Connected to {API_BASE}</span>
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
