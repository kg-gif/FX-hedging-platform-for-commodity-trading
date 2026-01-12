import React, { useState } from 'react';
import FileUpload from './FileUpload.jsx';
import ManualEntry from './ManualEntry.jsx';

const API_BASE = 'https://birk-fx-api.onrender.com';

const DataImportDashboard = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [companyId, setCompanyId] = useState(1);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSaveSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const tabs = [
    { id: 'upload', name: 'Upload File', icon: '📤' },
    { id: 'manual', name: 'Manual Entry', icon: '✍️' },
    { id: 'list', name: 'View Exposures', icon: '📋' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          💾 Data Import & Management
        </h2>
        <p className="text-gray-600">
          Upload CSV/Excel files or enter exposure data manually
        </p>
      </div>

      {/* Company Selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Company:</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(Number(e.target.value))}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value={1}>BIRK Commodities A/S</option>
            <option value={2}>Global Trade Corp</option>
            <option value={3}>Nordic Exports Ltd</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-lg">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center px-6 py-4 text-sm font-medium border-b-2 transition-colors
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span className="text-xl mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'upload' && (
            <FileUpload
              companyId={companyId}
              onSaveSuccess={handleSaveSuccess}
            />
          )}

          {activeTab === 'manual' && (
            <ManualEntry
              companyId={companyId}
              onSaveSuccess={handleSaveSuccess}
            />
          )}

          {activeTab === 'list' && (
            <ExposureList
              companyId={companyId}
              refreshTrigger={refreshTrigger}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ExposureList component to display saved exposures
const ExposureList = ({ companyId, refreshTrigger }) => {
  const [exposures, setExposures] = useState([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetchExposures();
  }, [companyId, refreshTrigger]);

  const fetchExposures = async () => {
    setLoading(true);
    try {
      const startDate = '2025-01-01';
      const endDate = '2025-12-31';

      const response = await fetch(
        `${API_BASE}/api/exposure-data/exposures/${companyId}?start_date=${startDate}&end_date=${endDate}`
      );
      const data = await response.json();

      if (data.success) {
        setExposures(data.exposures || []);
      }
    } catch (error) {
      console.error('Error fetching exposures:', error);
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getRiskColor = (risk) => {
    switch (risk?.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading exposures...</p>
      </div>
    );
  }

  if (exposures.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📭</div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">No Exposures Found</h3>
        <p className="text-gray-600">Upload a file or add exposures manually to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">
            {exposures.length} Exposure{exposures.length !== 1 ? 's' : ''} Found
          </h3>
          <p className="text-sm text-gray-600">
            Total Value: {formatCurrency(exposures.reduce((sum, exp) => sum + (exp.amount || 0), 0))}
          </p>
        </div>
        <button
          onClick={fetchExposures}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          🔄 Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency Pair</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Start Date</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">End Date</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {exposures.map((exp) => (
              <tr key={exp.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {exp.reference_number || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {exp.currency_pair || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                  {formatCurrency(exp.amount || 0)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">
                  {exp.start_date ? formatDate(exp.start_date) : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">
                  {exp.end_date ? formatDate(exp.end_date) : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">
                  {exp.period_days ? `${exp.period_days} days` : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRiskColor(exp.status)}`}>
                    {exp.status || 'active'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                  {exp.description || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataImportDashboard;
