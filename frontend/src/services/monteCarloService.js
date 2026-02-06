const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://birk-fx-api.onrender.com';

export const monteCarloService = {
  /**
   * Run Monte Carlo simulation for a single exposure
   */
  async runSimulation(exposureId, horizonDays = 90) {
    const response = await fetch(
      `${API_BASE_URL}/api/monte-carlo/simulate/exposure?exposure_id=${exposureId}&horizon_days=${horizonDays}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Simulation failed');
    }

    return response.json();
  },

  /**
   * Get simulation history for an exposure
   */
  async getHistory(exposureId, limit = 10) {
    const response = await fetch(
      `${API_BASE_URL}/api/monte-carlo/history/${exposureId}?limit=${limit}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch simulation history');
    }

    return response.json();
  },

  /**
   * Run portfolio-wide simulation
   */
  async runPortfolioSimulation(horizonDays = 90, exposureIds = null) {
    const params = new URLSearchParams({ horizon_days: horizonDays });
    if (exposureIds) {
      exposureIds.forEach(id => params.append('exposure_ids', id));
    }

    const response = await fetch(
      `${API_BASE_URL}/api/monte-carlo/simulate/portfolio?${params}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Portfolio simulation failed');
    }

    return response.json();
  }
};
