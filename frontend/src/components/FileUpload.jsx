import React, { useState, useRef } from 'react';
import {
  Upload,
  File,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  FileSpreadsheet,
  Info
} from 'lucide-react';

const FileUpload = ({ companyId, onUploadSuccess }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file) => {
    setError(null);
    setUploadResult(null);

    // Validate file type
    const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    if (!['csv', 'xls', 'xlsx'].includes(fileExtension)) {
      setError('Invalid file type. Please upload CSV or Excel file.');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', companyId);

      const response = await fetch('/api/exposure-data/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setUploadResult(result);
        if (onUploadSuccess) {
          onUploadSuccess(result);
        }
      } else {
        setError(result.error || 'Upload failed');
      }
    } catch (err) {
      setError(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  const downloadTemplate = async (format) => {
    try {
      const response = await fetch(`/api/exposure-data/template/${format}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exposure_template.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(`Template download failed: ${err.message}`);
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
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Upload className="w-6 h-6" />
          Upload Exposure Data
        </h2>
        <p className="text-indigo-100">
          Import your FX exposures from CSV or Excel files
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-2">Required Fields:</p>
            <ul className="space-y-1 ml-4">
              <li>• <strong>Reference Number:</strong> Unique identifier for each exposure</li>
              <li>• <strong>Currency Pair:</strong> Format: EURUSD, GBPUSD, etc.</li>
              <li>• <strong>Amount:</strong> Exposure amount in base currency</li>
              <li>• <strong>Start Date:</strong> Format: YYYY-MM-DD (e.g., 2025-01-15)</li>
              <li>• <strong>End Date:</strong> Format: YYYY-MM-DD (e.g., 2025-04-15)</li>
              <li>• <strong>Description:</strong> Optional notes or description</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Template Downloads */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Download Template
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Start with our template to ensure your data is formatted correctly
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => downloadTemplate('csv')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <FileSpreadsheet className="w-5 h-5" />
            Download CSV Template
          </button>
          <button
            onClick={() => downloadTemplate('xlsx')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FileSpreadsheet className="w-5 h-5" />
            Download Excel Template
          </button>
        </div>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <form
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls"
            onChange={handleChange}
          />
          
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragActive
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="flex flex-col items-center gap-4">
              <div className={`p-4 rounded-full ${
                dragActive ? 'bg-blue-100' : 'bg-gray-100'
              }`}>
                <Upload className={`w-12 h-12 ${
                  dragActive ? 'text-blue-600' : 'text-gray-400'
                }`} />
              </div>
              
              <div>
                <p className="text-lg font-semibold text-gray-900 mb-1">
                  {dragActive ? 'Drop file here' : 'Drag and drop your file here'}
                </p>
                <p className="text-sm text-gray-600">
                  or click to browse
                </p>
              </div>

              <button
                type="button"
                onClick={onButtonClick}
                disabled={uploading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {uploading ? 'Uploading...' : 'Select File'}
              </button>

              <p className="text-xs text-gray-500">
                Supported formats: CSV, XLS, XLSX (Max 10MB)
              </p>
            </div>
          </div>
        </form>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <div>
              <p className="font-semibold text-gray-900">Processing file...</p>
              <p className="text-sm text-gray-600">Please wait while we validate and import your data</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Upload Failed</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-green-50 border-b border-green-200 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Upload Successful!</p>
                <p className="text-sm text-green-700">
                  {uploadResult.row_count} exposures imported from {uploadResult.filename}
                </p>
              </div>
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Import Summary</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Total Exposures</div>
                <div className="text-2xl font-bold text-gray-900">
                  {uploadResult.summary.total_exposures}
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Total Amount</div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(uploadResult.summary.total_amount)}
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Currencies</div>
                <div className="text-2xl font-bold text-gray-900">
                  {uploadResult.summary.unique_currencies}
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Avg Period</div>
                <div className="text-2xl font-bold text-gray-900">
                  {uploadResult.summary.avg_period_days} days
                </div>
              </div>
            </div>

            {/* Currency Breakdown */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Currency Breakdown</h4>
              <div className="space-y-2">
                {uploadResult.summary.currencies.map((currency) => {
                  const breakdown = uploadResult.summary.currency_breakdown[currency];
                  return (
                    <div key={currency} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-gray-900">{currency}</div>
                        <div className="text-sm text-gray-600">
                          {breakdown.count} {breakdown.count === 1 ? 'exposure' : 'exposures'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(breakdown.total_amount)}
                        </div>
                        <div className="text-xs text-gray-600">
                          Avg: {formatCurrency(breakdown.avg_amount)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Date Range */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm font-semibold text-blue-900 mb-2">Date Range</div>
              <div className="text-sm text-blue-800">
                {uploadResult.summary.earliest_start_date} to {uploadResult.summary.latest_end_date}
              </div>
            </div>

            {/* Warnings */}
            {uploadResult.validation_warnings && uploadResult.validation_warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-900 mb-2">Warnings</p>
                    <ul className="text-sm text-yellow-800 space-y-1">
                      {uploadResult.validation_warnings.map((warning, idx) => (
                        <li key={idx}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
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
