import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, AlertCircle, FileSpreadsheet, Info } from 'lucide-react';
import { NAVY, GOLD, STYLES } from '../brand';

const FileUpload = ({ companyId, onUploadSuccess }) => {
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
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xls', 'xlsx'].includes(ext)) {
      setError('Invalid file type. Please upload CSV or Excel file.'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.'); return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', companyId);
      const response = await fetch('/api/exposure-data/upload', { method: 'POST', body: formData });
      const result   = await response.json();
      if (result.success) {
        setUploadResult(result);
        if (onUploadSuccess) onUploadSuccess(result);
      } else {
        setError(result.error || 'Upload failed');
      }
    } catch (err) {
      setError(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async (format) => {
    try {
      const response = await fetch(`/api/exposure-data/template/${format}`);
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
          <div style={{ color: NAVY }}>
            <p className="font-semibold mb-2">Required Fields:</p>
            <ul className="space-y-1 text-gray-600">
              {[
                ['Reference Number', 'Unique identifier for each exposure'],
                ['Currency Pair',    'Format: EURUSD, GBPUSD, etc.'],
                ['Amount',           'Exposure amount in base currency'],
                ['Start Date',       'Format: YYYY-MM-DD (e.g., 2025-01-15)'],
                ['End Date',         'Format: YYYY-MM-DD (e.g., 2025-04-15)'],
                ['Description',      'Optional notes or description'],
              ].map(([field, desc]) => (
                <li key={field}>
                  <strong style={{ color: NAVY }}>{field}:</strong> {desc}
                </li>
              ))}
            </ul>
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
          accept=".csv,.xlsx,.xls" onChange={handleChange} />
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
            <p className="text-xs text-gray-400">CSV, XLS, XLSX — max 10MB</p>
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
              <p className="font-semibold text-green-800 text-sm">Upload Successful</p>
              <p className="text-xs text-green-600 mt-0.5">
                {uploadResult.row_count} exposures imported from {uploadResult.filename}
              </p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <h3 className="font-semibold" style={{ color: NAVY }}>Import Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Exposures', value: uploadResult.summary.total_exposures },
                { label: 'Total Amount',    value: fmt(uploadResult.summary.total_amount) },
                { label: 'Currencies',      value: uploadResult.summary.unique_currencies },
                { label: 'Avg Period',      value: `${uploadResult.summary.avg_period_days} days` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg p-4" style={{ background: '#F4F6FA' }}>
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-xl font-bold" style={{ color: NAVY }}>{value}</p>
                </div>
              ))}
            </div>

            {uploadResult.validation_warnings?.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-yellow-800 mb-1">Warnings</p>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    {uploadResult.validation_warnings.map((w, i) => <li key={i}>• {w}</li>)}
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