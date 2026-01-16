import React, { useState } from 'react';
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

const ManualEntry = ({ companyId, onSaveSuccess }) => {
  const [formData, setFormData] = useState({
    reference_number: '',
    currency_pair: '',
    amount: '',
    start_date: '',
    end_date: '',
    description: '',
    rate: ''
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [showBatchEntry, setShowBatchEntry] = useState(false);
  const [batchExposures, setBatchExposures] = useState([]);

  const currencyPairs = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD',
    'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'AUDJPY',
    'NOKSEK', 'EURNOK', 'EURSEK', 'USDNOK', 'USDSEK'
  ];

  const validateForm = () => {
    const newErrors = {};

    if (!formData.reference_number.trim()) {
      newErrors.reference_number = 'Reference number is required';
    }

    if (!formData.currency_pair) {
      newErrors.currency_pair = 'Currency pair is required';
    }

    const amount = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amount) || amount <= 0) {
      newErrors.amount = 'Valid amount is required';
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

    if (formData.rate) {
      const rate = parseFloat(formData.rate);
      if (isNaN(rate) || rate <= 0) {
        newErrors.rate = 'Rate must be a positive number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  setSaveResult(null);

  if (!validateForm()) {
    return;
  }

  setSaving(true);

  try {
    const payload = {
      company_id: companyId,
      reference_number: formData.reference_number,
      currency_pair: formData.currency_pair,
      amount: parseFloat(formData.amount),
      start_date: formData.start_date,
      end_date: formData.end_date,
      description: formData.description || '',
      rate: formData.rate ? parseFloat(formData.rate) : null
    };
    
    console.log('Sending payload:', payload);  // Debug log
    
    const response = await fetch('/api/exposure-data/manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('API response:', result);  // Debug log

    if (result.success) {
      setSaveResult(result);
      setFormData({
        reference_number: '',
        currency_pair: '',
        amount: '',
        start_date: '',
        end_date: '',
        description: '',
        rate: ''
      });
      if (onSaveSuccess) {
        onSaveSuccess(result.exposure);
      }
    } else {
      // Handle both error formats
      const errorMsg = result.errors?.join(', ') || 
                      result.error || 
                      (Array.isArray(result.detail) ? result.detail.join(', ') : result.detail) ||
                      'Unknown error';
      setErrors({ submit: errorMsg });
    }
  } catch (err) {
    console.error('Submit error:', err);  // Debug log
    setErrors({ submit: `Save failed: ${err.message}` });
  } finally {
    setSaving(false);
  }
};

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const calculatePeriodDays = () => {
    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      return days > 0 ? days : 0;
    }
    return 0;
  };

  const addToBatch = () => {
    if (!validateForm()) {
      return;
    }

    const newExposure = {
      ...formData,
      amount: parseFloat(formData.amount),
      rate: formData.rate ? parseFloat(formData.rate) : null,
      period_days: calculatePeriodDays()
    };

    setBatchExposures([...batchExposures, newExposure]);
    
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
  };

  const removeBatchExposure = (index) => {
    setBatchExposures(batchExposures.filter((_, i) => i !== index));
  };

  const saveBatch = async () => {
    if (batchExposures.length === 0) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/exposure-data/batch-manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_id: companyId,
          exposures: batchExposures
        })
      });

      const result = await response.json();

      if (result.success) {
        setSaveResult({
          success: true,
          message: `Successfully created ${result.created_count} exposures`,
          batch: true
        });
        setBatchExposures([]);
        setShowBatchEntry(false);
      } else {
        setErrors({ 
          submit: `${result.created_count} exposures created, ${result.error_count} failed` 
        });
      }
    } catch (err) {
      setErrors({ submit: `Batch save failed: ${err.message}` });
    } finally {
      setSaving(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Plus className="w-6 h-6" />
              Manual Data Entry
            </h2>
            <p className="text-green-100">
              Enter individual exposure records or create multiple entries at once
            </p>
          </div>
          <button
            onClick={() => setShowBatchEntry(!showBatchEntry)}
            className="px-4 py-2 bg-white text-green-600 rounded-lg hover:bg-green-50 transition-colors font-semibold"
          >
            {showBatchEntry ? 'Single Entry' : 'Batch Entry'}
          </button>
        </div>
      </div>

      {/* Success Message */}
      {saveResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-900">
                {saveResult.batch ? 'Batch Save Successful!' : 'Exposure Created!'}
              </p>
              <p className="text-sm text-green-700 mt-1">
                {saveResult.message || `Reference: ${saveResult.exposure?.reference_number}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {errors.submit && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{errors.submit}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Form */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Reference Number & Currency Pair */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Reference Number *
                </div>
              </label>
              <input
                type="text"
                value={formData.reference_number}
                onChange={(e) => handleChange('reference_number', e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.reference_number ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., REF-2025-001"
              />
              {errors.reference_number && (
                <p className="mt-1 text-sm text-red-600">{errors.reference_number}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency Pair *
              </label>
              <select
                value={formData.currency_pair}
                onChange={(e) => handleChange('currency_pair', e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.currency_pair ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select currency pair</option>
                {currencyPairs.map(pair => (
                  <option key={pair} value={pair}>{pair}</option>
                ))}
              </select>
              {errors.currency_pair && (
                <p className="mt-1 text-sm text-red-600">{errors.currency_pair}</p>
              )}
            </div>
          </div>

          {/* Amount & Rate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Amount *
                </div>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.amount ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="1000000"
              />
              {errors.amount && (
                <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                FX Rate (Optional)
              </label>
              <input
                type="number"
                step="0.000001"
                value={formData.rate}
                onChange={(e) => handleChange('rate', e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.rate ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="1.085000"
              />
              {errors.rate && (
                <p className="mt-1 text-sm text-red-600">{errors.rate}</p>
              )}
            </div>
          </div>

          {/* Start Date & End Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Start Date *
                </div>
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.start_date ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.start_date && (
                <p className="mt-1 text-sm text-red-600">{errors.start_date}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  End Date *
                </div>
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => handleChange('end_date', e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.end_date ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.end_date && (
                <p className="mt-1 text-sm text-red-600">{errors.end_date}</p>
              )}
            </div>
          </div>

          {/* Period Calculation */}
          {formData.start_date && formData.end_date && !errors.end_date && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-900">Exposure Period:</span>
                <span className="font-semibold text-blue-900">
                  {calculatePeriodDays()} days
                </span>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Description (Optional)
              </div>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add notes or description..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            {showBatchEntry ? (
              <>
                <button
                  type="button"
                  onClick={addToBatch}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add to Batch
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {saving ? 'Saving...' : 'Save Exposure'}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Batch Entry List */}
      {showBatchEntry && batchExposures.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Batch Queue ({batchExposures.length} {batchExposures.length === 1 ? 'exposure' : 'exposures'})
            </h3>
            <button
              onClick={saveBatch}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : `Save All (${batchExposures.length})`}
            </button>
          </div>

          <div className="space-y-3">
            {batchExposures.map((exposure, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1 grid grid-cols-5 gap-4">
                  <div>
                    <div className="text-xs text-gray-600">Reference</div>
                    <div className="font-semibold text-gray-900">{exposure.reference_number}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Currency</div>
                    <div className="font-semibold text-gray-900">{exposure.currency_pair}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Amount</div>
                    <div className="font-semibold text-gray-900">{formatCurrency(exposure.amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Period</div>
                    <div className="font-semibold text-gray-900">{exposure.period_days} days</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Dates</div>
                    <div className="text-sm text-gray-900">
                      {exposure.start_date} to {exposure.end_date}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeBatchExposure(index)}
                  className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
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