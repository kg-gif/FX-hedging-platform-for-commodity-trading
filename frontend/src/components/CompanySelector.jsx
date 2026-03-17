import React from 'react'
import { useCompany } from '../contexts/CompanyContext'
import { GOLD } from '../brand'

/**
 * CompanySelector — shown in the top nav.
 * - superadmin: full dropdown to switch between all companies.
 * - company_admin / viewer: static company name badge (no switching).
 */
const CompanySelector = ({ authUser }) => {
  const { companies, selectedCompanyId, selectCompany, loading, getSelectedCompany } = useCompany()

  const isSuperAdmin = ['superadmin', 'admin'].includes(authUser?.role)

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: GOLD }} />
        <span className="text-xs" style={{ color: '#8DA4C4' }}>Loading…</span>
      </div>
    )
  }

  const selectedCompany = getSelectedCompany()

  // Non-superadmin: read-only company name
  if (!isSuperAdmin) {
    return selectedCompany ? (
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ color: '#8DA4C4', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}>
          {selectedCompany.name}
        </span>
      </div>
    ) : null
  }

  // Superadmin: interactive dropdown to switch companies
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium" style={{ color: '#8DA4C4' }}>Company:</span>
      <select
        value={selectedCompanyId || ''}
        onChange={e => selectCompany(parseInt(e.target.value))}
        className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer focus:outline-none"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'white',
        }}
      >
        {companies.map(c => (
          <option key={c.id} value={c.id} style={{ background: '#1A2744', color: 'white' }}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export default CompanySelector
