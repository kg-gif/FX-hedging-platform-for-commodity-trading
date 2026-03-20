import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, AlertCircle, FileSpreadsheet, Info } from 'lucide-react';
import { NAVY, GOLD, STYLES } from '../brand';
import { useCompany } from '../contexts/CompanyContext';

const API_BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com';

// companyId prop is kept for backwards compat but the component reads
// directly from context so the value is always fresh at upload time.
const FileUpload = ({ companyId: companyIdProp, onUploadSuccess }) => {
  // Context exposes selectedCompanyId (integer), not selectedCompany (object)
  const { selectedCompanyId } = useCompany();
  const [dragActive, setDragActive]     = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError]               = useState(null);
  const fileInputRef                    = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const handleFile = async (file) => {
    setError(null); setUploadResult(null);
    // Read company id from context at call time — never from a stale prop.
    // Context provides selectedCompanyId (integer), prop is a fallback.
    const companyId = selectedCompanyId ?? companyIdProp;
    console.log('[FileUpload] selectedCompanyId:', selectedCompanyId, '| companyId:', companyId);
    if (!companyId) {
      setError('No company selected — please select a company from the top menu before uploading.'); return;
    }
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx') {
      setError('Only .xlsx files are supported. Please use the Sumnohow Import Template.'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.'); return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', companyId);
      console.log('[FileUpload] FormData company_id:', formData.get('company_id'));
      const response = await fetch(`${API_BASE}/api/exposure-data/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: formData,
      });

      // Guard: non-200 responses may return HTML (e.g. Render 502), not JSON
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error ${response.status}: ${text.slice(0, 200)}`);
      }

      const result   = await response.json();
      if (result.success) {
        setUploadResult(result);
        if (onUploadSuccess) onUploadSuccess(result);
      } else {
        setError(result.detail || result.error || 'Upload failed');
      }
    } catch (err) {
      console.error('[FileUpload] upload error:', err);
      setError(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async (format) => {
    try {
      const response = await fetch(`${API_BASE}/api/exposure-data/template/${format}`);
      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `exposure_template.${format}`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err) {
      setError(`Template download failed: ${err.message}`);
    }
  };

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl p-6 flex items-center gap-3" style={{ background: NAVY }}>
        <Upload className="text-white" size={22} />
        <div>
          <h2 className="text-xl font-bold text-white">Upload Exposure Data</h2>
          <p className="text-sm mt-0.5" style={{ color: '#8DA4C4' }}>
            Import your FX exposures from CSV or Excel files
          </p>
        </div>
      </div>

      {/* Required fields */}
      <div className="rounded-xl p-4 border text-sm"
        style={{ background: 'rgba(26,39,68,0.04)', borderColor: 'rgba(26,39,68,0.12)' }}>
        <div className="flex items-start gap-3">
          <Info size={16} className="mt-0.5 flex-shrink-0" style={{ color: NAVY }} />
          <div style={{ color: NAVY }} className="w-full">
            <p className="font-semibold mb-3">Required Fields</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: 'rgba(26,39,68,0.08)' }}>
                  <th className="text-left px-2 py-1.5 font-semibold" style={{ color: NAVY, width: '160px' }}>Field</th>
                  <th className="text-left px-2 py-1.5 font-semibold" style={{ color: NAVY }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['currency_pair',   'Format: FROM/TO e.g. GBP/USD, EUR/NOK'],
                  ['description',     'Invoice ref, contract name, or counterparty'],
                  ['start_date',      'When exposure begins — trade or invoice date. Format: YYYY-MM-DD'],
                  ['maturity_date',   'When exposure settles — forward value date. Format: YYYY-MM-DD. Must be after start_date and today or later'],
                  ['total_amount',    'Notional in the FROM currency. Numbers only, no commas'],
                  ['budget_rate',     'Your internal planning rate e.g. 1.3200'],
                  ['instrument_type', 'Forward, Spot, or Option'],
                  ['base_currency',   'Your reporting currency e.g. EUR, GBP'],
                ].map(([field, desc], i) => (
                  <tr key={field} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(26,39,68,0.04)' }}>
                    <td className="px-2 py-1.5 font-mono font-semibold" style={{ color: NAVY }}>{field}</td>
                    <td className="px-2 py-1.5 text-gray-600">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Template downloads */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h3 className="font-semibold mb-1" style={{ color: NAVY }}>Download Template</h3>
        <p className="text-sm text-gray-500 mb-4">
          Start with our template to ensure your data is formatted correctly
        </p>
        <div className="flex gap-3">
          <button onClick={() => downloadTemplate('csv')}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-semibold"
            style={{ background: NAVY }}>
            <FileSpreadsheet size={16} /> CSV Template
          </button>
          <button onClick={() => downloadTemplate('xlsx')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: GOLD, color: NAVY }}>
            <FileSpreadsheet size={16} /> Excel Template
          </button>
        </div>
      </div>

      {/* Upload area */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <input ref={fileInputRef} type="file" className="hidden"
          accept=".xlsx" onChange={handleChange} />
        <div
          onDragEnter={handleDrag} onDragLeave={handleDrag}
          onDragOver={handleDrag} onDrop={handleDrop}
          className="border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer"
          style={{
            borderColor: dragActive ? GOLD : '#E5E7EB',
            background:  dragActive ? 'rgba(201,168,108,0.05)' : 'transparent'
          }}
          onClick={() => fileInputRef.current.click()}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full"
              style={{ background: dragActive ? 'rgba(201,168,108,0.1)' : '#F4F6FA' }}>
              <Upload size={36} style={{ color: dragActive ? GOLD : '#9CA3AF' }} />
            </div>
            <div>
              <p className="font-semibold text-gray-700">
                {dragActive ? 'Drop file here' : 'Drag and drop your file here'}
              </p>
              <p className="text-sm text-gray-400 mt-1">or click to browse</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current.click(); }}
              disabled={uploading}
              className="px-6 py-2.5 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: NAVY }}
            >
              {uploading ? 'Uploading...' : 'Select File'}
            </button>
            <p className="text-xs text-gray-400">Excel (.xlsx) only — max 10MB</p>
          </div>
        </div>
      </div>

      {/* Uploading spinner */}
      {uploading && (
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 flex items-center gap-3">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2" style={{ borderColor: GOLD }}></div>
          <div>
            <p className="font-semibold text-sm" style={{ color: NAVY }}>Processing file...</p>
            <p className="text-xs text-gray-400 mt-0.5">Validating and importing your data</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <XCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 text-sm">Upload Failed</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Success result */}
      {uploadResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 p-4 bg-green-50 border-b border-green-100">
            <CheckCircle size={20} className="text-green-600" />
            <div>
              <p className="font-semibold text-green-800 text-sm">Import Complete</p>
              <p className="text-xs text-green-600 mt-0.5">
                {uploadResult.imported ?? uploadResult.row_count} exposure{(uploadResult.imported ?? uploadResult.row_count) !== 1 ? 's' : ''} imported
                {uploadResult.skipped > 0 ? ` · ${uploadResult.skipped} skipped` : ''}
                {' '}from {uploadResult.filename}
              </p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg p-4" style={{ background: '#F4F6FA' }}>
                <p className="text-xs text-gray-500 mb-1">Imported</p>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{uploadResult.imported ?? uploadResult.row_count}</p>
              </div>
              <div className="rounded-lg p-4" style={{ background: uploadResult.skipped > 0 ? '#FFFBEB' : '#F4F6FA' }}>
                <p className="text-xs text-gray-500 mb-1">Skipped</p>
                <p className="text-2xl font-bold" style={{ color: uploadResult.skipped > 0 ? '#D97706' : NAVY }}>
                  {uploadResult.skipped ?? 0}
                </p>
              </div>
            </div>

            {uploadResult.errors?.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-yellow-800 mb-2">
                    {uploadResult.skipped} row{uploadResult.skipped !== 1 ? 's' : ''} skipped — see details
                  </p>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    {uploadResult.errors.map((e, i) => <li key={i} className="font-mono text-xs">• {e}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUpload;