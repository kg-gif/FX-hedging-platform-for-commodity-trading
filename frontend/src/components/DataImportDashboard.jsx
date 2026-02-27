import React, { useState, useEffect } from 'react';
import { useCompany } from '../contexts/CompanyContext';
import { Upload, Plus, Download, AlertCircle, CheckCircle, Edit2, Trash2, X, Save } from 'lucide-react';
import FileUpload from './FileUpload.jsx';
import ManualEntry from './ManualEntry.jsx';

const API_BASE = 'https://birk-fx-api.onrender.com';
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`
});
const NAVY = '#1A2744';
const GOLD = '#C9A86C';

const DataImportDashboard = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const { selectedCompany } = useCompany();
  const [exposures, setExposures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingExposure, setEditingExposure] = useState(null);
  const [editForm, setEditForm] = useState({ currency_pair: '', amount: '', start_date: '', end_date: '', description: '' });
  const [deletingExposure, setDeletingExposure] = useState(null);

  const fetchExposures = async () => {
    if (!selectedCompany) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${selectedCompany.id}`, { headers: authHeaders() });
      const data = await response.json();
      if (data.success) setExposures(data.exposures || []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to fetch exposures' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExposures(); }, [selectedCompany]);

  const handleSaveSuccess = () => {
    fetchExposures();
    setMessage({ type: 'success', text: 'Exposure saved successfully!' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleEdit = (exposure) => {
    setEditingExposure(exposure);
    setEditForm({
      currency_pair: `${exposure.from_currency} / ${exposure.to_currency}`,
      amount: exposure.amount.toString(),
      start_date: exposure.start_date || '',
      end_date: exposure.end_date || '',
      description: exposure.description || ''
    });
  };

  const closeEditModal = () => {
    setEditingExposure(null);
    setEditForm({ currency_pair: '', amount: '', start_date: '', end_date: '', description: '' });
  };

  const handleSaveEdit = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${editingExposure.id}`, {
        method: 'PUT',
        headers: authHeaders(),
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
    } catch {
      setMessage({ type: 'error', text: 'Failed to update exposure' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const confirmDelete = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/exposure-data/exposures/${deletingExposure.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Exposure deleted successfully!' });
        setDeletingExposure(null);
        fetchExposures();
      } else {
        setMessage({ type: 'error', text: data.message || 'Delete failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete exposure' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString() : 'N/A';

  const tabs = [
    { id: 'upload', label: 'File Upload',      Icon: Upload   },
    { id: 'manual', label: 'Manual Entry',     Icon: Plus     },
    { id: 'view',   label: 'View Exposures',   Icon: Download },
  ];

  return (
    <div className="max-w-7xl mx-auto">

      {/* Header */}
      <div className="rounded-xl shadow-md p-6 mb-6" style={{ background: NAVY }}>
        <h1 className="text-2xl font-bold text-white">Data Import & Management</h1>
        <p className="text-sm mt-1" style={{ color: '#8DA4C4' }}>
          Upload files or manually enter FX exposure data
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success'
            ? <CheckCircle size={16} className="mr-2" />
            : <AlertCircle size={16} className="mr-2" />}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-md mb-6">
        <div className="flex border-b border-gray-100">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex items-center px-6 py-4 text-sm font-medium transition-all"
                style={{
                  color: active ? GOLD : '#6B7280',
                  borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
                  background: 'transparent',
                }}
              >
                <Icon size={16} className="mr-2" />
                {label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === 'upload' && <FileUpload companyId={selectedCompany?.id} onSaveSuccess={handleSaveSuccess} />}
          {activeTab === 'manual' && <ManualEntry companyId={selectedCompany?.id} onSaveSuccess={handleSaveSuccess} />}
          {activeTab === 'view' && (
            <div>
              <h2 className="text-lg font-semibold mb-4" style={{ color: NAVY }}>Current Exposures</h2>
              {loading ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              ) : exposures.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No exposures found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead style={{ background: '#F4F6FA' }}>
                      <tr>
                        {['Currency Pair','Amount','Start Date','End Date','Period','Risk Level','Actions'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                            style={{ color: NAVY }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {exposures.map((exp) => (
                        <tr key={exp.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-sm" style={{ color: NAVY }}>
                            {exp.from_currency} / {exp.to_currency}
                          </td>
                          <td className="px-4 py-3 text-sm">${exp.amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm">{formatDate(exp.start_date)}</td>
                          <td className="px-4 py-3 text-sm">{formatDate(exp.end_date)}</td>
                          <td className="px-4 py-3 text-sm">{exp.settlement_period} days</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              exp.risk_level === 'HIGH'   ? 'bg-red-100 text-red-800' :
                              exp.risk_level === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {exp.risk_level}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex space-x-3">
                              <button onClick={() => handleEdit(exp)} style={{ color: NAVY }}
                                className="hover:opacity-70"><Edit2 size={16} /></button>
                              <button onClick={() => setDeletingExposure(exp)}
                                className="text-red-500 hover:opacity-70"><Trash2 size={16} /></button>
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
        </div>
      </div>

      {/* Edit Modal */}
      {editingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold" style={{ color: NAVY }}>Edit Exposure</h3>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Currency Pair', key: 'currency_pair', type: 'text' },
                { label: 'Amount',        key: 'amount',        type: 'number' },
                { label: 'Start Date',    key: 'start_date',    type: 'date' },
                { label: 'End Date',      key: 'end_date',      type: 'date' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input type={type} value={editForm[key]}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none" rows="2" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSaveEdit} disabled={loading}
                className="flex-1 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: NAVY }}>
                <Save size={14} className="inline mr-1" /> Save
              </button>
              <button onClick={closeEditModal}
                className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingExposure && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center mb-3 text-red-600">
              <AlertCircle size={20} className="mr-2" />
              <h3 className="text-lg font-bold">Confirm Delete</h3>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <p><strong>Currency:</strong> {deletingExposure.from_currency} / {deletingExposure.to_currency}</p>
              <p><strong>Amount:</strong> ${deletingExposure.amount?.toLocaleString()}</p>
            </div>
            <p className="text-xs text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={confirmDelete} disabled={loading}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                Delete
              </button>
              <button onClick={() => setDeletingExposure(null)}
                className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataImportDashboard;