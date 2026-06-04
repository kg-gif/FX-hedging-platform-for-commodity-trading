// RiskSettingsContext.jsx
//
// Holds company-level risk framework settings that affect the UI.
// Currently: counterparty utilisation thresholds.
//
// Phase 2: state lives here (localStorage for persistence across page reloads).
// Phase 3: replace the useState initialiser with a fetch from
//   GET /api/settings/risk  — then PATCH /api/settings/risk on save.
//   The consuming components (Counterparties, etc.) do not need to change.
//
// Threshold semantics:
//   utilisation >= atRiskPct   → "High"   (warning colour, counted as at-risk)
//   utilisation >= warningPct  → "Medium" (muted colour)
//   below warningPct           → "Low"    (success colour)

import { createContext, useContext, useState, useCallback } from 'react'

const STORAGE_KEY = 'snh_risk_settings'

const DEFAULTS = {
  atRiskPct:  80,
  warningPct: 60,
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

const RiskSettingsContext = createContext(null)

export function RiskSettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadFromStorage)

  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const cpStatus = useCallback((utilisationPct) => {
    if (utilisationPct >= settings.atRiskPct)  return 'High'
    if (utilisationPct >= settings.warningPct) return 'Medium'
    return 'Low'
  }, [settings.atRiskPct, settings.warningPct])

  return (
    <RiskSettingsContext.Provider value={{ settings, updateSettings, cpStatus }}>
      {children}
    </RiskSettingsContext.Provider>
  )
}

export function useRiskSettings() {
  const ctx = useContext(RiskSettingsContext)
  if (!ctx) throw new Error('useRiskSettings must be used inside RiskSettingsProvider')
  return ctx
}
