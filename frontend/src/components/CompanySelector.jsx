import React from 'react'
import { useCompany } from '../contexts/CompanyContext'

const CompanySelector = () => {
  const { 
    companies, 
    selectedCompanyId, 
    selectCompany, 
    loading,
    error,
    getSelectedCompany 
  } = useCompany()

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-gray-600">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm">Loading companies...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600 text-sm">
        Error loading companies
      </div>
    )
  }

  const selectedCompany = getSelectedCompany()

  return (
    <div className="flex items-center space-x-3">
      <span className="text-sm font-medium text-gray-700">Company:</span>
      <select
        value={selectedCompanyId || ''}
        onChange={(e) => selectCompany(parseInt(e.target.value))}
        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 font-medium cursor-pointer hover:border-gray-400 transition-colors"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      
      {selectedCompany && (
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
            {selectedCompany.base_currency}
          </span>
          <span className="text-gray-400">•</span>
          <span>
            ${(selectedCompany.trading_volume_monthly / 1_000_000).toFixed(1)}M monthly
          </span>
        </div>
      )}
    </div>
  )
}

export default CompanySelector