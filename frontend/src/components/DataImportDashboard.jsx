import React, { useState, useEffect } from 'react';
import { useCompany } from '../contexts/CompanyContext';
import { 
  Upload, Plus, Download, AlertCircle, CheckCircle, 
  Edit2, Trash2, X, Save 
} from 'lucide-react';
import FileUpload from './FileUpload.jsx';
import ManualEntry from './ManualEntry.jsx';

const API_BASE = 'https://birk-fx-api.onrender.com';

const DataImportDashboard = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const { selectedCompany } = useCompany();
  const [exposures, setExposures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  
  // Edit modal state
  const [editingExposure, setEditingExposure] = useState(null);
  const [editForm, setEditForm] = useState({
    currency_pair: '',
    amount: '',
    start_date: '',
    end_date: '',
    description: ''
  });
  
  // Delete confirmation state
  const [deletingExposure, setDeletingExposure] = useState(null);

  // Fetch exposures
  const fetchExposures = async () => {
    if (!selectedCompany) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${selectedCompany.id}`);
      const data = await response.json();
      
      if (data.success) {
        setExposures(data.exposures || []);
      }
    } catch (error) {
      console.error('Error fetching exposures:', error);
      setMessage({ type: 'error', text: 'Failed to fetch exposures' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExposures();
  }, [selectedCompany]);

  // Handle save success from ManualEntry or FileUpload
  const handleSaveSuccess = () => {
    fetchExposures();
    setMessage({ type: 'success', text: 'Exposure saved successfully!' });
    setTimeout(() => setMessage(null), 3000);
  };

  // Open edit modal
  const handleEdit = (exposure) => {
    setEditingExposure(exposure);
    setEditForm({
      currency_pair: `${exposure.from_currency} → ${exposure.to_currency}`,
      amount: exposure.amount.toString(),
      start_date: exposure.start_date || '',
      end_date: exposure.end_date || '',
      description: exposure.description || ''
    });
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditingExposure(null);
    setEditForm({
      currency_pair: '',
      amount: '',
      start_date: '',
      end_date: '',
      description: ''
    });
  };

  // Save edited exposure
  const handleSaveEdit = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${editingExposure.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency_pair: editForm.currency_pair,
          amount: parseFloat(editForm.amount),
          start_date: editForm.start_date,
          end_date: editForm.end_date,
          description: editForm.description
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'Exposure updated successfully!' });
        closeEditModal();
        fetchExposures();
      } else {
        setMessage({ type: 'error', text: data.message || 'Update failed' });
      }
    } catch (error) {
      console.error('Error updating exposure:', error);
      setMessage({ type: 'error', text: 'Failed to update exposure' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Open delete confirmation
  const handleDelete = (exposure) => {
    setDeletingExposure(exposure);
  };

  // Confirm delete
  const confirmDelete = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${deletingExposure.id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'Exposure deleted successfully!' });
        setDeletingExposure(null);
        fetchExposures();
      } else {
        setMessage({ type: 'error', text: data.message || 'Delete failed' });
      }
    } catch (error) {
      console.error('Error deleting exposure:', error);
      setMessage({ type: 'error', text: 'Failed to delete exposure' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Data Import & Management</h1>
        <p className="text-gray-600 mt-2">Upload files or manually enter FX exposure data</p>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle className="mr-2" /> : <AlertCircle className="mr-2" />}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'upload'
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Upload className="inline mr-2" size={18} />
          File Upload
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'manual'
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Plus className="inline mr-2" size={18} />
          Manual Entry
        </button>
        <button
          onClick={() => setActiveTab('view')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'view'
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Download className="inline mr-2" size={18} />
          View Exposures
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'upload' && (
        <FileUpload companyId={selectedCompany?.id} onSaveSuccess={handleSaveSuccess} />
      )}

      {activeTab === 'manual' && (
        <ManualEntry companyId={selectedCompany?.id} onSaveSuccess={handleSaveSuccess} />
      )}

      {activeTab === 'view' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Current Exposures</h2>
          
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : exposures.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No exposures found</div>
          ) : (
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
                      Start Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      End Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Risk Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {exposures.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium">
                        {exp.from_currency} → {exp.to_currency}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        ${exp.amount?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {formatDate(exp.start_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {formatDate(exp.end_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {exp.settlement_period} days
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          exp.risk_level === 'HIGH' ? 'bg-red-100 text-red-800' :
                          exp.risk_level === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {exp.risk_level}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(exp)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Edit"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(exp)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Edit Exposure</h3>
              <button onClick={closeEditModal} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currency Pair
                </label>
                <input
                  type="text"
                  value={editForm.currency_pair}
                  onChange={(e) => setEditForm({ ...editForm, currency_pair: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="EURUSD"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount
                </label>
                <input
                  type="number"
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={editForm.start_date}
                  onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={editForm.end_date}
                  onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows="2"
                />
              </div>
            </div>
            
            <div className="mt-6 flex space-x-3">
              <button
                onClick={handleSaveEdit}
                disabled={loading}
                className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                <Save className="inline mr-2" size={18} />
                Save Changes
              </button>
              <button
                onClick={closeEditModal}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center mb-4 text-red-600">
              <AlertCircle className="mr-2" size={24} />
              <h3 className="text-xl font-semibold">Confirm Delete</h3>
            </div>
            
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete this exposure?
            </p>
            
            <div className="bg-gray-50 p-3 rounded mb-4">
              <p className="text-sm"><strong>Currency:</strong> {deletingExposure.from_currency} → {deletingExposure.to_currency}</p>
              <p className="text-sm"><strong>Amount:</strong> ${deletingExposure.amount?.toLocaleString()}</p>
            </div>
            
            <p className="text-sm text-gray-600 mb-6">
              This action cannot be undone.
            </p>
            
            <div className="flex space-x-3">
              <button
                onClick={confirmDelete}
                disabled={loading}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="inline mr-2" size={18} />
                Delete
              </button>
              <button
                onClick={() => setDeletingExposure(null)}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataImportDashboard;