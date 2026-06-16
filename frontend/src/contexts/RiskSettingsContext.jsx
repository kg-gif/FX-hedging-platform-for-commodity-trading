// RiskSettingsContext.jsx
//
// Holds company-level risk framework settings that affect the UI.
// Currently: counterparty utilisation thresholds.
//
// Phase 3: settings are fetched from GET /api/settings/risk on mount
// and persisted via PATCH /api/settings/risk on save.
// The consuming components (Counterparties, Settings) do not need to change.
//
// Threshold semantics:
//   utilisation >= atRiskPct   → "High"   (warning colour, counted as at-risk)
//   utilisation >= warningPct  → "Medium" (muted colour)
//   below warningPct           → "Low"    (success colour)

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { API, authHeaders } from '../utils/api'

const DEFAULTS = {
  // Counterparty utilisation thresholds (whole number percentages)
  atRiskPct:  80,   // "High"   — at or above this = at risk
  warningPct: 60,   // "Medium" — at or above this, below atRiskPct
}

const RiskSettingsContext = createContext(null)

export function RiskSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch risk settings from the backend on mount.
  // Falls back to defaults (80/60) if the request fails — the screen
  // remains functional with conservative thresholds.
  useEffect(() => {
    setIsLoading(true)
    fetch(API.riskSettings, { credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => setSettings({
        atRiskPct:  data.counterparty_at_risk_pct  ?? DEFAULTS.atRiskPct,
        warningPct: data.counterparty_warning_pct  ?? DEFAULTS.warningPct,
      }))
      .catch(() => {
        // API unavailable — use defaults; Settings screen will surface a caption
        setSettings(DEFAULTS)
      })
      .finally(() => setIsLoading(false))
  }, [])

  // Persist updated thresholds to the backend.
  // Optimistically updates local state before the PATCH resolves.
  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }

      fetch(API.riskSettings, {
        method: 'PATCH',
        credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterparty_at_risk_pct:  next.atRiskPct,
          counterparty_warning_pct:  next.warningPct,
        }),
      }).catch(err => {
        // Log but do not revert — the user's intent is clear.
        // Settings.jsx surfaces a save-error caption if needed.
        console.warn('[RiskSettings] PATCH failed:', err)
      })

      return next
    })
  }, [])

  // Derive counterparty status from utilisation % and current thresholds
  const cpStatus = useCallback((utilisationPct) => {
    if (utilisationPct >= settings.atRiskPct)  return 'High'
    if (utilisationPct >= settings.warningPct) return 'Medium'
    return 'Low'
  }, [settings.atRiskPct, settings.warningPct])

  return (
    <RiskSettingsContext.Provider value={{ settings, updateSettings, cpStatus, isLoading }}>
      {children}
    </RiskSettingsContext.Provider>
  )
}

export function useRiskSettings() {
  const ctx = useContext(RiskSettingsContext)
  if (!ctx) throw new Error('useRiskSettings must be used inside RiskSettingsProvider')
  return ctx
}
