import React, { createContext, useContext, useState, useEffect } from 'react'

const CompanyContext = createContext()

export const useCompany = () => {
  const context = useContext(CompanyContext)
  if (!context) {
    throw new Error('useCompany must be used within CompanyProvider')
  }
  return context
}

export const CompanyProvider = ({ children }) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState(null)
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const API_BASE_URL = 'https://birk-fx-api.onrender.com'
  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('auth_token')}`
  })

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/companies`, { headers: authHeaders() })
      
      if (!response.ok) {
        throw new Error('Failed to fetch companies')
      }

      const data = await response.json()
      setCompanies(data)

      if (data.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(data[0].id)
      }

      setError(null)
    } catch (err) {
      console.error('Error fetching companies:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectCompany = (companyId) => {
    setSelectedCompanyId(companyId)
    localStorage.setItem('selectedCompanyId', companyId)
  }

  const getSelectedCompany = () => {
    return companies.find(c => c.id === selectedCompanyId)
  }

  const value = {
    selectedCompanyId,
    selectCompany,
    companies,
    loading,
    error,
    getSelectedCompany,
    refreshCompanies: fetchCompanies,
    API_BASE_URL
  }

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  )
}