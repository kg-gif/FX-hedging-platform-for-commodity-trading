import React, { useState, useEffect } from 'react';
import { useCompany } from '../contexts/CompanyContext';
import {
  Plus,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  FileText,
  Hash
} from 'lucide-react';

// API Configuration
const API_BASE_URL = 'https://birk-fx-api.onrender.com';

const ManualEntry = ({ companyId, onSaveSuccess }) => {
  const { selectedCompanyId } = useCompany();
  const [mode, setMode] = useState('single'); // 'single' or 'batch'
  const [formData, setFormData] = useState({
    reference_number: '',
    currency_pair: '',
    amount: '',
    start_date: '',
    end_date: '',
    description: '',
    rate: ''
  });

  const [batchEntries, setBatchEntries] = useState([]);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  // Debug: Log company ID whenever it changes
  useEffect(() => {
    console.log('🏢 Company ID received in ManualEntry:', companyId);
  }, [companyId]);

  // Validate form
  const validateForm = () => {
    const newErrors = {};

    if (!formData.reference_number) {
      newErrors.reference_number = 'Reference number is required';
    }

    if (!formData.currency_pair) {
      newErrors.currency_pair = 'Currency pair is required';
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (!formData.start_date) {
      newErrors.start_date = 'Start date is required';
    }

    if (!formData.end_date) {
      newErrors.end_date = 'End date is required';
    }

    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      if (start >= end) {
        newErrors.end_date = 'End date must be after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle single exposure save
  const handleSave = async (e) => {
    e.preventDefault();

    console.log('💾 Attempting to save exposure...');
    console.log('🏢 Current company ID:', companyId);

    if (!validateForm()) {
      setMessage({ type: 'error', text: 'Please fix the errors above' });
      return;
    }

    if (!companyId) {
      console.error('❌ No company ID provided!');
      setMessage({ type: 'error', text: 'Please select a company first. Company ID is missing.' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      const payload = {
        company_id: selectedCompanyId,
        reference_number: formData.reference_number,
        currency_pair: formData.currency_pair,
        amount: parseFloat(formData.amount),
        start_date: formData.start_date,
        end_date: formData.end_date,
        description: formData.description || '',
        rate: formData.rate ? parseFloat(formData.rate) : null
      };

      console.log('📤 Sending payload:', payload);

      const response = await fetch(`${API_BASE_URL}/api/exposure-data/manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('📡 Response status:', response.status);
      
      const data = await response.json();
      console.log('📥 Response data:', data);

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: data.message || 'Exposure created successfully!' });
        
        // Reset form
        setFormData({
          reference_number: '',
          currency_pair: '',
          amount: '',
          start_date: '',
          end_date: '',
          description: '',
          rate: ''
        });
        setErrors({});

        // Notify parent
        if (onSaveSuccess) {
          onSaveSuccess();
        }
      } else {
        // Handle error response
        const errorMessage = data.detail || data.message || 'Failed to create exposure';
        console.error('❌ Error response:', errorMessage);
        setMessage({ type: 'error', text: errorMessage });
      }
    } catch (error) {
      console.error('❌ Error saving exposure:', error);
      setMessage({ type: 'error', text: `Network error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Add to batch
  const handleAddToBatch = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      setMessage({ type: 'error', text: 'Please fix the errors above' });
      return;
    }

    setBatchEntries([...batchEntries, { ...formData }]);
    
    // Reset form but keep some fields
    setFormData({
      reference_number: '',
      currency_pair: formData.currency_pair, // Keep currency pair
      amount: '',
      start_date: '',
      end_date: '',
      description: '',
      rate: formData.rate // Keep rate
    });
    setErrors({});
    
    setMessage({ type: 'success', text: `Added to batch (${batchEntries.length + 1} entries)` });
  };

  // Save batch
  const handleSaveBatch = async () => {
    if (batchEntries.length === 0) {
      setMessage({ type: 'error', text: 'No entries in batch' });
      return;
    }

    if (!companyId) {
      setMessage({ type: 'error', text: 'Please select a company first' });
      return;
    }

    try {
      setLoading(true);
      let successCount = 0;
      let failCount = 0;

      for (const entry of batchEntries) {
        try {
          const payload = {
            company_id: companyId,
            reference_number: entry.reference_number,
            currency_pair: entry.currency_pair,
            amount: parseFloat(entry.amount),
            start_date: entry.start_date,
            end_date: entry.end_date,
            description: entry.description || '',
            rate: entry.rate ? parseFloat(entry.rate) : null
          };

          const response = await fetch(`${API_BASE_URL}/api/exposure-data/manual`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          const data = await response.json();

          if (response.ok && data.success) {
            successCount++;
          } else {
            failCount++;
            console.error('Failed to save entry:', entry.reference_number, data);
          }
        } catch (error) {
          failCount++;
          console.error('Error saving entry:', entry.reference_number, error);
        }
      }

      setMessage({ 
        type: successCount > 0 ? 'success' : 'error', 
        text: `${successCount} exposures created, ${failCount} failed` 
      });

      if (successCount > 0) {
        setBatchEntries([]);
        if (onSaveSuccess) {
          onSaveSuccess();
        }
      }
    } catch (error) {
      console.error('Batch save error:', error);
      setMessage({ type: 'error', text: 'Failed to save batch' });
    } finally {
      setLoading(false);
    }
  };

  // Remove from batch
  const removeBatchEntry = (index) => {
    setBatchEntries(batchEntries.filter((_, i) => i !== index));
  };

  // Calculate period days
  const calculatePeriodDays = () => {
    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      return days > 0 ? days : 0;
    }
    return 0;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold">Manual Data Entry</h2>
          <p className="text-gray-600 text-sm">Enter individual exposure records or create multiple entries at once</p>
          {/* Debug info */}
          {companyId && (
            <p className="text-xs text-green-600 mt-1">✅ Company ID: {companyId}</p>
          )}
          {!companyId && (
            <p className="text-xs text-red-600 mt-1">❌ No company ID - please select company in header</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('single')}
            className={`px-4 py-2 rounded-lg ${
              mode === 'single'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Single Entry
          </button>
          <button
            onClick={() => setMode('batch')}
            className={`px-4 py-2 rounded-lg ${
              mode === 'batch'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Batch Entry
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle className="mr-2" size={20} /> : <AlertCircle className="mr-2" size={20} />}
          {message.text}
        </div>
      )}

      {/* Form */}
      <form onSubmit={mode === 'single' ? handleSave : handleAddToBatch}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Hash className="inline mr-1" size={16} />
              Reference Number *
            </label>
            <input
              type="text"
              value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg ${errors.reference_number ? 'border-red-500' : ''}`}
              placeholder="e.g., REF-2025-001"
            />
            {errors.reference_number && <p className="text-red-500 text-xs mt-1">{errors.reference_number}</p>}
          </div>

          {/* Currency Pair */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Currency Pair *
            </label>
            <select
              value={formData.currency_pair}
              onChange={(e) => setFormData({ ...formData, currency_pair: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg ${errors.currency_pair ? 'border-red-500' : ''}`}
            >
              <option value="">Select currency pair</option>
              <option value="EURUSD">EUR/USD</option>
              <option value="GBPUSD">GBP/USD</option>
              <option value="JPYUSD">JPY/USD</option>
              <option value="CHFUSD">CHF/USD</option>
              <option value="AUDUSD">AUD/USD</option>
              <option value="CADUSD">CAD/USD</option>
              <option value="NZDUSD">NZD/USD</option>
              <option value="CNYUSD">CNY/USD</option>
              <option value="INRUSD">INR/USD</option>
              <option value="BRLUSD">BRL/USD</option>
              <option value="MXNUSD">MXN/USD</option>
              <option value="ZARUSD">ZAR/USD</option>
            </select>
            {errors.currency_pair && <p className="text-red-500 text-xs mt-1">{errors.currency_pair}</p>}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <DollarSign className="inline mr-1" size={16} />
              Amount *
            </label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg ${errors.amount ? 'border-red-500' : ''}`}
              placeholder="1000000"
              step="0.01"
            />
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
          </div>

          {/* FX Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              FX Rate (Optional)
            </label>
            <input
              type="number"
              value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="1.085000"
              step="0.000001"
            />
            <p className="text-xs text-gray-500 mt-1">Leave blank to fetch live rate</p>
          </div>

          {/* Start Date & End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline mr-1" size={16} />
              Start Date *
            </label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg ${errors.start_date ? 'border-red-500' : ''}`}
            />
            {errors.start_date && <p className="text-red-500 text-xs mt-1">{errors.start_date}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline mr-1" size={16} />
              End Date *
            </label>
            <input
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg ${errors.end_date ? 'border-red-500' : ''}`}
            />
            {errors.end_date && <p className="text-red-500 text-xs mt-1">{errors.end_date}</p>}
          </div>
        </div>

        {/* Exposure Period Display */}
        {formData.start_date && formData.end_date && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>Exposure Period:</strong> {calculatePeriodDays()} days
            </p>
          </div>
        )}

        {/* Description */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <FileText className="inline mr-1" size={16} />
            Description (Optional)
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            rows="2"
            placeholder="Add notes or description..."
          />
        </div>

        {/* Submit Button */}
        <div className="mt-6">
          {mode === 'single' ? (
            <button
              type="submit"
              disabled={loading || !companyId}
              className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center"
            >
              <Save className="mr-2" size={20} />
              {loading ? 'Saving...' : 'Save Exposure'}
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading || !companyId}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
            >
              <Plus className="mr-2" size={20} />
              Add to Batch
            </button>
          )}
        </div>
      </form>

      {/* Batch Queue */}
      {mode === 'batch' && batchEntries.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Batch Queue ({batchEntries.length} entries)</h3>
            <button
              onClick={handleSaveBatch}
              disabled={loading}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : `Save All ${batchEntries.length} Exposures`}
            </button>
          </div>

          <div className="space-y-2">
            {batchEntries.map((entry, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium">{entry.reference_number}</p>
                  <p className="text-sm text-gray-600">
                    {entry.currency_pair} • ${parseFloat(entry.amount).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => removeBatchEntry(index)}
                  className="text-red-600 hover:text-red-800"
                >
                  <X size={20} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualEntry;