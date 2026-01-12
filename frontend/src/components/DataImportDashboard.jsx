import React, { useState } from 'react';
import { Upload, Edit, List } from 'lucide-react';
import FileUpload from './FileUpload';
import ManualEntry from './ManualEntry';
import ExposureList from './ExposureList';

const DataImportDashboard = ({ companyId }) => {
  const [activeTab, setActiveTab] = useState('upload');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = (result) => {
    console.log('Upload successful:', result);
    setRefreshTrigger(prev => prev + 1);
    // Optionally switch to list view
    // setActiveTab('list');
  };

  const handleSaveSuccess = (exposure) => {
    console.log('Exposure saved:', exposure);
    setRefreshTrigger(prev => prev + 1);
  };

  const tabs = [
    { id: 'upload', label: 'Upload File', icon: Upload },
    { id: 'manual', label: 'Manual Entry', icon: Edit },
    { id: 'list', label: 'View Exposures', icon: List }
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-md mb-6">
        <div className="flex border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-6 py-4 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'upload' && (
          <FileUpload 
            companyId={companyId} 
            onUploadSuccess={handleUploadSuccess}
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
  );
};

// Simple ExposureList component (basic implementation)
const ExposureList = ({ companyId, refreshTrigger }) => {
  const [exposures, setExposures] = useState([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetchExposures();
  }, [companyId, refreshTrigger]);

  const fetchExposures = async () => {
    setLoading(true);
    try {
      // Set date range for the query (e.g., current year)
      const startDate = '2025-01-01';
      const endDate = '2025-12-31';
      
      const response = await fetch(
        `/api/exposure-data/exposures/${companyId}?start_date=${startDate}&end_date=${endDate}`
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-gray-600 to-gray-800 text-white rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <List className="w-6 h-6" />
          Exposure List
        </h2>
        <p className="text-gray-100">
          View and manage your FX exposure records
        </p>
      </div>

      {exposures.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <List className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No exposures found
          </h3>
          <p className="text-gray-600">
            Upload a file or create manual entries to get started
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Currency
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    End Date
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period (Days)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {exposures.map((exposure) => (
                  <tr key={exposure.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {exposure.reference_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {exposure.currency_pair}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(exposure.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {exposure.start_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {exposure.end_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900">
                      {exposure.period_days}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        {exposure.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataImportDashboard;
