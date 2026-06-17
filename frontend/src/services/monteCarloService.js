// monteCarloService.js — Phase 3
//
// Calls GET /api/monte-carlo/simulate/exposure/{id}?horizon_days=90&history_days=90
// Returns the full BF-005 response shape (forward_path, confidence_bands,
// historical_rates, var_95_pct, expected_shortfall_95_pct, vol_calibrated, narrative).
//
// Auth: sends Authorization: Bearer header (localStorage pattern — will switch to
// credentials: 'include' cookie pattern when BF-002 is deployed, per handoff doc).

import { API, authHeaders } from '../utils/api'

export const monteCarloService = {
  /**
   * Run Monte Carlo simulation for a single exposure.
   * Returns full BF-005 response shape.
   */
  async runSimulation(exposureId, horizonDays = 90, historyDays = 90) {
    const url = API.monteCarlo(exposureId, horizonDays, historyDays)

    const response = await fetch(url, {
      method: 'GET',
      headers: authHeaders(),
      credentials: 'include',
    })

    if (!response.ok) {
      let errorBody = null
      try { errorBody = await response.json() } catch (_) {}
      throw new Error(
        (errorBody && (errorBody.detail || errorBody.message)) || 'Simulation failed'
      )
    }

    return response.json()
  },

  /**
   * Get simulation history for an exposure (run log).
   * Not used in Phase 3 Risk Engine screen — retained for future use.
   */
  async getHistory(exposureId, limit = 10) {
    const response = await fetch(
      `${API.monteCarlo(exposureId).split('?')[0].replace('/simulate/', '/history/')}?limit=${limit}`,
      { headers: authHeaders(), credentials: 'include' }
    )
    if (!response.ok) throw new Error('Failed to fetch simulation history')
    return response.json()
  },
}
