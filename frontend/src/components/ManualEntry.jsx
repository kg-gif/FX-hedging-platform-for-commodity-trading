import React, { useState, useEffect } from 'react';
import { useCompany } from '../contexts/CompanyContext';
import { Plus, Save, X, CheckCircle, AlertCircle, AlertTriangle, Calendar, DollarSign, FileText, Hash } from 'lucide-react';
import { NAVY, GOLD, WARNING } from '../brand';

const API_BASE_URL = 'https://birk-fx-api.onrender.com';

const EMPTY_FORM = {
  reference_number: '',
  currency_pair: '',
  amount: '',
  start_date: '',
  end_date: '',
  description: '',
  rate: '',
  budget_rate: '',
  max_loss_limit: '',
  target_profit: '',
  hedge_ratio_policy: '1.0',
  instrument_type: 'Spot'
};

const ManualEntry = ({ companyId, onSaveSuccess }) => {
  const { selectedCompanyId } = useCompany();
  const [mode, setMode]           = useState('single');
  const [formData, setFormData]   = useState(EMPTY_FORM);
  const [batchEntries, setBatchEntries] = useState([]);
  const [errors, setErrors]       = useState({});
  const [message, setMessage]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);

  useEffect(() => {
    console.log('Company ID in ManualEntry:', selectedCompanyId);
  }, [companyId]);

  const validateForm = () => {
    const e = {};
    if (!formData.reference_number) e.reference_number = 'Reference number is required';
    if (!formData.currency_pair)    e.currency_pair    = 'Currency pair is required';
    if (!formData.amount || parseFloat(formData.amount) <= 0) e.amount = 'Amount must be greater than 0';
    if (!formData.start_date)       e.start_date       = 'Start date is required';
    if (!formData.end_date)         e.end_date         = 'End date is required';
    if (formData.start_date && formData.end_date) {
      if (new Date(formData.start_date) >= new Date(formData.end_date))
        e.end_date = 'End date must be after start date';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = (data) => ({
    company_id:         selectedCompanyId,
    reference_number:   data.reference_number,
    currency_pair:      data.currency_pair,
    amount:             parseFloat(data.amount),
    start_date:         data.start_date,
    end_date:           data.end_date,
    description:        data.description || '',
    rate:               data.rate         ? parseFloat(data.rate)              : null,
    budget_rate:        data.budget_rate  ? parseFloat(data.budget_rate)       : null,
    max_loss_limit:     data.max_loss_limit   ? parseFloat(data.max_loss_limit)   : null,
    target_profit:      data.target_profit    ? parseFloat(data.target_profit)    : null,
    hedge_ratio_policy: data.hedge_ratio_policy ? parseFloat(data.hedge_ratio_policy) : 1.0,
    instrument_type:    data.instrument_type || 'Spot'
  });

  const doSave = async () => {
    setPendingSave(false);
    setShowOverrideConfirm(false);
    try {
      setLoading(true);
      setMessage(null);
      const response = await fetch(`${API_BASE_URL}/api/exposure-data/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(formData))
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: data.message || 'Exposure saved successfully!' });
        setFormData(EMPTY_FORM);
        setErrors({});
        if (onSaveSuccess) onSaveSuccess();
      } else {
        setMessage({ type: 'error', text: data.detail || data.message || 'Failed to save exposure' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Network error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateForm()) { setMessage({ type: 'error', text: 'Please fix the errors above' }); return; }
    if (!selectedCompanyId) { setMessage({ type: 'error', text: 'Please select a company first' }); return; }

    // If hedge ratio differs from 100% default, confirm override intent
    const ratio = parseFloat(formData.hedge_ratio_policy);
    if (ratio !== 1.0 && !pendingSave) {
      setShowOverrideConfirm(true);
      return;
    }

    await doSave();
  };

  const handleAddToBatch = (e) => {
    e.preventDefault();
    if (!validateForm()) { setMessage({ type: 'error', text: 'Please fix the errors above' }); return; }
    setBatchEntries([...batchEntries, { ...formData }]);
    setFormData({ ...EMPTY_FORM, currency_pair: formData.currency_pair, instrument_type: formData.instrument_type });
    setErrors({});
    setMessage({ type: 'success', text: `Added to batch (${batchEntries.length + 1} entries)` });
  };

  const handleSaveBatch = async () => {
    if (!batchEntries.length) { setMessage({ type: 'error', text: 'No entries in batch' }); return; }
    if (!selectedCompanyId)   { setMessage({ type: 'error', text: 'Please select a company first' }); return; }

    setLoading(true);
    let successCount = 0, failCount = 0;

    for (const entry of batchEntries) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/exposure-data/manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(entry))
        });
        const data = await response.json();
        if (response.ok && data.success) successCount++;
        else failCount++;
      } catch { failCount++; }
    }

    setMessage({ type: successCount > 0 ? 'success' : 'error', text: `${successCount} saved, ${failCount} failed` });
    if (successCount > 0) { setBatchEntries([]); if (onSaveSuccess) onSaveSuccess(); }
    setLoading(false);
  };

  const periodDays = () => {
    if (!formData.start_date || !formData.end_date) return 0;
    const days = Math.ceil((new Date(formData.end_date) - new Date(formData.start_date)) / 86400000);
    return days > 0 ? days : 0;
  };

  const hedgeRatio = parseFloat(formData.hedge_ratio_policy) || 0;
  const amt        = parseFloat(formData.amount) || 0;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold" style={{ color: NAVY }}>Manual Data Entry</h2>
          <p className="text-sm text-gray-500 mt-0.5">Enter individual exposure records or create multiple at once</p>
          {selectedCompanyId
            ? <p className="text-xs text-green-600 mt-1">Company ID: {selectedCompanyId}</p>
            : <p className="text-xs text-red-500 mt-1">No company selected</p>
          }
        </div>
        <div className="flex gap-2">
          {['single', 'batch'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className="px-4 py-2 rounded-lg text-sm font-semibold capitalize"
              style={{
                background: mode === m ? NAVY : '#F4F6FA',
                color:      mode === m ? 'white' : '#6B7280'
              }}>
              {m === 'single' ? 'Single Entry' : 'Batch Entry'}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success'
            ? <CheckCircle size={16} className="mr-2 flex-shrink-0" />
            : <AlertCircle size={16} className="mr-2 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      <form onSubmit={mode === 'single' ? handleSave : handleAddToBatch}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Reference Number */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
              <Hash size={12} className="inline mr-1" />Reference Number *
            </label>
            <input type="text" value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none ${errors.reference_number ? 'border-red-400' : 'border-gray-200'}`}
              placeholder="e.g., REF-2025-001" />
            {errors.reference_number && <p className="text-red-500 text-xs mt-1">{errors.reference_number}</p>}
          </div>

          {/* Currency Pair */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
              Currency Pair *
            </label>
            <select value={formData.currency_pair}
              onChange={(e) => setFormData({ ...formData, currency_pair: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none ${errors.currency_pair ? 'border-red-400' : 'border-gray-200'}`}>
              <option value="">Select currency pair</option>
              {['EURUSD','GBPUSD','JPYUSD','CHFUSD','AUDUSD','CADUSD','NZDUSD','CNYUSD','INRUSD','BRLUSD','MXNUSD','ZARUSD'].map(p => (
                <option key={p} value={p}>{p.slice(0,3)}/{p.slice(3)}</option>
              ))}
            </select>
            {errors.currency_pair && <p className="text-red-500 text-xs mt-1">{errors.currency_pair}</p>}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
              <DollarSign size={12} className="inline mr-1" />Amount *
            </label>
            <input type="number" value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none ${errors.amount ? 'border-red-400' : 'border-gray-200'}`}
              placeholder="1000000" step="0.01" />
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
          </div>

          {/* FX Rate */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
              FX Rate (Optional)
            </label>
            <input type="number" value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
              placeholder="1.085000" step="0.000001" />
            <p className="text-xs text-gray-400 mt-1">Leave blank to fetch live rate</p>
          </div>

          {/* Instrument Type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
              Instrument Type
            </label>
            <select value={formData.instrument_type}
              onChange={(e) => setFormData({ ...formData, instrument_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
              <option value="Spot">Spot (Immediate Settlement)</option>
              <option value="Forward">Forward (Future Delivery)</option>
              <option value="Option">Option (Right to Buy/Sell)</option>
              <option value="Swap">Swap (Exchange Cash Flows)</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
              <Calendar size={12} className="inline mr-1" />Start Date *
            </label>
            <input type="date" value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none ${errors.start_date ? 'border-red-400' : 'border-gray-200'}`} />
            {errors.start_date && <p className="text-red-500 text-xs mt-1">{errors.start_date}</p>}
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
              <Calendar size={12} className="inline mr-1" />End Date *
            </label>
            <input type="date" value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none ${errors.end_date ? 'border-red-400' : 'border-gray-200'}`} />
            {errors.end_date && <p className="text-red-500 text-xs mt-1">{errors.end_date}</p>}
          </div>
        </div>

        {/* Period display */}
        {periodDays() > 0 && (
          <div className="mt-4 px-4 py-2.5 rounded-lg text-sm"
            style={{ background: 'rgba(26,39,68,0.05)', color: NAVY }}>
            Exposure period: <strong>{periodDays()} days</strong>
          </div>
        )}

        {/* Description */}
        <div className="mt-5">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
            <FileText size={12} className="inline mr-1" />Description (Optional)
          </label>
          <textarea value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
            rows="2" placeholder="Add notes or description..." />
        </div>

        {/* Budget & Risk section */}
        <div className="border-t border-gray-100 pt-5 mt-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: NAVY }}>Budget & Risk Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Budget Rate */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
                Budget Rate *
              </label>
              <input type="number" step="0.0001" value={formData.budget_rate}
                onChange={(e) => setFormData({ ...formData, budget_rate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                placeholder="e.g., 1.1000" required />
              <p className="text-xs text-gray-400 mt-1">Your planned/budgeted exchange rate</p>
            </div>

            {/* Target Hedge Coverage — Answer B */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
                Target Hedge Coverage (%)
              </label>
              <input type="number" step="5" min="0" max="100"
                value={hedgeRatio * 100}
                onChange={(e) => setFormData({ ...formData, hedge_ratio_policy: (parseFloat(e.target.value) / 100).toString() })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                placeholder="e.g., 60" />
              <p className="text-xs text-gray-400 mt-1">
                What % of this exposure should be hedged (overrides policy default)
              </p>
            </div>

            {/* Max Loss Limit */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
                Max Loss Limit
              </label>
              <input type="number" step="1000" value={formData.max_loss_limit}
                onChange={(e) => setFormData({ ...formData, max_loss_limit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                placeholder="e.g., -500000" />
              <p className="text-xs text-gray-400 mt-1">Maximum acceptable loss (negative number)</p>
            </div>

            {/* Target Profit */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: NAVY }}>
                Target Profit
              </label>
              <input type="number" step="1000" value={formData.target_profit}
                onChange={(e) => setFormData({ ...formData, target_profit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                placeholder="e.g., 300000" />
              <p className="text-xs text-gray-400 mt-1">Target profit goal (positive number)</p>
            </div>
          </div>

          {/* Hedge breakdown */}
          {hedgeRatio < 1.0 && amt > 0 && (
            <div className="mt-4 px-4 py-3 rounded-lg text-sm"
              style={{ background: 'rgba(201,168,108,0.08)', border: `1px solid rgba(201,168,108,0.3)` }}>
              <p style={{ color: NAVY }}>
                <strong>Hedge Breakdown:</strong><br />
                Hedged: ${(amt * hedgeRatio).toLocaleString()} ({(hedgeRatio * 100).toFixed(0)}%)<br />
                Open / Unhedged: ${(amt * (1 - hedgeRatio)).toLocaleString()} ({((1 - hedgeRatio) * 100).toFixed(0)}%)
              </p>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="mt-6">
          {mode === 'single' ? (
            <button type="submit" disabled={loading || !selectedCompanyId}
              className="w-full py-3 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: NAVY }}>
              <Save size={16} />
              {loading ? 'Saving...' : 'Save Exposure'}
            </button>
          ) : (
            <button type="submit" disabled={loading || !selectedCompanyId}
              className="w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: GOLD, color: NAVY }}>
              <Plus size={16} />
              Add to Batch
            </button>
          )}
        </div>
      </form>

      {/* Batch queue */}
      {mode === 'batch' && batchEntries.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-sm" style={{ color: NAVY }}>
              Batch Queue ({batchEntries.length} entries)
            </h3>
            <button onClick={handleSaveBatch} disabled={loading}
              className="px-5 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: NAVY }}>
              {loading ? 'Saving...' : `Save All ${batchEntries.length}`}
            </button>
          </div>
          <div className="space-y-2">
            {batchEntries.map((entry, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{ background: '#F4F6FA' }}>
                <div>
                  <p className="font-medium text-sm" style={{ color: NAVY }}>{entry.reference_number}</p>
                  <p className="text-xs text-gray-500">
                    {entry.currency_pair} • {entry.instrument_type} • ${parseFloat(entry.amount).toLocaleString()}
                  </p>
                </div>
                <button onClick={() => setBatchEntries(batchEntries.filter((_, idx) => idx !== i))}
                  className="text-red-400 hover:text-red-600"><X size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      {showOverrideConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} color={WARNING} />
              <h2 className="text-lg font-bold" style={{ color: NAVY }}>Set Manual Override?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              You are setting a target hedge of <strong>{(parseFloat(formData.hedge_ratio_policy) * 100).toFixed(0)}%</strong> on this exposure.
            </p>
            <p className="text-sm text-gray-600 mb-5">
              This creates a <strong>manual override</strong>. If you change the company hedging policy later,
              this exposure will <strong>not</strong> be automatically updated.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowOverrideConfirm(false)}
                className="px-5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                Cancel
              </button>
              <button
                onClick={() => { setPendingSave(true); doSave(); }}
                className="px-5 py-2 text-white rounded-lg text-sm font-semibold"
                style={{ background: NAVY }}>
                Yes, Set Override
              </button>
              <button
                onClick={() => {
                  setFormData({ ...formData, hedge_ratio_policy: '1.0' });
                  setShowOverrideConfirm(false);
                }}
                className="px-5 py-2 rounded-lg text-sm font-semibold"
                style={{ background: GOLD, color: NAVY }}>
                Keep Policy Default
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualEntry;