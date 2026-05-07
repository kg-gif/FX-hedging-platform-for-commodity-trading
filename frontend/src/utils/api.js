// ============================================================
// SHARED API CONFIGURATION
// All endpoint URL builders live here.
// Import from here — never hardcode onrender.com URLs.
//
// MIGRATION NOTE: Existing components use their own local
// API_BASE const. Migrate them to these helpers as you touch
// each file. Do NOT do a bulk search-replace — verify each
// call site matches the actual backend route first.
// ============================================================

const BASE = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com'
export { BASE as API_BASE }

// Derive WebSocket base from HTTP base: https → wss, http → ws
export const WS_BASE = BASE.replace(/^http/, 'ws')

export const wsRates = () => `${WS_BASE}/ws/rates`  // append ?token=...&company_id=... at call site
export const fxRatesTicker = (cid) => `${BASE}/api/fx-rates/ticker?company_id=${cid}`

const h = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
})
export { h as authHeaders }

export const API = {
  // Auth
  login:              `${BASE}/api/auth/login`,
  forgotPassword:     `${BASE}/api/auth/forgot-password`,
  resetPassword:      `${BASE}/api/auth/reset-password`,

  // Exposures
  exposuresBasic:     (cid) => `${BASE}/exposures?company_id=${cid}`,
  exposuresEnriched:  (cid) => `${BASE}/api/exposures/enriched?company_id=${cid}`,
  exposureById:       (id)  => `${BASE}/api/exposure-data/exposures/${id}`,
  archiveExposure:    (id)  => `${BASE}/api/exposures/${id}/archive`,
  unarchiveExposure:  (id)  => `${BASE}/api/exposures/${id}/unarchive`,
  resetCorridor:      (id)  => `${BASE}/api/exposures/${id}/reset-corridor`,

  // Tranches
  trancheMTM:         (eid) => `${BASE}/api/tranches/mtm/${eid}`,
  markExecuted:       `${BASE}/api/audit/mark-executed`,

  // Dashboard
  dashSummary:        (cid) => `${BASE}/api/dashboard/summary?company_id=${cid}`,

  // Hedging
  recommendations:    (cid) => `${BASE}/api/hedging/recommendations?company_id=${cid}`,

  // Margin call
  marginCallStatus:   (cid) => `${BASE}/api/margin-call/status/${cid}`,

  // Policies
  policies:           (cid) => `${BASE}/api/policies?company_id=${cid}`,

  // Reports
  marketReport:       (cid) => `${BASE}/api/reports/market/${cid}`,
  marketReportPdf:    (cid) => `${BASE}/api/reports/market/${cid}/pdf`,
  generateReport:     (cid) => `${BASE}/api/reports/market/generate/${cid}`,
  auditLog:           (cid) => `${BASE}/api/reports/audit/${cid}`,
  pnlSummary:         (cid) => `${BASE}/api/reports/pnl/${cid}`,
  mtmLog:             (cid) => `${BASE}/api/reports/mtm/${cid}`,
  zoneLog:            (cid) => `${BASE}/api/reports/zones/${cid}`,
  marginCallLog:      (cid) => `${BASE}/api/reports/margin-calls/${cid}`,

  // Facilities
  facilities:         (cid) => `${BASE}/api/facilities/${cid}`,
  facilityUtilisation:(cid) => `${BASE}/api/facilities/utilisation/${cid}`,

  // Settings
  companySettings:    (cid) => `${BASE}/api/settings/company/${cid}`,
  bankDetails:        (cid) => `${BASE}/api/settings/bank/${cid}`,

  // Admin
  adminCompanies:     `${BASE}/api/admin/companies`,
  adminExposures:     `${BASE}/api/admin/exposures`,
  adminUsers:         `${BASE}/api/admin/users`,
  demoReset:          (cid) => `${BASE}/api/admin/companies/${cid}/demo-reset`,

  // Data import/export
  uploadExposures:    `${BASE}/api/exposure-data/upload`,
  template:           (fmt) => `${BASE}/api/exposure-data/template/${fmt}`,
  companyExposures:   (cid) => `${BASE}/api/exposure-data/exposures/${cid}`,
}
